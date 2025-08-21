// server/strategy/smc.js
// Final SMC engine: multi-timeframe fusion + lightweight detectors.
// OHLC format per candle: [timestampMs, open, high, low, close, volume]

/* -------------------------- utils & primitives -------------------------- */

const toNum = (x) => (typeof x === "number" ? x : Number(x));
const last = (arr, n = 1) => arr[arr.length - n];

// swing points
function swingHigh(ohlc, i, L = 2) {
  if (i < L || i > ohlc.length - L - 1) return false;
  const h = ohlc[i][2];
  for (let k = 1; k <= L; k++) {
    if (ohlc[i - k][2] >= h) return false;
    if (ohlc[i + k][2] >= h) return false;
  }
  return true;
}

function swingLow(ohlc, i, L = 2) {
  if (i < L || i > ohlc.length - L - 1) return false;
  const l = ohlc[i][3];
  for (let k = 1; k <= L; k++) {
    if (ohlc[i - k][3] <= l) return false;
    if (ohlc[i + k][3] <= l) return false;
  }
  return true;
}

function atr(ohlc, period = 14) {
  if (!Array.isArray(ohlc) || ohlc.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < ohlc.length; i++) {
    const h = toNum(ohlc[i][2]);
    const l = toNum(ohlc[i][3]);
    const pc = toNum(ohlc[i - 1][4]);
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/* ------------------------------ detectors ------------------------------ */

// 1) Liquidity sweep: take out prior swing then close back in range
function detectLiquiditySweep(ohlc) {
  if (ohlc.length < 10) return null;
  const i = ohlc.length - 2; // confirm on close of prev candle

  let lastHighIdx = -1,
    lastLowIdx = -1;
  for (let k = i - 1; k >= Math.max(0, i - 40); k--) {
    if (lastHighIdx === -1 && swingHigh(ohlc, k)) lastHighIdx = k;
    if (lastLowIdx === -1 && swingLow(ohlc, k)) lastLowIdx = k;
    if (lastHighIdx !== -1 && lastLowIdx !== -1) break;
  }
  if (lastHighIdx === -1 || lastLowIdx === -1) return null;

  const c = toNum(ohlc[i][4]);
  const h = toNum(ohlc[i][2]);
  const l = toNum(ohlc[i][3]);
  const prevHigh = toNum(ohlc[lastHighIdx][2]);
  const prevLow = toNum(ohlc[lastLowIdx][3]);

  if (h > prevHigh && c < prevHigh) {
    return { type: "liquidity_sweep", dir: "bear", ref: prevHigh };
  }
  if (l < prevLow && c > prevLow) {
    return { type: "liquidity_sweep", dir: "bull", ref: prevLow };
  }
  return null;
}

// 2) BOS / ChoCH (very light approximation using last swing levels)
function detectBOS_CHOCH(ohlc) {
  if (ohlc.length < 10) return null;
  const i = ohlc.length - 2;

  let lastHigh = null,
    lastLow = null;
  for (let k = i - 1; k >= Math.max(0, i - 60); k--) {
    if (!lastHigh && swingHigh(ohlc, k)) lastHigh = toNum(ohlc[k][2]);
    if (!lastLow && swingLow(ohlc, k)) lastLow = toNum(ohlc[k][3]);
    if (lastHigh && lastLow) break;
  }
  if (!lastHigh || !lastLow) return null;

  const prevClose = toNum(ohlc[i - 1][4]);
  const close = toNum(ohlc[i][4]);

  if (prevClose <= lastHigh && close > lastHigh) {
    return { type: "bos", dir: "bull", ref: lastHigh };
  }
  if (prevClose >= lastLow && close < lastLow) {
    return { type: "bos", dir: "bear", ref: lastLow };
  }
  return null;
}

// 3) Fair Value Gap across 3-candle window
function detectFVG(ohlc) {
  if (ohlc.length < 3) return null;
  const a = ohlc[ohlc.length - 3];
  const c = ohlc[ohlc.length - 1];
  if (toNum(a[2]) < toNum(c[3])) {
    return { type: "fvg", dir: "bull", zone: [toNum(a[2]), toNum(c[3])] };
  }
  if (toNum(a[3]) > toNum(c[2])) {
    return { type: "fvg", dir: "bear", zone: [toNum(c[2]), toNum(a[3])] };
  }
  return null;
}

// 4) Order Block (engulfing-like proxy)
function detectOrderBlock(ohlc) {
  if (ohlc.length < 4) return null;
  const i = ohlc.length - 2;
  const [_, o3, h3, l3, c3] = ohlc[i - 1];
  const [__, o4, , , c4] = ohlc[i];

  // bullish OB: last red before strong green close beyond its open
  if (c3 < o3 && c4 > o3) {
    return { type: "order_block", dir: "bull", zone: [toNum(l3), toNum(h3)] };
  }
  // bearish OB: last green before strong red close below its open
  if (c3 > o3 && c4 < o3) {
    return { type: "order_block", dir: "bear", zone: [toNum(l3), toNum(h3)] };
  }
  return null;
}

// 5) Support / Resistance (latest swing)
function detectSR(ohlc) {
  const i = ohlc.length - 2;
  for (let k = i - 1; k >= Math.max(2, i - 80); k--) {
    if (swingHigh(ohlc, k)) {
      return {
        type: "sr",
        levelType: "resistance",
        level: toNum(ohlc[k][2]),
      };
    }
    if (swingLow(ohlc, k)) {
      return { type: "sr", levelType: "support", level: toNum(ohlc[k][3]) };
    }
  }
  return null;
}

// 6) Demand / Supply (proxy via OB)
function detectDemandSupply(ohlc) {
  const ob = detectOrderBlock(ohlc);
  if (!ob) return null;
  return {
    type: "demand_supply",
    side: ob.dir === "bull" ? "demand" : "supply",
    zone: ob.zone,
    dir: ob.dir,
  };
}

// 7) Fib retracement confluence around the close
function fibConfluence(ohlc) {
  const i = ohlc.length - 2;
  let hiIdx = -1,
    loIdx = -1;
  for (let k = i - 1; k >= Math.max(2, i - 120); k--) {
    if (hiIdx === -1 && swingHigh(ohlc, k)) hiIdx = k;
    if (loIdx === -1 && swingLow(ohlc, k)) loIdx = k;
    if (hiIdx !== -1 && loIdx !== -1) break;
  }
  if (hiIdx === -1 || loIdx === -1) return null;
  const hi = toNum(ohlc[hiIdx][2]);
  const lo = toNum(ohlc[loIdx][3]);
  if (hi <= lo) return null;

  const c = toNum(last(ohlc)[4]);
  const retr = (hi - c) / (hi - lo); // 0 at hi, 1 at lo
  const near = (x, y, tol = 0.035) => Math.abs(x - y) <= tol;
  if (near(retr, 0.618) || near(retr, 0.5) || near(retr, 0.382)) {
    return { type: "fib", levels: [0.382, 0.5, 0.618], retr };
  }
  return null;
}

/* ---------------------------- single TF signal --------------------------- */

export function analyzeOne(ohlc, tf) {
  if (!Array.isArray(ohlc) || ohlc.length < 30) return null;

  const vol = atr(ohlc, 14) || 0;
  if (vol === 0) return null; // avoid dead feed

  const facts = [];
  const push = (x) => x && facts.push(x);

  push(detectLiquiditySweep(ohlc));
  push(detectBOS_CHOCH(ohlc));
  push(detectOrderBlock(ohlc));
  push(detectDemandSupply(ohlc));
  push(detectFVG(ohlc));
  push(detectSR(ohlc));
  push(fibConfluence(ohlc));

  const confluences = facts.length;
  if (confluences < 2) {
    return {
      tf,
      direction: "neutral",
      strength: 0,
      confidence: 0,
      facts: [],
      vol,
    };
  }

  const bull = facts.filter(
    (g) =>
      g.dir === "bull" ||
      g.side === "demand" ||
      g.levelType === "support"
  ).length;
  const bear = facts.filter(
    (g) =>
      g.dir === "bear" || g.side === "supply" || g.levelType === "resistance"
  ).length;

  const direction =
    bull > bear ? "long" : bear > bull ? "short" : "neutral";

  // strength: how many confluences (0..1)
  const strength = Math.min(1, confluences / 7);
  // confidence: scale to 0..100
  const confidence = Math.round(strength * 100);

  return { tf, direction, strength, confidence, facts, vol };
}

/* --------------------------- multi-TF fusion API -------------------------- */

// Default TFs and weights (higher TF = stronger)
export const TF_WEIGHTS = {
  "1m": 0.8,
  "5m": 1.0,
  "15m": 1.4,
  "1h": 2.2,
  "4h": 3.0,
  "1d": 3.6,
};

// input shape: { "1m": ohlc1m, "5m": ohlc5m, ... }
// returns: aggregated actionable signal + per-TF breakdown
export function analyzeMany(ohlcByTf, customWeights = {}) {
  const weights = { ...TF_WEIGHTS, ...customWeights };
  const breakdown = [];

  let weighted = 0;
  let totalW = 0;

  for (const [tf, series] of Object.entries(ohlcByTf || {})) {
    if (!series || series.length < 30) continue;
    const s = analyzeOne(series, tf);
    if (!s) continue;

    breakdown.push(s);

    const w = (weights[tf] ?? 1) * s.strength;
    const dirVal = s.direction === "long" ? 1 : s.direction === "short" ? -1 : 0;
    weighted += dirVal * w;
    totalW += w;
  }

  if (breakdown.length === 0 || totalW === 0) {
    return {
      direction: "neutral",
      confidence: 0,
      reason: "insufficient_data",
      breakdown: [],
    };
  }

  const net = weighted / totalW; // -1..+1
  const direction = net > 0.1 ? "long" : net < -0.1 ? "short" : "neutral";
  const confidence = Math.round(Math.abs(net) * 100);

  // Optional gating: if higher TFs disagree strongly, cut confidence
  const hi = breakdown.filter((b) => ["1h", "4h", "1d"].includes(b.tf));
  if (hi.length) {
    const agree = hi.every((b) => b.direction === direction || b.direction === "neutral");
    if (!agree) {
      // reduce confidence if higher TFs don't line up
      const reduced = Math.max(0, Math.round(confidence * 0.6));
      return { direction, confidence: reduced, breakdown };
    }
  }

  return { direction, confidence, breakdown };
}

/* ------------------------------- convenience ------------------------------ */

// Generate a compact “trade idea” using fused signal
export function tradeIdea(ohlcByTf) {
  const fused = analyzeMany(ohlcByTf);
  if (fused.direction === "neutral" || fused.confidence < 55) {
    return { ok: false, reason: "low_confidence", ...fused };
  }

  // Try to derive a rough entry/SL from the most recent TF that has an OB or SR
  const ordered = [...fused.breakdown].sort(
    (a, b) => (TF_WEIGHTS[b.tf] ?? 1) - (TF_WEIGHTS[a.tf] ?? 1)
  );

  let entryZone = null;
  let stop = null;

  for (const b of ordered) {
    const ob = b.facts.find((f) => f.type === "order_block");
    const ds = b.facts.find((f) => f.type === "demand_supply");
    const sr = b.facts.find((f) => f.type === "sr");

    if (!entryZone && (ob || ds)) {
      const z = (ob?.zone || ds?.zone || []).map(toNum);
      if (z.length === 2) entryZone = { tf: b.tf, zone: [Math.min(...z), Math.max(...z)] };
    }
    if (!stop && sr) {
      stop = { tf: b.tf, level: toNum(sr.level) };
    }
    if (entryZone && stop) break;
  }

  return {
    ok: true,
    direction: fused.direction,
    confidence: fused.confidence,
    entryZone,
    stop,
    breakdown: fused.breakdown,
  };
}

export default {
  analyzeOne,
  analyzeMany,
  tradeIdea,
  TF_WEIGHTS,
};
