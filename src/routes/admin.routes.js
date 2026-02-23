import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/admin.middleware.js';
import * as ctrl from '../controllers/admin.controller.js';

const router = express.Router();

router.use(authMiddleware, adminOnly);

router.get('/registrations', ctrl.list);
router.get('/registrations/:id', ctrl.detail);
router.patch('/participants/:id/status', ctrl.updateStatus);

export default router;
