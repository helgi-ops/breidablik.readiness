export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { normalizeSendMode } from "@/lib/micropulse/strengthProgramming/sendMode";
import { loadProgrammeWeeks } from "@/lib/micropulse/strengthProgramming/programmeWeeks";
import type { StrengthDelivery } from "@/lib/micropulse/strengthProgramming/deliveryView";

/**
 * GET ?from=&to=[&team_id=] — how the team's strength session is delivered for the weeks in [from, to] (Mondays;
 * at most 30 weeks): the team's send mode (teams.strength_send_mode) and, in standard mode, the Custom Programme
 * per week (programmeWeeks.ts). Read by the Meso pages and Micro (deliveryView.ts). team_id defaults to the coach's
 * own team, as the hub's other routes. Team-scoped: the caller must coach the team; every read is filtered by team_id.
 */
const MAX_WEEKS = 30;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const monday = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? from;
  if (!ISO.test(from) || !ISO.test(to) || to < from) return NextResponse.json({ error: "from (and to) as YYYY-MM-DD are required" }, { status: 400 });

  const supabase = getSupabase();
  let teamId: string | null = null;
  try {
    teamId = (await requireCoachAccessForTeam(supabase, req, url.searchParams.get("team_id"))).teamId;
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    throw err;
  }
  if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

  const weeks: string[] = [];
  for (let ws = monday(from); ws <= to && weeks.length < MAX_WEEKS; ws = new Date(Date.parse(`${ws}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10)) weeks.push(ws);

  const { data: team, error } = await supabase.from("teams").select("strength_send_mode, sport").eq("id", teamId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = (team ?? {}) as { strength_send_mode?: string | null; sport?: string | null };
  const mode = normalizeSendMode(row.strength_send_mode);
  const isBasketball = String(row.sport ?? "").toLowerCase() === "basketball";

  const out: StrengthDelivery = {
    teamId,
    mode,
    isBasketball,
    weeks: mode === "standard" ? await loadProgrammeWeeks(supabase, teamId, weeks) : [],
  };
  return NextResponse.json({ ok: true, ...out });
}
