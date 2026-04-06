import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { matchReadinessEmailSchedule, matchRpeEmailSchedule } from "@/lib/reminders/emailSchedule";
import { runReadinessEmailReminders, runRpeEmailReminders } from "@/lib/reminders/emailReminders";

export const runtime = "nodejs";

type CronBody = {
  dryRun?: boolean;
  dateKey?: string;
  runReadiness?: boolean;
  runRpe?: boolean;
};

function isAuthorized(req: Request): boolean {
  const secret = process.env.REMINDER_CRON_SECRET || "";
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return querySecret === secret;
}

function dateOrToday(dateKey: string | undefined, timeZone: string): string {
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  return getDateKeyInTimezone(new Date(), timeZone);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as CronBody;
    const timeZone = getOperationalTimezone();
    const dateKey = dateOrToday(body.dateKey, timeZone);
    const now = new Date();

    const readinessMatch = matchReadinessEmailSchedule({ now, timeZone });
    const rpeMatch = matchRpeEmailSchedule({ now, timeZone });

    const shouldRunReadiness = body.runReadiness === true || !!readinessMatch;
    const shouldRunRpe = body.runRpe === true || !!rpeMatch;

    if (!shouldRunReadiness && !shouldRunRpe) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Outside configured email reminder windows",
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
        readiness: shouldRunReadiness ? { slot: readinessMatch?.localTime ?? "09:00" } : null,
        rpe: shouldRunRpe ? { slot: rpeMatch?.localTime ?? "scheduled" } : null,
      });
    }

    const sb = getSupabaseAdmin();
    const readinessResult = shouldRunReadiness
      ? await runReadinessEmailReminders(sb, { dateKey, timeZone })
      : null;
    const rpeResult = shouldRunRpe
      ? await runRpeEmailReminders(sb, { dateKey, timeZone })
      : null;

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      readiness: readinessResult,
      rpe: rpeResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
