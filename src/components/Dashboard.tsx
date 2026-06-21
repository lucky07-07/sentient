"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BriefingSection, LogLine, Metrics } from "@/lib/types";
import AgentLog from "./AgentLog";
import BriefingPanel from "./BriefingPanel";
import MetricsPanel from "./MetricsPanel";
import MetricsBar from "./MetricsBar";
import DataExplorer from "./DataExplorer";
import AnalystChat from "./AnalystChat";
import StockTicker, { type Stock } from "./StockTicker";
import StockChart from "./StockChart";
import StockMiniGrid from "./StockMiniGrid";
import NetworkGraph from "./NetworkGraph";
import LiveFeed from "./LiveFeed";
import MonitoringDashboard from "./MonitoringDashboard";

type Tab = "briefing" | "explorer" | "monitoring";

export default function Dashboard() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sections, setSections] = useState<BriefingSection[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tab, setTab] = useState<Tab>("briefing");
  const [busy, setBusy] = useState<null | "fetch" | "briefing">(null);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const [progress, setProgress] = useState(0);
  const [barVisible, setBarVisible] = useState(false);
  const startRef = useRef({ logs: 0 });

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.addEventListener("line", (e) => setLogs((prev) => [...prev, JSON.parse((e as MessageEvent).data)].slice(-300)));
    es.addEventListener("counts", (e) => setCounts(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("section", (e) => {
      const s: BriefingSection = JSON.parse((e as MessageEvent).data);
      setSections((prev) => {
        const i = prev.findIndex((p) => p.id === s.id);
        if (i === -1) return [...prev, s];
        const next = [...prev];
        next[i] = s;
        return next;
      });
    });
    return () => es.close();
  }, []);

  const refreshMetrics = useCallback(async () => {
    const r = await fetch("/api/metrics");
    const data = await r.json();
    if (data.ok) setMetrics(data.metrics);
  }, []);

  useEffect(() => {
    refreshMetrics();
  }, [refreshMetrics]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(refreshMetrics, 8000);
    return () => clearInterval(id);
  }, [busy, refreshMetrics]);

  useEffect(() => {
    if (!busy) return;
    const p = busy === "fetch" ? ((logs.length - startRef.current.logs) / 16) * 100 : (sections.length / 6) * 100;
    setProgress(Math.max(6, Math.min(95, p)));
  }, [logs.length, sections.length, busy]);

  useEffect(() => {
    if (busy) {
      setBarVisible(true);
      return;
    }
    if (!barVisible) return;
    setProgress(100);
    const id = setTimeout(() => {
      setBarVisible(false);
      setProgress(0);
    }, 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  async function runFetch() {
    startRef.current = { logs: logs.length };
    setBusy("fetch");
    try {
      await fetch("/api/fetch", { method: "POST" });
    } finally {
      setBusy(null);
      refreshMetrics();
    }
  }

  async function runBriefing() {
    setSections([]);
    setBusy("briefing");
    try {
      await fetch("/api/briefing", { method: "POST" });
    } finally {
      setBusy(null);
      refreshMetrics();
    }
  }

  const panel = "overflow-hidden bg-[#0a0a0f]";

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f]">
      {/* Progress bar */}
      <div className="relative h-0.5 w-full bg-transparent">
        {barVisible && <div className="h-full bg-gradient-to-r from-sky-500 via-emerald-400 to-emerald-300 transition-all duration-300" style={{ width: `${progress}%` }} />}
      </div>

      {/* Nav */}
      <header className="flex items-center gap-4 border-b border-gray-800 px-4 py-2">
        <h1 className="font-mono text-sm font-bold" style={{ color: "#ff6600" }}>
          AI INTELLIGENCE TERMINAL
        </h1>
        <nav className="flex gap-1 text-xs">
          {(
            [
              ["briefing", "Workstation"],
              ["explorer", "Data Explorer"],
              ["monitoring", "Monitoring"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded px-2 py-1 ${tab === t ? "bg-gray-800 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}>
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex gap-2 text-xs">
          <button onClick={runFetch} disabled={busy !== null} className="rounded bg-sky-700 px-3 py-1 font-bold text-white disabled:opacity-50">
            {busy === "fetch" ? "Fetching…" : "Run Fetch"}
          </button>
          <button onClick={runBriefing} disabled={busy !== null} className="rounded bg-emerald-700 px-3 py-1 font-bold text-white disabled:opacity-50">
            {busy === "briefing" ? "Briefing…" : "Run Briefing"}
          </button>
        </div>
      </header>

      {/* Ticker */}
      <StockTicker onSelect={setSelectedStock} />

      {/* Body */}
      {tab === "monitoring" ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-80 shrink-0 overflow-y-auto border-r border-gray-800">
            <MetricsPanel metrics={metrics} counts={counts} sections={sections} />
          </aside>
          <div className="min-w-0 flex-1">
            <MonitoringDashboard metrics={metrics} sections={sections} />
          </div>
        </div>
      ) : tab === "explorer" ? (
        <div className="min-h-0 flex-1">
          <DataExplorer sections={sections} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {/* Left sidebar */}
            <aside className="w-[280px] shrink-0 border-r border-gray-800">
              <AgentLog logs={logs} />
            </aside>
            {/* Terminal grid */}
            <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-[400px_minmax(340px,1fr)] gap-px overflow-auto bg-gray-800">
              <div className={panel}>
                <StockMiniGrid onSelect={setSelectedStock} />
              </div>
              <div className={panel}>
                <NetworkGraph sections={sections} />
              </div>
              <div className={panel}>
                <LiveFeed logs={logs} counts={counts} />
              </div>
              <div className={panel}>
                <BriefingPanel sections={sections} running={busy === "briefing"} />
              </div>
            </div>
          </div>
          {/* Metrics bar */}
          <MetricsBar metrics={metrics} counts={counts} sections={sections} />
        </div>
      )}

      <AnalystChat sections={sections} />

      {selectedStock && <StockChart stock={selectedStock} onClose={() => setSelectedStock(null)} />}
    </div>
  );
}
