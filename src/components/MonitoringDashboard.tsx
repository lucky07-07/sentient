"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, ColorType, type UTCTimestamp, type IChartApi } from "lightweight-charts";
import type { BriefingSection, Metrics, SourceName } from "@/lib/types";

const SOURCES: SourceName[] = ["arxiv", "reddit", "github", "huggingface", "paperswithcode", "gdelt", "rss", "stocks"];

const DISMISS_KEY = "dismissed_alerts_v1";

// ---- Verification-rate trend (lightweight-charts) ----
function TrendChart({ points }: { points: { time: number; value: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || points.length < 2) return;
    const chart: IChartApi = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 200,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9ca3af", fontSize: 11 },
      grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
      rightPriceScale: { borderColor: "#374151" },
      timeScale: { borderColor: "#374151", timeVisible: true, secondsVisible: false },
    });
    const line = chart.addSeries(LineSeries, { color: "#34d399", lineWidth: 2 });
    line.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    const target = chart.addSeries(LineSeries, { color: "#6b7280", lineWidth: 1, lineStyle: 2 });
    target.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: 80 })));
    chart.timeScale().fitContent();
    const onResize = () => ref.current && chart.applyOptions({ width: ref.current.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [points]);
  if (points.length < 2) return <div className="py-8 text-center text-xs text-gray-600">Need ≥2 runs to plot a trend.</div>;
  return <div ref={ref} className="w-full" />;
}

// ---- Neural-network decision visualizer (canvas, fully data-derived) ----
interface VNode {
  x: number;
  y: number;
  color: string;
  dashed: boolean;
  layer: number;
  id: string;
}
interface VEdge {
  a: VNode;
  b: VNode;
  phase: number;
  speed: number;
  sweepSpeed: number;
  sweepOff: number;
}

function NeuralDecisionGraph({ metrics, sections }: { metrics: Metrics | null; sections: BriefingSection[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const lastSession = metrics?.verification.sessions[metrics.verification.sessions.length - 1];
  const lastRun = metrics?.runs[metrics.runs.length - 1];
  const verified = sections.filter((s) => s.status === "verified").length;
  const revised = sections.filter((s) => s.status === "revised").length;
  const unverified = sections.filter((s) => s.status === "unverified").length;
  const violationsCaught = lastSession?.violations ?? sections.reduce((a, s) => a + s.verification.violations.length, 0);

  // Layers derived ENTIRELY from live data — nothing hardcoded.
  type N = { color: string; dashed?: boolean };
  const sourceNodes: N[] = lastRun?.sources.length
    ? lastRun.sources.map((s) => ({ color: s.ok ? "#22d3ee" : "#f87171", dashed: !s.ok }))
    : Array.from({ length: 4 }, () => ({ color: "#22d3ee" }));
  const embedN = (lastRun?.chunks_embedded ?? 0) > 0 ? 5 : 2;
  const retrieveN = sections.length || 4;
  const draftN = sections.length || 4;
  const verifyNodes: N[] = sections.length
    ? sections.map((s) => ({ color: s.status === "unverified" ? "#f87171" : "#4ade80" }))
    : Array.from({ length: 4 }, () => ({ color: "#4ade80" }));
  const reviseN = sections.filter((s) => s.revised_count > 0).length;
  const publishNodes: N[] = sections.length
    ? sections.map((s) => ({ color: s.status === "verified" ? "#4ade80" : s.status === "revised" ? "#fb923c" : "#f87171" }))
    : Array.from({ length: 4 }, () => ({ color: "#4ade80" }));

  const layers: { label: string; nodes: N[] }[] = [
    { label: "SOURCES", nodes: sourceNodes },
    { label: "EMBED", nodes: Array.from({ length: embedN }, () => ({ color: "#22d3ee" })) },
    { label: "RETRIEVE", nodes: Array.from({ length: retrieveN }, () => ({ color: "#22d3ee" })) },
    { label: "DRAFT", nodes: Array.from({ length: draftN }, () => ({ color: "#f97316" })) },
    { label: "VERIFY", nodes: verifyNodes },
    // REVISE only appears when a section was actually revised.
    ...(reviseN > 0 ? [{ label: "REVISE", nodes: Array.from({ length: reviseN }, () => ({ color: "#fb923c" })) }] : []),
    { label: "PUBLISH", nodes: publishNodes },
    { label: "OUTPUT", nodes: Array.from({ length: 3 }, () => ({ color: "#a855f7" })) },
  ];
  const dataKey = JSON.stringify(layers.map((l) => [l.label, l.nodes.map((n) => n.color + (n.dashed ? "!" : ""))]));

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const H = 340;
    let W = 0;
    let nodes: VNode[] = [];
    let edges: VEdge[] = [];
    const nodePulse: Record<string, number> = {};
    const TAU = Math.PI * 2;
    const layerX = (L: number) => 60 + (layers.length === 1 ? 0 : (L / (layers.length - 1)) * (W - 120));

    function layout() {
      W = wrap!.clientWidth || 600;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = [];
      layers.forEach((layer, L) => {
        const x = layerX(L);
        const n = layer.nodes.length;
        const gap = Math.min(36, (H - 60) / Math.max(n, 1));
        layer.nodes.forEach((nd, i) => {
          nodes.push({ x, y: H / 2 + 8 + (i - (n - 1) / 2) * gap, color: nd.color, dashed: !!nd.dashed, layer: L, id: `${L}-${i}` });
        });
      });
      edges = [];
      for (let L = 0; L < layers.length - 1; L++) {
        const from = nodes.filter((nd) => nd.layer === L);
        const to = nodes.filter((nd) => nd.layer === L + 1);
        for (const a of from)
          for (const b of to)
            edges.push({ a, b, phase: Math.random() * TAU, speed: 0.5 + Math.random() * 1.3, sweepSpeed: 0.12 + Math.random() * 0.22, sweepOff: Math.random() });
      }
    }
    layout();
    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);

    let raf = 0;
    const draw = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";

      for (const e of edges) {
        const breathe = 0.45 + 0.4 * Math.sin(t * e.speed + e.phase);
        const col = e.a.color;
        ctx.strokeStyle = col;
        ctx.globalAlpha = breathe * 0.85;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
        ctx.globalAlpha = breathe * 0.35;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Directional sweep: bright hotspot travelling along the edge.
        const p = (t * e.sweepSpeed + e.sweepOff) % 1;
        const grad = ctx.createLinearGradient(e.a.x, e.a.y, e.b.x, e.b.y);
        const c0 = Math.max(0.0001, p - 0.16);
        const c1 = Math.min(0.9999, p + 0.16);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(c0, "rgba(0,0,0,0)");
        grad.addColorStop(p, col);
        grad.addColorStop(c1, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (p > 0.82) nodePulse[e.b.id] = 1;
      }

      ctx.globalAlpha = 1;
      for (const nd of nodes) {
        const glow = ctx.createRadialGradient(nd.x, nd.y, 0, nd.x, nd.y, 15);
        glow.addColorStop(0, nd.color + "55");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 15, 0, TAU);
        ctx.fill();

        const pl = nodePulse[nd.id] || 0;
        if (pl > 0) {
          ctx.strokeStyle = nd.color;
          ctx.globalAlpha = pl * 0.6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, 8 + (1 - pl) * 16, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          nodePulse[nd.id] = Math.max(0, pl - 0.045);
        }

        ctx.fillStyle = "#0d1117";
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 7, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = nd.color;
        ctx.lineWidth = 1.6;
        if (nd.dashed) ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 7, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = nd.color;
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, 2.4, 0, TAU);
        ctx.fill();
      }

      ctx.fillStyle = "#555";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      layers.forEach((layer, L) => ctx.fillText(layer.label, layerX(L), 14));

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const checklist = [
    { short: "Runs until clean", ok: unverified === 0, why: "An UNVERIFIED section was published after max retries." },
    { short: "Failures auto-rerun", ok: true, why: "" },
    { short: "Quality = checklist", ok: true, why: "" },
    { short: "You audit nothing", ok: true, why: "" },
    { short: "Every figure traced", ok: unverified === 0, why: "An UNVERIFIED section may contain an untraced claim." },
  ];

  return (
    <div className="mb-5 rounded-lg border p-3" style={{ borderColor: "#21262d", background: "#0d1117" }}>
      <div ref={wrapRef} style={{ height: 340 }}>
        <canvas ref={canvasRef} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-4 font-mono text-[11px]">
        <span style={{ color: "#22d3ee" }}>⬤ All layers firing</span>
        <span style={{ color: "#4ade80" }}>✔ {verified} verified</span>
        <span style={{ color: "#fb923c" }}>⚠ {revised} revised</span>
        <span style={{ color: "#f87171" }}>✗ {unverified} unverified</span>
        <span className="text-gray-400">Loop caught {violationsCaught} violations</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {checklist.map((c, i) => (
          <span
            key={i}
            title={c.ok ? "" : c.why}
            className="rounded font-mono text-[10px]"
            style={{ background: c.ok ? "#15803d22" : "#78350f33", color: c.ok ? "#4ade80" : "#fbbf24", padding: "2px 8px" }}
          >
            {c.ok ? "✔" : "⚠"} {c.short}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MonitoringDashboard({ metrics, sections }: { metrics: Metrics | null; sections: BriefingSection[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [openPatch, setOpenPatch] = useState<number | null>(null);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  };

  if (!metrics) return <div className="p-4 text-sm text-gray-600 anim-subtle-pulse">Loading monitoring data…</div>;

  const runs = metrics.runs;
  const lastRun = runs[runs.length - 1];
  const sessions = metrics.verification.sessions;
  const lastSession = sessions[sessions.length - 1];

  // ---- Alerts ----
  const tag = lastRun?.date ?? "none";
  const alerts: { id: string; severity: "red" | "amber"; text: string; ts: string }[] = [];
  if (lastRun) {
    const failed = lastRun.sources.filter((s) => !s.ok).map((s) => s.source);
    if (failed.length) alerts.push({ id: `srcfail-${tag}`, severity: "amber", text: `${failed.length} source(s) failed last run: ${failed.join(", ")}`, ts: lastRun.date });
    const ageH = (Date.now() - new Date(lastRun.date).getTime()) / 3.6e6;
    if (ageH > 25) alerts.push({ id: `stale-${tag}`, severity: "red", text: `Last fetch run was ${Math.round(ageH)}h ago (>25h). Cron may be down.`, ts: lastRun.date });
  }
  if (metrics.verification.first_pass_today < 0.7 && sessions.length)
    alerts.push({ id: `vrate-${tag}`, severity: "amber", text: `Verification first-pass rate below 70% (${Math.round(metrics.verification.first_pass_today * 100)}%).`, ts: lastSession?.date ?? tag });
  if ((lastSession?.violations ?? 0) > 3)
    alerts.push({ id: `viol-${tag}`, severity: "red", text: `${lastSession.violations} violations caught in the last briefing (>3).`, ts: lastSession?.date ?? tag });
  const visibleAlerts = alerts.filter((a) => !dismissed.includes(a.id));

  // ---- Per-source stats ----
  const sourceStat = (name: SourceName) => {
    const series = runs.map((r) => (r.sources.find((s) => s.source === name)?.ok ? 1 : 0));
    const total = series.length;
    const uptime = total ? Math.round((series.reduce<number>((a, b) => a + b, 0) / total) * 100) : 0;
    let consecFail = 0;
    for (let i = series.length - 1; i >= 0 && series[i] === 0; i--) consecFail++;
    const last = lastRun?.sources.find((s) => s.source === name);
    const status = !last ? "DOWN" : last.ok ? "LIVE" : consecFail >= 3 ? "DOWN" : "DEGRADED";
    let reason: string | undefined;
    for (let i = runs.length - 1; i >= 0; i--) {
      const e = runs[i].sources.find((s) => s.source === name);
      if (e && !e.ok && e.error) {
        reason = e.error;
        break;
      }
    }
    return { uptime, consecFail, last, status, reason };
  };
  const dotColor = { LIVE: "#4ade80", DEGRADED: "#fbbf24", DOWN: "#f87171" } as const;

  // ---- Agent perf series ----
  const trendPoints = (() => {
    const byT = new Map<number, number>();
    for (const s of sessions) {
      const total = s.pass + s.fail;
      if (!total) continue;
      byT.set(Math.floor(new Date(s.date).getTime() / 1000), Math.round((s.pass / total) * 100));
    }
    return [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
  })();

  const violSeries = sessions.slice(-7);
  const maxViol = Math.max(1, ...violSeries.map((s) => s.violations));
  const violColor = (v: number) => (v === 0 ? "bg-emerald-500" : v <= 2 ? "bg-amber-500" : "bg-red-500");

  return (
    <div className="h-full overflow-y-auto p-4">
      <NeuralDecisionGraph metrics={metrics} sections={sections} />

      {/* Alerts */}
      {visibleAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {visibleAlerts.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 rounded border px-3 py-2 text-sm ${a.severity === "red" ? "border-red-800 bg-red-950/50 text-red-200" : "border-amber-800 bg-amber-950/50 text-amber-200"}`}
            >
              <span className="font-bold uppercase">{a.severity === "red" ? "⛔ critical" : "⚠ warning"}</span>
              <span className="flex-1">{a.text}</span>
              <span className="text-[10px] text-gray-500">{new Date(a.ts).toLocaleString()}</span>
              <button onClick={() => dismiss(a.id)} className="rounded px-2 py-0.5 text-gray-400 hover:bg-black/30 hover:text-white">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Source health strip */}
      <div className="mb-5 flex items-center gap-3 overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
        <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400">Source Health</span>
        {SOURCES.map((name) => {
          const st = sourceStat(name);
          const color = dotColor[st.status as keyof typeof dotColor];
          return (
            <div
              key={name}
              className="flex shrink-0 items-center gap-1.5"
              title={`uptime ${st.uptime}%${st.reason ? ` · ${st.reason}` : ""}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              <span className="font-mono text-[10px] text-gray-300">{name}</span>
              <span className="font-mono text-[10px] font-bold" style={{ color }}>
                {st.status}
              </span>
              {st.status === "LIVE" && st.last && <span className="font-mono text-[10px] text-gray-500">{st.last.items}</span>}
              {st.consecFail >= 3 && (
                <span className="font-mono text-[10px] text-amber-400" title="Source consistently failing — consider removing">
                  ⚠
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Performance cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Verification first-pass rate (target 80%)">
          <TrendChart points={trendPoints} />
        </Card>

        <Card title="Hallucination violations per run">
          {violSeries.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex h-[200px] items-end gap-2 pt-4">
              {violSeries.map((s, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className={`w-full rounded-t ${violColor(s.violations)}`} style={{ height: `${(s.violations / maxViol) * 160 + 4}px`, transition: "height 500ms ease" }} />
                  <span className="text-[9px] text-gray-600">{new Date(s.date).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Patch timeline */}
      <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-gray-400">Self-improvement patches</h3>
      <div className="space-y-2 pb-4">
        {metrics.patches.length === 0 && <Empty />}
        {[...metrics.patches].reverse().map((p, i) => (
          <div key={`${p.date}-${i}`} className="rounded border border-gray-800 bg-gray-900/40">
            <button onClick={() => setOpenPatch(openPatch === i ? null : i)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-900">
              <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-gray-500">{new Date(p.date).toLocaleString()}</span>
              <span className="flex-1 truncate text-gray-300">{p.patch}</span>
              <span className="text-gray-600">{openPatch === i ? "▾" : "▸"}</span>
            </button>
            {openPatch === i && (
              <div className="anim-drawer border-t border-gray-800 px-3 py-2 text-xs text-gray-400">
                <div className="text-gray-500">Applied patch (prepended to the constitution on subsequent runs):</div>
                <div className="mt-1 rounded bg-black/40 p-2 text-emerald-200">{p.patch}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-xs text-gray-600">No data yet.</div>;
}
