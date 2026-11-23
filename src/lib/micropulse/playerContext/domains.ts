/**
 * playerContext / domain fetchers
 *
 * The IO layer of the shared per-player context. Every function here was lifted
 * VERBATIM out of `strengthProgramming/loader.ts` (same queries, same windows,
 * same silent try/catch → null degradation) — the relocation is deliberate so
 * the strength snapshot's output stays byte-identical while the reads become a
 * shared substrate the readiness / performance / medical views will later reuse.
 *
 * Each fetch degrades gracefully: a missing table or null row yields null/empty,
 * and the caller (buildPlayerContext) records a per-source status alongside.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MdContext, PlayerStrengthSnapshot, SessionCorrective } from "../strengthProgramming/types";
import { parseWellnessNote, mergeNoteIntoSoreAreas } from "../strengthProgramming/noteParser";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { reconcile } from "@/lib/micropulse/unifiedDeficits/reconcile";
import { buildStrengthPlan } from "@/lib/micropulse/unifiedDeficits/strengthPlan";
import { loadPlayerMovementScreens } from "@/lib/micropulse/movementScreen/loader";
import { prescribeCorrectives } from "@/lib/micropulse/movementScreen/correctives/mapping";
import { sanitizePaletteSlots, type PaletteSlots } from "../strengthProgramming/palette";
import { sanitizeMdStructures, sanitizeNoMatchWeek, type MdStructures, type NoMatchWeek } from "../strengthProgramming/structures";
import { sanitizeMdRepsPerSet, type MdRepsPerSet } from "../strengthProgramming/weekRule";
import { activeGoal, sanitizePicks, type PlayerExercisePicks, type StrengthGoal } from "../strengthProgramming/playerPicks";
import { normalizeSendMode, type SendMode } from "../strengthProgramming/sendMode";
import { resolveWeekPhase } from "@/lib/micropulse/weekSetup/weekPhaseServer";
import { CONGESTION_PAST_MIN_MINUTES, CONGESTION_SPAN_DAYS, isCongestedWeek } from "../strengthProgramming/congestion";

/** Corrective compensation → the strength emphasis it corroborates (CONFIRM-vs-ADD
 *  de-dup when the strength blocks already emphasise the same quality). */
const COMP_EMPHASIS: Record<string, string> = {
  hip_abductor_weakness: "hip_abductor_er",
  dynamic_valgus: "hip_abductor_er",
  forward_trunk_lean: "posterior_chain",
  limited_dorsiflexion: "mobility",
  low_reactive_strength: "plyometric",
  poor_absorption: "eccentric",
  landing_instability: "unilateral",
  limb_asymmetry: "unilateral",
};

/** Team sport + current-week season phase — gates the upper-body block. Fail-safe. */
export async function fetchTeamContext(sb: SupabaseClient, teamId: string | null, todayIso: string): Promise<{ sport: string | null; seasonPhase: string | null; sendMode?: SendMode }> {
  if (!teamId) return { sport: null, seasonPhase: null };
  try {
    // The team's send mode rides on the same read (2026-11-17): it decides whether players take part.
    const { data: team } = await sb.from("teams").select("sport, strength_send_mode").eq("id", teamId).maybeSingle();
    const sport = ((team as { sport?: string | null } | null)?.sport ?? null) as string | null;
    const sendMode = normalizeSendMode((team as { strength_send_mode?: string | null } | null)?.strength_send_mode);
    // The week's phase: the coach's saved one (Week setup), else the season plan's (2026-11-18 — before, an
    // unsaved week had no phase here, so pre-season weeks planned from the Periodization Hub built as in-season).
    const { phase: seasonPhase } = await resolveWeekPhase(sb, teamId, todayIso);
    return { sport, seasonPhase, sendMode };
  } catch {
    return { sport: null, seasonPhase: null };
  }
}

/** The team's strength palette (per-slot exercise pool the coach chose). Empty
 *  when unset — the engine then falls back to the built-in template exercises.
 *  Fail-safe: any error → empty palette. */
export async function fetchTeamPalette(
  sb: SupabaseClient,
  teamId: string | null,
): Promise<{ slots: PaletteSlots; mdStructures: MdStructures; noMatchWeek: NoMatchWeek; mdRepsPerSet: MdRepsPerSet }> {
  if (!teamId) return { slots: {}, mdStructures: {}, noMatchWeek: {}, mdRepsPerSet: {} };
  try {
    // The weekday plan for weeks without a match (2026-11-17) and the reps a set per MD day (2026-11-19) are read in
    // the same row. Should either column be missing, the palette and MD setup still load (that setting is then unset).
    type Row = { slots?: unknown; md_structures?: unknown; no_match_week?: unknown; md_reps_per_set?: unknown };
    const read = async (cols: string) => {
      const r = await sb.from("team_strength_palette").select(cols).eq("team_id", teamId).maybeSingle();
      return { error: r.error, row: r.data as Row | null };
    };
    let res = await read("slots, md_structures, no_match_week, md_reps_per_set");
    if (res.error) res = await read("slots, md_structures, no_match_week");
    if (res.error) res = await read("slots, md_structures");
    const row = res.row;
    return {
      slots: sanitizePaletteSlots(row?.slots),
      mdStructures: sanitizeMdStructures(row?.md_structures),
      noMatchWeek: sanitizeNoMatchWeek(row?.no_match_week),
      mdRepsPerSet: sanitizeMdRepsPerSet(row?.md_reps_per_set),
    };
  } catch {
    return { slots: {}, mdStructures: {}, noMatchWeek: {}, mdRepsPerSet: {} };
  }
}

/** The player's own choices (2026-11-17): exercise picks from the team list (lota 1), a strength goal (lota 2), and
 *  the coach's per-player setting (let in on another mode / taken out of the goals mode). Read for every player with
 *  a row on this team; WHETHER the choices are used is decided by the send mode in the engine (`sendMode.ts`
 *  takesPart), so the coach's mode for a send applies the same way everywhere. Picks no longer on the list are
 *  dropped. Fail-safe: any error → nothing (the coach's list as before, no goal). Only an ACTIVE goal is passed on: a
 *  retired "Stronger legs" / "More explosive" (goals step 3, 2026-11-18) is left in the row but adds nothing. */
export async function fetchPlayerExercisePicks(
  sb: SupabaseClient,
  playerId: string,
  teamId: string | null,
): Promise<{ picks?: PlayerExercisePicks; goal?: StrengthGoal; on: boolean; off: boolean } | undefined> {
  if (!teamId) return undefined;
  try {
    const { data: row } = await sb
      .from("player_strength_picks")
      .select("picks, strength_goal, test_enabled, choices_off")
      .eq("player_id", playerId)
      .eq("team_id", teamId)
      .maybeSingle();
    const r = row as { picks?: unknown; strength_goal?: unknown; test_enabled?: boolean; choices_off?: boolean } | null;
    if (!r) return undefined;
    const setting = { on: !!r.test_enabled, off: !!r.choices_off };
    const goal = activeGoal(r.strength_goal);
    const hasPicks = !!r.picks && typeof r.picks === "object" && Object.keys(r.picks as object).length > 0;
    if (!hasPicks) return goal ? { goal, ...setting } : setting;
    const { data: team } = await sb.from("team_strength_palette").select("slots").eq("team_id", teamId).maybeSingle();
    const picks = sanitizePicks(r.picks, sanitizePaletteSlots((team as { slots?: unknown } | null)?.slots));
    return { ...(Object.keys(picks).length > 0 ? { picks } : {}), ...(goal ? { goal } : {}), ...setting };
  } catch {
    return undefined;
  }
}

/** Latest movement screen → the primary corrective per phase (the same set the
 *  Correctives tab default-ticks; King reference items excluded), shaped for the
 *  session's front block. Fail-safe: any error → no correctives. */
export async function fetchScreenCorrectives(sb: SupabaseClient, playerId: string): Promise<{ correctives: SessionCorrective[]; emphases: string[] }> {
  try {
    const screens = await loadPlayerMovementScreens(sb, playerId, 1);
    const latest = screens[0];
    if (!latest?.result?.readings?.length) return { correctives: [], emphases: [] };
    const p = prescribeCorrectives(latest.result.readings);
    if (!p) return { correctives: [], emphases: [] };
    const weeks = Math.round(p.reScreenInDays / 7);
    const correctives: SessionCorrective[] = p.phases.flatMap((g) =>
      g.items
        .filter((e) => e.tier !== "secondary" && e.source !== "king")
        .map((e) => ({
          slug: e.slug,
          nameEN: e.name.en, nameIS: e.name.is,
          doseEN: e.dose.en, doseIS: e.dose.is,
          cueEN: e.cue.en, cueIS: e.cue.is,
          sourceNoteEN: `Movement screen (${latest.screenDate}) · re-screen in ~${weeks} wks`,
          sourceNoteIS: `Hreyfiskimun (${latest.screenDate}) · endurskima eftir ~${weeks} vk`,
        })),
    );
    const emphases = [...new Set(p.compensations.map((c) => COMP_EMPHASIS[c.key]).filter(Boolean))];
    return { correctives, emphases };
  } catch {
    return { correctives: [], emphases: [] };
  }
}

/** Strength emphases from the reconciled deficit ledger — moderate+ confidence
 *  only, so a lone weak hypothesis (hint) never auto-modifies the session. */
export async function fetchLedgerEmphases(sb: SupabaseClient, playerId: string): Promise<string[]> {
  try {
    const { rows, overrides } = await collectDeficits(sb, playerId);
    return buildStrengthPlan(reconcile(rows, overrides))
      .filter((t) => t.confidenceTier !== "hint")
      .map((t) => t.emphasis);
  } catch {
    return [];
  }
}

const SPRINT_SPEED_DROP_WINDOW = 28; // days
const COD_WINDOW = 14;               // days
const DECEL_BURDEN_HISTORY = 7;      // days to scan for HIGH streak
const FOSTER_WINDOW = 7;             // days

function startOfDayIso(daysBack: number, todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Compute Sprint Speed Drop % from player_external_load_daily rows. */
export async function fetchSprintSpeedDrop(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<number | null> {
  try {
    const startIso = startOfDayIso(SPRINT_SPEED_DROP_WINDOW - 1, todayIso);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("date, max_velocity, max_vel, high_speed_distance")
      .eq("player_id", playerId)
      .eq("source", "catapult")
      .gte("date", startIso)
      .lte("date", todayIso);
    if (!data || data.length === 0) return null;
    const HSR_FLOOR = 200;
    const sessions: Array<{ date: string; mv: number }> = [];
    for (const r of data as Array<{
      date: string; max_velocity: number | null; max_vel: number | null;
      high_speed_distance: number | null;
    }>) {
      const a = typeof r.max_velocity === "number" && Number.isFinite(r.max_velocity) ? r.max_velocity : null;
      const b = typeof r.max_vel === "number" && Number.isFinite(r.max_vel) ? r.max_vel : null;
      const mv = a != null && b != null ? Math.max(a, b) : (a ?? b);
      const hsr = typeof r.high_speed_distance === "number" ? r.high_speed_distance : null;
      if (mv == null || hsr == null || mv <= 0 || hsr < HSR_FLOOR) continue;
      sessions.push({ date: r.date, mv });
    }
    const todayRow = sessions.find((s) => s.date === todayIso);
    if (!todayRow) return null;
    const ref = sessions.filter((s) => s.date !== todayIso).map((s) => s.mv).sort((a, b) => b - a);
    if (ref.length < 4) return null;
    const top3 = ref.slice(0, 3);
    const refMean = top3.reduce((s, v) => s + v, 0) / top3.length;
    return Number((((refMean - todayRow.mv) / refMean) * 100).toFixed(1));
  } catch {
    return null;
  }
}

/** Compute high-tier CoD L/R asymmetry % over 14d. Returns {pct, weakerSide}. */
export async function fetchCodAsymmetry(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ pct: number | null; weakerSide: "L" | "R" | null }> {
  try {
    const startIso = startOfDayIso(COD_WINDOW - 1, todayIso);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("ima_cod_left_high, ima_cod_right_high")
      .eq("player_id", playerId)
      .eq("source", "catapult")
      .gte("date", startIso)
      .lte("date", todayIso);
    if (!data || data.length === 0) return { pct: null, weakerSide: null };
    let left = 0;
    let right = 0;
    for (const r of data as Array<{ ima_cod_left_high: number | null; ima_cod_right_high: number | null }>) {
      left += Number(r.ima_cod_left_high ?? 0) || 0;
      right += Number(r.ima_cod_right_high ?? 0) || 0;
    }
    const max = Math.max(left, right);
    if (max <= 0) return { pct: null, weakerSide: null };
    const pct = Number(((Math.abs(left - right) / max) * 100).toFixed(1));
    const weakerSide = left < right ? "L" : (right < left ? "R" : null);
    return { pct, weakerSide };
  } catch {
    return { pct: null, weakerSide: null };
  }
}

const VALD_ASYM_WINDOW_DAYS = 120; // VALD tests are infrequent — look back further than IMA.

/** VALD limb asymmetry — the most severe recent test across NordBord (hamstring
 *  L/R), ForceFrame (hip adduction/abduction L/R) and ForceDecks (CMJ jump/landing
 *  L/R). A second symmetry source for uni/bi so a VALD club without IMA still gets
 *  symmetry-driven lower-body work. Uses the stored asymmetry_percent, else (for
 *  NordBord/ForceFrame) computes it from left/right peak force. Fail-safe: any
 *  error / no test → null. */
export async function fetchValdAsymmetry(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ pct: number | null; weakerSide: "L" | "R" | null }> {
  const startIso = startOfDayIso(VALD_ASYM_WINDOW_DAYS - 1, todayIso);
  const asSide = (s: string | null): "L" | "R" | null => (s === "L" || s === "R" ? s : null);
  type PS = { pct: number; side: "L" | "R" | null };
  const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const majoritySide = (arr: PS[]): "L" | "R" | null => {
    let l = 0, r = 0;
    for (const a of arr) { if (a.side === "L") l++; else if (a.side === "R") r++; }
    return l > r ? "L" : r > l ? "R" : null;
  };
  try {
    // NordBord + ForceFrame: isometric peak force is STABLE → the most recent valid
    // test represents the player's current state.
    const readLR = async (tbl: string): Promise<PS[]> => {
      const { data } = await sb
        .from(tbl)
        .select("asymmetry_percent, asymmetry_side, left_peak_force_n, right_peak_force_n, is_valid")
        .eq("microplayer_id", playerId)
        .gte("test_timestamp", startIso)
        .order("test_timestamp", { ascending: false })
        .limit(20);
      const out: PS[] = [];
      for (const r of (data ?? []) as Array<{ asymmetry_percent: number | null; asymmetry_side: string | null; left_peak_force_n: number | null; right_peak_force_n: number | null; is_valid: boolean | null }>) {
        if (r.is_valid === false) continue;
        if (r.asymmetry_percent != null && Number.isFinite(Number(r.asymmetry_percent))) {
          out.push({ pct: Math.abs(Number(r.asymmetry_percent)), side: asSide(r.asymmetry_side) });
          continue;
        }
        const l = Number(r.left_peak_force_n ?? 0) || 0;
        const rr = Number(r.right_peak_force_n ?? 0) || 0;
        const mx = Math.max(l, rr);
        if (mx > 0) out.push({ pct: Number(((Math.abs(l - rr) / mx) * 100).toFixed(1)), side: l < rr ? "L" : rr < l ? "R" : null });
      }
      return out;
    };
    const nord = await readLR("vald_nordbord_results");
    const frame = await readLR("vald_forceframe_results");

    // ForceDecks (CMJ): trial-to-trial NOISY (Gathercole/Bishop CV) → use the MEDIAN
    // asymmetry over the window + the majority weaker side, not a single spike.
    const { data: fdData } = await sb
      .from("vald_forcedecks_results")
      .select("asymmetry_percent, asymmetry_side, is_valid")
      .eq("microplayer_id", playerId)
      .gte("test_timestamp", startIso)
      .order("test_timestamp", { ascending: false })
      .limit(20);
    const fd: PS[] = [];
    for (const r of (fdData ?? []) as Array<{ asymmetry_percent: number | null; asymmetry_side: string | null; is_valid: boolean | null }>) {
      if (r.is_valid === false) continue;
      if (r.asymmetry_percent != null && Number.isFinite(Number(r.asymmetry_percent))) {
        fd.push({ pct: Math.abs(Number(r.asymmetry_percent)), side: asSide(r.asymmetry_side) });
      }
    }

    // One robust estimate per source, then the most severe across sources.
    const candidates: PS[] = [];
    if (nord[0]) candidates.push(nord[0]);
    if (frame[0]) candidates.push(frame[0]);
    const fdMedian = median(fd.map((x) => x.pct));
    if (fdMedian != null) candidates.push({ pct: Number(fdMedian.toFixed(1)), side: majoritySide(fd) });

    if (!candidates.length) return { pct: null, weakerSide: null };
    const best = candidates.reduce((a, b) => (b.pct > a.pct ? b : a));
    return { pct: best.pct, weakerSide: best.side };
  } catch {
    return { pct: null, weakerSide: null };
  }
}

/** Read latest decel burden band + count of consecutive HIGH days in last 7d. */
export async function fetchDecelBurden(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ band: PlayerStrengthSnapshot["decelBurdenBand"]; highStreak: number }> {
  try {
    const startIso = startOfDayIso(DECEL_BURDEN_HISTORY - 1, todayIso);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("date, decel_burden_band")
      .eq("player_id", playerId)
      .gte("date", startIso)
      .lte("date", todayIso)
      .order("date", { ascending: false });
    if (!data || data.length === 0) return { band: null, highStreak: 0 };
    const rows = data as Array<{ date: string; decel_burden_band: string | null }>;
    const latest = rows[0]?.decel_burden_band;
    let band: PlayerStrengthSnapshot["decelBurdenBand"] = null;
    if (latest === "low" || latest === "moderate" || latest === "elevated" || latest === "high") {
      band = latest;
    }
    // Count consecutive HIGH days from most recent backward
    let streak = 0;
    for (const r of rows) {
      if (r.decel_burden_band === "high") streak++;
      else break;
    }
    return { band, highStreak: streak };
  } catch {
    return { band: null, highStreak: 0 };
  }
}

/** Read latest readiness entry — wellness sub-scores + sore-areas array.
 *  Now also parses the free-text `notes` column with the bilingual
 *  keyword matcher (noteParser.ts) and merges any detected
 *  contraindications into the sore_areas array so the existing
 *  adaptation rules pick them up automatically — no AI required. */
export async function fetchWellness(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<PlayerStrengthSnapshot["wellness"]> {
  const empty: PlayerStrengthSnapshot["wellness"] = {
    sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [],
  };
  try {
    const startIso = startOfDayIso(2, todayIso); // today + 2 prior days fallback
    const { data } = await sb
      .from("readiness_entries")
      .select("entry_date, sleep_quality, muscle_soreness, fatigue_energy, stress_mood, sore_areas, notes")
      .eq("player_id", playerId)
      .gte("entry_date", startIso)
      .lte("entry_date", todayIso)
      .order("entry_date", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return empty;
    const r = data[0] as {
      sleep_quality: number | null; muscle_soreness: number | null;
      fatigue_energy: number | null; stress_mood: number | null;
      sore_areas: string[] | null;
      notes: string | null;
    };
    const checkboxAreas = Array.isArray(r.sore_areas) ? r.sore_areas : [];
    const parsedFromNote = parseWellnessNote(r.notes);
    const mergedSoreAreas = mergeNoteIntoSoreAreas(checkboxAreas, parsedFromNote);
    return {
      sleepQuality: r.sleep_quality,
      muscleSoreness: r.muscle_soreness,
      fatigueEnergy: r.fatigue_energy,
      stressMood: r.stress_mood,
      soreAreas: mergedSoreAreas,
    };
  } catch {
    return empty;
  }
}

/**
 * Today's readiness for the strength engine = the player's canonical colour for THIS date
 * (`v_coach_readiness_today_v8.final_color`, CLAUDE.md "Canonical verdict source"), read only, never set.
 * green → FULL, yellow → MODIFIED, red → RECOVERY; no check-in today (or an imputed one) → null, which the
 * engine builds as a normal day.
 *
 * Fix 2026-11-18: this used to read `athlete_decision_history.verdict_action`, a column that never existed, so
 * the query always failed and every strength session (coach-sent and automatic) was built as if no check-in
 * had been made: the yellow / red rules never fired. It also took the latest row of ANY age; now only today counts.
 */
export async function fetchVerdict(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<PlayerStrengthSnapshot["verdict"]> {
  try {
    const { data, error } = await sb
      .from("v_coach_readiness_today_v8")
      .select("final_color, is_imputed")
      .eq("player_id", playerId)
      .eq("entry_date", todayIso)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { final_color?: string | null; is_imputed?: boolean | null };
    if (row.is_imputed) return null;
    return verdictFromColour(row.final_color);
  } catch {
    return null;
  }
}

/** The canonical colour as the strength engine's verdict. Unknown → null (a normal day). */
export function verdictFromColour(colour: string | null | undefined): PlayerStrengthSnapshot["verdict"] {
  const c = String(colour ?? "").trim().toLowerCase();
  if (c === "green" || c === "green_plus") return "FULL";
  if (c === "yellow") return "MODIFIED";
  if (c === "red") return "RECOVERY";
  return null;
}

/** Active injury status. */
export async function fetchInjury(
  sb: SupabaseClient,
  playerId: string,
): Promise<PlayerStrengthSnapshot["injuryStatus"]> {
  try {
    const { data } = await sb
      .from("player_injuries")
      .select("status")
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (!data || data.length === 0) return null;
    const s = String((data[0] as { status: string }).status ?? "").toLowerCase();
    if (s === "injured" || s === "rehabilitation" || s === "rtp_training" || s === "cleared") return s;
    return null;
  } catch {
    return null;
  }
}

/** Latest VBT velocity decrement from GymAware. */
export async function fetchVbtDecrement(
  _sb: SupabaseClient,
  _playerId: string,
  _todayIso: string,
): Promise<number | null> {
  // VBT readiness has a more involved lookup (reference exercise + load
  // matching). Stage 1 leaves this null until we wire the existing
  // vbtReadiness module into the loader properly. Engine handles null
  // gracefully — VBT rule simply doesn't fire.
  return null;
}

/** Foster Monotony + Strain from session_rpe_entries last 7 days. */
export async function fetchFoster(
  sb: SupabaseClient,
  playerId: string,
  todayIso: string,
): Promise<{ monotony: number | null; strain: number | null }> {
  try {
    const startIso = startOfDayIso(FOSTER_WINDOW - 1, todayIso);
    const { data } = await sb
      .from("session_rpe_entries")
      .select("session_load")
      .eq("player_id", playerId)
      .gte("session_date", startIso)
      .lte("session_date", todayIso)
      .gt("session_load", 0);
    if (!data || data.length < 3) return { monotony: null, strain: null };
    const loads = (data as Array<{ session_load: number }>).map((r) => r.session_load);
    const mean = loads.reduce((s, v) => s + v, 0) / loads.length;
    const variance = loads.reduce((s, v) => s + (v - mean) ** 2, 0) / loads.length;
    const sd = Math.sqrt(variance);
    if (sd <= 0) return { monotony: null, strain: null };
    const monotony = mean / sd;
    const weeklyLoad = loads.reduce((s, v) => s + v, 0);
    const strain = weeklyLoad * monotony;
    return { monotony, strain };
  } catch {
    return { monotony: null, strain: null };
  }
}

/** Is this a congested week? Two matches in 7 days with today in them: upcoming team fixtures always count, a past
 *  match only if the player played ≥ 60 min (strengthProgramming/congestion.ts, coach's call 2026-11-23). */
export async function fetchCongestion(
  sb: SupabaseClient,
  playerId: string,
  teamId: string | null,
  todayIso: string,
): Promise<boolean> {
  try {
    const span = CONGESTION_SPAN_DAYS - 1;
    const endDate = new Date(`${todayIso}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + span);
    const endIso = endDate.toISOString().slice(0, 10);
    const [fixtures, played] = await Promise.all([
      teamId
        ? sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", todayIso).lte("match_date", endIso)
        : Promise.resolve({ data: [] as { match_date: string }[] }),
      sb.from("match_player_minutes").select("match_date, minutes_played").eq("player_id", playerId)
        .gte("match_date", startOfDayIso(span, todayIso)).lt("match_date", todayIso)
        .gte("minutes_played", CONGESTION_PAST_MIN_MINUTES),
    ]);
    const dates = (rows: unknown) => ((rows as { match_date: string | null }[] | null) ?? []).map((r) => r.match_date).filter((d): d is string => !!d);
    return isCongestedWeek(dates(fixtures.data), dates(played.data), todayIso);
  } catch {
    return false;
  }
}

/** MD context from week_plans (or coach-supplied override). */
export async function fetchMdContext(
  sb: SupabaseClient,
  teamId: string | null,
  todayIso: string,
  override: MdContext | null,
): Promise<MdContext> {
  return (await fetchMdContextInfo(sb, teamId, todayIso, override)).mdContext;
}

/** Same MD context, plus whether it came from "no match from 4 days back to 5 days ahead" (the MD-3 default).
 *  A coach-chosen MD day, no team, or a read error is never "no match nearby" (2026-11-17: in pre-/off-season the
 *  player's strength goal counts every strength session as a goal day when no match is near). */
export async function fetchMdContextInfo(
  sb: SupabaseClient,
  teamId: string | null,
  todayIso: string,
  override: MdContext | null,
): Promise<{ mdContext: MdContext; noMatchNearby: boolean }> {
  if (override) return { mdContext: override, noMatchNearby: false };
  const md = (mdContext: MdContext) => ({ mdContext, noMatchNearby: false });
  if (!teamId) return md("MD-3"); // safest default
  try {
    const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const isoAt = (offsetDays: number) => new Date(todayMs + offsetDays * DAY).toISOString().slice(0, 10);

    // Detect games from BOTH the fixture list (match_schedule) and the training week
    // (week_plans, day_type=GAME), and look BACK as well as forward. Two reasons:
    //  1) match_schedule is populated even when the coach forgot to set this week's
    //     training days, so MD context no longer silently collapses to MD-3.
    //  2) looking back means the day(s) after a game resolve to MD+1..MD+3 (recovery),
    //     which the old forward-only query could never produce.
    // NOTE: week_plans column is `day_date` (an earlier draft used the wrong name,
    // which silently broke detection → everything fell back to MD-3).
    const [fixtures, plans] = await Promise.all([
      sb.from("match_schedule").select("match_date").eq("team_id", teamId)
        .gte("match_date", isoAt(-4)).lte("match_date", isoAt(5)),
      sb.from("week_plans").select("day_date, day_type").eq("team_id", teamId)
        .gte("day_date", isoAt(-4)).lte("day_date", isoAt(5)),
    ]);

    const gameDates = new Set<string>();
    for (const r of (fixtures.data ?? []) as Array<{ match_date: string | null }>) {
      if (r.match_date) gameDates.add(r.match_date);
    }
    for (const r of (plans.data ?? []) as Array<{ day_date: string; day_type: string | null }>) {
      if (String(r.day_type ?? "").toUpperCase() === "GAME") gameDates.add(r.day_date);
    }
    if (gameDates.size === 0) return { mdContext: "MD-3", noMatchNearby: true }; // nothing scheduled either side → safe default

    const offsets = [...gameDates].map((d) =>
      Math.round((new Date(`${d}T00:00:00Z`).getTime() - todayMs) / DAY),
    );
    if (offsets.includes(0)) return md("OFF"); // matchday — no strength

    const nextIn = offsets.filter((o) => o > 0).sort((a, b) => a - b)[0] ?? null;          // days to next game
    const lastAgo = offsets.filter((o) => o < 0).map((o) => -o).sort((a, b) => a - b)[0] ?? null; // days since last game

    // Priority: the day AFTER a game is always recovery (MD+1); then the countdown to
    // the next game (MD-4..MD-1); then the extended recovery days (MD+2 / MD+3 / MD+4).
    // The far-out build day (MD-5) and far-out recovery day (MD+4) sit at the MARGINS of
    // the chain, AFTER the existing branches — so no normal-cadence day changes label
    // (e.g. day-2 of a 7-day week stays MD+2, not MD-5). MD-5 therefore only fires when
    // there is a game in 5 days and no recent match in the last 4 (a build day after a
    // long gap); MD+4 only when a match was 4 days ago and nothing is imminent.
    if (lastAgo === 1) return md("MD+1");
    if (nextIn !== null && nextIn >= 1 && nextIn <= 4) return md(`MD-${nextIn}` as MdContext);
    if (lastAgo === 2) return md("MD+2");
    if (lastAgo === 3) return md("MD+3");
    if (lastAgo === 4) return md("MD+4");
    if (nextIn === 5) return md("MD-5");
    return md("MD-3");
  } catch {
    return md("MD-3");
  }
}

/** Minutes the player logged in the most recent match BEFORE today (the reference
 *  match for an MD+1 recovery read). Returns the raw minutes + DNP flag; null
 *  minutes when there is no recent match or the player has no row for it (the
 *  strength engine then keeps the fixed MD+1 recovery template). team-scoped. */
export async function fetchLastMatchMinutes(
  sb: SupabaseClient,
  teamId: string | null,
  playerId: string,
  todayIso: string,
): Promise<{ minutes: number | null; isDnp: boolean }> {
  if (!teamId) return { minutes: null, isDnp: false };
  try {
    // Most recent scheduled match strictly before today (MD+1 ⇒ match was earlier).
    const { data: matchRows } = await sb
      .from("match_schedule")
      .select("match_date")
      .eq("team_id", teamId)
      .lt("match_date", todayIso)
      .order("match_date", { ascending: false })
      .limit(1);
    const matchDate = (matchRows ?? [])[0]?.match_date as string | undefined;
    if (!matchDate) return { minutes: null, isDnp: false };
    const { data } = await sb
      .from("match_player_minutes")
      .select("minutes_played, is_dnp")
      .eq("team_id", teamId)
      .eq("match_date", matchDate)
      .eq("player_id", playerId)
      .maybeSingle();
    if (!data) return { minutes: null, isDnp: false };
    const row = data as { minutes_played: number | null; is_dnp: boolean | null };
    return { minutes: row.minutes_played ?? null, isDnp: !!row.is_dnp };
  } catch {
    return { minutes: null, isDnp: false };
  }
}
