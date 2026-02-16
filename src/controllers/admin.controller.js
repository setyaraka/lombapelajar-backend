import * as service from '../services/admin.service.js';

export const list = async (req, res) => {
  const data = await service.getAllRegistrations();
  res.json(data);
};

export const detail = async (req, res) => {
  const data = await service.getRegistrationDetail(req.params.id);
  res.json(data);
};

export const approve = async (req, res) => {
  try {
    await service.approvePayment(req.params.id);
    res.json({ message: 'Payment approved' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const reject = async (req, res) => {
  try {
    await service.rejectPayment(req.params.id);
    res.json({ message: 'Payment rejected' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
