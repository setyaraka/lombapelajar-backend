import prisma from '../lib/prisma.js';

export const getAllRegistrations = async () => {
  return prisma.registration.findMany({
    include: {
      user: { select: { name: true, email: true } },
      competition: true,
      paymentProof: true,
    },
    orderBy: { createdAt: 'desc' },
  });
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

export const approvePayment = async (paymentId) => {
  const proof = await prisma.paymentProof.findUnique({
    where: { id: paymentId },
  });

  if (!proof) throw new Error('Payment proof not found');

  return prisma.$transaction([
    prisma.paymentProof.update({
      where: { id: paymentId },
      data: { status: 'VERIFIED' },
    }),
    prisma.registration.update({
      where: { id: proof.registrationId },
      data: { status: 'APPROVED' },
    }),
  ]);
};

export const rejectPayment = async (paymentId) => {
  const proof = await prisma.paymentProof.findUnique({
    where: { id: paymentId },
  });
  if (!proof) throw new Error('Payment proof not found');

  return prisma.$transaction([
    prisma.paymentProof.update({
      where: { id: paymentId },
      data: { status: 'REJECTED' },
    }),
    prisma.registration.update({
      where: { id: proof.registrationId },
      data: { status: 'REJECTED' },
    }),
  ]);
};
