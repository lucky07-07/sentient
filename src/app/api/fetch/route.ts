import { NextResponse } from "next/server";
import { runFetch } from "@/lib/fetchPipeline";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await runFetch();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log("error", `fetch route failed: ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export const GET = POST;
