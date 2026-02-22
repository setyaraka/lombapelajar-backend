import prisma from '../lib/prisma.js';

// export const getAllCompetitions = async () => {
//   return prisma.competition.findMany({
//     orderBy: { createdAt: 'desc' },
//   });
// };
export const getAllCompetitions = async (query) => {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 10;
  const search = query.search || "";
  const level = query.level || "";
  const category = query.category || "";

  const where = {
    AND: [
      search
        ? {
            title: { contains: search, mode: "insensitive" },
          }
        : {},
      level ? { level } : {},
      category ? { category } : {},
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
  }));

  return {
    data: mapped,
    meta: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
};

export const getCompetitionById = async (id) => {
  return prisma.competition.findUnique({
    where: { id },
  });
};

export const createCompetition = async (data) => {
  const { requirements, timeline, ...competition } = data;

  return prisma.competition.create({
    data: {
      ...competition,
      deadline: new Date(competition.deadline),
      price: Number(competition.price),

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

export const updateCompetition = async (id, data) => {
  const exist = await prisma.competition.findUnique({ where: { id } });
  if (!exist) throw new Error('Competition not found');

  return prisma.competition.update({
    where: { id },
    data,
  });
};
