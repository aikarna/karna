import { useEffect, useMemo, useState } from "react";
import ProfitChart from "./components/ProfitChart.jsx";
import BalancesCard from "./components/BalancesCard.jsx";
import APIClient from "./lib/api.ts";

const TARGET_ACCURACY = 92;
const TARGET_ROI = 25;

const api = new APIClient(import.meta.env.VITE_API || "http://localhost:5001");

export default function App() {
  const [status, setStatus] = useState({ ok: false, stateAll: "IDLE", stateChal: "IDLE" });
  const [logAll, setLogAll] = useState([]);
  const [logChal, setLogChal] = useState([]);
  const [pnl, setPnl] = useState([]);
  const [balancesAll, setBalancesAll] = useState(null);
  const [balancesChal, setBalancesChal] = useState(null);

  const fetchAll = async () => {
    try {
      const s = await api.get("/status");
      setStatus({
        ok: !!s?.ok,
        stateAll: s?.modes?.ALL?.running ? "RUNNING" : "IDLE",
        stateChal: s?.modes?.CHALLENGE?.running ? "RUNNING" : "IDLE",
      });

      const acctAll = await api.get("/api/v3/account?mode=ALL");
      const acctCh  = await api.get("/api/v3/account?mode=CHALLENGE");
      setBalancesAll(acctAll?.balances || null);
      setBalancesChal(acctCh?.balances || null);

      const hist = await api.get("/pnl");
      setPnl(Array.isArray(hist) ? hist : []);
    } catch (e) {
      setStatus((s) => ({ ...s, ok: false }));
    }
  };

  const pushLog = (mode, action) => {
    const item = `[${new Date().toISOString()}] ${mode} — ${action}`;
    if (mode === "ALL") setLogAll((l) => [item, ...l].slice(0, 12));
    else setLogChal((l) => [item, ...l].slice(0, 12));
  };

  const start = async (mode) => { try { await api.post(`/start/${mode}`); pushLog(mode,"started"); setTimeout(fetchAll, 200); } catch {} };
  const stop  = async (mode) => { try { await api.post(`/stop/${mode}`);  pushLog(mode,"stopped"); setTimeout(fetchAll, 200); } catch {} };

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 5000); return () => clearInterval(t); }, []);

  const currentAccuracy = useMemo(() => {
    const last = pnl.slice(-50);
    if (last.length === 0) return 0;
    const okCount = last.filter(x => x?.ok).length;
    return Math.round((okCount / last.length) * 100);
  }, [pnl]);

  const currentROI = useMemo(() => {
    if (!Array.isArray(pnl) || pnl.length === 0) return 0;
    const base = 1000;
    const end = pnl.reduce((eq, p) => eq * (1 + (Number(p?.roi || 0) / 100)), base);
    return Math.round(((end - base) / base) * 10000) / 100;
  }, [pnl]);

  const badge = (txt, tone="gray") => (
    <span style={{
      fontSize: 12, padding: "2px 8px", borderRadius: 999,
      background: tone==="green" ? "#1d3b2b" : tone==="red" ? "#3b1d1d" : "#2a2f3b",
      color:      tone==="green" ? "#66d19e" : tone==="red" ? "#f88"   : "#aab2c5",
      marginLeft: 8
    }}>{txt}</span>
  );

  const card = (children) => (
    <div style={{
      background: "#121725", border: "1px solid #273148",
      borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: "0 6px 20px rgba(0,0,0,0.35)"
    }}>{children}</div>
  );

  const progress = (valuePct) => (
    <div style={{height: 6, background: "#1a2032", borderRadius: 999, overflow: "hidden"}}>
      <div style={{width: `${Math.max(0, Math.min(100, valuePct))}%`, height: "100%", background: "#fbbf24"}} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(1200px 600px at 50% -150px,#0c1120 40%,#090d19 100%)", color: "#e6eaf3" }}>
      <div style={{textAlign: "center", paddingTop: 28, paddingBottom: 8}}>
        <h1 style={{fontSize: 32, fontWeight: 800, letterSpacing: 1}}>KARNA — Live Control</h1>
        <div style={{fontSize: 13, color: "#8ea1c0"}}>
          API: <a href={api.base} style={{color:"#7ab2ff"}}>{api.base}</a>
          {badge(status.ok ? "OK" : "DOWN", status.ok ? "green" : "red")}
        </div>
      </div>

      <div style={{maxWidth: 960, margin: "0 auto", padding: 16}}>
        {card(
          <>
            <h3 style={{margin: 0, marginBottom: 12, fontWeight: 700}}>Targets & Live Metrics</h3>
            <div style={{fontSize: 13, color:"#9fb0cd", marginBottom: 6}}>Accuracy — Target {TARGET_ACCURACY}% {badge("fixed")}</div>
            {progress(currentAccuracy)}
            <div style={{fontSize: 12, marginTop: 6, color: "#95a5c7"}}>
              Current: {currentAccuracy.toFixed(2)}% {badge(`Target ${TARGET_ACCURACY}%`, "green")} {badge("fixed")}
            </div>
            <div style={{height:10}}/>
            <div style={{fontSize: 13, color:"#9fb0cd", marginBottom: 6}}>ROI — Target {TARGET_ROI}% {badge("fixed")}</div>
            {progress(currentROI)}
            <div style={{fontSize: 12, marginTop: 6, color: "#95a5c7"}}>
              Current: {currentROI.toFixed(2)}% {badge(`Target ${TARGET_ROI}%`, "green")} {badge("fixed")}
            </div>
          </>
        )}

        {card(<Row title="All-Crypto (Binance Spot)" state={status.stateAll} onStart={() => start("ALL")} onStop={() => stop("ALL")} log={logAll} />)}
        {card(<Row title="$100 ➜ $10M Challenge (Bybit Futures)" state={status.stateChal} onStart={() => start("CHALLENGE")} onStop={() => stop("CHALLENGE")} log={logChal} />)}

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 14}}>
          {card(<BalancesCard title="Balances — All" balances={balancesAll} />)}
          {card(<BalancesCard title="Balances — Challenge" balances={balancesChal} />)}
        </div>

        {card(
          <>
            <h3 style={{marginTop:0}}>Challenge — Compound Equity Curve (Target vs. Actual)</h3>
            <ProfitChart pnl={pnl}/>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ title, state, onStart, onStop, log=[] }) {
  const btn = (label, tone, onClick) => (
    <button
      onClick={onClick}
      style={{
        border: "none", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
        background: tone==="green" ? "#1f7a4d" : "#8b2323",
        color: "white", fontWeight: 600, marginRight: 8
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div style={{fontWeight:700}}>{title}</div>
        <div style={{display:"flex", alignItems:"center", gap: 8}}>
          {btn("Start","green",onStart)}
          {btn("Stop","red",onStop)}
          <span style={{fontSize:12, color:"#aab2c5"}}>State: {state}</span>
        </div>
      </div>
      <div style={{marginTop:8, fontSize:12, color:"#98a6c7"}}>
        Recent: {log.length ? log.join(" • ") : "No signals yet."}
      </div>
    </>
  );
}
