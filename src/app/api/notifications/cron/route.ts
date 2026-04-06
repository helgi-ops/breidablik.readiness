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
import { matchReadinessEmailSchedule, matchRpeEmailSchedule } from "@/lib/reminders/emailSchedule";
import { runReadinessEmailReminders, runRpeEmailReminders } from "@/lib/reminders/emailReminders";
import { sendCmjReminderToTeam } from "@/lib/notifications/sendCmjReminder";

export const runtime = "nodejs";

type CronBody = {
  dryRun?: boolean;
};

function isAuthorized(req: Request): boolean {
  // Vercel automatically sends "Authorization: Bearer <CRON_SECRET>" for scheduled cron jobs.
  // CRON_SECRET is the built-in Vercel env var; REMINDER_CRON_SECRET is our custom secret for
  // manual/external calls. We accept either.
  const cronSecret = process.env.CRON_SECRET || "";
  const reminderSecret = process.env.REMINDER_CRON_SECRET || "";

  const auth = req.headers.get("authorization") || "";

  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (reminderSecret && auth === `Bearer ${reminderSecret}`) return true;

  // Query-param fallback for manual calls (e.g. curl testing)
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  if (reminderSecret && querySecret === reminderSecret) return true;

  return false;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as CronBody;
    const timeZone = getOperationalTimezone();
    const dateKey = getDateKeyInTimezone(new Date(), timeZone);
    const now = new Date();
    // Use a wide tolerance so the cron still matches even if Vercel fires it
    // several minutes late (common — Pro plan can be 5–15 min off schedule).
    const checkinSlot = getCurrentScheduledSlot({ timeZone, toleranceMinutes: 30 });
    const rpeSlot = getCurrentRpeScheduledSlot({ timeZone, toleranceMinutes: 30 });
    const readinessEmailSlot = matchReadinessEmailSchedule({ now, timeZone, toleranceMinutes: 30 });
    const rpeEmailSlot = matchRpeEmailSchedule({ now, timeZone, toleranceMinutes: 30 });

    // CMJ reminder fires at the second checkin reminder window (10:00 Mon/Wed/Fri/Sat/Sun,
    // 13:00 Tue/Thu) — right around when players are completing their checkin.
    // This means it arrives as players are already looking at the app, so the message
    // to "hop á ForceDecks" lands at a useful moment.
    const isCmjSlot = checkinSlot?.reminderType === "second";

    if (!checkinSlot && !rpeSlot && !readinessEmailSlot && !rpeEmailSlot && !isCmjSlot) {
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
        readinessEmail: readinessEmailSlot
          ? {
              localTime: readinessEmailSlot.localTime,
              slotKey: readinessEmailSlot.slotKey,
            }
          : null,
        rpeEmail: rpeEmailSlot
          ? {
              localTime: rpeEmailSlot.localTime,
              slotKey: rpeEmailSlot.slotKey,
            }
          : null,
        cmj: isCmjSlot ? { slot: "07:00", active: true } : null,
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
    const readinessEmailResult = readinessEmailSlot
      ? await runReadinessEmailReminders(sb, {
          dateKey,
          timeZone,
        })
      : null;
    const rpeEmailResult = rpeEmailSlot
      ? await runRpeEmailReminders(sb, {
          dateKey,
          timeZone,
        })
      : null;

    // CMJ reminder: fetch all team IDs and send to each team
    let cmjResults: Awaited<ReturnType<typeof sendCmjReminderToTeam>>[] = [];
    if (isCmjSlot) {
      const { data: teams } = await sb
        .from("profiles")
        .select("team_id")
        .not("team_id", "is", null);
      const teamIds = [...new Set(((teams ?? []) as Array<{ team_id: string }>).map((r) => r.team_id).filter(Boolean))];
      cmjResults = await Promise.all(
        teamIds.map((teamId) => sendCmjReminderToTeam(sb, { teamId, dateKey }))
      );
    }

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
      readinessEmail: readinessEmailSlot
        ? {
            localTime: readinessEmailSlot.localTime,
            slotKey: readinessEmailSlot.slotKey,
            result: readinessEmailResult,
          }
        : null,
      rpeEmail: rpeEmailSlot
        ? {
            localTime: rpeEmailSlot.localTime,
            slotKey: rpeEmailSlot.slotKey,
            result: rpeEmailResult,
          }
        : null,
      cmj: isCmjSlot
        ? {
            slot: "07:00",
            teams: cmjResults.length,
            sent: cmjResults.reduce((s, r) => s + r.sent, 0),
            playersNeedingCmj: cmjResults.reduce((s, r) => s + r.playersNeedingCmj, 0),
            results: cmjResults,
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
