# BOT KARNA — Quick Start (Local)

## 1) Start the server
```bash
cd server
cp .env.example .env   # keep PAPER_MODE=true for now
npm i
npm start
```

You should see: `KARNA server listening on :4000`

## 2) Start the web (new terminal)
```bash
cd web
npm i
VITE_API=http://localhost:4000 npm run dev
```

Open the URL shown (usually http://localhost:5173). Use the Neon dashboard to **Start**/**Stop** both modes.

### Notes
- `PAPER_MODE=true` = uses internal fills & reporting (safe).
- To try Binance Testnet, set `BINANCE_TESTNET=true`, add your API keys in `server/.env`, and keep it on paper until you are ready.
- Reports are saved under `server/reports/` (CSV + JSONL).
- Strategy logic is in `server/strategy/smc.js`.
