import { mapStatus } from '../helper/normalize.js';
import prisma from '../lib/prisma.js';

const getExamStatus = (exam, attempt) => {
  if (!exam) return null;

  const now = new Date();
  // Field tambahan (examTitle/stageName/startAt/endAt) dipakai untuk
  // menampilkan nama & jadwal ujian di sisi peserta (CompetitionDetail).
  // getAllCompetitions tidak include stage, jadi stageName akan null di sana.
  const base = {
    examId: exam.id,
    examTitle: exam.title,
    stageName: exam.stage?.name ?? null,
    startAt: exam.startAt,
    endAt: exam.endAt,
  };

  if (attempt?.status === 'FINISHED')
    return { ...base, status: 'FINISHED', label: 'Sudah selesai' };
  if (exam.startAt > now) return { ...base, status: 'NOT_STARTED', label: 'Belum memenuhi jadwal' };
  if (exam.endAt < now) return { ...base, status: 'SCHEDULE_ENDED', label: 'Jadwal berakhir' };
  if (attempt?.status === 'IN_PROGRESS')
    return { ...base, status: 'IN_PROGRESS', label: 'Sedang berlangsung' };
  return { ...base, status: 'AVAILABLE', label: 'Belum dimulai' };
};

// Untuk kartu list kompetisi: dari semua ujian yang di-assign ke peserta
// pada satu kompetisi (bisa banyak tahap), pilih satu yang paling relevan
// ditampilkan sebagai badge status - prioritas: sedang berlangsung >
// tersedia sekarang > (kalau belum ada keduanya) tahap TERAKHIR yang sudah
// selesai (supaya tidak terkesan belum ada progres padahal tahap
// sebelumnya sudah dikerjakan) > kalau belum ada satupun yang
// selesai/berlangsung, baru fallback ke ujian paling awal yang belum mulai.
const pickCardExamStatus = (schedule) => {
  if (!schedule || schedule.length === 0) return null;

  const inProgress = schedule.find((e) => e.status === 'IN_PROGRESS');
  if (inProgress) return inProgress;

  const available = schedule.find((e) => e.status === 'AVAILABLE');
  if (available) return available;

  const lastFinished = [...schedule].reverse().find((e) => e.status === 'FINISHED');
  if (lastFinished) {
    return {
      ...lastFinished,
      label: `${lastFinished.stageName || lastFinished.examTitle} telah dilaksanakan`,
    };
  }

  return schedule[0];
};

export const getAllCompetitions = async (query, userId) => {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 10;
  const search = query.search || '';
  const level = query.level || '';
  const category = query.category || '';
  const joined = query.joined === 'true';

  const where = {
    AND: [
      search ? { title: { contains: search, mode: 'insensitive' } } : {},
      level ? { level: { has: level } } : {},
      category ? { category: { equals: category, mode: 'insensitive' } } : {},
      joined
        ? {
            registrations: {
              some: { userId },
            },
          }
        : {},
    ],
  };

  const [total, competitions] = await Promise.all([
    prisma.competition.count({ where }),

    prisma.competition.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        _count: { select: { registrations: true } },

        registrations: userId
          ? {
              where: { userId },
              select: { id: true, creationFile: true },
            }
          : false,
      },
    }),
  ]);

  const now = new Date();

  // Jadwal ujian peserta untuk semua kompetisi di halaman ini, di-fetch
  // sekaligus (1 query, bukan N+1 per kartu) lalu dikelompokkan per
  // competitionId - sama seperti logika di getCompetitionById, supaya
  // badge di kartu list konsisten dengan halaman detail.
  const scheduleByCompetition = new Map();
  if (userId && competitions.length > 0) {
    const participant = await prisma.participant.findUnique({ where: { userId } });

    if (participant) {
      const assignments = await prisma.examAssignment.findMany({
        where: {
          participantId: participant.id,
          exam: { competitionId: { in: competitions.map((c) => c.id) } },
        },
        include: {
          exam: { include: { stage: true } },
          attempts: { where: { userId }, orderBy: { startedAt: 'desc' }, take: 1 },
        },
        orderBy: { exam: { startAt: 'asc' } },
      });

      for (const a of assignments) {
        const list = scheduleByCompetition.get(a.exam.competitionId) || [];
        list.push(getExamStatus(a.exam, a.attempts[0]));
        scheduleByCompetition.set(a.exam.competitionId, list);
      }
    }
  }

  const mapped = competitions.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    level: c.level,
    deadline: c.deadline,
    participants: c._count.registrations,
    status: c.deadline < now ? 'closed' : 'open',
    poster: c.poster,
    whatsapp: c.whatsapp,

    submitted: userId ? c.registrations.length > 0 : false,
    creationFile: userId && c.registrations[0] ? c.registrations[0].creationFile : null,
    examStatus: pickCardExamStatus(scheduleByCompetition.get(c.id)),
  }));

  return {
    data: mapped,
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
  };
};

export const getCompetitionById = async (id, userId) => {
  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      requirements: true,
      timelines: true,
      registrations: userId
        ? {
            where: { userId },
            include: { paymentProof: true },
          }
        : false,
    },
  });

  if (!competition) return null;

  // Jadwal ujian peserta untuk kompetisi ini. Tidak bisa lagi hanya ambil
  // 1 ujian terbaru (exams[0]) karena 1 kompetisi bisa punya beberapa tahap,
  // dan 1 tahap bisa punya beberapa ujian - jadi kita ambil dari
  // ExamAssignment (ujian yang benar-benar di-assign ke peserta ybs).
  let examSchedule = [];
  if (userId) {
    const participant = await prisma.participant.findUnique({ where: { userId } });

    if (participant) {
      const assignments = await prisma.examAssignment.findMany({
        where: { participantId: participant.id, exam: { competitionId: id } },
        include: {
          exam: { include: { stage: true } },
          attempts: {
            where: { userId },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { exam: { startAt: 'asc' } },
      });

      examSchedule = assignments.map((a) => getExamStatus(a.exam, a.attempts[0]));
    }
  }

  return {
    ...competition,
    submitted: userId ? competition.registrations.length > 0 : false,
    registrationStatus:
      userId && competition.registrations[0]
        ? mapStatus(competition.registrations[0].paymentProof)
        : null,
    creationFile:
      userId && competition.registrations[0] ? competition.registrations[0].creationFile : null,
    examSchedule,
  };
};

export const createCompetition = async (data) => {
  const { requirements, timeline, poster, ...competition } = data;

  return prisma.competition.create({
    data: {
      title: competition.title,
      description: competition.description,
      poster: poster || null,
      level: competition.level,
      category: competition.category,

      deadline: new Date(competition.deadline),
      price: Number(competition.price),

      bankName: competition.bankName || null,
      bankNumber: competition.bankNumber || null,
      bankHolder: competition.bankHolder || null,
      qris: competition.qris || null,
      whatsapp: competition.whatsapp || null,

      requirements: {
        create: requirements.map((text) => ({ text })),
      },

      timelines: {
        create: timeline.map((t) => ({
          title: t.title,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
        })),
      },
    },
    include: {
      requirements: true,
      timelines: true,
    },
  });
};

export const updateCompetition = async (id, body) => {
  return prisma.$transaction(async (tx) => {
    await tx.competitionRequirement.deleteMany({ where: { competitionId: id } });
    await tx.competitionTimeline.deleteMany({ where: { competitionId: id } });

    return tx.competition.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        poster: body.poster,
        level: body.level,
        category: body.category,

        deadline: new Date(body.deadline),
        price: Number(body.price),

        bankName: body.bankName || null,
        bankNumber: body.bankNumber || null,
        bankHolder: body.bankHolder || null,
        qris: body.qris || null,
        whatsapp: body.whatsapp || null,

        requirements: {
          create: body.requirements.map((text) => ({ text })),
        },

        timelines: {
          create: body.timeline.map((t) => ({
            title: t.title,
            startDate: new Date(t.startDate),
            endDate: new Date(t.endDate),
          })),
        },
      },
      include: { requirements: true, timelines: true },
    });
  });
};

export const deleteCompetition = async (id) => {
  return prisma.$transaction(async (tx) => {
    const registrations = await tx.registration.findMany({
      where: { competitionId: id },
      select: { id: true },
    });

    const registrationIds = registrations.map((r) => r.id);

    if (registrationIds.length > 0) {
      await tx.paymentProof.deleteMany({
        where: { registrationId: { in: registrationIds } },
      });
    }

    await tx.registration.deleteMany({
      where: { competitionId: id },
    });

    await tx.competition.delete({
      where: { id },
    });
  });
};

export const getCompetitionParticipants = async (competitionId, query = {}) => {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 10;

  const where = { competitionId };

  const [registrations, total] = await Promise.all([
    prisma.registration.findMany({
      where,
      include: {
        user: true,
        paymentProof: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.registration.count({ where }),
  ]);

  const mapped = registrations.map((r) => ({
    id: r.id,
    name: r.user.name,
    school: r.user.school,
    status: mapStatus(r.paymentProof),
  }));

  return {
    data: mapped,
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
  };
};

export const uploadJuknisToCompetition = async (competitionId, fileKey) => {
  return await prisma.competition.update({
    where: { id: competitionId },
    data: {
      juknis: fileKey,
    },
  });
};

export const updateAnnouncementInCompetition = async (
  competitionId,
  { announcementPoster, announcementLink },
) => {
  const data = {};
  if (announcementPoster !== undefined) data.announcementPoster = announcementPoster;
  if (announcementLink !== undefined) data.announcementLink = announcementLink;

  return await prisma.competition.update({
    where: { id: competitionId },
    data,
  });
};
