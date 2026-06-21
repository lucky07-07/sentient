// Stocks: Yahoo Finance unofficial chart endpoint (no key, occasionally flaky).
// TSMC trades as the ADR "TSM" on Yahoo.

import { fetchJson } from "../http";
import type { RawItem } from "../types";

const TICKERS = ["NVDA", "MSFT", "GOOGL", "AMD", "TSM", "AVGO", "ORCL", "PLTR"];

interface ChartResp {
  chart: {
    result?: {
      meta: {
        symbol: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency?: string;
        regularMarketTime?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: number[];
          high?: number[];
          low?: number[];
          close?: number[];
          volume?: number[];
        }[];
      };
    }[];
    error?: unknown;
  };
}

async function quote(ticker: string): Promise<RawItem | null> {
  const data = await fetchJson<ChartResp>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=30d`,
    { cache: "no-store" }, // bypass Next's fetch cache so OHLCV history isn't served stale
  );
  const meta = data.chart.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") return null;
  const prev = meta.previousClose ?? meta.chartPreviousClose;
  const asOf = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();
  const now = new Date().toISOString();

  // Build daily OHLCV history (empty + text unchanged if Yahoo omits it).
  const result = data.chart.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  // Compact [t,o,h,l,c,v] rows, rounded — keeps ~30 days under the 2000-char
  // chunk limit so the history survives chunking in one piece.
  const history: number[][] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = q.open?.[i],
      h = q.high?.[i],
      l = q.low?.[i],
      c = q.close?.[i],
      v = q.volume?.[i];
    if (o != null && h != null && l != null && c != null) {
      history.push([timestamps[i], +o.toFixed(2), +h.toFixed(2), +l.toFixed(2), +c.toFixed(2), Math.round(v ?? 0)]);
    }
  }

  return {
    source: "stocks",
    url: `https://finance.yahoo.com/quote/${ticker}`,
    title: `${meta.symbol} ${meta.regularMarketPrice} ${meta.currency || "USD"}`,
    text: `${meta.symbol} price ${meta.regularMarketPrice} ${meta.currency || "USD"}${
      typeof prev === "number" ? `, previous close ${prev}` : ""
    }, as of ${asOf}.${history.length ? ` |history:${JSON.stringify(history)}` : ""}`,
    fetched_at: now,
    published_at: asOf,
    category: "markets",
  };
}

export async function fetchStocks(): Promise<RawItem[]> {
  const results = await Promise.allSettled(TICKERS.map(quote));
  const items = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  if (!items.length) throw new Error("all stock quotes failed");
  return items;
}
