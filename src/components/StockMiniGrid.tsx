"use client";

import { useEffect, useId, useRef, useState } from "react";
import Logo from "./Logo";
import { type Stock } from "./StockTicker";

// Copied inline (not imported) to avoid a circular dependency with StockTicker.
const META: Record<string, { name: string; domain: string }> = {
  NVDA: { name: "NVIDIA", domain: "nvidia.com" },
  MSFT: { name: "Microsoft", domain: "microsoft.com" },
  GOOGL: { name: "Alphabet", domain: "google.com" },
  AMD: { name: "AMD", domain: "amd.com" },
  TSM: { name: "TSMC", domain: "tsmc.com" },
  AVGO: { name: "Broadcom", domain: "broadcom.com" },
  ORCL: { name: "Oracle", domain: "oracle.com" },
  PLTR: { name: "Palantir", domain: "palantir.com" },
};
const TICKERS = Object.keys(META);
const HIST_KEY = "stock_hist_v1";

type Quote = { price: number; prev: number | null; marketCap?: number; peRatio?: number; volume?: number };

function loadHist(): Record<string, { t: number; v: number }[]> {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || "{}");
  } catch {
    return {};
  }
}

function fmtCap(n?: number): string {
  if (n == null) return "—";
  if (n >= 1e12) return `MKT $${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `MKT $${(n / 1e9).toFixed(1)}B`;
  return `MKT $${(n / 1e6).toFixed(1)}M`;
}
function fmtSecondary(q?: Quote): string {
  if (q?.peRatio != null) return `P/E ${q.peRatio.toFixed(1)}x`;
  if (q?.volume != null) return `VOL ${(q.volume / 1e6).toFixed(1)}M`;
  return "—";
}

function MiniSpark({ points, up }: { points: number[]; up: boolean }) {
  const gid = "sp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const color = points.length >= 2 ? (up ? "#00d4aa" : "#ff4444") : "#333";
  let line = "0,18 100,18";
  let area: string | null = null;
  if (points.length >= 2) {
    const max = Math.max(...points);
    const min = Math.min(...points);
    const span = max - min || 1;
    const coords = points.map((v, i) => [(i / (points.length - 1)) * 100, 34 - ((v - min) / span) * 32] as const);
    line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    area = `0,36 ${line} 100,36`;
  }
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: "100%", height: 36, background: "#0a0a0a", borderRadius: 4, margin: "4px 0" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {area && <polygon points={area} fill={`url(#${gid})`} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function StockMiniGrid({ onSelect }: { onSelect: (s: Stock) => void }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [closes, setCloses] = useState<Record<string, number[]>>({});
  const [active, setActive] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const prevPrices = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "stocks", limit: 50 }),
        });
        const data = await r.json();
        if (!alive || !data.ok) return;
        const hist = loadHist();
        const now = Math.floor(Date.now() / 1000);
        const next: Record<string, Quote> = {};
        const closesMap: Record<string, number[]> = {};
        const changed: string[] = [];
        for (const c of data.chunks as { title: string; text: string; marketCap?: number; peRatio?: number; volume?: number }[]) {
          const sym = c.title.split(/\s+/)[0];
          if (!META[sym]) continue;
          const price = parseFloat(c.title.split(/\s+/)[1]);
          const prev = Number(c.text.match(/previous close ([\d.]+)/i)?.[1]) || null;
          if (!Number.isFinite(price)) continue;
          next[sym] = { price, prev, marketCap: c.marketCap, peRatio: c.peRatio, volume: c.volume };
          // 30-day OHLCV history embedded in chunk text → close prices for the sparkline.
          const hm = c.text.match(/\|history:(\[.*\])$/);
          if (hm) {
            try {
              const ohlcv = JSON.parse(hm[1]) as number[][];
              closesMap[sym] = ohlcv.map((p) => p[4]);
              next[sym].volume = ohlcv[ohlcv.length - 1]?.[5] ?? c.volume;
            } catch {
              /* malformed */
            }
          }
          const arr = hist[sym] || [];
          if (!arr.length || arr[arr.length - 1].v !== price) arr.push({ t: now, v: price });
          hist[sym] = arr.slice(-60);
          if (prevPrices.current[sym] != null && prevPrices.current[sym] !== price) changed.push(sym);
          prevPrices.current[sym] = price;
        }
        try {
          localStorage.setItem(HIST_KEY, JSON.stringify(hist));
        } catch {
          /* quota */
        }
        setQuotes(next);
        setCloses(closesMap);
        if (changed.length) {
          setFlash((f) => ({ ...f, ...Object.fromEntries(changed.map((s) => [s, true])) }));
          setTimeout(() => setFlash((f) => ({ ...f, ...Object.fromEntries(changed.map((s) => [s, false])) })), 500);
        }
      } catch {
        /* network */
      }
    }
    poll();
    const id = setInterval(poll, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  function toStock(sym: string): Stock {
    const q = quotes[sym];
    const hist = loadHist()[sym] || [];
    const change = q && q.prev != null ? q.price - q.prev : 0;
    const changePct = q && q.prev ? (change / q.prev) * 100 : 0;
    return { symbol: sym, name: META[sym].name, domain: META[sym].domain, price: q?.price ?? null, prevClose: q?.prev ?? null, change, changePct, history: hist };
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0a0f]">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1.5">
        <span className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color: "#ff6600" }}>
          Markets
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 anim-dot-pulse" />
          live · 60s
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 p-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))" }}>
        {TICKERS.map((sym) => {
          const q = quotes[sym];
          const hist = loadHist()[sym] || [];
          const spark = (closes[sym]?.length ?? 0) >= 2 ? closes[sym].slice(-30) : hist.slice(-7).map((h) => h.v);
          const change = q && q.prev != null ? q.price - q.prev : 0;
          const changePct = q && q.prev ? (change / q.prev) * 100 : 0;
          const up = change >= 0;
          const color = up ? "#00d4aa" : "#ff4444";
          const isActive = active === sym;
          const isFlash = flash[sym];
          return (
            <button
              key={sym}
              onClick={() => {
                setActive(sym);
                onSelect(toStock(sym));
              }}
              className="flex flex-col overflow-hidden rounded-lg text-left transition-all duration-150"
              style={{
                background: isActive ? "#16162a" : "#111118",
                border: `${isActive ? "1px" : "0.5px"} solid ${isActive || isFlash ? color : "#1e1e2e"}`,
                padding: 10,
              }}
            >
              <div className="flex items-center gap-1.5">
                <Logo domain={META[sym].domain} name={META[sym].name} size={20} />
                <span className="font-mono text-[11px] font-bold" style={{ color: "#ccc" }}>
                  {sym}
                </span>
                <span
                  className="ml-auto font-mono text-[9px]"
                  style={{ background: up ? "#00d4aa18" : "#ff444418", color, padding: "2px 6px", borderRadius: 3 }}
                >
                  {q ? `${up ? "▲" : "▼"}${Math.abs(changePct).toFixed(2)}%` : "—"}
                </span>
              </div>
              <span className="mt-1 font-mono text-[15px] font-bold text-white">{q ? q.price.toFixed(2) : "--"}</span>
              <MiniSpark points={spark} up={up} />
              <div className="flex justify-between font-mono text-[9px]" style={{ color: "#555" }}>
                <span>{fmtCap(q?.marketCap)}</span>
                <span>{fmtSecondary(q)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
