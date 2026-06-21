"use client";

import { useEffect, useRef, useState } from "react";
import type { BriefingSection, Metrics, SourceName } from "@/lib/types";
import Sparkline from "./Sparkline";
import AnimatedNumber from "./AnimatedNumber";
import Logo from "./Logo";

const COMPANIES: { name: string; domain: string; kw: string[] }[] = [
  { name: "OpenAI", domain: "openai.com", kw: ["openai"] },
  { name: "Anthropic", domain: "anthropic.com", kw: ["anthropic", "claude"] },
  { name: "Google DeepMind", domain: "deepmind.com", kw: ["deepmind", "google"] },
  { name: "xAI", domain: "x.ai", kw: ["xai", "grok"] },
  { name: "Meta AI", domain: "meta.com", kw: ["meta ai", "llama", "meta"] },
  { name: "Mistral", domain: "mistral.ai", kw: ["mistral"] },
  { name: "Cohere", domain: "cohere.com", kw: ["cohere"] },
  { name: "DeepSeek", domain: "deepseek.com", kw: ["deepseek"] },
];
const DATA_SOURCES: SourceName[] = ["arxiv", "github", "rss", "stocks"];

function Ring({ pct }: { pct: number }) {
  const r = 26;
  const C = 2 * Math.PI * r;
  const color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#fbbf24" : "#f87171";
  return (
    <svg width={64} height={64}>
      <circle cx={32} cy={32} r={r} stroke="#1f2937" strokeWidth={6} fill="none" />
      <circle
        cx={32}
        cy={32}
        r={r}
        stroke={color}
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - pct / 100)}
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
      <text x={32} y={37} textAnchor="middle" fontSize={14} fontWeight={700} fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

function ViolationsBadge({ value }: { value: number }) {
  const prev = useRef(value);
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (value > prev.current) setShake((k) => k + 1);
    prev.current = value;
  }, [value]);
  return (
    <span key={shake} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-red-900/60 px-2 text-lg font-bold text-red-300 ${shake ? "anim-shake" : ""}`}>
      {value}
    </span>
  );
}

export default function MetricsPanel({
  metrics,
  counts,
  sections,
}: {
  metrics: Metrics | null;
  counts: Record<string, number>;
  sections: BriefingSection[];
}) {
  if (!metrics) return <div className="p-3 text-xs text-gray-600 anim-subtle-pulse">Loading metrics…</div>;

  const last7 = metrics.runs.slice(-7);
  const lastRun = metrics.runs[metrics.runs.length - 1];
  const lastTokens = metrics.tokens[metrics.tokens.length - 1];
  const lastSession = metrics.verification.sessions[metrics.verification.sessions.length - 1];

  const chunks = counts["embed:chunks"] ?? 0;
  const passPct = Math.round(metrics.verification.first_pass_today * 100);
  const violations = lastSession?.violations ?? 0;
  const inTok = lastTokens?.input ?? 0;
  const outTok = lastTokens?.output ?? 0;
  const totTok = inTok + outTok;

  const rssFailed = lastRun?.sources.find((s) => s.source === "rss")?.ok === false;
  const briefingText = sections.map((s) => s.content).join(" ").toLowerCase();
  const companyStatus = (kw: string[]): "green" | "gray" | "red" => {
    if (rssFailed) return "red";
    return kw.some((k) => briefingText.includes(k)) ? "green" : "gray";
  };
  const dotColor = { green: "bg-emerald-400", gray: "bg-gray-600", red: "bg-red-500" };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <h2 className="border-b border-gray-800 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400">
        Analyst Metrics
      </h2>

      {/* Odometer + ring */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-3">
        <div>
          <div className="text-3xl font-bold text-cyan-400">
            <AnimatedNumber value={chunks} />
          </div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">chunks embedded</div>
        </div>
        <div className="text-center">
          <Ring pct={passPct} />
          <div className="text-[10px] uppercase tracking-wider text-gray-500">first-pass</div>
        </div>
      </div>

      {/* Violations + token split bar */}
      <div className="space-y-3 border-b border-gray-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <ViolationsBadge value={violations} />
          <span className="text-[10px] uppercase tracking-wider text-gray-500">violations caught</span>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-gray-500">
            <span>tokens</span>
            <span className="text-gray-400">
              <AnimatedNumber value={totTok} />
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded bg-gray-800">
            <div className="bg-sky-500" style={{ width: `${totTok ? (inTok / totTok) * 100 : 0}%`, transition: "width 500ms ease" }} />
            <div className="bg-purple-500" style={{ width: `${totTok ? (outTok / totTok) * 100 : 0}%`, transition: "width 500ms ease" }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-600">
            <span className="text-sky-400">in {inTok}</span>
            <span className="text-purple-400">out {outTok}</span>
          </div>
        </div>
      </div>

      {/* AI company logo wall */}
      <Block title="AI companies monitored">
        <div className="grid grid-cols-4 gap-2">
          {COMPANIES.map((c) => {
            const st = companyStatus(c.kw);
            return (
              <div key={c.name} className="relative flex flex-col items-center gap-1 rounded border border-gray-800 bg-gray-900/40 p-2">
                <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${dotColor[st]} ${st === "green" ? "anim-dot-pulse" : ""}`} />
                <Logo domain={c.domain} name={c.name} size={26} />
                <span className="text-center text-[9px] leading-tight text-gray-400">{c.name}</span>
              </div>
            );
          })}
        </div>
      </Block>

      {/* Data source sparklines (working sources) */}
      <Block title="Data sources (last 7 runs)">
        {last7.length === 0 && <div className="text-xs text-gray-600">No data yet.</div>}
        {last7.length > 0 &&
          DATA_SOURCES.map((name) => {
            const series = last7.map((r) => (r.sources.find((s) => s.source === name)?.ok ? 1 : 0));
            const ok = series[series.length - 1] === 1;
            return (
              <div key={name} className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-400">{name}</span>
                <Sparkline values={series.length < 2 ? [series[0] ?? 0, series[0] ?? 0] : series} color={ok ? "#4ade80" : "#f87171"} width={90} />
              </div>
            );
          })}
      </Block>

      {/* Patch timeline */}
      <Block title="Agent improvement (patches)">
        {metrics.patches.length === 0 && <div className="text-xs text-gray-600">No patches yet.</div>}
        <ul className="space-y-1.5">
          {metrics.patches
            .slice(-8)
            .reverse()
            .map((p, i) => (
              <li
                key={`${p.date}-${i}`}
                className={`anim-slide-in-left rounded border px-2 py-1 text-[11px] ${i === 0 ? "border-emerald-700 bg-emerald-950/40 text-emerald-200" : "border-gray-800 bg-gray-900/60 text-gray-300"}`}
              >
                <span className="mr-1 rounded bg-black/40 px-1 text-gray-500">{new Date(p.date).toLocaleDateString()}</span>
                {p.patch}
              </li>
            ))}
        </ul>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-gray-800 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</div>
      {children}
    </div>
  );
}
