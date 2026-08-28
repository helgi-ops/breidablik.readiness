/**
 * Post-match recovery → Today signal loader. Runs the pure `recoveryWatch` engine
 * over the squad for the most recent match and returns each player's open-watch
 * read, so the coach_signals `post_match_recovery` adapter can surface it as a
 * Today chip. A team-loader port of the `/api/coach/recovery-watch` fan-out —
 * same gates (≥30 min played, real pre-match baseline, latest post-match check-in).
 *
 * Signal = the SUBJECTIVE readiness check-in vs each player's OWN pre-match
 * baseline. READ-ONLY / ADVISORY — never reads-as or writes the readiness colour.
 * Naturally empty outside the MD+1..MD+3 window after a match.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recoveryWatch, type RecoveryWatchStatus } from "./index";
import type { AthleteMetricBaseline, BaselineStatus } from "../baselines";

export type TeamRecoveryRead = {
  playerId: string;
  playerName: string;
  position: string | null;
  status: RecoveryWatchStatus;
  mdOffset: number | null;
  confident: boolean;
};

const MIN_MINUTES = 30;
const BASELINE_WINDOW_DAYS = 35; // pre-match window to define the personal norm

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}
/** Match the engine's maturity bands: <7 insufficient, 7–13 calibrating, ≥14 active. */
function buildBaseline(playerId: string, scores: number[], today: string): AthleteMetricBaseline {
  const n = scores.length;
  const mean = n ? scores.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n < 2 ? 0 : Math.sqrt(scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const sorted = [...scores].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
  const status: BaselineStatus = n < 7 ? "insufficient_data" : n < 14 ? "calibrating" : "active";
  return {
    player_id: playerId, metric_key: "wellness.total", n_observations: n,
    mean, sd, cv: mean ? sd / mean : null, median, window_days: BASELINE_WINDOW_DAYS,
    status, computed_at: today,
  };
}

export async function loadTeamRecoveryWatch(
  sb: SupabaseClient,
  teamId: string,
  today: string,
): Promise<TeamRecoveryRead[]> {
  // Most recent past match — the reference for MD-day and the baseline window.
  const { data: matchRows } = await sb
    .from("match_schedule").select("match_date")
    .eq("team_id", teamId).lte("match_date", today).order("match_date", { ascending: false }).limit(1);
  const match = (matchRows ?? [])[0] as { match_date: string } | undefined;
  if (!match) return []; // no recent match → nothing to watch

  const [minutesRes, playersRes] = await Promise.all([
    sb.from("match_player_minutes").select("player_id, minutes_played, is_dnp").eq("team_id", teamId).eq("match_date", match.match_date),
    sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true),
  ]);
  const nameById = new Map<string, { name: string; position: string | null }>();
  for (const p of (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>) {
    nameById.set(p.id, { name: (p.full_name ?? "—").trim(), position: p.position });
  }
  const played = ((minutesRes.data ?? []) as Array<{ player_id: string; minutes_played: number | null; is_dnp: boolean | null }>)
    .filter((m) => !m.is_dnp && (m.minutes_played ?? 0) >= MIN_MINUTES);
  const minutesById = new Map(played.map((m) => [m.player_id, m.minutes_played ?? 0]));
  const playerIds = played.map((m) => m.player_id);
  if (!playerIds.length) return [];

  // Readiness check-ins: pre-match window (baseline) + post-match (the reading).
  const windowStart = addDays(match.match_date, -BASELINE_WINDOW_DAYS);
  const { data: re } = await sb
    .from("readiness_entries")
    .select("player_id, entry_date, total_score, is_imputed")
    .eq("team_id", teamId).in("player_id", playerIds)
    .gte("entry_date", windowStart).lte("entry_date", today);
  type Row = { player_id: string; entry_date: string; total_score: number | null; is_imputed: boolean | null };
  const byPlayer = new Map<string, Row[]>();
  for (const r of (re ?? []) as Row[]) {
    if (r.total_score == null || r.is_imputed) continue; // real check-ins only
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id)!.push(r);
  }

  const out: TeamRecoveryRead[] = [];
  for (const pid of playerIds) {
    const rows = byPlayer.get(pid) ?? [];
    const preMatch = rows.filter((r) => r.entry_date < match.match_date).map((r) => r.total_score as number);
    const postMatch = rows.filter((r) => r.entry_date > match.match_date).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    if (!postMatch.length) continue; // no check-in since the match → nothing to read yet
    const latest = postMatch[0];

    const result = recoveryWatch({
      minutesPlayed: minutesById.get(pid) ?? null,
      mdDay: `MD+${dayDiff(latest.entry_date, match.match_date)}`,
      todayReadiness: latest.total_score,
      baseline: buildBaseline(pid, preMatch, today),
      minMinutes: MIN_MINUTES,
    });
    const info = nameById.get(pid) ?? { name: "—", position: null };
    out.push({
      playerId: pid, playerName: info.name, position: info.position,
      status: result.status, mdOffset: result.mdOffset, confident: result.confident,
    });
  }
  return out;
}
