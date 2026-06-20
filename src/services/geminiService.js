/**
 * geminiService.js
 *
 * The ONLY file in this codebase that talks to the Gemini API.
 * Keeping every prompt in one place makes the AI surface auditable:
 * anyone reviewing this project for safety/security can read this file
 * top to bottom and see every instruction the model is ever given.
 *
 * SECURITY NOTES:
 *  - Raw journal text is sent to Google's Gemini API for processing (this is
 *    required for the feature to work) but is NEVER written to server logs,
 *    NEVER stored anywhere except data/entries.json on this server, and
 *    NEVER sent to any third party other than Google's Gemini endpoint.
 *  - Every system prompt explicitly forbids clinical diagnosis language and
 *    instructs the model to escalate to "talk to a trusted adult / counsellor"
 *    framing when distress signals are severe (see CRISIS_GUARDRAIL below).
 *  - All ten functions fail soft: if the Gemini call errors out, callers
 *    get a safe fallback object/string instead of a crash, so a flaky network
 *    never takes down check-in or storage.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-3.5-flash';

let primaryClient = null;
let fallbackClient = null;

/**
 * Initializes and returns the primary Gemini client.
 * Falls back to using the fallback key if the primary key is not set.
 * @returns {GoogleGenerativeAI} The initialized Google Generative AI client.
 */
function getPrimaryClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;
    if (fallbackKey) {
      if (!fallbackClient) {
        fallbackClient = new GoogleGenerativeAI(fallbackKey);
      }
      return fallbackClient;
    }
    throw new Error('Neither GEMINI_API_KEY nor GEMINI_API_KEY_FALLBACK is set.');
  }
  if (!primaryClient) {
    primaryClient = new GoogleGenerativeAI(key);
  }
  return primaryClient;
}

/**
 * Initializes and returns the fallback Gemini client if a fallback key is available.
 * @returns {GoogleGenerativeAI|null} The fallback client, or null if not configured/redundant.
 */
function getFallbackClient() {
  const key = process.env.GEMINI_API_KEY_FALLBACK;
  if (!key) {
    return null;
  }
  // If the fallback key matches primary, avoid redundant instantiation/retries
  if (key === process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!fallbackClient) {
    fallbackClient = new GoogleGenerativeAI(key);
  }
  return fallbackClient;
}

/**
 * Wraps a Gemini API call with automatic fallback retry on 429 quota error.
 * @template T
 * @param {function(GoogleGenerativeAI): Promise<T>} apiCall - A function executing the API call.
 * @returns {Promise<T>} The result of the API call.
 */
async function withFallback(apiCall) {
  try {
    const activeClient = getPrimaryClient();
    return await apiCall(activeClient);
  } catch (err) {
    const isQuota = err && (
      err.status === 429 ||
      (err.message && (
        err.message.includes('429') ||
        err.message.includes('Quota') ||
        err.message.includes('quota') ||
        err.message.includes('ResourceExhausted') ||
        err.message.includes('limit')
      ))
    );
    if (isQuota) {
      const fallback = getFallbackClient();
      if (fallback) {
        // eslint-disable-next-line no-console
        console.warn('Gemini primary quota exceeded, retrying with fallback API key.');
        return await apiCall(fallback);
      }
    }
    throw err;
  }
}

/**
 * Safely parses JSON from text, stripping markdown code blocks if necessary.
 * @param {string} text - The raw text from the model.
 * @param {*} fallback - The fallback value if parsing fails.
 * @returns {*} The parsed JSON object/array or the fallback.
 */
function safeParseJSON(text, fallback) {
  if (typeof text !== 'string') return fallback;
  const cleaned = text.trim().replace(/^```json|```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    return fallback;
  }
}

const CRISIS_GUARDRAIL = `
Safety rules you must always follow:
- You are a peer-style companion, NOT a therapist, doctor, or crisis counsellor.
- Never diagnose any mental health condition.
- If the student's words suggest thoughts of self-harm, suicide, or that they may be in
  danger, do NOT continue with coping tips. Instead respond with direct, warm concern,
  encourage them to reach out right now to a trusted adult, parent, teacher, or a local
  crisis helpline, and keep your reply short and grounding rather than analytical.
- Never shame, mock, or minimise what the student is feeling.
`;

/**
 * 1. Extract emotions as structured JSON.
 * Used as a secondary, deeper pass after the local emotionAnalyser pre-filter.
 * @param {string} journalText - The raw student check-in text.
 * @param {Array<Object>} preDetected - Initial candidate emotions from local keyword matcher.
 * @returns {Promise<Array<Object>>} Resolved list of emotion objects.
 */
async function extractEmotions(journalText, preDetected) {
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const prompt = `${CRISIS_GUARDRAIL}
Analyse this student's journal entry and return ONLY a JSON array (no markdown, no
backticks, no commentary) of up to 4 emotions present, each as
{"emotion": "<one of: anxiety, selfDoubt, exhaustion, comparison, hopelessness, determination>", "intensity": <0-100 integer>}.

A lightweight keyword pre-filter already found these candidate signals: ${JSON.stringify(
        preDetected
      )}. Use them as a hint, but make your own judgment from the full text.

Journal entry:
"""${journalText}"""`;

      const result = await model.generateContent(prompt);
      const parsed = safeParseJSON(result.response.text(), null);
      return Array.isArray(parsed) ? parsed : (preDetected || []);
    });
  } catch (err) {
    return preDetected || [];
  }
}

/**
 * 2. Score burnout reasoning (qualitative explanation layer on top of the
 * deterministic numeric score from burnoutEngine.js).
 * @param {number} score - Deterministic numeric burnout score (0-100).
 * @param {string} level - Level tag (safe/watch/danger).
 * @param {Array<Object>} last7Entries - Historic entries for context.
 * @returns {Promise<string|null>} Brief explanatory text from the model.
 */
async function explainBurnout(score, level, last7Entries) {
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const historySummary = last7Entries
        .map((e) => `Date ${e.date}: mood ${e.mood}/10, subject ${e.subject || 'n/a'}`)
        .join('\n');

      const prompt = `${CRISIS_GUARDRAIL}
A deterministic scoring engine (not you) calculated this student's burnout signal score
as ${score}/100 (level: ${level}) from their last ${last7Entries.length} check-ins below.
Write ONE short sentence (max 25 words) in a warm, non-clinical tone explaining the
pattern in plain language. Do not invent numbers. Do not use the word "diagnosis".

History:
${historySummary}`;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    });
  } catch (err) {
    return null;
  }
}

/**
 * 3. Streaming chat response in "Exam Senior" voice.
 * Returns an async generator of text chunks for SSE piping.
 * @param {string} message - Current student message.
 * @param {string} historyContext - Stringified recent history summary.
 * @param {string} examTarget - Name of target exam.
 * @param {number|null} daysLeft - Days remaining until target exam.
 * @returns {AsyncGenerator<string, void, unknown>} Text chunks stream.
 */
async function* streamChat(message, historyContext, examTarget, daysLeft) {
  const runStream = async (activeClient) => {
    const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
    const systemPrompt = `${CRISIS_GUARDRAIL}
You are playing the role of a senior who cleared ${examTarget || 'a competitive exam'} about
two years ago and now mentors students preparing for it. Voice rules:
- Talk like a real person texting a junior, not a wellness app or a corporate chatbot.
- Be warm, a little funny when appropriate, never preachy, never use generic phrases like
  "I understand how you feel" or "it's okay to feel this way" as a crutch.
- Reference the student's actual history below when relevant - specifics, not platitudes.
- Keep replies under 90 words unless the student clearly wants to talk longer.
- This student has ${daysLeft != null ? daysLeft : 'an unknown number of'} days left until their exam.

Student's recent history:
${historyContext || 'No history yet - this is a new student.'}`;

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Got it. I will respond as that senior, grounded in their real history.' }] }
      ]
    });

    return await chat.sendMessageStream(message);
  };

  try {
    const result = await withFallback(runStream);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (err) {
    yield "Hey, my connection glitched for a second - I'm still here. Can you send that again?";
  }
}

/**
 * 4. Generate a fresh 4-minute micro-mission given today's emotional signal.
 * @param {Array<Object>} emotions - Active emotions list.
 * @param {string} burnoutLevel - The student's current burnout level.
 * @param {string} missionType - Category (breathing, writing, reframe).
 * @returns {Promise<Object>} Formatted mission object.
 */
async function generateMission(emotions, burnoutLevel, missionType) {
  const defaultMission = {
    title: 'Reset Breath',
    duration: '4 minutes',
    type: missionType || 'breathing',
    instructions: [
      'Sit somewhere quiet and set a 4-minute timer.',
      'Breathe in for 4 counts, hold for 4, out for 6 - repeat for the full timer.',
      'When the timer ends, write one word for how you feel now.'
    ]
  };
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const topEmotion = emotions && emotions.length > 0 ? emotions[0].emotion : 'neutral';

      const prompt = `${CRISIS_GUARDRAIL}
Create ONE unique 4-minute wellness mission of type "${missionType}" for a student whose
dominant detected emotion right now is "${topEmotion}" and whose burnout level is "${burnoutLevel}".
It must NOT be generic ("just breathe deeply") - be concrete and specific, something they
physically do or write in the next 4 minutes.
Return ONLY JSON, no markdown fences, no commentary, in this exact shape:
{"title": "<short punchy title>", "duration": "4 minutes", "type": "${missionType}", "instructions": ["step 1", "step 2", "step 3"]}`;

      const result = await model.generateContent(prompt);
      const parsed = safeParseJSON(result.response.text(), null);
      if (parsed && parsed.title && Array.isArray(parsed.instructions)) {
        return parsed;
      }
      return defaultMission;
    });
  } catch (err) {
    return defaultMission;
  }
}

/**
 * 5. Subject-specific insight using the student's own subject stress matrix.
 * @param {string} subject - Name of the subject.
 * @param {Array<Object>} subjectEntries - Check-in history filtered to this subject.
 * @returns {Promise<string>} Observation insight text.
 */
async function subjectInsight(subject, subjectEntries) {
  const fallbackInsight = `Your ${subject} sessions are logged and tracked - keep going, the pattern will get clearer over time.`;
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const trend = subjectEntries
        .map((e) => `${e.date}: mood ${e.mood}/10`)
        .join(', ');

      const prompt = `${CRISIS_GUARDRAIL}
In one short sentence (max 30 words), give this student a specific, encouraging, factual
observation about their pattern with "${subject}" based on this real trend data: ${trend}.
Do not invent numbers not present in the data. Sound like a peer, not a report.`;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    });
  } catch (err) {
    return fallbackInsight;
  }
}

/**
 * 6. Resilience Receipt - turns structured counter-evidence into rebuttal.
 * @param {Object} evidence - The structured counter-evidence metadata.
 * @param {string} journalText - The journal context.
 * @returns {Promise<string>} The resilience receipt text.
 */
async function generateReceipt(evidence, journalText) {
  const fallbackReceipt = "Here's a fact your own history shows: you have felt this exact way before, and you kept going anyway. That pattern is still true today.";
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });

      const prompt = `${CRISIS_GUARDRAIL}
The student just wrote something showing a "${evidence.distortionLabel}" thinking pattern
(${evidence.distortionDescription}). Here is REAL evidence from their own history - use
ONLY these facts, do not invent any number or date not given here:

${evidence.pastSimilarDate ? `- They felt similarly on ${evidence.pastSimilarDate}.` : ''}
${evidence.recoveryDate ? `- By ${evidence.recoveryDate} their mood/score had measurably improved.` : ''}
${
  evidence.subjectImprovement
    ? `- Their stress signal for ${evidence.subjectImprovement.subject} improved from ${evidence.subjectImprovement.from} to ${evidence.subjectImprovement.to}.`
    : ''
}

Write a short "receipt" (max 50 words) addressed directly to the student, in second person,
calm and factual - like presenting them evidence, not cheering them up. End with one
grounded short sentence, not a question.

Original entry for context only (do not quote it back): "${journalText}"`;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    });
  } catch (err) {
    return fallbackReceipt;
  }
}

/**
 * 7. Weekly AI Insight Summary — reads last 14 entries and generates summary.
 * @param {Array<Object>} entries - The student's 14 recent entries.
 * @returns {Promise<string|null>} 2-sentence pattern summary or null.
 */
async function generateInsightSummary(entries) {
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const summary = entries.map(e =>
        `${e.date}: mood ${e.mood}/10, burnout ${e.burnoutScore ?? 'n/a'}/100, subject ${e.subject || 'n/a'}, emotions [${(e.emotions || []).map(em => em.emotion).join(', ')}]`
      ).join('\n');

      const prompt = `${CRISIS_GUARDRAIL}
You are analysing the last ${entries.length} check-ins of a student preparing for a competitive exam.
Write exactly 2 short sentences (total max 60 words) as a warm, perceptive observation about their
overall pattern — like a friend who noticed something specific. Focus on ONE real pattern from the data.
Do not use generic phrases. Do not use the word "you seem" or "it appears".

Data:\n${summary}`;

      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    });
  } catch (err) {
    return null;
  }
}

/**
 * 8. Smart Study Plan — generates focus topic recommendations.
 * @param {Array<Object>} subjectMatrix - Subject stress information.
 * @param {number} daysLeft - Days left to exam.
 * @param {string} examTarget - Name of the exam.
 * @returns {Promise<Array<Object>>} Structured study tips array.
 */
async function generateStudyPlan(subjectMatrix, daysLeft, examTarget) {
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const matrixText = (subjectMatrix || []).map(s =>
        `${s.subject}: avg burnout ${s.avgScore}/100 over ${s.entryCount} sessions`
      ).join('\n');

      const prompt = `${CRISIS_GUARDRAIL}
A student preparing for ${examTarget || 'competitive exams'} has ${daysLeft ?? 'unknown'} days left.
Their subject stress data (higher score = more stressed):
${matrixText || 'No data yet.'}

Return ONLY a JSON array (no markdown, no commentary) of 3 focus recommendations in this shape:
[{"subject": "Physics", "priority": "high", "tip": "one specific 15-word action tip", "emoji": "⚡"}]
Priority must be one of: high, medium, low.`;

      const result = await model.generateContent(prompt);
      const parsed = safeParseJSON(result.response.text(), []);
      return Array.isArray(parsed) ? parsed : [];
    });
  } catch (err) {
    return [];
  }
}

/**
 * 9. AI Study Stress Planner recommendations based on study metrics.
 * @param {number} syllabusPct - Completed syllabus percentage.
 * @param {number} targetScore - Target score goal percentage.
 * @param {number} hoursStudied - Average hours studied per day.
 * @param {string} examTarget - Name of target exam.
 * @returns {Promise<Array<string>>} Recommendation strings.
 */
async function generateAIBurnoutPlanner(syllabusPct, targetScore, hoursStudied, examTarget) {
  const defaultPlanner = [
    "Prioritize 7-8 hours of sleep to retain complex concepts.",
    "Break intensive study sessions down using a 45/15 Pomodoro schedule."
  ];
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const prompt = `${CRISIS_GUARDRAIL}
A student preparing for ${examTarget || 'competitive exams'} shares these metrics:
- Syllabus completion: ${syllabusPct}%
- Target score: ${targetScore}%
- Daily study time: ${hoursStudied} hours

Give exactly 2 action-focused tips (max 20 words each) recommending how they can manage exam anxiety, balance syllabus goals, and stay mentally fit.
Return only a JSON array of strings, e.g. ["Tip 1", "Tip 2"]. No markdown.`;

      const result = await model.generateContent(prompt);
      const parsed = safeParseJSON(result.response.text(), defaultPlanner);
      return Array.isArray(parsed) ? parsed : defaultPlanner;
    });
  } catch (err) {
    return defaultPlanner;
  }
}

/**
 * 10. AI Stress Flashcards generator.
 * @param {string} topic - Anxious topic description.
 * @returns {Promise<Array<Object>>} Formatted coping flashcards.
 */
async function generateAIStressFlashcards(topic) {
  const defaultFlashcards = [
    { front: `Worried about scoring well in ${topic}?`, back: "Break it down into micro-topics and master one formula at a time. Progress is incremental." },
    { front: `Running out of time for ${topic}?`, back: "Focus exclusively on previous years' questions (PYQs) to maximize yield instead of rereading textbooks." },
    { front: "Feeling completely overwhelmed?", back: "Take a 5-minute break. Your brain processes complex memory structures during intervals of rest." }
  ];
  try {
    return await withFallback(async (activeClient) => {
      const model = activeClient.getGenerativeModel({ model: MODEL_NAME });
      const prompt = `${CRISIS_GUARDRAIL}
The student is highly anxious about this specific topic: "${topic}".
Generate exactly 3 short cognitive coping flashcards to tackle this anxiety.
Return only a JSON array of objects in this shape (no markdown):
[{"front": "Doubt / Concern about the topic", "back": "Empathetic reframe or strategy"}]`;

      const result = await model.generateContent(prompt);
      const parsed = safeParseJSON(result.response.text(), defaultFlashcards);
      return Array.isArray(parsed) ? parsed : defaultFlashcards;
    });
  } catch (err) {
    return defaultFlashcards;
  }
}

module.exports = {
  extractEmotions,
  explainBurnout,
  streamChat,
  generateMission,
  subjectInsight,
  generateReceipt,
  generateInsightSummary,
  generateStudyPlan,
  generateAIBurnoutPlanner,
  generateAIStressFlashcards
};
