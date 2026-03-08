/**
 * Local test:
 * curl -X POST "http://localhost:3000/api/notifications/cron" \
 *   -H "Authorization: Bearer $REMINDER_CRON_SECRET"
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentScheduledSlot, getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { sendReminderToMissingPlayers } from "@/lib/notifications/sendReminder";
import { sendRpeReminderToMissingPlayers } from "@/lib/notifications/sendRpeReminder";
import { getCurrentScheduledSlot as getCurrentRpeScheduledSlot } from "@/lib/session-rpe/reminderConfig";

export const runtime = "nodejs";

type CronBody = {
  dryRun?: boolean;
};

function isAuthorized(req: Request): boolean {
  const secret = process.env.REMINDER_CRON_SECRET || "";
  if (!secret) return false;

  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;

  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return querySecret === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as CronBody;
    const timeZone = getOperationalTimezone();
    const dateKey = getDateKeyInTimezone(new Date(), timeZone);
    const checkinSlot = getCurrentScheduledSlot({ timeZone, toleranceMinutes: 6 });
    const rpeSlot = getCurrentRpeScheduledSlot({ timeZone, toleranceMinutes: 6 });

    if (!checkinSlot && !rpeSlot) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Outside configured reminder window",
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
        checkin: checkinSlot
          ? {
              reminderType: checkinSlot.reminderType,
              scheduledSlot: checkinSlot.slotKey,
            }
          : null,
        rpe: rpeSlot
          ? {
              reminderType: rpeSlot.reminderType,
              scheduledSlot: rpeSlot.slotKey,
            }
          : null,
      });
    }

    const sb = getSupabaseAdmin();
    const checkinResult = checkinSlot
      ? await sendReminderToMissingPlayers(sb, {
          reminderType: checkinSlot.reminderType,
          scheduledSlot: checkinSlot.slotKey,
          dateKey,
          timeZone,
        })
      : null;

    const rpeResult = rpeSlot
      ? await sendRpeReminderToMissingPlayers(sb, {
          reminderType: rpeSlot.reminderType,
          scheduledSlot: rpeSlot.slotKey,
          dateKey,
          timeZone,
        })
      : null;

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      checkin: checkinSlot
        ? {
            reminderType: checkinSlot.reminderType,
            scheduledSlot: checkinSlot.slotKey,
            result: checkinResult,
          }
        : null,
      rpe: rpeSlot
        ? {
            reminderType: rpeSlot.reminderType,
            scheduledSlot: rpeSlot.slotKey,
            result: rpeResult,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("/api/notifications/cron failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
