function buildCompoundingPlan({ start = 100, dailyTarget = 0.20, days = 365 }) {
  const rows = [];
  let eq = start;
  for (let d = 1; d <= days; d++) {
    const targetPnL = eq * dailyTarget;
    eq = eq * (1 + dailyTarget);
    rows.push({ day: d, dailyTargetPct: dailyTarget, targetPnL: Number(targetPnL.toFixed(2)), targetEquity: Number(eq.toFixed(2)) });
  }
  return rows;
}

module.exports = { buildCompoundingPlan };
