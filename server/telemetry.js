// server/telemetry.js
// Lightweight in-memory telemetry for KARNA webhooks.
// Records confidence / ATR% and basic request fields.
// No trading logic is changed.

const MAX_KEEP = 1000; // total events to keep in memory

const state = {
  total: 0,
  byPlan: {
    ALL:   { total: 0, events: [] },
    CHALLENGE: { total: 0, events: [] },
  },
  lastN: [], // mixed feed (most recent first)
};

function _pushRing(arr, item, cap) {
  arr.unshift(item);
  if (arr.length > cap) arr.length = cap;
}

function _num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function ingest(evt) {
  // evt = { ts, plan, side, signal, symbol, timeframe, cost, confidence?, atrPct? }
  const planKey = String(evt.plan || "").toUpperCase() === "ALL" ? "ALL" : "CHALLENGE";

  const rec = {
    ts: evt.ts || Date.now(),
    plan: planKey,
    side: String(evt.side || "").toUpperCase(),       // LONG/SHORT (or long/short)
    signal: evt.signal || "",
    symbol: evt.symbol || "",
    timeframe: evt.timeframe || "",
    cost: _num(evt.cost),
    confidence: _num(evt.confidence),
    atrPct: _num(evt.atrPct),
  };

  state.total += 1;

  // global ring buffer
  _pushRing(state.lastN, rec, MAX_KEEP);

  // per-plan ring buffers
  const bucket = state.byPlan[planKey];
  bucket.total += 1;
  _pushRing(bucket.events, rec, Math.min(MAX_KEEP, 500)); // per plan cap
}

function _statsFrom(list) {
  const n = list.length;
  const confs = list.map(e => e.confidence).filter(x => x !== null);
  const atrs  = list.map(e => e.atrPct).filter(x => x !== null);

  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : null;
  const med = arr => {
    if (!arr.length) return null;
    const a = [...arr].sort((x,y)=>x-y);
    const m = Math.floor(a.length/2);
    return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
  };

  return {
    count: n,
    confidence: {
      avg: confs.length ? Math.round(avg(confs)*100)/100 : null,
      med: confs.length ? Math.round(med(confs)*100)/100 : null,
      min: confs.length ? Math.min(...confs) : null,
      max: confs.length ? Math.max(...confs) : null,
      sample: confs.slice(0,10),
    },
    atrPct: {
      avg: atrs.length ? Math.round(avg(atrs)*100)/100 : null,
      med: atrs.length ? Math.round(med(atrs)*100)/100 : null,
      min: atrs.length ? Math.min(...atrs) : null,
      max: atrs.length ? Math.max(...atrs) : null,
      sample: atrs.slice(0,10),
    },
    last5: list.slice(0,5),
  };
}

export function summary() {
  return {
    total: state.total,
    ALL: _statsFrom(state.byPlan.ALL.events),
    CHALLENGE: _statsFrom(state.byPlan.CHALLENGE.events),
    recent: state.lastN.slice(0,20),
  };
}

export default { ingest, summary };
