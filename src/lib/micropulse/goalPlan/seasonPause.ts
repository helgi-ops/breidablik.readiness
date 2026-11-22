/**
 * Goal plans pause in season (2026-11-22, rule GOAL_PLAN_PAUSED_IN_SEASON). Pure and client-safe.
 *
 * The season comes from the coach's season plan (its block phase, else the week's phase — `goalSeasonOf`):
 *   - "build" (pre-season, off-season): goal work as before (the gym lifts merge into the team strength session).
 *   - "maintain" (competitive season): no goal work. A running plan is paused with `paused_reason = 'in_season'` and
 *     resumes on its own at the next pre-season. A new plan starts on the Monday of the next pre-season.
 *   - "unknown" (no season plan, no week phase): today's behaviour, unchanged; the coach is asked to set the season.
 *
 * Injury comes first: a player marked injured / in rehab / return-to-train is paused for that reason, and a plan
 * waiting for pre-season that finds the player injured switches to the injury pause (only the coach restarts it).
 * The coach decides last: a coach who resumes in season sets `season_override_at` (logged with a reason) and the
 * automatic pause leaves that plan alone. Never reads or writes the readiness colour.
 */

import type { Bi } from "./types";
import { PLAN_WEEKS } from "./common";
import { resumeDefaultWeek, resumedStartDate, type GoalPlanStatus } from "./requests";

export const GOAL_PLAN_PAUSED_IN_SEASON = "GOAL_PLAN_PAUSED_IN_SEASON";

export type GoalSeason3 = "build" | "maintain" | "unknown";
export type GoalSeasonPhase = "preseason" | "competitive" | "offseason";
export type PausedReason = "injury" | "in_season";

export type GoalSeasonRead = {
  season: GoalSeason3;
  /** The phase the season came from (block phase, else the week's phase); null when not known. */
  phase: GoalSeasonPhase | null;
  /** The next pre-season's first day after today, from the season plan(s); null when no saved plan has one. */
  nextPreseason: string | null;
  /** Where the read came from, for provenance ("season_plan_block" | "week_phase" | "none"). */
  source: "season_plan_block" | "week_phase" | "none";
};

export const UNKNOWN_SEASON: GoalSeasonRead = { season: "unknown", phase: null, nextPreseason: null, source: "none" };

/** The card and the placement only know build / maintain: unknown keeps today's behaviour (counts as maintain). */
export const cardSeasonOf = (r: Pick<GoalSeasonRead, "season"> | null | undefined): "build" | "maintain" =>
  r?.season === "build" ? "build" : "maintain";

/** Week phase words (Week setup / season plan) → the phase. */
export function phaseOfWord(v: unknown): GoalSeasonPhase | null {
  const w = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (w === "preseason") return "preseason";
  if (w === "offseason") return "offseason";
  if (w === "inseason" || w === "competitive" || w === "playoffs") return "competitive";
  return null;
}

/** The earliest pre-season that starts after today. */
export function nextPreseasonStart(phases: { key: string; start: string }[], todayIso: string): string | null {
  const next = phases.filter((p) => p.key === "preseason" && p.start > todayIso).map((p) => p.start).sort();
  return next[0] ?? null;
}

// Own date helpers (today.ts imports this module's texts; no cycle).
const DAY_MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const addDaysIso = (iso: string, n: number) => new Date(toMs(iso) + n * DAY_MS).toISOString().slice(0, 10);
/** The Monday of the week holding a date. */
export const mondayOf = (iso: string) => addDaysIso(iso, -((new Date(toMs(iso)).getUTCDay() + 6) % 7));
/** Plan week on a date, as `planWeekOn` (0 = not started, 1…8, 9 = after). */
const planWeekOn = (startIso: string, iso: string) => {
  const d = Math.round((toMs(iso) - toMs(startIso)) / DAY_MS);
  return d < 0 ? 0 : Math.min(PLAN_WEEKS + 1, Math.floor(d / 7) + 1);
};
export const IN_SEASON_PAUSE_TEXT: Bi = {
  en: "Goal plans pause in-season (maintenance period). Your plan resumes next pre-season.",
  is: "Markmiðsplön eru í bið á keppnistímabili (viðhaldstímabil). Planið heldur áfram næsta undirbúningstímabil.",
};

/** The reason stored on the event (English; the audit trail). */
export const IN_SEASON_PAUSE_REASON = "Competitive season started (maintenance period). Resumes at the next pre-season.";

// ─── The start of a new plan ───────────────────────────────────────────────

export type StartGate =
  | { kind: "as_chosen"; start: string }
  /** In season with a known next pre-season: the plan starts on the Monday of the week it opens in (or later if the
   *  coach chose later). */
  | { kind: "moved_to_preseason"; start: string; chosen: string; preseason: string }
  /** In season and no saved plan says when the next pre-season starts: approved, then paused until it does. */
  | { kind: "pause_until_preseason"; start: string };

export function startGate(read: GoalSeasonRead | null, chosenStart: string): StartGate {
  if (read?.season !== "maintain") return { kind: "as_chosen", start: chosenStart };
  if (!read.nextPreseason) return { kind: "pause_until_preseason", start: chosenStart };
  // The Monday of the week the pre-season opens in (a week a phase starts in counts as that phase — weekPhase.ts).
  const pre = mondayOf(read.nextPreseason);
  if (chosenStart >= pre) return { kind: "as_chosen", start: chosenStart };
  return { kind: "moved_to_preseason", start: pre, chosen: chosenStart, preseason: read.nextPreseason };
}

// ─── The automatic changes on read ─────────────────────────────────────────

export type SyncInputRow = {
  status: GoalPlanStatus;
  start_date: string | null;
  end_date: string | null;
  paused_at?: string | null;
  paused_week?: number | null;
  paused_reason?: string | null;
  season_override_at?: string | null;
};

export type SyncAction =
  | { kind: "none" }
  | { kind: "complete" }
  | { kind: "pause"; reason: PausedReason; week: number }
  /** A plan waiting for pre-season whose player is now injured: the pause reason becomes injury. */
  | { kind: "to_injury" }
  | { kind: "resume"; start: string; fromWeek: number; resumeMonday: string };

const weekOn = (start: string, today: string) => Math.max(0, Math.min(PLAN_WEEKS, planWeekOn(start, today)));

/**
 * What the read-time sync does to one plan. Order: the 8 weeks over → completed; injury → paused (injury); in season
 * and started → paused (in_season) unless the coach overrode; a plan paused for the season → resumes at pre-season
 * (or switches to the injury pause when the player is injured then). `season` null = not read (no season change).
 */
export function goalSyncAction(row: SyncInputRow, ctx: { unavailable: boolean; season: GoalSeasonRead | null }, today: string): SyncAction {
  if (row.status === "approved" && row.start_date) {
    if (row.end_date && today > row.end_date) return { kind: "complete" };
    if (ctx.unavailable) return { kind: "pause", reason: "injury", week: weekOn(row.start_date, today) };
    if (ctx.season?.season === "maintain" && !row.season_override_at && row.start_date <= today) {
      return { kind: "pause", reason: "in_season", week: weekOn(row.start_date, today) };
    }
    return { kind: "none" };
  }
  if (row.status === "paused" && row.paused_reason === "in_season" && ctx.season?.phase === "preseason" && ctx.season.season === "build") {
    if (ctx.unavailable) return { kind: "to_injury" };
    const fromWeek = resumeDefaultWeek(row.paused_week, row.paused_at, today);
    const resumeMonday = mondayOf(today);
    return { kind: "resume", start: resumedStartDate(resumeMonday, fromWeek), fromWeek, resumeMonday };
  }
  return { kind: "none" };
}

/** Rows the sync must look at: approved, and paused for the season (they may resume). */
export const needsSync = (r: Pick<SyncInputRow, "status" | "paused_reason">) =>
  r.status === "approved" || (r.status === "paused" && r.paused_reason === "in_season");

/** The paused reason as the app reads it (old rows have none = injury). */
export const pausedReasonOf = (r: Pick<SyncInputRow, "status" | "paused_reason">): PausedReason | null =>
  r.status !== "paused" ? null : r.paused_reason === "in_season" ? "in_season" : "injury";
