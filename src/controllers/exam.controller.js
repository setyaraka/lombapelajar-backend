import * as examService from '../services/exam.service.js';

const handleError = (res, err) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
};

export const start = async (req, res) => {
  try {
    const data = await examService.startAttempt(req.user.id, req.body);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};

export const current = async (req, res) => {
  try {
    const data = await examService.getCurrentAttempt(req.user.id, req.query);
    if (!data) return res.status(404).json({ message: 'No active attempt' });
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};

export const nextAssignedExam = async (req, res) => {
  try {
    const data = await examService.getNextAssignedExam(req.user.id);
    res.json(data || { serverTime: new Date(), exam: null, status: 'EMPTY' });
  } catch (err) {
    handleError(res, err);
  }
};

export const answer = async (req, res) => {
  try {
    const data = await examService.saveAnswer(req.user.id, req.params.id, req.body);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};

export const lastQuestion = async (req, res) => {
  try {
    await examService.updateLastQuestion(req.user.id, req.params.id, req.body.questionId);
    res.json({ message: 'Last question saved' });
  } catch (err) {
    handleError(res, err);
  }
};

export const submit = async (req, res) => {
  try {
    const data = await examService.submitAttempt(req.user.id, req.params.id, req.body);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};

export const log = async (req, res) => {
  try {
    await examService.logAttemptActivity(
      req.user.id,
      req.params.id,
      req.body.event,
      req.body.metadata,
    );
    res.json({ message: 'Activity logged' });
  } catch (err) {
    handleError(res, err);
  }
};

export const result = async (req, res) => {
  try {
    const data = await examService.getResult(req.user.id, req.query);
    if (!data) return res.status(404).json({ message: 'Result not found' });
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
};
