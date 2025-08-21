export default function BalancesCard({ title = "Balances", balances }) {
  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {!balances ? (
        <div style={{ color: "#9aa8c6" }}>—</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {balances.map((b, i) => (
            <li key={i} style={{ listStyle: "disc" }}>
              {b.asset} {Number(b.free || b.balance || 0)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
