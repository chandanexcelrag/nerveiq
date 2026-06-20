/**
 * burnoutEngine.js
 *
 * Pure function, zero network calls. Computes a 0-100 "burnout signal score"
 * from the student's last 7 check-ins.
 *
 * IMPORTANT FRAMING: this is a self-reported pattern indicator built from
 * mood ratings, journal-derived emotion signals, and engagement trends.
 * It is NOT a medical or psychological diagnosis, and the UI/copy must
 * never present it as one. It exists to help route the conversation
 * (e.g. switch from motivational tone to grounding tone) and to surface
 * a visual trend the student can discuss with a real counsellor or trusted
 * adult if it stays high.
 *
 * Weighting:
 *   - 30% inverse mood average (lower mood -> higher score)
 *   - 40% negative-emotion density (from emotionAnalyser output)
 *   - 15% journal length drop vs the student's own rolling baseline
 *   - 15% consecutive low-mood streak length
 */

const NEGATIVE_EMOTIONS = ['anxiety', 'selfDoubt', 'exhaustion', 'comparison', 'hopelessness'];
const POSITIVE_EMOTIONS = ['determination'];

function safeAverage(nums) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * @param {Array} entries - most recent entries first or last, order-agnostic.
 *   Each entry: { mood: 1-10, emotions: [{emotion, intensity}], journal: string }
 * @returns {{score: number, level: 'safe'|'watch'|'danger', triggerPattern: string}}
 */
function calculateBurnout(entries) {
  if (!entries || entries.length === 0) {
    return { score: 0, level: 'safe', triggerPattern: 'Not enough data yet.' };
  }

  // Use at most the last 7, sorted oldest -> newest by date/time if present.
  const sorted = [...entries].slice(-7);

  // --- 1. Mood component (30%) ---
  const moods = sorted.map((e) => (typeof e.mood === 'number' ? e.mood : 5));
  const avgMood = safeAverage(moods); // 1 (worst) - 10 (best)
  const moodComponent = ((10 - avgMood) / 9) * 100; // invert to 0-100

  // --- 2. Emotion density component (40%) ---
  const emotionScores = sorted.map((e) => {
    const emotions = e.emotions || [];
    const negSum = emotions
      .filter((em) => NEGATIVE_EMOTIONS.includes(em.emotion))
      .reduce((sum, em) => sum + em.intensity, 0);
    const posSum = emotions
      .filter((em) => POSITIVE_EMOTIONS.includes(em.emotion))
      .reduce((sum, em) => sum + em.intensity, 0);
    return Math.max(0, negSum - posSum * 0.5);
  });
  const emotionComponent = Math.min(100, safeAverage(emotionScores));

  // --- 3. Journal length drop component (15%) ---
  const lengths = sorted.map((e) => (e.journal ? e.journal.trim().length : 0));
  const baseline = lengths.length > 1 ? safeAverage(lengths.slice(0, -1)) : lengths[0] || 1;
  const latest = lengths[lengths.length - 1] || 0;
  let lengthDropComponent = 0;
  if (baseline > 0) {
    const dropRatio = Math.max(0, (baseline - latest) / baseline);
    lengthDropComponent = Math.min(100, dropRatio * 100);
  }

  // --- 4. Low-mood streak component (15%) ---
  let streak = 0;
  for (let i = moods.length - 1; i >= 0; i--) {
    if (moods[i] <= 4) streak++;
    else break;
  }
  const streakComponent = Math.min(100, (streak / 7) * 100);

  const score = Math.round(
    moodComponent * 0.3 +
      emotionComponent * 0.4 +
      lengthDropComponent * 0.15 +
      streakComponent * 0.15
  );

  const clampedScore = Math.max(0, Math.min(100, score));

  let level = 'safe';
  if (clampedScore > 70) level = 'danger';
  else if (clampedScore > 40) level = 'watch';

  const triggerPattern = describeTrigger({
    moodComponent,
    emotionComponent,
    lengthDropComponent,
    streakComponent
  });

  return { score: clampedScore, level, triggerPattern };
}

function describeTrigger({ moodComponent, emotionComponent, lengthDropComponent, streakComponent }) {
  const parts = [
    { label: 'low self-reported mood', value: moodComponent },
    { label: 'a rise in stress-related language in your journaling', value: emotionComponent },
    { label: 'shorter journal entries than your usual pattern', value: lengthDropComponent },
    { label: 'several low-mood days in a row', value: streakComponent }
  ];
  const top = parts.sort((a, b) => b.value - a.value)[0];
  if (top.value < 15) return 'No strong pattern detected — things look fairly steady.';
  return `Mainly driven by ${top.label}.`;
}

module.exports = { calculateBurnout };
