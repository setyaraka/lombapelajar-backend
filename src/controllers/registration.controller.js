import * as service from '../services/registration.service.js';
import prisma from '../lib/prisma.js';
import { uploadCreationFile } from '../services/upload.service.js';

export const registerCompetition = async (req, res) => {
  try {
    const { leader_name, members, parent_name, fileKey } = req.body;

    const data = await service.createRegistrationWithProof(req.user.id, req.params.competitionId, {
      leader_name,
      members,
      parent_name,
      fileKey,
    });

    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const myList = async (req, res) => {
  const data = await service.myRegistrations(req.user.id);
  res.json(data);
};

export const uploadCreationController = async (req, res) => {
  try {
    const userId = req.user.id;
    const competitionId = req.params.id;

    const registration = await prisma.registration.findFirst({
      where: {
        userId,
        competitionId,
      },
    });

    if (!registration) {
      return res.status(403).json({
        message: 'Kamu belum mendaftar di lomba ini',
      });
    }

    if (registration.status !== 'APPROVED') {
      return res.status(403).json({
        message: 'Pendaftaran kamu belum disetujui',
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'File required' });
    }

    // 1. upload ke R2
    const fileKey = await uploadCreationFile(file);

    // 2. simpan ke DB
    const updated = await service.saveCreationFile(registration.id, fileKey);

    res.json({
      message: 'Karya uploaded successfully',
      data: updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
