import express from 'express';
import * as ctrl from '../controllers/competition.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/admin.middleware.js';
import { upload } from '../middleware/upload.middleware.js';

const router = express.Router();

router.get('/', optionalAuthMiddleware, ctrl.list);
router.get('/:id', optionalAuthMiddleware, ctrl.detail);
router.get('/:id/participants', ctrl.participants);

router.post(
  '/',
  authMiddleware,
  adminOnly,
  upload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'qris', maxCount: 1 },
  ]),
  ctrl.create,
);
router.post(
  '/upload-juknis',
  authMiddleware,
  adminOnly,
  upload.single('file'),
  ctrl.uploadJuknisController,
);
router.put(
  '/:id/announcement',
  authMiddleware,
  adminOnly,
  upload.single('file'),
  ctrl.updateAnnouncement
);
router.put(
  '/:id',
  authMiddleware,
  adminOnly,
  upload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'qris', maxCount: 1 },
  ]),
  ctrl.update,
);
router.delete('/:id', authMiddleware, adminOnly, ctrl.remove);

export default router;
