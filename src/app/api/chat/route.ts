import { NextResponse } from "next/server";
import { embed, generate } from "@/lib/gemini";
import { searchChunks } from "@/lib/lancedb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM =
  "You are the analyst assistant for the AI Intelligence Agent. Answer ONLY from the provided chunks and briefing context. " +
  "Cite the [chunk_id] for every claim. If the context does not contain the answer, say so plainly. No outside knowledge, no speculation.";

// Analyst chat: grounded follow-up Q&A over today's chunks + current briefing.
export async function POST(req: Request) {
  try {
    const { message, briefing } = (await req.json()) as { message: string; briefing?: string };
    if (!message?.trim()) return NextResponse.json({ ok: false, error: "empty message" }, { status: 400 });

    const rows = await searchChunks(await embed(message), 8);
    const context = rows.map((r) => `[chunk_id: ${r.chunk_id}] (${r.source}) ${r.text}`).join("\n\n");
    const prompt =
      (briefing ? `CURRENT BRIEFING:\n${briefing}\n\n` : "") +
      `RETRIEVED CHUNKS:\n${context || "(none)"}\n\nQUESTION: ${message}`;

    const { text } = await generate(SYSTEM, prompt);
    return NextResponse.json({ ok: true, answer: text, chunk_ids: rows.map((r) => r.chunk_id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
