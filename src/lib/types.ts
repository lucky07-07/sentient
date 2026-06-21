// Shared types for the AI Intelligence Agent.

export type SourceName =
  | "arxiv"
  | "reddit"
  | "github"
  | "huggingface"
  | "paperswithcode"
  | "gdelt"
  | "rss"
  | "stocks";

export type LogType =
  | "fetch"
  | "embed"
  | "retrieve"
  | "draft"
  | "verify"
  | "revise"
  | "publish"
  | "error";

export interface LogLine {
  ts: string; // ISO timestamp
  type: LogType;
  message: string;
  meta?: Record<string, unknown>;
}

// A single fetched item, before chunking.
export interface RawItem {
  source: SourceName;
  url: string;
  title: string;
  text: string;
  fetched_at: string; // ISO
  published_at?: string; // ISO, when the source reports it
  category: string; // e.g. "research", "community", "markets", "news", "opensource", "company"
}

// A chunk as stored in LanceDB. `vector` omitted in the TS row we insert is fine —
// LanceDB infers from the first row that includes it.
export interface Chunk {
  chunk_id: string;
  source: SourceName;
  url: string;
  title: string;
  text: string;
  fetched_at: string;
  published_at: string;
  category: string;
  vector: number[];
}

// Result of the critic pass over a drafted section.
export interface VerificationReport {
  passed: boolean;
  violations: string[];
  chunk_citations: string[];
  attempts: number;
}

export type SectionStatus = "verified" | "revised" | "unverified";

export interface BriefingSection {
  id: string;
  title: string;
  content: string;
  source_count: number;
  citation_count: number;
  chunk_citations: string[];
  status: SectionStatus;
  revised_count: number;
  verification: VerificationReport;
  tokens: { input: number; output: number };
}

export interface Briefing {
  date: string; // YYYY-MM-DD
  generated_at: string; // ISO
  sections: BriefingSection[];
  aborted?: { reason: string };
}

// Persisted self-improvement state (agent_memory.json).
export interface AgentMemory {
  prompt_patches: string[];
  source_quality_notes: string[];
  retry_patterns: string[];
  history: { date: string; applied_patches: string[] }[];
}

// Per-source outcome for one fetch run.
export interface SourceResult {
  source: SourceName;
  ok: boolean;
  items: number;
  error?: string;
}

// One fetch+embed run, persisted for metrics sparklines.
export interface RunRecord {
  date: string; // ISO
  sources: SourceResult[];
  chunks_embedded: number;
}

// Aggregated metrics for the right-hand panel.
export interface Metrics {
  runs: RunRecord[];
  verification: {
    first_pass_today: number; // 0..1
    first_pass_7day_avg: number; // 0..1
    sessions: { date: string; pass: number; fail: number; violations: number }[];
  };
  tokens: { date: string; input: number; output: number }[];
  patches: { date: string; patch: string }[];
}
