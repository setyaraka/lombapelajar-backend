import * as service from '../services/admin-cbt.service.js';

const handleError = (res, err) => {
  console.error(err);
  res.status(err.status || 400).json({
    message: err.message || 'Request failed',
    issues: err.issues || undefined,
  });
};

export const dashboard = async (req, res) => {
  try {
    res.json(await service.getDashboard(req.query));
  } catch (err) {
    handleError(res, err);
  }
};

export const listStages = async (req, res) => {
  try {
    res.json(await service.listStages());
  } catch (err) {
    handleError(res, err);
  }
};

export const createStage = async (req, res) => {
  try {
    res.json(await service.createStage(req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const updateStage = async (req, res) => {
  try {
    res.json(await service.updateStage(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteStage = async (req, res) => {
  try {
    await service.deleteStage(req.params.id);
    res.json({ message: 'Stage deleted' });
  } catch (err) {
    handleError(res, err);
  }
};

export const listExams = async (req, res) => {
  try {
    res.json(await service.listExams(req.query));
  } catch (err) {
    handleError(res, err);
  }
};

export const getExam = async (req, res) => {
  try {
    res.json(await service.getExam(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
};

export const createExam = async (req, res) => {
  try {
    res.json(await service.createExam(req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const updateExam = async (req, res) => {
  try {
    res.json(await service.updateExam(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteExam = async (req, res) => {
  try {
    await service.deleteExam(req.params.id);
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    handleError(res, err);
  }
};

export const toggleExam = async (req, res) => {
  try {
    res.json(await service.toggleExam(req.params.id, req.body.isActive));
  } catch (err) {
    handleError(res, err);
  }
};

export const listParticipants = async (req, res) => {
  try {
    res.json(await service.listParticipants(req.query));
  } catch (err) {
    handleError(res, err);
  }
};

export const createParticipant = async (req, res) => {
  try {
    res.json(await service.createParticipant(req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const updateParticipant = async (req, res) => {
  try {
    res.json(await service.updateParticipant(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteParticipant = async (req, res) => {
  try {
    await service.deleteParticipant(req.params.id);
    res.json({ message: 'Participant deleted' });
  } catch (err) {
    handleError(res, err);
  }
};

export const assignParticipants = async (req, res) => {
  try {
    res.json(await service.assignParticipants(req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const listQuestions = async (req, res) => {
  try {
    res.json(await service.listQuestions(req.params.examId));
  } catch (err) {
    handleError(res, err);
  }
};

export const createQuestion = async (req, res) => {
  try {
    res.json(await service.createQuestion(req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const updateQuestion = async (req, res) => {
  try {
    res.json(await service.updateQuestion(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    await service.deleteQuestion(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    handleError(res, err);
  }
};

export const monitoring = async (req, res) => {
  try {
    res.json(await service.getMonitoring(req.query));
  } catch (err) {
    handleError(res, err);
  }
};

export const results = async (req, res) => {
  try {
    res.json(await service.getResults(req.query));
  } catch (err) {
    handleError(res, err);
  }
};

export const exportResults = async (req, res) => {
  try {
    await service.exportResultsExcel(req.query, res);
  } catch (err) {
    handleError(res, err);
  }
};

export const recomputeRanking = async (req, res) => {
  try {
    res.json(await service.recomputeStageRanking(req.params.stageId));
  } catch (err) {
    handleError(res, err);
  }
};

export const essayAnswers = async (req, res) => {
  try {
    res.json(await service.getEssayAnswers(req.params.attemptId));
  } catch (err) {
    handleError(res, err);
  }
};

export const gradeEssayAnswer = async (req, res) => {
  try {
    res.json(await service.gradeEssayAnswer(req.params.answerId, req.body));
  } catch (err) {
    handleError(res, err);
  }
};

export const listRegisteredUsers = async (req, res) => {
  try {
    res.json(await service.listRegisteredUsers());
  } catch (err) {
    handleError(res, err);
  }
};
