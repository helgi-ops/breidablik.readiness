"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useMatchScheduleRealtime } from "@/lib/useMatchScheduleRealtime";
import { useLang } from "@/lib/lang";
import Link from "next/link";
import PagePurpose from "@/components/coach/PagePurpose";
import TeamBreaksManager from "@/components/coach/TeamBreaksManager";
import ReadinessOutlookPanel from "@/components/coach/ReadinessOutlookPanel";
import OffWeekProgramButton from "@/components/coach/OffWeekProgramButton";
import PreseasonStartWeekCard, { type PreseasonComputed } from "@/components/coach/PreseasonStartWeekCard";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { dayIdea, LOAD_BAND_META, rpeRange } from "@/lib/micropulse/dayIdeas";
import { parseMdOffset, mdOffsetForDate } from "@/lib/micropulse/readinessOutlook/assemble";
import type { PlannedDay } from "@/lib/micropulse/readinessOutlook";
import { usePlan } from "@/lib/micropulse/product";
import UpgradeWall from "@/components/micropulse/UpgradeWall";
import { type WeekType } from "@/lib/micropulse/weekSetup/weekType";
import { type StimulusType } from "@/lib/drill-stimulus";
import { TEST_SHORT, type TestKey } from "@/lib/micropulse/periodization/testingSchedule";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import { expectedWeekShape } from "@/lib/micropulse/weekSetup/gameDensity";
import type { SportId } from "@/lib/micropulse/sportProfiles";

// shadcn/ui
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type SeasonPhase = "preseason" | "inseason" | "playoffs" | "offseason";

const SEASON_PHASES: {
  id: SeasonPhase;
  label: string;
  sublabel: string;
  sublabelEN: string;
  icon: string;
  activeClass: string;
  baseClass: string;
}[] = [
  { id: "preseason",  label: "Preseason",            sublabel: "Undirbúningur",    sublabelEN: "Preparation",  icon: "🌱", activeClass: "border-amber-500 bg-amber-100 ring-1 ring-amber-400",   baseClass: "border-amber-200 bg-amber-50" },
  { id: "inseason",   label: "In-season",             sublabel: "Keppnistímabil",   sublabelEN: "Competition",  icon: "⚡", activeClass: "border-emerald-500 bg-emerald-100 ring-1 ring-emerald-400", baseClass: "border-emerald-200 bg-emerald-50" },
  { id: "playoffs",   label: "Playoffs",              sublabel: "Úrslitakeppni",    sublabelEN: "Playoffs",     icon: "🔥", activeClass: "border-red-500 bg-red-100 ring-1 ring-red-400",         baseClass: "border-red-200 bg-red-50" },
  { id: "offseason",  label: "Off-season",            sublabel: "Frítímabil",       sublabelEN: "Off-season",   icon: "🌙", activeClass: "border-slate-500 bg-slate-100 ring-1 ring-slate-400",   baseClass: "border-slate-200 bg-slate-50" },
];

type MatchInput = {
  match_id: string;
  date: string; // YYYY-MM-DD
  kickoff_time?: string;
  home_away?: "H" | "A";
};

type DayType = "TRAIN" | "RECOVERY" | "GAME" | "OFF";

// Manual intents for NO_MATCH week (coach editable)
type NoMatchIntent =
  | "FORCE_LIGHT"
  | "FORCE"
  | "NEURAL_VELOCITY"
  | "VELOCITY"
  | "POLISH_CALM"
  | "ACTIVATION"
  | "RECOVERY"        // legacy combined MD+1 & MD+2 (kept for saved weeks; split below in the picker)
  | "RECOVERY_MD1"
  | "RECOVERY_MD2"
  | "RECOVERY_PLUS"
  | "GAME"
  | "OFF";

const NO_MATCH_OPTIONS: { value: NoMatchIntent; label: string }[] = [
  { value: "FORCE_LIGHT", label: "Force (light) / MD-5" },
  { value: "FORCE", label: "Force / MD-4" },
  { value: "NEURAL_VELOCITY", label: "Neural / Velocity / MD-3" },
  { value: "VELOCITY", label: "Velocity / MD-2" },
  { value: "POLISH_CALM", label: "Polish / Calm / MD-2" },
  { value: "ACTIVATION", label: "Activation / MD-1" },
  { value: "RECOVERY", label: "Recovery" },
  { value: "RECOVERY_MD1", label: "Recovery / MD+1" },
  { value: "RECOVERY_MD2", label: "Recovery / MD+2" },
  { value: "RECOVERY_PLUS", label: "Recovery / MD+3" },
  { value: "GAME", label: "Game / MD" },
  { value: "OFF", label: "Off" },
];

const DEFAULT_MATCHES: MatchInput[] = [
  { match_id: "M1", date: "", kickoff_time: "", home_away: "H" },
  { match_id: "M2", date: "", kickoff_time: "", home_away: "A" },
];

function isoMondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoMondayOfISO(yyyyMmDd: string) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  return isoMondayOf(d);
}

function addDays(yyyyMmDd: string, days: number) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  d.setDate(d.getDate() + days);
  // Format from LOCAL date parts (not toISOString, which is UTC and shifts the
  // date back a day in timezones ahead of UTC). Keeps this consistent with
  // isoMondayOf so the week grid labels the right calendar dates everywhere.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function diffDays(aYYYYMMDD: string, bYYYYMMDD: string) {
  const a = new Date(aYYYYMMDD + "T00:00:00");
  const b = new Date(bYYYYMMDD + "T00:00:00");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// Keep only the dated matches that actually fall inside the viewed week,
// earliest first — the shared basis for both the MD label and the seed below.
function matchesInWeek(weekStart: string, weekEnd: string, matchDates: (string | undefined)[]): string[] {
  return matchDates
    .map((d) => (d || "").trim())
    .filter((d) => d && d >= weekStart && d <= weekEnd)
    .sort((a, b) => a.localeCompare(b));
}

// MD label for a given day relative to the nearest match in the week
// (e.g. "MD", "MD-4", "MD+1"). Null when there's no match to anchor to, so
// the manual grid only shows the chip on real match weeks.
function mdLabelForDay(weekStart: string, weekEnd: string, matchDates: (string | undefined)[], dayIndex: number): string | null {
  const inWeek = matchesInWeek(weekStart, weekEnd, matchDates);
  if (inWeek.length === 0) return null;
  const day = addDays(weekStart, dayIndex);
  if (inWeek.includes(day)) return "MD";
  const next = inWeek.find((m) => m > day);
  if (next) return `MD-${Math.abs(diffDays(day, next))}`;
  let prev: string | null = null;
  for (let i = inWeek.length - 1; i >= 0; i--) { if (inWeek[i] < day) { prev = inWeek[i]; break; } }
  if (prev) return `MD+${diffDays(day, prev)}`;
  return null;
}

// Seed the 7 daily intents from the match position so the editable grid starts
// anchored to the game — Force at MD-4, taper at MD-2/MD-1, GAME on match day,
// Recovery after — instead of the position-blind generic default. The coach can
// then tweak any day. Mirrors the auto-MD ordering in autoMdDayEdits so the two
// paths agree. Returns null when the week has no dated match.
// ── Day character — ONE shared vocabulary with the Meso (Periodization Hub). The Meso labels each
// day by its field character (Mechanical/Locomotive/Mixed/Technical) or a special day (Activation/
// Top-up/Recovery/Off). This is the PRIMARY per-day selector in Week Setup so the two surfaces read
// the same. The strength focus (NoMatchIntent) is kept as a SECONDARY axis for the four field-stimulus
// days (it drives the per-player strength dose); the character selector sets a sensible default for it.
type DayCharacter =
  | "MECHANICAL" | "LOCOMOTIVE" | "MIXED" | "TECHNICAL" | "ACTIVATION" | "TOPUP" | "RECOVERY" | "OFF"
  // Basketball court sessions — the primary per-day axis for an indoor (no-GPS) team. Shown INSTEAD
  // of the football pitch stimuli above; RECOVERY / OFF are shared. (See DAY_CHARACTER_OPTIONS_BB.)
  | "BB_HIGH" | "BB_MODERATE" | "BB_LIGHT" | "BB_STRENGTH";
const DAY_CHARACTER_OPTIONS: { value: DayCharacter; en: string; is: string }[] = [
  { value: "MECHANICAL", en: "Mechanical", is: "Mekanískt" },
  { value: "LOCOMOTIVE", en: "Locomotive", is: "Hlaup" },
  { value: "MIXED", en: "Mixed", is: "Blandað" },
  { value: "TECHNICAL", en: "Technical", is: "Tæknilegt" },
  { value: "ACTIVATION", en: "Activation", is: "Virkjun" },
  { value: "TOPUP", en: "Top-up", is: "Áfylling" },
  { value: "RECOVERY", en: "Recovery", is: "Endurheimt" },
  { value: "OFF", en: "Off", is: "Frí" },
];
// Basketball court-session vocabulary (indoor, no GPS) — replaces the football pitch stimuli for a
// basketball team. A practice's intensity is the primary axis (sRPE / game-density drive load, not
// MD-day pitch stimuli); a dedicated S&C day sits alongside; RECOVERY / OFF are the shared specials.
const DAY_CHARACTER_OPTIONS_BB: { value: DayCharacter; en: string; is: string }[] = [
  { value: "BB_HIGH", en: "Practice — High", is: "Æfing — há" },
  { value: "BB_MODERATE", en: "Practice — Moderate", is: "Æfing — miðlungs" },
  { value: "BB_LIGHT", en: "Shootaround / Light", is: "Shootaround / létt" },
  { value: "BB_STRENGTH", en: "Strength & Conditioning", is: "Styrktaræfing" },
  { value: "RECOVERY", en: "Recovery", is: "Endurheimt" },
  { value: "OFF", en: "Off", is: "Frí" },
];
// DEVELOPMENT phases (off-season / pre-season) have no match to taper for, so the day reads as GYM-led
// development, not an in-season pitch stimulus. Same underlying DayCharacter VALUES (so persistence +
// every downstream consumer are untouched) — only the labels change: Mechanical→Strength (force base),
// Mixed→Power/Speed (neural-velocity), Locomotive→Conditioning (aerobic/running base).
const DAY_CHARACTER_OPTIONS_DEV: { value: DayCharacter; en: string; is: string }[] = [
  { value: "MECHANICAL", en: "Strength", is: "Styrkur" },
  { value: "MIXED", en: "Power / Speed", is: "Kraftur / hraði" },
  { value: "LOCOMOTIVE", en: "Conditioning", is: "Þol" },
  { value: "TECHNICAL", en: "Technical", is: "Tæknilegt" },
  { value: "ACTIVATION", en: "Activation", is: "Virkjun" },
  { value: "TOPUP", en: "Top-up", is: "Áfylling" },
  { value: "RECOVERY", en: "Recovery", is: "Endurheimt" },
  { value: "OFF", en: "Off", is: "Frí" },
];
// Every character value that may be persisted (football + basketball) — used to validate a saved grid.
const ALL_CHARACTER_VALUES = new Set<DayCharacter>(
  [...DAY_CHARACTER_OPTIONS, ...DAY_CHARACTER_OPTIONS_BB].map((o) => o.value),
);
// The four field-stimulus characters (they carry a pitch stimulus + a secondary strength focus).
const STIMULUS_CHARACTERS: DayCharacter[] = ["MECHANICAL", "LOCOMOTIVE", "MIXED", "TECHNICAL"];
// Basketball practice/S&C characters (training days that also carry the secondary strength dose).
const BB_TRAINING_CHARACTERS: DayCharacter[] = ["BB_HIGH", "BB_MODERATE", "BB_LIGHT", "BB_STRENGTH"];
// A day that carries a session (so the secondary strength axis + a non-OFF day_type apply). Covers the
// football field days, the Activation / Top-up specials, AND every basketball practice / S&C day.
const isTrainingCharacter = (c: DayCharacter): boolean =>
  STIMULUS_CHARACTERS.includes(c) || BB_TRAINING_CHARACTERS.includes(c) || c === "ACTIVATION" || c === "TOPUP";
const characterToStimulus = (c: DayCharacter): StimulusType | null =>
  c === "MECHANICAL" ? "mechanical" : c === "LOCOMOTIVE" ? "locomotive" : c === "MIXED" ? "mixed" : c === "TECHNICAL" ? "technical" : null;
// Default strength focus for a chosen character (mirrors intentFromWeekPlan's stimulus→intent map).
const characterDefaultIntent = (c: DayCharacter): NoMatchIntent =>
  c === "MECHANICAL" ? "FORCE" : c === "LOCOMOTIVE" ? "VELOCITY" : c === "MIXED" ? "NEURAL_VELOCITY" : c === "TECHNICAL" ? "POLISH_CALM"
    : c === "ACTIVATION" ? "ACTIVATION" : c === "TOPUP" ? "RECOVERY_MD1"
    // Basketball: the practice character is primary; the strength dose is a sensible default the coach
    // can override. A dedicated S&C day emphasises force; a high court-load day keeps lifting lighter.
    : c === "BB_STRENGTH" ? "FORCE" : c === "BB_LIGHT" ? "POLISH_CALM" : c === "BB_HIGH" || c === "BB_MODERATE" ? "NEURAL_VELOCITY"
    : c === "RECOVERY" ? "RECOVERY" : "OFF";
// The strength-focus options offered on a field-stimulus day (the secondary axis).
const STRENGTH_FOCUS_OPTIONS: NoMatchIntent[] = ["FORCE_LIGHT", "FORCE", "NEURAL_VELOCITY", "VELOCITY", "POLISH_CALM", "ACTIVATION"];
const isTrainingStrength = (i: NoMatchIntent): boolean => STRENGTH_FOCUS_OPTIONS.includes(i);
// Derive the day's character from its stored (intent, stimulus). A field day shows its pitch stimulus;
// a special day shows its intent. (A training day without a stored stimulus infers one from the intent.)
function characterFromDay(intent: NoMatchIntent, stimulus: StimulusType | null): DayCharacter {
  if (intent === "OFF" || intent === "GAME") return "OFF";
  if (intent === "ACTIVATION") return "ACTIVATION";
  if (intent === "RECOVERY_MD1") return "TOPUP";
  if (intent === "RECOVERY" || intent === "RECOVERY_MD2" || intent === "RECOVERY_PLUS") return "RECOVERY";
  // A field-stimulus training day: prefer the stored stimulus, else infer from the strength intent.
  if (stimulus === "mechanical") return "MECHANICAL";
  if (stimulus === "locomotive") return "LOCOMOTIVE";
  if (stimulus === "mixed") return "MIXED";
  if (stimulus === "technical") return "TECHNICAL";
  return intent === "FORCE" ? "MECHANICAL" : intent === "VELOCITY" ? "LOCOMOTIVE" : intent === "POLISH_CALM" ? "TECHNICAL" : "MIXED";
}

// Basketball fallback — derive a court character from a day's stored strength intent when no character
// was saved. Mirrors characterFromDay for football, but maps onto the basketball vocabulary so an
// indoor team never shows a pitch stimulus (Mechanical/Locomotive) it can't use.
function characterFromDayBb(intent: NoMatchIntent): DayCharacter {
  if (intent === "OFF" || intent === "GAME") return "OFF";
  if (intent === "RECOVERY" || intent === "RECOVERY_MD1" || intent === "RECOVERY_MD2" || intent === "RECOVERY_PLUS") return "RECOVERY";
  if (intent === "ACTIVATION") return "BB_LIGHT"; // a shootaround-style activation day
  if (intent === "FORCE" || intent === "FORCE_LIGHT") return "BB_STRENGTH";
  if (intent === "POLISH_CALM") return "BB_LIGHT";
  return "BB_MODERATE"; // VELOCITY / NEURAL_VELOCITY and any other training intent → a moderate practice
}

/** Parse the pitch stimulus the Meso wrote into week_plans.focus ("MD-x Mechanical"). */
function stimulusFromFocus(focus: string | null): StimulusType | null {
  const f = String(focus ?? "").toLowerCase();
  if (/mechanical/.test(f)) return "mechanical";
  if (/locomotive/.test(f)) return "locomotive";
  if (/mixed/.test(f)) return "mixed";
  if (/technical|polish|calm/.test(f)) return "technical";
  return null;
}

// Map a saved Meso (week_plans) day → the Week-setup intent, so the Micro cycle reflects the block the
// coach built in the Meso (OFF/match days + the day's stimulus). Meso writes day_type GAME/OFF/TRAIN,
// day_intent GAME/OFF/null, and focus "MD-x <Stimulus>" (Mechanical/Locomotive/Mixed/Activation).
function intentFromWeekPlan(dayType: string | null, dayIntent: string | null, focus: string | null): NoMatchIntent {
  const dt = String(dayType ?? "").toUpperCase();
  if (dt === "OFF") return "OFF";
  if (dt === "GAME") return "GAME";
  const di = String(dayIntent ?? "").toUpperCase();
  if (di === "FORCE" || di === "NEURAL_VELOCITY" || di === "POLISH_CALM" || di === "ACTIVATION") return di as NoMatchIntent;
  const f = String(focus ?? "").toLowerCase();
  if (/top-?up/.test(f)) return "RECOVERY_MD1"; // the Meso's MD+1 "Top-up" (distinct from a plain recovery day)
  if (dt === "RECOVERY" || /recovery/.test(f)) return "RECOVERY";
  if (/mechanical/.test(f)) return "FORCE";
  if (/locomotive/.test(f)) return "VELOCITY";
  if (/activation/.test(f)) return "ACTIVATION";
  if (/mixed/.test(f)) return "NEURAL_VELOCITY";
  if (/technical|polish|calm/.test(f)) return "POLISH_CALM";
  return "FORCE"; // a training day with no recognisable stimulus
}

// Map the Macro season phase that covers a week → the Week-setup Season pill. Macro keys are
// preseason / competitive / offseason (from detectSeasonPhases); the pill also has playoffs (manual).
function macroPhaseForWeek(weekStart: string, phases: Array<{ key: string; start: string; end: string }>): SeasonPhase | null {
  if (!phases.length) return null;
  const weekEnd = addDays(weekStart, 6);
  const map: Record<string, SeasonPhase> = { preseason: "preseason", competitive: "inseason", offseason: "offseason" };
  const hit =
    phases.find((p) => p.start <= weekStart && weekStart <= p.end) ??      // week starts inside a phase
    phases.find((p) => p.start <= weekEnd && weekEnd <= p.end) ??           // week ends inside a phase
    phases.find((p) => weekStart <= p.start && p.start <= weekEnd);          // a phase starts mid-week
  return hit ? (map[hit.key] ?? null) : null;
}

function matchAnchoredIntents(weekStart: string, weekEnd: string, matchDates: (string | undefined)[]): NoMatchIntent[] | null {
  const inWeek = matchesInWeek(weekStart, weekEnd, matchDates);
  if (inWeek.length === 0) return null;
  const set = new Set(inWeek);
  const nextMatch = (day: string) => inWeek.find((m) => m > day) ?? null;
  const prevMatch = (day: string) => {
    for (let i = inWeek.length - 1; i >= 0; i--) if (inWeek[i] < day) return inWeek[i];
    return null;
  };
  return Array.from({ length: 7 }).map((_, i) => {
    const day = addDays(weekStart, i);
    if (set.has(day)) return "GAME";
    const next = nextMatch(day);
    if (next) {
      const md = Math.abs(diffDays(day, next));
      if (md >= 4) return (md - 4) % 2 === 0 ? "FORCE" : "NEURAL_VELOCITY"; // MD-4 force, MD-5 neural…
      if (md === 3) return "NEURAL_VELOCITY";
      if (md === 2) return "POLISH_CALM";
      if (md === 1) return "ACTIVATION";
    }
    const prev = prevMatch(day);
    if (prev && diffDays(day, prev) >= 1 && i !== 6) {
      const dp = diffDays(day, prev); // days after the last match → the split recovery options
      return dp === 1 ? "RECOVERY_MD1" : dp === 2 ? "RECOVERY_MD2" : "RECOVERY_PLUS";
    }
    return i === 6 ? "OFF" : "FORCE";
  }) as NoMatchIntent[];
}

// Basketball: anchor the week to the game(s) — the day before is a light shootaround, the day after a
// recovery day, and the rest are moderate practices. Game-relative (GD), NOT the football MD taper.
function bbGameAnchoredIntents(weekStart: string, weekEnd: string, matchDates: (string | undefined)[]): NoMatchIntent[] | null {
  const inWeek = matchesInWeek(weekStart, weekEnd, matchDates);
  if (inWeek.length === 0) return null;
  const set = new Set(inWeek);
  const nextMatch = (day: string) => inWeek.find((m) => m > day) ?? null;
  const prevMatch = (day: string) => {
    for (let i = inWeek.length - 1; i >= 0; i--) if (inWeek[i] < day) return inWeek[i];
    return null;
  };
  return Array.from({ length: 7 }).map((_, i) => {
    const day = addDays(weekStart, i);
    if (set.has(day)) return "GAME";
    const next = nextMatch(day);
    if (next && diffDays(day, next) === 1) return "ACTIVATION"; // GD-1 shootaround (→ BB_LIGHT)
    const prev = prevMatch(day);
    if (prev && diffDays(day, prev) === 1 && i !== 6) return "RECOVERY_MD1"; // GD+1 recovery
    return i === 6 ? "OFF" : "NEURAL_VELOCITY"; // moderate practice (→ BB_MODERATE)
  }) as NoMatchIntent[];
}

// Basketball default week (no game) — a moderate base with one S&C day, one shootaround, recovery, OFF.
// Backs characterFromDayBb so an unsaved basketball week reads as real court sessions, not placeholders.
function getDefaultBbIntents(): NoMatchIntent[] {
  return ["NEURAL_VELOCITY", "FORCE", "NEURAL_VELOCITY", "POLISH_CALM", "NEURAL_VELOCITY", "RECOVERY", "OFF"];
}

function intentsEqualDefault(arr: NoMatchIntent[] | null | undefined): boolean {
  if (!Array.isArray(arr) || arr.length !== 7) return true; // absent/invalid = never customized
  const def = getDefaultNoMatchIntents();
  return arr.every((v, i) => v === def[i]);
}

// MD label helper: MD-4 and earlier (MD-5, MD-6...) alternate FORCE ↔ NEURAL
function preMatchMicrodoseFocus(mdMinus: number) {
  const k = mdMinus - 4; // 0..n from MD-4
  const isForce = k % 2 === 0; // MD-4 force, MD-5 neural, MD-6 force...
  return isForce ? `MD-${mdMinus} FORCE / RESTART` : `MD-${mdMinus} NEURAL / VELOCITY`;
}

// Detect week type from the number of fixtures in the week. THREE_MATCHES only
// applies to basketball (a week is defined by its game count 0–3); football
// keeps its existing 0/1/2 mapping exactly — three league games in a week stays
// TWO_MATCHES, so football behaviour is unchanged.
function detectWeekType(fixtureCount: number, isBasketball: boolean): WeekType {
  if (fixtureCount <= 0) return "NO_MATCH";
  if (fixtureCount === 1) return "ONE_MATCH";
  if (isBasketball && fixtureCount >= 3) return "THREE_MATCHES";
  return "TWO_MATCHES";
}

function intentToDayType(i: NoMatchIntent): DayType {
  if (i === "OFF") return "OFF";
  if (i === "GAME") return "GAME"; // ✅ NEW
  if (i === "RECOVERY" || i === "RECOVERY_MD1" || i === "RECOVERY_MD2" || i === "RECOVERY_PLUS") return "RECOVERY"; // MD+1/+2/+3 are recovery days
  return "TRAIN"; // FORCE_LIGHT (MD-5) is a (lighter) training day
}

function intentToFocusLabel(i: NoMatchIntent): string {
  // The MD-5 / MD+3 labels carry the md-day token so v_player_today_microdose_final
  // pins them directly (a manual pick wins over the fixtures-based derivation).
  if (i === "FORCE_LIGHT") return "MD-5 FORCE (LIGHT)";
  if (i === "FORCE") return "FORCE";
  if (i === "NEURAL_VELOCITY") return "NEURAL / VELOCITY";
  if (i === "VELOCITY") return "VELOCITY";
  if (i === "POLISH_CALM") return "POLISH / CALM";
  if (i === "ACTIVATION") return "ACTIVATION";
  if (i === "RECOVERY") return "RECOVERY";
  if (i === "RECOVERY_MD1") return "MD+1 RECOVERY";
  if (i === "RECOVERY_MD2") return "MD+2 RECOVERY";
  if (i === "RECOVERY_PLUS") return "MD+3 RECOVERY";
  if (i === "GAME") return "GAME"; // ✅ NEW
  return "OFF";
}

function getDefaultNoMatchIntents(): NoMatchIntent[] {
  return ["FORCE", "NEURAL_VELOCITY", "RECOVERY", "ACTIVATION", "POLISH_CALM", "RECOVERY", "OFF"];
}

// Off-season development week: no fixtures to taper for, so this is a DEVELOPMENT build
// (hypertrophy → max-strength + power), not the in-season micro-dose. Drops the match-prep
// POLISH_CALM and leans on FORCE (strength) + NEURAL_VELOCITY (power), with conditioning + recovery.
// A starting point the coach adjusts — the macro off-season phase drives it so an off-season week
// no longer falls back to the generic "no match" pattern.
function getOffseasonDevIntents(): NoMatchIntent[] {
  return ["FORCE", "NEURAL_VELOCITY", "RECOVERY", "FORCE", "NEURAL_VELOCITY", "ACTIVATION", "OFF"];
}

const WEEKDAYS_SHORT = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];

type Bi = { en: string; is: string };
/** Where a week sits in the periodisation spine — supplied by the Periodization Hub (Micro tab). */
export type WeekSpine = {
  phase: Bi | null;
  block: { label: Bi; color: string; week: number; of: number; deload: boolean } | null;
};
type WeekSetupViewProps = {
  /** Mounted inside the Periodization Hub: no page header, the hub supplies the context. */
  embedded?: boolean;
  /** Macro phase + Meso block for a given week (Monday ISO). */
  spine?: (weekStart: string) => WeekSpine;
  /** The coach's periodisation principles editor, revealed from the week bar. */
  rulesSlot?: ReactNode;
  /** Jump to a hub tab from the spine chips. */
  onOpenTab?: (tab: "season" | "plan") => void;
  /** Deep-link: when set/changed, jump the editor to the Monday of this date (e.g. from the Pre-season tab). */
  initialWeekStart?: string;
};

// Rendered by /coach/week-setup (standalone) and by the Periodization Hub's "Micro Cycle" tab
// (embedded, with the Macro/Meso spine passed in) — one macro→meso→micro flow.
export default function WeekSetupView({ embedded = false, spine, rulesSlot, onOpenTab, initialWeekStart }: WeekSetupViewProps = {}) {
  const { isAtLeastPro } = usePlan();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => (initialWeekStart ? isoMondayOfISO(initialWeekStart) : isoMondayOf(new Date())));
  // Deep-link: jump to the Monday of `initialWeekStart` whenever the caller changes it (e.g. the Pre-season tab).
  useEffect(() => { if (initialWeekStart) setWeekStart(isoMondayOfISO(initialWeekStart)); }, [initialWeekStart]);
  const [weekType, setWeekType] = useState<WeekType>("NO_MATCH");
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(null);
  const [matches, setMatches] = useState<MatchInput[]>(DEFAULT_MATCHES);
  // Set when the saved week is anchored to a different match day than the current fixtures
  // (a fixture moved since the week was saved) → prompt a one-click re-anchor.
  const [staleMatchAnchor, setStaleMatchAnchor] = useState<{ was: string | null; now: string | null } | null>(null);
  // Per-day pitch stimulus (mechanical/locomotive/mixed/technical), 7 entries. Separate
  // axis from noMatchIntents (strength). null = unset / match / off.
  const [dayStimuli, setDayStimuli] = useState<(StimulusType | null)[]>(() => Array.from({ length: 7 }, () => null));
  // Field character per day (Meso vocabulary) — stored independently of the strength focus so an
  // Activation / Top-up day can still carry a strength dose. null → derive from (intent, stimulus).
  const [dayCharacters, setDayCharacters] = useState<(DayCharacter | null)[]>(() => Array.from({ length: 7 }, () => null));
  // Scheduled performance tests falling in this week — READ-ONLY here (scheduled on the
  // Periodization Hub Testing tab; Week Setup only reflects them on the matching day).
  const [weekTests, setWeekTests] = useState<{ id: string; test_key: TestKey; test_date: string }[]>([]);
  // Provenance when the match day was auto-detected from the Fixtures schedule
  // (match_schedule) rather than typed manually. Cleared once a saved Week Setup
  // exists for the week (the coach's own data takes over).
  const [scheduleNote, setScheduleNote] = useState<string | null>(null);

  const [intensityTarget, setIntensityTarget] = useState<number>(6);
  // The day open in the detail panel under the grid (0 = Monday). Cards stay compact; the day's editors,
  // coaching idea, load and on-pitch examples live in that panel at a readable size.
  const [selDay, setSelDay] = useState<number>(() => Math.max(0, Math.min(6, (new Date().getDay() + 6) % 7)));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [phaseEdit, setPhaseEdit] = useState(false);
  useEffect(() => {
    // Open the panel on today when the shown week contains it, else on Monday.
    const today = isoMondayOf(new Date());
    setSelDay(today === weekStart ? (new Date().getDay() + 6) % 7 : 0);
  }, [weekStart]);
  // Opponent (+ context) per fixture date, read from match_schedule — display-only,
  // powers the "vs FH" match cards and the provenance pill. Never saved.
  const [matchOpponents, setMatchOpponents] = useState<Record<string, string>>({});
  const [teamId, setTeamId] = useState<string | null>(null);
  // Bumped by a match_schedule realtime event → re-reads the week's fixtures so a match added elsewhere
  // (the Meso calendar, the Fixtures page) appears here live.
  const [fixtureRev, setFixtureRev] = useState(0);
  // Team sport — drives the game-density week model (basketball) vs the MD-day
  // model (football). Defaults to football so an unknown team behaves as before.
  const [sport, setSport] = useState<SportId>("football");
  const isBasketball = sport === "basketball";
  // Basketball Standard: the authored Custom Programme block TITLE per weekday (Mon→Sun), read-only, so the
  // grid shows the week's real strength sessions instead of the (unused) microdose focus. null = none.
  const [bbStrengthTitles, setBbStrengthTitles] = useState<(string | null)[]>(() => Array.from({ length: 7 }, () => null));

  const [noMatchIntents, setNoMatchIntents] = useState<NoMatchIntent[]>(getDefaultNoMatchIntents());
  // Pre-season per-day KPI/load doses (from PreseasonStartWeekCard) — printed in each grid cell.
  const [psInfo, setPsInfo] = useState<PreseasonComputed | null>(null);
  const onPsComputed = useCallback((info: PreseasonComputed | null) => setPsInfo(info), []);
  // Macro season phases (from the Periodization loader) — auto-fills the Season pill for a week when
  // the coach hasn't set one. The coach's explicit choice (saved) always wins.
  const [macroPhases, setMacroPhases] = useState<Array<{ key: string; start: string; end: string }>>([]);
  const macroPhasesRef = useRef(macroPhases);
  useEffect(() => { macroPhasesRef.current = macroPhases; }, [macroPhases]);
  const [savedSeasonPhase, setSavedSeasonPhase] = useState<SeasonPhase | null>(null);
  // Declared team breaks (read-only here) — days inside a break are auto-locked
  // as "Frí" in the daily grid so you can't schedule training on a break day.
  const [teamBreaks, setTeamBreaks] = useState<Array<{ start_date: string; end_date: string }>>([]);
  // Training camps (æfingaferð) — concentrated-load periods; the grid marks their days (a loading period,
  // NOT a break/lock). Fetched below from the same route the Periodization Hub writes.
  const [teamCamps, setTeamCamps] = useState<Array<{ start_date: string; end_date: string; label: string | null; load_pct: number; two_a_day: boolean }>>([]);
  // Off-season HOLIDAY (Frí) — the span between the season end (off-season phase start) and the
  // coach-set off-season START. Those weeks are auto-locked OFF here, just like a declared break.
  const [offBuildStart, setOffBuildStart] = useState<string>("");
  const offPhaseStart = macroPhases.find((p) => p.key === "offseason")?.start ?? null;
  // A real fixture exists on this date in the Fixtures schedule (match_schedule → matchOpponents).
  const hasFixtureOnDate = (dateIso: string) => Object.prototype.hasOwnProperty.call(matchOpponents, dateIso);
  // Raw off-season holiday window = season end (off-season phase start) → off-season build start.
  const isOffHolidayWindow = (dateIso: string) =>
    !!offPhaseStart && !!offBuildStart && offBuildStart > offPhaseStart && offPhaseStart <= dateIso && dateIso < offBuildStart;
  // The off-season break auto-locks days as OFF — EXCEPT a day that carries a real fixture: the last
  // match of the season often lands on/near the season-end boundary, and it must never be silently
  // locked off. A declared team break still locks (the coach set it explicitly).
  const isHolidayDay = (dateIso: string) => isOffHolidayWindow(dateIso) && !hasFixtureOnDate(dateIso);
  const isDateOnBreak = (dateIso: string) =>
    teamBreaks.some((b) => b.start_date <= dateIso && dateIso <= b.end_date) || isHolidayDay(dateIso);
  // The training camp covering a day (if any) — a loading period; a break wins over a camp if they overlap.
  const campForDay = (dateIso: string) => teamCamps.find((c) => c.start_date <= dateIso && dateIso <= c.end_date) ?? null;
  // A fixture that falls inside the declared off-season window — kept as a match, but flagged so the
  // coach can move the off-season start past the final game if that is what they meant.
  const matchInOffHoliday = (dateIso: string) => isOffHolidayWindow(dateIso) && hasFixtureOnDate(dateIso);
  const [lang] = useLang();
  const isIS = lang === "IS";
  const weekdaysShort = isIS ? WEEKDAYS_SHORT : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const t = isIS ? {
    subtitle: "Stilltu vikuna. Kerfið sendir leikmönnum réttan æfingadag.",
    week: "Vika", done: "✓ Lokið", error: "Villa",
    step1: "Skref 1 — Vikugerð", step1desc: "Veldu vikudagsetningu og hvort það séu leikir í vikunni.",
    weekTypePill: "Vikugerð", setupPill: "Uppsetning",
    teamIdHint: "Ef þetta er tómt: þá er coach ekki tengdur liði í profiles/coach_teams.",
    weekStart: "Vikuupphaf (mánudagur)", season: "Tímabil", weekType: "Vikugerð",
    noMatch: "Enginn leikur", oneMatch: "1 leikur", twoMatches: "2 leikir", threeMatches: "3 leikir",
    fromSchedule: "Sótt sjálfkrafa úr Leikjadagatali:",
    fromScheduleHint: "Þú getur samt breytt vikugerð eða leikupplýsingum að neðan.",
    staleTitle: "Leikur færður — endursetja vikuna?",
    staleBody: "Þessi vika var vistuð miðað við annan leikdag en er núna í Leikjadagatali. Endur-ankera á réttan leikdag og vista — svo Today og álagsstjórnun lesi rétta daginn.",
    staleBtn: "Endur-ankera & vista",
    manualTitle: "Leyfa handvirka vikugerð (eins og NO_MATCH)",
    manualDesc: "Gott í preseason: þú stýrir dag-til-dags áherslum þó það séu 1–2 leikir.",
    next: "Næsta →", back: "← Til baka",
    step2: "Skref 2 — Uppsetning",
    manualCtrl: "Manual vikustýring", autoOrder: "Auto MD röðun",
    step2manual: "Manual vikustýring: veldu áherslu per dag (virkar líka þó 1–2 leikir).",
    step2auto: "Auto MD: settu inn dagsetningar (kerfið sér um MD röðun).",
    match: "Leikur", date: "Dagsetning", kickoff: "Byrjunartími (valfrjáls)", home: "Heimavöllur", away: "Leikavöllur",
    dailyIntent: "Dagleg áhersla (mán → sun)", reset: "Endurstilla", fillFromMatch: "Fylla út frá leik (MD)",
    autoActive: "Auto MD er virkt. Ef þú vilt handvirkt eins og preseason: settu Manual override á ON í Skrefi 1.",
    intensityHint: "1 = mjög létt · 10 = mjög erfitt",
    step3: "Skref 3 — Yfirlit & Virkja", step3desc: "Svona mun vikan líta út fyrir leikmenn (þetta er það sem verður sent).",
    microTitle: "Microcycle yfirferð", microOk: "✓ Í lagi", microNote: "ábending",
    microDesc: "Sjálfvirk yfirferð á vikuhringnum út frá rannsóknum (Buchheit o.fl. 2024). Ábendingar, ekki hindrun.",
    microNone: "Vikuhringurinn fylgir helstu microcycle-reglum — engin ábending.",
    saving: "Vista...", loadingW: "Hleður...", saveWeek: "Vista viku",
    applying: "Virkjar...", activate: "Virkja → senda leikmönnum",
    manualWeek: "Manual vika", autoWeek: "Auto MD vika", editSetup: "← Breyta uppsetningu",
  } : {
    subtitle: "Set up the week. The system sends each player the right training day.",
    week: "Week", done: "✓ Done", error: "Error",
    step1: "Step 1 — Week type", step1desc: "Choose the week's dates and whether there are matches this week.",
    weekTypePill: "Week type", setupPill: "Setup",
    teamIdHint: "If this is empty, the coach isn't linked to a team in profiles/coach_teams.",
    weekStart: "Week start (Monday)", season: "Season", weekType: "Week type",
    noMatch: "No match", oneMatch: "1 match", twoMatches: "2 matches", threeMatches: "3 games",
    fromSchedule: "Auto-detected from Fixtures:",
    fromScheduleHint: "You can still change the week type or match details below.",
    staleTitle: "Fixture moved — re-anchor this week?",
    staleBody: "This week was saved against a different match day than the Fixtures schedule now shows. Re-anchor to the correct match day and save — so Today and load management read the right day.",
    staleBtn: "Re-anchor & save",
    manualTitle: "Allow manual week setup (like NO_MATCH)",
    manualDesc: "Good in preseason: you control day-to-day intent even with 1–2 matches.",
    next: "Next →", back: "← Back",
    step2: "Step 2 — Setup",
    manualCtrl: "Manual week control", autoOrder: "Auto MD ordering",
    step2manual: "Manual week control: pick the intent per day (works even with 1–2 matches).",
    step2auto: "Auto MD: enter the match dates (the system handles MD ordering).",
    match: "Match", date: "Date", kickoff: "Kickoff time (optional)", home: "Home", away: "Away",
    dailyIntent: "Daily intent (Mon → Sun)", reset: "Reset", fillFromMatch: "Fill from match (MD)",
    autoActive: "Auto MD is active. For manual control like preseason: set Manual override to ON in Step 1.",
    intensityHint: "1 = very light · 10 = very hard",
    step3: "Step 3 — Review & Activate", step3desc: "This is how the week will look for players (this is what gets sent).",
    microTitle: "Microcycle review", microOk: "✓ OK", microNote: "note",
    microDesc: "Automatic review of the microcycle from research (Buchheit et al. 2024). Suggestions, not blocks.",
    microNone: "The microcycle follows the main principles — no notes.",
    saving: "Saving...", loadingW: "Loading...", saveWeek: "Save week",
    applying: "Activating...", activate: "Activate → send to players",
    manualWeek: "Manual week", autoWeek: "Auto MD week", editSetup: "← Edit setup",
  };

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  // Scheduled performance tests in this week (shared with the Periodization Hub Testing tab).
  const loadWeekTests = useCallback(async () => {
    const tid = (teamId ?? "").trim();
    if (!tid) { setWeekTests([]); return; }
    const token = (await supabase.auth.getSession()).data?.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/coach/test-schedule?from=${weekStart}&to=${addDays(weekStart, 6)}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json().catch(() => null);
    if (res.ok && j?.ok) setWeekTests(j.tests ?? []);
  }, [teamId, weekStart]);
  useEffect(() => { void loadWeekTests(); }, [loadWeekTests]);

  const visibleMatches = useMemo(() => {
    if (weekType === "ONE_MATCH") return [matches[0] ?? DEFAULT_MATCHES[0]];
    // THREE_MATCHES (basketball) reuses the two editable slots — the exact third
    // kickoff isn't needed for the sRPE-driven basketball model; the game-count
    // shape guidance is what matters.
    if (weekType === "TWO_MATCHES" || weekType === "THREE_MATCHES")
      return [matches[0] ?? DEFAULT_MATCHES[0], matches[1] ?? DEFAULT_MATCHES[1]];
    return [];
  }, [weekType, matches]);

  // The week grid is always directly editable now (the wizard + manual-override
  // toggle are gone): the MD ordering is only the seed for the daily intents, and
  // the coach can change any day. So the "manual week" path is always taken — the
  // preview and apply always read the editable grid (manualNoMatchDayEdits).
  const isManualWeek = true;

  // Is there a dated match inside the viewed week? Gates the MD chips + the
  // "Fill from match" seed button in the manual grid.
  // 1) LOAD TEAM ID (robust)
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: uRes, error: uErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (uErr || !uRes.user) {
        setTeamId(null);
        return;
      }

      const uid = uRes.user.id;

      // Try profiles first
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id, id, user_id")
        .or(`id.eq.${uid},user_id.eq.${uid}`)
        .maybeSingle();

      if (!alive) return;

      const profTid = (prof?.team_id ?? "").toString().trim();
      if (profTid) {
        setTeamId(profTid);
        return;
      }

      // Fallback: coach_teams
      const { data: ct } = await supabase
        .from("coach_teams")
        .select("team_id,is_primary")
        .eq("coach_id", uid)
        .order("is_primary", { ascending: false })
        .limit(1);

      if (!alive) return;

      const ctTid = (ct?.[0]?.team_id ?? "").toString().trim();
      if (ctTid) {
        setTeamId(ctTid);
        return;
      }

      setTeamId(null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Resolve the team's sport once we know the team (team-level source only).
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = teamId ? await resolveTeamSport(supabase, teamId) : "football";
      if (alive) setSport(s);
    })();
    return () => { alive = false; };
  }, [teamId]);

  // 2) LOAD WEEK SETUP (filter by team_id + week_start_date)
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      const tid = (teamId ?? "").trim();

      // Ekki sækja fyrr en teamId er komið
      if (!tid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setOk(null);

      const { data, error } = await supabase
        .from("coach_week_setup")
        .select("id, team_id, week_start_date, week_type, matches, no_match_intents, season_phase, day_stimuli, updated_at")
        .eq("team_id", tid)
        .eq("week_start_date", weekStart)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // Fixtures (match_schedule) are the SOURCE OF TRUTH for the week's games —
      // always read them for the viewed week, so a game the coach enters later
      // still surfaces even on a week that was already saved. (Before, this read
      // only ran when NO saved row existed, so any fixture added after the week
      // was saved was silently hidden.)
      const weekEndISO = addDays(weekStart, 6);
      const { data: sched } = await supabase
        .from("match_schedule")
        .select("match_date, opponent, is_home, kickoff_time")
        .eq("team_id", tid)
        .gte("match_date", weekStart)
        .lte("match_date", weekEndISO)
        .order("match_date", { ascending: true });
      if (!alive) return;
      const found = (sched ?? []) as Array<{ match_date: string; opponent: string | null; is_home: boolean | null; kickoff_time: string | null }>;
      const schedPicks = found.slice(0, 2);
      const toInput = (p: (typeof found)[number], id: string): MatchInput => ({
        match_id: id,
        date: p.match_date,
        kickoff_time: p.kickoff_time ? p.kickoff_time.slice(0, 5) : "",
        home_away: p.is_home === false ? "A" : "H",
      });
      const schedMatches: MatchInput[] = [
        schedPicks[0] ? toInput(schedPicks[0], "M1") : DEFAULT_MATCHES[0],
        schedPicks[1] ? toInput(schedPicks[1], "M2") : DEFAULT_MATCHES[1],
      ];
      const schedNote = schedPicks.length
        ? schedPicks.map((p) => `${p.match_date}${p.opponent ? ` — ${p.opponent}` : ""} (${p.is_home === false ? "A" : "H"})`).join(" · ")
        : null;
      // Opponent lookup for the match cards + provenance pill (display-only).
      setMatchOpponents(Object.fromEntries(found.map((f) => [f.match_date, (f.opponent ?? "").trim()])));

      // MESO → MICRO: the Periodization Hub Meso block auto-saves the week's per-day layout into
      // week_plans (OFF/match days + each day's stimulus). Read it so the Micro cycle (this page)
      // reflects the block the coach built, instead of only match-anchoring. Coach's explicit Week
      // setup save still wins; fixtures/defaults are the last fallback.
      const { data: wp } = await supabase
        .from("week_plans")
        .select("day_date, day_type, day_intent, focus, updated_at")
        .eq("team_id", tid)
        .gte("day_date", weekStart)
        .lte("day_date", weekEndISO);
      if (!alive) return;
      const wpRows = (wp ?? []) as Array<{ day_date: string; day_type: string | null; day_intent: string | null; focus: string | null; updated_at: string | null }>;
      const wpByDate = new Map(wpRows.map((r) => [r.day_date, r]));
      // LAST EDIT WINS: the Meso (week_plans) and the coach's Week-setup grid (coach_week_setup)
      // both edit this week. Prefer whichever was touched more recently. week_plans.updated_at
      // only bumps when a day's content actually changes (DB trigger), so the Meso's whole-block
      // rewrite never falsely out-dates a week the coach refined here.
      const parseMs = (v: unknown): number => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : 0; };
      const wpMaxUpdated = wpRows.reduce((mx, r) => Math.max(mx, parseMs(r.updated_at)), 0);
      const coachUpdated = parseMs((data as { updated_at?: string | null } | null)?.updated_at);
      const mesoNewer = wpRows.length > 0 && wpMaxUpdated > coachUpdated;
      // Per-day meso intent (null where the block has no row for that day). Null overall = no block saved.
      const mesoRaw: (NoMatchIntent | null)[] | null = wpRows.length > 0
        ? Array.from({ length: 7 }).map((_, i) => {
            const r = wpByDate.get(addDays(weekStart, i));
            return r ? intentFromWeekPlan(r.day_type, r.day_intent, r.focus) : null;
          })
        : null;
      const applyMeso = (fallback: NoMatchIntent[]): NoMatchIntent[] | null =>
        mesoRaw ? (mesoRaw.map((v, i) => v ?? fallback[i]) as NoMatchIntent[]) : null;

      const rawIntents = (data as { no_match_intents?: unknown } | null)?.no_match_intents;
      const savedIntents: NoMatchIntent[] | null =
        Array.isArray(rawIntents) && rawIntents.length === 7 ? (rawIntents as NoMatchIntent[]) : null;
      // Precedence (LAST EDIT WINS): the more recently edited of the coach's own Week-setup grid
      // and the Meso block (week_plans). When the coach's grid is newer (and customised) it wins;
      // otherwise the Meso block seeds the week. Fixtures anchor / default is the final fallback.
      // A saved grid that equals the default counts as "not customised".
      const chooseSeed = (fallback: NoMatchIntent[]): NoMatchIntent[] => {
        const coachCustom = savedIntents && !intentsEqualDefault(savedIntents);
        if (coachCustom && !mesoNewer) return savedIntents!;
        return applyMeso(fallback) ?? (coachCustom ? savedIntents! : fallback);
      };

      // Season phase: the coach's saved choice wins; otherwise derive it from the Macro phase that
      // covers this week (so pre-season surfaces show up without a manual toggle).
      const sp = (data as { season_phase?: unknown } | null)?.season_phase;
      const validPhases: SeasonPhase[] = ["preseason", "inseason", "playoffs", "offseason"];
      const savedSp = validPhases.includes(sp as SeasonPhase) ? (sp as SeasonPhase) : null;
      setSavedSeasonPhase(savedSp);
      // The week's resolved phase (coach save wins, else the Macro phase covering the week). Used both
      // for the Season pill AND to seed an off-season DEVELOPMENT week instead of the generic default.
      const weekPhase = savedSp ?? macroPhaseForWeek(weekStart, macroPhasesRef.current);
      setSeasonPhase(weekPhase);

      // Stale match anchor: a SAVED week whose week_plans GAME day no longer matches the
      // fixtures (a fixture was moved/added/removed since the week was saved). The display
      // below already re-anchors to the fixtures, but the PERSISTED week_plans — which Today
      // and the MD engine read — stays on the old date until re-saved. Surface a one-click
      // re-anchor so the coach never has to hunt for the week and re-save manually.
      const wpGameDates = wpRows.filter((r) => r.day_type === "GAME").map((r) => r.day_date).sort();
      const fixtureGameDates = found.map((f) => f.match_date).sort();
      const anchorMatches =
        wpGameDates.length === fixtureGameDates.length && wpGameDates.every((d, i) => d === fixtureGameDates[i]);
      setStaleMatchAnchor(wpRows.length > 0 && !anchorMatches ? { was: wpGameDates[0] ?? null, now: fixtureGameDates[0] ?? null } : null);

      // Seed the per-day pitch stimulus: the coach's saved choice wins, else the Meso's
      // stimulus (parsed from week_plans.focus), else null. (Read from meso + editable.)
      const rawStimuli = (data as { day_stimuli?: unknown } | null)?.day_stimuli;
      const savedStimuli: (StimulusType | null)[] | null =
        Array.isArray(rawStimuli) && rawStimuli.length === 7
          ? (rawStimuli.map((v) => (v === "mechanical" || v === "locomotive" || v === "mixed" || v === "technical" ? v : null)) as (StimulusType | null)[])
          : null;
      setDayStimuli(
        Array.from({ length: 7 }, (_, i) => {
          const coachStim = savedStimuli?.[i] ?? null;
          const r = wpByDate.get(addDays(weekStart, i));
          const mesoStim = r ? stimulusFromFocus(r.focus) : null;
          // Same last-edit-wins rule as the day intents above.
          return mesoNewer ? (mesoStim ?? coachStim) : (coachStim ?? mesoStim);
        }),
      );

      // Seed the per-day field CHARACTER: the coach's saved choice wins (unless the Meso is newer),
      // else null so the render derives it from the day's (intent, stimulus). Lets Activation / Top-up
      // keep their character even when the coach also sets a strength focus.
      const rawChars = (data as { day_characters?: unknown } | null)?.day_characters;
      const validChar = (v: unknown): DayCharacter | null =>
        ALL_CHARACTER_VALUES.has(v as DayCharacter) ? (v as DayCharacter) : null;
      const savedChars: (DayCharacter | null)[] | null =
        Array.isArray(rawChars) && rawChars.length === 7 ? rawChars.map(validChar) : null;
      setDayCharacters(Array.from({ length: 7 }, (_, i) => (!mesoNewer && savedChars?.[i] ? savedChars[i] : null)));

      if (found.length > 0) {
        // ✅ FIXTURES ARE THE SOURCE for the match(es) + week type. The daily grid seeds from the
        // coach's own save, else the Meso block, else the fixture anchor.
        setWeekType(detectWeekType(found.length, isBasketball));
        setMatches(schedMatches);
        setScheduleNote(schedNote);
        const mds = found.map((f) => f.match_date);
        // Basketball anchors the grid to the game (GD), football to the MD taper.
        const anchored = isBasketball ? bbGameAnchoredIntents(weekStart, weekEndISO, mds) : matchAnchoredIntents(weekStart, weekEndISO, mds);
        setNoMatchIntents(chooseSeed(anchored ?? (isBasketball ? getDefaultBbIntents() : getDefaultNoMatchIntents())));
      } else {
        // ✅ NO FIXTURE THIS WEEK → NO MATCH. Daily grid: coach save → Meso block → default. In the
        // OFF-SEASON an empty week seeds a development build (reading the Macro phase), not the
        // in-season micro-dose default — so the Meso off-season context reaches Week Setup.
        setWeekType("NO_MATCH");
        setMatches(DEFAULT_MATCHES);
        setScheduleNote(null);
        const noMatchFallback = isBasketball
          ? getDefaultBbIntents()
          : (weekPhase === "offseason" ? getOffseasonDevIntents() : getDefaultNoMatchIntents());
        setNoMatchIntents(chooseSeed(noMatchFallback));
      }

      setLoading(false);
    }

    void loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStart, teamId, isBasketball, fixtureRev]);

  // Live-sync the week's fixtures with match_schedule (the single source of truth) — a match added on the
  // Meso calendar or the Fixtures page in another open tab shows up here without a reload.
  useMatchScheduleRealtime("week-setup", () => setFixtureRev((v) => v + 1), !!teamId);

  // Basketball: load the authored Custom Programme block titles for the shown week, so each weekday card
  // shows the real strength session (read-only). Finds the team block whose date range overlaps the week,
  // reads its records, maps weekday code → title. Soft — any failure just clears the titles.
  useEffect(() => {
    if (!isBasketball || !teamId) { setBbStrengthTitles(Array.from({ length: 7 }, () => null)); return; }
    let alive = true;
    (async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) return;
        const auth = { Authorization: `Bearer ${token}` };
        const sres = await fetch(`/api/coach/custom-templates?team_id=${encodeURIComponent(teamId)}`, { headers: auth });
        const sjson = await sres.json().catch(() => null);
        const sets = Array.isArray(sjson?.sets)
          ? (sjson.sets as Array<{ table_name: string; season_phase?: string | null; start_date?: string | null; end_date?: string | null }>)
          : [];
        // The block whose [start,end] overlaps the shown week (newest start wins on overlap).
        const cover = sets
          .filter((s) => !!s.start_date && !!s.end_date && s.start_date! <= weekEnd && weekStart <= s.end_date!)
          .sort((a, b) => (b.start_date! < a.start_date! ? -1 : 1))[0];
        if (!cover) { if (alive) setBbStrengthTitles(Array.from({ length: 7 }, () => null)); return; }
        const qs = new URLSearchParams({ table_name: cover.table_name });
        if (cover.season_phase) qs.set("season_phase", cover.season_phase);
        const rres = await fetch(`/api/coach/custom-templates?${qs.toString()}`, { headers: auth });
        const rjson = await rres.json().catch(() => null);
        const recs = Array.isArray(rjson?.records) ? (rjson.records as Array<{ md_day?: string; title?: string | null }>) : [];
        const byDay: Record<string, string> = {};
        for (const rec of recs) if (rec.md_day && rec.title) byDay[rec.md_day] = rec.title;
        const WD = ["MÁN", "ÞRI", "MIÐ", "FIM", "FÖS", "LAU", "SUN"];
        if (alive) setBbStrengthTitles(WD.map((code) => byDay[code] ?? null));
      } catch { if (alive) setBbStrengthTitles(Array.from({ length: 7 }, () => null)); }
    })();
    return () => { alive = false; };
  }, [isBasketball, teamId, weekStart, weekEnd]);

  // Week Setup opens on the CURRENT week (the week that contains today) — see the
  // weekStart initial state. We deliberately do NOT auto-jump to the next week that has
  // a fixture: a coach expects to land on this week and page forward to the match week
  // with the < > arrows themselves.

  // Macro season phases — fetched once per team; used to auto-fill the Season pill (below).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/coach/periodization`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const j = await res.json().catch(() => null);
        const phases = (j?.plan?.phases ?? []) as Array<{ key: string; start: string; end: string }>;
        if (alive && Array.isArray(phases)) setMacroPhases(phases.map((p) => ({ key: p.key, start: p.start, end: p.end })));
        const obs = (j?.savedWindow as { offseasonStart?: string | null } | undefined)?.offseasonStart;
        if (alive && obs) setOffBuildStart(obs);
      } catch { /* soft — Season pill just stays manual */ }
    })();
    return () => { alive = false; };
  }, [teamId]);

  // When Macro phases arrive (or the week changes) and the coach hasn't saved a Season for this week,
  // fill the pill from the Macro phase. Only fills a null value, so a manual pick is never overridden.
  useEffect(() => {
    if (savedSeasonPhase != null) return;
    setSeasonPhase((cur) => cur ?? macroPhaseForWeek(weekStart, macroPhases));
  }, [macroPhases, weekStart, savedSeasonPhase]);

  // Load declared team breaks for the grid lock.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/coach/team/breaks?team_id=${encodeURIComponent(teamId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (alive && json.ok) {
          setTeamBreaks(((json.breaks ?? []) as Array<{ start_date: string; end_date: string }>)
            .map((b) => ({ start_date: b.start_date, end_date: b.end_date })));
        }
      } catch { /* soft */ }
    })();
    return () => { alive = false; };
  }, [teamId]);

  // Load declared training camps for the grid markers.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/coach/team/camps?team_id=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (alive && json.ok) setTeamCamps((json.camps ?? []) as typeof teamCamps);
      } catch { /* soft */ }
    })();
    return () => { alive = false; };
  }, [teamId]);

  function setMatch(i: number, patch: Partial<MatchInput>) {
    if (patch.date && patch.date.trim()) {
      const matchMonday = isoMondayOfISO(patch.date.trim());
      if (matchMonday !== weekStart) setWeekStart(matchMonday);
    }
    setMatches((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError(isIS ? "Vantar team_id (coach er ekki tengdur liði)." : "Missing team_id (coach not linked to a team).");
      setSaving(false);
      return false;
    }

    const trimmed =
      weekType === "NO_MATCH"
        ? []
        : visibleMatches.map((m, idx) => ({
            match_id: (m.match_id || `M${idx + 1}`).trim(),
            date: (m.date || "").trim(),
            kickoff_time: (m.kickoff_time || "").trim() || undefined,
            home_away: (m.home_away || "H") as "H" | "A",
          }));

    // ✅ ALDREI null í no_match_intents (DB column er NOT NULL)
    // ✅ Vista alltaf, líka á match vikum (til að manual override virki í preseason)
    const baseIntents: NoMatchIntent[] =
      Array.isArray(noMatchIntents) && noMatchIntents.length === 7
        ? noMatchIntents
        : getDefaultNoMatchIntents();
    // Declared break days are always OFF — the break owns them, so we never
    // save a training day on a break day even if the picker had a stale value.
    const safeNoMatchIntents: NoMatchIntent[] = baseIntents.map((intent, i) =>
      isDateOnBreak(addDays(weekStart, i)) ? "OFF" : intent
    );
    // Pitch stimulus per day — only meaningful on training days (null on OFF / match / break).
    const safeDayStimuli: (StimulusType | null)[] = Array.from({ length: 7 }, (_, i) =>
      safeNoMatchIntents[i] === "OFF" || safeNoMatchIntents[i] === "GAME" ? null : (dayStimuli[i] ?? null)
    );
    // Field character per day (Meso vocabulary) — the independent primary axis. Fall back to the
    // derived character so a week saved before this axis existed still persists a sensible value.
    const safeDayCharacters: DayCharacter[] = Array.from({ length: 7 }, (_, i) =>
      isDateOnBreak(addDays(weekStart, i)) ? "OFF"
        : (dayCharacters[i] ?? (isBasketball ? characterFromDayBb(safeNoMatchIntents[i]) : characterFromDay(safeNoMatchIntents[i], safeDayStimuli[i])))
    );

    const { error } = await supabase.rpc("save_week_setup", {
      p_team_id: tid,
      p_week_start_date: weekStart,
      p_week_type: weekType,
      p_matches: trimmed, // jsonb
      p_no_match_intents: safeNoMatchIntents, // ✅ alltaf 7 stök
      p_season_phase: seasonPhase ?? null,
      p_day_stimuli: safeDayStimuli, // pitch stimulus axis (7 entries, null where N/A)
      p_day_characters: safeDayCharacters, // field-character axis (Meso vocabulary, 7 entries)
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return false;
    }

    // match_schedule is the SINGLE source of truth for matches — write each entered match back through
    // the shared fixture path so it registers everywhere (Meso calendar, Macro anchors, Fixtures list).
    // Non-clobbering: we send only date + venue + kickoff, so an existing opponent/competition is kept.
    // (Removing a match is done on the Meso calendar / Fixtures page, where the delete guardrail lives.)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        for (const m of trimmed) {
          if (!m.date) continue;
          await fetch("/api/coach/periodization", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ fixture: { op: "upsert", date: m.date, isHome: (m.home_away ?? "H") !== "A", kickoff: m.kickoff_time || undefined } }),
          });
        }
      }
    } catch { /* the week is already saved; fixture sync is best-effort and re-derives on next load */ }

    setOk(isIS ? "Vikan var vistuð ✅" : "Week saved ✅");
    setSaving(false);
    return true;
  }

  const autoMdDayEdits = useMemo(() => {
    const matchInWeek =
      weekType === "NO_MATCH"
        ? []
        : visibleMatches
            .map((m, idx) => ({
              idx,
              id: (m.match_id || `M${idx + 1}`).trim(),
              date: (m.date || "").trim(),
            }))
            .filter((m) => !!m.date)
            .filter((m) => m.date >= weekStart && m.date <= weekEnd)
            .sort((a, b) => a.date.localeCompare(b.date));

    if (weekType === "NO_MATCH" || matchInWeek.length === 0) return [];

    const matchDatesSet = new Set(matchInWeek.map((m) => m.date));

    function nextMatchDate(day_date: string) {
      return matchInWeek.find((m) => m.date > day_date)?.date ?? null;
    }

    function prevMatchDate(day_date: string) {
      for (let i = matchInWeek.length - 1; i >= 0; i--) {
        if (matchInWeek[i].date < day_date) return matchInWeek[i].date;
      }
      return null;
    }

    function postMatchFocus(mdPlus: number) {
      if (mdPlus === 1) return "MD+1 POST MATCH";
      return `MD+${mdPlus} RECOVERY`;
    }

    return Array.from({ length: 7 }).map((_, i) => {
      const day_index = i + 1;
      const day_date = addDays(weekStart, i);

      let day_type: DayType = day_index === 7 ? "OFF" : "TRAIN";
      let focus: string | null = day_type === "OFF" ? "OFF" : "TRAIN";
      let notes: string | null = null;

      if (matchDatesSet.has(day_date)) {
        day_type = "GAME";
        focus = "MD (GAME)";
        notes = "Match day (within week)";
        return { day_index, day_type, focus, notes };
      }

      const next = nextMatchDate(day_date);
      if (next) {
        const delta = diffDays(day_date, next);
        const mdMinus = Math.abs(delta);

        if (mdMinus >= 4)
          return {
            day_index,
            day_type: "TRAIN" as DayType,
            focus: preMatchMicrodoseFocus(mdMinus),
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 3)
          return {
            day_index,
            day_type: "TRAIN" as DayType,
            focus: "MD-3 NEURAL / VELOCITY",
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 2)
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: "MD-2 POLISH / CALM",
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 1)
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: "MD-1 ACTIVATION",
            notes: `Upcoming match: ${next}`,
          };
      }

      const prev = prevMatchDate(day_date);
      if (prev) {
        const deltaPlus = diffDays(day_date, prev);
        if (deltaPlus >= 1 && day_index !== 7) {
          // MD+2 defaults to a FULL OFF day (48 h post-match rest, aligning the micro with the
          // meso which already treats MD+2 as rest). The coach can change it to a session.
          const isMd2 = deltaPlus === 2;
          return {
            day_index,
            day_type: (isMd2 ? "OFF" : "RECOVERY") as DayType,
            focus: isMd2 ? "MD+2 OFF" : postMatchFocus(deltaPlus),
            notes: `Previous match: ${prev}`,
          };
        }
      }

      return { day_index, day_type, focus, notes };
    });
  }, [visibleMatches, weekStart, weekEnd, weekType]);

  const manualNoMatchDayEdits = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const day_index = i + 1;
      const intent = noMatchIntents[i] ?? "OFF";
      return {
        day_index,
        day_type: intentToDayType(intent),
        focus: intentToFocusLabel(intent),
        notes: "Manual week (coach)",
      };
    });
  }, [noMatchIntents]);

  const previewDays = useMemo(() => {
    // ✅ PRESEASON / manual override: alltaf manual preview
    if (isManualWeek) return manualNoMatchDayEdits;
    return autoMdDayEdits;
  }, [isManualWeek, manualNoMatchDayEdits, autoMdDayEdits]);

  // Live plan → Readiness Outlook: each grid day becomes a PlannedDay (date + MD offset +
  // the intent's planned session load). Recomputes as the coach edits, so the forecast
  // reflects the UNSAVED plan. Empty (e.g. NO_MATCH auto weeks) → panel uses the saved plan.
  const outlookPlannedDays = useMemo<PlannedDay[]>(() => {
    const mds = visibleMatches.map((m) => m.date).filter((d): d is string => !!d);
    return previewDays.map((d, i) => {
      const date = addDays(weekStart, i);
      const mdLabel = mdLabelForDay(weekStart, weekEnd, mds, i);
      const mdOffset = parseMdOffset(mdLabel) ?? mdOffsetForDate(date, mds);
      const plan = planSessionLoad({ mdDay: mdLabel, dayType: d.day_type, focus: d.focus });
      return { date, mdOffset, plannedLoad: plan.applicable ? plan.sessionLoad : 0, mdLabel: mdLabel ?? undefined };
    });
  }, [previewDays, weekStart, weekEnd, visibleMatches]);

  // Microcycle checks — evidence-informed periodization principles
  // (Buchheit et al. 2024, "The 11 Principles of Microcycle Periodization").
  // Each check reads the resolved 7-day previewDays array and flags a
  // planned week that drifts from the evidence. Decision-support, not a block.
  const microcycleChecks = useMemo<{ id: string; tone: "warn" | "info"; title: string; body: string }[]>(() => {
    const days = previewDays;
    const checks: { id: string; tone: "warn" | "info"; title: string; body: string }[] = [];
    const gameIdx: number[] = [];
    days.forEach((d, i) => { if (d.day_type === "GAME") gameIdx.push(i); });

    // A "hard" training day = acquisition-phase intensity (force / speed / neural).
    const isHardFocus = (focus: string | null | undefined) => {
      const f = String(focus ?? "").toUpperCase();
      return f.includes("FORCE") || f.includes("VELOCITY") || f.includes("NEURAL");
    };

    // 1. Rest day at MD+1 — Buchheit 2023: a day off at MD+2 is associated
    //    with a substantially lower non-contact injury rate (Principle 2).
    for (const g of gameIdx) {
      if (days[g + 1]?.day_type === "OFF" &&
          (days[g + 2]?.day_type === "TRAIN" || days[g + 2]?.day_type === "RECOVERY")) {
        checks.push({
          id: "rest-md2", tone: "warn",
          title: isIS ? "Hvíldardagur á MD+1" : "Rest day at MD+1",
          body: isIS
            ? "Frídagurinn er daginn eftir leik. Rannsóknir (Buchheit o.fl. 2023, 56 lið-tímabil) tengja frídag á MD+2 við marktækt lægri tíðni álagsmeiðsla — hópurinn mætir ferskari í fyrstu hörðu æfinguna. Íhugaðu að færa frídaginn á MD+2. (Regla 2)"
            : "The rest day is the day after the match. Research (Buchheit et al. 2023, 56 team-seasons) links a day off at MD+2 with a markedly lower overuse-injury rate — the squad turns up fresher to the first hard session. Consider moving the rest day to MD+2. (Principle 2)",
        });
        break;
      }
    }

    // 2. No day off at all — at least one rest day per week; injury risk
    //    rises beyond ~5-6 consecutive days on feet (Principle 1/2).
    if (!days.some((d) => d.day_type === "OFF")) {
      checks.push({
        id: "no-off", tone: "warn",
        title: isIS ? "Enginn frídagur í vikunni" : "No rest day this week",
        body: isIS
          ? "Vikan inniheldur engan frídag. Meiðslatíðni hækkar eftir 5-6 samfellda daga á fótum — rannsóknir mæla með a.m.k. einum frídegi í hverri viku. (Regla 1/2)"
          : "The week has no rest day. Injury rate rises after 5-6 consecutive days on feet — research recommends at least one rest day each week. (Principle 1/2)",
      });
    }

    // 3. Hard day in the taper — MD-2 and MD-1 should be light (Principle 8).
    for (const g of gameIdx) {
      const md1 = days[g - 1];
      const md2 = days[g - 2];
      const md1Hard = !!md1 && md1.day_type === "TRAIN" && isHardFocus(md1.focus);
      const md2Hard = !!md2 && md2.day_type === "TRAIN" && isHardFocus(md2.focus);
      if (md1Hard || md2Hard) {
        checks.push({
          id: "taper", tone: "warn",
          title: isIS ? "Þung æfing í niðurtröppun" : "Hard session in the taper",
          body: isIS
            ? `${md1Hard ? "MD-1" : "MD-2"} er ákefðar-/kraftæfing. Síðustu 1-2 dagar fyrir leik eiga að vera léttir (polish / activation) — þung vinna svo nálægt leik er tengd hærri meiðslaáhættu og lakari leikdags-ferskleika. (Regla 8)`
            : `${md1Hard ? "MD-1" : "MD-2"} is an intensity/power session. The last 1-2 days before a match should be light (polish / activation) — heavy work this close to a match is linked to higher injury risk and poorer match-day freshness. (Principle 8)`,
        });
        break;
      }
    }

    // 4. Heavy strength/eccentric late post-match — eccentric work belongs
    //    early in the microcycle (MD-4), not MD+3 (Principle 7).
    for (const g of gameIdx) {
      const md3 = days[g + 3];
      if (md3 && md3.day_type === "TRAIN" && String(md3.focus ?? "").toUpperCase().includes("FORCE")) {
        checks.push({
          id: "ecc-late", tone: "info",
          title: isIS ? "Styrktaráhersla seint eftir leik" : "Heavy strength late after a match",
          body: isIS
            ? "Þung kraft-/eccentric-vinna er sett á MD+3. Eccentric æfingar seint eftir leik gefa viðvarandi vöðvaskemmd (hækkað CK) og eymsli — best er að staðsetja þær snemma í vikunni (MD-4). (Regla 7)"
            : "Heavy strength / eccentric work is placed at MD+3. Eccentric sessions late after a match cause prolonged muscle damage (elevated CK) and soreness — best placed early in the week (MD-4). (Principle 7)",
        });
        break;
      }
    }

    return checks;
  }, [previewDays, isIS]);

  async function handleApplyPlan() {
    setApplying(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError(isIS ? "Vantar team_id. Sláðu inn Team ID (uuid)." : "Missing team_id. Enter the Team ID (uuid).");
      setApplying(false);
      return;
    }

    // ✅ Ef manual override er OFF og þetta er match vika → validate match dates
    if (!isManualWeek && weekType !== "NO_MATCH") {
      const m1 = (visibleMatches[0]?.date || "").trim();
      if (!m1) {
        setError("Veldu match date fyrir M1.");
        setApplying(false);
        return;
      }
      if (weekType === "TWO_MATCHES") {
        const m2 = (visibleMatches[1]?.date || "").trim();
        if (!m2) {
          setError("Veldu match date fyrir M2.");
          setApplying(false);
          return;
        }
      }
    }

    const saved = await handleSave();
    if (!saved) {
      setApplying(false);
      return;
    }

    const res = await fetch("/api/coach/week-setup/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: tid,
        week_start: weekStart,
        system_key: "MICRODOSING_PLAYBOOK",
        intensity_target: intensityTarget,
        notes: isManualWeek ? `Manual override ON · WeekType=${weekType}` : `Auto MD ON · WeekType=${weekType}`,
        days: previewDays,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload?.error || "Apply failed.");
      setApplying(false);
      return;
    }

    setOk(isIS ? "Vika var virkjuð ✅ Leikmenn fá nú réttan æfingadag sendan." : "Week activated ✅ Players now receive the right training day.");
    setApplying(false);
  }

  if (!isAtLeastPro) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <UpgradeWall
          requiredPlan="PRO"
          featureName={{ EN: "Week setup", IS: "Vikuuppsetning" }}
          description={{
            EN: "Set up the training week, assign match days, and configure session intent for each day.",
            IS: "Settu upp æfingavikuna, merktu leikdaga og stilltu álagsáherslu hvers dags.",
          }}
        />
      </div>
    );
  }

  // ── Single-page render helpers ──────────────────────────────────────────
  const monthsIS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  const monthsEN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const months = isIS ? monthsIS : monthsEN;
  const dS = new Date(weekStart + "T00:00:00");
  const dE = new Date(weekEnd + "T00:00:00");
  const weekLabel = dS.getMonth() === dE.getMonth()
    ? `${dS.getDate()}.–${dE.getDate()}. ${months[dE.getMonth()]} ${dE.getFullYear()}`
    : `${dS.getDate()}. ${months[dS.getMonth()]}–${dE.getDate()}. ${months[dE.getMonth()]} ${dE.getFullYear()}`;

  const archivo = { fontFamily: "var(--font-archivo)" } as const;
  const inWeekMatchDates = matchesInWeek(weekStart, weekEnd, visibleMatches.map((m) => m.date));
  const matchIdxForDate = (dateIso: string) => matches.findIndex((m) => (m.date || "").trim() === dateIso);

  const weekTypeLabel = weekType === "NO_MATCH" ? t.noMatch : weekType === "ONE_MATCH" ? t.oneMatch : weekType === "THREE_MATCHES" ? t.threeMatches : t.twoMatches;

  const intentLabelOf = (v: NoMatchIntent): string => {
    if (v === "OFF") return isIS ? "Frí" : "Off";
    return NO_MATCH_OPTIONS.find((o) => o.value === v)?.label ?? v;
  };

  const handleExportWeekPdf = async () => {
    const { downloadWeekSetupPdf } = await import("@/components/coach/WeekSetupPdf");
    const mdDates = visibleMatches.map((m) => m.date);
    const days = Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(weekStart, i);
      const dd = new Date(date + "T00:00:00");
      const dateStr = `${dd.getDate()}.${dd.getMonth() + 1}.`;
      const onBreak = isDateOnBreak(date);
      const mdLabel = mdLabelForDay(weekStart, weekEnd, mdDates, i);
      const isMatchDay = mdLabel === "MD";
      if (onBreak) return { weekday: weekdaysShort[i], date: dateStr, md: null, kind: "off" as const, stripe: "#1c7a4a" };
      if (isMatchDay) {
        const mIdx = matchIdxForDate(date);
        const opp = matchOpponents[date] || (isIS ? "Leikur" : "Match");
        const label = `${matches[mIdx]?.home_away === "A" ? "@" : "vs"} ${opp}`;
        return { weekday: weekdaysShort[i], date: dateStr, md: mdLabel, kind: "match" as const, matchLabel: label, stripe: "#a83e28" };
      }
      const intent = noMatchIntents[i] ?? "OFF";
      // Day-type colour band (mirrors the on-screen intent grouping): force/mechanical = purple,
      // velocity/speed = cobalt, activation/polish = amber, recovery = green, off = green.
      const stripe =
        intent === "FORCE" || intent === "FORCE_LIGHT" ? "#7a5cc4" :
        intent === "NEURAL_VELOCITY" || intent === "VELOCITY" ? "#2740e6" :
        intent === "POLISH_CALM" || intent === "ACTIVATION" ? "#de9328" :
        intent === "RECOVERY" || intent === "RECOVERY_MD1" || intent === "RECOVERY_MD2" || intent === "RECOVERY_PLUS" ? "#1c7a4a" :
        intent === "OFF" ? "#1c7a4a" : "#6b7280";
      // Pre-season dose for this day (if computed) — the two KPIs it loads most.
      let dose: { load: number | null; srpe: number | null; kpis: Array<{ label: string; value: number; unit: string }> } | null = null;
      if (seasonPhase === "preseason" && psInfo) {
        const d = psInfo.perDay[i];
        if (d?.training) {
          const week = psInfo.row.byKpi;
          const top = (Object.keys(d.byKpi) as WeeklyLoadMetricKey[])
            .filter((k) => week[k])
            .sort((a, b) => ((d.byKpi[b] ?? 0) / (week[b] || 1)) - ((d.byKpi[a] ?? 0) / (week[a] || 1)))
            .slice(0, 2)
            .map((k) => ({ label: isIS ? WEEKLY_LOAD_LABELS[k].is : WEEKLY_LOAD_LABELS[k].en, value: d.byKpi[k]!, unit: WEEKLY_LOAD_LABELS[k].unit }));
          dose = { load: d.loadTarget, srpe: d.srpeTarget, kpis: top };
        }
      }
      // Detailed coaching idea for the PDF (football): focus + colour-coded load band + est. duration +
      // sRPE + on-pitch examples — resolved to the current language so the PDF stays a plain string model.
      let idea: { focus: string; band: string | null; bandColor: string | null; durationMin: number | null; srpe: number | null; pitch: Array<{ text: string; cite: string }> } | null = null;
      if (!isBasketball) {
        const character = dayCharacters[i] ?? characterFromDay(intent, dayStimuli[i] ?? null);
        const io = dayIdea({ stimulus: characterToStimulus(character), character, mdDay: mdLabel, dayType: previewDays[i]?.day_type ?? "TRAIN", focus: previewDays[i]?.focus ?? null, phase: seasonPhase });
        idea = {
          focus: isIS ? io.focus.is : io.focus.en,
          band: io.load ? (isIS ? LOAD_BAND_META[io.load.band].label.is : LOAD_BAND_META[io.load.band].label.en) : null,
          bandColor: io.load ? LOAD_BAND_META[io.load.band].color : null,
          durationMin: io.load?.durationMin ?? null,
          srpe: io.load?.sessionLoad ?? null,
          pitch: io.pitch.map((p) => ({ text: `${isIS ? p.form.is : p.form.en} · ${isIS ? p.area.is : p.area.en} · ${isIS ? p.bout.is : p.bout.en}`, cite: p.cite })),
        };
      }
      return { weekday: weekdaysShort[i], date: dateStr, md: mdLabel, kind: "train" as const, intent: intentLabelOf(intent), dose, stripe, idea };
    });

    const phaseDef = SEASON_PHASES.find((p) => p.id === seasonPhase);
    const phaseLabel = phaseDef ? (isIS ? phaseDef.sublabel : phaseDef.label) : "—";
    const preseason = seasonPhase === "preseason" && psInfo ? {
      weekIndex: psInfo.weekIndex, preWeeks: psInfo.preWeeks,
      multiple: psInfo.row.multipleOfMatch, weeklyLoad: psInfo.row.weeklyLoadTarget, perSession: psInfo.row.perSessionLoad, srpe: psInfo.row.sRpeAuTarget,
      anchor: psInfo.row.anchor === "match_this_season" ? (isIS ? "leikir í ár" : "this season's matches") : psInfo.row.anchor === "srpe_only" ? (isIS ? "sRPE eingöngu" : "sRPE only") : psInfo.row.anchor === "match_last_season" ? (isIS ? "leikir í fyrra" : "last season's matches") : (isIS ? "stöðu-viðmið" : "positional norm"),
      confidence: psInfo.row.confidence === "high" ? (isIS ? "há" : "high") : psInfo.row.confidence === "moderate" ? (isIS ? "miðlungs" : "moderate") : (isIS ? "lítil" : "low"),
      tests: psInfo.tests.map((tt) => ({
        name: tt.name,
        kind: tt.kind === "baseline" ? (isIS ? "grunnmæling" : "baseline") : tt.kind === "end" ? (isIS ? "lokamæling" : "end re-test") : tt.kind === "weekly" ? (isIS ? "vikuleg" : "weekly") : (isIS ? "endurmæling" : "re-test"),
      })),
    } : null;

    await downloadWeekSetupPdf({ teamName: isIS ? "Vikuplan" : "Week plan", weekLabel, phaseLabel, weekTypeLabel, preseason, days }, isIS ? "IS" : "EN");
  };
  const phaseDot: Record<SeasonPhase, string> = { preseason: "#de9328", inseason: "#1c7a4a", playoffs: "#a83e28", offseason: "#9aa0a6" };
  const dayColor = (dt: DayType, onBreak: boolean) =>
    onBreak ? "#1c7a4a" : dt === "GAME" ? "#a83e28" : dt === "RECOVERY" ? "#1c7a4a" : dt === "OFF" ? "#9aa0a6" : "#2740e6";
  const provenanceText = inWeekMatchDates.map((d) => {
    const dd = new Date(d + "T00:00:00");
    const opp = matchOpponents[d];
    const idx = matchIdxForDate(d);
    const ha = matches[idx]?.home_away === "A" ? "A" : "H";
    return `${dd.getDate()}.${dd.getMonth() + 1}. — ${opp || (isIS ? "Leikur" : "Match")} (${ha})`;
  }).join(" · ");
  const busy = loading || saving || applying;

  // ── Per-day model: one place that resolves everything a day shows (card + detail panel) ──────────
  const devPhase = seasonPhase === "offseason" || seasonPhase === "preseason";
  const charOptions = isBasketball ? DAY_CHARACTER_OPTIONS_BB : devPhase ? DAY_CHARACTER_OPTIONS_DEV : DAY_CHARACTER_OPTIONS;
  const charLabelOf = (c: DayCharacter): string => {
    const o = charOptions.find((x) => x.value === c) ?? [...DAY_CHARACTER_OPTIONS, ...DAY_CHARACTER_OPTIONS_BB].find((x) => x.value === c);
    return o ? (isIS ? o.is : o.en) : c;
  };
  const strengthLabelOf = (v: NoMatchIntent) => NO_MATCH_OPTIONS.find((o) => o.value === v)?.label ?? v;
  const matchDatesList = visibleMatches.map((m) => m.date);
  const dayModel = (i: number) => {
    const date = addDays(weekStart, i);
    const dd = new Date(date + "T00:00:00");
    const onBreak = isDateOnBreak(date);
    const mdLabel = mdLabelForDay(weekStart, weekEnd, matchDatesList, i);
    const isMatchDay = mdLabel === "MD";
    const cycleLabel = mdLabel ? (isBasketball ? mdLabel.replace("MD", "GD") : mdLabel) : null;
    const dType = previewDays[i]?.day_type ?? "TRAIN";
    const mIdx = isMatchDay ? matchIdxForDate(date) : -1;
    const character: DayCharacter = dayCharacters[i] ?? (isBasketball
      ? characterFromDayBb(noMatchIntents[i] ?? "OFF")
      : characterFromDay(noMatchIntents[i] ?? "OFF", dayStimuli[i] ?? null));
    const training = isTrainingCharacter(character);
    const strengthValue: NoMatchIntent = isTrainingStrength(noMatchIntents[i] ?? "OFF") ? noMatchIntents[i]! : characterDefaultIntent(character);
    const idea = !isBasketball && !onBreak && !isMatchDay
      ? dayIdea({ stimulus: characterToStimulus(character), character, mdDay: mdLabel, dayType: dType, focus: previewDays[i]?.focus ?? null, phase: seasonPhase })
      : null;
    const tests = weekTests.filter((wt) => wt.test_date === date);
    const ps = seasonPhase === "preseason" && psInfo ? psInfo.perDay[i] ?? null : null;
    return {
      i, date, dd, onBreak, mdLabel, isMatchDay, cycleLabel, dType, mIdx, opp: matchOpponents[date] ?? null,
      character, training, strengthValue, idea, tests, ps: ps && ps.training ? ps : null,
      camp: !onBreak ? campForDay(date) : null, // a break day is a lock; a camp is a loading day

      sub: onBreak ? null
        : isMatchDay ? `${matches[mIdx]?.kickoff_time || ""}${matches[mIdx]?.kickoff_time ? " · " : ""}${matches[mIdx]?.home_away === "A" ? (isIS ? "Úti" : "Away") : (isIS ? "Heima" : "Home")}`
        : !training ? null
        : isBasketball ? (bbStrengthTitles[i] ?? (isIS ? "Engin styrkt.æfing" : "No strength session"))
        : `${isIS ? "Styrkur" : "Strength"}: ${strengthLabelOf(strengthValue).split(" / ")[0]}`,
    };
  };
  const days = Array.from({ length: 7 }, (_, i) => dayModel(i));
  const applyCharacter = (i: number, c: DayCharacter) => {
    setDayCharacters((prev) => { const n = [...prev]; n[i] = c; return n; });
    const stim = characterToStimulus(c);
    setDayStimuli((prev) => { const n = [...prev]; n[i] = stim; return n; });
    setNoMatchIntents((prev) => {
      const n = [...prev]; const cur = n[i];
      // On a training day keep an existing strength focus; otherwise set the default.
      n[i] = isTrainingCharacter(c) ? (isTrainingStrength(cur) ? cur : characterDefaultIntent(c)) : characterDefaultIntent(c);
      return n;
    });
    setOk(null);
  };
  const setStrength = (i: number, character: DayCharacter, v: NoMatchIntent) => {
    // Pin the current character first so changing the strength never re-derives (and flips) it.
    setDayCharacters((prev) => { if (prev[i]) return prev; const n = [...prev]; n[i] = character; return n; });
    setNoMatchIntents((prev) => { const n = [...prev]; n[i] = v; return n; });
    setOk(null);
  };
  const sel = days[Math.max(0, Math.min(6, selDay))];
  const bandStyle = (band: keyof typeof LOAD_BAND_META) => ({ background: `${LOAD_BAND_META[band].color}1f`, color: band === "high" ? "#7a5210" : band === "low" ? "#15603a" : "#1b2da8" });

  // Level 0 — one sentence for the whole week.
  const sessionDays = days.filter((d) => !d.onBreak && !d.isMatchDay && d.training).length;
  const heavy = days.filter((d) => d.idea?.load?.band === "high").map((d) => d.cycleLabel ?? weekdaysShort[d.i]);
  const verdict = `${weekTypeLabel} — ${sessionDays} ${isIS ? (sessionDays === 1 ? "æfingadagur" : "æfingadagar") : (sessionDays === 1 ? "training day" : "training days")}${heavy.length ? (isIS ? `, þyngst: ${heavy.join(" og ")}` : `, heaviest: ${heavy.join(" & ")}`) : ""}.`;
  const sp = spine ? spine(weekStart) : null;
  const phaseDef = SEASON_PHASES.find((p) => p.id === seasonPhase);
  const phaseChip = sp?.phase ? (isIS ? sp.phase.is : sp.phase.en) : phaseDef ? (isIS ? phaseDef.sublabel : phaseDef.label) : (isIS ? "Ekki sett" : "Not set");
  const weekTypeWhy = inWeekMatchDates.length > 0
    ? (isIS ? "Ræðst sjálfkrafa af fjölda leikja í Leikjadagatali — bættu við eða fjarlægðu leiki þar." : "Set automatically from the number of games in Fixtures — add or remove games there.")
    : seasonPhase === "offseason"
      ? (isIS ? "Off-season — engir leikir, þetta er uppbyggingarvika (styrkur + hraði), ekki leikja-örskammtur." : "Off-season — no games; this is a development build week (strength + power), not an in-season micro-dose.")
      : seasonPhase === "preseason"
        ? (isIS ? "Undirbúningstímabil — engir leikir, uppbyggingarvika fyrir tímabilið." : "Pre-season — no games; a build-up week before the season.")
        : (isIS ? "Engir leikir fundust í vikunni — vikan er handvirk uppbyggingarvika." : "No games found this week — the week is a manual build week.");
  const weekBreaks = teamBreaks.filter((b) => b.start_date <= weekEnd && b.end_date >= weekStart).length;
  const chip = "inline-flex min-h-9 items-center gap-2 rounded-full border border-[#e3e0d5] bg-[#faf9f4] px-3 text-[12px] text-[#14181c]";
  const card = "rounded-[14px] border border-[#e3e0d5] bg-white";

  return (
    <div className={embedded ? "w-full pb-4" : "mx-auto w-full max-w-[1160px] px-5 pb-28 pt-6 md:px-7"} style={{ color: "#14181c" }}>
      {/* Header — standalone page only (the hub has its own header + tabs) */}
      {!embedded && (
        <div className="mb-5">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight md:text-[28px]" style={archivo}>
            {isIS ? "Vikuuppsetning" : "Week setup"}
          </h1>
          <PagePurpose
            en="set up the training week and tag each day's match-day context"
            is="setja upp æfingavikuna og merkja leikdags-samhengi hvers dags"
            tutorial="week-setup"
          />
        </div>
      )}

      {/* Flow line — what this week reads from and where day edits flow. Same single-source note as the
          Periodization Hub tabs, so the macro→meso→micro propagation reads consistently here too. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-[#e3e0d7] bg-[#faf9f5] px-3 py-1.5 text-[11px] text-[#6b6f76]">
        <span className="font-mono text-[9px] uppercase tracking-wide text-[#9aa0a8]">{isIS ? "flæði" : "flow"}</span>
        <span><b className="font-semibold text-[#3a3f45]">{isIS ? "Lesið frá" : "Reads"}:</b> {isIS ? "Mesó (valin lota) · leikir" : "Meso (selected block) · fixtures"}</span>
        <span className="text-[#c9c4b8]">·</span>
        <span><b className="font-semibold text-[#2740e6]">{isIS ? "Breytingar hér →" : "Edits here →"}</b> {isIS ? "Today (leikmaður) · Mesó les til baka · PDF" : "Today (player) · Meso reads back · PDF"}</span>
      </div>

      {/* 1 — WEEK BAR: navigate + where this week sits (Macro phase · Meso block · week type) */}
      <section className={`${card} flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4`}>
        <div className="flex items-center gap-1 rounded-[10px] border border-[#dcd8cc] bg-white p-1">
          <button type="button" onClick={() => { setWeekStart(addDays(weekStart, -7)); setOk(null); setError(null); }} disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-[7px] text-[18px] text-[#3a3f45] transition-colors hover:bg-[#f4f2ec] disabled:opacity-40" aria-label={isIS ? "Fyrri vika" : "Previous week"}>‹</button>
          <div className="min-w-[190px] text-center">
            <div className="text-[16px] font-bold" style={archivo}>{weekLabel}</div>
            {weekStart === isoMondayOf(new Date()) && <div className="text-[11px] text-[#6b6f76]">{isIS ? "þessi vika" : "this week"}</div>}
          </div>
          <button type="button" onClick={() => { setWeekStart(addDays(weekStart, 7)); setOk(null); setError(null); }} disabled={busy}
            className="flex h-10 w-10 items-center justify-center rounded-[7px] text-[18px] text-[#3a3f45] transition-colors hover:bg-[#f4f2ec] disabled:opacity-40" aria-label={isIS ? "Næsta vika" : "Next week"}>›</button>
        </div>
        <div className="flex min-w-0 flex-[1_1_380px] flex-wrap gap-2">
          <button type="button" onClick={() => (onOpenTab && sp?.phase ? onOpenTab("season") : setPhaseEdit((v) => !v))} className={`${chip} hover:bg-white`}
            title={sp?.phase ? (isIS ? "Úr Makró-lotunni — opna" : "From the Macro cycle — open") : (isIS ? "Breyta fasa vikunnar" : "Change the week's phase")}>
            <span className="text-[#6b6f76]">{isIS ? "Makró" : "Macro"}</span><b>{phaseChip}</b>
          </button>
          {sp?.block && (
            <button type="button" onClick={() => onOpenTab?.("plan")} className={`${chip} hover:bg-white`} title={isIS ? "Úr Mesó-lotunni — opna" : "From the Meso cycle — open"}>
              <span className="text-[#6b6f76]">{isIS ? "Mesó" : "Meso"}</span>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: sp.block.color }} />
              <b>{isIS ? sp.block.label.is : sp.block.label.en} · {isIS ? `vika ${sp.block.week} af ${sp.block.of}` : `week ${sp.block.week} of ${sp.block.of}`}</b>
              {sp.block.deload && <span className="font-semibold text-[#7a5210]">{isIS ? "niðurtröppun" : "deload"}</span>}
            </button>
          )}
          <span className={chip} title={weekTypeWhy}>
            <span className="text-[#6b6f76]">{isIS ? "Vikugerð" : "Week type"}</span><b>{weekTypeLabel}</b>
            {inWeekMatchDates.length > 0 && <span className="text-[#6b6f76]">{isIS ? "úr" : "from"} <a href="/coach/fixtures" className="text-[#2740e6] hover:underline">{isIS ? "Leikjadagatali" : "Fixtures"}</a></span>}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {rulesSlot && (
            <button type="button" onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen}
              className={`h-10 rounded-[10px] border px-3.5 text-[13px] font-semibold ${rulesOpen ? "border-[#14181c] bg-[#14181c] text-white" : "border-[#dcd8cc] bg-white text-[#14181c] hover:bg-[#faf9f4]"}`}>
              {isIS ? "Þjálfunarreglur" : "Coaching rules"}
            </button>
          )}
          <Link href="/coach/library?tab=drills" className="inline-flex h-10 items-center rounded-[10px] border border-[#2740e6] bg-white px-3.5 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5"
            title={isIS ? "Build Session les vikuskipulagið og stingur upp á session-týpu + drillum fyrir hvern dag." : "Build Session reads the week and suggests each day's type + drills."}>
            Build Session →
          </Link>
        </div>
        {inWeekMatchDates.length > 0 && (
          <p className="w-full text-[12px] text-[#6b6f76]" title={scheduleNote ?? undefined}>{isIS ? "Leikir úr Leikjadagatali" : "Matches from Fixtures"}: <span className="font-medium text-[#14181c]">{provenanceText}</span></p>
        )}
        {(phaseEdit || (!sp?.phase && seasonPhase == null)) && (
          <div className="w-full border-t border-[#eeece3] pt-3">
            <div className="text-[12px] font-semibold text-[#3a3f45]">{isIS ? "Fasi vikunnar" : "Week phase"}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SEASON_PHASES.map((phase) => {
                const active = seasonPhase === phase.id;
                return (
                  <button key={phase.id} type="button" disabled={busy} onClick={() => setSeasonPhase((p) => (p === phase.id ? null : phase.id))}
                    className={`flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[12px] font-medium transition-colors disabled:opacity-50 ${active ? "border-[#14181c] bg-[#14181c] text-white" : "border-[#e3e0d5] bg-white text-[#14181c] hover:bg-[#faf9f4]"}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: phaseDot[phase.id] }} />
                    {isIS ? phase.sublabel : phase.label}
                  </button>
                );
              })}
            </div>
            {seasonPhase == null ? (
              <Link href="/coach/periodization-hub" className="mt-2 inline-block text-[12px] text-[#4a3a7a] hover:underline">
                {isIS ? "Settu upphaf/lok undirbúnings í Tímabilsskipulagi til að þekkja pre-season vikur (byrjunar-álag + mælingar) →" : "Set the pre-season start/end in the Periodization hub so pre-season weeks are recognised (starting load + testing) →"}
              </Link>
            ) : savedSeasonPhase == null ? (
              <p className="mt-1.5 text-[12px] text-[#6b6f76]">{isIS ? "Sjálfvalið út frá tímabils-kortinu — smelltu til að breyta." : "Auto-set from the season map — click to override."}</p>
            ) : null}
          </div>
        )}
      </section>
      {rulesOpen && rulesSlot && <div className="mt-3">{rulesSlot}</div>}

      {/* OK / error banner */}
      {error && (
        <div className="mt-4 rounded-[12px] border px-4 py-2.5 text-[13px] font-medium" style={{ borderColor: "rgba(168,62,40,0.35)", background: "rgba(168,62,40,0.08)", color: "#a83e28" }}>
          {t.error}: {error}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-[12px] border px-4 py-2.5 text-[13px] font-medium" style={{ borderColor: "rgba(28,122,74,0.35)", background: "rgba(28,122,74,0.08)", color: "#1c7a4a" }}>
          {ok}
        </div>
      )}

      {/* Stale match anchor — a fixture moved since this week was saved. One click
          re-anchors (re-saves the already fixture-anchored grid) so the persisted
          week_plans Today/meso read matches the new match day. */}
      {staleMatchAnchor && (
        <div className="mt-4 rounded-[12px] border px-4 py-3 text-[13px]" style={{ borderColor: "rgba(222,147,40,0.4)", background: "rgba(222,147,40,0.08)", color: "#7a5210" }}>
          <div className="font-semibold">{t.staleTitle}</div>
          <p className="mt-1 leading-relaxed text-[#3a3f45]">{t.staleBody}</p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { const okSaved = await handleSave(); if (okSaved) setStaleMatchAnchor(null); }}
            className="mt-2 inline-flex h-9 items-center rounded-[8px] bg-[#2740e6] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#1f33c0] disabled:opacity-50"
          >
            {t.staleBtn}
          </button>
        </div>
      )}

      {/* Missing team id (edge) */}
      {(!teamId || teamId.trim().length === 0) && (
        <div className="mt-4 grid gap-2 rounded-[14px] border border-[#e3e0d5] bg-white p-4">
          <Label>Team ID (uuid)</Label>
          <Input placeholder="Paste team_id (uuid) here" value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value)} />
          <p className="text-xs text-[#6b6f76]">{t.teamIdHint}</p>
        </div>
      )}

      {/* 2 — VERDICT + the intensity lever */}
      <section className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="m-0 min-w-0 flex-[1_1_480px] text-[17px] font-bold" style={archivo}>
          {verdict}{" "}
          {microcycleChecks.length > 0
            ? <span className="text-[#9a6a14]">{microcycleChecks.length} {isIS ? (microcycleChecks.length === 1 ? "athugasemd" : "athugasemdir") : (microcycleChecks.length === 1 ? "note" : "notes")} {isIS ? "í vikuyfirferð." : "in the week review."}</span>
            : <span className="text-[#1c7a4a]">{isIS ? "Vikuyfirferð í lagi." : "Week review: OK."}</span>}
        </p>
        <div className={`${card} flex items-center gap-3 px-4 py-2`}>
          <label htmlFor="ws-intensity" className="text-[12px] font-semibold text-[#3a3f45]">{isIS ? "Álagsmarkmið" : "Intensity target"}</label>
          <input id="ws-intensity" type="range" min={1} max={10} step={1} value={intensityTarget} onChange={(e) => setIntensityTarget(Number(e.target.value))}
            className="w-[140px]" style={{ accentColor: "#2740e6" }} title={t.intensityHint} />
          <span className="min-w-6 text-right text-[22px] font-bold tabular-nums" style={archivo}>{intensityTarget}</span>
        </div>
      </section>

      {/* 3 — THE WEEK GRID: compact cards (what you decide); click a day to open it below */}
      <section className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold" style={archivo}>{isIS ? "Vikan — dagleg áhersla" : "The week — daily focus"}</h2>
            <div className="mt-0.5 text-[12px] text-[#6b6f76]">{isBasketball
              ? (isIS ? "Æfingarnar eru sjálfgefnar út frá leiknum (GD) — smelltu á dag til að sjá og breyta honum." : "Sessions are seeded from the game (GD) — click a day to view and change it.")
              : (isIS ? "MD-röðunin er sjálfgefin út frá leiknum — smelltu á dag til að sjá og breyta honum." : "The MD ordering is seeded from the match — click a day to view and change it.")}</div>
          </div>
          <div className="flex gap-2">
            {inWeekMatchDates.length > 0 && (
              <button type="button" disabled={busy}
                onClick={() => { const mds = visibleMatches.map((m) => m.date); const a = isBasketball ? bbGameAnchoredIntents(weekStart, weekEnd, mds) : matchAnchoredIntents(weekStart, weekEnd, mds); if (a) { setNoMatchIntents(a); setOk(null); } }}
                className="h-9 rounded-[9px] border border-[#dcd8cc] bg-white px-3.5 text-[12px] font-semibold transition-colors hover:bg-[#faf9f4] disabled:opacity-50">
                {isBasketball ? (isIS ? "Fylla frá leik (GD)" : "Fill from game (GD)") : (isIS ? "Fylla frá leik (MD)" : "Fill from match (MD)")}
              </button>
            )}
            <button type="button" disabled={busy}
              onClick={() => { setNoMatchIntents(isBasketball ? getDefaultBbIntents() : getDefaultNoMatchIntents()); setOk(null); }}
              className="h-9 rounded-[9px] border border-[#dcd8cc] bg-white px-3.5 text-[12px] font-semibold transition-colors hover:bg-[#faf9f4] disabled:opacity-50">
              {isIS ? "Endurstilla" : "Reset"}
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto pb-1">
          <div className="grid min-w-[900px] grid-cols-7 gap-2.5">
            {days.map((d) => {
              const on = selDay === d.i;
              // Off-season / pre-season (development) weeks read as a different kind of week at a glance.
              const bg = seasonPhase === "offseason" ? "#f3f5f8" : seasonPhase === "preseason" ? "#f8f6fc" : "#ffffff";
              return (
                <button key={d.date} type="button" onClick={() => setSelDay(d.i)} aria-pressed={on}
                  className={`flex flex-col overflow-hidden rounded-[12px] text-left transition-shadow ${on ? "border-2 border-[#2740e6] shadow-[0_0_0_3px_rgba(39,64,230,0.12)]" : "border border-[#e3e0d5] hover:border-[#c9c5b8]"}`}
                  style={{ background: bg }}>
                  <span className="h-1 w-full" style={{ background: dayColor(d.dType, d.onBreak) }} />
                  <span className="flex w-full flex-1 flex-col gap-1.5 px-3 pb-3 pt-2.5">
                    <span className="flex items-start justify-between gap-1">
                      <span>
                        <span className="block text-[14px] font-bold" style={archivo}>{weekdaysShort[d.i]}</span>
                        <span className="block text-[12px] text-[#6b6f76]">{d.dd.getDate()}.{d.dd.getMonth() + 1}.</span>
                      </span>
                      {d.cycleLabel && !d.onBreak ? (
                        <span className="rounded-[6px] px-1.5 py-0.5 text-[12px] font-bold" style={d.isMatchDay ? { background: "rgba(168,62,40,0.12)", color: "#a83e28", ...archivo } : { background: "#f0eee6", color: "#3a3f45", ...archivo }}>{d.cycleLabel}</span>
                      ) : !d.onBreak && devPhase ? (
                        <span className="whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold" style={seasonPhase === "offseason" ? { background: "rgba(148,163,184,0.2)", color: "#4b5563", ...archivo } : { background: "rgba(122,92,196,0.12)", color: "#55389e", ...archivo }}>
                          {seasonPhase === "offseason" ? "Off-season" : (isIS ? "Undirb." : "Pre-season")}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[15px] font-bold leading-tight" style={{ color: d.onBreak ? "#15603a" : d.isMatchDay ? "#a83e28" : "#14181c" }}>
                      {d.onBreak ? (isIS ? "Frí" : "Off") : d.isMatchDay ? `${matches[d.mIdx]?.home_away === "A" ? "@" : "vs"} ${d.opp || (isIS ? "Leikur" : "Match")}` : charLabelOf(d.character)}
                    </span>
                    <span className="min-h-[18px] text-[12px] leading-snug text-[#3a3f45]">
                      {d.onBreak ? (isHolidayDay(d.date) ? (isIS ? "Undirbúningshlé — læst" : "Off-season break — locked") : (isIS ? "Frí liðsins — læst" : "Team break — locked")) : d.sub}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-1.5 pt-1">
                      {d.camp && <span className="inline-flex items-center gap-1 rounded-full bg-[#de9328]/15 px-2 py-0.5 text-[11px] font-bold text-[#7a5210]" title={`${isIS ? "Æfingaferð" : "Training camp"}${d.camp.label ? ` · ${d.camp.label}` : ""} · +${d.camp.load_pct}%${d.camp.two_a_day ? (isIS ? " · tvíæfingar" : " · two-a-days") : ""}`}>✈ +{d.camp.load_pct}%{d.camp.two_a_day ? (isIS ? " 2æf" : " 2×") : ""}</span>}
                      {d.idea?.load && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={bandStyle(d.idea.load.band)}>{isIS ? LOAD_BAND_META[d.idea.load.band].label.is : LOAD_BAND_META[d.idea.load.band].label.en}</span>}
                      {d.ps?.loadTarget != null && <span className="rounded-full bg-[#7a5cc4]/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#55389e]">{d.ps.loadTarget} PL</span>}
                      {d.tests.map((wt) => (
                        <span key={wt.id} className="inline-flex items-center gap-1 rounded-full bg-[#1c7a4a]/10 px-2 py-0.5 text-[11px] font-bold text-[#15603a]" title={isIS ? "Áætlað á Periodization Hub (Próf)" : "Scheduled on the Periodization Hub (Testing)"}>
                          <span className="h-1.5 w-1.5 rotate-45 bg-[#1c7a4a]" />{isIS ? TEST_SHORT[wt.test_key].is : TEST_SHORT[wt.test_key].en}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4 — THE SELECTED DAY: edit it + the coaching idea, at a readable size */}
      {sel && (
        <section className={`${card} mt-3 flex flex-wrap gap-x-8 gap-y-5 px-5 py-5`} aria-label={isIS ? "Valinn dagur" : "Selected day"}>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
            <div>
              <div className="text-[12px] font-semibold text-[#6b6f76]">{isIS ? "Valinn dagur" : "Selected day"}</div>
              <h3 className="mt-0.5 text-[20px] font-bold" style={archivo}>{weekdaysShort[sel.i]} {sel.dd.getDate()}.{sel.dd.getMonth() + 1}.{sel.cycleLabel && !sel.onBreak ? ` · ${sel.cycleLabel}` : ""}</h3>
            </div>
            {sel.onBreak ? (
              <div className="rounded-[10px] border border-dashed px-3 py-3 text-[13px]" style={{ borderColor: "rgba(28,122,74,0.4)", background: "rgba(28,122,74,0.06)", color: "#15603a" }}>
                <b>{isIS ? "FRÍ" : "OFF"}</b> — {isHolidayDay(sel.date) ? (isIS ? "Undirbúningshlé-frí — læst" : "Off-season break — locked") : (isIS ? "Skráð frí liðsins — læst" : "Team break — locked")}
              </div>
            ) : sel.isMatchDay ? (
              <div className="rounded-[10px] border px-3.5 py-3" style={{ borderColor: "rgba(168,62,40,0.35)", background: "rgba(168,62,40,0.06)" }}>
                <div className="text-[15px] font-bold text-[#a83e28]" style={archivo}>{matches[sel.mIdx]?.home_away === "A" ? "@" : "vs"} {sel.opp || (isIS ? "Leikur" : "Match")}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="flex flex-col gap-1 text-[12px] font-semibold">{isIS ? "Upphafstími" : "Kick-off"}
                    <input value={matches[sel.mIdx]?.kickoff_time ?? ""} placeholder="19:15" disabled={sel.mIdx < 0}
                      onChange={(e) => setMatch(sel.mIdx, { kickoff_time: e.target.value })}
                      className="h-10 w-[96px] rounded-[8px] border border-[#e3e0d5] bg-white px-2 text-[13px] font-normal disabled:opacity-50" />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] font-semibold">{isIS ? "Heima / Úti" : "Home / Away"}
                    <select value={matches[sel.mIdx]?.home_away ?? "H"} disabled={sel.mIdx < 0}
                      onChange={(e) => setMatch(sel.mIdx, { home_away: e.target.value as "H" | "A" })}
                      className="h-10 rounded-[8px] border border-[#e3e0d5] bg-white px-2 text-[13px] font-normal disabled:opacity-50">
                      <option value="H">{isIS ? "Heima" : "Home"}</option>
                      <option value="A">{isIS ? "Úti" : "Away"}</option>
                    </select>
                  </label>
                </div>
                <p className="mt-1.5 text-[12px] text-[#6b6f76]">{isIS ? "Úr Leikjadagatali — leikdagar eru læstir hér." : "From Fixtures — match days are locked here."}</p>
                {matchInOffHoliday(sel.date) && (
                  <p className="mt-2 rounded-[8px] border border-[#de9328]/40 bg-[#de9328]/10 px-2.5 py-1.5 text-[12px] leading-snug text-[#7a5210]">
                    {isIS ? "Leikur á off-season glugga — haldið sem leik. Viltu að off-season byrji daginn eftir?" : "Match inside the off-season window — kept as a match. Set off-season to start the day after?"}
                  </p>
                )}
              </div>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#3a3f45]">
                  {isBasketball ? (isIS ? "Æfingagerð" : "Session type") : (isIS ? "Dagsgerð (sami orðaforði og í Mesó)" : "Day character (same as the Meso)")}
                  <select value={sel.character} onChange={(e) => applyCharacter(sel.i, e.target.value as DayCharacter)}
                    className="h-10 rounded-[9px] border border-[#dcd8cc] bg-white px-2.5 text-[14px] font-semibold text-[#14181c]">
                    {charOptions.map((opt) => <option key={opt.value} value={opt.value}>{isIS ? opt.is : opt.en}</option>)}
                  </select>
                </label>
                {sel.training && (isBasketball ? (
                  <div className="rounded-[9px] border border-[#2740e6]/20 bg-[#2740e6]/5 px-3 py-2 text-[13px] font-medium text-[#1b2da8]" title={isIS ? "Úr virku æfingakerfi (Custom Programme)" : "From the active Custom Programme"}>
                    {bbStrengthTitles[sel.i] ?? (isIS ? "Engin styrktaræfing í kerfinu fyrir þennan vikudag" : "No strength day in the programme for this weekday")}
                  </div>
                ) : (
                  <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#3a3f45]">
                    {isIS ? "Styrktaráhersla (skammtur leikmanns)" : "Strength focus (per-player dose)"}
                    <select value={sel.strengthValue} onChange={(e) => setStrength(sel.i, sel.character, e.target.value as NoMatchIntent)}
                      className="h-10 rounded-[9px] border border-[#dcd8cc] bg-white px-2.5 text-[14px] text-[#14181c]">
                      {STRENGTH_FOCUS_OPTIONS.map((v) => <option key={v} value={v}>{NO_MATCH_OPTIONS.find((o) => o.value === v)?.label ?? v}</option>)}
                    </select>
                  </label>
                ))}
              </>
            )}
            {sel.tests.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[#3a3f45]">
                <span className="font-semibold">{isIS ? "Próf" : "Tests"}:</span>
                {sel.tests.map((wt) => <span key={wt.id} className="rounded-full bg-[#1c7a4a]/10 px-2 py-0.5 font-semibold text-[#15603a]">{isIS ? TEST_SHORT[wt.test_key].is : TEST_SHORT[wt.test_key].en}</span>)}
                <span className="text-[#6b6f76]">· {isIS ? "skráð á Periodization Hub" : "scheduled on the Periodization Hub"}</span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-[2_1_440px] flex-col gap-3">
            {sel.idea ? (<>
              <div className="text-[12px] font-semibold text-[#6b6f76]">{isIS ? "Hugmynd dagsins" : "Day idea"}</div>
              <p className="m-0 text-[14px] text-[#14181c]">{isIS ? sel.idea.focus.is : sel.idea.focus.en}</p>
              {sel.idea.load && (
                <div className="flex flex-wrap gap-6">
                  <div><div className="text-[12px] text-[#6b6f76]">{isIS ? "Áætlað álag" : "Planned load"}</div><span className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={bandStyle(sel.idea.load.band)}>{isIS ? LOAD_BAND_META[sel.idea.load.band].label.is : LOAD_BAND_META[sel.idea.load.band].label.en}</span></div>
                  <div><div className="text-[12px] text-[#6b6f76]">{isIS ? "Lengd" : "Duration"}</div><div className="text-[18px] font-bold tabular-nums" style={archivo}>~{sel.idea.load.durationMin} {isIS ? "mín" : "min"}</div></div>
                  <div title={isIS ? "Áætluð ákefð sem leikmenn myndu gefa (Borg CR-10) — sRPE = þessi tala × mínútur" : "Expected session-RPE the players would rate (Borg CR-10) — sRPE = this × minutes"}><div className="text-[12px] text-[#6b6f76]">{isIS ? "Áætlað RPE (1–10)" : "Est. RPE (1–10)"}</div><div className="text-[18px] font-bold tabular-nums" style={archivo}>{rpeRange(sel.idea.load.rpe)}</div></div>
                  <div title={isIS ? "Áætlað álag — sRPE (ákefð × mín)" : "Planned load — sRPE (RPE × min)"}><div className="text-[12px] text-[#6b6f76]">sRPE</div><div className="text-[18px] font-bold tabular-nums" style={archivo}>{sel.idea.load.sessionLoad} AU</div></div>
                </div>
              )}
              {sel.idea.pitch.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-[#6b6f76]">{isIS ? "Á vellinum" : "On the pitch"}</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
                    {sel.idea.pitch.map((p, pi) => (
                      <li key={pi} title={p.cite ? `${isIS ? p.area.is : p.area.en} — ${p.cite}` : undefined}><b>{isIS ? p.form.is : p.form.en}</b> · {isIS ? p.bout.is : p.bout.en}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>) : (
              <p className="m-0 self-center text-[13px] text-[#6b6f76]">
                {sel.onBreak ? (isIS ? "Engin æfing send á frídegi." : "No session is sent on a break day.")
                  : sel.isMatchDay ? (isIS ? "Leikdagur — leikkrafan sjálf er viðmiðið (100%)." : "Match day — the match demand itself is the reference (100%).")
                  : isBasketball ? (isIS ? "Æfingin og styrktaræfingin koma úr æfingakerfi liðsins." : "The session and the strength work come from the team's programme.")
                  : (isIS ? "Engin hugmynd fyrir þennan dag." : "No idea for this day.")}
              </p>
            )}
            {sel.ps && psInfo && (() => {
              const week = psInfo.row.byKpi;
              const top = (Object.keys(sel.ps.byKpi) as WeeklyLoadMetricKey[])
                .filter((k) => week[k])
                .sort((a, b) => ((sel.ps!.byKpi[b] ?? 0) / (week[b] || 1)) - ((sel.ps!.byKpi[a] ?? 0) / (week[a] || 1)))
                .slice(0, 2);
              return (
                <div className="rounded-[10px] px-3 py-2" style={{ background: "rgba(122,92,196,0.07)", border: "1px solid rgba(122,92,196,0.2)" }}>
                  <div className="text-[12px] font-semibold text-[#55389e]">{isIS ? "Undirbúningsskammtur dagsins" : "Pre-season dose for the day"}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 text-[13px]">
                    {sel.ps.loadTarget != null && <span><b className="tabular-nums">{sel.ps.loadTarget}</b> PL</span>}
                    {sel.ps.srpeTarget != null && <span><b className="tabular-nums">{sel.ps.srpeTarget}</b> AU</span>}
                    {top.map((k) => <span key={k}>{isIS ? WEEKLY_LOAD_LABELS[k].is : WEEKLY_LOAD_LABELS[k].en} <b className="tabular-nums">{sel.ps!.byKpi[k]}{WEEKLY_LOAD_LABELS[k].unit}</b></span>)}
                  </div>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* Pre-season starting load — ties this week's day plan to the controlled re-entry / ramp. */}
      {teamId && seasonPhase === "preseason" && (
        <div className="mt-5">
          <PreseasonStartWeekCard teamId={teamId} weekStart={weekStart} intents={noMatchIntents} onComputed={onPsComputed} />
        </div>
      )}

      {/* 5 — INSIGHTS: week review first, then the forecast (+ basketball week shape) stacked under it —
          side by side the long forecast left a tall empty gap under the short review. */}
      <div className="mt-5 flex flex-col gap-4">
        <section className={`${card} min-w-0 p-4 md:px-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold" style={archivo}>{t.microTitle}</h2>
            {microcycleChecks.length === 0 ? (
              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: "rgba(28,122,74,0.1)", color: "#15603a" }}>{t.microOk}</span>
            ) : (
              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: "rgba(222,147,40,0.14)", color: "#7a5210" }}>{microcycleChecks.length} {t.microNote}</span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#6b6f76]">{t.microDesc}</p>
          {microcycleChecks.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#15603a]">{t.microNone}</p>
          ) : (
            <div className="mt-2 grid gap-2">
              {microcycleChecks.map((c) => (
                <div key={c.id} className="rounded-[10px] border px-3 py-2.5"
                  style={c.tone === "warn" ? { borderColor: "rgba(222,147,40,0.45)", background: "rgba(222,147,40,0.08)", color: "#7a5210" } : { borderColor: "rgba(39,64,230,0.3)", background: "rgba(39,64,230,0.05)", color: "#1c2a80" }}>
                  <div className="text-[13px] font-semibold">{c.title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-4">
          {/* Forward-looking Readiness Outlook — a labelled model forecast of the planned week, distinct
              from today's readiness colour. */}
          {teamId && (
            <ReadinessOutlookPanel teamId={teamId} asOf={addDays(weekStart, -1)}
              plannedDays={outlookPlannedDays.length ? outlookPlannedDays : undefined} />
          )}
          {(() => {
            const shape = expectedWeekShape(sport, weekType);
            if (!shape) return null;
            return (
              <div className="rounded-[14px] border bg-white p-4" style={{ borderColor: "rgba(122,92,196,0.4)" }}>
                <div className="text-[12px] font-semibold" style={{ color: "#55389e" }}>{isIS ? "Vikulögun — Karfa" : "Week shape — Basketball"}</div>
                <div className="mt-1 text-[14px] font-semibold" style={archivo}>{isIS ? shape.headline.is : shape.headline.en}</div>
                <div className="mt-0.5 text-[13px] text-[#3a3f45]">{isIS ? shape.detail.is : shape.detail.en}</div>
                <div className="mt-1 text-[11px] text-[#55389e]">{shape.citation}</div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Team breaks — folded; days inside a break lock as OFF */}
      <details className={`${card} mt-4 px-5 py-3`}>
        <summary className="cursor-pointer py-1 text-[15px] font-bold" style={archivo}>
          {isIS ? "Frídagar liðsins" : "Team breaks"}{" "}
          <span className="text-[12px] font-medium text-[#6b6f76]" style={{ fontFamily: "inherit" }}>· {weekBreaks === 0 ? (isIS ? "engir í þessari viku" : "none this week") : (isIS ? `${weekBreaks} í þessari viku` : `${weekBreaks} this week`)}</span>
        </summary>
        <p className="mt-1 text-[12px] text-[#6b6f76]">{isIS ? "Dagar innan skráðs frís læsast sem FRÍ í vikunni — engin æfing send, áminningar í pásu." : "Days inside a declared break lock as OFF for the week — no session is sent, reminders pause."}</p>
        <div className="mt-3">
          <TeamBreaksManager teamId={teamId} />
        </div>
      </details>

      {/* 6 — STICKY ACTION BAR */}
      <div className={`sticky bottom-0 left-0 right-0 z-20 mt-6 border-t border-[#e3e0d5] py-3 ${embedded ? "px-1" : "-mx-5 px-5 md:-mx-7 md:px-7"}`} style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(6px)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-[#3a3f45]"><b>{weekLabel}</b> · {weekType === "NO_MATCH" && seasonPhase === "offseason" ? "Off-season" : weekType === "NO_MATCH" && seasonPhase === "preseason" ? (isIS ? "Undirbúningur" : "Pre-season") : weekTypeLabel}{sp?.block ? ` · ${isIS ? sp.block.label.is : sp.block.label.en} V${sp.block.week}` : ""}</div>
          <div className="flex flex-wrap gap-2">
            {weekType === "NO_MATCH" && teamId && <OffWeekProgramButton teamId={teamId} />}
            <button type="button" onClick={() => void handleExportWeekPdf()}
              className="h-10 rounded-[10px] border border-[#dcd8cc] bg-white px-4 text-[13px] font-semibold transition-colors hover:bg-[#faf9f4]">
              {isIS ? "Vikuplan (PDF)" : "Week plan (PDF)"}
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={busy}
              className="h-10 rounded-[10px] border border-[#dcd8cc] bg-white px-4 text-[13px] font-semibold transition-colors hover:bg-[#faf9f4] disabled:opacity-50">
              {saving ? t.saving : loading ? t.loadingW : t.saveWeek}
            </button>
            <button type="button" onClick={() => void handleApplyPlan()} disabled={busy}
              className="h-10 rounded-[10px] px-5 text-[13px] font-bold text-white transition-colors disabled:opacity-50" style={{ background: "#2740e6" }}>
              {applying ? t.applying : t.activate}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
