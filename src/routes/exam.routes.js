import express from 'express';
import * as ctrl from '../controllers/exam.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/attempt/start', authMiddleware, ctrl.start);
router.get('/attempt/current', authMiddleware, ctrl.current);
router.get('/attempt/next', authMiddleware, ctrl.nextAssignedExam);
router.patch('/attempt/:id/answer', authMiddleware, ctrl.answer);
router.patch('/attempt/:id/last-question', authMiddleware, ctrl.lastQuestion);
router.post('/attempt/:id/submit', authMiddleware, ctrl.submit);
router.post('/attempt/:id/log', authMiddleware, ctrl.log);
router.get('/attempt/result', authMiddleware, ctrl.result);

export default router;
