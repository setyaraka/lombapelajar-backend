import express from 'express';
import * as ctrl from '../controllers/competition.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/admin.middleware.js';

const router = express.Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.detail);

router.post('/', authMiddleware, adminOnly, ctrl.create);
router.put('/:id', authMiddleware, adminOnly, ctrl.update);

export default router;
