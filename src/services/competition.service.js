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
  return prisma.competition.create({ data });
};

export const updateCompetition = async (id, data) => {
  const exist = await prisma.competition.findUnique({ where: { id } });
  if (!exist) throw new Error('Competition not found');

  return prisma.competition.update({
    where: { id },
    data,
  });
};
