// Lightweight indicators & helpers (CommonJS)
function ema(vals, period) {
  const k = 2 / (period + 1);
  let e = vals[0];
  const out = [e];
  for (let i = 1; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); out.push(e); }
  return out;
}

function atr(ohlcv, period = 14) {
  const trs = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const h = ohlcv[i][2], l = ohlcv[i][3], pc = ohlcv[i - 1][4];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const seed = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [seed];
  const k = 1 / period;
  for (let i = period; i < trs.length; i++) out.push(out[out.length - 1] * (1 - k) + trs[i] * k);
  while (out.length < ohlcv.length) out.unshift(out[0]);
  return out;
}

function swings(ohlcv, lookback = 3) {
  const highs = [], lows = [];
  for (let i = lookback; i < ohlcv.length - lookback; i++) {
    const h = ohlcv[i][2], l = ohlcv[i][3];
    let isH = true, isL = true;
    for (let k = 1; k <= lookback; k++) {
      if (h < ohlcv[i - k][2] || h < ohlcv[i + k][2]) isH = false;
      if (l > ohlcv[i - k][3] || l > ohlcv[i + k][3]) isL = false;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  return { highs, lows };
}

function fairValueGaps(ohlcv) {
  const gaps = [];
  for (let i = 2; i < ohlcv.length; i++) {
    const h1 = ohlcv[i - 2][2], l1 = ohlcv[i - 2][3];
    const h3 = ohlcv[i][2],   l3 = ohlcv[i][3];
    if (l3 > h1) gaps.push({ i, type: 'bull', top: l3, bottom: h1 });
    if (h3 < l1) gaps.push({ i, type: 'bear', top: l1, bottom: h3 });
  }
  return gaps;
}

function fibLevels(high, low) {
  const d = high - low;
  return {
    '0.382': high - d * 0.382,
    '0.5':   high - d * 0.5,
    '0.618': high - d * 0.618,
    '0.786': high - d * 0.786
  };
}

function lastNHighLow(ohlcv, n = 100) {
  const slice = ohlcv.slice(-n);
  return {
    hi: Math.max(...slice.map(c => c[2])),
    lo: Math.min(...slice.map(c => c[3]))
  };
}

module.exports = { ema, atr, swings, fairValueGaps, fibLevels, lastNHighLow };
