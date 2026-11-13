/**
 * Goal plan requests (lota 2): the player asks, the coach approves / changes the start / declines / stops.
 *
 * Pure and client-safe: row types, status words, and the checks on a coach's decision. The database work lives in
 * `store.ts` (server-only). Rules decide; a coach's change of start is always logged with a reason.
 */

import type { Bi, GoalBlockReason, GoalPlan, GoalQuality } from "./types";
import { GOAL_QUALITIES } from "./types";
import { PLAN_WEEKS } from "./common";

export type GoalPlanStatus = "requested" | "approved" | "declined" | "cancelled" | "paused" | "completed";

/** Statuses that count as "the player has a goal open" (one at a time). */
export const OPEN_STATUSES: GoalPlanStatus[] = ["requested", "approved", "paused"];

export type GoalPlanRow = {
  id: string;
  team_id: string;
  player_id: string;
  quality: GoalQuality;
  status: GoalPlanStatus;
  player_note: string | null;
  proposal: GoalPlan | null;
  plan: GoalPlan | null;
  engine_version: string | null;
  content_version: string | null;
  start_override: string | null;
  start_date: string | null;
  end_date: string | null;
  coach_note: string | null;
  decision_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  closed_at: string | null;
  /** Set while paused (lota 3): when, and which plan week the player was in. */
  paused_at?: string | null;
  paused_week?: number | null;
};

export type GoalPlanEventRow = {
  id: string;
  kind: "requested" | "cancelled" | "approved" | "declined" | "start_changed" | "stopped" | "paused" | "resumed" | "completed";
  actor_role: "player" | "coach" | "system";
  reason: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export const STATUS_LABEL: Record<GoalPlanStatus, Bi> = {
  requested: { en: "Waiting for the coach", is: "Bíður þjálfara" },
  approved: { en: "Approved", is: "Samþykkt" },
  declined: { en: "Declined", is: "Hafnað" },
  cancelled: { en: "Cancelled", is: "Hætt við" },
  paused: { en: "Paused", is: "Í bið" },
  completed: { en: "Finished", is: "Lokið" },
};

export const EVENT_LABEL: Record<GoalPlanEventRow["kind"], Bi> = {
  requested: { en: "Player asked", is: "Leikmaður bað um" },
  cancelled: { en: "Request withdrawn", is: "Beiðni dregin til baka" },
  approved: { en: "Approved", is: "Samþykkt" },
  declined: { en: "Declined", is: "Hafnað" },
  start_changed: { en: "Coach changed the start", is: "Þjálfari breytti upphafi" },
  stopped: { en: "Coach stopped the plan", is: "Þjálfari stöðvaði áætlunina" },
  paused: { en: "Paused", is: "Sett í bið" },
  resumed: { en: "Resumed", is: "Haldið áfram" },
  completed: { en: "Finished", is: "Lokið" },
};

/** What the player is told when a quality cannot be asked for now (plain, second person, no jargon). */
export const PLAYER_BLOCK_TEXT: Record<GoalBlockReason, Bi> = {
  injured_or_rtt: { en: "Not while you are injured or coming back. Ask again when you are back in full training.", is: "Ekki á meðan meiðsli eða endurkoma standa yfir. Biddu aftur þegar full þjálfun er hafin á ný." },
  goalkeeper: { en: "Top speed plans are not offered for goalkeepers.", is: "Hámarkshraðaáætlanir eru ekki í boði fyrir markmenn." },
  not_for_sport: { en: "Not offered in your sport.", is: "Ekki í boði í þinni íþrótt." },
  sport_not_supported: { en: "Not offered for your team yet.", is: "Ekki í boði fyrir liðið þitt enn." },
  player_inactive: { en: "Your profile is not active.", is: "Prófíllinn þinn er ekki virkur." },
};

export const PLAYER_NOTE_MAX = 280;
export const COACH_TEXT_MAX = 500;
/** A change of start, a decline and a stop each need a reason of at least this many characters. */
export const REASON_MIN = 5;
/** How far ahead the coach may set the start (MicroPulse rule). */
export const START_MAX_DAYS_AHEAD = 28;

export function isGoalQuality(v: unknown): v is GoalQuality {
  return typeof v === "string" && (GOAL_QUALITIES as string[]).includes(v);
}

const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

/** The Monday on or after `todayIso`. */
export function nextMonday(todayIso: string): string {
  const d = toDate(todayIso);
  const add = (8 - d.getUTCDay()) % 7; // Mon = 1 → 0 days; Sun = 0 → 1 day
  return toIso(new Date(d.getTime() + add * DAY_MS));
}

export function isMonday(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && toDate(iso).getUTCDay() === 1 && toIso(toDate(iso)) === iso;
}

/** Last day of an 8-week plan that starts on `startIso`. */
export function planEndDate(startIso: string): string {
  return toIso(new Date(toDate(startIso).getTime() + (PLAN_WEEKS * 7 - 1) * DAY_MS));
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};

export function cleanPlayerNote(v: unknown): string | null {
  return clean(v, PLAYER_NOTE_MAX);
}

export type GoalDecision =
  | { action: "approve"; startDate: string; start: string | null; reason: string | null; noteToPlayer: string | null }
  | { action: "decline"; reason: string; noteToPlayer: string | null }
  | { action: "stop"; reason: string }
  | { action: "resume"; startDate: string; fromWeek: number; reason: string | null; noteToPlayer: string | null };

/** After a pause longer than this the plan restarts from week 1 by default (MicroPulse rule; same 21 days as the
 *  top-speed long gap). */
export const RESUME_FROM_START_AFTER_DAYS = 21;

/**
 * The week a paused plan picks up at by default: the week it paused in, or week 1 after a long break. The coach may
 * go back further; going further than this needs a reason, and never past the paused week.
 */
export function resumeDefaultWeek(pausedWeek: number | null | undefined, pausedAt: string | null | undefined, todayIso: string): number {
  const w = Math.max(1, Math.min(PLAN_WEEKS, pausedWeek ?? 1));
  if (!pausedAt) return w;
  const days = Math.round((toDate(todayIso).getTime() - toDate(pausedAt.slice(0, 10)).getTime()) / DAY_MS);
  return days > RESUME_FROM_START_AFTER_DAYS ? 1 : w;
}

/** The plan's (virtual) first Monday when it picks up at `fromWeek` on `resumeMonday`. */
export function resumedStartDate(resumeMonday: string, fromWeek: number): string {
  return toIso(new Date(toDate(resumeMonday).getTime() - (fromWeek - 1) * 7 * DAY_MS));
}

/**
 * Checks a coach's decision body. `ruleStart` is the engine's start for this player; choosing another start needs a
 * reason. Whether the chosen start is allowed for this player (safety rules) is checked by the caller against
 * `allowedStarts`.
 */
export function parseDecision(body: unknown, todayIso: string, ruleStart: string | null): { ok: true; value: GoalDecision } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = clean(b.reason, COACH_TEXT_MAX);
  const noteToPlayer = clean(b.noteToPlayer, COACH_TEXT_MAX);
  const hasReason = !!reason && reason.length >= REASON_MIN;
  if (b.action === "decline") {
    if (!hasReason) return { ok: false, error: `A reason is needed to decline (at least ${REASON_MIN} characters).` };
    return { ok: true, value: { action: "decline", reason: reason!, noteToPlayer } };
  }
  if (b.action === "stop") {
    if (!hasReason) return { ok: false, error: `A reason is needed to stop a plan (at least ${REASON_MIN} characters).` };
    return { ok: true, value: { action: "stop", reason: reason! } };
  }
  if (b.action !== "approve" && b.action !== "resume") return { ok: false, error: "Unknown action." };
  const startDate = typeof b.startDate === "string" ? b.startDate : "";
  if (!isMonday(startDate)) return { ok: false, error: "The plan starts on a Monday." };
  const ahead = Math.round((toDate(startDate).getTime() - toDate(todayIso).getTime()) / DAY_MS);
  // A restart may pick up this week's Monday (up to 6 days back); a new plan starts today or later.
  if (ahead < (b.action === "resume" ? -6 : 0)) return { ok: false, error: "The start date is in the past." };
  if (ahead > START_MAX_DAYS_AHEAD) return { ok: false, error: `The start must be within ${START_MAX_DAYS_AHEAD} days.` };
  if (b.action === "resume") {
    const fromWeek = typeof b.fromWeek === "number" && Number.isInteger(b.fromWeek) ? b.fromWeek : NaN;
    if (!(fromWeek >= 1 && fromWeek <= PLAN_WEEKS)) return { ok: false, error: `Pick a week from 1 to ${PLAN_WEEKS}.` };
    return { ok: true, value: { action: "resume", startDate, fromWeek, reason: hasReason ? reason : null, noteToPlayer } };
  }
  const start = typeof b.start === "string" && b.start ? b.start : null;
  const changed = !!start && !!ruleStart && start !== ruleStart;
  if (changed && !hasReason) return { ok: false, error: `Changing the start needs a reason (at least ${REASON_MIN} characters).` };
  return { ok: true, value: { action: "approve", startDate, start: changed ? start : null, reason: changed ? reason : null, noteToPlayer } };
}

/** Which statuses each decision may act on. */
export const DECISION_FROM: Record<GoalDecision["action"], GoalPlanStatus[]> = {
  approve: ["requested"],
  decline: ["requested"],
  stop: ["approved", "paused"],
  resume: ["paused"],
};
