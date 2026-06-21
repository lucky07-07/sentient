// Self-improvement store. Persisted to agent_memory.json at the repo root.
// Patches are prepended to the constitution on the next run.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentMemory } from "./types";

const FILE = path.join(process.cwd(), "agent_memory.json");

const EMPTY: AgentMemory = {
  prompt_patches: [],
  source_quality_notes: [],
  retry_patterns: [],
  history: [],
};

export async function loadMemory(): Promise<AgentMemory> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentMemory>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveMemory(mem: AgentMemory): Promise<void> {
  await fs.writeFile(FILE, JSON.stringify(mem, null, 2), "utf8");
}

// Merge a meta-agent patch into memory and record it in history.
export async function applyPatch(patch: {
  prompt_patches: string[];
  source_quality_notes: string[];
  retry_patterns: string[];
}): Promise<AgentMemory> {
  const mem = await loadMemory();
  const dedupe = (existing: string[], incoming: string[]) =>
    Array.from(new Set([...existing, ...incoming.filter((s) => s && s.trim())]));

  mem.prompt_patches = dedupe(mem.prompt_patches, patch.prompt_patches);
  mem.source_quality_notes = dedupe(mem.source_quality_notes, patch.source_quality_notes);
  mem.retry_patterns = dedupe(mem.retry_patterns, patch.retry_patterns);

  const applied = patch.prompt_patches.filter((s) => s && s.trim());
  if (applied.length) {
    mem.history.push({ date: new Date().toISOString(), applied_patches: applied });
  }
  await saveMemory(mem);
  return mem;
}
