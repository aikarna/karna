// server/exchange/binanceClient.js
// Live Binance Spot balance reader (no trading)

// Env:
// BINANCE_API_KEY=2Bt5U4BhYcP352tJf4tkiVP4YJTjT0XnyMva02o2nfTmYEp5qwx9AjXPWk9fCS54
// BINANCE_API_SECRET=uzlCcmvyJSQwuwHji7M7s051tH2s8s584RfXMHDN5YnYXlYNwsTl9HMN3AJiGLh8
// BINANCE_BASE=https://api.binance.com   (default)

import crypto from "crypto";

const BASE = process.env.BINANCE_BASE || "https://api.binance.com";
const API_KEY = process.env.BINANCE_API_KEY || "";
const API_SECRET = process.env.BINANCE_API_SECRET || "";

function signQS(qs) {
  return crypto.createHmac("sha256", API_SECRET).update(qs).digest("hex");
}

export async function binanceSpotAccount() {
  if (!API_KEY || !API_SECRET) throw new Error("binance_keys_missing");
  const ts = Date.now();
  const recvWindow = 5000;
  const qs = `timestamp=${ts}&recvWindow=${recvWindow}`;
  const sig = signQS(qs);
  const url = `${BASE}/api/v3/account?${qs}&signature=${sig}`;

  const r = await fetch(url, { headers: { "X-MBX-APIKEY": API_KEY } });
  if (!r.ok) throw new Error(`binance_${r.status}`);
  const j = await r.json();

  // Normalize: [{ asset, free }]
  const balances = (j.balances || []).map(b => ({
    asset: b.asset,
    free: Number(b.free),
  }));
  return { balances };
}
