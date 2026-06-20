/**
 * chatRoutes.js
 * POST /api/chat (Server-Sent Events stream)
 *
 * Streams the "Exam Senior" voice response chunk by chunk so the frontend
 * can render word-by-word and, in voice mode, start speaking before the
 * full reply has even finished generating.
 */

const express = require('express');
const router = express.Router();

const { validateChat } = require('../middleware/validate');
const storageService = require('../services/storageService');
const geminiService = require('../services/geminiService');

function buildHistoryContext(entries) {
  if (!entries || entries.length === 0) return '';
  return entries
    .map(
      (e) =>
        `${e.date}: mood ${e.mood}/10, subject ${e.subject}, burnout ${e.burnoutScore ?? 'n/a'}/100${
          e.journal ? ` - wrote: "${e.journal.slice(0, 120)}"` : ''
        }`
    )
    .join('\n');
}

router.post('/chat', validateChat, async (req, res, next) => {
  try {
    const { message, examTarget, daysLeft } = req.validatedBody;
    const last7 = storageService.getLastN(7);
    const historyContext = buildHistoryContext(last7);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = geminiService.streamChat(message, historyContext, examTarget, daysLeft);

    for await (const chunk of stream) {
      // SSE requires newline-safe payloads; encode as JSON so multi-line
      // chunks from the model can't break the `data: ` framing.
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.write(`data: ${JSON.stringify({ error: true })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
