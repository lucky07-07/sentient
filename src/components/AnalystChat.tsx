"use client";

import { useState } from "react";
import type { BriefingSection } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  text: string;
  chunk_ids?: string[];
}

export default function AnalystChat({ sections }: { sections: BriefingSection[] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const briefing = sections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n");
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, briefing }),
      });
      const data = await r.json();
      setMsgs((m) => [
        ...m,
        data.ok
          ? { role: "assistant", text: data.answer, chunk_ids: data.chunk_ids }
          : { role: "assistant", text: `Error: ${data.error}` },
      ]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-gray-800 bg-gray-950">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400 hover:bg-gray-900"
      >
        <span>Analyst Chat</span>
        <span>{open ? "▾" : "▴"}</span>
      </button>

      {open && (
        <div className="flex h-56 flex-col">
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-2 text-sm">
            {msgs.length === 0 && (
              <div className="text-xs text-gray-600">
                Ask about today&apos;s data, e.g. “What did DeepMind publish today?” Answers cite chunk IDs.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-gray-200" : "text-emerald-200"}>
                <span className="mr-1 text-[10px] font-bold uppercase text-gray-600">{m.role}</span>
                <span className="whitespace-pre-wrap">{m.text}</span>
                {m.chunk_ids && m.chunk_ids.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-gray-600">chunks: {m.chunk_ids.join(", ")}</div>
                )}
              </div>
            ))}
            {busy && <div className="text-xs text-gray-600">thinking…</div>}
          </div>
          <div className="flex gap-2 border-t border-gray-800 p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask the analyst…"
              className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-200"
            />
            <button onClick={send} disabled={busy} className="rounded bg-emerald-700 px-3 py-1 text-sm font-bold text-white disabled:opacity-50">
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
