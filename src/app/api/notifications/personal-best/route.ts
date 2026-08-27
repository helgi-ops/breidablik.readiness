/**
 * POST /api/notifications/personal-best — detect CMJ personal bests and push a
 * celebratory notification to opted-in players. Idempotent (de-duped via
 * player_test_personal_bests). Bearer-secured like the cron; also invoked from
 * the daily cron at the evening slot so pushes stay in courteous hours.
 *
 * Local test:
 *   curl -X POST "http://localhost:3000/api/notifications/personal-best" \
 *     -H "Authorization: Bearer $REMINDER_CRON_SECRET"
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { runPersonalBestDetection } from "@/lib/notifications/sendPersonalBestNudge";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET || "";
  const reminderSecret = process.env.REMINDER_CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (reminderSecret && auth === `Bearer ${reminderSecret}`) return true;
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  if (reminderSecret && querySecret === reminderSecret) return true;
  return false;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const recencyDays = Number(url.searchParams.get("recencyDays") ?? "3") || 3;
    const sb = getSupabaseAdmin();
    const result = await runPersonalBestDetection(sb, { now: new Date().toISOString(), recencyDays });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("/api/notifications/personal-best failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
