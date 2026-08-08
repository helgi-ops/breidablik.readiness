export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/total-player-analysis
 *   GET ?list=1              → active roster for the picker (+ which axes each player has)
 *   GET ?playerId=&lang=     → TotalPlayerAnalysis for one player (footballer + athlete +
 *                              cross-links + coverage + headline)
 *
 * The hub at the top of the (consolidated) Player Season Analysis page. Aggregates
 * data already in the system — footballer per-90 percentiles (StatsBomb squad) and the
 * athlete physical qualities (GPS / VALD / VBT), each ranked by rules into two SEPARATE
 * labelled reads. Never a blended score. PERFORMANCE ONLY — it never reads or writes the
 * readiness colour, the load decision, or the medical/injury view; asymmetry is surfaced
 * as robustness, not injury risk. The footballer↔players.id bridge surfaces unmatched
 * players, never guess-merges.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { buildPlayerAnalysis, readMetricBag, looksLikeGoalkeeper, type PlayerRow } from "@/lib/micropulse/playerAnalysis";
import { buildAthleteProfile, type SquadAthletePlayer, type AthleteSignalSet } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { buildTotalPlayerAnalysis } from "@/lib/micropulse/playerAnalysis/totalPlayerAnalysis";
import { reduceGps, reduceForceDecks, reduceImtp, reduceVbt, mergeSignals, type GpsRow, type ForceDeckRow, type ImtpMetricRow, type VbtRow } from "@/lib/micropulse/playerAnalysis/athleteSignals";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId } as const;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

type RosterRow = { id: string; full_name: string; position: string | null; sport: string | null };

async function loadRoster(teamId: string): Promise<RosterRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("players").select("id, full_name, position, sport, is_active").eq("team_id", teamId).eq("is_active", true);
  return ((data ?? []) as Array<{ id: string; full_name: string | null; position: string | null; sport: string | null }>)
    .map((r) => ({ id: r.id, full_name: r.full_name ?? "—", position: r.position, sport: r.sport }));
}

/** The StatsBomb squad rows (footballer axis), with GK flagged from the roster + the bag. */
async function loadFootballSquad(teamId: string, roster: RosterRow[]): Promise<PlayerRow[]> {
  const supabase = getSupabase();
  const gkList = roster.filter((p) => /goal\s?keeper|^gk$/i.test((p.position ?? "").trim())).map((p) => ({ id: "gk", fullName: p.full_name }));
  const isRosterGk = (name: string) => gkList.length > 0 && matchByInitialSurname(name, gkList).confidence !== "none";
  const { data } = await supabase.from("player_season_stats")
    .select("wyscout_player_name, minutes, goals, assists, xg, metrics")
    .eq("team_id", teamId).eq("source", "statsbomb_csv");
  return ((data ?? []) as Array<{ wyscout_player_name: string | null; minutes: number | null; goals: number | null; assists: number | null; xg: number | null; metrics: Record<string, unknown> | null }>)
    .map((r) => {
      const name = r.wyscout_player_name ?? "—";
      return {
        name, minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg),
        metrics: readMetricBag(r.metrics),
        isGoalkeeper: looksLikeGoalkeeper(r.metrics, (r.metrics as Record<string, unknown> | null)?.["Primary Position"] as string | null) || isRosterGk(name),
      };
    });
}

/** Load + reduce the physical sources for the whole team into per-players.id signals. */
async function loadAthleteSignals(teamId: string): Promise<Map<string, AthleteSignalSet>> {
  const supabase = getSupabase();
  const gps = await fetchAllPages<GpsRow>((from, to) => supabase.from("player_external_load_daily")
    .select("player_id, date, max_velocity, ima_accel, accelerations, ima_decel, decelerations, ima_cod, cod_events, high_speed_distance, hir_dist, total_distance, session_duration_minutes")
    .eq("team_id", teamId).range(from, to));
  const { data: fd } = await supabase.from("vald_forcedecks_results")
    .select("microplayer_id, test_timestamp, test_type, rsi_mod, relative_peak_power_w_kg, asymmetry_percent, is_valid")
    .eq("team_id", teamId).limit(5000);
  const { data: imtp } = await supabase.from("vald_test_metrics")
    .select("microplayer_id, test_timestamp, metric_code, value, test_type")
    .eq("team_id", teamId).eq("test_type", "IMTP").in("metric_code", ["PEAK_VERTICAL_FORCE", "NET_PEAK_VERTICAL_FORCE"]).limit(5000);

  // GymAware VBT has no team_id — scope it by the roster's player ids. Guarded: if the
  // table is absent in this project the query throws, so skip VBT cleanly.
  const rosterIds = (await loadRoster(teamId)).map((r) => r.id);
  let vbt: VbtRow[] = [];
  if (rosterIds.length) {
    try {
      const { data } = await supabase.from("gymaware_vbt_sessions")
        .select("player_id, session_date, exercise_name, peak_power").in("player_id", rosterIds).limit(5000);
      vbt = (data ?? []) as VbtRow[];
    } catch { vbt = []; }
  }

  return mergeSignals([
    reduceGps(gps),
    reduceForceDecks((fd ?? []) as ForceDeckRow[]),
    reduceImtp((imtp ?? []) as ImtpMetricRow[]),
    reduceVbt(vbt),
  ]);
}

/** Bridge a roster player → their StatsBomb squad name (mapping first, then name-fold). */
async function footballNameFor(teamId: string, player: RosterRow, squad: PlayerRow[]): Promise<string | null> {
  const supabase = getSupabase();
  const { data: map } = await supabase.from("stat_player_mapping")
    .select("wyscout_player_name").eq("team_id", teamId).eq("player_id", player.id).limit(1).maybeSingle();
  const mapped = (map as { wyscout_player_name?: string } | null)?.wyscout_player_name ?? null;
  if (mapped && squad.some((s) => s.name === mapped)) return mapped;
  const m = matchByInitialSurname(player.full_name, squad.map((s) => ({ id: s.name, fullName: s.name })));
  return m.confidence !== "none" ? m.playerId : null; // playerId here carries the squad name
}

function athleteSquadInput(roster: RosterRow[], signals: Map<string, AthleteSignalSet>): { players: SquadAthletePlayer[]; sport: string | null } {
  return {
    players: roster.map((r) => ({ playerId: r.id, name: r.full_name, position: r.position, signals: signals.get(r.id) ?? {} })),
    sport: roster[0]?.sport ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const roster = await loadRoster(auth.teamId);

  if (url.searchParams.get("list")) {
    const [signals, squad] = await Promise.all([loadAthleteSignals(auth.teamId), loadFootballSquad(auth.teamId, roster)]);
    const players = await Promise.all(roster.map(async (r) => {
      const sig = signals.get(r.id) ?? {};
      const athleteQualities = Object.keys(sig).length;
      const fbName = await footballNameFor(auth.teamId, r, squad);
      return {
        playerId: r.id, name: r.full_name, position: r.position,
        has: { athlete: athleteQualities > 0, footballer: !!fbName },
        athleteQualities,
      };
    }));
    // Most-covered players first so the picker defaults to someone with data.
    players.sort((a, b) => (Number(b.has.footballer) + b.athleteQualities) - (Number(a.has.footballer) + a.athleteQualities) || a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, players });
  }

  const playerId = (url.searchParams.get("playerId") ?? "").trim();
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });
  const me = roster.find((r) => r.id === playerId);
  if (!me) return NextResponse.json({ ok: false, error: "Player not on the active roster." }, { status: 404 });

  const [signals, squad] = await Promise.all([loadAthleteSignals(auth.teamId), loadFootballSquad(auth.teamId, roster)]);
  const athlete = buildAthleteProfile(athleteSquadInput(roster, signals), playerId);

  const fbName = await footballNameFor(auth.teamId, me, squad);
  const footballer = fbName ? buildPlayerAnalysis({ player: fbName, squad }) : null;

  const total = buildTotalPlayerAnalysis({ playerId, footballer, athlete });
  return NextResponse.json({
    ok: true,
    player: { id: me.id, name: me.full_name, position: me.position },
    total,
    // Honest provenance for the coach: whether the footballer side could be bridged.
    footballerMatched: !!fbName,
    footballerSourceAvailable: squad.length > 0,
  });
}
