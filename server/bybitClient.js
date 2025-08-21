// server/bybitClient.js
import crypto from "crypto";

const BYBIT_BASE = process.env.BYBIT_BASE || "https://api.bybit.com"; // LIVE
const API_KEY = process.env.BYBIT_API_KEY || "";
const API_SECRET = process.env.BYBIT_API_SECRET || "";
const RECV_WINDOW = "5000";

// Returns numeric USDT balance (Unified). Never throws; returns 0 on error.
export async function getBybitUSDT() {
  try {
    if (!API_KEY || !API_SECRET) {
      console.warn("Bybit keys missing; returning 0");
      return 0;
    }
    const path = "/v5/account/wallet-balance";
    const query = "accountType=UNIFIED&coin=USDT";
    const url = `${BYBIT_BASE}${path}?${query}`;

    const timestamp = Date.now().toString();
    const prehash = timestamp + API_KEY + RECV_WINDOW + query;
    const sign = crypto.createHmac("sha256", API_SECRET).update(prehash).digest("hex");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": API_KEY,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": RECV_WINDOW,
        "X-BAPI-SIGN": sign,
      },
    });

    if (!res.ok) {
      console.error("Bybit HTTP", res.status, await res.text());
      return 0;
    }
    const body = await res.json();
    if (body?.retCode !== 0) {
      console.error("Bybit retCode", body?.retCode, body?.retMsg);
      return 0;
    }
    const coins = body?.result?.list?.[0]?.coin || [];
    const usdt = coins.find((c) => (c.coin || "").toUpperCase() === "USDT");
    const walletBalance = Number(usdt?.walletBalance || 0);
    return isFinite(walletBalance) ? walletBalance : 0;
  } catch (e) {
    console.error("Bybit balance error:", e?.message || e);
    return 0;
  }
}
