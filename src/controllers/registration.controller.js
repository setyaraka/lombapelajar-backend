import * as service from '../services/registration.service.js';

export const registerCompetition = async (req, res) => {
  try {
    const data = await service.createRegistration(req.user.id, req.params.competitionId, req.body);
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const myList = async (req, res) => {
  const data = await service.myRegistrations(req.user.id);
  res.json(data);
};
