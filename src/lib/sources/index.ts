// Fetch every source in parallel, log each outcome, dedupe, and report per-source results.

import { bumpCount, log } from "../logger";
import { dedupe } from "../dedupe";
import type { RawItem, SourceName, SourceResult } from "../types";
import { fetchArxiv } from "./arxiv";
import { fetchReddit } from "./reddit";
import { fetchGithub } from "./github";
import { fetchHuggingFace } from "./huggingface";
import { fetchPapersWithCode } from "./paperswithcode";
import { fetchGdelt } from "./gdelt";
import { fetchRss } from "./rss";
import { fetchStocks } from "./stocks";

const SOURCES: { name: SourceName; fn: () => Promise<RawItem[]> }[] = [
  { name: "arxiv", fn: fetchArxiv },
  { name: "reddit", fn: fetchReddit },
  { name: "github", fn: fetchGithub },
  { name: "huggingface", fn: fetchHuggingFace },
  { name: "paperswithcode", fn: fetchPapersWithCode },
  { name: "gdelt", fn: fetchGdelt },
  { name: "rss", fn: fetchRss },
  { name: "stocks", fn: fetchStocks },
];

export async function fetchAllSources(): Promise<{ items: RawItem[]; results: SourceResult[] }> {
  const settled = await Promise.all(
    SOURCES.map(async ({ name, fn }): Promise<{ result: SourceResult; items: RawItem[] }> => {
      try {
        const items = await fn();
        log("fetch", `${name}: ${items.length} items`, { source: name, items: items.length });
        bumpCount(`fetch:${name}`, items.length);
        return { result: { source: name, ok: true, items: items.length }, items };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log("error", `${name} failed: ${error}`, { source: name });
        bumpCount(`fail:${name}`);
        return { result: { source: name, ok: false, items: 0, error }, items: [] };
      }
    }),
  );

  const all = settled.flatMap((s) => s.items);
  const deduped = dedupe(all);
  log("fetch", `deduped ${all.length} → ${deduped.length} items`, { before: all.length, after: deduped.length });
  return { items: deduped, results: settled.map((s) => s.result) };
}
