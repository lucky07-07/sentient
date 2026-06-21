// Daily trigger. Run alongside `npm run dev`/`start` with `npm run cron`.
// Hits the running app's /api/cron endpoint on a schedule.

import cron from "node-cron";

const URL = process.env.CRON_TARGET || "http://localhost:3000/api/cron";
const SCHEDULE = process.env.CRON_SCHEDULE || "0 8 * * *"; // 08:00 daily

async function trigger() {
  const started = new Date().toISOString();
  console.log(`[cron] ${started} → POST ${URL}`);
  try {
    const r = await fetch(URL, { method: "POST" });
    const body = await r.json();
    console.log(`[cron] done: ok=${body.ok} chunks=${body.fetched?.chunks ?? "-"} sections=${body.briefing?.sections?.length ?? "-"}`);
  } catch (e) {
    console.error(`[cron] failed:`, e instanceof Error ? e.message : e);
  }
}

cron.schedule(SCHEDULE, trigger);
console.log(`[cron] scheduled "${SCHEDULE}" → ${URL}. Waiting…`);
