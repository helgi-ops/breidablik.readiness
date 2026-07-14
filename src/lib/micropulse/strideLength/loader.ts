import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { oneRowPerDate } from "@/lib/micropulse/load/oneRowPerDate";
import {
  assessStrideLength,
  classifySession,
  strideLength,
  VERDICT_KINDS,
  type SessionKind,
  type StrideResult,
  type StrideSession,
} from "@/lib/micropulse/strideLength";

/**
 * strideLength/loader — the single place that assembles the inputs the stride
 * engine needs and hands back its verdict. Every surface (player Today recap,
 * post-match cards, coach Stride Intelligence, the match-day team view) calls
 * this rather than re-deriving stride length or the flag. The engine
 * (`assessStrideLength`) stays the one source of truth; this file only fetches
 * and shapes.
 *
 * The three engine invariants live upstream and are preserved here by feeding
 * the engine correctly: (1) compare LIKE WITH LIKE — history is filtered to the
 * same session kind as today; (2) classify by MINUTES (match_player_minutes),
 * distance only as a fallback; (3) the 2.5 SD flag is the engine's, untouched.
 */

const DEFAULT_LOOKBACK_DAYS = 120;

/** Raw daily-load columns we read for stride length. */
interface StrideLoadRow {
  player_id?: string | null;
  date: string;
  source?: string | null;
  ima_fr_band58_total_distance: number | null;
  ima_fr_band5_stride_count: number | null;
  ima_fr_band6_stride_count: number | null;
  ima_fr_band7_stride_count: number | null;
  ima_fr_band8_stride_count: number | null;
  total_distance: number | null;
}

const STRIDE_LOAD_COLS =
  "player_id, date, source, ima_fr_band58_total_distance, " +
  "ima_fr_band5_stride_count, ima_fr_band6_stride_count, " +
  "ima_fr_band7_stride_count, ima_fr_band8_stride_count, total_distance";

interface MinutesRow {
  player_id: string;
  match_date: string;
  minutes_played: number;
  is_dnp: boolean | null;
}

export type StrideVerdictResult = StrideResult & {
  date: string;
  /**
   * True when coach-entered minutes exist for this date, i.e. the session was
   * CONFIRMED a match/session by minutes (not merely inferred from distance).
   * A surface shown on ordinary training days should gate on this — otherwise a
   * hard training session gets classified "match" by the distance fallback and
   * mis-flags as "shortened" against his match norm.
   */
  minutesKnown: boolean;
};
export interface TeamStrideVerdict extends StrideVerdictResult {
  playerId: string;
  fullName: string | null;
}

function startIsoFor(date: string, lookbackDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (lookbackDays - 1));
  return d.toISOString().slice(0, 10);
}

/** Sum the high-cadence stride bands (5–8) for one daily row. */
function bandStrides(r: StrideLoadRow): number {
  return (
    (Number(r.ima_fr_band5_stride_count ?? 0) || 0) +
    (Number(r.ima_fr_band6_stride_count ?? 0) || 0) +
    (Number(r.ima_fr_band7_stride_count ?? 0) || 0) +
    (Number(r.ima_fr_band8_stride_count ?? 0) || 0)
  );
}

/**
 * Turn one player's resolved daily rows + his minutes into StrideSessions.
 * `minutesByDate`: a DNP row is 0 min, a missing entry is `null` (unknown →
 * the engine's classifier falls back to distance, at lower confidence).
 */
export function buildStrideSessions(
  rows: StrideLoadRow[],
  minutesByDate: Map<string, number | null>,
): StrideSession[] {
  return oneRowPerDate(rows).map((r) => {
    const minutes = minutesByDate.has(r.date) ? minutesByDate.get(r.date)! : null;
    const distance = r.ima_fr_band58_total_distance != null ? Number(r.ima_fr_band58_total_distance) : null;
    const strides = bandStrides(r);
    return {
      date: r.date,
      kind: classifySession(minutes, r.total_distance != null ? Number(r.total_distance) : null),
      highCadenceDistanceM: distance,
      highCadenceStrides: strides > 0 ? strides : null,
    };
  });
}

/** Split sessions into today + prior same-kind history. */
function todayAndHistory(
  sessions: StrideSession[],
  date: string,
): { today: StrideSession; history: StrideSession[] } {
  const found = sessions.find((s) => s.date === date);
  // No load row for the target date → an empty session the engine reads as
  // "too little running to measure" (honest unmeasurable, never a green tick).
  const today: StrideSession =
    found ?? { date, kind: "light_session", highCadenceDistanceM: null, highCadenceStrides: null };
  const history = sessions.filter((s) => s.date < date && s.kind === today.kind);
  return { today, history };
}

/** Mean stride length across a set of same-kind sessions, or null. */
function meanStrideLength(sessions: StrideSession[]): number | null {
  const lens = sessions.map(strideLength).filter((v): v is number => v != null);
  if (!lens.length) return null;
  return lens.reduce((a, b) => a + b, 0) / lens.length;
}

/**
 * One player's stride verdict for `date`. Group norm is optional — pass it from
 * the team view (where the squad rows are already in hand); single-player
 * callers may omit it and the engine leans on his own same-kind history.
 */
export async function loadStrideVerdict(
  sb: SupabaseClient,
  args: {
    playerId: string;
    date: string;
    lookbackDays?: number;
    groupNormM?: number | null;
  },
): Promise<StrideVerdictResult> {
  const lookbackDays = args.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const startIso = startIsoFor(args.date, lookbackDays);

  const [{ data: loadRows }, { data: minuteRows }] = await Promise.all([
    sb.from("player_external_load_daily")
      .select(STRIDE_LOAD_COLS)
      .eq("player_id", args.playerId)
      .in("source", ["catapult", "manual"])
      .gte("date", startIso)
      .lte("date", args.date)
      .order("date", { ascending: true }),
    sb.from("match_player_minutes")
      .select("player_id, match_date, minutes_played, is_dnp")
      .eq("player_id", args.playerId)
      .gte("match_date", startIso)
      .lte("match_date", args.date),
  ]);

  const minutesByDate = new Map<string, number | null>();
  for (const m of (minuteRows ?? []) as MinutesRow[]) {
    minutesByDate.set(m.match_date, m.is_dnp ? 0 : Number(m.minutes_played));
  }

  const sessions = buildStrideSessions((loadRows ?? []) as unknown as StrideLoadRow[], minutesByDate);
  const { today, history } = todayAndHistory(sessions, args.date);
  const groupNorm = args.groupNormM ?? null;
  return { ...assessStrideLength(today, history, groupNorm), date: args.date, minutesKnown: minutesByDate.has(args.date) };
}

/**
 * The match-day team view: every player's stride verdict for `date`, with a
 * squad norm computed once per session-kind (so a player with thin history is
 * shrunk toward his squad rather than left unmeasurable). Fetches the whole
 * team's window ONCE — no per-player scan.
 */
export async function loadTeamStrideVerdicts(
  sb: SupabaseClient,
  args: { teamId: string; date: string; lookbackDays?: number },
): Promise<TeamStrideVerdict[]> {
  const lookbackDays = args.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const startIso = startIsoFor(args.date, lookbackDays);

  const [{ data: loadRows }, { data: minuteRows }, { data: players }] = await Promise.all([
    sb.from("player_external_load_daily")
      .select(STRIDE_LOAD_COLS)
      .eq("team_id", args.teamId)
      .in("source", ["catapult", "manual"])
      .gte("date", startIso)
      .lte("date", args.date)
      .order("date", { ascending: true }),
    sb.from("match_player_minutes")
      .select("player_id, match_date, minutes_played, is_dnp")
      .eq("team_id", args.teamId)
      .gte("match_date", startIso)
      .lte("match_date", args.date),
    sb.from("players").select("id, full_name").eq("team_id", args.teamId).eq("is_active", true),
  ]);

  // Group rows + minutes by player.
  const loadByPlayer = new Map<string, StrideLoadRow[]>();
  for (const r of (loadRows ?? []) as unknown as StrideLoadRow[]) {
    const k = String(r.player_id ?? "");
    if (!k) continue;
    if (!loadByPlayer.has(k)) loadByPlayer.set(k, []);
    loadByPlayer.get(k)!.push(r);
  }
  const minutesByPlayer = new Map<string, Map<string, number | null>>();
  for (const m of (minuteRows ?? []) as MinutesRow[]) {
    const k = String(m.player_id);
    if (!minutesByPlayer.has(k)) minutesByPlayer.set(k, new Map());
    minutesByPlayer.get(k)!.set(m.match_date, m.is_dnp ? 0 : Number(m.minutes_played));
  }

  // Build every player's sessions, then a squad norm per verdict-kind from all
  // prior same-kind sessions across the squad (today's own row excluded so a
  // player is never compared against himself-today).
  const sessionsByPlayer = new Map<string, StrideSession[]>();
  const priorByKind: Record<SessionKind, StrideSession[]> = {
    match: [],
    big_session: [],
    light_session: [],
  };
  for (const [playerId, rows] of loadByPlayer) {
    const sessions = buildStrideSessions(rows, minutesByPlayer.get(playerId) ?? new Map());
    sessionsByPlayer.set(playerId, sessions);
    for (const s of sessions) {
      if (s.date < args.date) priorByKind[s.kind].push(s);
    }
  }
  const groupNormByKind: Record<SessionKind, number | null> = {
    match: meanStrideLength(priorByKind.match),
    big_session: meanStrideLength(priorByKind.big_session),
    light_session: meanStrideLength(priorByKind.light_session),
  };

  const nameOf = new Map(
    ((players ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [String(p.id), p.full_name]),
  );

  const out: TeamStrideVerdict[] = [];
  for (const [playerId, sessions] of sessionsByPlayer) {
    const { today, history } = todayAndHistory(sessions, args.date);
    const groupNorm = VERDICT_KINDS.includes(today.kind) ? groupNormByKind[today.kind] : null;
    out.push({
      playerId,
      fullName: nameOf.get(playerId) ?? null,
      date: args.date,
      minutesKnown: minutesByPlayer.get(playerId)?.has(args.date) ?? false,
      ...assessStrideLength(today, history, groupNorm),
    });
  }

  // Shortened first (the ones a coach must see), then most-negative delta.
  const rank = (v: TeamStrideVerdict) => (v.verdict === "shortened" ? 0 : v.verdict === "lengthened" ? 1 : v.verdict === "normal" ? 2 : 3);
  out.sort((a, b) => rank(a) - rank(b) || (a.deltaPct ?? 0) - (b.deltaPct ?? 0));
  return out;
}
