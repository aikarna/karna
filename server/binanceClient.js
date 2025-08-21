// server/binanceClient.js
import crypto from "crypto";

const B_BASE = process.env.BINANCE_BASE || "https://api.binance.com";
const API_KEY = process.env.BINANCE_API_KEY || "";
const API_SECRET = process.env.BINANCE_API_SECRET || "";

// Returns { balances: [{asset, free}] }; never throws.
export async function getAllBalances() {
  try {
    if (!API_KEY || !API_SECRET) {
      console.warn("Binance keys missing; returning empty balances");
      return { balances: [] };
    }

    const timestamp = Date.now();
    const query = `timestamp=${timestamp}&recvWindow=5000`;
    const sign = crypto.createHmac("sha256", API_SECRET).update(query).digest("hex");
    const url = `${B_BASE}/api/v3/account?${query}&signature=${sign}`;

    const res = await fetch(url, {
      headers: { "X-MBX-APIKEY": API_KEY },
    });
    if (!res.ok) {
      console.error("Binance HTTP", res.status, await res.text());
      return { balances: [] };
    }
    const body = await res.json();
    const bal = Array.isArray(body?.balances) ? body.balances : [];
    // Return only non-zero balances
    const nonZero = bal.filter((b) => Number(b.free) > 0);
    return { balances: nonZero };
  } catch (e) {
    console.error("Binance balances error:", e?.message || e);
    return { balances: [] };
  }
}
