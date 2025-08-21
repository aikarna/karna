import React, { useEffect, useMemo, useState } from "react";

/**
 * Simple API helper using the Vite env var.
 * In your terminal we already set: VITE_API=http://localhost:5001
 */
const API = import.meta.env.VITE_API || "http://localhost:5001";
const json = (r) => r.json();

/** Fixed targets you asked for */
const TARGETS = {
  accuracy: 0.92, // 92%
  roi: 0.25,      // 25%
};

/** UI bits */
const pill = (txt, color = "#16a34a") => (
  <span
    style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      background: color,
      color: "white",
      fontSize: 12,
      marginLeft: 6,
    }}
  >
    {txt}
  </span>
);

export default function BotKarnaDashboard() {
  const [status, setStatus] = useState({
    all: { running: false, lastSignal: null, recent: [] },
    challenge: { running: false, lastSignal: null, recent: [] },
    apiOk: false,
  });
  const [balances, setBalances] = useState({
    all: [],
    challenge: [],
  });
  const [busy, setBusy] = useState({ all: false, challenge: false });
  const [errors, setErrors] = useState(null);

  // current metrics – if your server starts returning real numbers later,
  // we’ll read them; otherwise we keep 0s and just show your targets.
  const [metrics, setMetrics] = useState({
    accuracy: 0,
    roi: 0,
  });

  /** Fetch helpers */
  const safeFetch = async (path, opts) => {
    try {
      const r = await fetch(`${API}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      return await r.json();
    } catch (e) {
      setErrors(`Network error: ${e.message}`);
      return { ok: false, message: e.message };
    }
  };

  const loadStatus = async () => {
    const s = await safeFetch("/status");
    if (s && s.ok !== false) {
      // Expected shape (best-effort): { all: { running, recent }, challenge: {...}, apiOk }
      setStatus({
        all: s.all || { running: false, recent: [] },
        challenge: s.challenge || { running: false, recent: [] },
        apiOk: s.apiOk ?? true,
      });
    }
  };

  const loadBalances = async () => {
    const a = await safeFetch(`/api/v3/account?mode=all`);
    const c = await safeFetch(`/api/v3/account?mode=challenge`);
    setBalances({
      all: (a && a.balances) || balances.all,
      challenge: (c && c.balances) || balances.challenge,
    });
  };

  const loadMetrics = async () => {
    // If you later add /metrics on the server, we’ll consume it.
    // For now we’ll ignore errors and keep defaults.
    const m = await safeFetch(`/metrics`);
    if (m && m.ok !== false) {
      const acc = typeof m.accuracy === "number" ? m.accuracy : 0;
      const roi = typeof m.roi === "number" ? m.roi : 0;
      setMetrics({ accuracy: acc, roi });
    }
  };

  /** Start / Stop */
  const start = async (mode) => {
    setBusy((b) => ({ ...b, [mode]: true }));
    setErrors(null);
    const res = await safeFetch(`/start/${mode}`, { method: "POST" });
    setBusy((b) => ({ ...b, [mode]: false }));
    if (res && res.ok === false) setErrors(res.message || "Start failed");
    await loadStatus();
  };

  const stop = async (mode) => {
    setBusy((b) => ({ ...b, [mode]: true }));
    setErrors(null);
    const res = await safeFetch(`/stop/${mode}`, { method: "POST" });
    setBusy((b) => ({ ...b, [mode]: false }));
    if (res && res.ok === false) setErrors(res.message || "Stop failed");
    await loadStatus();
  };

  /** Initial + polling */
  useEffect(() => {
    (async () => {
      await loadStatus();
      await loadBalances();
      await loadMetrics();
    })();
    const t = setInterval(() => {
      loadStatus();
      loadBalances();
      loadMetrics();
    }, 5000);
    return () => clearInterval(t);
  }, []);

  /** Pretty percentages */
  const fmtPct = (v) => `${(v * 100).toFixed(2)}%`;

  const Panel = ({ title, children, extraRight }) => (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
        background: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div>{extraRight}</div>
      </div>
      {children}
    </div>
  );

  const RunButtons = ({ mode }) => {
    const running = status[mode]?.running;
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => start(mode)}
          disabled={!!running || busy[mode]}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #16a34a",
            background: running ? "#a7f3d0" : "#16a34a",
            color: "white",
            opacity: running ? 0.6 : 1,
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          Start
        </button>
        <button
          onClick={() => stop(mode)}
          disabled={!running || busy[mode]}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid #dc2626",
            background: !running ? "#fecaca" : "#dc2626",
            color: "white",
            opacity: !running ? 0.6 : 1,
            cursor: !running ? "not-allowed" : "pointer",
          }}
        >
          Stop
        </button>
        <div style={{ fontSize: 12, color: "#6b7280", paddingTop: 8 }}>
          State:{" "}
          <b style={{ color: running ? "#16a34a" : "#6b7280" }}>
            {running ? "RUNNING" : "IDLE"}
          </b>
        </div>
      </div>
    );
  };

  const MetricRow = ({ label, value, target }) => {
    const pct = Math.max(0, Math.min(1, value));
    const tgt = Math.max(0, Math.min(1, target));
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          <b>{label}</b> — Target {fmtPct(tgt)} {pill("fixed")}
        </div>
        <div
          style={{
            position: "relative",
            height: 10,
            background: "#f3f4f6",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct * 100}%`,
              background: "#4f46e5",
            }}
          />
          <div
            title="target"
            style={{
              position: "absolute",
              left: `${tgt * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: "#f59e0b",
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Current: <b>{fmtPct(pct)}</b>
        </div>
      </div>
    );
  };

  const ListBalances = ({ rows }) => {
    if (!rows || !rows.length) return <div style={{ color: "#6b7280" }}>—</div>;
    return (
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {rows.map((b, i) => (
          <li key={i}>
            {b.asset || b[0]} {b.free ?? b[1]}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div style={{ padding: 18, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>KARNA — Live Control</div>
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        API: <a href={API} target="_blank">{API}</a> •{" "}
        Status {pill(status.apiOk ? "OK" : "DOWN", status.apiOk ? "#16a34a" : "#dc2626")}
      </div>

      {errors && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          {errors}
        </div>
      )}

      <Panel title="Targets & Live Metrics">
        <MetricRow label="Accuracy" value={metrics.accuracy} target={TARGETS.accuracy} />
        <MetricRow label="ROI" value={metrics.roi} target={TARGETS.roi} />
      </Panel>

      <Panel
        title="All-Crypto (Binance Spot)"
        extraRight={<RunButtons mode="all" />}
      >
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          Recent:{" "}
          {status.all?.recent?.length
            ? status.all.recent[0]
            : "No signals yet."}
        </div>
      </Panel>

      <Panel
        title="$100 ➜ $10M Challenge (Bybit Futures)"
        extraRight={<RunButtons mode="challenge" />}
      >
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          Recent:{" "}
          {status.challenge?.recent?.length
            ? status.challenge.recent[0]
            : "No signals yet."}
        </div>
      </Panel>

      <Panel title="Balances — All">
        <ListBalances rows={balances.all} />
      </Panel>

      <Panel title="Balances — Challenge">
        <ListBalances rows={balances.challenge} />
      </Panel>
    </div>
  );
}
