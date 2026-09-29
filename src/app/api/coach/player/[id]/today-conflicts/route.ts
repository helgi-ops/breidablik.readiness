/**
 * GET /api/coach/player/[id]/today-conflicts?dates=YYYY-MM-DD,YYYY-MM-DD,...
 *   → read-only preview of what a coach send would replace on those dates:
 *     - existing `player_today_strength_override` rows on the dates (another coach send that would be
 *       overwritten), each with its `origin`;
 *     - active per-player `custom_template_sets` windows overlapping the dates (a Custom Programme the
 *       override layer would sit above). See docs/session-delivery-model.md.
 *
 * Authorised via requireCoachAccessForTeam (admin may preview ANY team; a coach only their own).
 * Advisory only — never the readiness colour, writes nothing.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { summarizeDeliveryConflicts, type OverrideRow, type CustomWindow } from "@/lib/micropulse/sessionDelivery/conflicts";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabaseAdmin();

  const { data: pl } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const player = pl as { id: string; team_id: string | null } | null;
  if (!player?.team_id) return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });

  try {
    const { teamId } = await requireCoachAccessForTeam(sb, req, player.team_id);
    if (teamId !== player.team_id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const st = /forbidden/i.test(msg) ? 403 : /unauth|token|auth/i.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status: st });
  }

  const url = new URL(req.url);
  const dates = (url.searchParams.get("dates") ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!dates.length) return NextResponse.json({ ok: true, conflicts: summarizeDeliveryConflicts([], [], []) });

  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  // Existing coach-sent overrides on the exact target dates.
  const { data: ovRows } = await sb
    .from("player_today_strength_override")
    .select("entry_date, title, origin")
    .eq("player_id", playerId)
    .in("entry_date", dates);

  // Active per-player Custom Programme windows overlapping the target range
  // (start_date ≤ maxDate AND end_date ≥ minDate) — mirrors PlayerClient's per-player override read.
  const { data: winRows } = await sb
    .from("custom_template_sets")
    .select("set_name, table_name, start_date, end_date, md_days, note")
    .eq("player_id", playerId)
    .lte("start_date", maxDate)
    .gte("end_date", minDate);

  const conflicts = summarizeDeliveryConflicts(dates, (ovRows ?? []) as OverrideRow[], (winRows ?? []) as CustomWindow[]);
  return NextResponse.json({ ok: true, conflicts });
}
