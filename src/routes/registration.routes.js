import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/registration.controller.js';
import { uploadImageOrPdf } from '../middleware/upload.middleware.js';

const router = express.Router();

router.post(
  '/upload-creation',
  authMiddleware,
  uploadImageOrPdf.single('file'),
  ctrl.uploadCreationController,
);
router.post('/:competitionId', authMiddleware, ctrl.registerCompetition);
router.get('/me', authMiddleware, ctrl.myList);

export default router;
