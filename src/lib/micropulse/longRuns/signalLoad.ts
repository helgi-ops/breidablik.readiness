import "server-only";

/**
 * Team-wide long-run load read for the Today coach-signal chip (`long_run_load`).
 *
 * The measure is TIME in long continuous runs (IMA Free Running bands 5–8 = runs of ≥18 s, ~11 km/h tempo
 * running; docs/ima-free-running-bands.md), acute 7 days ÷ chronic 28 days with rest days as 0
 * (`computeImaRunningLoad`, Gabbett 2016 rolling averages). Time comes from the inertial sensor, so the read
 * exists INDOORS too — unlike the distance ratio on the Long runs card, which needs GPS.
 *
 * Two directions, both against the player's OWN 4-week base (so goalkeepers don't flag against outfielders):
 *  • spike   — ratio ≥ 1.3 (the derive grades ≥1.5 as a real per-player chip, 1.3–1.5 team-cluster only);
 *  • deficit — ratio ≤ DEFICIT_RATIO while he WAS at training (≥2 measured days in the 7-day window):
 *    "trained with the team, ran far less than usual". Absence is the Availability Board's job, not this.
 * Both need a confident base (≥14 run days in 28, `MIN_CHRONIC_DAYS`).
 *
 * Individual vs collective: every read carries the squad's median ratio (players present today). When the whole
 * squad is at ≤0.6 of its usual — a planned light week, the off-season, an irregular schedule — nobody "stands
 * out", so the derive turns the per-player deficit chips into one team line instead (HK off-season check: 15 of
 * 39 present-days read ≤0.5 individually, all on team-wide light weeks).
 *
 * Asymmetric data-gap guard: a row in the acute window WITHOUT Free Running durations (pod-forgot fill, a
 * session the re-sync missed) looks like "little running", so it blocks a deficit chip; a spike may still
 * fire, since missing data can only understate the acute side.
 *
 * Calibrated on Breiðablik 2026-05-01 → 10-24 (SQL): spike ≥1.5 = 9.2% of evaluable session-days
 * (≥2.0: 0.7%); deficit ≤0.5 = 11% of evaluable present-days (≤0.6 would be ~20%: too many). Both inside the
 * <20% flag-rate budget the other adapters keep.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour. Service-role read (tokenless → cron-safe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRows } from "./loader";
import { longRunsOf } from "./index";
import { computeImaRunningLoad, type ImaDayRow } from "@/lib/micropulse/imaRunningLoad";
import type { LongRunLoadLite } from "@/lib/micropulse/coachSignals";

const DAY = 86_400_000;
const CHRONIC_DAYS = 28;
const ACUTE_DAYS = 7;
/** Acute ÷ chronic at or below this = "well below his usual" (deficit). */
export const DEFICIT_RATIO = 0.5;
/** Acute ÷ chronic at or above this enters the spike side (the derive grades ≥1.5 as strong). */
export const SPIKE_WATCH_RATIO = 1.3;
/** A deficit needs this many measured days in the acute window — he was there, he ran little. */
export const DEFICIT_MIN_PRESENT_DAYS = 2;
/** The squad median needs this many present players before it is trusted as "the squad". */
const SQUAD_MIN_PRESENT = 4;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);

/** One evaluated player — every player with a confident base, flagged or not (the validation script's denominator). */
export type LongRunLoadRead = LongRunLoadLite & {
  /** acute ÷ chronic on long-run time; `direction` is null when neither side is crossed. */
  flagged: boolean;
  /** He has a measured long-run read on `today` itself. */
  presentToday: boolean;
};

/** Evaluate the whole active roster for one day. `reads` holds only players with a confident 28-day base. */
export async function evaluateTeamLongRunLoad(sb: SupabaseClient, teamId: string, today: string): Promise<{ evaluable: number; reads: LongRunLoadRead[] }> {
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) return { evaluable: 0, reads: [] };

  const from = addDays(today, -(CHRONIC_DAYS - 1));
  const acuteFrom = addDays(today, -(ACUTE_DAYS - 1));
  const rows = await fetchRows(sb, roster.map((p) => p.id), from, today);

  const days = new Map<string, ImaDayRow[]>();
  const present7 = new Map<string, number>();
  const gap7 = new Map<string, boolean>();
  const presentToday = new Set<string>();
  for (const r of rows) {
    const seconds = longRunsOf(r).seconds;
    const inAcute = r.date >= acuteFrom;
    if (seconds == null) {
      // A session row without Free Running durations: a data gap, not a quiet day.
      if (inAcute) gap7.set(r.player_id, true);
      continue;
    }
    if (!days.has(r.player_id)) days.set(r.player_id, []);
    days.get(r.player_id)!.push({ date: r.date, total: seconds });
    if (inAcute) present7.set(r.player_id, (present7.get(r.player_id) ?? 0) + 1);
    if (r.date === today) presentToday.add(r.player_id);
  }

  type Eval = { p: { id: string; full_name: string | null }; ratio: number; acute7: number; chronic28: number; chronicDays: number; presentDays7: number; acuteGap: boolean; presentToday: boolean };
  const evals: Eval[] = [];
  for (const p of roster) {
    const dr = days.get(p.id);
    if (!dr?.length) continue;
    const load = computeImaRunningLoad(dr, today);
    if (!load.confident || load.acwr == null) continue;
    evals.push({
      p, ratio: load.acwr, acute7: load.acute7, chronic28: load.chronic28, chronicDays: load.chronicDays,
      presentDays7: present7.get(p.id) ?? 0, acuteGap: gap7.get(p.id) ?? false, presentToday: presentToday.has(p.id),
    });
  }

  // The squad's own ratio today — players present today; too few → unknown (null), never a guess.
  const todays = evals.filter((e) => e.presentToday).map((e) => e.ratio);
  const squadRatio = todays.length >= SQUAD_MIN_PRESENT ? median(todays) : null;

  const reads: LongRunLoadRead[] = evals.map((e) => {
    const direction: LongRunLoadLite["direction"] | null =
      e.ratio >= SPIKE_WATCH_RATIO ? "spike"
      : e.ratio <= DEFICIT_RATIO && e.presentDays7 >= DEFICIT_MIN_PRESENT_DAYS && !e.acuteGap ? "deficit"
      : null;
    return {
      playerId: e.p.id,
      name: (e.p.full_name ?? "").trim() || "—",
      ratio: e.ratio,
      direction: direction ?? "spike", // placeholder for unflagged reads; `flagged` says whether it counts
      flagged: direction != null,
      presentToday: e.presentToday,
      acuteSecDay: e.acute7,
      chronicSecDay: e.chronic28,
      chronicDays: e.chronicDays,
      presentDays7: e.presentDays7,
      acuteGap: e.acuteGap,
      squadRatio,
    };
  });
  return { evaluable: reads.length, reads };
}

/** The flagged set only — what the derive functions grade. */
export async function loadTeamLongRunLoadSignals(sb: SupabaseClient, teamId: string, today: string): Promise<LongRunLoadLite[]> {
  const { reads } = await evaluateTeamLongRunLoad(sb, teamId, today);
  return reads.filter((r) => r.flagged).map((r) => ({
    playerId: r.playerId, name: r.name, ratio: r.ratio, direction: r.direction,
    acuteSecDay: r.acuteSecDay, chronicSecDay: r.chronicSecDay, chronicDays: r.chronicDays,
    presentDays7: r.presentDays7, acuteGap: r.acuteGap, squadRatio: r.squadRatio,
  }));
}
