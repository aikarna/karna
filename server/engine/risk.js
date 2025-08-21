// server/engine/risk.js
// simple risk model: fixed % of equity, ATR-based SL/TP

export function equityFromPaper(acct, mark) {
  return (acct.balances.USDT || 0) + (acct.balances.BTC || 0) * mark;
}

export function computeSize(acct, symbol, price, cfg = {}) {
  const riskPct = Number(cfg.riskPct || 0.5); // % of equity per trade
  const eq = equityFromPaper(acct, price);
  const usdRisk = Math.max(10, (riskPct / 100) * eq); // min $10 notional
  const sizeBase = usdRisk / price;
  return { usdRisk, sizeBase };
}

// derive SL/TP from most recent ATR-ish move using last 50 candles
export function deriveSLTP(ohlc, direction) {
  const n = Math.min(50, ohlc.length);
  const slice = ohlc.slice(-n);
  const closes = slice.map((x) => Number(x[4]));
  const highs = slice.map((x) => Number(x[2]));
  const lows = slice.map((x) => Number(x[3]));
  const last = closes.at(-1);
  const avgRange =
    slice.reduce((a, c, i) => a + (highs[i] - lows[i]), 0) / slice.length || (last * 0.005);

  const atrMultSL = 1.2;
  const atrMultTP = 2.0;

  if (direction === "long") {
    return { sl: last - atrMultSL * avgRange, tp: last + atrMultTP * avgRange };
  }
  return { sl: last + atrMultSL * avgRange, tp: last - atrMultTP * avgRange };
}
