export default function ProfitChart({ pnl = [] }) {
  // Equity from step ROIs. Base = 1000.
  const base = 1000;
  const equity = pnl.length
    ? pnl.reduce((arr, p) => {
        const prev = arr.length ? arr[arr.length - 1] : base;
        const roi = Number(p?.roi || 0) / 100;
        arr.push(prev * (1 + roi));
        return arr;
      }, [])
    : [base, base];

  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const span = max - min || 1;

  const width = 920, height = 260, pad = 24;

  const pts = equity.map((v, i) => {
    const x = pad + (i / Math.max(1, equity.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y];
  });

  const d = "M " + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ");

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <rect x="0" y="0" width={width} height={height} fill="#0e1424" />
      {[0.2, 0.4, 0.6, 0.8].map((t) => (
        <line
          key={t}
          x1={pad}
          x2={width - pad}
          y1={pad + t * (height - pad * 2)}
          y2={pad + t * (height - pad * 2)}
          stroke="#1d263a"
          strokeWidth="1"
        />
      ))}
      <path d={d} fill="none" stroke="#67b7ff" strokeWidth="2.5" />
      {pts.length ? (
        <circle
          cx={pts[pts.length - 1][0]}
          cy={pts[pts.length - 1][1]}
          r="3.5"
          fill="#ffd166"
          stroke="#111827"
        />
      ) : null}
    </svg>
  );
}
