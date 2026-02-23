import prisma from '../lib/prisma.js';

export const getAllCompetitions = async (query, userId) => {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 10;
  const search = query.search || "";
  const level = query.level || "";
  const category = query.category || "";
  const joined = query.joined === "true";

  const where = {
    AND: [
      search
        ? { title: { contains: search, mode: "insensitive" } }
        : {},
      level ? { level } : {},
      category ? { category } : {},
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
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        _count: { select: { registrations: true } },

        registrations: userId
          ? {
              where: { userId },
              select: { id: true },
            }
          : false,
      },
    }),
  ]);

  const now = new Date();

  const mapped = competitions.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    level: c.level,
    deadline: c.deadline,
    participants: c._count.registrations,
    status: c.deadline < now ? "closed" : "open",
    poster: c.poster,

    submitted: userId ? c.registrations.length > 0 : false,
  }));

  return {
    data: mapped,
    page,
    perPage,
    total,
    totalPages: Math.ceil(total / perPage),
  };
};

export const getCompetitionById = async (id) => {
  return prisma.competition.findUnique({
    where: { id },
    include: {
      requirements: true,
      timelines: true,
    },
  });
};

export const createCompetition = async (data) => {
  const { requirements, timeline, ...competition } = data;

  return prisma.competition.create({
    data: {
      title: competition.title,
      description: competition.description,
      poster: competition.poster,
      level: competition.level,
      category: competition.category,

      deadline: new Date(competition.deadline),
      price: Number(competition.price),

      bankName: competition.bankName || null,
      bankNumber: competition.bankNumber || null,
      bankHolder: competition.bankHolder || null,

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

export const getCompetitionParticipants = async (competitionId) => {
  const registrations = await prisma.registration.findMany({
    where: { competitionId },
    include: {
      user: true,
      paymentProof: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return registrations.map((r) => ({
    id: r.id,
    name: r.user.name,
    school: r.school,
    status: !r.paymentProof
      ? 'pending'
      : r.paymentProof.status === 'VERIFIED'
        ? 'verified'
        : 'rejected',
  }));
};
