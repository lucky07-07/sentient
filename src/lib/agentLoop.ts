// Closed agent loop: draft → verify → revise (max 3) → publish, then a meta
// self-improvement pass that writes patches back to agent_memory.json.

import { buildConstitution, CRITIC_RULES, META_RULES } from "./constitution";
import { embed, generate, generateWithTools, parseJson } from "./gemini";
import { searchChunks } from "./lancedb";
import { log, publishSection } from "./logger";
import { loadMemory, applyPatch } from "./memory";
import { getMetrics, recordSession } from "./metrics";
import { buildHandlers, toolDeclarations, type ToolContext } from "./tools";
import type { Briefing, BriefingSection, Chunk, VerificationReport } from "./types";

const MAX_REVISIONS = 3;
const TOP_K = 6;

const TOPICS: { id: string; title: string; query: string }[] = [
  { id: "research", title: "Research & Papers", query: "new AI research papers models benchmarks released today" },
  { id: "company", title: "Company & Product News", query: "AI company announcements product launches today" },
  { id: "opensource", title: "Open Source", query: "new open source models GitHub Hugging Face releases today" },
  { id: "markets", title: "Markets", query: "AI semiconductor stock prices market figures today" },
  { id: "news", title: "Industry News", query: "AI industry news policy regulation funding today" },
  { id: "community", title: "Community Signals", query: "confirmed AI announcements discussed in developer communities today" },
];

type Row = Pick<Chunk, "chunk_id" | "text" | "source" | "url"> & { fetched_at: string };

function chunkContext(rows: Row[]): string {
  return rows.map((r) => `[chunk_id: ${r.chunk_id}] (${r.source}) ${r.text}`).join("\n\n");
}

function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 24 * 3600 * 1000;
}

interface SessionTokens {
  input: number;
  output: number;
}

async function draftSection(
  system: string,
  topicTitle: string,
  rows: Row[],
  ctx: ToolContext,
  feedback: string | null,
  tokens: SessionTokens,
): Promise<{ content: string }> {
  const stale = rows.some((r) => isStale(r.fetched_at)) ? "\nSome chunks are older than 24h — mark those facts [STALE]." : "";
  const fix = feedback ? `\n\nThe previous draft FAILED verification. Fix exactly these violations and rewrite:\n${feedback}` : "";
  const prompt =
    `Write the "${topicTitle}" section of today's AI briefing using ONLY the chunks below. ` +
    `Cite each claim with its [chunk_id]. If a chunk lets you read a full article, you may call fetch_url. ` +
    `If two models are mentioned, call compare_benchmarks. For market figures call get_stock_price. ` +
    `You may call verify_claim to self-check before finishing. ` +
    `If no chunk supports a topic, write exactly: "No verified updates in the last 24 hours."${stale}${fix}\n\nCHUNKS:\n${chunkContext(rows)}`;

  const r = await generateWithTools({ system, prompt, tools: toolDeclarations, handlers: buildHandlers(ctx) });
  tokens.input += r.inputTokens;
  tokens.output += r.outputTokens;
  return { content: r.text.trim() };
}

async function verifySection(
  system: string,
  content: string,
  rows: Row[],
  tokens: SessionTokens,
): Promise<VerificationReport> {
  const prompt = `CONSTITUTION:\n${system}\n\nDRAFT SECTION:\n${content}\n\nCHUNKS USED:\n${chunkContext(rows)}`;
  const r = await generate(CRITIC_RULES, prompt, true);
  tokens.input += r.inputTokens;
  tokens.output += r.outputTokens;
  const parsed = parseJson<{ passed: boolean; violations: string[]; chunk_citations: string[] }>(r.text);
  return {
    passed: parsed?.passed ?? false,
    violations: parsed?.violations ?? ["verifier returned unparseable output"],
    chunk_citations: parsed?.chunk_citations ?? [],
    attempts: 0,
  };
}

async function buildSection(
  topic: (typeof TOPICS)[number],
  system: string,
  ctx: ToolContext,
  tokens: SessionTokens,
): Promise<{ section: BriefingSection; firstPass: boolean; violationsLog: string[] }> {
  const vec = await embed(topic.query);
  const rows = (await searchChunks(vec, TOP_K)) as Row[];
  log("retrieve", `${topic.title}: retrieved ${rows.length} chunks`, { topic: topic.id, chunks: rows.length });
  rows.forEach((r) => ctx.chunksById.set(r.chunk_id, r));

  const sourceCount = new Set(rows.map((r) => r.source)).size;
  const violationsLog: string[] = [];
  let feedback: string | null = null;
  let report: VerificationReport = { passed: false, violations: [], chunk_citations: [], attempts: 0 };
  let content = "";
  let attempt = 0;
  let firstPass = true;

  while (attempt < MAX_REVISIONS) {
    attempt++;
    log(attempt === 1 ? "draft" : "revise", `${topic.title}: ${attempt === 1 ? "drafting" : `revision ${attempt - 1}`}`, { topic: topic.id });
    content = (await draftSection(system, topic.title, rows, ctx, feedback, tokens)).content;

    log("verify", `${topic.title}: verifying (attempt ${attempt})`, { topic: topic.id });
    report = await verifySection(system, content, rows, tokens);
    report.attempts = attempt;

    if (report.passed) break;
    if (attempt === 1) firstPass = false;
    violationsLog.push(...report.violations.map((v) => `[${topic.id}] ${v}`));
    feedback = report.violations.map((v, i) => `${i + 1}. ${v}`).join("\n");
    log("verify", `${topic.title}: ${report.violations.length} violation(s)`, { topic: topic.id, violations: report.violations });
  }

  const revisedCount = attempt - 1;
  let status: BriefingSection["status"];
  if (report.passed && revisedCount === 0) status = "verified";
  else if (report.passed) status = "revised";
  else {
    status = "unverified";
    content = `[UNVERIFIED]\n${content}`;
  }

  const section: BriefingSection = {
    id: topic.id,
    title: topic.title,
    content,
    source_count: sourceCount,
    citation_count: report.chunk_citations.length,
    chunk_citations: report.chunk_citations,
    status,
    revised_count: revisedCount,
    verification: report,
    tokens: { input: 0, output: 0 }, // per-section token deltas filled by caller
  };

  log("publish", `${topic.title}: ${status} (${revisedCount} revisions)`, { topic: topic.id, status });
  return { section, firstPass: report.passed ? firstPass : false, violationsLog };
}

export async function runBriefing(): Promise<Briefing> {
  const date = new Date().toISOString().slice(0, 10);
  const generated_at = new Date().toISOString();

  // Abort rule: if the most recent fetch run failed >50% of sources.
  const metrics = await getMetrics();
  const lastRun = metrics.runs[metrics.runs.length - 1];
  if (lastRun) {
    const failed = lastRun.sources.filter((s) => !s.ok).length;
    if (failed / lastRun.sources.length > 0.5) {
      const reason = `Aborted: ${failed}/${lastRun.sources.length} sources failed in the last fetch (>50%).`;
      log("error", reason);
      return { date, generated_at, sections: [], aborted: { reason } };
    }
  }

  const mem = await loadMemory();
  const system = buildConstitution(mem);
  const ctx: ToolContext = { chunksById: new Map() };
  const tokens: SessionTokens = { input: 0, output: 0 };

  const sections: BriefingSection[] = [];
  const allViolations: string[] = [];
  let pass = 0;
  let fail = 0;

  for (const topic of TOPICS) {
    const before = { ...tokens };
    const { section, firstPass, violationsLog } = await buildSection(topic, system, ctx, tokens);
    section.tokens = { input: tokens.input - before.input, output: tokens.output - before.output };
    if (firstPass) pass++;
    else fail++;
    allViolations.push(...violationsLog);
    sections.push(section);
    publishSection(section); // incremental render
  }

  // Step 4 — self-improvement meta pass.
  if (allViolations.length) {
    log("verify", `meta: reviewing ${allViolations.length} violation(s) for self-improvement`);
    const r = await generate(META_RULES, `Violation logs from this session:\n${allViolations.join("\n")}`, true);
    tokens.input += r.inputTokens;
    tokens.output += r.outputTokens;
    const patch = parseJson<{ prompt_patches: string[]; source_quality_notes: string[]; retry_patterns: string[] }>(r.text);
    if (patch) {
      await applyPatch({
        prompt_patches: patch.prompt_patches || [],
        source_quality_notes: patch.source_quality_notes || [],
        retry_patterns: patch.retry_patterns || [],
      });
      log("publish", `meta: applied ${patch.prompt_patches?.length || 0} prompt patch(es)`);
    }
  }

  await recordSession({ pass, fail, violations: allViolations.length, input: tokens.input, output: tokens.output });
  return { date, generated_at, sections };
}
