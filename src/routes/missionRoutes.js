/**
 * missionRoutes.js
 * GET /api/mission
 *
 * Builds today's 4-minute micro-mission: local logic picks the TYPE
 * (deterministic, testable, avoids repeating yesterday's type), Gemini
 * generates the specific fresh content for that type.
 */

const express = require('express');
const router = express.Router();

const storageService = require('../services/storageService');
const { pickMissionType } = require('../services/missionGenerator');
const geminiService = require('../services/geminiService');

router.get('/mission', async (req, res, next) => {
  try {
    const todayEntries = storageService.getToday();
    const allEntries = storageService.readEntries();

    const latestToday = todayEntries[todayEntries.length - 1] || null;
    const emotions = latestToday ? latestToday.emotions || [] : [];
    const burnoutLevel = latestToday ? latestToday.burnoutLevel || 'safe' : 'safe';

    // Find yesterday's mission type, if any, to avoid repeating it.
    const yesterday = [...allEntries].reverse().find((e) => e.date !== storageService.getTodayISO());
    const yesterdayType = yesterday && yesterday.missionType ? yesterday.missionType : null;

    const missionType = pickMissionType(emotions, burnoutLevel, yesterdayType);
    const mission = await geminiService.generateMission(emotions, burnoutLevel, missionType);

    // Tag today's latest entry with the mission type so tomorrow's pick can avoid repeats.
    if (latestToday) {
      latestToday.missionType = mission.type;
    }

    res.json(mission);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
