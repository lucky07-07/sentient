"use client";

import { useEffect, useState } from "react";
import type { BriefingSection } from "@/lib/types";
import Markdown, { type CiteHandler } from "./Markdown";

declare global {
  interface Window {
    __briefingSections?: BriefingSection[];
  }
}

const ICON: Record<string, string> = {
  research: "📰",
  company: "🏢",
  opensource: "🔓",
  markets: "📈",
  community: "🌐",
  news: "📰",
};

const STATUS_COLOR: Record<BriefingSection["status"], string> = {
  verified: "#10b981",
  revised: "#f59e0b",
  unverified: "#ef4444",
};
const STATUS_GRAD: Record<BriefingSection["status"], string> = {
  verified: "linear-gradient(to bottom, rgba(6,78,59,0.20), transparent 60%)",
  revised: "linear-gradient(to bottom, rgba(120,53,15,0.20), transparent 60%)",
  unverified: "linear-gradient(to bottom, rgba(127,29,29,0.20), transparent 60%)",
};

// Keyword sentiment scorer (no API).
const BULL = ["surge", "gain", "rise", "grow", "record", "launch", "beat", "raise", "fund", "milestone", "breakthrough", "outperform", "rally", "jump", "soar", "expand", "partnership", "acquire", "upgrade", "adopt"];
const BEAR = ["fall", "drop", "decline", "loss", " cut", "layoff", "lawsuit", " ban", "delay", "miss", "plunge", "weak", "concern", "risk", "selloff", "downgrade", "warn", "shut", "halt", "outage"];
function sentiment(text: string): "BULLISH" | "NEUTRAL" | "BEARISH" {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of BULL) if (t.includes(w)) s++;
  for (const w of BEAR) if (t.includes(w)) s--;
  return s > 0 ? "BULLISH" : s < 0 ? "BEARISH" : "NEUTRAL";
}
function SentimentBadge({ content }: { content: string }) {
  const v = sentiment(content);
  const c = v === "BULLISH" ? { bg: "#064e3b", fg: "#6ee7b7" } : v === "BEARISH" ? { bg: "#7f1d1d", fg: "#fca5a5" } : { bg: "#1f2937", fg: "#9ca3af" };
  return (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: c.bg, color: c.fg }}>
      {v}
    </span>
  );
}

// Strip [STALE]/[UNVERIFIED] flags and a duplicate uppercase heading from the body.
function processContent(content: string, title: string) {
  let c = content;
  const stale = /\[STALE\]/i.test(c);
  const unverified = /\[UNVERIFIED\]/i.test(c);
  c = c.replace(/\[STALE\]/gi, "").replace(/\[UNVERIFIED\]/gi, "").trim();
  const lines = c.split("\n");
  let idx = 0;
  while (idx < lines.length && !lines[idx].trim()) idx++;
  if (idx < lines.length) {
    const norm = (x: string) => x.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (norm(lines[idx]) === norm(title)) {
      lines.splice(idx, 1);
      c = lines.join("\n").trim();
    }
  }
  return { content: c, stale, unverified };
}

function VerificationBadge({ s }: { s: BriefingSection }) {
  if (s.status === "verified") {
    return (
      <span className="flex items-center gap-1 rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-300">
        <svg viewBox="0 0 24 24" width={12} height={12}>
          <path d="M4 12 l5 5 L20 6" fill="none" stroke="#4ade80" strokeWidth={3} pathLength={1} className="anim-draw" />
        </svg>
        verified
      </span>
    );
  }
  if (s.status === "revised") {
    return (
      <span className="flex items-center gap-1 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-400 border-t-transparent" />
        revised {s.revised_count}×
      </span>
    );
  }
  return <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-300">✗ unverified</span>;
}

function Section({ s, onCite }: { s: BriefingSection; onCite: CiteHandler }) {
  const [open, setOpen] = useState(false);
  const { content, stale, unverified } = processContent(s.content, s.title);
  return (
    <div
      className="anim-fade-up overflow-hidden"
      style={{ background: STATUS_GRAD[s.status], border: "0.5px solid #21262d", borderLeft: `3px solid ${STATUS_COLOR[s.status]}`, borderRadius: 8 }}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-800 bg-black/20 px-3 py-1.5">
        <span className="text-sm">{ICON[s.id] ?? "⚡"}</span>
        <span className="text-sm font-bold text-gray-100">{s.title}</span>
        <SentimentBadge content={content} />
        <span className="ml-auto flex items-center gap-1">
          {stale && <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">STALE</span>}
          {unverified && <span className="rounded bg-red-900/60 px-1.5 py-0.5 text-[9px] font-bold text-red-300">UNVERIFIED</span>}
          <span className="rounded bg-sky-950/70 px-1 py-0.5 text-[10px] text-sky-300">{s.source_count} src</span>
          <span className="rounded bg-purple-950/70 px-1 py-0.5 text-[10px] text-purple-300">{s.tokens.input + s.tokens.output} tok</span>
          <span className="rounded bg-cyan-950/70 px-1 py-0.5 text-[10px] text-cyan-300">{s.citation_count} cite</span>
          <button onClick={() => setOpen((o) => !o)} title="Verification report">
            <VerificationBadge s={s} />
          </button>
        </span>
      </div>

      <div className="px-3 py-2 text-[13px] leading-relaxed text-gray-200">
        <Markdown content={content} onCite={onCite} />
      </div>

      {open && (
        <div className="anim-drawer border-t border-gray-800 bg-black/30 px-3 py-2 text-[11px]">
          <div className="text-gray-400">
            passed:{" "}
            <span className={s.verification.passed ? "text-emerald-400" : "text-red-400"}>{String(s.verification.passed)}</span> ·
            attempts: {s.verification.attempts} · revisions: {s.revised_count}
          </div>
          {s.chunk_citations.length > 0 && (
            <div className="mt-1 text-gray-400">
              citations: <span className="text-cyan-300">{s.chunk_citations.join(", ")}</span>
            </div>
          )}
          {s.verification.violations.length > 0 && (
            <ul className="ml-4 mt-1 list-disc text-red-300">
              {s.verification.violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface Popover {
  id: string;
  x: number;
  y: number;
  loading: boolean;
  url?: string;
  fetched_at?: string;
  error?: string;
}

export default function BriefingPanel({ sections, running }: { sections: BriefingSection[]; running: boolean }) {
  const [pop, setPop] = useState<Popover | null>(null);

  useEffect(() => {
    window.__briefingSections = sections;
  }, [sections]);

  const onCite: CiteHandler = async (id, e) => {
    const x = Math.min(e.clientX, window.innerWidth - 280);
    setPop({ id, x, y: e.clientY + 14, loading: true });
    try {
      const source = id.split("-")[0];
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, limit: 200 }),
      });
      const data = await r.json();
      const chunk = data.ok
        ? (data.chunks as { chunk_id: string; url: string; fetched_at: string }[]).find((c) => c.chunk_id === id)
        : null;
      setPop((p) =>
        p && p.id === id ? { ...p, loading: false, url: chunk?.url, fetched_at: chunk?.fetched_at, error: chunk ? undefined : "chunk not found" } : p,
      );
    } catch {
      setPop((p) => (p && p.id === id ? { ...p, loading: false, error: "lookup failed" } : p));
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <h2 className="flex items-center gap-2 border-b border-gray-800 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-white">
        <span>Daily Briefing</span>
        {running && <span className="h-2 w-2 rounded-full bg-emerald-400 anim-dot-pulse" />}
        <span className="ml-auto text-[10px] text-gray-500">{sections.length}/6 sections</span>
      </h2>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {sections.length === 0 && (
          <div className={`p-2 text-xs text-gray-600 ${running ? "anim-subtle-pulse" : ""}`}>
            {running ? "Agent is drafting and verifying sections…" : "No sections yet. Run Fetch then Briefing."}
          </div>
        )}
        {sections.map((s) => (
          <Section key={s.id} s={s} onCite={onCite} />
        ))}
      </div>

      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div className="anim-fade-up fixed z-50 w-64 rounded border border-gray-700 bg-[#0d0d14] p-3 text-xs shadow-xl" style={{ left: pop.x, top: pop.y }}>
            <div className="mb-1 font-bold text-cyan-300">{pop.id}</div>
            {pop.loading ? (
              <div className="text-gray-500">looking up…</div>
            ) : pop.error ? (
              <div className="text-red-400">{pop.error}</div>
            ) : (
              <>
                <a href={pop.url} target="_blank" rel="noreferrer" className="block break-all text-sky-400 hover:underline">
                  {pop.url}
                </a>
                <div className="mt-1 text-gray-500">fetched {pop.fetched_at ? new Date(pop.fetched_at).toLocaleString() : "—"}</div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
