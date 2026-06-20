/**
 * missionGenerator.js
 *
 * Decides WHICH TYPE of 4-minute micro-mission fits today's emotional state,
 * and ensures the type doesn't repeat from yesterday (variety). The actual
 * mission text/instructions are generated fresh by geminiService so they're
 * never copy-pasted boilerplate.
 */

const MISSION_TYPES = ['breathing', 'reframe', 'body-scan', 'gratitude', 'movement'];

/**
 * Picks the best-fit mission type given today's emotions + burnout level,
 * while avoiding yesterday's type when reasonably possible.
 *
 * @param {Array<{emotion:string, intensity:number}>} emotions
 * @param {string} burnoutLevel - 'safe' | 'watch' | 'danger'
 * @param {string|null} yesterdayType
 */
function pickMissionType(emotions, burnoutLevel, yesterdayType) {
  const top = emotions && emotions.length > 0 ? emotions[0].emotion : null;

  let preferred;
  if (burnoutLevel === 'danger') {
    preferred = 'breathing'; // grounding first when score is high
  } else if (top === 'anxiety') {
    preferred = 'breathing';
  } else if (top === 'selfDoubt' || top === 'hopelessness') {
    preferred = 'reframe';
  } else if (top === 'exhaustion') {
    preferred = 'body-scan';
  } else if (top === 'comparison') {
    preferred = 'gratitude';
  } else {
    preferred = 'movement';
  }

  if (preferred === yesterdayType) {
    // rotate to the next type in the list for variety
    const idx = MISSION_TYPES.indexOf(preferred);
    preferred = MISSION_TYPES[(idx + 1) % MISSION_TYPES.length];
  }

  return preferred;
}

module.exports = { pickMissionType, MISSION_TYPES };
