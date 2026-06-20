# 🧠 NerveIQ — The Exam Mental OS

<div align="center">
  
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-blue.svg?style=for-the-badge&logo=nodedotjs)](https://nodejs.org)
  [![Express.js](https://img.shields.io/badge/express-4.19.2-lightgrey.svg?style=for-the-badge&logo=express)](https://expressjs.com)
  [![Google Gemini AI](https://img.shields.io/badge/Gemini_API-2.5_Flash-orange.svg?style=for-the-badge&logo=google)](https://aistudio.google.com/)
  [![Deployed on Railway](https://img.shields.io/badge/Railway-Deployed-darkgreen.svg?style=for-the-badge&logo=railway)](https://railway.app)
  [![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

  <h3>A GenAI-powered mental wellness companion tailored for students preparing for high-stakes competitive entrance and board exams (JEE, NEET, CUET, CAT, GATE, UPSC, CBSE).</h3>

  <p><i>"Analyze open-ended daily journaling and mood logs, uncover hidden stress triggers, and provide hyper-personalised, contextual wellness support."</i></p>
</div>

---

## 🚀 Key Features That Set NerveIQ Apart

Unlike typical mood trackers that simply bolt a chatbot onto a database, NerveIQ implements three core features that combine deterministic engineering with GenAI capability:

### 1. 🌡️ Deterministic Burnout Scoring (`burnoutEngine.js`)
* **Mathematical Scorer**: Uses a pure, testable, and reproducible 0–100 score computed from mood trends, low-mood streaks, journal-length drops, and negative emotion density.
* **LLM-Independent**: The rating logic is completely independent of the LLM, meaning it won’t drift with prompt variations. It is covered by robust unit tests.

### 2. 🗺️ The OMR Nerve Map
* **OMR Heatmap**: Displays a 30-day mental wellness heatmap rendered to look like an Optical Mark Recognition (OMR) answer sheet—a design every exam student instantly recognizes.
* **Stress Matrix & Streaks**: Aggregates stress levels per subject and tracks consecutive wellness streaks.

### 3. 🧾 Resilience Receipts (`resilienceReceipt.js`) — *Signature Feature*
* **CBT Distortion Detection**: The local `distortionClassifier.js` scans entries for cognitive distortions (catastrophizing, all-or-nothing thinking, self-labeling, etc.).
* **Evidence-Based Rebuttals**: If a distortion is detected, the server searches past check-ins for evidence of resilience (e.g., a day they overcame a similar setback) and prompts Gemini to compose a short, factual rebuttal using *only* that evidence. 
* **Receipt UI**: Rendered as a physical grocery-style receipt of the student's inner strength.

### 4. 🎙️ "Exam Senior" Voice Assistant
* **Companion Voice**: A calming elder-student persona designed to give actionable, exam-specific guidance.
* **Hybrid Voice System**: Powered by browser-native **Web Speech API** layered over Gemini text generation. Works with zero extra latency or API costs, with automatic silent fallback to text if speech is unsupported.

---

## 🛠️ Architecture & Flow

NerveIQ uses a highly modular structure where **every component does one thing well**. We maximize local, deterministic computation, saving the Gemini API exclusively for creative, generative tasks.

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
   ├── emotionAnalyser.js       — Local keyword/negation emotion pre-filter
   ├── distortionClassifier.js — Local CBT-pattern detector
   ├── burnoutEngine.js        — Local weighted 0-100 scorer
   ├── subjectMatrix.js        — Local per-subject aggregation
   ├── resilienceReceipt.js    — Local counter-evidence builder
   ├── missionGenerator.js     — Local mission-type picker (no repeats)
   ├── storageService.js       — Flat-file JSON database wrapper
   └── geminiService.js        — The ONLY file that calls the Gemini API
   ▼
Gemini 2.5 Flash (5 distinct prompts, all centralised in geminiService.js)
   ▼
data/entries.json (flat file — no DB needed)
```

---

## 📁 Directory Structure

```
nerveiq/
├── public/
│   └── index.html              ← Single-page application frontend
├── src/
│   ├── server.js                ← Express app entry point
│   ├── routes/
│   │   ├── checkinRoutes.js     ← POST /api/checkin
│   │   ├── chatRoutes.js        ← POST /api/chat (SSE stream)
│   │   ├── burnoutRoutes.js     ← GET  /api/burnout
│   │   ├── nerveMapRoutes.js    ← GET  /api/nervemap
│   │   └── missionRoutes.js     ← GET  /api/mission
│   ├── middleware/
│   │   ├── validate.js          ← Custom input validation & allowlisting
│   │   └── errorHandler.js      ← Global error handler
│   └── services/
│       ├── geminiService.js     ← Gemini client integration
│       ├── emotionAnalyser.js   ← Local NLP emotion pre-filter
│       ├── distortionClassifier.js ← Local CBT distortion parser
│       ├── burnoutEngine.js     ← Weighted 0-100 burnout score generator
│       ├── subjectMatrix.js     ← Multi-subject stress analysis matrix
│       ├── resilienceReceipt.js ← Historic evidence lookup and payload parser
│       ├── missionGenerator.js  ← Smart wellness challenge rotation
│       └── storageService.js    ← Flat-file database controller
├── data/
│   └── entries.json             ← JSON flat-file storage
├── tests/
│   └── test.js                  ← 30 unit tests running locally without API calls
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## ⚙️ Setup Instructions

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/chandanexcelrag/nerveiq.git
   cd nerveiq
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Open the `.env` file and insert your API key:
   ```env
   GEMINI_API_KEY=AIzaSy... # Get your free key at https://aistudio.google.com/app/apikey
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Run Unit Tests**:
   ```bash
   npm test
   ```
   *(Runs all 30 tests checking burnout scoring, CBT classifications, and sanitization with zero API calls)*

5. **Start Dev Server**:
   ```bash
   npm run dev
   ```
   *Your app will launch locally at `http://localhost:3000`.*

---

## ☁️ Deploying to Railway

1. Push your repository to your GitHub account:
   ```bash
   git push -u origin main
   ```
2. Log into [Railway.app](https://railway.app) and create a **New Project**.
3. Select **Deploy from GitHub repo** and connect `nerveiq`.
4. Go to **Variables** in your Railway service dashboard and add:
   * `GEMINI_API_KEY` = *[Your Gemini API Key]*
   * `NODE_ENV` = `production`
   * `PORT` = `3000`
5. Railway will automatically build the project and expose a public URL under **Settings** -> **Networking** -> **Generate Domain**.

> [!NOTE]  
> **State Persistence:** By default, `data/entries.json` runs on Railway's ephemeral storage (resetting on redeploys). For production use, you can mount a [Railway Volume](https://docs.railway.com/reference/volumes) at `/data` or connect a database by modifying [storageService.js](file:///c:/chandan_promtwars/nerveiq/src/services/storageService.js).

---

## 🔒 Security & Crisis Guardrails

* **Rate Limiting**: Protects your Gemini API key from cost blowouts with an Express rate-limiter set on all endpoints.
* **Data Privacy**: Input logs are never logged to console/files. The global error handler strictly hides request bodies.
* **Crisis Safety Interceptor**: Both client-side and server-side interceptors scan for crisis/self-harm keywords. When triggered, they automatically halt normal processing and redirect the student to trusted professional hotlines.

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
