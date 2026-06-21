// Papers With Code: recent papers. (The service has been unstable — failures are
// logged and degrade gracefully like any other source.)

import { fetchJson } from "../http";
import type { RawItem } from "../types";

interface PWCResp {
  results: { title: string; abstract?: string; url_abs?: string; published?: string }[];
}

export async function fetchPapersWithCode(): Promise<RawItem[]> {
  const data = await fetchJson<PWCResp>("https://paperswithcode.com/api/v1/papers/?items_per_page=25");
  const now = new Date().toISOString();
  return (data.results || []).map((p) => ({
    source: "paperswithcode" as const,
    url: p.url_abs || "https://paperswithcode.com",
    title: p.title,
    text: `${p.title}. ${(p.abstract || "").replace(/\s+/g, " ").trim()}`,
    fetched_at: now,
    published_at: p.published || now,
    category: "research",
  }));
}
