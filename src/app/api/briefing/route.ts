import { NextResponse } from "next/server";
import { runBriefing } from "@/lib/agentLoop";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const briefing = await runBriefing();
    return NextResponse.json({ ok: true, briefing });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log("error", `briefing route failed: ${error}`);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}

export const GET = POST;
