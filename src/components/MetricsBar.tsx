"use client";

import type { BriefingSection, Metrics, SourceName } from "@/lib/types";
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

function MiniRing({ pct }: { pct: number }) {
  const r = 12;
  const C = 2 * Math.PI * r;
  const color = pct >= 80 ? "#00d4aa" : pct >= 60 ? "#fbbf24" : "#ff4444";
  return (
    <svg width={32} height={32}>
      <circle cx={16} cy={16} r={r} stroke="#1f2937" strokeWidth={3} fill="none" />
      <circle cx={16} cy={16} r={r} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 16 16)" style={{ transition: "stroke-dashoffset 600ms ease" }} />
      <text x={16} y={20} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
        {pct}
      </text>
    </svg>
  );
}

export default function MetricsBar({ metrics, counts, sections }: { metrics: Metrics | null; counts: Record<string, number>; sections: BriefingSection[] }) {
  const lastRun = metrics?.runs[metrics.runs.length - 1];
  const lastTokens = metrics?.tokens[metrics.tokens.length - 1];
  const lastSession = metrics?.verification.sessions[metrics.verification.sessions.length - 1];

  const chunks = counts["embed:chunks"] ?? 0;
  const passPct = Math.round((metrics?.verification.first_pass_today ?? 0) * 100);
  const violations = lastSession?.violations ?? 0;
  const inTok = lastTokens?.input ?? 0;
  const outTok = lastTokens?.output ?? 0;

  const text = sections.map((s) => s.content).join(" ").toLowerCase();
  const sourceOk = (s: SourceName) => lastRun?.sources.find((x) => x.source === s)?.ok;

  return (
    <div className="flex items-center gap-5 overflow-x-auto border-t border-gray-800 bg-black/40 px-4 py-1.5 text-[11px]">
      {/* Left: core stats */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-gray-500">Chunks embedded</span>
        <span className="font-bold text-cyan-400">
          <AnimatedNumber value={chunks} />
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-gray-500">Tokens in / out</span>
        <span className="font-bold text-sky-400">
          <AnimatedNumber value={inTok} />
        </span>
        <span className="text-gray-600">/</span>
        <span className="font-bold text-purple-400">
          <AnimatedNumber value={outTok} />
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-center leading-none">
        <MiniRing pct={passPct} />
        <span className="text-[9px] text-gray-500">First-pass</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-gray-500">Violations</span>
        <span className="rounded-full bg-red-900/60 px-2 py-0.5 font-bold text-red-300">{violations}</span>
      </div>

      <div className="h-5 w-px shrink-0 bg-gray-800" />

      {/* Center: company dots */}
      <div className="flex shrink-0 items-center gap-2">
        {COMPANIES.map((c) => {
          const mentioned = c.kw.some((k) => text.includes(k));
          return (
            <div key={c.name} className="relative" title={c.name}>
              <Logo domain={c.domain} name={c.name} size={18} />
              <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${mentioned ? "bg-emerald-400 anim-dot-pulse" : "bg-gray-600"}`} />
            </div>
          );
        })}
      </div>

      <div className="h-5 w-px shrink-0 bg-gray-800" />

      {/* Right: data source health dots */}
      <div className="flex shrink-0 items-center gap-2">
        {DATA_SOURCES.map((s) => {
          const ok = sourceOk(s);
          return (
            <div key={s} className="flex items-center gap-1" title={s}>
              <span className={`h-2 w-2 rounded-full ${ok === undefined ? "bg-gray-700" : ok ? "bg-emerald-400" : "bg-red-500"}`} />
              <span className="text-gray-500">{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
