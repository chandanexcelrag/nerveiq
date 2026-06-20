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

module.exports = {
  validateCheckin,
  validateChat,
  sanitiseText,
  ALLOWED_SUBJECTS,
  ALLOWED_EXAM_TARGETS
};
