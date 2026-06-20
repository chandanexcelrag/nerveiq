/**
 * tests/test.js
 *
 * Lightweight, dependency-free test runner for every PURE function in this
 * codebase. None of these tests call the network or need GEMINI_API_KEY -
 * that's deliberate: the deterministic logic (scoring, classification,
 * storage) must be verifiable in CI without any secret or network access.
 *
 * Run with: npm test
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { analyseEmotions, getDominantEmotion } = require('../src/services/emotionAnalyser');
const { detectDistortions, hasDistortion } = require('../src/services/distortionClassifier');
const { calculateBurnout } = require('../src/services/burnoutEngine');
const { buildSubjectMatrix } = require('../src/services/subjectMatrix');
const { buildEvidence } = require('../src/services/resilienceReceipt');
const { pickMissionType } = require('../src/services/missionGenerator');
const { sanitiseText, validatePlanner, validateFlashcards } = require('../src/middleware/validate');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${title}`);
}

// ===================== emotionAnalyser =====================
section('emotionAnalyser');

test('detects anxiety keywords', () => {
  const result = analyseEmotions("I'm so scared and anxious about tomorrow's mock test, I feel so nervous");
  const found = result.find((r) => r.emotion === 'anxiety');
  assert.ok(found, 'expected anxiety to be detected');
  assert.ok(found.intensity > 0);
});

test('detects self-doubt patterns', () => {
  const result = analyseEmotions("i can't do this anymore, not good enough, i always fail");
  const found = result.find((r) => r.emotion === 'selfDoubt' || r.emotion === 'hopelessness');
  assert.ok(found, 'expected selfDoubt or hopelessness to be detected');
});

test('returns empty array for neutral text', () => {
  const result = analyseEmotions('Today I studied chapter 4 of thermodynamics and revised some formulas.');
  assert.strictEqual(result.length, 0);
});

test('returns empty array for empty/invalid input', () => {
  assert.deepStrictEqual(analyseEmotions(''), []);
  assert.deepStrictEqual(analyseEmotions(null), []);
  assert.deepStrictEqual(analyseEmotions(undefined), []);
});

test('getDominantEmotion returns neutral when nothing detected', () => {
  assert.strictEqual(getDominantEmotion('I studied biology today.'), 'neutral');
});

test('negation softens a match rather than ignoring text entirely', () => {
  const negated = analyseEmotions('I am not scared at all about the exam, feeling fine.');
  const direct = analyseEmotions('I am scared about the exam, feeling scared.');
  const negatedScore = negated.find((r) => r.emotion === 'anxiety');
  const directScore = direct.find((r) => r.emotion === 'anxiety');
  assert.ok(!negatedScore || negatedScore.intensity < directScore.intensity);
});

// ===================== distortionClassifier =====================
section('distortionClassifier');

test('detects catastrophizing', () => {
  const result = detectDistortions('my life is over after this mock test, everything is ruined');
  assert.ok(result.some((d) => d.type === 'catastrophizing'));
});

test('detects all-or-nothing thinking', () => {
  const result = detectDistortions('I always fail at this, every single time I mess up');
  assert.ok(result.some((d) => d.type === 'allOrNothing'));
});

test('detects self-labeling', () => {
  const result = detectDistortions("I'm the worst, I am stupid");
  assert.ok(result.some((d) => d.type === 'selfLabeling'));
});

test('returns empty array for neutral text', () => {
  const result = detectDistortions('I studied chemistry for two hours today and took a short break.');
  assert.strictEqual(result.length, 0);
});

test('hasDistortion returns boolean correctly', () => {
  assert.strictEqual(hasDistortion('I am a complete failure'), true);
  assert.strictEqual(hasDistortion('Today was a normal study day.'), false);
});

// ===================== burnoutEngine =====================
section('burnoutEngine');

test('returns low score for all mood-10 entries', () => {
  const entries = Array.from({ length: 7 }, (_, i) => ({
    mood: 10,
    emotions: [{ emotion: 'determination', intensity: 80 }],
    journal: 'Feeling great today, studied well and feel confident about everything.'
  }));
  const result = calculateBurnout(entries);
  assert.ok(result.score < 20, `expected low score, got ${result.score}`);
  assert.strictEqual(result.level, 'safe');
});

test('returns high score for 7 days of mood-2 entries with negative emotions', () => {
  const entries = Array.from({ length: 7 }, () => ({
    mood: 2,
    emotions: [
      { emotion: 'hopelessness', intensity: 90 },
      { emotion: 'exhaustion', intensity: 85 }
    ],
    journal: 'tired'
  }));
  const result = calculateBurnout(entries);
  assert.ok(result.score > 70, `expected high score, got ${result.score}`);
  assert.strictEqual(result.level, 'danger');
});

test('handles empty entries array without crashing', () => {
  const result = calculateBurnout([]);
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.level, 'safe');
});

test('weights journal length drop correctly', () => {
  const entries = [
    { mood: 7, emotions: [], journal: 'A fairly long journal entry written today about my study session and feelings.' },
    { mood: 7, emotions: [], journal: 'A fairly long journal entry written today about my study session and feelings.' },
    { mood: 7, emotions: [], journal: 'ok' } // sudden drop in length
  ];
  const result = calculateBurnout(entries);
  assert.ok(result.score >= 0 && result.score <= 100);
});

test('score is always clamped between 0 and 100', () => {
  const entries = Array.from({ length: 7 }, () => ({
    mood: 1,
    emotions: [
      { emotion: 'hopelessness', intensity: 100 },
      { emotion: 'anxiety', intensity: 100 },
      { emotion: 'exhaustion', intensity: 100 }
    ],
    journal: ''
  }));
  const result = calculateBurnout(entries);
  assert.ok(result.score >= 0 && result.score <= 100);
});

// ===================== subjectMatrix =====================
section('subjectMatrix');

test('ranks subjects correctly, worst first', () => {
  const entries = [
    { subject: 'Physics', burnoutScore: 80 },
    { subject: 'Biology', burnoutScore: 20 },
    { subject: 'Physics', burnoutScore: 70 },
    { subject: 'Biology', burnoutScore: 10 }
  ];
  const { ranked } = buildSubjectMatrix(entries);
  assert.strictEqual(ranked[0].subject, 'Physics');
  assert.strictEqual(ranked[ranked.length - 1].subject, 'Biology');
});

test('handles single-subject entries', () => {
  const entries = [{ subject: 'Maths', burnoutScore: 50 }];
  const { matrix } = buildSubjectMatrix(entries);
  assert.strictEqual(matrix.Maths, 50);
});

test('handles empty entries array', () => {
  const { matrix, ranked } = buildSubjectMatrix([]);
  assert.deepStrictEqual(matrix, {});
  assert.deepStrictEqual(ranked, []);
});

test('defaults missing subject to General', () => {
  const entries = [{ burnoutScore: 30 }];
  const { matrix } = buildSubjectMatrix(entries);
  assert.strictEqual(matrix.General, 30);
});

// ===================== resilienceReceipt =====================
section('resilienceReceipt (evidence builder)');

test('returns null when no distortion detected', () => {
  const result = buildEvidence([{ id: 1, date: '2026-01-01', mood: 5 }], []);
  assert.strictEqual(result, null);
});

test('returns null when not enough history exists', () => {
  const result = buildEvidence(
    [{ id: 1, date: '2026-06-20', mood: 3 }],
    [{ type: 'catastrophizing', label: 'Catastrophizing', description: 'x' }]
  );
  assert.strictEqual(result, null);
});

test('builds evidence when a past similar entry and a meaningful recovery exist', () => {
  const entries = [
    { id: 1, date: '2026-05-01', mood: 3, distortions: [{ type: 'catastrophizing' }] },
    { id: 2, date: '2026-05-02', mood: 4 }, // small uptick - not a real recovery
    { id: 3, date: '2026-05-03', mood: 8 } // real recovery (>=2 point jump from matched entry)
  ];
  const result = buildEvidence(entries, [{ type: 'catastrophizing', label: 'Catastrophizing', description: 'x' }]);
  assert.ok(result);
  assert.strictEqual(result.pastSimilarDate, '2026-05-01');
  assert.strictEqual(result.recoveryDate, '2026-05-03');
});

test('falls back to subject improvement evidence when no distortion history match', () => {
  const entries = [
    { id: 1, date: '2026-05-01', mood: 5, subject: 'Physics', burnoutScore: 80 },
    { id: 2, date: '2026-05-02', mood: 6, subject: 'Physics', burnoutScore: 40 }
  ];
  const result = buildEvidence(entries, [{ type: 'fortuneTelling', label: 'Fortune Telling', description: 'x' }]);
  assert.ok(result);
  assert.ok(result.subjectImprovement);
  assert.strictEqual(result.subjectImprovement.subject, 'Physics');
});

// ===================== missionGenerator =====================
section('missionGenerator');

test('picks breathing for high burnout regardless of emotion', () => {
  const type = pickMissionType([{ emotion: 'determination', intensity: 50 }], 'danger', null);
  assert.strictEqual(type, 'breathing');
});

test('picks reframe for selfDoubt dominant emotion', () => {
  const type = pickMissionType([{ emotion: 'selfDoubt', intensity: 70 }], 'watch', null);
  assert.strictEqual(type, 'reframe');
});

test('avoids repeating yesterday\'s type', () => {
  const type = pickMissionType([{ emotion: 'anxiety', intensity: 60 }], 'watch', 'breathing');
  assert.notStrictEqual(type, 'breathing');
});

// ===================== validate (sanitiseText) =====================
section('validate.sanitiseText');

test('strips control characters but keeps normal punctuation', () => {
  const dirty = 'Hello\u0000 World\u000B!';
  const clean = sanitiseText(dirty);
  assert.strictEqual(clean, 'Hello World!');
});

test('trims surrounding whitespace', () => {
  assert.strictEqual(sanitiseText('   hi there   '), 'hi there');
});

test('returns empty string for non-string input', () => {
  assert.strictEqual(sanitiseText(null), '');
  assert.strictEqual(sanitiseText(undefined), '');
  assert.strictEqual(sanitiseText(42), '');
});

// ===================== validate (validatePlanner / validateFlashcards) =====================
section('validate.js middleware');

test('validatePlanner approves valid input', () => {
  const req = {
    body: {
      syllabusPct: 80,
      targetScore: 95,
      hoursStudied: 8,
      examTarget: 'JEE'
    }
  };
  let nextCalled = false;
  const res = {};
  const next = () => { nextCalled = true; };

  validatePlanner(req, res, next);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.validatedBody.syllabusPct, 80);
  assert.strictEqual(req.validatedBody.targetScore, 95);
  assert.strictEqual(req.validatedBody.hoursStudied, 8);
  assert.strictEqual(req.validatedBody.examTarget, 'JEE');
});

test('validatePlanner rejects invalid syllabusPct', () => {
  const req = { body: { syllabusPct: 150 } };
  let statusSet = null;
  let jsonSent = null;
  const res = {
    status(s) {
      statusSet = s;
      return this;
    },
    json(j) {
      jsonSent = j;
    }
  };
  const next = () => {};

  validatePlanner(req, res, next);
  assert.strictEqual(statusSet, 400);
  assert.ok(jsonSent.error);
});

test('validateFlashcards approves valid topic', () => {
  const req = { body: { topic: '   Organic Chemistry Revision  ' } };
  let nextCalled = false;
  const res = {};
  const next = () => { nextCalled = true; };

  validateFlashcards(req, res, next);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.validatedBody.topic, 'Organic Chemistry Revision');
});

test('validateFlashcards rejects missing topic', () => {
  const req = { body: {} };
  let statusSet = null;
  const res = {
    status(s) {
      statusSet = s;
      return this;
    },
    json() {}
  };
  const next = () => {};

  validateFlashcards(req, res, next);
  assert.strictEqual(statusSet, 400);
});

// ===================== burnoutEngine edge cases =====================
section('burnoutEngine edge cases');

test('burnoutEngine handles entries with null or missing mood gracefully', () => {
  const entries = [{ journal: 'No mood' }];
  const result = calculateBurnout(entries);
  // Default mood fallback is 5, which yields a calculated base score of 17
  assert.strictEqual(result.score, 17);
  assert.strictEqual(result.level, 'safe');
});

// ===================== distortionClassifier edge cases =====================
section('distortionClassifier edge cases');

test('detects multiple distortions in a single complex sentence', () => {
  const text = "I am a complete failure and I know I will fail the NEET exam tomorrow, everything is ruined.";
  const result = detectDistortions(text);
  const types = result.map(d => d.type);
  assert.ok(types.includes('selfLabeling'));
  assert.ok(types.includes('fortuneTelling'));
  assert.ok(types.includes('catastrophizing'));
});

// ===================== Summary =====================
console.log(`\n${'-'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log('-'.repeat(40));

if (failed > 0) {
  process.exit(1);
}
