import * as service from '../services/payment.service.js';

export const uploadProof = async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');

    const fileUrl = `/uploads/${req.file.filename}`;

    const data = await service.uploadPaymentProof(req.user.id, req.params.registrationId, fileUrl);

    res.json({ message: 'Upload success', data });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
