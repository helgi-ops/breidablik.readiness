/**
 * GET /api/player/drill-load?date=<YYYY-MM-DD>
 *
 * Player-facing, self-scoped: the player's OWN per-drill actual load (GPS +
 * IMA) for ALL periods of ONE date — powers the "load per drill" card on the
 * player Dashboard, which follows the GPS date pager. Reads player_drill_load
 * directly by session_date (no saved_sessions/session join), so it shows every
 * period the player actually did that day, including ones whose OpenField name
 * never matched a planned drill (labelled by their own period name).
 *
 * Self-hides ({ show:false }) on any error / no data, so it can never break the
 * dashboard. Forward-only: dates before per-drill ingest have no rows.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { resolveMss } from "@/lib/micropulse/load/speedZonesData";
import { profileFromDrillLoadRow, sessionLoadProfile } from "@/lib/micropulse/load/drillLoadProfile";

export const runtime = "nodejs";

type Row = {
  drill_id: string | null;
  period_name: string | null;
  period_order: number | null;
  distance_m: number | null;
  hir_total: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  max_velocity: number | null;
  accel_b23: number | null;
  decel_b23: number | null;
  accel_total: number | null;
  decel_total: number | null;
  player_load: number | null;
  ima_cod_total: number | null;
  high_ima: number | null;
  duration_min: number | null;
};

const numOrNull = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const anyOf = (...xs: (number | null)[]) => xs.some((x) => x != null);

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const date = new URL(req.url).searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ show: false });

    const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ show: false });

    const cols = "drill_id, period_name, period_order, distance_m, hir_total, vel_b5, vel_b6, max_velocity, accel_b23, decel_b23, accel_total, decel_total, player_load, ima_cod_total, high_ima, duration_min";
    const { data } = await sb
      .from("player_drill_load")
      .select(cols)
      .eq("player_id", playerId)
      .eq("session_date", date)
      .eq("team_id", teamId);
    const rows = (data ?? []) as Row[];

    // Stable order: by the coach's period order, then name.
    rows.sort((a, b) => {
      const ao = a.period_order ?? 9999, bo = b.period_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return String(a.period_name ?? "").localeCompare(String(b.period_name ?? ""));
    });

    let hasAnyData = false;
    const drills = rows.map((r) => {
      const engine = anyOf(numOrNull(r.distance_m), numOrNull(r.hir_total), numOrNull(r.vel_b6), numOrNull(r.player_load))
        ? { distance_m: numOrNull(r.distance_m), hir_total: numOrNull(r.hir_total), sprint_m: numOrNull(r.vel_b6), player_load: numOrNull(r.player_load) }
        : null;
      const driver = anyOf(numOrNull(r.ima_cod_total), numOrNull(r.high_ima))
        ? { cod: numOrNull(r.ima_cod_total), high_ima: numOrNull(r.high_ima) }
        : null;
      if (engine || driver) hasAnyData = true;
      return { drill_name: String(r.period_name ?? "–"), matched: r.drill_id != null, engine, driver, duration_min: numOrNull(r.duration_min) };
    }).filter((d) => d.engine || d.driver);

    // Delivered energy-system balance (Mohr) — one profile per drill from the real GPS
    // row against the player's own max sprint speed (so the speed axis actually resolves),
    // rolled up to the session. Descriptive; never the readiness colour. Best-effort — a
    // failure just omits the profile, never breaks the card.
    let loadProfile: ReturnType<typeof sessionLoadProfile> | null = null;
    try {
      const mss = (await resolveMss(teamId)).get(playerId)?.mssKmh ?? null;
      const profiles = rows.map((r) => profileFromDrillLoadRow({
        duration_min: r.duration_min, distance_m: r.distance_m, hir_total: r.hir_total,
        vel_b5: r.vel_b5, vel_b6: r.vel_b6, max_velocity: r.max_velocity,
        accel_b23: r.accel_b23, decel_b23: r.decel_b23, accel_total: r.accel_total, decel_total: r.decel_total,
      }, mss));
      const rolled = sessionLoadProfile(profiles);
      if (rolled.total > 0) loadProfile = rolled;
    } catch { /* omit the profile on any error */ }

    return NextResponse.json({ show: hasAnyData, date, drills, hasAnyData, loadProfile });
  } catch {
    return NextResponse.json({ show: false });
  }
}
