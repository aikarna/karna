import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(morgan("combined"));

const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => { if (!origin) return cb(null, true); if (ALLOW_ORIGINS.length === 0 || ALLOW_ORIGINS.includes(origin)) return cb(null, true); return cb(new Error("Not allowed by CORS"), false); },
  credentials: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: true },
  message: { ok: false, error: "rate_limited" }
}));

app.get("/", (req, res) => res.json({ ok: true, msg: "KARNA backend alive", time: new Date().toISOString() }));
app.get("/health", (req, res) => res.json({ ok: true, uptime: process.uptime(), env: process.env.NODE_ENV || "unknown", demo: process.env.DEMO || "false", time: new Date().toISOString() }));

const queue = [];
const enqueue = (job) => queue.push(job);

app.post("/webhook", async (req, res) => {
  try {
    const { symbol, side, price, sl, tp, confidence, timeframe, strategy, passphrase } = req.body || {};
    if (!passphrase || passphrase !== process.env.ALERT_SECRET) return res.status(401).json({ ok: false, error: "bad_secret" });
    if (!symbol || !side) return res.status(400).json({ ok: false, error: "missing_symbol_or_side" });
    const job = { id: `sig_${Date.now()}`, ts: Date.now(), symbol, side: String(side).toUpperCase(), price: Number(price) || null, sl: sl != null ? Number(sl) : null, tp: tp != null ? Number(tp) : null, confidence: confidence != null ? Number(confidence) : null, timeframe: timeframe || null, strategy: strategy || "KARNA", sourceIp: req.ip, ua: req.headers["user-agent"] || "unknown" };
    enqueue(job);
    console.log("WEBHOOK_OK", job);
    return res.json({ ok: true, queued: true, id: job.id });
  } catch (e) {
    console.error("WEBHOOK_ERR", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => { console.log(`KARNA server listening on :${PORT}`); console.log(`DEMO=${process.env.DEMO || "false"}`); });
