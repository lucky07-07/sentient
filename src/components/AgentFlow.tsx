"use client";

import { useEffect, useRef, useState } from "react";
import type { LogLine } from "@/lib/types";

const STAGES = ["fetch", "embed", "retrieve", "draft", "verify", "revise", "publish"] as const;
type Stage = (typeof STAGES)[number];

const COLOR: Record<Stage, string> = {
  fetch: "#38bdf8",
  embed: "#a78bfa",
  retrieve: "#34d399",
  draft: "#fbbf24",
  verify: "#f472b6",
  revise: "#fb923c",
  publish: "#4ade80",
};
const ICON: Record<Stage, string> = {
  fetch: "🔍",
  embed: "🧩",
  retrieve: "🔎",
  draft: "✍️",
  verify: "✅",
  revise: "🔄",
  publish: "📤",
};

const NODE_W = 90;
const NODE_H = 46;
const STEP = 107;
const X0 = 8;
const Y = 8;
const x = (i: number) => X0 + i * STEP;
const TOTAL_SECTIONS = 6;

export default function AgentFlow({ logs, running }: { logs: LogLine[]; running: boolean }) {
  const processed = useRef(0);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<Stage | null>(null);
  const [tick, setTick] = useState(0);
  const [errorFlash, setErrorFlash] = useState(false);

  useEffect(() => {
    if (logs.length < processed.current) processed.current = 0;
    const fresh = logs.slice(processed.current);
    processed.current = logs.length;
    if (!fresh.length) return;
    const hits = fresh.filter((l) => (STAGES as readonly string[]).includes(l.type)).map((l) => l.type as Stage);
    if (hits.length) {
      setActive((prev) => {
        const next = new Set(prev);
        hits.forEach((s) => next.add(s));
        return next;
      });
      setCurrent(hits[hits.length - 1]);
      setTick((t) => t + 1);
    }
    if (fresh.some((l) => l.type === "error")) setErrorFlash(true);
  }, [logs]);

  useEffect(() => {
    if (!errorFlash) return;
    const id = setTimeout(() => setErrorFlash(false), 700);
    return () => clearTimeout(id);
  }, [errorFlash, tick]);

  const currentIndex = current ? STAGES.indexOf(current) : -1;

  // Live "current section" + ETA from briefing logs.
  const publishes = logs.filter((l) => l.type === "publish" && /revision/.test(l.message));
  const done = publishes.length;
  const stageLogs = logs.filter((l) => (STAGES as readonly string[]).includes(l.type));
  const currentSection = [...stageLogs].reverse().find((l) => /:/.test(l.message))?.message.split(":")[0]?.trim();
  let eta: number | null = null;
  if (running && done > 0 && done < TOTAL_SECTIONS && stageLogs.length) {
    const t0 = new Date(stageLogs[0].ts).getTime();
    const per = (Date.now() - t0) / 1000 / done;
    eta = Math.max(1, Math.round(per * (TOTAL_SECTIONS - done)));
  }

  return (
    <div className="border-b border-gray-800 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Agent Pipeline</span>
        {running && currentSection && (
          <span className="text-[11px] text-gray-400">
            Processing: <span className="font-bold text-emerald-300">{currentSection}</span>{" "}
            <span className="text-gray-600">
              ({done}/{TOTAL_SECTIONS}){eta != null ? ` · ~${eta}s left` : ""}
            </span>
          </span>
        )}
      </div>

      <svg viewBox="0 0 756 64" className="w-full" style={{ maxHeight: 80 }}>
        <defs>
          <marker id="af-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#4b5563" />
          </marker>
        </defs>

        {STAGES.slice(0, -1).map((s, i) => {
          const flowing = active.has(s);
          return (
            <line
              key={`arrow-${s}`}
              x1={x(i) + NODE_W}
              y1={Y + NODE_H / 2}
              x2={x(i + 1)}
              y2={Y + NODE_H / 2}
              stroke={flowing ? COLOR[STAGES[i + 1]] : "#374151"}
              strokeWidth={2}
              markerEnd="url(#af-arrow)"
              className={flowing ? "flow-dash" : ""}
            />
          );
        })}

        {STAGES.map((s, i) => {
          const isActive = active.has(s);
          const isCurrent = current === s;
          const isCompleted = isActive && !isCurrent && i < currentIndex;
          const fill = isCurrent && errorFlash ? "#7f1d1d" : isActive ? COLOR[s] : "#1f2937";
          const opacity = isCurrent ? 1 : isActive ? 0.85 : 0.45;
          const nodeCls = isCurrent ? (errorFlash ? "anim-shake" : "flow-pulse") : "";
          return (
            <g key={isCurrent ? `${s}-${tick}-${errorFlash}` : s} className={nodeCls}>
              {isCurrent && (
                <rect
                  x={x(i) - 3}
                  y={Y - 3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={9}
                  fill="none"
                  stroke={COLOR[s]}
                  strokeWidth={2}
                  style={{ filter: `drop-shadow(0 0 6px ${COLOR[s]})` }}
                />
              )}
              <rect x={x(i)} y={Y} width={NODE_W} height={NODE_H} rx={7} fill={fill} opacity={opacity} />
              <text x={x(i) + NODE_W / 2} y={Y + 21} textAnchor="middle" fontSize={15} className={isCurrent ? "anim-bounce" : ""}>
                {ICON[s]}
              </text>
              <text
                x={x(i) + NODE_W / 2}
                y={Y + 37}
                textAnchor="middle"
                fontSize={9.5}
                fontWeight={700}
                fill={isActive ? "#0a0a0f" : "#9ca3af"}
              >
                {s.toUpperCase()}
              </text>
              {isCompleted && (
                <g className="anim-fade-up">
                  <circle cx={x(i) + NODE_W - 9} cy={Y + 9} r={7} fill="#0a0a0f" />
                  <path d={`M${x(i) + NODE_W - 12} ${Y + 9} l2 2 l4 -4`} fill="none" stroke="#4ade80" strokeWidth={1.6} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
