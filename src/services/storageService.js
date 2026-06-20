/**
 * storageService.js
 *
 * Flat-file JSON storage. No database needed for a hackathon deploy.
 *
 * SECURITY NOTE: entries.json lives under data/ and is gitignored by default
 * (see .gitignore). Journal content is never written to console/server logs
 * anywhere in this codebase — see middleware/errorHandler.js and server.js,
 * which log only error messages/stack traces, never request bodies.
 *
 * NOTE ON RAILWAY: Railway's filesystem is ephemeral on redeploy unless you
 * attach a Volume. For a hackathon demo this flat file is fine. For real
 * persistence, mount a Railway Volume at the data/ directory, or swap this
 * file for a real DB client — every other module only talks to the four
 * functions exported here, so that swap touches just this one file.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

// In-memory cache for entries to prevent redundant file reads
let cachedEntries = null;

function ensureStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readEntries() {
  if (cachedEntries !== null) {
    return cachedEntries;
  }
  ensureStoreExists();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedEntries = Array.isArray(parsed) ? parsed : [];
    return cachedEntries;
  } catch (err) {
    // Corrupt or unreadable file -> fail safe to empty rather than crash the app.
    return [];
  }
}

function writeEntry(entry) {
  const entries = readEntries();
  entries.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  cachedEntries = entries; // Sync cache with new entry
  return entry;
}

function getLastN(n) {
  const entries = readEntries();
  return entries.slice(-n);
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getToday() {
  const today = getTodayISO();
  const entries = readEntries();
  return entries.filter((e) => e.date === today);
}

function getByDateRange(days) {
  const entries = readEntries();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter((e) => new Date(e.date).getTime() >= cutoff);
}

module.exports = {
  readEntries,
  writeEntry,
  getLastN,
  getToday,
  getTodayISO,
  getByDateRange,
  DATA_FILE
};
