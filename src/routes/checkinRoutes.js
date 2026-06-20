/**
 * checkinRoutes.js
 * POST /api/checkin
 *
 * Flow: validate -> local emotion pre-filter -> local distortion scan ->
 * Gemini emotion refine + (conditionally) Resilience Receipt -> burnout
 * score -> save -> respond.
 *
 * Efficiency note: the Resilience Receipt Gemini call only fires when
 * BOTH a distortion is detected locally AND there's enough history to
 * build real evidence - this avoids wasted API calls on neutral entries
 * or brand-new students with no history yet.
 */

const express = require('express');
const router = express.Router();

const { validateCheckin } = require('../middleware/validate');
const { analyseEmotions } = require('../services/emotionAnalyser');
const { detectDistortions } = require('../services/distortionClassifier');
const { calculateBurnout } = require('../services/burnoutEngine');
const { buildEvidence } = require('../services/resilienceReceipt');
const storageService = require('../services/storageService');
const geminiService = require('../services/geminiService');

router.post('/checkin', validateCheckin, async (req, res, next) => {
  try {
    const { mood, journal, subject, examTarget, daysLeft } = req.validatedBody;

    const localEmotions = analyseEmotions(journal);
    const distortions = detectDistortions(journal);

    // Refine emotions with Gemini (fails soft to localEmotions if API errors).
    const emotions = await geminiService.extractEmotions(journal, localEmotions);

    const priorEntries = storageService.readEntries();
    const recentWindow = [...priorEntries.slice(-6), { mood, emotions, journal }];
    const { score, level, triggerPattern } = calculateBurnout(recentWindow);

    let receipt = null;
    if (distortions.length > 0) {
      const evidence = buildEvidence(priorEntries, distortions);
      if (evidence) {
        const receiptText = await geminiService.generateReceipt(evidence, journal);
        receipt = { evidence, text: receiptText };
      }
    }

    const entry = {
      id: Date.now(),
      date: storageService.getTodayISO(),
      time: new Date().toISOString().slice(11, 16),
      mood,
      journal,
      subject,
      examTarget,
      daysLeft,
      emotions,
      distortions,
      burnoutScore: score,
      burnoutLevel: level,
      missionCompleted: false
    };

    storageService.writeEntry(entry);

    res.status(201).json({
      entryId: entry.id,
      emotions,
      burnoutScore: score,
      burnoutLevel: level,
      triggerPattern,
      receipt
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
