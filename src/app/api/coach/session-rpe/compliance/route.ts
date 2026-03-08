import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { getRpeComplianceForDate } from "@/lib/session-rpe/compliance";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(url.searchParams.get("date")) ?? getDateKeyInTimezone(new Date(), timeZone);

    const payload = await getRpeComplianceForDate(sb, {
      teamId,
      dateKey,
      timeZone,
    });

    return NextResponse.json({
      ok: true,
      dateKey,
      timeZone,
      teamId,
      ...payload,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

