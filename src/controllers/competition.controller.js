import * as service from '../services/competition.service.js';
import { uploadJuknis, uploadPoster, uploadQris } from '../services/upload.service.js';

export const list = async (req, res) => {
  try {
    const userId = req.user?.id;
    const data = await service.getAllCompetitions(req.query, userId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const detail = async (req, res) => {
  const userId = req.user?.id;
  const data = await service.getCompetitionById(req.params.id, userId);
  if (!data) return res.status(404).json({ message: 'Not found' });
  res.json(data);
};

export const create = async (req, res) => {
  try {
    let posterKey = null;
    let qrisKey = null;

    if (req.files) {
      if (req.files.poster?.[0]) {
        posterKey = await uploadPoster(req.files.poster[0]);
      }
      if (req.files.qris?.[0]) {
        qrisKey = await uploadQris(req.files.qris[0]);
      }
    }

    const payload = {
      ...req.body,
      poster: posterKey || req.body.poster,
      qris: qrisKey || req.body.qris,
      requirements: JSON.parse(req.body.requirements || '[]'),
      timeline: JSON.parse(req.body.timeline || '[]'),
      level: JSON.parse(req.body.level || '[]'),
    };

    const data = await service.createCompetition(payload);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed create competition' });
  }
};

export const update = async (req, res) => {
  try {
    let posterKey = req.body.poster;
    let qrisKey = req.body.qris;

    if (req.files) {
      if (req.files.poster?.[0]) {
        posterKey = await uploadPoster(req.files.poster[0]);
      }
      if (req.files.qris?.[0]) {
        qrisKey = await uploadQris(req.files.qris[0]);
      }
    }

    const payload = {
      ...req.body,
      poster: posterKey,
      qris: qrisKey,
      requirements: JSON.parse(req.body.requirements || '[]'),
      timeline: JSON.parse(req.body.timeline || '[]'),
      level: JSON.parse(req.body.level || '[]'),
    };

    const data = await service.updateCompetition(req.params.id, payload);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const remove = async (req, res) => {
  try {
    const id = req.params.id;

    await service.deleteCompetition(id);

    res.json({ message: 'Competition deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete competition' });
  }
};

export const participants = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await service.getCompetitionParticipants(id);

    res.json(data);
  } catch {
    res.status(500).json({ message: 'Failed to get Participant' });
  }
};

export const uploadJuknisController = async (req, res) => {
  try {
    const file = req.file;
    const { competitionId } = req.body;

    if (!file) {
      return res.status(400).json({ message: 'File is required' });
    }

    const key = await uploadJuknis(file);

    const updated = await service.uploadJuknisToCompetition(competitionId, key);

    res.json({
      message: 'Juknis uploaded successfully',
      data: updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    let announcementPoster = undefined;
    let announcementLink = undefined;

    if (req.file) {
      announcementPoster = await uploadPoster(req.file);
    } else if (req.body.announcementPoster === 'null' || req.body.announcementPoster === '') {
      announcementPoster = null;
    }

    if (req.body.announcementLink !== undefined) {
      announcementLink = req.body.announcementLink === '' ? null : req.body.announcementLink;
    }

    const data = await service.updateAnnouncementInCompetition(id, {
      announcementPoster,
      announcementLink,
    });

    res.json({
      message: 'Announcement updated successfully',
      data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
