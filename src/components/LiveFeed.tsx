"use client";

import { useMemo, useRef, useState } from "react";
import type { LogLine } from "@/lib/types";

const SOURCE_COLOR: Record<string, string> = {
  arxiv: "#00d4aa",
  rss: "#ff6600",
  github: "#4ec9b0",
  stocks: "#a855f7",
};
const FILTERS = ["all", "arxiv", "rss", "github", "stocks"] as const;
const KNOWN = ["arxiv", "rss", "github", "stocks"];

interface FeedItem {
  ts: string;
  source: string;
  title: string;
  kind: "item" | "error";
}

// The logger records per-source batch lines + source failures (no per-item
// titles), so the feed shows those — newest first.
function parseFeed(logs: LogLine[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const l of logs) {
    if (l.type === "fetch") {
      const src = l.message.match(/^(\w+):/)?.[1];
      if (src && KNOWN.includes(src) && /\d+\s+items/.test(l.message)) {
        items.push({ ts: l.ts, source: src, title: l.message, kind: "item" });
      }
    } else if (l.type === "error" && /failed/i.test(l.message)) {
      const src = l.message.split(/\s+/)[0];
      items.push({ ts: l.ts, source: src, title: `${src} unavailable`, kind: "error" });
    }
  }
  return items.reverse(); // logs are chronological → newest first
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

export default function LiveFeed({ logs, counts }: { logs: LogLine[]; counts: Record<string, number> }) {
  const [source, setSource] = useState<(typeof FILTERS)[number]>("all");
  const [atTop, setAtTop] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(0);
  const [pendingNew, setPendingNew] = useState(0);

  const all = useMemo(() => parseFeed(logs), [logs]);
  const items = (source === "all" ? all : all.filter((i) => i.source === source)).slice(0, 150);

  // Track new arrivals while scrolled away from the top.
  if (all.length !== prevLen.current) {
    const delta = all.length - prevLen.current;
    if (delta > 0 && !atTop) setPendingNew((n) => n + delta);
    prevLen.current = all.length;
  }

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setPendingNew(0);
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a0f]">
      {/* Header */}
      <div className="border-b border-gray-800 px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color: "#a855f7" }}>
            Live Feed
          </span>
          <span className="text-[10px] text-gray-500">● {all.length} items</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const on = source === f;
            const c = f === "all" ? "#a855f7" : SOURCE_COLOR[f];
            return (
              <button
                key={f}
                onClick={() => setSource(f)}
                className="rounded font-mono text-[9px] uppercase"
                style={{
                  background: on ? c : "transparent",
                  color: on ? "#fff" : "#666",
                  padding: "2px 6px",
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
        {/* Per-source counts */}
        <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[9px]">
          {KNOWN.map((s) => (
            <span key={s} style={{ color: SOURCE_COLOR[s] }}>
              {s} {counts[`fetch:${s}`] ?? 0}
            </span>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="relative min-h-0 flex-1">
        {pendingNew > 0 && (
          <button
            onClick={scrollToTop}
            className="absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full border border-purple-700 bg-purple-950/80 px-2 py-0.5 text-[10px] text-purple-200"
          >
            ↑ {pendingNew} new item{pendingNew > 1 ? "s" : ""}
          </button>
        )}

        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full anim-dot-pulse" style={{ background: "#a855f7" }} />
            <span>Waiting for first fetch run…</span>
            <span className="text-gray-700">Run Fetch to start the live feed</span>
          </div>
        ) : (
          <div ref={scrollRef} onScroll={(e) => setAtTop(e.currentTarget.scrollTop < 8)} className="h-full overflow-y-auto px-3 py-2">
            {items.map((it) => {
              const color = SOURCE_COLOR[it.source] || "#ff4444";
              const isNew = Date.now() - new Date(it.ts).getTime() < 30000;
              const isErr = it.kind === "error";
              return (
                <div
                  key={`${it.ts}|${it.title}`}
                  onClick={() => navigator.clipboard?.writeText(it.title).catch(() => {})}
                  className="anim-slide-in-left cursor-pointer border-b py-2 hover:bg-white/[0.04]"
                  style={{ borderColor: "#1e1e1e" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${isNew ? "anim-dot-pulse" : ""}`} style={{ background: color }} />
                    <span className="font-mono text-[10px] text-gray-500">{fmtTime(it.ts)}</span>
                    <span className="rounded font-mono text-[9px]" style={{ background: `${color}26`, color, padding: "1px 5px" }}>
                      {it.source}
                    </span>
                    {isNew && !isErr && (
                      <span className="rounded font-mono text-[9px]" style={{ background: "#00d4aa18", color: "#00d4aa", padding: "1px 5px" }}>
                        NEW
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-1 text-[12px] leading-snug"
                    style={{
                      color: isErr ? "#ff6b6b" : "#e6edf3",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {isErr ? `⚠ ${it.title}` : it.title}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
