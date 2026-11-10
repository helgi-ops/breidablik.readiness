import "server-only";

/**
 * Team-wide long-run load read for the Today coach-signal chip (`long_run_load`).
 *
 * The measure is TIME in long continuous runs (runs of ≥18 s) AT MATCH PACE — the bands whose average pace is
 * 11 km/h or faster (`matchPaceOf`, docs/ima-free-running-bands.md "Pace: match pace vs jog"). In training most
 * long runs are jogs (warm-up laps, jogging back between drills: Breiðablik Jun–Oct 2026, 0.7 of 5.6 long runs a
 * training day were at match pace; a match 14.1 of 15.5), and the days with the MOST long-run time were jog days
 * (5 Jul 2026: 523 s per player, 0 at match pace). Counting all long-run time flagged those jog days as spikes.
 * Acute 7 days ÷ chronic 28 days with rest days as 0 (`computeImaRunningLoad`, Gabbett 2016 rolling averages).
 *
 * Pace needs GPS distance. A player with any long runs of unknown pace in his 28-day window (indoor sessions,
 * HK's home games) is read on ALL long-run time for the whole window instead — one measure per window, never
 * a mix — and the read says so (`basis: "all"`). Confidence counts MEASURED days (0 included), since match-pace
 * time is 0 on most training days.
 *
 * Two directions, both against the player's OWN 4-week base (so goalkeepers don't flag against outfielders):
 *  • spike   — ratio ≥ 1.3 (the derive grades ≥1.5 as a real per-player chip, 1.3–1.5 team-cluster only);
 *  • deficit — ratio ≤ DEFICIT_RATIO while he WAS at training (≥2 measured days in the 7-day window):
 *    "trained with the team, ran far less than usual". Absence is the Availability Board's job, not this.
 * Both need a confident base (≥14 measured days in 28).
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
 * OFF ON TODAY since 10 Nov 2026 (`LONG_RUN_LOAD_ON_TODAY`). Replay on Breiðablik, 150 days to 2026-10-31
 * (scripts/validate-long-run-load-signal.ts), share of present player-days:
 *
 *   measure                      | ratio p10 · p50 · p90 | spike ≥1.5 | deficit ≤0.5
 *   all long-run time (old)      | 0.62 · 0.98 · 1.41    | 7.6%       | 4.6%   ← but the spikes were jog days
 *   long-run time at match pace  | 0.00 · 0.89 · 2.15    | 25.2%      | 18.5%  ← over the <20% budget
 *   … with a 30 s/day usual floor|                       | 22.4%      | 15.0%
 *
 * At match pace the time comes almost all from matches, so the 7-day ÷ 28-day ratio follows whether he played
 * the last match in full — something the coach already knows from minutes — and not a change in what training
 * gave him. The old measure was steady only because jogs filled it. Neither is a chip the coach should act on,
 * so Today shows none. The Long runs card (ima-intelligence) keeps the numbers, split into match pace and jog.
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
/** The chip is off on Today — see the replay in the header. `evaluateTeamLongRunLoad` still runs for the validation script. */
export const LONG_RUN_LOAD_ON_TODAY = false;
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
/** What a read is measured on: long-run time at match pace (default), or all long-run time (the pre-Nov-2026 measure, kept for the replay). */
export type LongRunMeasure = "matchPace" | "all";

export async function evaluateTeamLongRunLoad(
  sb: SupabaseClient, teamId: string, today: string,
  opts: { measure?: LongRunMeasure; minChronicSecDay?: number } = {},
): Promise<{ evaluable: number; reads: LongRunLoadRead[] }> {
  const measure = opts.measure ?? "matchPace";
  const minChronic = opts.minChronicSecDay ?? 0;
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) return { evaluable: 0, reads: [] };

  const from = addDays(today, -(CHRONIC_DAYS - 1));
  const acuteFrom = addDays(today, -(ACUTE_DAYS - 1));
  const rows = await fetchRows(sb, roster.map((p) => p.id), from, today);

  // Per player: every measured day with both measures; a window with any long runs of unknown pace reads "all".
  const days = new Map<string, Array<{ date: string; all: number; mp: number | null }>>();
  const paceUnknown = new Set<string>();
  const present7 = new Map<string, number>();
  const gap7 = new Map<string, boolean>();
  const presentToday = new Set<string>();
  for (const r of rows) {
    const lr = longRunsOf(r);
    const seconds = lr.seconds;
    const inAcute = r.date >= acuteFrom;
    if (seconds == null) {
      // A session row without Free Running durations: a data gap, not a quiet day.
      if (inAcute) gap7.set(r.player_id, true);
      continue;
    }
    // No long runs at all = 0 at match pace too, GPS or not; long runs without a pace = unknown.
    const mp = seconds === 0 ? 0 : lr.matchPace?.seconds ?? null;
    if (mp == null) paceUnknown.add(r.player_id);
    if (!days.has(r.player_id)) days.set(r.player_id, []);
    days.get(r.player_id)!.push({ date: r.date, all: seconds, mp });
    if (inAcute) present7.set(r.player_id, (present7.get(r.player_id) ?? 0) + 1);
    if (r.date === today) presentToday.add(r.player_id);
  }

  type Eval = { p: { id: string; full_name: string | null }; basis: LongRunMeasure; ratio: number; acute7: number; chronic28: number; chronicDays: number; presentDays7: number; acuteGap: boolean; presentToday: boolean };
  const evals: Eval[] = [];
  for (const p of roster) {
    const measured = days.get(p.id);
    if (!measured?.length) continue;
    const basis: LongRunMeasure = measure === "matchPace" && !paceUnknown.has(p.id) ? "matchPace" : "all";
    const dr: ImaDayRow[] = measured.map((d) => ({ date: d.date, total: basis === "matchPace" ? (d.mp ?? 0) : d.all }));
    // Measured days count toward confidence, 0 included (match-pace time is 0 on most training days).
    const load = computeImaRunningLoad(dr, today, { presenceDays: measure === "matchPace" });
    if (!load.confident || load.acwr == null || load.chronic28 < minChronic) continue;
    evals.push({
      p, basis, ratio: load.acwr, acute7: load.acute7, chronic28: load.chronic28, chronicDays: load.chronicDays,
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
      basis: e.basis,
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

/** The flagged set only — what the derive functions grade. Empty while the chip is off on Today. */
export async function loadTeamLongRunLoadSignals(sb: SupabaseClient, teamId: string, today: string): Promise<LongRunLoadLite[]> {
  if (!LONG_RUN_LOAD_ON_TODAY) return [];
  const { reads } = await evaluateTeamLongRunLoad(sb, teamId, today);
  return reads.filter((r) => r.flagged).map((r) => ({
    playerId: r.playerId, name: r.name, ratio: r.ratio, direction: r.direction, basis: r.basis,
    acuteSecDay: r.acuteSecDay, chronicSecDay: r.chronicSecDay, chronicDays: r.chronicDays,
    presentDays7: r.presentDays7, acuteGap: r.acuteGap, squadRatio: r.squadRatio,
  }));
}
