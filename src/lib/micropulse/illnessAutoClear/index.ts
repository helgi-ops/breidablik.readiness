import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-clear stale illness flags when a player has clearly returned to
 * training and resolved symptoms. Runs nightly via cron.
 *
 * Decision rule (all of these must be true):
 *   1. injury_events.injury_type = 'illness' AND is_active = true AND
 *      return_date IS NULL
 *   2. injury_date is at least MIN_DAYS_SINCE_ONSET old (default 5d) — gives
 *      breathing room for short-cycle illness flags
 *   3. Player has trained ≥ MIN_SESSIONS_RECENT (default 3) Catapult sessions
 *      in the last 7 days with each session's total_player_load ≥
 *      MIN_LOAD_FRACTION × player's 28-day chronic mean (default 0.5)
 *   4. Player's last MIN_WELLNESS_STABLE_DAYS (default 5) wellness check-ins
 *      have no RED/AMBER auto-flag (computed_auto_flag NOT IN ('RED','AMBER'))
 *
 * When all conditions are satisfied:
 *   - Set is_active = false
 *   - Set return_date = today (calendar date)
 *   - Append a structured note explaining why
 *
 * Conservative by design — coaches can always re-flag illness manually.
 *
 * References:
 *   - Halson 2014: Monitoring training load to understand fatigue. (Sports Med)
 *   - Schwellnus et al. 2016: How much is too much? (Br J Sports Med) — illness
 *     return-to-train criteria.
 */

// TWO PATHS to auto-clear, whichever fires first:
//
//   Fast path (recently sick, clear once symptoms resolved):
//     - days_since_onset >= 5
//     - >=3 training sessions in last 7 days at >=50% baseline
//     - <=1 RED auto-flag in last 5 days (allows brief post-match dips)
//
//   Long-window path (clearly long since recovered, fall back):
//     - days_since_onset >= 14
//     - >=5 training sessions in last 14 days at >=50% baseline
//     - (no wellness condition — clearly playing through fine)
const MIN_DAYS_SINCE_ONSET_FAST = 5;
const MIN_SESSIONS_FAST = 3;
const FAST_TRAINING_WINDOW_DAYS = 7;
const FAST_WELLNESS_WINDOW_DAYS = 5;
const FAST_MAX_RED_FLAGS = 1;

const MIN_DAYS_SINCE_ONSET_LONG = 14;
const MIN_SESSIONS_LONG = 5;
const LONG_TRAINING_WINDOW_DAYS = 14;

const MIN_LOAD_FRACTION = 0.5;
const CHRONIC_BASELINE_DAYS = 28;

export type IllnessClearResult = {
  scanned: number;
  evaluated: number;
  cleared: number;
  errors: string[];
  details: Array<{
    injuryId: string;
    playerId: string;
    cleared: boolean;
    reason: string;
  }>;
};

type IllnessRow = {
  id: string;
  player_id: string;
  injury_date: string;
  notes: string | null;
};

type LoadRow = {
  player_id: string;
  date: string;
  total_player_load: number | null;
};

type WellnessRow = {
  player_id: string;
  entry_date: string;
  computed_auto_flag: string | null;
};

export async function runIllnessAutoClear(
  sb: SupabaseClient,
  args: { todayIso?: string; dryRun?: boolean } = {},
): Promise<IllnessClearResult> {
  const todayIso = args.todayIso ?? new Date().toISOString().slice(0, 10);
  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const result: IllnessClearResult = {
    scanned: 0,
    evaluated: 0,
    cleared: 0,
    errors: [],
    details: [],
  };

  // 1. Pull active illness flags older than MIN_DAYS_SINCE_ONSET_FAST
  const onsetCutoff = new Date(todayDate);
  onsetCutoff.setUTCDate(onsetCutoff.getUTCDate() - MIN_DAYS_SINCE_ONSET_FAST);
  const onsetCutoffIso = onsetCutoff.toISOString().slice(0, 10);

  const { data: illnesses, error: ilErr } = await sb
    .from("injury_events")
    .select("id, player_id, injury_date, notes")
    .eq("injury_type", "illness")
    .eq("is_active", true)
    .is("return_date", null)
    .lte("injury_date", onsetCutoffIso);

  if (ilErr) {
    result.errors.push(`Illness scan failed: ${ilErr.message}`);
    return result;
  }

  result.scanned = illnesses?.length ?? 0;
  if (!illnesses || illnesses.length === 0) return result;

  const playerIds = Array.from(new Set(illnesses.map((i) => i.player_id)));

  // 2. Pull load rows for chronic baseline + recent window
  const chronicStart = new Date(todayDate);
  chronicStart.setUTCDate(chronicStart.getUTCDate() - CHRONIC_BASELINE_DAYS + 1);
  const chronicStartIso = chronicStart.toISOString().slice(0, 10);

  const { data: loadRows, error: loadErr } = await sb
    .from("player_external_load_daily")
    .select("player_id, date, total_player_load")
    .in("player_id", playerIds)
    .eq("source", "catapult")
    .gte("date", chronicStartIso)
    .lte("date", todayIso);
  if (loadErr) {
    result.errors.push(`Load scan failed: ${loadErr.message}`);
    return result;
  }

  // 3. Pull recent wellness flags (fast path window)
  const wellnessStart = new Date(todayDate);
  wellnessStart.setUTCDate(wellnessStart.getUTCDate() - FAST_WELLNESS_WINDOW_DAYS + 1);
  const wellnessStartIso = wellnessStart.toISOString().slice(0, 10);

  const { data: wellnessRows, error: wellnessErr } = await sb
    .from("readiness_entries")
    .select("player_id, entry_date, computed_auto_flag")
    .in("player_id", playerIds)
    .gte("entry_date", wellnessStartIso)
    .lte("entry_date", todayIso);
  if (wellnessErr) {
    result.errors.push(`Wellness scan failed: ${wellnessErr.message}`);
    return result;
  }

  // Index per player
  const loadByPlayer = new Map<string, LoadRow[]>();
  for (const r of (loadRows ?? []) as LoadRow[]) {
    const arr = loadByPlayer.get(r.player_id) ?? [];
    arr.push(r);
    loadByPlayer.set(r.player_id, arr);
  }
  const wellnessByPlayer = new Map<string, WellnessRow[]>();
  for (const r of (wellnessRows ?? []) as WellnessRow[]) {
    const arr = wellnessByPlayer.get(r.player_id) ?? [];
    arr.push(r);
    wellnessByPlayer.set(r.player_id, arr);
  }

  // 4. Evaluate each illness — try fast path first, fall back to long-window path.
  const fastCutoff = new Date(todayDate);
  fastCutoff.setUTCDate(fastCutoff.getUTCDate() - FAST_TRAINING_WINDOW_DAYS + 1);
  const fastCutoffIso = fastCutoff.toISOString().slice(0, 10);
  const longCutoff = new Date(todayDate);
  longCutoff.setUTCDate(longCutoff.getUTCDate() - LONG_TRAINING_WINDOW_DAYS + 1);
  const longCutoffIso = longCutoff.toISOString().slice(0, 10);

  for (const ill of (illnesses as IllnessRow[])) {
    result.evaluated += 1;
    const daysSinceOnset = Math.floor(
      (todayDate.getTime() - new Date(`${ill.injury_date}T00:00:00Z`).getTime()) / 86_400_000,
    );
    const loads = loadByPlayer.get(ill.player_id) ?? [];

    // Chronic baseline — exclude zero days to avoid inflating threshold for sparse athletes.
    const chronicValues = loads
      .filter((l) => (l.total_player_load ?? 0) > 0)
      .map((l) => Number(l.total_player_load ?? 0));
    if (chronicValues.length < 4) {
      result.details.push({
        injuryId: ill.id,
        playerId: ill.player_id,
        cleared: false,
        reason: "insufficient chronic baseline (<4 sessions in 28d)",
      });
      continue;
    }
    const chronicMean = chronicValues.reduce((s, v) => s + v, 0) / chronicValues.length;
    const loadFloor = chronicMean * MIN_LOAD_FRACTION;

    const fastSessions = loads.filter(
      (l) => l.date >= fastCutoffIso && (l.total_player_load ?? 0) >= loadFloor,
    );
    const longSessions = loads.filter(
      (l) => l.date >= longCutoffIso && (l.total_player_load ?? 0) >= loadFloor,
    );

    const wellness = wellnessByPlayer.get(ill.player_id) ?? [];
    const redCount = wellness.filter((w) => w.computed_auto_flag === "RED").length;

    // Fast path: recently sick (5d+), training back, ≤1 RED in last 5d (post-match dips OK).
    const fastQualifies =
      daysSinceOnset >= MIN_DAYS_SINCE_ONSET_FAST &&
      fastSessions.length >= MIN_SESSIONS_FAST &&
      redCount <= FAST_MAX_RED_FLAGS;

    // Long-window path: 14d+ since onset, multiple full sessions — wellness ignored
    // since long-since-recovered athletes can have normal post-match RED dips.
    const longQualifies =
      daysSinceOnset >= MIN_DAYS_SINCE_ONSET_LONG &&
      longSessions.length >= MIN_SESSIONS_LONG;

    if (!fastQualifies && !longQualifies) {
      result.details.push({
        injuryId: ill.id,
        playerId: ill.player_id,
        cleared: false,
        reason:
          `not eligible — days_since_onset=${daysSinceOnset}, fast_sessions=${fastSessions.length}, ` +
          `long_sessions=${longSessions.length}, recent_red=${redCount} (PL floor ${loadFloor.toFixed(0)})`,
      });
      continue;
    }

    // All conditions met — clear it.
    const path = fastQualifies ? "fast" : "long-window";
    const newNote =
      `Auto-cleared ${todayIso} (${path}): returned to training. ` +
      `Onset ${ill.injury_date}, ${daysSinceOnset}d. ` +
      `${fastSessions.length} session(s) ≥${MIN_LOAD_FRACTION * 100}% baseline (~${chronicMean.toFixed(0)} PL) in last ${FAST_TRAINING_WINDOW_DAYS}d, ` +
      `${redCount} RED auto-flag(s) in last ${FAST_WELLNESS_WINDOW_DAYS}d.`;
    const combinedNotes = ill.notes ? `${ill.notes}\n\n${newNote}` : newNote;

    if (!args.dryRun) {
      const { error: updateErr } = await sb
        .from("injury_events")
        .update({
          is_active: false,
          return_date: todayIso,
          notes: combinedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ill.id);

      if (updateErr) {
        result.errors.push(`Failed to clear ${ill.id}: ${updateErr.message}`);
        continue;
      }
    }

    result.cleared += 1;
    result.details.push({
      injuryId: ill.id,
      playerId: ill.player_id,
      cleared: true,
      reason: `cleared via ${path} path (fast=${fastSessions.length}, long=${longSessions.length}, baseline=${chronicMean.toFixed(0)}, red=${redCount})`,
    });
  }

  return result;
}
