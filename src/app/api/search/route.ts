import { NextResponse } from "next/server";
import { embed } from "@/lib/gemini";
import { queryChunks, searchChunks, type ChunkFilters } from "@/lib/lancedb";
import type { SourceName } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Data explorer: semantic search (when `query` present) or filtered metadata query.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      query?: string;
      source?: SourceName;
      category?: string;
      from?: string;
      to?: string;
      limit?: number;
    };
    const filters: ChunkFilters = { source: body.source, category: body.category, from: body.from, to: body.to };
    const limit = Math.min(body.limit ?? 50, 200);

    const rows = body.query?.trim()
      ? await searchChunks(await embed(body.query), limit, filters)
      : await queryChunks(filters, limit);

    // Return metadata only (drop the embedding vector from the payload).
    const chunks = rows.map((r) => ({
      chunk_id: r.chunk_id,
      source: r.source,
      url: r.url,
      title: r.title,
      text: r.text,
      fetched_at: r.fetched_at,
      published_at: r.published_at,
      category: r.category,
      distance: r._distance,
    }));
    return NextResponse.json({ ok: true, chunks });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
