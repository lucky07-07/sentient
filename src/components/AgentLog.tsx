"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LogLine, LogType } from "@/lib/types";
import AnimatedNumber from "./AnimatedNumber";

const TYPE_HEX: Record<LogType, string> = {
  fetch: "#22d3ee",
  embed: "#a78bfa",
  retrieve: "#22d3ee",
  draft: "#fbbf24",
  verify: "#4ade80",
  revise: "#fb923c",
  publish: "#4ade80",
  error: "#f87171",
};

const ICON: Record<LogType, string> = {
  fetch: "↓",
  embed: "⬡",
  retrieve: "⬇",
  draft: "✎",
  verify: "◎",
  revise: "↺",
  publish: "✓",
  error: "✗",
};

const FILTERS: ("all" | LogType)[] = ["all", "fetch", "embed", "draft", "verify", "error"];

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

// Bold numeric values (item counts, chunk counts, attempts) inside a message.
function renderMessage(msg: string) {
  return msg.split(/(\d[\d,]*)/g).map((p, i) =>
    /^\d/.test(p) ? (
      <strong key={i} className="font-semibold text-gray-100">
        {p}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function Entry({ l }: { l: LogLine }) {
  const hex = TYPE_HEX[l.type];
  const verifyFail = l.type === "verify" && /violation/i.test(l.message);
  return (
    <div
      className="anim-slide-in-left mb-0.5 rounded-r"
      style={{ borderLeft: `2px solid ${hex}`, background: l.type === "error" ? "#f8717108" : "transparent", padding: "4px 8px" }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center justify-center font-mono"
          style={{ width: 18, height: 18, borderRadius: 4, background: `${hex}26`, color: hex, fontSize: 11 }}
        >
          {ICON[l.type]}
        </span>
        <span className="font-mono text-[9px] font-bold uppercase" style={{ color: hex }}>
          {l.type}
        </span>
        <span className="ml-auto font-mono text-[9px] text-gray-600">{time(l.ts)}</span>
      </div>
      <div className="mt-0.5 line-clamp-2 font-mono text-[11px] text-gray-300" title={l.message}>
        {renderMessage(l.message)}
        {verifyFail && (
          <span className="ml-1" style={{ color: "#f87171" }}>
            ✗ fail
          </span>
        )}
      </div>
    </div>
  );
}

export default function AgentLog({ logs }: { logs: LogLine[] }) {
  const [filter, setFilter] = useState<"all" | LogType>("all");
  const endRef = useRef<HTMLDivElement>(null);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of logs) c[l.type] = (c[l.type] ?? 0) + 1;
    return c;
  }, [logs]);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.type === filter);
  const start = Math.max(0, filtered.length - 100);
  const visible = filtered.slice(start);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length]);

  return (
    <div className="flex h-full flex-col">
      <h2 className="border-b border-gray-800 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider" style={{ color: "#ff6600" }}>
        Agent Log
      </h2>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1 border-b border-gray-800 px-2 py-1.5">
        {FILTERS.map((f) => {
          const count = f === "all" ? logs.length : typeCounts[f] ?? 0;
          const on = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${on ? "bg-gray-700 text-gray-100" : "text-gray-500 hover:text-gray-300"}`}
            >
              {f}
              <span className="rounded bg-black/40 px-1 text-[9px] text-gray-400">
                <AnimatedNumber value={count} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {visible.length === 0 && <div className="px-1 text-[11px] text-gray-600">No {filter === "all" ? "" : `${filter} `}events yet…</div>}
        {visible.map((l, i) => (
          <Entry key={start + i} l={l} />
        ))}
        <div className="flex items-center gap-1 px-1 pt-1 text-gray-600">
          <span className="font-mono text-[11px]" style={{ color: "#ff6600" }}>
            $
          </span>
          <span className="anim-blink inline-block bg-orange-500" style={{ width: 6, height: 11 }} />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}
