# 🧠 NerveIQ — The Exam Mental OS

A GenAI-powered mental wellness companion for students preparing for high-stakes
exams (JEE, NEET, CUET, CAT, GATE, UPSC, Boards). Built for the hackathon brief:
*"analyze open-ended daily journaling and mood logs, uncover hidden stress
triggers, and provide hyper-personalised, contextual wellness support."*

> **Honesty note for judges:** the voice feature uses the browser's native
> Web Speech API (speech-to-text + text-to-speech) layered on top of Gemini
> text generation — **not** Google's native audio-to-audio "Gemini Live" API.
> This was a deliberate choice: it's free, needs zero extra API key or audio
> infrastructure, and works reliably in Chrome/Edge today. It's labelled
> accurately in the code (`public/index.html`) so there's no overclaiming.

---

## What makes this different from a journal + chatbot

Most submissions in this category will be a mood tracker bolted onto a
chatbot. NerveIQ adds three things that actually require engineering, not
just a prettier prompt:

1. **Deterministic burnout scoring** (`src/services/burnoutEngine.js`) — a
   pure, testable, reproducible 0–100 score computed from mood trend,
   emotion density, journal-length drop, and low-mood streaks. The *number*
   never comes from the LLM, so it can't silently drift with prompt changes,
   and it's covered by unit tests with zero API calls.

2. **The Nerve Map** — a 30-day heatmap rendered as an OMR answer-sheet grid
   (a visual every exam student instantly recognises), plus a per-subject
   stress matrix and streak counters.

3. **Resilience Receipts** (the signature feature) — when the local
   `distortionClassifier.js` detects a cognitive-distortion pattern
   (catastrophizing, all-or-nothing thinking, self-labeling, etc. — real
   CBT concepts) in a journal entry, the server searches the student's *own*
   past entries for concrete counter-evidence (a day they felt the same way
   and recovered; a subject whose stress score measurably improved) and asks
   Gemini to write a short, factual rebuttal using only that real evidence —
   not generic encouragement. Rendered as a literal receipt-styled card.

---

## Architecture

```
Browser (public/index.html)
   │  fetch() — JSON + SSE
   ▼
Express server (src/server.js)
   │  helmet, cors, rate-limit, static hosting
   ▼
Routes (src/routes/*.js)
   │  validate → call services → respond
   ▼
Services (src/services/*.js)
   ├── emotionAnalyser.js       — pure, local keyword/negation emotion pre-filter
   ├── distortionClassifier.js — pure, local CBT-pattern detector
   ├── burnoutEngine.js        — pure, local weighted 0-100 scorer
   ├── subjectMatrix.js        — pure, local per-subject aggregation
   ├── resilienceReceipt.js    — pure, local counter-evidence builder
   ├── missionGenerator.js     — pure, local mission-type picker (no repeats)
   ├── storageService.js       — flat-file JSON read/write
   └── geminiService.js        — the ONLY file that calls the Gemini API
   ▼
Gemini 2.5 Flash (5 distinct prompts, all centralised in geminiService.js)
   ▼
data/entries.json (flat file — no DB needed)
```

**Why so many pure functions?** Every score, classification, and ranking
that *can* be deterministic *is* deterministic. Gemini is only called for the
genuinely generative parts (free-text emotion nuance, the senior-voice chat,
fresh mission wording, the receipt's sentence). This keeps costs low, makes
the core logic unit-testable without any API key, and means a Gemini outage
degrades the experience gracefully instead of breaking it — every Gemini call
in `geminiService.js` has a documented fail-soft fallback.

---

## Folder structure

```
nerveiq/
├── public/
│   └── index.html              ← entire frontend: check-in, Nerve Map, chat + voice
├── src/
│   ├── server.js                ← Express app entry point
│   ├── routes/
│   │   ├── checkinRoutes.js     ← POST /api/checkin
│   │   ├── chatRoutes.js        ← POST /api/chat (SSE stream)
│   │   ├── burnoutRoutes.js     ← GET  /api/burnout
│   │   ├── nerveMapRoutes.js    ← GET  /api/nervemap
│   │   └── missionRoutes.js     ← GET  /api/mission
│   ├── middleware/
│   │   ├── validate.js          ← input validation + allowlisting
│   │   └── errorHandler.js      ← global error handler (never logs bodies)
│   └── services/
│       ├── geminiService.js
│       ├── emotionAnalyser.js
│       ├── distortionClassifier.js
│       ├── burnoutEngine.js
│       ├── subjectMatrix.js
│       ├── resilienceReceipt.js
│       ├── missionGenerator.js
│       └── storageService.js
├── data/
│   └── entries.json             ← flat-file store (auto-created if missing)
├── tests/
│   └── test.js                  ← 30 unit tests, zero API calls, zero network
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Setup (local)

```bash
git clone <your-repo-url>
cd nerveiq
cp .env.example .env
# edit .env and paste your Gemini key (free at https://aistudio.google.com/app/apikey)
npm install
npm test        # runs all 30 unit tests, no API key required for these
npm run dev     # starts on http://localhost:3000
```

## Deploying to Railway

1. Push this folder to a GitHub repo (the account you mentioned giving access to).
2. On Railway: **New Project → Deploy from GitHub repo** → select the repo.
3. Railway auto-detects Node.js from `package.json` and runs `npm start`.
4. Go to your service → **Variables** tab and add:
   - `GEMINI_API_KEY` = your key
   - `NODE_ENV` = `production`
   - (Railway sets `PORT` automatically — `src/server.js` already reads `process.env.PORT`)
5. Railway will hit `GET /health` for its health check — already implemented.
6. Once deployed, open the generated `*.up.railway.app` URL. Use **Chrome**
   for the demo so the voice feature works (Web Speech API support varies
   by browser — text mode always works everywhere as the documented fallback).

**Persistence note:** `data/entries.json` lives on Railway's ephemeral
filesystem by default, meaning a redeploy can reset it. For the hackathon
demo this is fine — just seed a few check-ins right before presenting. For
real persistence beyond the hackathon, attach a
[Railway Volume](https://docs.railway.com/reference/volumes) mounted at the
`data/` directory, or swap `storageService.js` for a real database client —
every other file only calls the four functions that file exports, so the
swap is isolated to one file.

---

## How this maps to the judging rubric

| Criterion | What to point to |
|---|---|
| **Code Quality** | Every service file has exactly one responsibility. Pure functions (no I/O) are physically separated from I/O-performing functions (`geminiService.js`, `storageService.js`). No file mixes scoring logic with API calls. |
| **Security** | Input allowlisting in `validate.js` (rejects anything not in the subject/exam enum, rejects oversized journals); helmet CSP headers; rate limiting on `/api/*`; journal text is never written to server logs (`errorHandler.js` logs only `err.message`); every Gemini prompt carries an explicit crisis-safety guardrail (see `CRISIS_GUARDRAIL` in `geminiService.js`) instructing the model never to diagnose and to redirect to a trusted adult/helpline on self-harm signals; client-side instant crisis-keyword check backs up the server-side guardrail. |
| **Efficiency** | The Resilience Receipt's Gemini call only fires when a distortion is *locally* detected **and** real historical evidence exists (`hasDistortion` + `buildEvidence` gate it) — no wasted calls on neutral entries or new students. Burnout scoring, subject matrix, and the Nerve Map are 100% local computation, zero API cost. Chat uses SSE streaming for perceived low latency. |
| **Testing** | `tests/test.js` — 30 assertions covering every pure function (emotion detection, distortion classification, burnout scoring edge cases incl. empty input and clamping, subject ranking, evidence building, mission-type rotation, input sanitisation) with **zero** network calls or API key required. Run with `npm test`. |
| **Accessibility** | Semantic `role="radiogroup"`/`role="radio"` mood dial with `aria-pressed`/`aria-checked`; `aria-live` regions on results, crisis banner, and chat log; visible `:focus-visible` outlines on every interactive element; `prefers-reduced-motion` respected; voice mode has a clearly labelled text fallback with an explicit on-screen note when the browser doesn't support Web Speech; colour is never the only signal (burnout level shown as text label + colour + numeric score). |

---

## What to say in the demo

Open with the check-in screen, type/say something like *"failed mock test
again, what's even the point"* — this hits the `hopelessness` keyword
detector instantly. Show the burnout ring update. Then submit a second
entry weeks later (or seed history beforehand) with a similar
catastrophizing phrase to trigger an actual **Resilience Receipt** with
real evidence pulled from the demo history — that's the moment nobody else
in the room will have built.

Then switch to voice mode, tap the mic, and let it answer back in the
"Exam Senior" voice — naming this is important context for judges who ask
about the AI architecture, since "Gemini Live" is a specific Google product
name and this implementation deliberately uses the cheaper, more reliable
Web Speech API path instead.
