// Live agent log: an in-process event bus the SSE route subscribes to.
// Kept on globalThis so Next's dev module reloading doesn't fork the instance.

import { EventEmitter } from "node:events";
import type { BriefingSection, LogLine, LogType } from "./types";

interface LogHub {
  emitter: EventEmitter;
  buffer: LogLine[]; // recent lines, replayed to new SSE subscribers
  counts: Record<string, number>; // arbitrary running counters (e.g. "fetch:arxiv")
}

const g = globalThis as unknown as { __agentLog?: LogHub };

function hub(): LogHub {
  if (!g.__agentLog) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);
    g.__agentLog = { emitter, buffer: [], counts: {} };
  }
  return g.__agentLog;
}

const MAX_BUFFER = 500;

export function log(type: LogType, message: string, meta?: Record<string, unknown>): void {
  const line: LogLine = { ts: new Date().toISOString(), type, message, meta };
  const h = hub();
  h.buffer.push(line);
  if (h.buffer.length > MAX_BUFFER) h.buffer.shift();
  h.emitter.emit("line", line);
}

export function bumpCount(key: string, by = 1): void {
  const h = hub();
  h.counts[key] = (h.counts[key] ?? 0) + by;
  h.emitter.emit("counts", h.counts);
}

export function getCounts(): Record<string, number> {
  return { ...hub().counts };
}

export function resetCounts(): void {
  hub().counts = {};
  hub().emitter.emit("counts", hub().counts);
}

export function getBuffer(): LogLine[] {
  return [...hub().buffer];
}

// A verified/published section, streamed to the dashboard as it completes.
export function publishSection(section: BriefingSection): void {
  hub().emitter.emit("section", section);
}

export function subscribe(handlers: {
  onLine: (line: LogLine) => void;
  onCounts: (c: Record<string, number>) => void;
  onSection: (s: BriefingSection) => void;
}) {
  const h = hub();
  h.emitter.on("line", handlers.onLine);
  h.emitter.on("counts", handlers.onCounts);
  h.emitter.on("section", handlers.onSection);
  return () => {
    h.emitter.off("line", handlers.onLine);
    h.emitter.off("counts", handlers.onCounts);
    h.emitter.off("section", handlers.onSection);
  };
}
