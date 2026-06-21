// Tiny fetch helpers with timeout + a browser-like UA (several sources block default agents).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 AIIntelligenceAgent/2.0";

async function withTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, init: RequestInit = {}, ms = 15000): Promise<string> {
  const r = await withTimeout(url, init, ms);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.text();
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, ms = 15000): Promise<T> {
  const r = await withTimeout(url, init, ms);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return (await r.json()) as T;
}
