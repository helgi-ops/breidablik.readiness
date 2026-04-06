import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { sendRpeReminderToMissingPlayers } from "@/lib/notifications/sendRpeReminder";
import { getCurrentScheduledSlot } from "@/lib/session-rpe/reminderConfig";

export const runtime = "nodejs";

type RpeReminderBody = {
  dryRun?: boolean;
  dateKey?: string;
  scheduledSlot?: string;
  reminderType?: "first" | "second" | "manual";
  teamId?: string | null;
};

function isAuthorized(req: Request): boolean {
  const reminderSecret = process.env.REMINDER_CRON_SECRET || "";
  const catapultSecret = process.env.CATAPULT_CRON_SECRET || "";

  const auth = req.headers.get("authorization") || "";
  if (reminderSecret && auth === `Bearer ${reminderSecret}`) return true;
  if (catapultSecret && auth === `Bearer ${catapultSecret}`) return true;

  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  if (reminderSecret && querySecret === reminderSecret) return true;
  if (catapultSecret && querySecret === catapultSecret) return true;

  return false;
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
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as RpeReminderBody;
    const timeZone = getOperationalTimezone();
    // Query params act as fallback for GET requests (no body)
    const dateKey =
      validDateKey(body.dateKey) ??
      validDateKey(url.searchParams.get("dateKey") ?? undefined) ??
      getDateKeyInTimezone(new Date(), timeZone);

    const slotFromClock = getCurrentScheduledSlot({ timeZone, toleranceMinutes: 6 });
    const scheduledSlot =
      body.scheduledSlot ||
      url.searchParams.get("scheduledSlot") ||
      slotFromClock?.slotKey ||
      null;
    const reminderType = (
      body.reminderType ||
      url.searchParams.get("reminderType") ||
      slotFromClock?.reminderType ||
      null
    ) as RpeReminderBody["reminderType"] | null;
    if (!scheduledSlot || !reminderType) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Outside configured RPE reminder window",
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
        teamId: body.teamId ?? null,
      });
    }

    const sb = getSupabaseAdmin();
    const result = await sendRpeReminderToMissingPlayers(sb, {
      reminderType,
      scheduledSlot,
      dateKey,
      timeZone,
      teamId: body.teamId ?? null,
    });

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      reminderType,
      scheduledSlot,
      teamId: body.teamId ?? null,
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

