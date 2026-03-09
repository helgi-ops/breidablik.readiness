import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentScheduledSlot, getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { sendReminderToMissingPlayers } from "@/lib/notifications/sendReminder";

export const runtime = "nodejs";

type Body = {
  dryRun?: boolean;
  dateKey?: string;
  scheduledSlot?: string;
  reminderType?: "first" | "second" | "manual";
};

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.REMINDER_CRON_SECRET || "";
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;

  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return querySecret === secret;
}

function validDateKey(input: string | undefined): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(body.dateKey) ?? getDateKeyInTimezone(new Date(), timeZone);

    const slotFromClock = getCurrentScheduledSlot({ timeZone, toleranceMinutes: 6 });
    const scheduledSlot = body.scheduledSlot || slotFromClock?.slotKey || null;
    const reminderType = body.reminderType || slotFromClock?.reminderType || null;

    if (!scheduledSlot || !reminderType) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Outside configured check-in reminder window",
        dateKey,
        timeZone,
      });
    }

    if (body.dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        dateKey,
        timeZone,
        reminderType,
        scheduledSlot,
      });
    }

    const sb = getSupabaseAdmin();
    const result = await sendReminderToMissingPlayers(sb, {
      reminderType,
      scheduledSlot,
      dateKey,
      timeZone,
    });

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      reminderType,
      scheduledSlot,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
