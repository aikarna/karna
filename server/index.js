// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { Engine } from "./engine/engine.js";
import telemetry from "./telemetry.js";

const app = express();
app.use(express.json());
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"],
    credentials: false,
  })
);
app.use(morgan("tiny"));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
  })
);

// --- Engine singleton ---
const engine = new Engine({
  demo: String(process.env.DEMO || "").toLowerCase() !== "false" ? true : false,
  // symbols per mode
  symbolsAll: (process.env.ALL_SYMBOLS || "BTCUSDT").split(","),
  symbolsChallenge: (process.env.CHALLENGE_SYMBOLS || "BTCUSDT").split(","),
  // timeframes (comma separated from env if set)
  timeframes: (process.env.TIMEFRAMES || "1m,5m,15m,1h,4h").split(","),
  // risk
  riskPerTrade: Number(process.env.RISK_PCT || 0.5), // % of equity per trade
  maxOpenPositions: Number(process.env.MAX_OPEN || 2),
  pnlFile: process.env.PNL_FILE || "./reports/trades.jsonl",
});

// Utilities
const ok = (data = {}) => ({ ok: true, data });
const err = (message = "unknown_error", code = "ERR") => ({
  ok: false,
  code,
  message,
});

// --- Routes ---

app.get("/", (_, res) => res.json(ok({ name: "karna-server" })));

app.get("/status", async (_, res) => {
  try {
    res.json(
      ok({
        modes: engine.getModes(),
        startedAt: engine.startedAt,
        demo: engine.demo,
        lastAction: engine.lastAction,
      })
    );
  } catch (e) {
    res.status(500).json(err(String(e), "STATUS"));
  }
});

app.post("/start/:mode", async (req, res) => {
  try {
    const mode = String(req.params.mode || "").toUpperCase();
    const r = await engine.start(mode);
    res.json(ok({ started: r, mode }));
  } catch (e) {
    res.status(500).json(err(String(e), "START"));
  }
});

app.post("/stop/:mode", async (req, res) => {
  try {
    const mode = String(req.params.mode || "").toUpperCase();
    const r = await engine.stop(mode);
    res.json(ok({ stopped: r, mode }));
  } catch (e) {
    res.status(500).json(err(String(e), "STOP"));
  }
});

// balances for UI
app.get("/api/v3/account", async (req, res) => {
  try {
    const mode = String(req.query.mode || "ALL").toUpperCase();
    const acct = await engine.getAccount(mode);
    res.json(ok(acct));
  } catch (e) {
    res.status(502).json(err(String(e), "ACCOUNT"));
  }
});

// equity / pnl line for charts
app.get("/pnl", async (_, res) => {
  try {
    res.json(engine.getPnL());
  } catch (e) {
    res.status(500).json(err(String(e), "PNL"));
  }
});

// webhooks (optional – ignored if you don’t use them)
app.post("/webhook", async (req, res) => {
  try {
    const { secret, plan, signal, side, symbol, timeframe, cost } = req.body || {};
    if (secret && process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      return res.status(403).json(err("bad_secret", "FORBIDDEN"));
    }
    await engine.injectWebhook({
      plan,
      signal,
      side,
      symbol,
      timeframe,
      cost,
    });
    res.json(ok({ accepted: true }));
  } catch (e) {
    res.status(500).json(err(String(e), "WEBHOOK"));
  }
});

const PORT = Number(process.env.PORT || 5001);
app.listen(PORT, () => {
  console.log(`KARNA server listening on :${PORT}`);
  console.log(`DEMO=${engine.demo}`);
});
