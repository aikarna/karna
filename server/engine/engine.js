// server/engine/engine.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeMany, tradeIdea } from "../strategy/smc.js";
import { computeSize, deriveSLTP } from "./risk.js";
import { binanceSpotAccount } from "../exchange/binanceClient.js";
import { bybitUSDTBalance } from "../exchange/bybitClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ... keep everything above from your current engine.js UNCHANGED ...

/* ------------------------- exchange fetch adapters ------------------------ */
async function binanceKlines(symbol, interval, limit = 200) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const raw = await r.json();
  return raw.map((k) => [k[0], Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])]);
}

async function bybitKlines(symbol, interval, limit = 200) {
  const map = { "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "2h": "120", "4h": "240", "1d": "D" };
  const i = map[interval] || "15";
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${i}&limit=${limit}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Bybit ${r.status}`);
  const { result } = await r.json();
  const list = result?.list || [];
  return list
    .map((k) => [Number(k[0]), Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])])
    .sort((a, b) => a[0] - b[0]);
}

/* ---------------------------- paper bookkeeping -------------------------- */
function newPaperAccount(quote = "USDT", base = "BTC") {
  return { balances: { [quote]: 1000, [base]: 0 }, positions: [] };
}

/* --------------------------------- Engine -------------------------------- */
export class Engine {
  constructor(cfg = {}) {
    this.demo = !!cfg.demo;
    this.timeframes = cfg.timeframes || ["1m", "5m", "15m", "1h", "4h"]; // respects env only
    this.symbolsAll = cfg.symbolsAll || ["BTCUSDT"];
    this.symbolsChallenge = cfg.symbolsChallenge || ["BTCUSDT"];
    this.riskPerTrade = Number(cfg.riskPerTrade || 0.5);
    this.maxOpenPositions = Number(cfg.maxOpenPositions || 2);
    this.pnlFile = path.resolve(__dirname, "..", cfg.pnlFile || "../reports/trades.jsonl");

    this.startedAt = null;
    this.lastAction = null;
    this.modes = {
      ALL: { running: false, loop: null, log: [], paper: newPaperAccount() },
      CHALLENGE: { running: false, loop: null, log: [], paper: newPaperAccount() },
    };
    this.pnl = [];
  }

  getModes() {
    return {
      ALL: { running: this.modes.ALL.running, recent: this.modes.ALL.log.slice(0, 6) },
      CHALLENGE: { running: this.modes.CHALLENGE.running, recent: this.modes.CHALLENGE.log.slice(0, 6) },
    };
  }
  getPnL() { return this.pnl; }

  // ***** LIVE BALANCE HOOK *****
  async getAccount(mode = "ALL") {
    // If DEMO=false and keys are present, read live. Else fall back to paper.
    if (!this.demo) {
      try {
        if (mode === "ALL" && process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET) {
          return await binanceSpotAccount(); // live Binance spot
        }
        if (mode === "CHALLENGE" && process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
          return await bybitUSDTBalance(); // live Bybit USDT wallet
        }
      } catch (e) {
        // fall through to paper if live call fails
        this._log(mode, `live balance error: ${String(e).slice(0, 80)}`);
      }
    }
    // paper fallback
    const m = this.modes[mode];
    if (!m) throw new Error("bad_mode");
    return {
      balances: Object.entries(m.paper.balances).map(([asset, free]) => ({ asset, free })),
    };
  }

  async injectWebhook(evt) {
    this._log("ALL", `webhook: ${evt?.signal || "signal"} ${evt?.side || ""}`);
  }

  async start(mode) {
    const m = this.modes[mode];
    if (!m) throw new Error("bad_mode");
    if (m.running) return false;
    m.running = true;
    this.startedAt = Date.now();
    this._log(mode, "started");
    const loop = async () => {
      while (m.running) {
        try { await this._tick(mode); } catch (e) { this._log(mode, `error: ${String(e).slice(0, 120)}`); }
        await sleep(10 * 1000);
      }
    };
    m.loop = loop();
    return true;
  }
  async stop(mode) { const m = this.modes[mode]; if (!m || !m.running) return false; m.running = false; this._log(mode, "stopped"); return true; }

  async _tick(mode) {
    const symbols = mode === "ALL" ? this.symbolsAll : this.symbolsChallenge;
    for (const symbol of symbols) {
      const ohlcByTf = {};
      for (const tf of this.timeframes) {
        const series = mode === "ALL" ? await binanceKlines(symbol, tf, 200) : await bybitKlines(symbol, tf, 200);
        ohlcByTf[tf] = series;
      }

      const idea = tradeIdea(ohlcByTf);
      if (!idea.ok) continue;

      const acct = this.modes[mode].paper;
      const pos = acct.positions.find((p) => p.symbol === symbol);
      const lastClose = ohlcByTf[this.timeframes[0]].at(-1)[4];

      if (pos) {
        const sideFactor = pos.side === "long" ? 1 : -1;
        const hitSL = pos.sl && ((sideFactor > 0 && lastClose <= pos.sl) || (sideFactor < 0 && lastClose >= pos.sl));
        const hitTP = pos.tp && ((sideFactor > 0 && lastClose >= pos.tp) || (sideFactor < 0 && lastClose <= pos.tp));
        const flip = (pos.side === "long" && idea.direction === "short") || (pos.side === "short" && idea.direction === "long");
        if (hitSL || hitTP || flip) {
          await this._closePaper(mode, symbol, lastClose);
          this._log(mode, `${symbol} closed ${hitTP ? "TP" : hitSL ? "SL" : "FLIP"} @ ${lastClose.toFixed(2)}`);
        }
      }

      if (!acct.positions.find((p) => p.symbol === symbol) && idea.confidence >= 60) {
        const dir = idea.direction;
        const size = computeSize(acct, symbol, lastClose, { riskPct: this.riskPerTrade, maxOpen: this.maxOpenPositions });
        if (size.sizeBase > 0) {
          const sltp = deriveSLTP(ohlcByTf[this.timeframes[0]], dir);
          await this._openPaper(mode, symbol, dir, size.sizeBase, lastClose, sltp.sl, sltp.tp);
          this._log(mode, `${symbol} ${dir.toUpperCase()} entry @ ${lastClose.toFixed(2)} size ${size.sizeBase.toFixed(6)}`);
        }
      }

      const equity = acct.balances.USDT + (acct.balances.BTC || 0) * lastClose;
      this.pnl.push({ t: Date.now(), equity, ok: true });
      if (this.pnl.length > 4000) this.pnl.splice(0, this.pnl.length - 4000);
    }
  }

  async _openPaper(mode, symbol, side, sizeBase, price, sl, tp) {
    const acct = this.modes[mode].paper;
    if (side === "long") { const cost = sizeBase * price; if (acct.balances.USDT < cost) return false; acct.balances.USDT -= cost; acct.balances.BTC += sizeBase; }
    else { acct.balances.USDT += sizeBase * price; acct.balances.BTC -= sizeBase; }
    acct.positions.push({ symbol, side, sizeBase, entry: price, sl, tp });
    this.lastAction = { mode, symbol, side, price, t: Date.now() };
    return true;
  }

  async _closePaper(mode, symbol, price) {
    const acct = this.modes[mode].paper;
    const i = acct.positions.findIndex((p) => p.symbol === symbol);
    if (i === -1) return false;
    const p = acct.positions[i];
    if (p.side === "long") { acct.balances.USDT += p.sizeBase * price; acct.balances.BTC -= p.sizeBase; }
    else { acct.balances.USDT -= p.sizeBase * price; acct.balances.BTC += p.sizeBase; }
    acct.positions.splice(i, 1);
    this.lastAction = { mode, symbol, side: "flat", price, t: Date.now() };
    return true;
  }

  _log(mode, msg) {
    const arr = this.modes[mode]?.log || [];
    arr.unshift(`[${new Date().toISOString()}] ${mode} — ${msg}`);
    if (arr.length > 40) arr.pop();
  }
}
