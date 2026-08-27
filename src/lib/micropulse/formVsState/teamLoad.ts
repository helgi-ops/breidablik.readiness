/**
 * Team-wide Form-vs-State loader (server helper).
 *
 * The `/api/coach/form-vs-state` route reads ONE player at a time (picker + drill-down).
 * The Today background-signal needs the whole squad at once, so this does the same
 * assembly in BULK — a few paged team-wide queries + the pure `computeFormVsState`
 * engine per player — instead of N per-player HTTP fan-outs. Same inputs, same engine,
 * same honest per-90 approximation (per-match minutes are sparse today).
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour or the daily
 * decision. Descriptive only; feeds the exception-gated coach_signals chip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { computeFormVsState, type FormRead, type TaggedMatch, type OpponentLevel } from "@/lib/micropulse/formVsState";

const WINDOW = 100;      // matches per player (effectively the full season) — matches the route
const OBV_KEY = "OBV";

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v
  : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
const obvOf = (metrics: unknown): number | null =>
  metrics && typeof metrics === "object" ? num((metrics as Record<string, unknown>)[OBV_KEY]) : null;
const resultOf = (gf: number | null, ga: number | null): "W" | "D" | "L" | null =>
  gf == null || ga == null ? null : gf > ga ? "W" : gf < ga ? "L" : "D";
/** Besta deild = 12 teams: top third high, middle med, bottom low. Unknown when unscouted. */
const levelOf = (pos: number | null): OpponentLevel | null =>
  pos == null ? null : pos <= 4 ? "high" : pos <= 8 ? "med" : "low";

type Row = Record<string, unknown>;

/**
 * The full-squad Form-vs-State read. One `FormRead` per active player who has any
 * per-match OBV row; players without enough graded matches come back `verdict: "unknown"`
 * (the engine's own gate) and are simply not actionable.
 */
export async function loadTeamFormReads(sb: SupabaseClient, teamId: string): Promise<FormRead[]> {
  // Active players.
  const { data: players } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Row[];
  if (roster.length === 0) return [];

  // Per-match output rows for the whole team (paged past the 1000-row cap).
  const pmAll = await fetchAllPages<Row>((from, to) =>
    sb.from("player_match_stats")
      .select("player_id, match_date, opponent, home_away, minutes, metrics")
      .eq("team_id", teamId).not("player_id", "is", null)
      .order("match_date", { ascending: false }).range(from, to));

  // Season baselines (his own OBV per-90 norm).
  const { data: seasonRows } = await sb.from("player_season_stats").select("player_id, metrics").eq("team_id", teamId);
  const baselineByPlayer = new Map<string, number>();
  for (const s of (seasonRows ?? []) as Row[]) {
    const pid = String(s.player_id ?? ""); if (!pid || baselineByPlayer.has(pid)) continue;
    const v = obvOf(s.metrics); if (v != null) baselineByPlayer.set(pid, v);
  }

  // Readiness colour on every match date (team-wide, paged) + schedule results + opponent levels.
  const [readAll, schedRes, scoutRes] = await Promise.all([
    fetchAllPages<Row>((from, to) =>
      sb.from("readiness_entries").select("player_id, entry_date, color, is_imputed").eq("team_id", teamId).range(from, to)),
    sb.from("match_schedule").select("match_date, goals_for, goals_against").eq("team_id", teamId),
    sb.from("scout_team_season").select("opponent_name, league_position").eq("owner_team_id", teamId).not("league_position", "is", null),
  ]);
  const readByKey = new Map<string, { color: string | null; imputed: boolean }>(); // `${player}|${date}`
  for (const r of readAll as Row[]) readByKey.set(`${String(r.player_id)}|${String(r.entry_date)}`, { color: (r.color as string) ?? null, imputed: r.is_imputed === true });
  const resByDate = new Map<string, "W" | "D" | "L" | null>();
  for (const r of (schedRes.data ?? []) as Row[]) resByDate.set(String(r.match_date), resultOf(num(r.goals_for), num(r.goals_against)));
  const levelByOpp = new Map<string, OpponentLevel | null>();
  for (const r of (scoutRes.data ?? []) as Row[]) levelByOpp.set(String(r.opponent_name).toLowerCase(), levelOf(num(r.league_position)));

  // Group per-match rows by player (dedup per date, preferring the row carrying OBV).
  const byPlayer = new Map<string, Map<string, Row>>();
  for (const r of pmAll) {
    const pid = String(r.player_id ?? ""); const d = String(r.match_date ?? "");
    if (!pid || !d) continue;
    let m = byPlayer.get(pid); if (!m) { m = new Map(); byPlayer.set(pid, m); }
    const prev = m.get(d);
    if (!prev || (obvOf(prev.metrics) == null && obvOf(r.metrics) != null)) m.set(d, r);
  }

  const reads: FormRead[] = [];
  for (const p of roster) {
    const pid = String(p.id);
    const dateMap = byPlayer.get(pid);
    if (!dateMap) continue; // no per-match rows → nothing to read
    const rows = [...dateMap.values()].sort((a, b) => (String(a.match_date) < String(b.match_date) ? 1 : -1)).slice(0, WINDOW);
    const matches: TaggedMatch[] = rows.map((r) => {
      const d = String(r.match_date);
      const rd = readByKey.get(`${pid}|${d}`) ?? { color: null, imputed: false };
      const opp = (r.opponent as string) ?? null;
      const output = obvOf(r.metrics);
      return {
        date: d, opponent: opp, output, outputPer90: output, minutes: num(r.minutes),
        readinessColor: rd.color, readinessImputed: rd.imputed,
        homeAway: (r.home_away as "home" | "away") ?? null,
        result: resByDate.get(d) ?? null,
        opponentLevel: opp ? (levelByOpp.get(opp.toLowerCase()) ?? null) : null,
      };
    });
    reads.push(computeFormVsState({
      playerId: pid, name: (p.full_name as string) ?? "—", position: (p.position as string) ?? null,
      primaryMetric: { key: OBV_KEY, label: { en: "OBV", is: "OBV" } },
      baselinePer90: baselineByPlayer.get(pid) ?? null, matches,
    }));
  }
  return reads;
}
