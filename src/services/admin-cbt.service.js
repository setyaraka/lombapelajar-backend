import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { cbtRepository } from '../repositories/cbt.repository.js';
import { updateAnnouncementInCompetition } from './competition.service.js';
import { uploadPoster } from './upload.service.js';
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

// Status kelulusan dihitung dari rank hasil "Hitung Ranking" dibanding
// passingCutoff milik Stage exam ini. Null kalau rank belum dihitung atau
// admin belum set cutoff-nya — di kasus itu status kelulusan memang belum
// bisa ditentukan, bukan otomatis "Tidak Lulus".
const passingStatus = (rank, passingCutoff) => {
  if (!rank || !passingCutoff) return null;
  return rank <= passingCutoff ? 'LULUS' : 'TIDAK_LULUS';
};

const passingStatusLabel = (status) => {
  if (status === 'LULUS') return 'Lulus';
  if (status === 'TIDAK_LULUS') return 'Tidak Lulus';
  return '';
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

// Where clause tabel Manajemen Peserta - dipakai bareng oleh listParticipants
// (paginated, buat tabel) dan listParticipantIds (semua id tanpa paginasi,
// buat fitur "Pilih Semua").
const buildParticipantWhere = ({ search, stageId, competitionId, assigned }) => ({
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
    // Participant tidak punya competitionId langsung - ditelusuri lewat
    // Registration milik User yang sama (lihat catatan di
    // cbtRepository.listParticipants).
    competitionId ? { user: { registrations: { some: { competitionId } } } } : {},
    // "Belum di-assign" disamakan dengan stageId kosong - di assignParticipants,
    // stageId peserta dan assignment ujiannya selalu di-set bersamaan, jadi
    // stageId null = representasi paling sederhana dari "belum diproses sama
    // sekali", tanpa perlu query terpisah ke tabel ExamAssignment.
    assigned === 'true' ? { stageId: { not: null } } : {},
    assigned === 'false' ? { stageId: null } : {},
  ],
});

export const listParticipants = async (query) => {
  const { page, perPage, skip, take, search, stageId, competitionId, assigned } =
    toPagination(query);
  const where = buildParticipantWhere({ search, stageId, competitionId, assigned });

  const [data, total] = await Promise.all([
    cbtRepository.listParticipants({ where, skip, take }),
    cbtRepository.countParticipantList(where),
  ]);

  return {
    data,
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
};

export const listParticipantIds = async (query) => {
  const { search, stageId, competitionId, assigned } = toPagination(query);
  const where = buildParticipantWhere({ search, stageId, competitionId, assigned });
  const rows = await cbtRepository.listParticipantIds(where);
  return rows.map((row) => row.id);
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
    const exam = await tx.exam.findUnique({
      where: { id: payload.examId },
      select: { status: true },
    });
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
        // Nama lomba/kompetisi exam ini, supaya admin bisa membedakan exam
        // dengan judul yang sama tapi dari kompetisi berbeda.
        competitionTitle: assignment.exam.competition?.title ?? null,
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
      // Nama lomba/kompetisi exam ini, supaya admin bisa membedakan exam
      // dengan judul yang sama tapi dari kompetisi berbeda.
      competitionTitle: attempt.exam.competition?.title ?? null,
      score: attempt.score,
      // rank dihitung per Stage (bisa gabungan >1 exam), bukan otomatis per
      // attempt — lihat recomputeStageRanking. Null berarti admin belum
      // pernah menekan "Hitung Ranking" untuk stage exam ini, atau attempt
      // ini belum tergabung ke exam manapun yang punya stage.
      rank: attempt.rank,
      // Kelulusan (LULUS/TIDAK_LULUS/null) dari rank vs cutoff Stage exam
      // ini — lihat passingStatus di atas.
      passingCutoff: attempt.exam.stage?.passingCutoff ?? null,
      status: passingStatus(attempt.rank, attempt.exam.stage?.passingCutoff),
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

// Publish pengumuman hasil peserta SATU kompetisi pada satu Stage. Di-scope
// ke (stageId + competitionId) karena ExamStage adalah entity global — nama
// stage (mis. "TKD") dipakai bersama oleh banyak Lomba sekaligus, jadi
// mengambil "semua exam di stage ini" tanpa filter kompetisi bisa
// mencampur/membocorkan data peserta lomba lain. competitionId diambil dari
// exam yang sedang dipilih admin di halaman Hasil Ujian, bukan diterka dari
// seluruh isi stage.
//
// Slot pengumuman yang dipakai masih yang lama
// (Competition.announcementPoster/announcementLink, lihat "Atur
// Pengumuman") — 1 kompetisi = 1 slot pengumuman, jadi publish dari stage
// lain di kompetisi yang sama akan menimpa punya stage sebelumnya. Setelah
// publish, Exam-exam kompetisi ini di stage ini juga ditandai
// resultPublished = true supaya nilai & rank peserta otomatis kebuka (lihat
// exam.service.js — flag ini sudah dipakai untuk gating itu).
export const publishStageAnnouncement = async (
  stageId,
  { mode, file, announcementLink, competitionId },
) => {
  if (!competitionId) {
    const error = new Error('competitionId wajib diisi');
    error.status = 400;
    throw error;
  }

  const exams = await cbtRepository.prisma.exam.findMany({
    where: { stageId, competitionId },
    select: { id: true, title: true, competitionId: true },
  });

  if (exams.length === 0) {
    const error = new Error('Tidak ada ujian pada tahap ini untuk kompetisi yang dipilih');
    error.status = 400;
    throw error;
  }

  const updateData = {};

  if (mode === 'auto') {
    const examIds = exams.map((exam) => exam.id);
    const rows = await cbtRepository.results({
      where: { status: 'FINISHED', examId: { in: examIds } },
    });
    rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const buffer = await buildResultsPdfBuffer(rows, {
      title: `Hasil Ujian - ${exams[0].title}`,
      columns: PARTICIPANT_RESULTS_COLUMNS,
    });
    updateData.announcementPoster = await uploadPoster({
      buffer,
      originalname: `hasil-${stageId}.pdf`,
      mimetype: 'application/pdf',
    });
  } else if (mode === 'upload') {
    if (!file) {
      const error = new Error('File PDF wajib diupload');
      error.status = 400;
      throw error;
    }
    updateData.announcementPoster = await uploadPoster(file);
  } else if (mode === 'url') {
    if (!announcementLink) {
      const error = new Error('URL pengumuman wajib diisi');
      error.status = 400;
      throw error;
    }
    updateData.announcementLink = announcementLink;
  } else {
    const error = new Error('Mode publish tidak dikenal');
    error.status = 400;
    throw error;
  }

  const competition = await updateAnnouncementInCompetition(competitionId, updateData);

  await cbtRepository.prisma.exam.updateMany({
    where: { id: { in: exams.map((exam) => exam.id) } },
    data: { resultPublished: true },
  });

  return { competition, stageId, mode };
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
    'Status',
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
      passingStatusLabel(row.status),
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
  // Export selalu diurutkan berdasarkan ranking (bukan finishedAt seperti
  // default cbtRepository.results), rank null (belum diranking) ditaruh
  // di akhir.
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Hasil Ujian');

  worksheet.columns = [
    { header: 'Nomor Peserta', key: 'participantNumber', width: 20 },
    { header: 'Nama Peserta', key: 'participantName', width: 25 },
    { header: 'Sekolah/Instansi', key: 'school', width: 28 },
    { header: 'Ujian', key: 'examTitle', width: 30 },
    { header: 'Lomba', key: 'competitionTitle', width: 30 },
    { header: 'Jumlah Jawaban', key: 'answerCount', width: 18 },
    { header: 'Selesai Pada', key: 'finishedAt', width: 22 },
    { header: 'Nilai Akhir', key: 'score', width: 15 },
    { header: 'Ranking', key: 'rank', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  rows.forEach((row) => {
    worksheet.addRow({
      participantNumber: row.participant?.participantNumber || '-',
      participantName: row.participant?.name || row.user.name,
      // Sekolah cuma ada di User (Participant tidak punya field school
      // sendiri), jadi selalu ambil dari row.user, bukan row.participant.
      school: row.user.school || '-',
      examTitle: row.exam.title,
      competitionTitle: row.exam.competition?.title || '-',
      answerCount: row.answers.length,
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toLocaleString('id-ID') : '',
      score: row.score ?? '',
      rank: row.rank ?? '',
      status: passingStatusLabel(passingStatus(row.rank, row.exam.stage?.passingCutoff)),
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
// Menggambar isi tabel hasil ujian (judul + tabel + garis) ke sebuah
// PDFDocument yang sudah dibuat oleh caller. Dipisah dari exportResultsPdf
// supaya bisa dipakai ulang oleh publishStageAnnouncement (mode 'auto') yang
// perlu PDF yang sama tapi ditulis ke buffer, bukan langsung ke response.
// Kolom lengkap (dilihat admin lewat tombol Export PDF) vs kolom yang
// dilihat peserta (PDF hasil "Publish Pengumuman" mode auto) — peserta
// sengaja tidak diberi Nilai/Ranking/Jml Jawaban/Selesai Pada, cukup admin
// yang tahu detail teknis itu. Lebar tiap set dijaga totalnya tetap muat di
// lebar halaman A4 landscape (±760pt setelah margin).
const FULL_RESULTS_COLUMNS = [
  { key: 'participantNumber', label: 'Nomor Peserta', width: 85 },
  { key: 'participantName', label: 'Nama Peserta', width: 100 },
  { key: 'school', label: 'Sekolah/Instansi', width: 100 },
  { key: 'examTitle', label: 'Ujian', width: 85 },
  { key: 'competitionTitle', label: 'Lomba', width: 110 },
  { key: 'answerCount', label: 'Jml Jawaban', width: 45 },
  { key: 'finishedAt', label: 'Selesai Pada', width: 85 },
  { key: 'score', label: 'Nilai', width: 40 },
  { key: 'rank', label: 'Ranking', width: 40 },
  { key: 'status', label: 'Status', width: 55 },
];

const PARTICIPANT_RESULTS_COLUMNS = [
  { key: 'participantNumber', label: 'Nomor Peserta', width: 120 },
  { key: 'participantName', label: 'Nama Peserta', width: 170 },
  { key: 'school', label: 'Sekolah/Instansi', width: 190 },
  { key: 'competitionTitle', label: 'Lomba', width: 190 },
  { key: 'status', label: 'Status', width: 90 },
];

const drawResultsPdfContent = (
  doc,
  rows,
  { title = 'Hasil Ujian', columns = FULL_RESULTS_COLUMNS } = {},
) => {
  doc.font('Helvetica-Bold').fontSize(16).text(title, { align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#64748b')
    .text(`Diekspor pada ${new Date().toLocaleString('id-ID')}`, { align: 'center' });
  doc.fillColor('#000000');
  doc.moveDown(1);

  const MIN_ROW_HEIGHT = 20;
  const CELL_VERTICAL_PADDING = 10; // 5 di atas + 5 di bawah teks, lihat offset "y + 5" di bawah
  const tableLeft = doc.page.margins.left;
  const tableRight = doc.page.width - doc.page.margins.right;

  // Tinggi baris DULU dihitung sebagai angka tetap (20pt), padahal beberapa
  // isi kolom (judul lomba yang panjang, label header "Jml Jawaban") bisa
  // wrap jadi 2 baris di lebar kolomnya — hasilnya teks & garis pemisah
  // saling timpa. Dihitung dinamis dari heightOfString tiap kolom (nilai
  // maksimum di antara semua kolom baris itu) supaya baris yang wrap otomatis
  // jadi lebih tinggi, bukan kepotong.
  const measureRowHeight = (cellValues, font) => {
    doc.font(font).fontSize(9);
    let maxTextHeight = 0;
    columns.forEach((column) => {
      const height = doc.heightOfString(String(cellValues[column.key] ?? ''), {
        width: column.width - 8,
      });
      if (height > maxTextHeight) maxTextHeight = height;
    });
    return Math.max(MIN_ROW_HEIGHT, maxTextHeight + CELL_VERTICAL_PADDING);
  };

  const headerValues = Object.fromEntries(columns.map((column) => [column.key, column.label]));

  const drawHeaderRow = () => {
    // Ambil doc.y SEKALI di awal dan pakai nilai tetap itu untuk semua kolom
    // (sama seperti loop baris data di bawah) — doc.text() selalu menggeser
    // doc.y turun tiap dipanggil, jadi kalau dibaca ulang per kolom, tiap
    // label header numpuk makin turun (efek "tangga").
    const headerHeight = measureRowHeight(headerValues, 'Helvetica-Bold');
    let x = tableLeft;
    const headerY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    columns.forEach((column) => {
      doc.text(column.label, x + 4, headerY + 5, { width: column.width - 8 });
      x += column.width;
    });
    const lineY = headerY + headerHeight;
    doc.moveTo(tableLeft, lineY).lineTo(tableRight, lineY).strokeColor('#cbd5e1').stroke();
    doc.y = lineY;
  };

  drawHeaderRow();

  // Baris genap/ganjil diberi warna selang-seling (zebra stripe) supaya
  // tabel lebih gampang dibaca sejajar per baris — dihitung dari index di
  // seluruh data (bukan direset tiap ganti halaman), jadi pola selang-seling
  // tetap konsisten walau tabelnya lebih dari satu halaman.
  rows.forEach((row, index) => {
    const values = {
      participantNumber: row.participant?.participantNumber || '-',
      participantName: row.participant?.name || row.user.name,
      // Sekolah cuma ada di User (Participant tidak punya field school
      // sendiri), jadi selalu ambil dari row.user, bukan row.participant.
      school: row.user.school || '-',
      examTitle: row.exam.title,
      competitionTitle: row.exam.competition?.title || '-',
      answerCount: String(row.answers.length),
      finishedAt: row.finishedAt ? new Date(row.finishedAt).toLocaleString('id-ID') : '-',
      score: row.score ?? '-',
      rank: row.rank ? `#${row.rank}` : '-',
      status: passingStatusLabel(passingStatus(row.rank, row.exam.stage?.passingCutoff)) || '-',
    };
    const rowHeight = measureRowHeight(values, 'Helvetica');

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeaderRow();
    }

    const rowY = doc.y;
    if (index % 2 === 1) {
      doc.rect(tableLeft, rowY, tableRight - tableLeft, rowHeight).fill('#f1f5f9');
      doc.fillColor('#000000');
    }

    let x = tableLeft;
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
};

export const exportResultsPdf = async (query, res) => {
  const examId = query.examId || '';
  const where = {
    AND: [{ status: 'FINISHED' }, examId ? { examId } : {}],
  };

  const rows = await cbtRepository.results({ where });
  // Sama seperti exportResultsExcel — urutkan berdasarkan ranking, rank
  // null (belum diranking) ditaruh di akhir.
  rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="hasil-ujian.pdf"');
  doc.pipe(res);

  drawResultsPdfContent(doc, rows);

  doc.end();
};

// Sama seperti exportResultsPdf, tapi hasilnya dikumpulkan jadi Buffer di
// memori (bukan di-stream ke response) — dipakai publishStageAnnouncement
// mode 'auto' supaya PDF-nya bisa langsung diupload sebagai poster
// pengumuman, bukan didownload oleh browser admin.
const buildResultsPdfBuffer = (rows, options) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawResultsPdfContent(doc, rows, options);
    doc.end();
  });

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
