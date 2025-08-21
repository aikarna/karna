// web/src/lib/api.ts
export default class APIClient {
  base: string;
  constructor(base?: string) {
    const fallback = "http://localhost:5001";
    this.base = (base || import.meta.env.VITE_API || fallback).replace(/\/+$/, "");
  }
  async _req(path: string, init?: RequestInit) {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    // Treat any 200 as reachable (status OK shown elsewhere)
    if (!res.ok) throw new Error(`${res.status}`);
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  get(path: string)  { return this._req(path); }
  post(path: string, body?: any) {
    return this._req(path, { method: "POST", body: body ? JSON.stringify(body) : "{}" });
  }
}
