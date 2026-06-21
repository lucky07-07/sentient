// AI company / lab RSS feeds. Per-feed failures are tolerated; the source fails
// only if every feed fails. Several labs publish no stable RSS — those just drop out.

import Parser from "rss-parser";
import type { RawItem } from "../types";

const parser = new Parser({ timeout: 15000 });

const FEEDS: { company: string; url: string }[] = [
  { company: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { company: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  { company: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  { company: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { company: "Meta AI", url: "https://ai.meta.com/blog/rss/" },
  { company: "Anthropic", url: "https://www.anthropic.com/rss.xml" },
];

export async function fetchRss(): Promise<RawItem[]> {
  const now = new Date().toISOString();
  const results = await Promise.allSettled(
    FEEDS.map(async ({ company, url }) => {
      const feed = await parser.parseURL(url);
      return (feed.items || []).slice(0, 8).map((it) => ({
        source: "rss" as const,
        url: it.link || url,
        title: `${company}: ${(it.title || "").trim()}`,
        text: `[${company}] ${it.title || ""}. ${(it.contentSnippet || it.content || "").slice(0, 2000)}`
          .replace(/\s+/g, " ")
          .trim(),
        fetched_at: now,
        published_at: it.isoDate || it.pubDate || now,
        category: "company",
      }));
    }),
  );
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!items.length) throw new Error("all company RSS feeds failed");
  return items;
}
