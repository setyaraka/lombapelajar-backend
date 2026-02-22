import prisma from '../lib/prisma.js';

export const getAllCompetitions = async () => {
  return prisma.competition.findMany({
    orderBy: { createdAt: 'desc' },
  });
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
