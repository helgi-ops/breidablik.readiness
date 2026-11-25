export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { weekConfirmStatuses } from "@/lib/micropulse/weekSetup/confirmation";

/**
 * GET ?from=&to=[&team_id=] (team_id defaults to the coach's own team, as the hub's other routes) — each confirmed week's status in [from, to] (Monday ISO dates): confirmed, changed since
 * the confirmation, or (absent from the list) not confirmed. Read by the Micro week bar and the Meso week cards.
 * Team-scoped: the caller must coach the team; every read is filtered by team_id.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get("team_id");
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(from) || !iso.test(to)) return NextResponse.json({ error: "from and to (YYYY-MM-DD) are required" }, { status: 400 });

  const supabase = getSupabase();
  let teamId: string | null = null;
  try {
    teamId = (await requireCoachAccessForTeam(supabase, req, requested)).teamId;
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    throw err;
  }
  if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

  const { data: setups, error } = await supabase.from("week_setups")
    .select("week_start, confirmed_at").eq("team_id", teamId).gte("week_start", from).lte("week_start", to).not("confirmed_at", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const confirmed = (setups ?? []) as Array<{ week_start: string; confirmed_at: string | null }>;
  if (!confirmed.length) return NextResponse.json({ ok: true, weeks: [] });

  const weeks = confirmed.map((s) => s.week_start).sort();
  const lastDay = new Date(Date.parse(`${weeks[weeks.length - 1]}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: plans }, { data: coachSetups }] = await Promise.all([
    supabase.from("week_plans").select("day_date, updated_at").eq("team_id", teamId).gte("day_date", weeks[0]).lte("day_date", lastDay),
    supabase.from("coach_week_setup").select("week_start_date, updated_at").eq("team_id", teamId).in("week_start_date", weeks),
  ]);
  return NextResponse.json({
    ok: true,
    weeks: weekConfirmStatuses({
      setups: confirmed,
      plans: (plans ?? []) as Array<{ day_date: string; updated_at: string | null }>,
      coachSetups: (coachSetups ?? []) as Array<{ week_start_date: string; updated_at: string | null }>,
    }),
  });
}
