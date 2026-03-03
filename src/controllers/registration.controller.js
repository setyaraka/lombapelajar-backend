import * as service from '../services/registration.service.js';

export const registerCompetition = async (req, res) => {
  try {
    const { phone, school, nisn, address, fileUrl, fileKey } = req.body;

    const data = await service.createRegistrationWithProof(
      req.user.id,
      req.params.competitionId,
      { phone, school, nisn, address, fileUrl, fileKey }
    );

    res.json(data);
  } catch (err) { 
    res.status(400).json({ message: err.message });
  }
};

export const myList = async (req, res) => {
  const data = await service.myRegistrations(req.user.id);
  res.json(data);
};
