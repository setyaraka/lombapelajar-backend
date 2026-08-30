import prisma from '../lib/prisma.js';

const IN_PROGRESS = 'IN_PROGRESS';
const FINISHED = 'FINISHED';

const shuffle = (items) =>
  items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);

const getActiveRegistration = async (tx, userId, competitionId) => {
  if (!competitionId) return null;

  return tx.registration.findFirst({
    where: {
      userId,
      competitionId,
      OR: [{ status: 'APPROVED' }, { paymentProof: { status: 'VERIFIED' } }],
    },
    include: { paymentProof: true },
  });
};

const getActiveAssignment = async (tx, userId, examId) => {
  const participant = await tx.participant.findUnique({
    where: { userId },
  });

  if (!participant || !participant.isActive) return null;

  const assignment = await tx.examAssignment.findUnique({
    where: {
      participantId_examId: {
        participantId: participant.id,
        examId,
      },
    },
  });

  if (!assignment || assignment.status !== 'ASSIGNED') return null;
  return { participant, assignment };
};

const getExam = async (tx, { examId, competitionId }) => {
  return tx.exam.findFirst({
    where: examId ? { id: examId } : { competitionId },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: {
          options: { orderBy: { position: 'asc' } },
        },
      },
    },
  });
};

const logActivity = (tx, { userId, attemptId = null, event, metadata = null }) => {
  return tx.examActivityLog.create({
    data: { userId, attemptId, event, metadata },
  });
};

const buildAttemptPayload = (attempt, exam, serverTime = new Date()) => {
  const answerMap = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const questionById = new Map(exam.questions.map((question) => [question.id, question]));
  const questionIds = Array.isArray(attempt.questionOrder) ? attempt.questionOrder : [];
  const optionOrder =
    attempt.optionOrder && typeof attempt.optionOrder === 'object' ? attempt.optionOrder : {};

  const questions = questionIds
    .map((questionId) => questionById.get(questionId))
    .filter(Boolean)
    .map((question) => {
      // Soal ESSAY tidak punya "opsi" untuk dipilih peserta — options-nya di
      // database cuma menyimpan satu ExamOption berisi kunci jawaban
      // (isCorrect = true, dipakai calculateScore). Kalau ikut di-map seperti
      // tipe pilihan, kunci jawaban itu akan terkirim mentah ke payload
      // peserta (kelihatan lewat network tab). Jadi khusus ESSAY, options
      // selalu dikosongkan di sini.
      const orderedOptionIds =
        optionOrder[question.id] || question.options.map((option) => option.id);
      const optionById = new Map(question.options.map((option) => [option.id, option]));
      const options =
        question.type === 'ESSAY'
          ? []
          : orderedOptionIds
              .map((optionId) => optionById.get(optionId))
              .filter(Boolean)
              .map((option) => ({
                id: option.id,
                text: option.text,
              }));

      return {
        id: question.id,
        text: question.text,
        type: question.type,
        points: question.points,
        options,
        answer: answerMap.get(question.id)?.answer ?? null,
        savedAt: answerMap.get(question.id)?.savedAt ?? null,
      };
    });

  return {
    serverTime,
    attempt: {
      id: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      expiredAt: attempt.expiredAt,
      finishedAt: attempt.finishedAt,
      lastQuestionId: attempt.lastQuestionId,
      questions,
      answers: attempt.answers.map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer,
        savedAt: answer.savedAt,
      })),
    },
    exam: {
      id: exam.id,
      competitionId: exam.competitionId,
      title: exam.title,
      description: exam.description,
      startAt: exam.startAt,
      endAt: exam.endAt,
      durationMinutes: exam.durationMinutes,
      announcementAt: exam.announcementAt,
      resultPublished: exam.resultPublished,
    },
  };
};

// Menilai satu jawaban terhadap satu soal. Untuk ESSAY, penilaian otomatis
// memakai exact-match (byte-exact, tanpa normalisasi huruf besar/kecil atau
// spasi) terhadap kunci jawaban yang disimpan sebagai satu ExamOption dengan
// isCorrect = true untuk soal tsb. Kalau admin belum mengisi kunci jawaban,
// isCorrect/pointsEarned dikembalikan null (belum bisa dinilai otomatis) —
// admin bisa mengisi/mengoreksi lewat gradeEssayAnswer di admin-cbt.service.js.
const gradeAnswer = (question, rawAnswer) => {
  if (question.type === 'ESSAY') {
    const answerKey = question.options.find((option) => option.isCorrect)?.text;
    if (answerKey === undefined || answerKey === null) {
      return { isCorrect: null, pointsEarned: null };
    }

    const submitted = typeof rawAnswer === 'string' ? rawAnswer : '';
    const isCorrect = submitted === answerKey;
    return { isCorrect, pointsEarned: isCorrect ? question.points : 0 };
  }

  const correctIds = question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.id)
    .sort();
  const selectedIds = Array.isArray(rawAnswer) ? rawAnswer : rawAnswer ? [rawAnswer] : [];
  const normalized = [...selectedIds].sort();
  const isCorrect =
    correctIds.length === normalized.length &&
    correctIds.every((id, index) => id === normalized[index]);

  return { isCorrect, pointsEarned: isCorrect ? question.points : 0 };
};

// Mengembalikan skor total attempt + rincian nilai per soal (grades).
// `grades` dipakai untuk menulis ulang ExamAnswer.pointsEarned/isCorrect
// (lihat persistGrades) supaya admin bisa melihat & mengoreksi per jawaban,
// bukan cuma melihat satu angka skor akhir yang tidak bisa ditelusuri.
const calculateScore = (exam, answers) => {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
  const totalPoints = exam.questions.reduce((sum, question) => sum + question.points, 0);

  const grades = exam.questions.map((question) => ({
    questionId: question.id,
    ...gradeAnswer(question, answerMap.get(question.id)),
  }));

  // Dinormalisasi ke skala 0-100 (bukan jumlah poin mentah) supaya nilai
  // antar ujian bisa dibandingkan/dijumlahkan secara adil di ranking tahap
  // (recomputeStageRanking, admin-cbt.service.js) walau jumlah soal atau
  // total bobot poinnya beda-beda tiap ujian. Dibulatkan 2 desimal biar
  // tidak tampil pecahan panjang (mis. 66.66666...).
  const rawPoints = grades.reduce((sum, grade) => sum + (grade.pointsEarned || 0), 0);
  const score = totalPoints ? Math.round((rawPoints / totalPoints) * 10000) / 100 : null;

  return { score, grades };
};

const persistGrades = async (tx, attemptId, grades) => {
  // updateMany per soal karena ExamAnswer hanya punya baris untuk soal yang
  // benar-benar dijawab peserta — soal yang tidak dijawab akan cocok 0 baris
  // (no-op, bukan error). Jumlah query = jumlah soal pada exam, dijalankan
  // sekali saja saat attempt selesai (submit atau auto-expire), bukan per
  // request seperti autosave — dampak ke beban DB minimal.
  await Promise.all(
    grades.map((grade) =>
      tx.examAnswer.updateMany({
        where: { attemptId, questionId: grade.questionId },
        data: { isCorrect: grade.isCorrect, pointsEarned: grade.pointsEarned },
      }),
    ),
  );
};

const markExpiredIfNeeded = async (tx, attempt, now) => {
  if (attempt.status !== IN_PROGRESS || attempt.expiredAt > now) return attempt;

  const { score, grades } = calculateScore(attempt.exam, attempt.answers);
  await persistGrades(tx, attempt.id, grades);

  return tx.examAttempt.update({
    where: { id: attempt.id },
    data: {
      status: FINISHED,
      finishedAt: attempt.finishedAt || now,
      score,
    },
    include: {
      exam: {
        include: {
          questions: {
            orderBy: { position: 'asc' },
            include: { options: { orderBy: { position: 'asc' } } },
          },
        },
      },
      answers: true,
    },
  });
};

export const getExamStatusForCompetition = async (competition, attempt) => {
  const exam = competition.exams?.[0];
  if (!exam) return null;

  const now = new Date();
  if (exam.startAt > now)
    return { examId: exam.id, status: 'NOT_STARTED', label: 'Belum memenuhi jadwal' };
  if (exam.endAt < now)
    return { examId: exam.id, status: 'SCHEDULE_ENDED', label: 'Jadwal berakhir' };
  if (attempt?.status === FINISHED)
    return { examId: exam.id, status: 'FINISHED', label: 'Sudah selesai' };
  if (attempt?.status === IN_PROGRESS)
    return { examId: exam.id, status: 'IN_PROGRESS', label: 'Sedang berlangsung' };
  return { examId: exam.id, status: 'AVAILABLE', label: 'Belum dimulai' };
};

export const startAttempt = async (userId, { examId, competitionId }) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const exam = await getExam(tx, { examId, competitionId });
    if (!exam) {
      const error = new Error('Exam not found');
      error.status = 404;
      throw error;
    }

    if (exam.startAt > now || exam.endAt < now) {
      const error = new Error('Exam schedule is not active');
      error.status = 400;
      throw error;
    }

    const assignmentAccess = await getActiveAssignment(tx, userId, exam.id);
    const registration = await getActiveRegistration(tx, userId, exam.competitionId);
    if (!assignmentAccess && !registration) {
      const error = new Error('You are not allowed to take this exam');
      error.status = 403;
      throw error;
    }

    const runningAttempt = await tx.examAttempt.findFirst({
      where: { userId, examId: exam.id, status: IN_PROGRESS },
      include: { answers: true },
      orderBy: { startedAt: 'desc' },
    });

    if (runningAttempt) {
      const currentAttempt = await markExpiredIfNeeded(tx, runningAttempt, now);
      await logActivity(tx, {
        userId,
        attemptId: currentAttempt.id,
        event: 'RESUME_EXAM',
        metadata: { source: 'start_attempt' },
      });
      return buildAttemptPayload(currentAttempt, exam, now);
    }

    const finishedCount = await tx.examAttempt.count({
      where: { userId, examId: exam.id, status: FINISHED },
    });

    if (finishedCount >= exam.maxAttempts) {
      const error = new Error('Maximum attempts reached');
      error.status = 400;
      throw error;
    }

    const questionIds = exam.randomizeQuestions
      ? shuffle(exam.questions.map((question) => question.id))
      : exam.questions.map((question) => question.id);
    const optionOrder = exam.questions.reduce((acc, question) => {
      acc[question.id] = exam.randomizeOptions
        ? shuffle(question.options.map((option) => option.id))
        : question.options.map((option) => option.id);
      return acc;
    }, {});
    const durationExpiry = new Date(now.getTime() + exam.durationMinutes * 60 * 1000);
    const expiredAt = durationExpiry < exam.endAt ? durationExpiry : exam.endAt;

    const attempt = await tx.examAttempt.create({
      data: {
        userId,
        participantId: assignmentAccess?.participant.id,
        assignmentId: assignmentAccess?.assignment.id,
        examId: exam.id,
        startedAt: now,
        expiredAt,
        status: IN_PROGRESS,
        questionOrder: questionIds,
        optionOrder,
      },
      include: { answers: true },
    });

    await logActivity(tx, {
      userId,
      attemptId: attempt.id,
      event: 'START_EXAM',
      metadata: { competitionId: exam.competitionId },
    });

    return buildAttemptPayload(attempt, exam, now);
  });
};

export const getCurrentAttempt = async (userId, { attemptId, examId, competitionId }) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    let attempt = null;

    if (attemptId) {
      attempt = await tx.examAttempt.findFirst({
        where: { id: attemptId, userId },
        include: {
          exam: {
            include: {
              questions: {
                orderBy: { position: 'asc' },
                include: { options: { orderBy: { position: 'asc' } } },
              },
            },
          },
          answers: true,
        },
      });
    } else {
      const exam = await getExam(tx, { examId, competitionId });
      if (!exam) return null;
      attempt = await tx.examAttempt.findFirst({
        where: { userId, examId: exam.id, status: IN_PROGRESS },
        include: {
          exam: {
            include: {
              questions: {
                orderBy: { position: 'asc' },
                include: { options: { orderBy: { position: 'asc' } } },
              },
            },
          },
          answers: true,
        },
        orderBy: { startedAt: 'desc' },
      });
    }

    if (!attempt) return null;
    const currentAttempt = await markExpiredIfNeeded(tx, attempt, now);
    if (currentAttempt.status === IN_PROGRESS) {
      await logActivity(tx, {
        userId,
        attemptId: currentAttempt.id,
        event: 'RESUME_EXAM',
        metadata: { source: 'current_attempt' },
      });
    }

    return buildAttemptPayload(currentAttempt, currentAttempt.exam, now);
  });
};

export const getNextAssignedExam = async (userId) => {
  const now = new Date();
  const participant = await prisma.participant.findUnique({
    where: { userId },
  });

  if (!participant || !participant.isActive) return null;

  const assignment = await prisma.examAssignment.findFirst({
    where: {
      participantId: participant.id,
      status: 'ASSIGNED',
      exam: {
        isActive: true,
        status: 'ACTIVE',
        endAt: { gte: now },
      },
    },
    orderBy: { exam: { startAt: 'asc' } },
    include: {
      exam: true,
      attempts: {
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!assignment) return null;

  const attempt = assignment.attempts[0] || null;
  const exam = assignment.exam;
  const status =
    attempt?.status === FINISHED
      ? 'FINISHED'
      : attempt?.status === IN_PROGRESS
        ? 'IN_PROGRESS'
        : exam.startAt <= now && exam.endAt >= now
          ? 'AVAILABLE'
          : 'UPCOMING';

  return {
    serverTime: now,
    assignmentId: assignment.id,
    participant,
    exam,
    attemptId: attempt?.id ?? null,
    status,
    countdownTo: status === 'UPCOMING' ? exam.startAt : null,
  };
};

export const saveAnswer = async (
  userId,
  attemptId,
  { questionId, answer, savedAt, lastQuestionId },
) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const attempt = await tx.examAttempt.findFirst({
      where: { id: attemptId, userId },
      include: { exam: true },
    });

    if (!attempt) {
      const error = new Error('Attempt not found');
      error.status = 404;
      throw error;
    }

    if (attempt.status !== IN_PROGRESS || attempt.expiredAt <= now) {
      const error = new Error('Attempt is no longer active');
      error.status = 400;
      throw error;
    }

    const questionIds = Array.isArray(attempt.questionOrder) ? attempt.questionOrder : [];
    if (!questionIds.includes(questionId)) {
      const error = new Error('Question does not belong to this attempt');
      error.status = 400;
      throw error;
    }

    const answerRow = await tx.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: {
        attemptId,
        questionId,
        answer,
        savedAt: savedAt ? new Date(savedAt) : now,
      },
      update: {
        answer,
        savedAt: savedAt ? new Date(savedAt) : now,
      },
    });

    await tx.examAttempt.update({
      where: { id: attemptId },
      data: { lastQuestionId: lastQuestionId || questionId },
    });

    await logActivity(tx, {
      userId,
      attemptId,
      event: 'AUTO_SAVE',
      metadata: { questionId },
    });

    return {
      serverTime: now,
      answer: {
        questionId,
        answer: answerRow.answer,
        savedAt: answerRow.savedAt,
      },
    };
  });
};

export const updateLastQuestion = async (userId, attemptId, questionId) => {
  return prisma.examAttempt.updateMany({
    where: { id: attemptId, userId, status: IN_PROGRESS },
    data: { lastQuestionId: questionId },
  });
};

export const submitAttempt = async (userId, attemptId, { auto = false } = {}) => {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const attempt = await tx.examAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        exam: {
          include: {
            questions: {
              orderBy: { position: 'asc' },
              include: { options: { orderBy: { position: 'asc' } } },
            },
          },
        },
        answers: true,
      },
    });

    if (!attempt) {
      const error = new Error('Attempt not found');
      error.status = 404;
      throw error;
    }

    if (attempt.status === FINISHED) {
      // Jangan kembalikan `attempt` mentah di sini — objek ini membawa relasi
      // exam.questions.options (termasuk isCorrect & kunci jawaban esai) hasil
      // include di atas, dan endpoint ini di-return langsung ke browser peserta
      // (lihat exam.controller.js `submit`). Lucuti ke field skalar saja,
      // sama seperti bentuk `updated` di bawah.
      const { exam: _exam, answers: _answers, ...safeAttempt } = attempt;
      return { serverTime: now, attempt: safeAttempt };
    }

    const { score, grades } = calculateScore(attempt.exam, attempt.answers);
    await persistGrades(tx, attempt.id, grades);
    const updated = await tx.examAttempt.update({
      where: { id: attempt.id },
      data: {
        status: FINISHED,
        finishedAt: now,
        score,
      },
    });

    await logActivity(tx, {
      userId,
      attemptId: attempt.id,
      event: auto ? 'AUTO_SUBMIT' : 'SUBMIT',
      metadata: { reason: auto ? 'time_expired' : 'manual' },
    });

    return { serverTime: now, attempt: updated };
  });
};

export const logAttemptActivity = async (userId, attemptId, event, metadata) => {
  const allowedEvents = ['ANSWER_CHANGED', 'TAB_SWITCH', 'WINDOW_BLUR', 'WINDOW_FOCUS'];
  if (!allowedEvents.includes(event)) {
    const error = new Error('Unsupported activity event');
    error.status = 400;
    throw error;
  }

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId },
    select: { id: true, participantId: true, examId: true },
  });
  if (!attempt) {
    const error = new Error('Attempt not found');
    error.status = 404;
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const activity = await tx.examActivityLog.create({
      data: { userId, attemptId, event, metadata },
    });

    if (['TAB_SWITCH', 'WINDOW_BLUR'].includes(event)) {
      await tx.violationLog.create({
        data: {
          participantId: attempt.participantId,
          attemptId,
          examId: attempt.examId,
          type: event === 'TAB_SWITCH' ? 'switch_tab' : 'leave_window',
          severity: 'LOW',
          metadata,
        },
      });
    }

    return activity;
  });
};

export const getResult = async (userId, { attemptId, examId, competitionId }) => {
  const attempt = await prisma.examAttempt.findFirst({
    where: {
      userId,
      ...(attemptId ? { id: attemptId } : {}),
      ...(examId ? { examId } : {}),
      ...(competitionId ? { exam: { competitionId } } : {}),
      status: FINISHED,
    },
    include: { exam: true },
    orderBy: { finishedAt: 'desc' },
  });

  if (!attempt) return null;

  const now = new Date();
  const isOpen =
    attempt.exam.resultPublished ||
    (attempt.exam.announcementAt && attempt.exam.announcementAt <= now);

  return {
    serverTime: now,
    announced: Boolean(isOpen),
    announcementAt: attempt.exam.announcementAt,
    status: isOpen ? (attempt.passed === false ? 'Tidak lulus' : 'Selesai') : null,
    score: isOpen ? attempt.score : null,
    rank: isOpen ? attempt.rank : null,
    notes: isOpen
      ? 'Hasil ujian telah diumumkan.'
      : 'Hasil ujian belum diumumkan. Silakan menunggu jadwal pengumuman.',
  };
};
