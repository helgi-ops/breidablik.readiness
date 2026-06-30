import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
import { getReminderContext, sendReminderToMissingPlayers } from "@/lib/reminders/checkinReminders";

export const runtime = "nodejs";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}


function isAuthorizedCron(req: Request) {
  const header = req.headers.get("x-cron-secret") || "";
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  const expected = process.env.REMINDER_CRON_SECRET || "";
  return Boolean(expected) && (header === expected || querySecret === expected);
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

export async function POST(req: Request) {
  try {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const ctx = getReminderContext();
    if (!ctx.reminderType) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Outside reminder window", context: ctx });
    }

    const sb = getAdminClient();
    const result = await sendReminderToMissingPlayers(sb, {
      dateKey: ctx.dateKey,
      reminderType: ctx.reminderType,
    });

    return NextResponse.json({ ok: true, context: ctx, result });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
