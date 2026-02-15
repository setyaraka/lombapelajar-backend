import * as service from '../services/competition.service.js';

export const list = async (req, res) => {
  const data = await service.getAllCompetitions();
  res.json(data);
};

export const detail = async (req, res) => {
  const data = await service.getCompetitionById(req.params.id);
  if (!data) return res.status(404).json({ message: 'Not found' });
  res.json(data);
};

export const create = async (req, res) => {
  const data = await service.createCompetition(req.body);
  res.json(data);
};

export const update = async (req, res) => {
  try {
    const data = await service.updateCompetition(req.params.id, req.body);
    res.json(data);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};
