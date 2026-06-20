/**
 * nerveMapRoutes.js
 * GET /api/nervemap
 *
 * Returns everything the frontend needs to draw the 30-day SVG heatmap,
 * the subject stress matrix, and streak counters. All computed by pure
 * functions (subjectMatrix.js) over stored entries - no AI call needed,
 * keeps this endpoint fast and free.
 */

const express = require('express');
const router = express.Router();

const storageService = require('../services/storageService');
const { buildSubjectMatrix } = require('../services/subjectMatrix');

function computeStreaks(entries) {
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  let currentGreen = 0;
  let longestGreen = 0;
  let running = 0;

  for (const e of sorted) {
    const isGreen = (e.burnoutLevel || 'safe') === 'safe';
    if (isGreen) {
      running++;
      longestGreen = Math.max(longestGreen, running);
    } else {
      running = 0;
    }
  }
  // current streak = trailing run from the end
  for (let i = sorted.length - 1; i >= 0; i--) {
    if ((sorted[i].burnoutLevel || 'safe') === 'safe') currentGreen++;
    else break;
  }

  return { currentGreen, longestGreen };
}

router.get('/nervemap', (req, res, next) => {
  try {
    const entries = storageService.getByDateRange(30);

    const heatmap = entries.map((e) => ({
      date: e.date,
      score: e.burnoutScore ?? null,
      level: e.burnoutLevel ?? 'safe',
      mood: e.mood ?? null,
      subject: e.subject ?? null
    }));

    const { matrix, ranked } = buildSubjectMatrix(entries);
    const streaks = computeStreaks(entries);

    res.json({
      heatmap,
      subjectMatrix: matrix,
      subjectRanked: ranked,
      streaks,
      totalEntries: entries.length
    });
  } catch (err) {
    next(err);
  }
});

router.computeStreaks = computeStreaks;
module.exports = router;
