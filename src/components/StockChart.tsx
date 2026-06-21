"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, AreaSeries, ColorType, type UTCTimestamp, type IChartApi } from "lightweight-charts";
import Logo from "./Logo";
import type { Stock } from "./StockTicker";

interface OHLCV {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function Stat({ label, value, color = "text-gray-200" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}

export default function StockChart({ stock, onClose }: { stock: Stock; onClose: () => void }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([]);
  const [range, setRange] = useState("30D");
  const [loading, setLoading] = useState(true);

  const up = stock.change >= 0;
  const accent = up ? "#4ade80" : "#f87171";

  // Fetch the OHLCV history embedded in the stock chunk's text.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "stocks", limit: 50 }),
        });
        const data = await r.json();
        const chunk = data.chunks?.find((c: { title: string; text: string }) => c.title.startsWith(stock.symbol + " "));
        if (chunk) {
          const match = chunk.text.match(/\|history:(\[.*\])$/);
          if (match && alive) {
            const rows = JSON.parse(match[1]) as number[][];
            setOhlcv(rows.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })));
          }
        }
      } catch {
        /* fall back to localStorage series */
      }
      if (alive) setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [stock.symbol]);

  // Area-fallback series from the localStorage price points (value only).
  const areaSeries = (() => {
    const byT = new Map<number, number>();
    for (const p of stock.history) byT.set(p.t, p.v);
    return [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ time: t as UTCTimestamp, value: v }));
  })();

  const useCandles = ohlcv.length >= 2;
  const useArea = !useCandles && areaSeries.length >= 2;
  const hasChart = useCandles || useArea;

  useEffect(() => {
    if (loading || !hasChart || !chartRef.current) return;
    const chart: IChartApi = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 260,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9ca3af", fontSize: 11 },
      grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
      rightPriceScale: { borderColor: "#374151" },
      timeScale: { borderColor: "#374151", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });

    if (useCandles) {
      const sorted = [...new Map(ohlcv.map((p) => [p.t, p])).values()].sort((a, b) => a.t - b.t);
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#00d4aa",
        downColor: "#ff4444",
        borderUpColor: "#00d4aa",
        borderDownColor: "#ff4444",
        wickUpColor: "#00d4aa",
        wickDownColor: "#ff4444",
      });
      candleSeries.setData(sorted.map((p) => ({ time: p.t as UTCTimestamp, open: p.o, high: p.h, low: p.l, close: p.c })));

      const volSeries = chart.addSeries(HistogramSeries, {
        color: "#00d4aa44",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(sorted.map((p) => ({ time: p.t as UTCTimestamp, value: p.v, color: p.c >= p.o ? "#00d4aa44" : "#ff444444" })));
    } else {
      const area = chart.addSeries(AreaSeries, {
        lineColor: accent,
        topColor: up ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)",
        bottomColor: "rgba(0,0,0,0)",
        lineWidth: 2,
      });
      area.setData(areaSeries);
    }

    const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const days = range === "7D" ? 7 : range === "30D" ? 30 : 365;
    try {
      chart.timeScale().setVisibleRange({ from: (now - days * 86400) as UTCTimestamp, to: now });
    } catch {
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => chartRef.current && chart.applyOptions({ width: chartRef.current.clientWidth }));
    ro.observe(chartRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [loading, hasChart, useCandles, ohlcv, areaSeries, range, accent, up]);

  const latestVol = ohlcv[ohlcv.length - 1]?.v;
  const volStr = latestVol ? `${(latestVol / 1e6).toFixed(1)}M` : "—";

  return (
    <div className="anim-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="anim-modal w-full max-w-2xl rounded-lg border border-gray-700 bg-[#0d0d14] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <Logo domain={stock.domain} name={stock.name} size={48} />
          <div>
            <div className="text-lg font-bold text-white">{stock.name}</div>
            <div className="text-xs text-gray-500">{stock.symbol}</div>
          </div>
          <button onClick={onClose} className="ml-auto rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-white">
            ✕
          </button>
        </div>

        <div className="my-4">
          {loading ? (
            <div className="flex items-center justify-center rounded border border-gray-800 bg-black/30 py-16 text-xs text-gray-600">Loading history…</div>
          ) : hasChart ? (
            <>
              <div className="mb-2 flex gap-2">
                {["7D", "30D", "1Y"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className="rounded px-2 py-0.5 font-mono text-[10px]"
                    style={{
                      color: range === r ? "#00d4aa" : "#555",
                      borderBottom: `1px solid ${range === r ? "#00d4aa" : "transparent"}`,
                      background: "transparent",
                    }}
                  >
                    {r === "1Y" && ohlcv.length < 300 ? "1Y (30D max)" : r}
                  </button>
                ))}
              </div>
              <div ref={chartRef} className="w-full" />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded border border-gray-800 bg-black/30 py-10">
              <div className="text-4xl font-bold text-white">{stock.price?.toFixed(2) ?? "--"}</div>
              <div style={{ color: accent }} className="mt-1 text-sm font-bold">
                {up ? "▲" : "▼"} {stock.change.toFixed(2)} ({stock.changePct.toFixed(2)}%)
              </div>
              <div className="mt-2 text-[11px] text-gray-600">Run Fetch to load 30-day price history.</div>
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-800 pt-3">
          <Stat label="Price" value={stock.price != null ? stock.price.toFixed(2) : "--"} />
          <Stat label="Change $" value={stock.change.toFixed(2)} color={up ? "text-emerald-400" : "text-red-400"} />
          <Stat label="Change %" value={`${stock.changePct.toFixed(2)}%`} color={up ? "text-emerald-400" : "text-red-400"} />
          <Stat label="Volume" value={volStr} color="text-gray-500" />
        </div>
      </div>
    </div>
  );
}
