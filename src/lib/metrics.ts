// Metrics store for the analyst panel. Persisted to metrics.json at repo root.

import { promises as fs } from "node:fs";
import path from "node:path";
import { loadMemory } from "./memory";
import type { Metrics, RunRecord } from "./types";

const FILE = path.join(process.cwd(), "metrics.json");

interface Store {
  runs: RunRecord[];
  sessions: { date: string; pass: number; fail: number; violations: number }[];
  tokens: { date: string; input: number; output: number }[];
}

const EMPTY: Store = { runs: [], sessions: [], tokens: [] };

async function load(): Promise<Store> {
  try {
    return { ...EMPTY, ...(JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<Store>) };
  } catch {
    return { ...EMPTY };
  }
}

async function save(s: Store): Promise<void> {
  await fs.writeFile(FILE, JSON.stringify(s, null, 2), "utf8");
}

function trim<T>(arr: T[], n: number): T[] {
  return arr.slice(-n);
}

export async function recordRun(run: RunRecord): Promise<void> {
  const s = await load();
  s.runs = trim([...s.runs, run], 60);
  await save(s);
}

// One briefing session's verification + token totals.
export async function recordSession(args: {
  pass: number;
  fail: number;
  violations: number;
  input: number;
  output: number;
}): Promise<void> {
  const s = await load();
  const date = new Date().toISOString();
  s.sessions = trim([...s.sessions, { date, pass: args.pass, fail: args.fail, violations: args.violations }], 60);
  s.tokens = trim([...s.tokens, { date, input: args.input, output: args.output }], 60);
  await save(s);
}

const today = () => new Date().toISOString().slice(0, 10);
const within7d = (iso: string) => Date.now() - new Date(iso).getTime() <= 7 * 864e5;

export async function getMetrics(): Promise<Metrics> {
  const s = await load();
  const mem = await loadMemory();

  const rate = (arr: { pass: number; fail: number }[]) => {
    const pass = arr.reduce((a, b) => a + b.pass, 0);
    const total = arr.reduce((a, b) => a + b.pass + b.fail, 0);
    return total ? pass / total : 0;
  };

  const todays = s.sessions.filter((x) => x.date.slice(0, 10) === today());
  const last7 = s.sessions.filter((x) => within7d(x.date));

  return {
    runs: s.runs,
    verification: {
      first_pass_today: rate(todays),
      first_pass_7day_avg: rate(last7),
      sessions: s.sessions,
    },
    tokens: s.tokens,
    patches: mem.history.flatMap((h) => h.applied_patches.map((patch) => ({ date: h.date, patch }))),
  };
}
