const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function writeRow(kind, row) {
  const csvPath = path.join(dir, `${kind}_trades.csv`);
  const jsonl = path.join(dir, `${kind}_trades.jsonl`);
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, 'timestamp,bot,symbol,side,entry,exit,baseSize,quoteCost,pnl,eq\n');
  }
  const line = [
    new Date(row.ts).toISOString(),
    row.bot, row.symbol, row.side,
    row.entry, row.exit, row.baseSize, row.quoteCost, row.pnl, row.eq
  ].join(',') + '\n';
  fs.appendFileSync(csvPath, line);
  fs.appendFileSync(jsonl, JSON.stringify(row) + '\n');
}

module.exports = { writeRow };
