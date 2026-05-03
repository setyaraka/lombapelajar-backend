import * as service from '../services/registration.service.js';

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
