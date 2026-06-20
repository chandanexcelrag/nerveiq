/**
 * studyRoutes.js
 * Handles planner and flashcard endpoints.
 */

const express = require('express');
const router = express.Router();
const geminiService = require('../services/geminiService');
const { validatePlanner, validateFlashcards } = require('../middleware/validate');

router.post('/planner', validatePlanner, async (req, res, next) => {
  try {
    const { syllabusPct, targetScore, hoursStudied, examTarget } = req.validatedBody;
    const tips = await geminiService.generateAIBurnoutPlanner(
      syllabusPct,
      targetScore,
      hoursStudied,
      examTarget
    );
    res.json({ tips });
  } catch (err) {
    next(err);
  }
});

router.post('/flashcards', validateFlashcards, async (req, res, next) => {
  try {
    const { topic } = req.validatedBody;
    const flashcards = await geminiService.generateAIStressFlashcards(topic);
    res.json({ flashcards });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
