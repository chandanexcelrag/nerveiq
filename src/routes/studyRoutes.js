/**
 * studyRoutes.js
 * Handles planner and flashcard endpoints.
 */

const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');

router.post('/planner', async (req, res, next) => {
  try {
    const { syllabusPct, targetScore, hoursStudied, examTarget } = req.body;
    const tips = await geminiService.generateAIBurnoutPlanner(
      Number(syllabusPct) || 0,
      Number(targetScore) || 0,
      Number(hoursStudied) || 0,
      examTarget
    );
    res.json({ tips });
  } catch (err) {
    next(err);
  }
});

router.post('/flashcards', async (req, res, next) => {
  try {
    const { topic } = req.body;
    const flashcards = await geminiService.generateAIStressFlashcards(topic);
    res.json({ flashcards });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
