// Deduplicate fetched items by URL and by normalized title.

import type { RawItem } from "./types";

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function dedupe(items: RawItem[]): RawItem[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: RawItem[] = [];
  for (const item of items) {
    const url = item.url.trim();
    const title = normTitle(item.title);
    if (url && seenUrl.has(url)) continue;
    if (title && seenTitle.has(title)) continue;
    if (url) seenUrl.add(url);
    if (title) seenTitle.add(title);
    out.push(item);
  }
  return out;
}
