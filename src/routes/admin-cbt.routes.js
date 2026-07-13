import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { adminOnly } from '../middleware/admin.middleware.js';
import * as ctrl from '../controllers/admin-cbt.controller.js';

const router = express.Router();

router.use(authMiddleware, adminOnly);

router.get('/dashboard', ctrl.dashboard);

router.get('/stages', ctrl.listStages);
router.post('/stages', ctrl.createStage);
router.put('/stages/:id', ctrl.updateStage);
router.delete('/stages/:id', ctrl.deleteStage);

router.get('/exams', ctrl.listExams);
router.get('/exams/:id', ctrl.getExam);
router.post('/exams', ctrl.createExam);
router.put('/exams/:id', ctrl.updateExam);
router.patch('/exams/:id/toggle', ctrl.toggleExam);
router.delete('/exams/:id', ctrl.deleteExam);

router.get('/registered-users', ctrl.listRegisteredUsers);
router.get('/participants', ctrl.listParticipants);
router.post('/participants', ctrl.createParticipant);
router.put('/participants/:id', ctrl.updateParticipant);
router.delete('/participants/:id', ctrl.deleteParticipant);
router.post('/assignments', ctrl.assignParticipants);

router.get('/exams/:examId/questions', ctrl.listQuestions);
router.post('/questions', ctrl.createQuestion);
router.put('/questions/:id', ctrl.updateQuestion);
router.delete('/questions/:id', ctrl.deleteQuestion);

router.get('/monitoring', ctrl.monitoring);
router.get('/results', ctrl.results);
router.get('/results/export', ctrl.exportResults);

export default router;
