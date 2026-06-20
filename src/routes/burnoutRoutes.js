/**
 * burnoutRoutes.js
 * GET /api/burnout
 *
 * Returns the current deterministic burnout score/level plus an optional
 * one-sentence Gemini-generated plain-language explanation. The number
 * itself NEVER comes from the AI - it's calculated by burnoutEngine.js so
 * it's reproducible, testable, and can't silently change because of a
 * prompt drift.
 */

const express = require('express');
const router = express.Router();

const storageService = require('../services/storageService');
const { calculateBurnout } = require('../services/burnoutEngine');
const geminiService = require('../services/geminiService');

router.get('/burnout', async (req, res, next) => {
  try {
    const last7 = storageService.getLastN(7);
    const { score, level, triggerPattern } = calculateBurnout(last7);

    let explanation = null;
    if (last7.length > 0) {
      explanation = await geminiService.explainBurnout(score, level, last7);
    }

    res.json({
      score,
      level,
      triggerPattern,
      explanation,
      sampleSize: last7.length
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
