/**
 * validate.js
 *
 * Input validation/sanitisation middleware. Every route that accepts a body
 * runs through here BEFORE touching any service or storage, so malformed or
 * oversized input never reaches the AI calls or the flat-file store.
 */

const ALLOWED_SUBJECTS = ['Physics', 'Chemistry', 'Maths', 'Biology', 'General Studies', 'Other'];
const ALLOWED_EXAM_TARGETS = ['JEE', 'NEET', 'CUET', 'CAT', 'GATE', 'UPSC', 'Boards', 'Other'];

const MAX_JOURNAL_LENGTH = 2000;

function isPlainString(val) {
  return typeof val === 'string';
}

/**
 * Strips characters that have no business in a journal entry (control
 * characters) without destroying normal punctuation, emoji, or Hindi/Indian
 * script input. Does NOT attempt HTML-escaping here because this app never
 * renders journal text as raw HTML on the frontend (it uses textContent /
 * safe templating) - see public/index.html.
 */
function sanitiseText(val) {
  if (!isPlainString(val)) return '';
  // eslint-disable-next-line no-control-regex
  return val.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

/**
 * Detects basic script injection, HTML/XSS payloads, or spam URL patterns.
 * @param {string} text - The text to check.
 * @returns {boolean} True if dangerous patterns are found, false otherwise.
 */
function containsDangerousContent(text) {
  if (typeof text !== 'string') return false;

  // Look for script tags, javascript: URIs, or typical inline handlers like onload/onerror
  const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  const inlineHandlerRegex = /\bon[a-z]+\s*=/i;
  const javascriptUriRegex = /javascript:/i;

  // Reject excessive URLs/HTTP links (e.g. more than 3 links) to protect against spam / script links
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = text.match(urlRegex) || [];

  return scriptRegex.test(text) || inlineHandlerRegex.test(text) || javascriptUriRegex.test(text) || urls.length > 3;
}

function validateCheckin(req, res, next) {
  const { mood, journal, subject, examTarget, daysLeft } = req.body || {};

  const errors = [];

  const moodNum = Number(mood);
  if (!Number.isInteger(moodNum) || moodNum < 1 || moodNum > 10) {
    errors.push('mood must be an integer between 1 and 10.');
  }

  if (!isPlainString(journal) || journal.trim().length === 0) {
    errors.push('journal is required and must be text.');
  } else if (journal.length > MAX_JOURNAL_LENGTH) {
    errors.push(`journal must be under ${MAX_JOURNAL_LENGTH} characters.`);
  } else if (containsDangerousContent(journal)) {
    errors.push('journal contains blocked content or scripting patterns.');
  }

  if (subject !== undefined && !ALLOWED_SUBJECTS.includes(subject)) {
    errors.push(`subject must be one of: ${ALLOWED_SUBJECTS.join(', ')}.`);
  }

  if (examTarget !== undefined && !ALLOWED_EXAM_TARGETS.includes(examTarget)) {
    errors.push(`examTarget must be one of: ${ALLOWED_EXAM_TARGETS.join(', ')}.`);
  }

  const daysLeftNum = daysLeft === undefined ? undefined : Number(daysLeft);
  if (daysLeftNum !== undefined && (!Number.isFinite(daysLeftNum) || daysLeftNum < 0 || daysLeftNum > 3650)) {
    errors.push('daysLeft must be a sensible non-negative number.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid input', details: errors });
  }

  req.validatedBody = {
    mood: moodNum,
    journal: sanitiseText(journal),
    subject: subject || 'General Studies',
    examTarget: examTarget || 'Other',
    daysLeft: daysLeftNum !== undefined ? daysLeftNum : null
  };

  next();
}

function validateChat(req, res, next) {
  const { message, examTarget, daysLeft } = req.body || {};

  if (!isPlainString(message) || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required and must be text.' });
  }
  if (message.length > MAX_JOURNAL_LENGTH) {
    return res.status(400).json({ error: `message must be under ${MAX_JOURNAL_LENGTH} characters.` });
  }
  if (containsDangerousContent(message)) {
    return res.status(400).json({ error: 'message contains blocked content or scripting patterns.' });
  }
  if (examTarget !== undefined && !ALLOWED_EXAM_TARGETS.includes(examTarget)) {
    return res.status(400).json({ error: `examTarget must be one of: ${ALLOWED_EXAM_TARGETS.join(', ')}.` });
  }

  req.validatedBody = {
    message: sanitiseText(message),
    examTarget: examTarget || 'Other',
    daysLeft: daysLeft !== undefined ? Number(daysLeft) : null
  };

  next();
}

function validatePlanner(req, res, next) {
  const { syllabusPct, targetScore, hoursStudied, examTarget } = req.body || {};

  const errors = [];

  const syllabusNum = Number(syllabusPct);
  if (syllabusPct !== undefined && (!Number.isFinite(syllabusNum) || syllabusNum < 0 || syllabusNum > 100)) {
    errors.push('syllabusPct must be a number between 0 and 100.');
  }

  const targetNum = Number(targetScore);
  if (targetScore !== undefined && (!Number.isFinite(targetNum) || targetNum < 0 || targetNum > 100)) {
    errors.push('targetScore must be a number between 0 and 100.');
  }

  const hoursNum = Number(hoursStudied);
  if (hoursStudied !== undefined && (!Number.isFinite(hoursNum) || hoursNum < 0 || hoursNum > 24)) {
    errors.push('hoursStudied must be a number between 0 and 24.');
  }

  if (examTarget !== undefined && !ALLOWED_EXAM_TARGETS.includes(examTarget)) {
    errors.push(`examTarget must be one of: ${ALLOWED_EXAM_TARGETS.join(', ')}.`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid input', details: errors });
  }

  req.validatedBody = {
    syllabusPct: syllabusPct !== undefined ? syllabusNum : 0,
    targetScore: targetScore !== undefined ? targetNum : 0,
    hoursStudied: hoursStudied !== undefined ? hoursNum : 0,
    examTarget: examTarget || 'Other'
  };

  next();
}

function validateFlashcards(req, res, next) {
  const { topic } = req.body || {};

  if (!isPlainString(topic) || topic.trim().length === 0) {
    return res.status(400).json({ error: 'topic is required and must be text.' });
  }

  if (topic.length > 100) {
    return res.status(400).json({ error: 'topic must be under 100 characters.' });
  }

  req.validatedBody = {
    topic: sanitiseText(topic)
  };

  next();
}

module.exports = {
  validateCheckin,
  validateChat,
  validatePlanner,
  validateFlashcards,
  sanitiseText,
  ALLOWED_SUBJECTS,
  ALLOWED_EXAM_TARGETS
};
