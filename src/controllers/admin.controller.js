import * as service from '../services/admin.service.js';

export const list = async (req, res) => {
  try {
    const data = await service.getAllRegistrations(req.query);
    res.json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
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

export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const result = await service.updateRegistrationStatus({ id, status });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update status' });
  }
};
