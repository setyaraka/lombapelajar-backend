import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { cbtRepository } from '../repositories/cbt.repository.js';
import {
  assignmentSchema,
  examSchema,
  paginationSchema,
  participantSchema,
  questionSchema,
  stageSchema,
  validate,
} from '../validations/cbt.validation.js';

const toPagination = (query) => {
  const parsed = validate(paginationSchema, query);
  return {
    ...parsed,
    skip: (parsed.page - 1) * parsed.perPage,
    take: parsed.perPage,
  };
};

const toExamWindow = (payload) => {
  const startAt = new Date(payload.startAt);
  const endAt = new Date(startAt.getTime() + payload.durationMinutes * 60 * 1000);
  return { startAt, endAt };
};

const defaultQuestionPoints = (type, points) => {
  if (points !== undefined && points !== null) return points;
  return type === 'ESSAY' ? 5 : 3;
};

const statusFromAssignment = (assignment, now = new Date()) => {
  const attempt = assignment.attempts[0];
  if (!attempt) {
    if (assignment.exam.startAt > now) return 'Waiting';
    if (assignment.exam.endAt < now) return 'Auto Submitted';
    return 'Waiting';
  }

  if (attempt.status === 'FINISHED')
    return attempt.finishedAt && attempt.finishedAt > attempt.expiredAt
      ? 'Auto Submitted'
      : 'Finished';
  if (attempt.status === 'IN_PROGRESS') {
    if (attempt.expiredAt <= now) return 'Auto Submitted';
    const lastAnswer = attempt.answers
      .map((answer) => answer.savedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (lastAnswer && now.getTime() - lastAnswer.getTime() > 60_000) return 'Disconnected';
    return 'In Progress';
  }

  return 'Waiting';
};

const csvEscape = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const getDashboard = async (query = {}) => {
  const now = new Date();
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 5;
  const search = query.search || '';
  const competitionId = query.competitionId || '';
  const date = query.date || '';

  const where = {
    AND: [
      search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { competition: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {},
      competitionId ? { competitionId } : {},
      date
        ? {
            startAt: {
              gte: new Date(`${date}T00:00:00.000Z`),
              lte: new Date(`${date}T23:59:59.999Z`),
            },
          }
        : {},
    ],
  };

  const [
    totalParticipants,
    totalExams,
    activeExams,
    upcomingExams,
    inProgress,
    finished,
    violations,
    totalExamsFiltered,
    exams,
  ] = await Promise.all([
    cbtRepository.countParticipants(),
    cbtRepository.countExams(),
    cbtRepository.countExams({
      isActive: true,
      status: 'ACTIVE',
      startAt: { lte: now },
      endAt: { gte: now },
    }),
    cbtRepository.countExams({
      isActive: true,
      status: 'ACTIVE',
      startAt: { gt: now },
    }),
    cbtRepository.countAttempts({ status: 'IN_PROGRESS', expiredAt: { gt: now } }),
    cbtRepository.countAttempts({ status: 'FINISHED' }),
    cbtRepository.countViolations(),
    cbtRepository.prisma.exam.count({ where }),
    cbtRepository.prisma.exam.findMany({
      where,
      orderBy: { startAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        competition: true,
        _count: { select: { assignments: true } },
      },
    }),
  ]);

  return {
    stats: {
      totalParticipants,
      totalExams,
      activeExams,
      upcomingExams,
      inProgress,
      finished,
      violations,
    },
    participantsPerExam: {
      data: exams.map((exam) => ({
        examId: exam.id,
        title: exam.title,
        competitionTitle: exam.competition?.title || 'Umum/Tanpa Kompetisi',
        startAt: exam.startAt,
        endAt: exam.endAt,
        participants: exam._count.assignments,
      })),
      meta: {
        page,
        perPage,
        total: totalExamsFiltered,
        totalPages: Math.ceil(totalExamsFiltered / perPage),
      },
    },
  };
};

export const listStages = () => cbtRepository.listStages();

// Nama stage di-set @unique di schema (FACT, prisma/schema.prisma). Tanpa
// ini, admin cuma lihat pesan mentah Prisma
// ("Invalid prisma.examStage.update() invocation...") yang tidak jelas -
// diterjemahkan jadi pesan yang bisa dipahami + status 409 (Conflict).
const withFriendlyUniqueNameError = async (run) => {
  try {
    return await run();
  } catch (err) {
    if (err.code === 'P2002') {
      const friendly = new Error('Nama tahap ini sudah dipakai, gunakan nama lain.');
      friendly.status = 409;
      throw friendly;
    }
    throw err;
  }
};

export const createStage = (body) => {
  const payload = validate(stageSchema, body);
  return withFriendlyUniqueNameError(() => cbtRepository.createStage(payload));
};

export const updateStage = (id, body) => {
  const payload = validate(stageSchema.partial(), body);
  return withFriendlyUniqueNameError(() => cbtRepository.updateStage(id, payload));
};

export const deleteStage = (id) => cbtRepository.deleteStage(id);

export const listExams = async (query) => {
  const { page, perPage, search, status, stageId, sortBy, skip, take } = toPagination(query);
  const where = {
    AND: [
      search ? { title: { contains: search, mode: 'insensitive' } } : {},
      status ? { status } : {},
      stageId ? { stageId } : {},
    ],
  };

  const [data, total] = await Promise.all([
    cbtRepository.listExams({ where, skip, take, sortBy }),
    cbtRepository.countExamList(where),
  ]);

  return {
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
};

export const getExam = async (id) => {
  const exam = await cbtRepository.findExam(id);
  if (!exam) {
    const error = new Error('Exam not found');
    error.status = 404;
    throw error;
  }
  return exam;
};

export const createExam = (body) => {
  const payload = validate(examSchema, body);
  const { startAt, endAt } = toExamWindow(payload);
  return cbtRepository.createExam({
    ...payload,
    startAt,
    endAt,
    isActive: payload.status === 'ACTIVE' ? true : payload.isActive,
  });
};

export const updateExam = (id, body) => {
  const payload = validate(examSchema.partial(), body);
  const window = payload.startAt && payload.durationMinutes ? toExamWindow(payload) : {};
  return cbtRepository.updateExam(id, {
    ...payload,
    ...window,
    ...(payload.status ? { isActive: payload.status === 'ACTIVE' } : {}),
  });
};

export const deleteExam = (id) => cbtRepository.deleteExam(id);

export const toggleExam = async (id, isActive) => {
  return cbtRepository.updateExam(id, {
    isActive: Boolean(isActive),
    status: isActive ? 'ACTIVE' : 'INACTIVE',
  });
};

export const listParticipants = async (query) => {
  const { page, perPage, search, stageId, skip, take } = toPagination(query);
  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { participantNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      stageId ? { stageId } : {},
    ],
  };

  const [data, total] = await Promise.all([
    cbtRepository.listParticipants({ where, skip, take }),
    cbtRepository.countParticipantList(where),
  ]);

  return {
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
};

export const createParticipant = async (body) => {
  const payload = validate(participantSchema, body);
  const hashed = await bcrypt.hash(payload.participantNumber, 10);

  return cbtRepository.prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: payload.email },
      create: {
        name: payload.name,
        email: payload.email,
        password: hashed,
        role: 'PESERTA',
      },
      update: {
        name: payload.name,
        role: 'PESERTA',
      },
    });

    return tx.participant.create({
      data: {
        ...payload,
        userId: user.id,
      },
      include: { stage: true },
    });
  });
};

export const updateParticipant = async (id, body) => {
  const payload = validate(participantSchema.partial(), body);
  return cbtRepository.prisma.$transaction(async (tx) => {
    const participant = await tx.participant.update({
      where: { id },
      data: payload,
      include: { user: true, stage: true },
    });

    if (participant.userId && (payload.name || payload.email)) {
      await tx.user.update({
        where: { id: participant.userId },
        data: {
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.email ? { email: payload.email } : {}),
        },
      });
    }

    return participant;
  });
};

export const deleteParticipant = (id) => cbtRepository.deleteParticipant(id);

export const assignParticipants = async (body) => {
  const payload = validate(assignmentSchema, body);

  let participantIds = [];
  if (payload.participantIds?.length) {
    participantIds = payload.participantIds;
  } else if (payload.sourceStageId) {
    const sourceParticipants = await cbtRepository.prisma.participant.findMany({
      where: { stageId: payload.sourceStageId, isActive: true },
      select: { id: true },
    });
    participantIds = sourceParticipants.map((p) => p.id);
  } else if (payload.stageId) {
    const stageParticipants = await cbtRepository.prisma.participant.findMany({
      where: { stageId: payload.stageId, isActive: true },
      select: { id: true },
    });
    participantIds = stageParticipants.map((p) => p.id);
  }

  if (participantIds.length === 0) {
    const error = new Error(
      payload.sourceStageId
        ? 'Tidak ada peserta aktif pada tahapan sumber ini'
        : 'Participants are required',
    );
    error.status = 400;
    throw error;
  }

  // Update participant stageId if target stageId is provided
  if (payload.stageId) {
    await cbtRepository.prisma.participant.updateMany({
      where: { id: { in: participantIds } },
      data: { stageId: payload.stageId },
    });
  }

  let examIds = [];
  if (payload.examIds?.length) {
    examIds = payload.examIds;
  } else if (payload.examId) {
    examIds = [payload.examId];
  } else if (payload.stageId && payload.competitionId) {
    // Auto-assign all exams belonging to this stage and competition
    const exams = await cbtRepository.prisma.exam.findMany({
      where: {
        stageId: payload.stageId,
        competitionId: payload.competitionId,
        isActive: true,
      },
      select: { id: true },
    });
    examIds = exams.map((e) => e.id);
  }

  if (examIds.length === 0) {
    const error = new Error('Tidak ada ujian aktif pada babak dan kompetisi tersebut');
    error.status = 400;
    throw error;
  }

  const assignments = [];
  for (const participantId of participantIds) {
    for (const examId of examIds) {
      assignments.push(await cbtRepository.upsertAssignment({ participantId, examId }));
    }
  }

  return { assigned: assignments.length };
};

export const listQuestions = (examId) => cbtRepository.listQuestions(examId);

export const createQuestion = (body) => {
  const payload = validate(questionSchema, body);
  const points = defaultQuestionPoints(payload.type, payload.points);
  // ESSAY tetap pakai `options` — bukan untuk pilihan jawaban, tapi menyimpan
  // satu kunci jawaban (isCorrect: true) yang dipakai exact-match grading di
  // calculateScore (exam.service.js). Payload untuk ESSAY dikirim frontend
  // sebagai array 0-1 elemen, jadi tidak perlu dipaksa kosong di sini lagi.
  const options = payload.options;

  return cbtRepository.prisma.$transaction(async (tx) => {
    const question = await tx.examQuestion.create({
      data: {
        examId: payload.examId,
        text: payload.text,
        type: payload.type,
        points,
        position: payload.position,
        options: {
          create: options.map((option, index) => ({
            text: option.text,
            isCorrect: option.isCorrect,
            position: option.position ?? index,
          })),
        },
      },
      include: { options: { orderBy: { position: 'asc' } } },
    });

    // Ujian baru default status DRAFT (examSchema, cbt.validation.js) - begitu
    // soal pertamanya ditambahkan (PG atau esai), otomatis diaktifkan supaya
    // admin tidak perlu langkah manual terpisah cuma untuk menyalakan ujian
    // yang sudah ada isinya. Cuma nyala dari DRAFT - kalau admin sudah pernah
    // set INACTIVE/ARCHIVED secara sengaja, itu tidak ditimpa cuma karena
    // nambah soal baru.
    const exam = await tx.exam.findUnique({ where: { id: payload.examId }, select: { status: true } });
    if (exam?.status === 'DRAFT') {
      await tx.exam.update({
        where: { id: payload.examId },
        data: { status: 'ACTIVE', isActive: true },
      });
    }

    return question;
  });
};

export const updateQuestion = (id, body) => {
  const payload = validate(questionSchema.partial(), body);
  const points = payload.type
    ? defaultQuestionPoints(payload.type, payload.points)
    : payload.points;

  return cbtRepository.prisma.$transaction(async (tx) => {
    if (payload.options) {
      await tx.examOption.deleteMany({ where: { questionId: id } });
    }

    return tx.examQuestion.update({
      where: { id },
      data: {
        ...(payload.text ? { text: payload.text } : {}),
        ...(payload.type ? { type: payload.type } : {}),
        ...(points !== undefined ? { points } : {}),
        ...(payload.position !== undefined ? { position: payload.position } : {}),
        ...(payload.options
          ? {
              // Sama seperti createQuestion: ESSAY memakai `options` untuk
              // menyimpan kunci jawaban, jadi tidak lagi dipaksa kosong di sini.
              options: {
                create: payload.options.map((option, index) => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                  position: option.position ?? index,
                })),
              },
            }
          : {}),
      },
      include: { options: { orderBy: { position: 'asc' } } },
    });
  });
};

export const deleteQuestion = (id) => cbtRepository.deleteQuestion(id);

export const getMonitoring = async (query) => {
  const now = new Date();
  const { page, perPage, examId, skip, take } = toPagination(query);
  const where = {
    AND: [examId ? { examId } : {}, { status: 'ASSIGNED' }],
  };
  const [rows, total] = await Promise.all([
    cbtRepository.monitoring({ where, skip, take }),
    cbtRepository.countMonitoring(where),
  ]);

  return {
    data: rows.map((assignment) => {
      const attempt = assignment.attempts[0];
      const remainingMs = attempt ? Math.max(0, attempt.expiredAt.getTime() - now.getTime()) : 0;
      return {
        assignmentId: assignment.id,
        participant: assignment.participant,
        exam: assignment.exam,
        attemptId: attempt?.id ?? null,
        status: statusFromAssignment(assignment, now),
        remainingMs,
        violationCount: attempt?.violations.length ?? 0,
        answeredCount: attempt?.answers.length ?? 0,
      };
    }),
    serverTime: now,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
};

export const getResults = async (query) => {
  const { page, perPage, examId, skip, take } = toPagination(query);
  const where = {
    AND: [{ status: 'FINISHED' }, examId ? { examId } : {}],
  };
  const [rows, total] = await Promise.all([
    cbtRepository.results({ where, skip, take }),
    cbtRepository.countResults(where),
  ]);

  return {
    data: rows.map((attempt) => ({
      id: attempt.id,
      participantName: attempt.participant?.name || attempt.user.name,
      participantNumber: attempt.participant?.participantNumber || '-',
      examTitle: attempt.exam.title,
      score: attempt.score,
      // rank dihitung per Stage (bisa gabungan >1 exam), bukan otomatis per
      // attempt — lihat recomputeStageRanking. Null berarti admin belum
      // pernah menekan "Hitung Ranking" untuk stage exam ini, atau attempt
      // ini belum tergabung ke exam manapun yang punya stage.
      rank: attempt.rank,
      finishedAt: attempt.finishedAt,
      violationCount: attempt.violations.length,
      answerCount: attempt.answers.length,
    })),
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
};

// Ranking per Stage — dihitung manual oleh admin (bukan otomatis tiap
// submit) supaya tidak menambah beban di endpoint submit yang sudah jadi
// titik rawan saat 300 peserta submit bersamaan (lihat audit produksi).
// Jalankan ulang kapan saja skor berubah (mis. setelah koreksi esai manual
// di gradeEssayAnswer) supaya rank tetap akurat sebelum diumumkan.
//
// Kalau satu stage punya lebih dari satu Exam, skor peserta dijumlah apa
// adanya dari seluruh attempt FINISHED miliknya di exam-exam stage itu —
// TIDAK dinormalisasi ke skala yang sama. Kalau nanti tiap exam di satu
// stage punya total poin yang beda jauh, pertimbangkan normalisasi
// (skor/maxPoin) sebelum dijumlah supaya adil. Untuk setup saat ini
// (1 stage = 1 exam per chat requirement), penjumlahan ini otomatis sama
// dengan skor exam itu sendiri, jadi tidak mengubah perilaku yang sudah ada.
export const recomputeStageRanking = async (stageId) => {
  const exams = await cbtRepository.prisma.exam.findMany({
    where: { stageId },
    select: { id: true },
  });
  const examIds = exams.map((exam) => exam.id);

  if (examIds.length === 0) {
    const error = new Error('Stage ini belum punya exam');
    error.status = 400;
    throw error;
  }

  const attempts = await cbtRepository.prisma.examAttempt.findMany({
    where: { examId: { in: examIds }, status: 'FINISHED' },
    select: { id: true, participantId: true, userId: true, score: true },
  });

  // Kelompokkan attempt per peserta. Fallback ke userId kalau participantId
  // kosong (harusnya tidak terjadi untuk attempt hasil assignment resmi,
  // tapi dijaga supaya tidak error kalau ada data lama/anomali).
  const totals = new Map();
  for (const attempt of attempts) {
    const key = attempt.participantId || `user:${attempt.userId}`;
    if (!totals.has(key)) totals.set(key, { total: 0, attemptIds: [] });
    const entry = totals.get(key);
    entry.total += attempt.score || 0;
    entry.attemptIds.push(attempt.id);
  }

  // Standard competition ranking (1-2-2-4): peserta dengan total sama
  // berbagi rank yang sama, rank berikutnya lompat sesuai jumlah yang
  // sudah dilewati.
  const sorted = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  const updates = [];
  let rank = 0;
  let prevTotal = null;
  sorted.forEach(([, entry], index) => {
    if (entry.total !== prevTotal) {
      rank = index + 1;
      prevTotal = entry.total;
    }
    entry.attemptIds.forEach((attemptId) => updates.push({ attemptId, rank }));
  });

  await cbtRepository.prisma.$transaction(
    updates.map(({ attemptId, rank: attemptRank }) =>
      cbtRepository.prisma.examAttempt.update({
        where: { id: attemptId },
        data: { rank: attemptRank },
      }),
    ),
  );

  return { stageId, participantsRanked: sorted.length, attemptsUpdated: updates.length };
};

// Dipakai halaman "Hasil Ujian" admin untuk menampilkan & mengoreksi jawaban
// esai satu attempt. Auto-grading exact-match sudah jalan saat submit
// (exam.service.js calculateScore), ini jalur untuk admin meninjau ulang /
// override manual — sesuai permintaan client bahwa koreksi manual esai
// sifatnya opsional per babak, bukan pengganti auto-grading.
export const getEssayAnswers = async (attemptId) => {
  const attempt = await cbtRepository.prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      participant: true,
      user: true,
      exam: {
        include: {
          questions: {
            where: { type: 'ESSAY' },
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

  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

  return {
    attemptId: attempt.id,
    participantName: attempt.participant?.name || attempt.user.name,
    examTitle: attempt.exam.title,
    questions: attempt.exam.questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      return {
        answerId: answer?.id ?? null,
        questionId: question.id,
        text: question.text,
        points: question.points,
        answerKey: question.options.find((option) => option.isCorrect)?.text ?? null,
        submittedAnswer: typeof answer?.answer === 'string' ? answer.answer : '',
        isCorrect: answer?.isCorrect ?? null,
        pointsEarned: answer?.pointsEarned ?? null,
        gradedManually: answer?.gradedManually ?? false,
      };
    }),
  };
};

export const gradeEssayAnswer = async (answerId, { pointsEarned, isCorrect }) => {
  return cbtRepository.prisma.$transaction(async (tx) => {
    const answer = await tx.examAnswer.findUnique({
      where: { id: answerId },
      include: { question: true },
    });

    if (!answer) {
      const error = new Error('Jawaban tidak ditemukan');
      error.status = 404;
      throw error;
    }
    if (answer.question.type !== 'ESSAY') {
      const error = new Error('Hanya jawaban esai yang bisa dikoreksi manual di sini');
      error.status = 400;
      throw error;
    }

    const clampedPoints = Math.max(0, Math.min(answer.question.points, Number(pointsEarned) || 0));

    const updatedAnswer = await tx.examAnswer.update({
      where: { id: answerId },
      data: {
        pointsEarned: clampedPoints,
        isCorrect: typeof isCorrect === 'boolean' ? isCorrect : clampedPoints > 0,
        gradedManually: true,
      },
    });

    // Skor attempt dihitung ulang dari total pointsEarned seluruh jawaban
    // (bukan cuma esai), dinormalisasi ke skala 0-100 dengan rumus yang
    // sama persis dengan calculateScore di exam.service.js (harus tetap
    // konsisten - itu tempat lain yang menghitung score saat submit).
    const allAnswers = await tx.examAnswer.findMany({ where: { attemptId: answer.attemptId } });
    const rawPoints = allAnswers.reduce((sum, a) => sum + (a.pointsEarned || 0), 0);
    const totalPoints = await tx.examQuestion.aggregate({
      where: { examId: answer.question.examId },
      _sum: { points: true },
    });
    const totalPointsSum = totalPoints._sum.points || 0;
    const newScore = totalPointsSum ? Math.round((rawPoints / totalPointsSum) * 10000) / 100 : null;

    await tx.examAttempt.update({
      where: { id: answer.attemptId },
      data: { score: newScore },
    });

    return updatedAnswer;
  });
};

export const exportResultsCsv = async (query) => {
  const result = await getResults({ ...query, page: 1, perPage: 100 });
  const header = [
    'Nomor Peserta',
    'Nama Peserta',
    'Ujian',
    'Jumlah Jawaban',
    'Pelanggaran',
    'Selesai Pada',
    'Nilai Akhir',
    'Ranking',
  ];
  const lines = result.data.map((row) =>
    [
      row.participantNumber,
      row.participantName,
      row.examTitle,
      row.answerCount,
      row.violationCount,
      row.finishedAt ? new Date(row.finishedAt).toLocaleString('id-ID') : '',
      row.score ?? '',
      row.rank ?? '',
    ]
      .map(csvEscape)
      .join(';'),
  );

  return '\ufeff' + [header.map(csvEscape).join(';'), ...lines].join('\n');
};

export const exportResultsExcel = async (query, res) => {
  const examId = query.examId || '';
  const where = {
    AND: [{ status: 'FINISHED' }, examId ? { examId } : {}],
  };

  const rows = await cbtRepository.results({ where });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Hasil Ujian');

  worksheet.columns = [
    { header: 'Nomor Peserta', key: 'participantNumber', width: 20 },
    { header: 'Nama Peserta', key: 'participantName', width: 25 },
    { header: 'Ujian', key: 'examTitle', width: 30 },
    { header: 'Jumlah Jawaban', key: 'answerCount', width: 18 },
    { header: 'Pelanggaran', key: 'violationCount', width: 15 },
    { header: 'Selesai Pada', key: 'finishedAt', width: 22 },
    { header: 'Nilai Akhir', key: 'score', width: 15 },
    { header: 'Ranking', key: 'rank', width: 12 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  rows.forEach((row) => {
    worksheet.addRow({
      participantNumber: row.participant?.participantNumber || '-',
      participantName: row.participant?.name || row.user.name,
      examTitle: row.exam.title,
      answerCount: row.answers.length,
      violationCount: row.violations.length,
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toLocaleString('id-ID') : '',
      score: row.score ?? '',
      rank: row.rank ?? '',
    });
  });

  worksheet.columns.forEach((column) => {
    let maxLength = column.header.length;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value ? String(cell.value) : '';
      if (value.length > maxLength) {
        maxLength = value.length;
      }
    });
    column.width = Math.max(maxLength + 3, 10);
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="hasil-ujian.xlsx"');

  await workbook.xlsx.write(res);
};

// Sama seperti exportResultsExcel (kolom & filter sama persis), tapi keluar
// sebagai PDF pakai pdfkit — sudah jadi dependency di package.json tapi
// belum pernah dipakai di mana pun. pdfkit tidak punya komponen tabel
// bawaan, jadi layout tabel di bawah ini digambar manual (posisi teks per
// kolom + garis header), termasuk cetak ulang header tiap kali pindah
// halaman. Sama seperti exportResultsExcel, query ini tidak dipaginasi —
// untuk jumlah peserta yang sangat besar, generate PDF bisa memakan waktu
// karena tiap baris butuh perhitungan posisi teks satu per satu (lebih berat
// dari sekadar menulis baris Excel). Untuk skala ratusan peserta per exam,
// ini masih wajar; kalau nanti ribuan peserta dalam satu export, pertimbangkan
// job terpisah dari proses utama (sama seperti catatan P1 di audit produksi).
export const exportResultsPdf = async (query, res) => {
  const examId = query.examId || '';
  const where = {
    AND: [{ status: 'FINISHED' }, examId ? { examId } : {}],
  };

  const rows = await cbtRepository.results({ where });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="hasil-ujian.pdf"');
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(16).text('Hasil Ujian', { align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748b')
    .text(`Diekspor pada ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
  doc.fillColor('#000000');
  doc.moveDown(1);

  const columns = [
    { key: 'participantNumber', label: 'Nomor Peserta', width: 95 },
    { key: 'participantName', label: 'Nama Peserta', width: 135 },
    { key: 'examTitle', label: 'Ujian', width: 150 },
    { key: 'answerCount', label: 'Jml Jawaban', width: 65 },
    { key: 'violationCount', label: 'Pelanggaran', width: 65 },
    { key: 'finishedAt', label: 'Selesai Pada', width: 115 },
    { key: 'score', label: 'Nilai', width: 55 },
    { key: 'rank', label: 'Ranking', width: 55 },
  ];
  const rowHeight = 20;
  const tableLeft = doc.page.margins.left;
  const tableRight = doc.page.width - doc.page.margins.right;

  const drawHeaderRow = () => {
    let x = tableLeft;
    doc.font('Helvetica-Bold').fontSize(9);
    columns.forEach((column) => {
      doc.text(column.label, x + 4, doc.y + 5, { width: column.width - 8 });
      x += column.width;
    });
    const lineY = doc.y + rowHeight;
    doc.moveTo(tableLeft, lineY).lineTo(tableRight, lineY).strokeColor('#cbd5e1').stroke();
    doc.y = lineY;
  };

  drawHeaderRow();

  rows.forEach((row) => {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeaderRow();
    }

    const values = {
      participantNumber: row.participant?.participantNumber || '-',
      participantName: row.participant?.name || row.user.name,
      examTitle: row.exam.title,
      answerCount: String(row.answers.length),
      violationCount: String(row.violations.length),
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toLocaleString('id-ID') : '-',
      score: row.score ?? '-',
      rank: row.rank ? `#${row.rank}` : '-',
    };

    let x = tableLeft;
    const rowY = doc.y;
    doc.font('Helvetica').fontSize(9);
    columns.forEach((column) => {
      doc.text(String(values[column.key]), x + 4, rowY + 5, { width: column.width - 8 });
      x += column.width;
    });
    doc.y = rowY + rowHeight;
  });

  if (rows.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('Belum ada hasil ujian yang tersedia.', tableLeft, doc.y + 10);
  }

  doc.end();
};

export const listRegisteredUsers = async () => {
  return cbtRepository.prisma.registration.findMany({
    where: {
      status: 'APPROVED',
      user: {
        participantProfile: null,
      },
    },
    include: {
      user: true,
      competition: true,
    },
  });
};
