/**
 * distortionClassifier.js
 *
 * Pure function, zero network calls. Detects common cognitive distortion
 * PATTERNS (a well-established CBT concept) in journal text using phrase
 * matching. This is a pattern detector for prompt-routing purposes only —
 * it does not diagnose any condition and makes no clinical claims.
 *
 * Powers the "Resilience Receipt" feature: when a distortion is detected,
 * the server looks up real counter-evidence from the student's own past
 * entries and asks Gemini to write a short, evidence-based rebuttal instead
 * of generic encouragement.
 */

const DISTORTION_PATTERNS = {
  catastrophizing: {
    phrases: [
      'my life is over', 'everything is ruined', 'i am finished', "i'm finished",
      'disaster', 'ruined my future', 'never recover', "it's all over",
      'its all over', 'worst thing'
    ],
    label: 'Catastrophizing',
    description: 'Treating a setback as a total, permanent disaster.'
  },
  allOrNothing: {
    phrases: [
      'always fail', 'never succeed', 'always mess up', 'every single time',
      'i never', 'i always', 'every time i', 'nothing ever works'
    ],
    label: 'All-or-Nothing Thinking',
    description: 'Seeing a single result as proof of a permanent, total pattern.'
  },
  mindReading: {
    phrases: [
      'everyone thinks', 'they all think', 'people think i', 'they probably think',
      'everyone can see', 'they must think', 'everyone is laughing'
    ],
    label: 'Mind Reading',
    description: "Assuming what others think without real evidence."
  },
  fortuneTelling: {
    phrases: [
      "i will fail", "i'm going to fail", 'going to fail the exam',
      "won't clear", "wont clear", 'never going to clear', 'definitely failing',
      "i know i will mess up"
    ],
    label: 'Fortune Telling',
    description: 'Predicting a negative future as certain fact.'
  },
  selfLabeling: {
    phrases: [
      'i am stupid', "i'm stupid", 'i am a failure', "i'm a failure",
      'a complete failure', 'such a failure', 'such a loser',
      'i am useless', "i'm useless", 'i am worthless', "i'm worthless",
      'i am the worst', "i'm the worst", 'i am dumb', "i'm dumb"
    ],
    label: 'Self-Labeling',
    description: 'Reducing your whole identity to one harsh label after one event.'
  },
  shouldStatements: {
    phrases: [
      'i should have', 'i should be able to', 'i must score', 'i have to be perfect',
      "i shouldn't have", "i shouldn't feel"
    ],
    label: 'Should Statements',
    description: 'Holding yourself to a rigid rule and feeling like a failure for missing it.'
  }
};

/**
 * @param {string} journalText
 * @returns {Array<{type: string, label: string, description: string, matchedPhrase: string}>}
 */
function detectDistortions(journalText) {
  if (!journalText || typeof journalText !== 'string') return [];
  const lower = journalText.toLowerCase();
  const found = [];

  for (const [type, config] of Object.entries(DISTORTION_PATTERNS)) {
    const match = config.phrases.find((phrase) => lower.includes(phrase));
    if (match) {
      found.push({
        type,
        label: config.label,
        description: config.description,
        matchedPhrase: match
      });
    }
  }

  return found;
}

/**
 * Returns true if at least one distortion pattern was found.
 * Used by the route layer to decide whether to spend a Gemini call
 * generating a Resilience Receipt (efficiency: skip the call when not needed).
 */
function hasDistortion(journalText) {
  return detectDistortions(journalText).length > 0;
}

module.exports = { detectDistortions, hasDistortion, DISTORTION_PATTERNS };
