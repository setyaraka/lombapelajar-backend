import prisma from '../lib/prisma.js';

export const createRegistration = async (userId, competitionId, data) => {
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
  });
  if (!comp) throw new Error('Competition not found');

  const exist = await prisma.registration.findFirst({
    where: { userId, competitionId },
  });
  if (exist) throw new Error('You already registered');

  return prisma.registration.create({
    data: {
      userId,
      competitionId,
      phone: data.phone,
      school: data.school,
      nisn: data.nisn,
      address: data.address,
    },
  });
};

export const myRegistrations = async (userId) => {
  const data = await prisma.registration.findMany({
    where: { userId },
    include: {
      competition: true,
      paymentProof: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return data.map((r) => ({
    registrationId: r.id,
    status: r.status,
    competition: {
      id: r.competition.id,
      title: r.competition.title,
      poster: r.competition.poster,
      deadline: r.competition.deadline,
      price: r.competition.price,
    },
    paymentStatus: r.paymentProof?.status ?? null,
  }));
};

export const createRegistrationWithProof = async (userId, competitionId, data) => {
  return prisma.$transaction(async (tx) => {
    const comp = await tx.competition.findUnique({
      where: { id: competitionId },
    });
    if (!comp) throw new Error('Competition not found');

    const exist = await tx.registration.findFirst({
      where: { userId, competitionId },
    });
    if (exist) throw new Error('You already registered');

    const registration = await tx.registration.create({
      data: {
        userId,
        competitionId,
        phone: data.phone,
        school: data.school,
        nisn: data.nisn,
        address: data.address,
      },
    });

    await tx.paymentProof.create({
      data: {
        registrationId: registration.id,
        fileKey: data.fileKey,
      },
    });

    return registration;
  });
};
