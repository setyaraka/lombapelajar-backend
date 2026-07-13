import bcrypt from 'bcrypt';
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

  if (attempt.status === 'FINISHED') return attempt.finishedAt && attempt.finishedAt > attempt.expiredAt ? 'Auto Submitted' : 'Finished';
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

export const getDashboard = async () => {
  const now = new Date();
  const [
    totalParticipants,
    totalExams,
    activeExams,
    upcomingExams,
    inProgress,
    finished,
    violations,
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
    cbtRepository.prisma.exam.findMany({
      orderBy: { startAt: 'desc' },
      take: 10,
      include: { _count: { select: { assignments: true } } },
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
    participantsPerExam: exams.map((exam) => ({
      examId: exam.id,
      title: exam.title,
      participants: exam._count.assignments,
    })),
  };
};

export const listStages = () => cbtRepository.listStages();

export const createStage = (body) => {
  const payload = validate(stageSchema, body);
  return cbtRepository.createStage(payload);
};

export const updateStage = (id, body) => {
  const payload = validate(stageSchema.partial(), body);
  return cbtRepository.updateStage(id, payload);
};

export const deleteStage = (id) => cbtRepository.deleteStage(id);

export const listExams = async (query) => {
  const { page, perPage, search, status, stageId, skip, take } = toPagination(query);
  const where = {
    AND: [
      search ? { title: { contains: search, mode: 'insensitive' } } : {},
      status ? { status } : {},
      stageId ? { stageId } : {},
    ],
  };

  const [data, total] = await Promise.all([
    cbtRepository.listExams({ where, skip, take }),
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
  const participantIds = payload.participantIds?.length
    ? payload.participantIds
    : payload.stageId
      ? (
          await cbtRepository.prisma.participant.findMany({
            where: { stageId: payload.stageId, isActive: true },
            select: { id: true },
          })
        ).map((participant) => participant.id)
      : [];
  const examIds = payload.examIds?.length ? payload.examIds : payload.examId ? [payload.examId] : [];

  if (participantIds.length === 0 || examIds.length === 0) {
    const error = new Error('Participants and exams are required');
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
  const options = payload.type === 'ESSAY' ? [] : payload.options;

  return cbtRepository.createQuestion({
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
  });
};

export const updateQuestion = (id, body) => {
  const payload = validate(questionSchema.partial(), body);
  const points = payload.type ? defaultQuestionPoints(payload.type, payload.points) : payload.points;

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
              options: {
                create: payload.type === 'ESSAY'
                  ? []
                  : payload.options.map((option, index) => ({
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
      finishedAt: attempt.finishedAt,
      violationCount: attempt.violations.length,
      answerCount: attempt.answers.length,
    })),
    meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  };
};

export const exportResultsCsv = async (query) => {
  const result = await getResults({ ...query, page: 1, perPage: 100 });
  const header = ['Nomor Peserta', 'Nama', 'Ujian', 'Nilai', 'Selesai Pada', 'Pelanggaran', 'Jawaban'];
  const lines = result.data.map((row) =>
    [
      row.participantNumber,
      row.participantName,
      row.examTitle,
      row.score ?? '',
      row.finishedAt ? row.finishedAt.toISOString() : '',
      row.violationCount,
      row.answerCount,
    ]
      .map(csvEscape)
      .join(','),
  );

  return [header.map(csvEscape).join(','), ...lines].join('\n');
};

export const listRegisteredUsers = async () => {
  return cbtRepository.prisma.registration.findMany({
    where: {
      status: 'APPROVED',
      user: {
        participantProfile: null
      }
    },
    include: {
      user: true,
      competition: true
    }
  });
};
