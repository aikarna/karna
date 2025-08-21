// server/exchange/bybitClient.js
// Live Bybit v5 wallet balance reader (no trading)
// Unified account recommended

// Env:
// BYBIT_API_KEY=qrxZGepz3hB89cMBA6
// BYBIT_API_SECRET=dhpk50mpuIosvY6HI0t3C3js9gWmMZCdYSj9
// BYBIT_BASE=https://api.bybit.com            (default mainnet)
// BYBIT_ACCOUNT_TYPE=UNIFIED|CONTRACT|SPOT    (default UNIFIED)

import crypto from "crypto";

const BASE = process.env.BYBIT_BASE || "https://api.bybit.com";
const KEY = process.env.BYBIT_API_KEY || "";
const SECRET = process.env.BYBIT_API_SECRET || "";
const ACCOUNT_TYPE = process.env.BYBIT_ACCOUNT_TYPE || "UNIFIED";

function signV5({ apiKey, secret, ts, recvWindow, query }) {
  // sign content = apiKey + timestamp + recvWindow + queryString (sorted already)
  const payload = `${apiKey}${ts}${recvWindow}${query}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function bybitUSDTBalance() {
  if (!KEY || !SECRET) throw new Error("bybit_keys_missing");
  const recvWindow = 5000;
  const ts = Date.now().toString();

  // we ask only USDT (what UI needs) – add more coins if you wish
  const qs = new URLSearchParams({
    accountType: ACCOUNT_TYPE,
    coin: "USDT",
  }).toString();

  const sig = signV5({ apiKey: KEY, secret: SECRET, ts, recvWindow, query: qs });
  const url = `${BASE}/v5/account/wallet-balance?${qs}`;

  const r = await fetch(url, {
    headers: {
      "X-BAPI-API-KEY": KEY,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": String(recvWindow),
      "X-BAPI-SIGN": sig,
    },
  });
  if (!r.ok) throw new Error(`bybit_${r.status}`);
  const j = await r.json();
  const list = j?.result?.list || [];

  // Normalize to [{ asset, free }]
  // For unified, .coin = [{coin, equity, availableToWithdraw}]
  const coins = (list[0]?.coin || []).map((c) => ({
    asset: c.coin,
    free: Number(c.availableToWithdraw ?? c.equity ?? 0),
  }));

  return { balances: coins };
}
