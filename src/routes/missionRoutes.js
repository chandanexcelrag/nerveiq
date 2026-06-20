/**
 * missionRoutes.js
 * GET /api/mission
 * POST /api/mission
 *
 * Builds today's 4-minute micro-mission. Supports both GET and POST.
 * POST accepts { emotions, burnoutLevel, type } in body.
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

router.post('/mission', async (req, res, next) => {
  try {
    const { emotions, burnoutLevel, type } = req.body || {};

    let activeEmotions = emotions;
    let activeBurnoutLevel = burnoutLevel;
    let activeType = type;

    if (!activeEmotions || !activeBurnoutLevel) {
      const todayEntries = storageService.getToday();
      const latestToday = todayEntries[todayEntries.length - 1] || null;
      activeEmotions = activeEmotions || (latestToday ? latestToday.emotions || [] : []);
      activeBurnoutLevel = activeBurnoutLevel || (latestToday ? latestToday.burnoutLevel || 'safe' : 'safe');
    }

    if (!activeType) {
      const allEntries = storageService.readEntries();
      const yesterday = [...allEntries].reverse().find((e) => e.date !== storageService.getTodayISO());
      const yesterdayType = yesterday && yesterday.missionType ? yesterday.missionType : null;
      activeType = pickMissionType(activeEmotions, activeBurnoutLevel, yesterdayType);
    }

    const mission = await geminiService.generateMission(activeEmotions, activeBurnoutLevel, activeType);

    // Update today's latest entry if it exists
    const todayEntries = storageService.getToday();
    const latestToday = todayEntries[todayEntries.length - 1] || null;
    if (latestToday) {
      latestToday.missionType = mission.type;
    }

    res.json(mission);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
