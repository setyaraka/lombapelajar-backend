import * as service from '../services/competition.service.js';

export const list = async (req, res) => {
  try {
    const data = await service.getAllCompetitions(req.query);
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
