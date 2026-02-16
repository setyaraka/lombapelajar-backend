import prisma from '../lib/prisma.js';

export const uploadPaymentProof = async (userId, registrationId, fileUrl) => {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
  });

  if (!reg) throw new Error('Registration not found');
  if (reg.userId !== userId) throw new Error('Not your registration');

  const proof = await prisma.paymentProof.upsert({
    where: { registrationId },
    update: { fileUrl },
    create: {
      registrationId,
      fileUrl,
    },
  });

  return proof;
};
