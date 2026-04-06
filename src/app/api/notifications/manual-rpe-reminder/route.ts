import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { sendRpeReminderToMissingPlayers } from "@/lib/notifications/sendRpeReminder";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

type ManualBody = {
  teamId?: string | null;
  date?: string;
};

function normalizeDate(v: string | undefined): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const body = (await req.json().catch(() => ({}))) as ManualBody;
    const requestedTeamId = body.teamId ? String(body.teamId) : null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const timeZone = getOperationalTimezone();
    const dateKey = normalizeDate(body.date) ?? getDateKeyInTimezone(new Date(), timeZone);

    const result = await sendRpeReminderToMissingPlayers(sb, {
      reminderType: "manual",
      scheduledSlot: "manual",
      dateKey,
      timeZone,
      teamId,
    });

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      teamId,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}

