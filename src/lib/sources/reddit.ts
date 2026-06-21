// Reddit: hot posts across AI subreddits via OAuth client-credentials.
// Skipped (throws, logged as a source failure) when credentials are absent.

import { fetchJson } from "../http";
import type { RawItem } from "../types";

const SUBS = [
  "LocalLLaMA",
  "MachineLearning",
  "OpenAI",
  "ChatGPT",
  "singularity",
  "ArtificialIntelligence",
];

interface TokenResp {
  access_token: string;
}
interface Listing {
  data: { children: { data: { title: string; selftext: string; permalink: string; created_utc: number } }[] };
}

async function token(): Promise<string> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) throw new Error("REDDIT_CLIENT_ID/SECRET not set");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetchJson<TokenResp>("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return r.access_token;
}

export async function fetchReddit(): Promise<RawItem[]> {
  const t = await token();
  const now = new Date().toISOString();
  const items: RawItem[] = [];
  for (const sub of SUBS) {
    const listing = await fetchJson<Listing>(`https://oauth.reddit.com/r/${sub}/hot?limit=12`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    for (const c of listing.data.children) {
      const p = c.data;
      items.push({
        source: "reddit",
        url: `https://www.reddit.com${p.permalink}`,
        title: p.title,
        text: `[r/${sub}] ${p.title}. ${(p.selftext || "").slice(0, 2000)}`.replace(/\s+/g, " ").trim(),
        fetched_at: now,
        published_at: new Date(p.created_utc * 1000).toISOString(),
        category: "community",
      });
    }
  }
  return items;
}
