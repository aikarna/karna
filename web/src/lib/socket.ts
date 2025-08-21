// web/src/lib/socket.ts
const HTTP = import.meta.env.VITE_API || "http://localhost:5001";
const WS = HTTP.replace(/^http/, "ws");

export function connect(onMessage: (payload: any) => void) {
  let ws = new WebSocket(WS);
  ws.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)); } catch {}
  };
  ws.onclose = () => {
    setTimeout(() => { ws = connect(onMessage); }, 2000);
  };
  return ws;
}
