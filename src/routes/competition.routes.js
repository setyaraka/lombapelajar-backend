import express from 'express';
import * as ctrl from '../controllers/competition.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/admin.middleware.js';

const router = express.Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.detail);
router.get('/:id/participants', ctrl.participants);

router.post('/', authMiddleware, adminOnly, ctrl.create);
router.put('/:id', authMiddleware, adminOnly, ctrl.update);
router.delete('/:id', authMiddleware, adminOnly, ctrl.remove);

export default router;
