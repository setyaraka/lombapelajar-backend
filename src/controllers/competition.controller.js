import * as service from '../services/competition.service.js';
import { uploadPoster } from '../services/upload.service.js';

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
  const data = await service.getCompetitionById(req.params.id);
  if (!data) return res.status(404).json({ message: 'Not found' });
  res.json(data);
};

export const create = async (req, res) => {
  try {
    let posterKey = null;

    if (req.file) {
      posterKey = await uploadPoster(req.file);
    }

    const payload = {
      ...req.body,
      poster: posterKey,
      requirements: JSON.parse(req.body.requirements),
      timeline: JSON.parse(req.body.timeline),
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

    if (req.file) {
      posterKey = await uploadPoster(req.file);
    }

    const payload = {
      ...req.body,
      poster: posterKey,
      requirements: JSON.parse(req.body.requirements),
      timeline: JSON.parse(req.body.timeline),
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
