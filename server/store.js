// server/store.js
import fs from "fs";

export function defaultStore() {
  return {
    running: { all: false, challenge: false },
    recent: { all: [], challenge: [] },
    metrics: { accuracy: 0, roi: 0 }, // live values (target is fixed in UI)
    pnl: [{ t: Date.now(), equity: 1000 }],
  };
}

export function loadStore(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStore(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch {}
}
