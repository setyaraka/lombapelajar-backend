import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { uploadImageOrPdf } from '../middleware/upload.middleware.js';
import { getUploadUrl, uploadProof } from '../controllers/payment.controller.js';

const router = express.Router();

router.post(
  '/:registrationId/upload',
  authMiddleware,
  uploadImageOrPdf.single('file'),
  uploadProof,
);
router.post('/upload-url', authMiddleware, getUploadUrl);

export default router;
