/**
 * Manual local test:
 * curl -X POST http://localhost:3000/api/reminders/send \
 *   -H "Authorization: Bearer <REMINDER_CRON_SECRET>"
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { sendReminderToMissingPlayers } from "@/lib/notifications/sendReminder";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (auth === expected) return true;

  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return querySecret === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();

  try {
    const sb = getSupabaseAdmin();
    const timeZone = getOperationalTimezone();
    const today = getDateKeyInTimezone(new Date(), timeZone);

    const result = await sendReminderToMissingPlayers(sb, {
      reminderType: "first",
      scheduledSlot: "manual",
      dateKey: today,
      timeZone,
    });

    return NextResponse.json({ ok: true, dateKey: today, timezone: timeZone, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Reminder send failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
