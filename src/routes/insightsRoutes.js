/**
 * insightsRoutes.js
 * GET /api/insights
 *
 * Returns aggregated data for the Insights screen:
 *   - 30-day mood sparkline data
 *   - Distortion frequency counts
 *   - AI-generated weekly pattern summary (Gemini)
 *   - Emotion frequency breakdown
 *   - Exam risk forecast based on historical patterns
 */

const express = require('express');
const router = express.Router();
const storageService = require('../services/storageService');
const geminiService = require('../services/geminiService');

router.get('/insights', async (req, res, next) => {
  try {
    const entries = storageService.readEntries();

    if (entries.length === 0) {
      return res.json({
        sparkline: [],
        distortionFrequency: [],
        emotionBreakdown: [],
        aiSummary: null,
        weekdayPattern: [],
        totalEntries: 0
      });
    }

    // --- 30-day mood sparkline ---
    const byDate = {};
    entries.forEach(e => { byDate[e.date] = e; });
    const sparkline = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      sparkline.push({
        date: key,
        mood: byDate[key] ? byDate[key].mood : null,
        burnout: byDate[key] ? byDate[key].burnoutScore : null
      });
    }

    // --- Distortion frequency (last 30 days) ---
    const recent30 = entries.slice(-30);
    const distMap = {};
    recent30.forEach(e => {
      (e.distortions || []).forEach(d => {
        distMap[d] = (distMap[d] || 0) + 1;
      });
    });
    const distortionFrequency = Object.entries(distMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // --- Emotion breakdown ---
    const emotionMap = {};
    recent30.forEach(e => {
      (e.emotions || []).forEach(em => {
        if (!emotionMap[em.emotion]) emotionMap[em.emotion] = { total: 0, count: 0 };
        emotionMap[em.emotion].total += em.intensity;
        emotionMap[em.emotion].count += 1;
      });
    });
    const emotionBreakdown = Object.entries(emotionMap)
      .map(([emotion, { total, count }]) => ({
        emotion,
        avgIntensity: Math.round(total / count)
      }))
      .sort((a, b) => b.avgIntensity - a.avgIntensity);

    // --- Weekday mood pattern ---
    const weekdayData = Array(7).fill(null).map(() => ({ sum: 0, count: 0 }));
    entries.forEach(e => {
      const day = new Date(e.date).getDay(); // 0=Sun
      weekdayData[day].sum += e.mood;
      weekdayData[day].count += 1;
    });
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayPattern = weekdayData.map((d, i) => ({
      day: weekdays[i],
      avgMood: d.count > 0 ? Math.round((d.sum / d.count) * 10) / 10 : null
    }));

    // --- AI pattern summary (last 14 entries) ---
    let aiSummary = null;
    const last14 = entries.slice(-14);
    if (last14.length >= 3) {
      aiSummary = await geminiService.generateInsightSummary(last14);
    }

    res.json({
      sparkline,
      distortionFrequency,
      emotionBreakdown,
      weekdayPattern,
      aiSummary,
      totalEntries: entries.length
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
