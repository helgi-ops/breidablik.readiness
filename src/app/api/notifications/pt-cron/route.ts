/**
 * /api/notifications/pt-cron — push reminders for PT clients.
 *
 *   ?type=session  → "You have a session today" (scheduled, unlogged days)
 *   ?type=weekly   → Sunday recap of last week's training
 *
 * Auth: Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; REMINDER_CRON_SECRET
 * (bearer or ?secret=) is accepted for manual calls. Kept separate from the
 * football /api/notifications/cron so PT logic stays isolated.
 *
 * Local test:
 *   curl "http://localhost:3000/api/notifications/pt-cron?type=session" -H "Authorization: Bearer $CRON_SECRET"
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendPtSessionReminders, sendPtWeeklyRecap } from "@/lib/notifications/sendPtReminders";

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
  const type = new URL(req.url).searchParams.get("type") || "session";
  const today = new Date().toISOString().slice(0, 10);
  try {
    const sb = getSupabaseAdmin();
    if (type === "weekly") {
      const result = await sendPtWeeklyRecap(sb, today);
      return NextResponse.json({ ok: true, type, today, result });
    }
    const result = await sendPtSessionReminders(sb, today);
    return NextResponse.json({ ok: true, type: "session", today, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("/api/notifications/pt-cron failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
