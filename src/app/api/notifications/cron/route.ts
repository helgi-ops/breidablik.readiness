/**
 * Local test:
 * curl -X POST "http://localhost:3000/api/notifications/cron" \
 *   -H "Authorization: Bearer $REMINDER_CRON_SECRET"
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getCurrentScheduledSlot,
  getDateKeyInTimezone,
  getOperationalTimezone,
  type ReminderProfile,
} from "@/lib/notifications/schedule";
import { sendReminderToMissingPlayers } from "@/lib/notifications/sendReminder";
import { sendRpeReminderToMissingPlayers } from "@/lib/notifications/sendRpeReminder";
import { getCurrentScheduledSlot as getCurrentRpeScheduledSlot } from "@/lib/session-rpe/reminderConfig";
import { matchReadinessEmailSchedule, matchRpeEmailSchedule } from "@/lib/reminders/emailSchedule";
import { runReadinessEmailReminders, runRpeEmailReminders } from "@/lib/reminders/emailReminders";
import { sendCmjReminderToTeam } from "@/lib/notifications/sendCmjReminder";
import { sendDailyNudge, type NudgeType } from "@/lib/notifications/sendDailyNudge";
import { runPersonalBestDetection } from "@/lib/notifications/sendPersonalBestNudge";
import { runCoachMorningDigest, runThresholdAlerts } from "@/lib/notifications/coachDigest";

export const runtime = "nodejs";

/** Minutes-since-midnight in the operational timezone. */
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}
/** Opt-in daily player nudge windows (±30 min): outlook ~08:00, recap ~19:00. */
function matchNudgeSlot(now: Date, timeZone: string): { nudgeType: NudgeType; slotKey: string } | null {
  const mins = localMinutes(now, timeZone);
  if (Math.abs(mins - 8 * 60) <= 30) return { nudgeType: "daily_outlook", slotKey: "daily_outlook_0800" };
  if (Math.abs(mins - 19 * 60) <= 30) return { nudgeType: "daily_recap", slotKey: "daily_recap_1900" };
  return null;
}

type CronBody = {
  dryRun?: boolean;
};

// Profiles dispatched on each cron tick. 'none' is intentionally excluded —
// teams on that profile do not receive automated reminders.
const ACTIVE_REMINDER_PROFILES: ReminderProfile[] = ["standard", "breidablik_custom"];

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
    const profileSlots = ACTIVE_REMINDER_PROFILES.map((profile) => ({
      profile,
      checkinSlot: getCurrentScheduledSlot({ timeZone, toleranceMinutes: 30, profile }),
      rpeSlot: getCurrentRpeScheduledSlot({ timeZone, toleranceMinutes: 30, profile }),
    }));

    const readinessEmailSlot = matchReadinessEmailSchedule({ now, timeZone, toleranceMinutes: 30 });
    const rpeEmailSlot = matchRpeEmailSchedule({ now, timeZone, toleranceMinutes: 30 });

    // CMJ reminder fires at the second checkin reminder window (10:00 Mon/Wed/Fri/Sat/Sun,
    // 13:00 Tue/Thu) — this corresponds to the breidablik_custom profile's "second" slot.
    const breidablikCheckin = profileSlots.find((p) => p.profile === "breidablik_custom")?.checkinSlot ?? null;
    const isCmjSlot = breidablikCheckin?.reminderType === "second";

    const anyCheckinSlot = profileSlots.some((p) => p.checkinSlot);
    const anyRpeSlot = profileSlots.some((p) => p.rpeSlot);
    const nudgeSlot = matchNudgeSlot(now, timeZone);

    if (!anyCheckinSlot && !anyRpeSlot && !readinessEmailSlot && !rpeEmailSlot && !isCmjSlot && !nudgeSlot) {
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
        profiles: profileSlots.map((p) => ({
          profile: p.profile,
          checkin: p.checkinSlot
            ? { reminderType: p.checkinSlot.reminderType, scheduledSlot: p.checkinSlot.slotKey }
            : null,
          rpe: p.rpeSlot
            ? { reminderType: p.rpeSlot.reminderType, scheduledSlot: p.rpeSlot.slotKey }
            : null,
        })),
        readinessEmail: readinessEmailSlot
          ? { localTime: readinessEmailSlot.localTime, slotKey: readinessEmailSlot.slotKey }
          : null,
        rpeEmail: rpeEmailSlot
          ? { localTime: rpeEmailSlot.localTime, slotKey: rpeEmailSlot.slotKey }
          : null,
        cmj: isCmjSlot ? { slot: "07:00", active: true } : null,
        nudge: nudgeSlot,
      });
    }

    const sb = getSupabaseAdmin();

    type CheckinPerProfile = {
      profile: ReminderProfile;
      reminderType: string;
      scheduledSlot: string;
      result: Awaited<ReturnType<typeof sendReminderToMissingPlayers>>;
    };
    type RpePerProfile = {
      profile: ReminderProfile;
      reminderType: string;
      scheduledSlot: string;
      result: Awaited<ReturnType<typeof sendRpeReminderToMissingPlayers>>;
    };

    const checkinResults: CheckinPerProfile[] = [];
    const rpeResults: RpePerProfile[] = [];

    for (const { profile, checkinSlot, rpeSlot } of profileSlots) {
      if (checkinSlot) {
        const result = await sendReminderToMissingPlayers(sb, {
          reminderType: checkinSlot.reminderType,
          scheduledSlot: checkinSlot.slotKey,
          dateKey,
          timeZone,
          profile,
        });
        checkinResults.push({
          profile,
          reminderType: checkinSlot.reminderType,
          scheduledSlot: checkinSlot.slotKey,
          result,
        });
      }
      if (rpeSlot) {
        const result = await sendRpeReminderToMissingPlayers(sb, {
          reminderType: rpeSlot.reminderType,
          scheduledSlot: rpeSlot.slotKey,
          dateKey,
          timeZone,
          profile,
        });
        rpeResults.push({
          profile,
          reminderType: rpeSlot.reminderType,
          scheduledSlot: rpeSlot.slotKey,
          result,
        });
      }
    }

    const readinessEmailResult = readinessEmailSlot
      ? await runReadinessEmailReminders(sb, { dateKey, timeZone })
      : null;
    const rpeEmailResult = rpeEmailSlot
      ? await runRpeEmailReminders(sb, { dateKey, timeZone })
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

    // Opt-in daily player nudges (off by default — only reaches players who
    // enabled the type). Outlook fires on training days; recap only for players
    // with a session today. Break/off-day-aware, de-duped.
    const nudgeResult = nudgeSlot
      ? await sendDailyNudge(sb, { nudgeType: nudgeSlot.nudgeType, dateKey, scheduledSlot: nudgeSlot.slotKey })
      : null;

    // Personal-best celebrations — run once daily at the evening (recap) slot so
    // pushes land in courteous hours. Idempotent (de-duped in the PB table).
    const personalBestResult = nudgeSlot?.nudgeType === "daily_recap"
      ? await runPersonalBestDetection(sb, { now: new Date().toISOString(), recencyDays: 3 })
      : null;

    // Coach morning digest (proactive-delivery Addition 1) — piggybacks the
    // morning outlook window so no new cron entry is needed. Opt-in, PRO+, deduped.
    const coachDigestResult = nudgeSlot?.nudgeType === "daily_outlook"
      ? await runCoachMorningDigest(sb, { dateKey })
      : null;

    // Coach threshold alerts (Addition 2) — per-signal pushes for newly-actionable
    // reads, opt-in + PRO+, deduped/cooldowned. Same morning window (no new cron).
    const coachAlertsResult = nudgeSlot?.nudgeType === "daily_outlook"
      ? await runThresholdAlerts(sb, { dateKey })
      : null;

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      nudge: nudgeResult,
      personalBest: personalBestResult,
      coachDigest: coachDigestResult,
      coachAlerts: coachAlertsResult,
      checkin: checkinResults.length ? checkinResults : null,
      rpe: rpeResults.length ? rpeResults : null,
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
