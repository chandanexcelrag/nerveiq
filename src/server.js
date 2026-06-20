/**
 * server.js
 *
 * Entry point. Wires up security middleware, rate limiting, static
 * frontend serving, all API routes, and the global error handler.
 *
 * Run locally:  npm install && npm run dev
 * Run in prod:  npm start   (Railway calls this automatically)
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const checkinRoutes = require('./routes/checkinRoutes');
const chatRoutes = require('./routes/chatRoutes');
const burnoutRoutes = require('./routes/burnoutRoutes');
const nerveMapRoutes = require('./routes/nerveMapRoutes');
const missionRoutes = require('./routes/missionRoutes');
const insightsRoutes = require('./routes/insightsRoutes');
const studyRoutes = require('./routes/studyRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// --- Security headers ---
// CSP is relaxed for 'unsafe-inline' because the frontend is a single
// static HTML file with inline <style>/<script> by design (no build step,
// trivial to deploy). If you split into separate JS/CSS files, tighten this.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:']
      }
    }
  })
);

app.use(cors());
app.use(express.json({ limit: '10kb' }));

// --- Rate limiting ---
// Protects the Gemini API key from abuse/cost blowouts on a public deploy.
const limiter = rateLimit({
  windowMs: (Number(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' }
});
app.use('/api', limiter);

// --- Health check (Railway uses this) ---
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- API routes ---
app.use('/api', checkinRoutes);
app.use('/api', chatRoutes);
app.use('/api', burnoutRoutes);
app.use('/api', nerveMapRoutes);
app.use('/api', missionRoutes);
app.use('/api', insightsRoutes);
app.use('/api', studyRoutes);

// --- Static frontend ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- 404 + error handling (must be last) ---
app.use('/api', notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`NerveIQ server running on port ${PORT}`);
});

module.exports = app;
