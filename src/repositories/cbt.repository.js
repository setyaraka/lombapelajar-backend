import prisma from '../lib/prisma.js';

export const cbtRepository = {
  prisma,

  countParticipants(where = {}) {
    return prisma.participant.count({ where });
  },

  countExams(where = {}) {
    return prisma.exam.count({ where });
  },

  countAttempts(where = {}) {
    return prisma.examAttempt.count({ where });
  },

  countViolations(where = {}) {
    return prisma.violationLog.count({ where });
  },

  listStages() {
    return prisma.examStage.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { participants: true, exams: true } },
      },
    });
  },

  findStage(id) {
    return prisma.examStage.findUnique({ where: { id } });
  },

  createStage(data) {
    return prisma.examStage.create({ data });
  },

  updateStage(id, data) {
    return prisma.examStage.update({ where: { id }, data });
  },

  deleteStage(id) {
    return prisma.examStage.delete({ where: { id } });
  },

  listExams({ where, skip, take, sortBy = 'startAt' }) {
    return prisma.exam.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: 'desc' },
      include: {
        stage: true,
        competition: true,
        _count: { select: { assignments: true, questions: true, attempts: true } },
      },
    });
  },

  countExamList(where) {
    return prisma.exam.count({ where });
  },

  findExam(id) {
    return prisma.exam.findUnique({
      where: { id },
      include: {
        stage: true,
        competition: true,
        questions: { include: { options: { orderBy: { position: 'asc' } } } },
      },
    });
  },

  createExam(data) {
    return prisma.exam.create({ data, include: { stage: true, competition: true } });
  },

  updateExam(id, data) {
    return prisma.exam.update({ where: { id }, data, include: { stage: true, competition: true } });
  },

  deleteExam(id) {
    return prisma.exam.delete({ where: { id } });
  },

  listParticipants({ where, skip, take }) {
    return prisma.participant.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        stage: true,
        assignments: { include: { exam: { include: { competition: true } } } },
        // Dipakai untuk menurunkan "lomba" peserta ini (lihat catatan di
        // buildParticipantWhere di admin-cbt.service.js) - Participant tidak
        // punya field competitionId langsung, jadi ditelusuri lewat
        // Registration milik User yang sama.
        user: { include: { registrations: { include: { competition: true } } } },
      },
    });
  },

  // Sama seperti listParticipants tapi tanpa paginasi, cuma id - dipakai
  // fitur "Pilih Semua" di frontend supaya bisa pilih semua peserta yang
  // cocok filter lintas halaman, bukan cuma yang tampil di halaman aktif.
  listParticipantIds(where) {
    return prisma.participant.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  countParticipantList(where) {
    return prisma.participant.count({ where });
  },

  findParticipant(id) {
    return prisma.participant.findUnique({
      where: { id },
      include: { user: true, stage: true, assignments: { include: { exam: true } } },
    });
  },

  findParticipantByUser(userId) {
    return prisma.participant.findUnique({ where: { userId } });
  },

  findParticipantByEmail(email) {
    return prisma.participant.findUnique({ where: { email } });
  },

  createParticipant(data) {
    return prisma.participant.create({ data, include: { stage: true } });
  },

  updateParticipant(id, data) {
    return prisma.participant.update({ where: { id }, data, include: { stage: true } });
  },

  deleteParticipant(id) {
    return prisma.participant.delete({ where: { id } });
  },

  upsertAssignment(data) {
    return prisma.examAssignment.upsert({
      where: {
        participantId_examId: {
          participantId: data.participantId,
          examId: data.examId,
        },
      },
      create: data,
      update: { status: 'ASSIGNED' },
    });
  },

  cancelAssignment(participantId, examId) {
    return prisma.examAssignment.update({
      where: { participantId_examId: { participantId, examId } },
      data: { status: 'CANCELLED' },
    });
  },

  listQuestions(examId) {
    return prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { position: 'asc' },
      include: { options: { orderBy: { position: 'asc' } } },
    });
  },

  createQuestion(data) {
    return prisma.examQuestion.create({
      data,
      include: { options: { orderBy: { position: 'asc' } } },
    });
  },

  updateQuestion(id, data) {
    return prisma.examQuestion.update({
      where: { id },
      data,
      include: { options: { orderBy: { position: 'asc' } } },
    });
  },

  deleteQuestion(id) {
    return prisma.examQuestion.delete({ where: { id } });
  },

  monitoring({ where, skip, take }) {
    return prisma.examAssignment.findMany({
      where,
      skip,
      take,
      orderBy: { assignedAt: 'desc' },
      include: {
        participant: true,
        exam: { include: { competition: true } },
        attempts: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            violations: true,
            answers: true,
          },
        },
      },
    });
  },

  countMonitoring(where) {
    return prisma.examAssignment.count({ where });
  },

  results({ where, skip, take }) {
    return prisma.examAttempt.findMany({
      where,
      skip,
      take,
      orderBy: { finishedAt: 'desc' },
      include: {
        participant: true,
        user: true,
        // `stage` disertakan supaya status kelulusan (rank vs
        // stage.passingCutoff) bisa dihitung tanpa query tambahan.
        exam: { include: { competition: true, stage: true } },
        answers: true,
        violations: true,
      },
    });
  },

  countResults(where) {
    return prisma.examAttempt.count({ where });
  },
};
