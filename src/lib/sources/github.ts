// GitHub Trending: no official API, so scrape the daily trending HTML page.

import * as cheerio from "cheerio";
import { fetchText } from "../http";
import type { RawItem } from "../types";

export async function fetchGithub(): Promise<RawItem[]> {
  const html = await fetchText("https://github.com/trending?since=daily");
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  const items: RawItem[] = [];
  $("article.Box-row").each((_, el) => {
    const repo = $(el).find("h2 a").attr("href")?.trim().replace(/^\//, "") || "";
    if (!repo) return;
    const desc = $(el).find("p").first().text().replace(/\s+/g, " ").trim();
    const lang = $(el).find('[itemprop="programmingLanguage"]').first().text().trim();
    const stars = $(el).find('a[href$="/stargazers"]').first().text().replace(/\s+/g, " ").trim();
    items.push({
      source: "github",
      url: `https://github.com/${repo}`,
      title: repo,
      text: `${repo}${lang ? ` (${lang})` : ""}: ${desc}${stars ? ` — ${stars} stars total` : ""}`,
      fetched_at: now,
      published_at: now,
      category: "opensource",
    });
  });
  return items.slice(0, 25);
}
