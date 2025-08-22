require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { TradingEngine } = require('./engine/engine');
const { buildCompoundingPlan } = require('./plan/compounding');

const app = express();

// core
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// engines
const engines = {
  all: new TradingEngine({ mode: 'ALL' }),
  challenge: new TradingEngine({ mode: 'CHALLENGE' }),
};

// --- health handlers (explicit, no arrays) ---
function healthPayload() {
  return {
    ok: true,
    service: 'karna-server',
    uptime: process.uptime(),
    version: process.env.GIT_SHA || null,
  };
}
app.get('/health', (req, res) => res.json(healthPayload()));
app.head('/health', (req, res) => res.sendStatus(200));
app.get('/healthz', (req, res) => res.json(healthPayload()));
app.head('/healthz', (req, res) => res.sendStatus(200));

// root
app.get('/', (req, res) => {
  res.json({ ok: true, data: { name: 'karna-server' } });
});

// status
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    data: {
      all: engines.all.snapshot(),
      challenge: engines.challenge.snapshot(),
    },
  });
});

// start/stop
app.post('/start/:mode', async (req, res) => {
  const m = req.params.mode;
  if (!engines[m]) return res.status(404).json({ ok: false, message: 'mode not found' });
  await engines[m].start();
  res.json({ ok: true, message: `started ${m}` });
});
app.post('/stop/:mode', async (req, res) => {
  const m = req.params.mode;
  if (!engines[m]) return res.status(404).json({ ok: false, message: 'mode not found' });
  await engines[m].stop();
  res.json({ ok: true, message: `stopped ${m}` });
});

// example plan
app.get('/plan/challenge', (req, res) => {
  const start = Number(process.env.CHALLENGE_START || 100);
  const dailyTarget = 0.20;
  const plan = buildCompoundingPlan({ start, dailyTarget, days: 365 });
  res.json({ ok: true, plan });
});

// webhook
const KARNA_SECRET = process.env.KARNA_SECRET || '';
app.post('/webhook', (req, res) => {
  const { secret, ...payload } = req.body || {};
  if (!KARNA_SECRET) return res.status(500).json({ ok: false, error: 'KARNA_SECRET not set' });
  if (secret !== KARNA_SECRET) return res.status(401).json({ ok: false, error: 'unauthorized' });
  console.log('✅ TradingView Alert Received:', JSON.stringify(payload));
  res.json({ ok: true });
});

// 404 (json)
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found', path: req.originalUrl });
});

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`KARNA server listening on :${PORT}`);
  console.log('Health endpoints: /health and /healthz (GET & HEAD)');
});
