// GDELT Doc 2.0: AI-related news articles from the last 24h.

import { fetchJson } from "../http";
import type { RawItem } from "../types";

interface GdeltResp {
  articles?: { url: string; title: string; seendate?: string; domain?: string }[];
}

export async function fetchGdelt(): Promise<RawItem[]> {
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
    encodeURIComponent('"artificial intelligence"') +
    "&mode=ArtList&format=json&maxrecords=30&timespan=1d&sort=DateDesc";
  const data = await fetchJson<GdeltResp>(url);
  const now = new Date().toISOString();
  return (data.articles || []).map((a) => ({
    source: "gdelt" as const,
    url: a.url,
    title: a.title,
    text: `${a.title}${a.domain ? ` (${a.domain})` : ""}`,
    fetched_at: now,
    published_at: a.seendate || now,
    category: "news",
  }));
}
