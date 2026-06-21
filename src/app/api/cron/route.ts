import { NextResponse } from "next/server";
import { runFetch } from "@/lib/fetchPipeline";
import { runBriefing } from "@/lib/agentLoop";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Full daily pipeline: fetch + embed, then run the briefing loop.
export async function POST() {
  try {
    log("fetch", "cron pipeline triggered");
    const fetched = await runFetch();
    const briefing = await runBriefing();
    return NextResponse.json({ ok: true, fetched, briefing });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log("error", `cron pipeline failed: ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export const GET = POST;
