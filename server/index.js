// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { TradingEngine } = require('./engine/engine');
const { buildCompoundingPlan } = require('./plan/compounding');

const app = express();

// ---- Core middleware ----
app.set('trust proxy', 1);               // important on Render/behind proxy
app.use(cors());
app.use(express.json());

// ---- Engines ----
const engines = {
  all: new TradingEngine({ mode: 'ALL' }),
  challenge: new TradingEngine({ mode: 'CHALLENGE' }),
};

// ---- Health & probes ----
function sendHealth(res) {
  res.json({
    ok: true,
    service: 'karna-server',
    uptime: process.uptime(),
    version: process.env.GIT_SHA || null,
  });
}

// Root probe (quick sanity)
app.get('/', (req, res) => {
  res.json({ ok: true, data: { name: 'karna-server' } });
});

// Explicit health endpoints (GET + HEAD so any checker works)
app.get('/health', (req, res) => sendHealth(res));
app.head('/health', (req, res) => res.sendStatus(200));

app.get('/healthz', (req, res) => sendHealth(res));
app.head('/healthz', (req, res) => res.sendStatus(200));

// ---- Status & control ----
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    data: {
      all: engines.all.snapshot(),
      challenge: engines.challenge.snapshot(),
    },
  });
});

app.post('/start/:mode', async (req, res) => {
  const m = req.params.mode;
  if (!engines[m]) return res.status(404).json({ ok: false, error: 'mode not found' });
  await engines[m].start();
  res.json({ ok: true, message: `started ${m}` });
});

app.post('/stop/:mode', async (req, res) => {
  const m = req.params.mode;
  if (!engines[m]) return res.status(404).json({ ok: false, error: 'mode not found' });
  await engines[m].stop();
  res.json({ ok: true, message: `stopped ${m}` });
});

// ---- Compounding plan (example) ----
app.get('/plan/challenge', (req, res) => {
  const start = Number(process.env.CHALLENGE_START || 100);
  const dailyTarget = 0.20; // 20%
  const plan = buildCompoundingPlan({ start, dailyTarget, days: 365 });
  res.json({ ok: true, plan });
});

// ---- TradingView webhook ----
const KARNA_SECRET = process.env.KARNA_SECRET || '';

app.post('/webhook', (req, res) => {
  const { secret, ...payload } = req.body || {};
  if (!KARNA_SECRET) return res.status(500).json({ ok: false, error: 'KARNA_SECRET not set' });
  if (secret !== KARNA_SECRET) return res.status(401).json({ ok: false, error: 'unauthorized' });

  console.log('✅ TradingView Alert Received:', JSON.stringify(payload));
  res.json({ ok: true });
});

// ---- Catch-all 404 (JSON) ----
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found', path: req.originalUrl });
});

// ---- Start server ----
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`KARNA server listening on :${PORT}`);
  console.log(`Health: /health and /healthz`);
});
