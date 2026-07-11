/**
 * GET /api/player/session-drills?sessionId=<uuid>
 *
 * Player-facing, self-scoped: the player's OWN per-drill actual load (GPS +
 * IMA) for one built team session, so the session view can show "your work,
 * broken down by drill". Reads player_drill_load (per-player-per-drill, written
 * at Catapult ingest) and merges it onto the session's planned drill list.
 *
 * Only the player's own team's PUBLISHED session is returned (server-enforced,
 * even though we use the admin client — never trust the client). Self-hides
 * ({ show:false }) on any error / no data, so it can never break the page.
 * Forward-only: sessions ingested before this feature have no per-drill rows.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { normPeriodName } from "@/lib/micropulse/drillActuals";

export const runtime = "nodejs";

type Row = {
  drill_id: string | null;
  period_norm: string;
  period_order: number | null;
  distance_m: number | null;
  hir_total: number | null;
  vel_b6: number | null;
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
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ show: false });

    const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ show: false });

    // The player's own team's PUBLISHED session only (enforced server-side).
    const { data: sess } = await sb
      .from("saved_sessions")
      .select("id, team_id, session_date, published_at, items")
      .eq("id", sessionId)
      .maybeSingle();
    const session = sess as { id: string; team_id: string; session_date: string; published_at: string | null; items: unknown } | null;
    if (!session || session.team_id !== teamId || !session.published_at) return NextResponse.json({ show: false });

    const items = (Array.isArray(session.items) ? session.items : []) as Array<{ drill_id?: string | null; drill_name?: string | null }>;

    // The player's own per-drill rows for this session (fallback by date for
    // rows written before saved_session_id was resolved).
    const cols = "drill_id, period_norm, period_order, distance_m, hir_total, vel_b6, player_load, ima_cod_total, high_ima, duration_min";
    let rows: Row[] = [];
    {
      const { data } = await sb.from("player_drill_load").select(cols).eq("player_id", playerId).eq("saved_session_id", sessionId);
      rows = (data ?? []) as Row[];
    }
    if (!rows.length) {
      const { data } = await sb
        .from("player_drill_load")
        .select(cols)
        .eq("player_id", playerId)
        .eq("session_date", session.session_date)
        .eq("team_id", teamId);
      rows = (data ?? []) as Row[];
    }

    const byDrillId = new Map<string, Row>();
    const byNorm = new Map<string, Row>();
    const byOrder = new Map<number, Row>();
    for (const r of rows) {
      if (r.drill_id) byDrillId.set(r.drill_id, r);
      if (r.period_norm) byNorm.set(r.period_norm, r);
      if (r.period_order != null) byOrder.set(r.period_order, r);
    }

    let hasAnyData = false;
    const drills = items.map((it, idx) => {
      const name = String(it.drill_name ?? "");
      const r =
        (it.drill_id ? byDrillId.get(it.drill_id) : undefined) ??
        byNorm.get(normPeriodName(name)) ??
        byOrder.get(idx) ??
        null;
      if (!r) return { drill_name: name, matched: false, engine: null, driver: null, duration_min: null };

      const engine = anyOf(numOrNull(r.distance_m), numOrNull(r.hir_total), numOrNull(r.vel_b6), numOrNull(r.player_load))
        ? { distance_m: numOrNull(r.distance_m), hir_total: numOrNull(r.hir_total), sprint_m: numOrNull(r.vel_b6), player_load: numOrNull(r.player_load) }
        : null;
      const driver = anyOf(numOrNull(r.ima_cod_total), numOrNull(r.high_ima))
        ? { cod: numOrNull(r.ima_cod_total), high_ima: numOrNull(r.high_ima) }
        : null;
      if (engine || driver) hasAnyData = true;
      return { drill_name: name, matched: !!(engine || driver), engine, driver, duration_min: numOrNull(r.duration_min) };
    });

    return NextResponse.json({ show: hasAnyData, sessionId, sessionDate: session.session_date, drills, hasAnyData });
  } catch {
    return NextResponse.json({ show: false });
  }
}
