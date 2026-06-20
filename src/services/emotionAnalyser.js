/**
 * emotionAnalyser.js
 *
 * Pure function, zero network calls. Scans free-text journal entries for
 * lexical signals of six target emotions. This runs BEFORE the Gemini call
 * so the AI prompt can be pre-seeded with a structured hint instead of
 * guessing from scratch — cheaper, faster, and more consistent.
 *
 * Deliberately NOT a clinical or diagnostic tool. It is a lightweight
 * signal detector to make the AI prompt more targeted. Intensity is a
 * heuristic 0-100 score based on keyword density + simple negation handling,
 * not a validated psychometric instrument.
 */

const EMOTION_LEXICON = {
  anxiety: [
    'scared', 'afraid', 'nervous', 'anxious', 'panic', 'worried', 'worry',
    'what if', 'cant breathe', "can't breathe", 'racing thoughts', 'dread',
    'tense', 'on edge', 'overwhelmed', 'overwhelming'
  ],
  selfDoubt: [
    "i can't do this", 'not good enough', 'i suck', 'i am stupid', "i'm stupid",
    'never going to', "won't make it", 'not smart enough', 'i am the worst',
    "i'm the worst", 'everyone is better', 'others are better', 'no point',
    "what's the point", 'whats the point', 'i always fail', 'i always mess up'
  ],
  exhaustion: [
    'tired', 'exhausted', 'drained', 'burnt out', 'burned out', 'no energy',
    "can't focus", 'cant focus', 'sleepy', 'sleep deprived', 'no sleep',
    'cant keep up', "can't keep up", 'so done', 'done with this'
  ],
  comparison: [
    'everyone else', 'my friends are', 'topper', 'rank', 'better than me',
    'ahead of me', 'behind everyone', 'compared to', 'comparing myself'
  ],
  hopelessness: [
    "what's even the point", 'whats even the point', 'no use', 'pointless',
    'give up', 'giving up', "can't anymore", "can't do this anymore",
    'nothing matters', 'why bother', 'failed again', 'failing again',
    'never going to clear', 'never make it'
  ],
  determination: [
    'i will', "i'll get there", 'one more try', 'not giving up', 'keep going',
    'push through', 'i can do this', 'i got this', 'better than yesterday',
    'improving', 'improved', 'proud of myself', 'small win', 'one step'
  ]
};

const NEGATORS = ['not', "don't", 'dont', "didn't", 'didnt', 'never', 'no'];

/**
 * Counts lexicon hits for one emotion category in lowercased text.
 * Applies a simple negation check: if a negator appears within 3 words
 * before the phrase, the hit is discounted rather than counted at full weight.
 */
function scoreCategory(lowerText, phrases) {
  let hits = 0;
  for (const phrase of phrases) {
    let searchFrom = 0;
    while (true) {
      const idx = lowerText.indexOf(phrase, searchFrom);
      if (idx === -1) break;

      const precedingWindow = lowerText.slice(Math.max(0, idx - 20), idx);
      const isNegated = NEGATORS.some((neg) =>
        precedingWindow.split(' ').includes(neg)
      );

      hits += isNegated ? 0.3 : 1;
      searchFrom = idx + phrase.length;
    }
  }
  return hits;
}

/**
 * @param {string} journalText - raw free-text journal entry
 * @returns {Array<{emotion: string, intensity: number}>}
 *   Sorted descending by intensity. Only emotions with intensity > 0 included.
 */
function analyseEmotions(journalText) {
  if (!journalText || typeof journalText !== 'string') return [];

  const lower = journalText.toLowerCase();
  const wordCount = Math.max(lower.trim().split(/\s+/).length, 1);

  const results = Object.entries(EMOTION_LEXICON).map(([emotion, phrases]) => {
    const rawHits = scoreCategory(lower, phrases);
    // Normalise against text length so a long entry doesn't auto-max every score.
    const density = rawHits / Math.sqrt(wordCount);
    const intensity = Math.min(100, Math.round(density * 55));
    return { emotion, intensity };
  });

  return results
    .filter((r) => r.intensity > 0)
    .sort((a, b) => b.intensity - a.intensity);
}

/**
 * Convenience helper: returns just the top emotion label, or 'neutral'.
 */
function getDominantEmotion(journalText) {
  const emotions = analyseEmotions(journalText);
  return emotions.length > 0 ? emotions[0].emotion : 'neutral';
}

module.exports = { analyseEmotions, getDominantEmotion, EMOTION_LEXICON };
