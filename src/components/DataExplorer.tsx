"use client";

import { useState } from "react";
import type { BriefingSection, SourceName } from "@/lib/types";

interface ChunkRow {
  chunk_id: string;
  source: SourceName;
  url: string;
  title: string;
  text: string;
  fetched_at: string;
  published_at: string;
  category: string;
  distance?: number;
}

const SOURCES: SourceName[] = ["arxiv", "reddit", "github", "huggingface", "paperswithcode", "gdelt", "rss", "stocks"];

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: ChunkRow[]): string {
  const cols: (keyof ChunkRow)[] = ["chunk_id", "source", "category", "title", "url", "fetched_at", "text"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export default function DataExplorer({ sections }: { sections: BriefingSection[] }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceName | "">("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ChunkRow[]>([]);
  const [selected, setSelected] = useState<ChunkRow | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setSelected(null);
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query || undefined,
          source: source || undefined,
          category: category || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
          limit: 100,
        }),
      });
      const data = await r.json();
      setRows(data.ok ? data.chunks : []);
    } finally {
      setLoading(false);
    }
  }

  const citingSections = (chunkId: string) =>
    sections.filter((s) => s.chunk_citations.includes(chunkId)).map((s) => s.title);

  return (
    <div className="flex h-full flex-col">
      <h2 className="border-b border-gray-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400">
        Data Explorer
      </h2>

      <div className="flex flex-wrap items-end gap-2 border-b border-gray-800 p-3 text-xs">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="semantic search…"
          className="min-w-[200px] flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
        />
        <select value={source} onChange={(e) => setSource(e.target.value as SourceName | "")} className="rounded border border-gray-700 bg-gray-900 px-2 py-1">
          <option value="">all sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="category" className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-700 bg-gray-900 px-2 py-1" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-700 bg-gray-900 px-2 py-1" />
        <button onClick={run} disabled={loading} className="rounded bg-emerald-700 px-3 py-1 font-bold text-white disabled:opacity-50">
          {loading ? "…" : "Search"}
        </button>
        <div className="ml-auto flex gap-2">
          <button onClick={() => download("chunks.json", JSON.stringify(rows, null, 2), "application/json")} disabled={!rows.length} className="rounded border border-gray-700 px-2 py-1 disabled:opacity-40">
            JSON
          </button>
          <button onClick={() => download("chunks.csv", toCsv(rows), "text/csv")} disabled={!rows.length} className="rounded border border-gray-700 px-2 py-1 disabled:opacity-40">
            CSV
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex-1 overflow-y-auto p-2 text-xs">
          {rows.length === 0 && <div className="p-2 text-gray-600">No results. Run a search.</div>}
          {rows.map((r) => (
            <button
              key={r.chunk_id}
              onClick={() => setSelected(r)}
              className={`block w-full rounded border-b border-gray-800/50 px-2 py-1 text-left hover:bg-gray-900 ${selected?.chunk_id === r.chunk_id ? "bg-gray-900" : ""}`}
            >
              <div className="flex justify-between">
                <span className="text-log-retrieve">{r.chunk_id}</span>
                <span className="text-gray-600">{r.source} · {r.category}</span>
              </div>
              <div className="truncate text-gray-300">{r.title}</div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="w-2/5 overflow-y-auto border-l border-gray-800 p-3 text-xs">
            <div className="mb-1 font-bold text-log-retrieve">{selected.chunk_id}</div>
            <div className="mb-2 text-gray-500">
              {selected.source} · {selected.category} · fetched {new Date(selected.fetched_at).toLocaleString()}
            </div>
            <a href={selected.url} target="_blank" rel="noreferrer" className="break-all text-sky-400 hover:underline">
              {selected.url}
            </a>
            <p className="mt-2 whitespace-pre-wrap text-gray-300">{selected.text}</p>
            <div className="mt-3 border-t border-gray-800 pt-2">
              <div className="text-gray-500">cited by sections:</div>
              {citingSections(selected.chunk_id).length ? (
                <ul className="ml-4 list-disc text-emerald-300">
                  {citingSections(selected.chunk_id).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-600">none in the current briefing</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
