import prisma from '../lib/prisma.js';

export const getAllRegistrations = async (query) => {
  const { page = 1, perPage = 10, search = '', status = '' } = query;

  const where = {
    AND: [
      search
        ? {
            OR: [
              { user: { name: { contains: search, mode: 'insensitive' } } },
              { school: { contains: search, mode: 'insensitive' } },
              { competition: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {},
      status
        ? status === 'pending'
          ? { paymentProof: null }
          : { paymentProof: { status: status.toUpperCase() } }
        : {},
    ],
  };

  const [data, total] = await Promise.all([
    prisma.registration.findMany({
      where,
      include: {
        user: true,
        competition: true,
        paymentProof: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: Number(perPage),
    }),
    prisma.registration.count({ where }),
  ]);

  const [pending, approved, rejected] = await Promise.all([
    prisma.registration.count({
      where: { paymentProof: null },
    }),
    prisma.registration.count({
      where: { paymentProof: { status: 'VERIFIED' } },
    }),
    prisma.registration.count({
      where: { paymentProof: { status: 'REJECTED' } },
    }),
  ]);

  const participants = data.map((r) => ({
    id: r.id,
    name: r.user.name,
    school: r.school,
    competition: r.competition.title,
    proofUrl: r.paymentProof?.fileUrl ?? null,
    uploadedAt: r.paymentProof?.uploadedAt ?? null,
    status: r.paymentProof?.status,
  }));

  return {
    data: participants,
    meta: {
      total,
      totalPages: Math.ceil(total / perPage),
    },
    stats: {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
    },
  };
};

export const getRegistrationDetail = async (id) => {
  return prisma.registration.findUnique({
    where: { id },
    include: {
      user: true,
      competition: true,
      paymentProof: true,
    },
  });
};

export const updateRegistrationStatus = async ({ id, status }) => {
  const proof = await prisma.paymentProof.findUnique({
    where: { registrationId: id },
  });
  if (!proof) throw new Error('Payment proof not found');

  const registrationStatus = status === 'approved' ? 'APPROVED' : 'REJECTED';

  await prisma.$transaction([
    prisma.paymentProof.update({
      where: { id: proof.id },
      data: { status },
    }),
    prisma.registration.update({
      where: { id: proof.registrationId },
      data: { status: registrationStatus },
    }),
  ]);

  return { message: 'updated' };
};
