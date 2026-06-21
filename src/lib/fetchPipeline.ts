// Fetch → chunk → embed → store. Shared by /api/fetch and /api/cron.

import { chunkText } from "./chunk";
import { embed } from "./gemini";
import { resetChunks } from "./lancedb";
import { bumpCount, log, resetCounts } from "./logger";
import { recordRun } from "./metrics";
import { fetchAllSources } from "./sources";
import type { Chunk } from "./types";

// Embed with small concurrency so we don't fire hundreds of requests at once.
async function embedPool(texts: string[], concurrency = 4): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  let i = 0;
  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      out[idx] = await embed(texts[idx]);
      bumpCount("embed:chunks");
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return out;
}

export async function runFetch(): Promise<{ results: Awaited<ReturnType<typeof fetchAllSources>>["results"]; chunks: number }> {
  resetCounts();
  log("fetch", "fetch run started");
  const { items, results } = await fetchAllSources();

  // Chunk every item; assign globally-unique, source-prefixed chunk ids.
  const pending: Omit<Chunk, "vector">[] = [];
  items.forEach((item, itemIdx) => {
    chunkText(item.text).forEach((text, ci) => {
      pending.push({
        chunk_id: `${item.source}-${itemIdx}-${ci}`,
        source: item.source,
        url: item.url,
        title: item.title,
        text,
        fetched_at: item.fetched_at,
        published_at: item.published_at || item.fetched_at,
        category: item.category,
      });
    });
  });

  log("embed", `embedding ${pending.length} chunks`);
  const vectors = await embedPool(pending.map((c) => c.text));
  const chunks: Chunk[] = pending.map((c, idx) => ({ ...c, vector: vectors[idx] }));

  await resetChunks(chunks);
  log("embed", `stored ${chunks.length} chunks in LanceDB`);

  await recordRun({ date: new Date().toISOString(), sources: results, chunks_embedded: chunks.length });
  return { results, chunks: chunks.length };
}
