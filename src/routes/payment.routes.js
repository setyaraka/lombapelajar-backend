import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { getUploadUrl, uploadProof } from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/:registrationId/upload', authMiddleware, upload.single('file'), uploadProof);
router.post('/upload-url', authMiddleware, getUploadUrl);

export default router;
