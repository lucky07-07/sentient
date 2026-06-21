// The five Gemini function-calling tools. Tools that surface facts stay grounded
// in the RAG store (compare_benchmarks, verify_claim) rather than model knowledge.

import { Type, type FunctionDeclaration } from "@google/genai";
import * as cheerio from "cheerio";
import { embed, generate, parseJson } from "./gemini";
import { searchChunks } from "./lancedb";
import { fetchJson, fetchText } from "./http";
import { log } from "./logger";
import type { Chunk } from "./types";

export interface ToolContext {
  chunksById: Map<string, Pick<Chunk, "chunk_id" | "text" | "source" | "url">>;
}

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "fetch_url",
    description: "Fetch the readable text of a URL (e.g. to read a full article instead of a headline).",
    parameters: {
      type: Type.OBJECT,
      properties: { url: { type: Type.STRING, description: "The URL to fetch." } },
      required: ["url"],
    },
  },
  {
    name: "get_stock_price",
    description: "Get the latest price for one stock ticker from Yahoo Finance.",
    parameters: {
      type: Type.OBJECT,
      properties: { ticker: { type: Type.STRING, description: "Ticker symbol, e.g. NVDA." } },
      required: ["ticker"],
    },
  },
  {
    name: "compare_benchmarks",
    description:
      "Find benchmark facts about two models from the retrieved chunks only. Returns matching chunk snippets; never invents scores.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        model_a: { type: Type.STRING },
        model_b: { type: Type.STRING },
      },
      required: ["model_a", "model_b"],
    },
  },
  {
    name: "classify_news",
    description: "Classify a piece of text into one ecosystem category.",
    parameters: {
      type: Type.OBJECT,
      properties: { text: { type: Type.STRING } },
      required: ["text"],
    },
  },
  {
    name: "verify_claim",
    description: "Check whether a claim is directly supported by the referenced chunk_ids.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        claim: { type: Type.STRING },
        chunk_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["claim", "chunk_ids"],
    },
  },
];

const CATEGORIES = ["research", "company", "opensource", "markets", "news", "community"];

function classify(text: string): { category: string; confidence: number } {
  const t = text.toLowerCase();
  const score: Record<string, number> = {};
  const rules: Record<string, string[]> = {
    research: ["paper", "arxiv", "benchmark", "dataset", "sota", "model architecture"],
    company: ["announce", "release", "launch", "openai", "anthropic", "deepmind", "mistral", "cohere"],
    opensource: ["github", "hugging face", "repo", "open source", "weights", "checkpoint"],
    markets: ["stock", "price", "shares", "nasdaq", "valuation", "$"],
    news: ["report", "according to", "regulator", "lawsuit", "policy"],
    community: ["reddit", "r/", "discussion", "thread", "opinion"],
  };
  for (const [cat, kws] of Object.entries(rules)) score[cat] = kws.filter((k) => t.includes(k)).length;
  const best = CATEGORIES.map((c) => [c, score[c] || 0] as const).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(score).reduce((a, b) => a + b, 0) || 1;
  return { category: best[1] > 0 ? best[0] : "news", confidence: Math.min(1, best[1] / total) };
}

async function fetchUrlText(url: string): Promise<string> {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000);
}

interface ChartResp {
  chart: { result?: { meta: { symbol: string; regularMarketPrice?: number; previousClose?: number; currency?: string } }[] };
}

async function stockPrice(ticker: string): Promise<unknown> {
  const data = await fetchJson<ChartResp>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
  );
  const meta = data.chart.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return { error: `no price for ${ticker}` };
  return { symbol: meta.symbol, price: meta.regularMarketPrice, previousClose: meta.previousClose, currency: meta.currency || "USD" };
}

async function compareBenchmarks(a: string, b: string, ctx: ToolContext): Promise<unknown> {
  const out: Record<string, { chunk_id: string; text: string }[]> = {};
  for (const model of [a, b]) {
    const vec = await embed(`${model} benchmark evaluation score performance`);
    const hits = await searchChunks(vec, 4);
    out[model] = hits
      .filter((h) => h.text.toLowerCase().includes(model.toLowerCase().split(" ")[0]))
      .map((h) => ({ chunk_id: h.chunk_id, text: h.text.slice(0, 400) }));
  }
  return { note: "Snippets from retrieved chunks only; no scores invented.", evidence: out };
}

async function verifyClaim(
  claim: string,
  chunkIds: string[],
  ctx: ToolContext,
): Promise<{ supported: boolean; confidence: number; evidence: string }> {
  const texts = chunkIds
    .map((id) => ctx.chunksById.get(id))
    .filter(Boolean)
    .map((c) => `[${c!.chunk_id}] ${c!.text}`)
    .join("\n\n");
  if (!texts) return { supported: false, confidence: 0, evidence: "referenced chunk_ids not found in session" };
  const system =
    "You judge whether a claim is directly supported by the provided chunks ONLY. Use no outside knowledge. Respond with JSON {\"supported\": boolean, \"confidence\": number 0..1, \"evidence\": string}.";
  const { text } = await generate(system, `CLAIM: ${claim}\n\nCHUNKS:\n${texts}`, true);
  return (
    parseJson<{ supported: boolean; confidence: number; evidence: string }>(text) || {
      supported: false,
      confidence: 0,
      evidence: "verifier returned unparseable output",
    }
  );
}

export function buildHandlers(ctx: ToolContext): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    fetch_url: async (args) => {
      const url = String(args.url || "");
      log("fetch", `tool fetch_url ${url}`);
      try {
        return { url, text: await fetchUrlText(url) };
      } catch (e) {
        return { url, error: e instanceof Error ? e.message : String(e) };
      }
    },
    get_stock_price: async (args) => stockPrice(String(args.ticker || "")),
    compare_benchmarks: async (args) =>
      compareBenchmarks(String(args.model_a || ""), String(args.model_b || ""), ctx),
    classify_news: async (args) => classify(String(args.text || "")),
    verify_claim: async (args) => {
      const ids = Array.isArray(args.chunk_ids) ? (args.chunk_ids as unknown[]).map(String) : [];
      const r = await verifyClaim(String(args.claim || ""), ids, ctx);
      log("verify", `tool verify_claim → ${r.supported ? "supported" : "unsupported"} (${r.confidence})`);
      return r;
    },
  };
}
