import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { runReadinessEmailReminders } from "@/lib/reminders/emailReminders";

export const runtime = "nodejs";

type Body = { date?: string; teamId?: string | null };

function normalizeDate(v: string | undefined): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();

    const body = (await req.json().catch(() => ({}))) as Body;
    const { teamId } = await requireCoachAccessForTeam(sb, req, body.teamId ?? null);
    // A missing team would email every team's players.
    if (!teamId) throw new Error("Team context is required");
    const timeZone = getOperationalTimezone();
    const dateKey = normalizeDate(body.date) ?? getDateKeyInTimezone(new Date(), timeZone);

    const result = await runReadinessEmailReminders(sb, {
      dateKey,
      timeZone,
      teamId,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    const mapped = authErrorToResponse(error);
    if (mapped) return mapped;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method Not Allowed" }, { status: 405 });
}
