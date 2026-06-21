"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";

export interface StockPoint {
  t: number; // unix seconds
  v: number; // price
}
export interface Stock {
  symbol: string;
  name: string;
  domain: string;
  price: number | null;
  prevClose: number | null;
  change: number;
  changePct: number;
  history: StockPoint[];
}

// Ticker → company metadata. TSMC trades as the TSM ADR (matches the fetch source).
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
const ORDER = Object.keys(META);
const HIST_KEY = "stock_hist_v1";

function loadHist(): Record<string, StockPoint[]> {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || "{}");
  } catch {
    return {};
  }
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const vals = points.length >= 2 ? points : [points[0] ?? 0, points[0] ?? 0];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const pts = vals
    .map((v, i) => `${((i / (vals.length - 1)) * 58 + 1).toFixed(1)},${(22 - ((v - min) / span) * 20).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={60} height={24} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function Chip({ s, onSelect }: { s: Stock; onSelect: (s: Stock) => void }) {
  const up = s.change >= 0;
  const color = up ? "#4ade80" : "#f87171";
  const has = s.price != null;
  return (
    <button
      onClick={() => has && onSelect(s)}
      className="flex shrink-0 items-center gap-2 border-r border-gray-800 px-4 py-1.5 hover:bg-gray-900"
    >
      {has ? <Logo domain={s.domain} name={s.name} size={20} /> : <div className="h-5 w-5 rounded-full bg-gray-800" />}
      <span className="font-bold text-white">{s.symbol}</span>
      <span className="text-gray-200">{has ? s.price!.toFixed(2) : "--"}</span>
      {has ? (
        <span style={{ color }} className="text-xs font-bold">
          {up ? "▲" : "▼"} {Math.abs(s.changePct).toFixed(2)}%
        </span>
      ) : (
        <span className="text-xs text-gray-600">--</span>
      )}
      {has && <Sparkline points={s.history.slice(-7).map((h) => h.v)} color={color} />}
    </button>
  );
}

export default function StockTicker({ onSelect }: { onSelect: (s: Stock) => void }) {
  const [stocks, setStocks] = useState<Stock[]>([]);

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
        const parsed: Record<string, { price: number; prev: number | null }> = {};
        for (const c of data.chunks as { title: string; text: string }[]) {
          const sym = c.title.split(/\s+/)[0];
          if (!META[sym]) continue;
          const price = parseFloat(c.title.split(/\s+/)[1]);
          const prev = Number(c.text.match(/previous close ([\d.]+)/i)?.[1]) || null;
          if (Number.isFinite(price)) parsed[sym] = { price, prev };
        }

        // Append to per-symbol history (dedupe identical consecutive prices).
        for (const [sym, { price }] of Object.entries(parsed)) {
          const arr = hist[sym] || [];
          if (!arr.length || arr[arr.length - 1].v !== price) arr.push({ t: now, v: price });
          hist[sym] = arr.slice(-60);
        }
        try {
          localStorage.setItem(HIST_KEY, JSON.stringify(hist));
        } catch {
          /* quota */
        }

        const next: Stock[] = ORDER.map((sym) => {
          const p = parsed[sym];
          const change = p && p.prev != null ? p.price - p.prev : 0;
          const changePct = p && p.prev ? (change / p.prev) * 100 : 0;
          return {
            symbol: sym,
            name: META[sym].name,
            domain: META[sym].domain,
            price: p ? p.price : null,
            prevClose: p?.prev ?? null,
            change,
            changePct,
            history: hist[sym] || [],
          };
        });
        setStocks(next);
      } catch {
        /* network */
      }
    }

    poll();
    const id = setInterval(poll, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Placeholder chips before the first fetch populates stock data.
  const display: Stock[] =
    stocks.length > 0
      ? stocks
      : ORDER.map((sym) => ({
          symbol: sym,
          name: META[sym].name,
          domain: META[sym].domain,
          price: null,
          prevClose: null,
          change: 0,
          changePct: 0,
          history: [],
        }));

  const hasData = stocks.some((s) => s.price != null);

  return (
    <div className="ticker-wrap overflow-hidden border-b border-gray-800 bg-black/40">
      <div className={`flex w-max ${hasData ? "ticker-track" : ""}`}>
        {[0, 1].map((dup) => (
          <div key={dup} className="flex" aria-hidden={dup === 1}>
            {display.map((s) => (
              <Chip key={`${dup}-${s.symbol}`} s={s} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
