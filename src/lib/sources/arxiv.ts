// arXiv: recent AI/ML papers via the Atom export API.

import Parser from "rss-parser";
import { fetchText } from "../http";
import type { RawItem } from "../types";

const parser = new Parser();
const URL =
  "http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=30";

export async function fetchArxiv(): Promise<RawItem[]> {
  const xml = await fetchText(URL);
  const feed = await parser.parseString(xml);
  const now = new Date().toISOString();
  return (feed.items || []).map((it) => ({
    source: "arxiv" as const,
    url: it.link || "",
    title: (it.title || "").replace(/\s+/g, " ").trim(),
    text: `${it.title || ""}. ${it.contentSnippet || it.content || ""}`.replace(/\s+/g, " ").trim(),
    fetched_at: now,
    published_at: it.isoDate || it.pubDate || now,
    category: "research",
  }));
}
