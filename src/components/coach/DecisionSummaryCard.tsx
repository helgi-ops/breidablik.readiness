"use client";

import { useState, useEffect, useMemo, type FC } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";
import { PL_SPIKE_ALERT } from "@/lib/micropulse/attention/thresholds";
import { evaluateRpeExpectation, isRpeExpectationActionable } from "@/lib/micropulse/rpeExpectation";
import { buildVerdictExplanation, type ExplainInput } from "@/lib/decision/explain";
import { useLang, type Lang } from "@/lib/lang";
import { isEstimatedVerdict, estimatedMarkerCopy } from "@/lib/micropulse/readiness/imputedVerdict";
import { PlayerSummaryCard } from "@/components/coach/PlayerSummaryCard";
import { PlayerAskCard } from "@/components/coach/PlayerAskCard";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { computeFosterMetrics, fosterStatus, type FosterMetrics } from "@/lib/micropulse/foster";

// ── Minimal types (mirrored from dashboard Row) ───────────────────────────

// NOTE: Squad tab uses TrainingAction = "FULL" | "REDUCED" | "RECOVERY" | "HOLD"
// Final prescription uses "FULL" | "MODIFIED" | "RECOVERY" | "HOLD"
// Both are normalised below via resolveDisplayAction().
type TrainingAction = "FULL" | "MODIFIED" | "REDUCED" | "RECOVERY" | "HOLD";

type DriverContribution = {
  key: string;
  label: string;
  contribution: number;
  direction: string;
  value?: number | null;
  note?: string;
};

type PrescriptionDecision = {
  action: string;
  intensityCap: string;
  volumeAdjustment: string;
  exposureGuidance: string[];
  recoveryFocus: string[];
  matchContext: string[];
  primaryDrivers: DriverContribution[];
  confidence: number;
  coachInstruction?: string;
};

type FinalRecommendationDecision = {
  finalRecommendation: PrescriptionDecision;
  confidence: number;
  riskFlags?: string[];
  debug?: {
    matchedRules?: string[];
  };
};

type TrendDirection = "IMPROVING" | "STABLE" | "WORSENING" | "SHARPLY_WORSENING";

type NeuralVolatilityIntelligenceDecision = {
  trendState: {
    direction: TrendDirection;
    scoreDelta?: number | null;
  };
};

/** Per-player GPS load snapshot (Catapult camelCase fields) */
export type PlayerLoadSnapshot = {
  totalDistance: number | null;
  playerLoad: number | null;
  velocityBand5TotalDistance: number | null;
  velocityBand6TotalDistance: number | null;
  accelBand2to3Efforts: number | null;
  decelBand2to3Efforts: number | null;
};

export type DecisionSummaryRow = {
  player_id: string;
  full_name: string;
  _z_today?: number | null;
  _dz?: number | null;
  _final_recommendation_decision?: FinalRecommendationDecision | null;
  _neural_volatility_intelligence?: NeuralVolatilityIntelligenceDecision | null;
  // Base readiness fields — same source as Squad tab colouring
  final_color?: string | null;   // "red" | "yellow" | "green"
  final_flag?: string | null;    // "RED" | "YELLOW" | "GREEN"
  final_decision?: string | null;
  system_decision?: string | null;
  /** True when this row is an IMPUTED check-in — the player did not answer and
   *  the wellness scores below were estimated (rolling_10d_median). The verdict
   *  colour is still computed and still useful, but it is a claim about the DATA
   *  ("he did not answer"), not about the athlete, so it must say so on screen.
   *  Note the personal baseline itself is unaffected: mp_apply_hybrid_readiness
   *  excludes imputed rows from the 28-day norm. */
  is_imputed?: boolean | null;
  /** How the estimate was produced, e.g. "rolling_10d_median". */
  imputed_method?: string | null;
  // ── Readiness questionnaire scores (1–5 scale) ──────────────────────────
  sleep_quality?: number | null;
  muscle_soreness?: number | null;   // 1 = very sore (bad), 4 = fresh, 5 = very fresh
  sore_areas?: string[] | null;     // e.g. ["hamstrings", "lower_back"]
  fatigue_energy?: number | null;
  stress_mood?: number | null;
  // ── Yesterday GPS load (populated by dashboard from _catapult_history) ──
  _yesterday_load?: PlayerLoadSnapshot | null;
  // ── Composite scores (populated by dashboard from MLI/Metabolic APIs) ───
  _yesterday_mli?: number | null;
  _yesterday_mli_band?: string | null;
  _yesterday_metabolic_score?: number | null;
  _yesterday_metabolic_band?: string | null;
  // ── Today's load interpretation (GPS burden + composite risk) ───────────
  /** Neuromuscular burden score (0–1). null when data quality is insufficient. */
  _today_nbs?: number | null;
  /** Composite load concern score (0–1) — RPE ACWR + GPS burden + concern escalation. */
  _today_composite_score?: number | null;
  /** Composite load concern band: "none" | "low" | "moderate" | "high". */
  _today_composite_concern?: "none" | "low" | "moderate" | "high" | null;
  /** Minutes the player was on the pitch in the most recent match (DNP excluded).
   *  When ≥60 AND today is MD+1, the verdict is force-mapped to RECOVERY
   *  irrespective of the load engine — sport-science consensus
   *  (Carling 2018, Nédélec 2012, Helsen 2018).
   *  Populated by the coach dashboard from match_player_minutes; null when
   *  no match data is available. */
  _yesterday_match_minutes?: number | null;
  /** ISO date of the match the minutes refer to. Used to verify the
   *  minutes data is actually from yesterday before triggering the
   *  guardrail. */
  _yesterday_match_date?: string | null;
  /** Yesterday's logged sRPE (CR10, 0–10) and MD-day, for the RPE-vs-plan chip
   *  (rpeExpectation engine). Descriptive planning feedback — never the colour. */
  _yesterday_rpe?: number | null;
  _yesterday_md_day?: string | null;
  /** Soft check-in-reliability note when the player's 28-day wellness SD is at
   *  either tail (near-constant OR erratic), so a flag may rest on an unreliable
   *  personal norm. Descriptive data-quality context — NEVER a verdict, never the
   *  colour. null unless actionable (checkCheckinVariability, dataQuality.ts). */
  _checkin_reliability?: {
    level: "low_variability" | "high_variability";
    sd: number | null; n: number; reason: string; reasonIs: string;
  } | null;
  /** Team's planned day type from week_plans for today
   *  ("TRAIN" | "RECOVERY" | "GAME" | "OFF" | null).
   *  When "OFF", the verdict is force-mapped to OFF_DAY so the modal
   *  doesn't claim "load picture cleared full" or "mixed signals" on a
   *  day where no session is scheduled. Wellness data still logged for
   *  trend continuity. */
  _team_day_type?: string | null;
  /** High-intensity L/R Change-of-Direction asymmetry % over the last
   *  14 days (Bishop 2020). Surfaced as a chronic-risk chip in the
   *  Decision Summary modal when ≥ 15% — informational, NOT a verdict
   *  modifier. Coaches use it to decide whether to skip max-effort
   *  cutting drills today; the daily verdict pipeline stays clean. */
  _cod_high_asym_pct?: number | null;
  /** Drop in today's max sprint speed (m/s) vs the player's personal
   *  reference (top-3 mean over 28d). Surfaced as a chip when ≥ 3% drop.
   *  Sport-science background: a > 10% drop signals accumulated fatigue —
   *  sprint-induced fatigue reduces hamstring/horizontal-force capacity
   *  (Edouard 2018). A fatigue flag, NOT a validated injury multiplier.
   *  Informational chip — coach decides
   *  whether to cap top-end sprint exposure today. Verdict pipeline
   *  unchanged for now (defer hard-rule until 2–3 coaches confirm fit). */
  _sprint_drop_pct?: number | null;
  /** Today's max sprint speed in km/h, for chip display. */
  _sprint_today_kmh?: number | null;
  /** Personal-peak reference in km/h, for chip display. */
  _sprint_ref_kmh?: number | null;
  /** Sprint Exposure band (Malone 2018) — weekly bands 5-8 stride volume
   *  vs match-day demand baseline. Volume-side companion to Sprint Speed
   *  Drop (which is quality-side).
   *    UNDERLOAD  (< 50%)   → under-prepared (moderate exposure is protective; Malone 2017)
   *    WATCH      (50–80%)  → playable but undertrained
   *    SAFE       (80–130%) → familiar range
   *    OVERLOAD   (> 150%)  → accumulated spike
   *  Surfaced as a chip in the Decision Summary card and gated into the
   *  "Needs attention" filter. Informational — does NOT modify today's
   *  verdict (Buchheit 2019: chronic-risk signals should inform, not
   *  override, acute decisions). */
  _sprint_exposure_band?: "UNDERLOAD" | "WATCH" | "SAFE" | "OVERLOAD" | "INSUFFICIENT_DATA" | null;
  /** Exposure ratio (acuteSum7d ÷ matchDayDemand). 1.0 = matches demand. */
  _sprint_exposure_ratio?: number | null;
  /** Number of match days in the baseline (measured + GPS-estimated combined). */
  _sprint_exposure_match_days?: number | null;
  /** Subset of match days whose stride count came from real Catapult IMA
   *  Free Running data (post-fix activities, post 2026-05-08 in Breiðablik). */
  _sprint_exposure_match_days_measured?: number | null;
  /** Subset of match days where the stride count was estimated from GPS V5+V6
   *  sprint efforts using the player's own match-derived ratio. Older Catapult
   *  activities can't be re-processed, so we estimate from GPS — same unit. */
  _sprint_exposure_match_days_estimated?: number | null;
  /** Total match days on the team schedule in the 28-day window — used for
   *  the "5 scheduled, 3 captured" transparency line when matches were DNP /
   *  data gaps. Populated by the bulk fetch on dev-coach-dashboard. */
  _sprint_exposure_match_days_scheduled?: number | null;
  /** Fatigue type hint: "normal" | "mechanical_fatigue" | "metabolic_fatigue" | "global_fatigue". */
  _today_fatigue_type?: string | null;
  /** PlayerLoad spike today vs 28d baseline (raw ratio, ~0–3). */
  _today_player_load_spike?: number | null;
  /** ISO date the load signals refer to (today if present, else yesterday). */
  _load_signals_date?: string | null;

  // ── Deceleration-specific metrics (McBurnie et al. 2022) ──────────────
  /** Standalone decel burden score (0–1). Eccentric braking load KPI. */
  _today_decel_burden?: number | null;
  /** Decel burden band: "low" | "moderate" | "elevated" | "high". */
  _today_decel_burden_band?: string | null;
  /** Accel:Decel ratio from high-intensity efforts. */
  _today_accel_decel_ratio?: number | null;
  /** Load profile: "eccentric_dominant" | "balanced" | "concentric_dominant". */
  _today_load_profile?: string | null;
  /** High-Intensity Distance as fraction of total distance (0–1). */
  _today_hid_percentage?: number | null;
  /** HID% relative decline vs 7-day avg (0–1 scale). Positive = lower than avg. */
  _today_hid_decline_pct?: number | null;
  /** True when HID% decline ≥20% with stable total distance (fatigue signal). */
  _today_hid_fatigue_flag?: boolean;
  /** Residual Decel Index — 3-day weighted accumulation. */
  _today_residual_decel?: number | null;
  /** Residual Decel band: "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH". */
  _today_residual_decel_band?: string | null;

  // ── VBT fatigue flags (velocity loss ≥10% from first 2 sets) ───────────
  _vbt_fatigue_flags?: Array<{
    exerciseName: string;
    loadKg: number;
    velocityDropPct: number;
    baselineVelocity: number;
    worstVelocity: number;
  }> | null;

  // ── Indoor Load Intelligence (FMP-driven, when session detected as indoor) ──
  /** ISO date of latest indoor session within last 28d (null = no recent indoor work). */
  _indoor_latest_date?: string | null;
  /** Composite Indoor Load Score (0-150+); 100 = personal 28d avg. Null when no indoor data. */
  _indoor_composite_score?: number | null;
  /** Score band: light/below_average/typical/heavy/spike. */
  _indoor_composite_band?: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  /** Indoor McBurnie proxy decel:dyn-high ratio (0.5-15+). Null when no recent indoor. */
  _indoor_mcburnie_ratio?: number | null;
  /** Indoor McBurnie flag: green/yellow/red. */
  _indoor_mcburnie_flag?: "green" | "yellow" | "red" | null;
  /** Number of indoor sessions in last 7 days (for context). */
  _indoor_sessions_7d?: number | null;
  /** Acute:Chronic Workload Ratio (Gabbett 2017). 7d total / 28d weekly avg. Sweet spot 0.8-1.3. */
  _indoor_acwr_value?: number | null;
  /** ACWR flag: green/yellow/red. */
  _indoor_acwr_flag?: "green" | "yellow" | "red" | null;

  // ── Active injury status (player_injuries table) — overrides load verdict ──
  /** Injury status: 'injured' (acute) | 'rehabilitation' | 'rtp_training' | 'cleared'. */
  _injury_status?: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
  /** Return-to-play stage: 0=acute, 1-2=physio rehab, 3=running, 4=modified team, 5=cleared. */
  _injury_rtp_stage?: number | null;
  /** Affected body part for context (e.g. "Ankle", "Knee", "Hamstring"). */
  _injury_body_part?: string | null;
  /** Injury type (e.g. "Sprain", "Strain"). */
  _injury_type?: string | null;
  /** Estimated return date as ISO string. */
  _injury_estimated_return?: string | null;
  /** Severity: minor / moderate / severe. */
  _injury_severity?: string | null;
};

// ── Action resolution (matches Squad tab logic exactly) ───────────────────

/**
 * Squad tab maps: RED → RECOVERY, YELLOW → REDUCED, GREEN → FULL.
 * Prescription engine maps: MODIFIED instead of REDUCED.
 * We normalise both to a single display action here.
 */
function flagToDisplayAction(flag: string | null | undefined): string | null {
  const f = String(flag ?? "").toUpperCase();
  if (f === "RED") return "RECOVERY";
  if (f === "YELLOW") return "MODIFIED"; // REDUCED → MODIFIED for display
  if (f === "GREEN") return "FULL";
  return null;
}

function colorToDisplayAction(color: string | null | undefined): string | null {
  const c = String(color ?? "").toLowerCase();
  if (c === "red") return "RECOVERY";
  if (c === "yellow") return "MODIFIED";
  if (c === "green") return "FULL";
  return null;
}

function normaliseAction(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  // REDUCED (Squad tab) → MODIFIED (prescription engine display label)
  if (u === "REDUCED") return "MODIFIED";
  return u;
}

/** Resolves the display action in the same priority order the Squad tab uses. */
function resolveDisplayAction(row: DecisionSummaryRow): string | null {
  // 1. Final prescription (most complete source)
  const prescAction = normaliseAction(row._final_recommendation_decision?.finalRecommendation?.action);
  const finalDec = normaliseAction(row.final_decision);
  const sysDec = normaliseAction(row.system_decision);

  let action: string | null = null;
  if (prescAction) action = prescAction;
  else if (finalDec) action = finalDec;
  else if (sysDec) action = sysDec;
  else action = flagToDisplayAction(row.final_flag) ?? colorToDisplayAction(row.final_color);

  return applyOverrideGuardrail(action, row, sysDec);
}

/**
 * Override guardrail — when the displayed verdict is FULL but the player's
 * personal-z (converted to STEN) is in the override-warning territory, the
 * verdict header is downgraded from FULL → FULL_OVERRIDE_RISKY so the
 * coach sees an explicit amber "Coach-cleared" badge instead of a clean
 * green ✅. The actual prescription/decision isn't changed — coaches
 * always have final authority. This is purely about visual honesty.
 *
 * Detection mirrors the existing stenOverrideWarning() logic so the badge
 * and the inline override banner stay in sync. The system "recommended
 * RECOVERY/MODIFIED" view is INFERRED from STEN (z-score → STEN), not
 * stored in a separate system_decision field — so we use the same source.
 *
 * Triggers when:
 *   - displayAction = FULL
 *   - personal-z is available
 *   - Derived STEN ≤ 4 (system would have recommended MODIFIED or worse)
 *
 * The systemAction parameter is also accepted as a belt-and-braces signal:
 * if the engine writes RECOVERY/MODIFIED into system_decision explicitly we
 * trust it even when STEN data is missing.
 */
function applyOverrideGuardrail(
  action: string | null,
  row: DecisionSummaryRow,
  systemAction: string | null,
): string | null {
  // ── HARDEST OVERRIDE: active injury / illness / RTP ────────────────────
  // When the player is in the injury pipeline, the load/wellness engines
  // are irrelevant — coach action is dictated by physio plan, not the
  // engine. Previously the verdict BADGE was injury-aware (shows "Rehab")
  // but the COACH ACTION block still said "Clear for full session" because
  // displayAction stayed as FULL. That's a real contradiction the coach
  // could read as permission to send the player in.
  //
  // Map:
  //   injured       → RECOVERY  (acute, no team session)
  //   rehabilitation → RECOVERY (physio phase, no team session)
  //   rtp_training  → MODIFIED  (running with team, but restricted)
  //   cleared       → (no override, engine verdict applies)
  const injStatus = row._injury_status;
  if (injStatus === "injured" || injStatus === "rehabilitation") {
    return "RECOVERY";
  }
  if (injStatus === "rtp_training") {
    return "MODIFIED";
  }

  // ── HARD OVERRIDE: today is OFF day per team's week_plans ─────────────
  // No training is scheduled today. The load/wellness verdicts ("Cleared
  // full", "Mixed signals", etc.) are misleading on OFF days because
  // they imply a session that isn't happening. Wellness data is still
  // captured for trend continuity but the verdict surface should reflect
  // the team's planned day.
  // Coach can still see all the underlying data inside the modal; this
  // only changes the headline.
  if (String(row._team_day_type ?? "").toUpperCase() === "OFF") {
    return "OFF_DAY";
  }

  // ── HARD OVERRIDE: 60+ min match yesterday → MD+1 = RECOVERY ───────────
  // Sport-science consensus (Carling 2018, Nédélec 2012, Helsen 2018):
  // playing 60+ minutes triggers meaningful 24-72h recovery debt
  // (CK + perceived fatigue elevated). MD+1 is recovery regardless of how
  // the load engine reads — coach can still manually override with full
  // knowledge of the trade-off.
  if (
    (action === "FULL" || action === "MODIFIED" || action === "FULL_OVERRIDE_RISKY") &&
    row._yesterday_match_minutes != null &&
    row._yesterday_match_minutes >= 60 &&
    isYesterday(row._yesterday_match_date ?? null)
  ) {
    return "RECOVERY";
  }

  if (action !== "FULL") return action;

  // ── STEN-based engine-conflict detection (mirrors stenOverrideWarning)
  const z = row._z_today;
  const stenOverride =
    z != null && Number.isFinite(z) && zToSten(z) <= 4;

  // Explicit system-action mismatch (fallback when stored)
  const explicitOverride =
    systemAction === "RECOVERY" || systemAction === "MODIFIED";

  if (stenOverride || explicitOverride) return "FULL_OVERRIDE_RISKY";
  return action;
}

/** Returns true when the supplied ISO date is exactly one calendar day
 *  before today (UTC). Used to confirm the match-minutes field actually
 *  refers to yesterday before triggering the MD+1 guardrail. */
function isYesterday(iso: string | null): boolean {
  if (!iso) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const day = new Date(`${iso}T00:00:00Z`);
  const diff = (today.getTime() - day.getTime()) / 86_400_000;
  return diff === 1;
}

// ── Text helpers ──────────────────────────────────────────────────────────

function zScoreToText(z: number | null | undefined): string | null {
  if (z == null || !Number.isFinite(z)) return null;
  if (z >= 2.0) return "far above normal";
  if (z >= 1.0) return "above normal";
  if (z <= -2.0) return "well below normal";
  if (z <= -1.0) return "below normal";
  return null;
}

function trendToText(dir: TrendDirection | null | undefined): string | null {
  if (!dir) return null;
  if (dir === "SHARPLY_WORSENING") return "sharply declining";
  if (dir === "WORSENING") return "declining";
  if (dir === "IMPROVING") return "improving";
  return null;
}

function deltaToText(dz: number | null | undefined): string | null {
  if (dz == null || !Number.isFinite(dz)) return null;
  if (dz <= -0.6) return "sharply declining";
  if (dz <= -0.2) return "declining";
  if (dz >= 0.6) return "sharply improving";
  if (dz >= 0.2) return "improving";
  return null;
}

function confidenceToBand(c: number | null | undefined): "High" | "Medium" | "Low" | null {
  if (c == null || !Number.isFinite(c)) return null;
  if (c >= 0.75) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

// ── STEN score helpers ────────────────────────────────────────────────────
// STEN = (2 × Z) + 5.5 — converts Z-score to 1–10 scale.
// Thornton et al. (2019): Z ≤ −2 = red flag; Z ≤ −1.5 = yellow flag.
// STEN bands: 1–2 = Very low, 3–4 = Low, 5–6 = Normal, 7–8 = High, 9–10 = Very high.

function zToSten(z: number): number {
  const raw = 2 * z + 5.5;
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10;
}

type StenBand = {
  label: string;
  shortLabel: string;
  chipBg: string;
  chipText: string;
  textColor: string;
  readinessText: string;
};

function stenToBand(sten: number): StenBand {
  if (sten <= 2) return {
    label: "Very low",
    shortLabel: "Very low",
    chipBg: "bg-rose-100",
    chipText: "text-rose-800",
    textColor: "text-rose-700",
    readinessText: "Significantly below own baseline — consider recovery or reduced session",
  };
  if (sten <= 4) return {
    label: "Below baseline",
    shortLabel: "Below baseline",
    chipBg: "bg-amber-100",
    chipText: "text-amber-800",
    textColor: "text-amber-700",
    readinessText: "Below own baseline — monitor and consider reducing training load",
  };
  if (sten <= 6) return {
    label: "Normal",
    shortLabel: "Normal",
    chipBg: "bg-slate-100",
    chipText: "text-slate-600",
    textColor: "text-slate-600",
    readinessText: "Within normal range for this player — no concerns from baseline",
  };
  if (sten <= 8) return {
    label: "Above baseline",
    shortLabel: "Above baseline",
    chipBg: "bg-emerald-100",
    chipText: "text-emerald-800",
    textColor: "text-emerald-700",
    readinessText: "Above own baseline — player is in good form",
  };
  return {
    label: "Peak form",
    shortLabel: "Peak",
    chipBg: "bg-emerald-200",
    chipText: "text-emerald-900",
    textColor: "text-emerald-800",
    readinessText: "Player is at peak readiness — very high form relative to own baseline",
  };
}

// Returns a warning when the load engine has cleared FULL but the wellness
// engine (STEN) is below baseline — i.e. the two engines disagree and the
// load picture happened to "win". The banner makes this internal conflict
// visible to the coach. Wording deliberately attributes the discrepancy to
// the SYSTEM, not to a coach override (which would be confusing — no coach
// action has actually happened).
function stenOverrideWarning(
  displayAction: string | null,
  sten: number | null
): { level: "critical" | "caution"; text: string } | null {
  if (displayAction !== "FULL" || sten == null) return null;
  if (sten <= 2) return {
    level: "critical",
    text: `Mixed signals — wellness STEN ${sten} flagged RECOVERY but load picture cleared FULL. Confirm with the player before the training session.`,
  };
  if (sten <= 4) return {
    level: "caution",
    text: `Mixed signals — wellness STEN ${sten} flagged MODIFIED but load picture cleared FULL. Confirm with the player before the training session.`,
  };
  return null;
}

function buildPrimaryDriverSentence(
  driver: DriverContribution | null | undefined,
  zText: string | null,
  trendText: string | null
): string | null {
  const base = driver?.note ?? driver?.label ?? null;
  const parts: string[] = [];
  if (base) parts.push(base);
  if (zText && !base?.toLowerCase().includes(zText)) parts.push(zText);
  if (trendText) parts.push(`${trendText} trend`);
  return parts.length ? parts.join(", ") : null;
}

function buildSecondaryLabels(
  drivers: DriverContribution[] | undefined,
  primaryKey: string | null | undefined
): string[] {
  if (!drivers) return [];
  return drivers
    .filter((d) => d.key !== primaryKey)
    .slice(0, 2)
    .map((d) => d.note ?? d.label)
    .filter(Boolean);
}

// ── Coach action builder ──────────────────────────────────────────────────
// The goal: tell the COACH what to physically DO with this player today.

const VOLUME_LABEL: Record<string, string> = {
  REDUCE_50: "Reduce volume by 50%",
  REDUCE_30: "Reduce volume by 30%",
  REDUCE_20: "Reduce volume by 20%",
  REDUCE_10: "Reduce volume by 10%",
};

const INTENSITY_LABEL: Record<string, string> = {
  CAP_LOW: "Low intensity only",
  CAP_MODERATE: "Moderate intensity cap",
  CAP_HIGH: "High intensity cap",
};

const EXPOSURE_LABEL: Record<string, string> = {
  LIMIT_MAX_SPEED: "Remove high-speed running",
  LIMIT_DECELS: "Limit decelerations",
  LIMIT_CONTACT: "No contact work",
  LIMIT_PLYOS: "No plyometric work",
  LIMIT_FIELD_MINUTES: "Reduce field minutes",
  LIMIT_GYM_INTENSITY: "Light gym only",
  SKILL_ONLY: "Skill work only",
  RECOVERY_MODALITIES: "Recovery modalities",
};

const MATCH_LABEL: Record<string, string> = {
  PROTECT_FOR_MATCH: "Protect for upcoming match",
  RESTORE_AFTER_MATCH: "Restore after match",
  DELOAD_ACCUMULATION: "Deload accumulated load",
};

type ActionBlock = {
  headline: string;         // Bold instruction e.g. "Individual recovery program"
  details: string[];        // Specific restrictions e.g. ["Remove high-speed running", "−20% volume"]
};

function buildCoachActionBlock(
  displayAction: string | null,
  final: PrescriptionDecision | null,
  /** Optional injury context — when present, action text overrides the
   *  generic RECOVERY/MODIFIED copy with rehab-specific instructions so
   *  the coach never sees "Clear for full session" or generic "Keep off
   *  main session" for a player whose physio plan is the real driver. */
  injury?: {
    status?: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
    bodyPart?: string | null;
    rtpStage?: number | null;
    isIllness?: boolean;
  } | null,
): ActionBlock {
  // ── HARDEST OVERRIDE: active injury / illness ─────────────────────────
  // When the player is actively in the injury pipeline, action copy must
  // come from rehab logic, not from the load engine. Mirrors the same
  // override priority used in applyOverrideGuardrail().
  if (injury) {
    if (injury.status === "injured" || injury.status === "rehabilitation") {
      if (injury.isIllness) {
        return {
          headline: "Recovering from illness — no team session",
          details: [
            "Light rehab or full rest per medical advice",
            "Re-check next training day before clearing",
          ],
        };
      }
      const where = injury.bodyPart ? ` (${injury.bodyPart})` : "";
      return {
        headline: `Follow rehab plan${where} — no team session`,
        details: [
          "Physio program takes priority over team load",
          "Coach action: monitor pain / swelling reports",
        ],
      };
    }
    if (injury.status === "rtp_training") {
      const stage = typeof injury.rtpStage === "number" ? injury.rtpStage : null;
      const where = injury.bodyPart ? ` (${injury.bodyPart})` : "";
      const stageText = stage != null ? `RTP stage ${stage}/5${where}` : `Return to play${where}`;
      return {
        headline: `${stageText} — modified work only`,
        details: [
          stage != null && stage <= 3
            ? "Running / individual conditioning, no team contact drills"
            : "Partial team integration — skip max-effort cutting and 1v1 duels",
          "Pull immediately at first sign of pain or compensation",
        ],
      };
    }
  }

  // ── OFF_DAY ────────────────────────────────────────────────────────────
  // Today is OFF in the team's week_plans — no session is scheduled.
  // Wellness check-ins still feed the trend; the coach action is
  // explicitly "no action required today" so the surface doesn't
  // contradict the OFF day verdict at the top of the modal.
  if (displayAction === "OFF_DAY") {
    return {
      headline: "No training scheduled today",
      details: [
        "Wellness check-in noted for trend continuity",
        "Verdicts resume on the next training day",
      ],
    };
  }

  // ── RECOVERY / HOLD ────────────────────────────────────────────────────
  if (displayAction === "RECOVERY" || displayAction === "HOLD") {
    const details: string[] = [];
    // Recovery focus tags → readable details
    const RECOVERY_LABEL: Record<string, string> = {
      SLEEP: "Prioritise sleep and rest",
      SOFT_TISSUE: "Soft tissue treatment",
      LOW_INTENSITY_AEROBIC: "Low-intensity aerobic only",
      MOBILITY: "Mobility and activation",
      DOWNREGULATION: "Downregulation protocol",
      HYDRATION: "Hydration and nutrition focus",
    };
    for (const tag of (final?.recoveryFocus ?? []).slice(0, 2)) {
      const t = RECOVERY_LABEL[tag];
      if (t) details.push(t);
    }
    if (!details.length) details.push("Individual recovery program");
    return {
      headline: "Keep off main session",
      details,
    };
  }

  // ── MODIFIED ───────────────────────────────────────────────────────────
  if (displayAction === "MODIFIED") {
    const details: string[] = [];

    const volText = VOLUME_LABEL[final?.volumeAdjustment ?? ""];
    if (volText) details.push(volText);

    const capText = INTENSITY_LABEL[final?.intensityCap ?? ""];
    if (capText) details.push(capText);

    let expCount = 0;
    for (const tag of (final?.exposureGuidance ?? []).filter((t) => t !== "ALLOW_MAX_SPEED")) {
      if (expCount >= 2) break;
      const t = EXPOSURE_LABEL[tag];
      if (t && !details.includes(t)) { details.push(t); expCount++; }
    }

    for (const tag of final?.matchContext ?? []) {
      const t = MATCH_LABEL[tag];
      if (t) { details.push(t); break; }
    }

    if (!details.length) details.push("Individual load modification");

    return {
      headline: "Modify session individually",
      details: details.slice(0, 3),
    };
  }

  // ── FULL_OVERRIDE_RISKY ────────────────────────────────────────────────
  // Load engine cleared FULL but wellness flagged recovery — coach action
  // is to talk to the player, not to send them straight into a full session.
  if (displayAction === "FULL_OVERRIDE_RISKY") {
    return {
      headline: "Confirm with player before training session",
      details: [
        "Wellness flagged recovery — load picture cleared full",
        "Decide intensity after talking to him",
        "Pull at first sign of pain",
      ],
    };
  }

  // ── FULL ───────────────────────────────────────────────────────────────
  const details: string[] = [];
  // Check if there are any minor exposure notes even on a full decision
  let expCount = 0;
  for (const tag of (final?.exposureGuidance ?? []).filter((t) => t !== "ALLOW_MAX_SPEED")) {
    if (expCount >= 1) break;
    const t = EXPOSURE_LABEL[tag];
    if (t) { details.push(t); expCount++; }
  }
  for (const tag of final?.matchContext ?? []) {
    const t = MATCH_LABEL[tag];
    if (t) { details.push(t); break; }
  }

  return {
    headline: "Clear for full session",
    details,
  };
}

// ── Visual config ─────────────────────────────────────────────────────────

type StateConfig = {
  label: string;
  emoji: string;
  topBarClass: string;
  cardBorderClass: string;
  cardBgClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  actionBgClass: string;
  actionHeadlineClass: string;
  sortPriority: number;
};

const STATE_CONFIG: Record<string, StateConfig> = {
  HOLD: {
    label: "HOLD",
    emoji: "🔴",
    topBarClass: "bg-rose-700",
    cardBorderClass: "border-rose-300",
    cardBgClass: "bg-rose-50/40",
    badgeBgClass: "bg-rose-700",
    badgeTextClass: "text-white",
    actionBgClass: "bg-rose-100 border-rose-200",
    actionHeadlineClass: "text-rose-900",
    sortPriority: 0,
  },
  RECOVERY: {
    label: "RECOVERY",
    emoji: "🔴",
    topBarClass: "bg-rose-500",
    cardBorderClass: "border-rose-200",
    cardBgClass: "bg-rose-50/30",
    badgeBgClass: "bg-rose-500",
    badgeTextClass: "text-white",
    actionBgClass: "bg-rose-100 border-rose-200",
    actionHeadlineClass: "text-rose-900",
    sortPriority: 1,
  },
  MODIFIED: {
    label: "MODIFIED",
    emoji: "🟡",
    topBarClass: "bg-amber-400",
    cardBorderClass: "border-amber-200",
    cardBgClass: "bg-amber-50/20",
    badgeBgClass: "bg-amber-400",
    badgeTextClass: "text-amber-950",
    actionBgClass: "bg-amber-100 border-amber-200",
    actionHeadlineClass: "text-amber-900",
    sortPriority: 2,
  },
  FULL: {
    label: "FULL",
    emoji: "🟢",
    topBarClass: "bg-emerald-500",
    cardBorderClass: "border-emerald-200",
    cardBgClass: "bg-white",
    badgeBgClass: "bg-emerald-500",
    badgeTextClass: "text-white",
    actionBgClass: "bg-emerald-50 border-emerald-200",
    actionHeadlineClass: "text-emerald-900",
    sortPriority: 3,
  },
  // Visually distinct "load engine cleared FULL while wellness engine flagged
  // RECOVERY/MODIFIED" — i.e. the two sub-engines disagree and the load
  // picture happened to win the verdict pipeline. NO coach action required
  // for this state; it's purely a system-internal conflict that needs a
  // human review before training.
  FULL_OVERRIDE_RISKY: {
    label: "MIXED",
    emoji: "⚠️",
    topBarClass: "bg-amber-500",
    cardBorderClass: "border-amber-300",
    cardBgClass: "bg-amber-50/30",
    badgeBgClass: "bg-amber-500",
    badgeTextClass: "text-white",
    actionBgClass: "bg-amber-100 border-amber-200",
    actionHeadlineClass: "text-amber-900",
    sortPriority: 2,
  },
  // Today is OFF day per team's week_plans — no training scheduled.
  // Wellness check-in still logged (so the trend continues), but the
  // verdict surface is neutral instead of asserting a load/wellness verdict.
  OFF_DAY: {
    label: "OFF",
    emoji: "🌙",
    topBarClass: "bg-slate-400",
    cardBorderClass: "border-slate-200",
    cardBgClass: "bg-slate-50/40",
    badgeBgClass: "bg-slate-500",
    badgeTextClass: "text-white",
    actionBgClass: "bg-slate-100 border-slate-200",
    actionHeadlineClass: "text-slate-800",
    sortPriority: 4, // sort after FULL — least urgent
  },
};

const UNKNOWN_STATE: StateConfig = {
  label: "—",
  emoji: "⚫",
  topBarClass: "bg-slate-300",
  cardBorderClass: "border-slate-200",
  cardBgClass: "bg-white",
  badgeBgClass: "bg-slate-300",
  badgeTextClass: "text-slate-700",
  actionBgClass: "bg-slate-50 border-slate-200",
  actionHeadlineClass: "text-slate-700",
  sortPriority: 9,
};

// ── Bilingual verdict mapping — EN default, IS toggle ─────────────────
type BilingualVerdict = {
  icon: string;
  label: { EN: string; IS: string };
  sentence: { EN: string; IS: string };
  recommendation: { EN: string; IS: string };
};

type ResolvedVerdict = {
  icon: string;
  label: string;
  sentence: string;
  recommendation: string;
};

const VERDICT_MAP: Record<string, BilingualVerdict> = {
  FULL: {
    icon: "✅",
    label: { EN: "Ready", IS: "Tilbúinn" },
    sentence: { EN: "Ready for full program", IS: "Tilbúinn í fullt prógram" },
    recommendation: {
      EN: "No restrictions — full training, sprint work OK",
      IS: "Engin takmörk — fullt æfing, sprint work OK",
    },
  },
  // The load engine has cleared FULL while the wellness engine flagged
  // RECOVERY/MODIFIED — i.e. the two sub-engines disagree and the load
  // picture happened to win the verdict pipeline. NO coach action is
  // implied; this is purely a system-internal conflict that needs a coach
  // review (and possibly a manual override) before training.
  FULL_OVERRIDE_RISKY: {
    icon: "⚠️",
    label: { EN: "Mixed signals", IS: "Misvísandi merki" },
    sentence: {
      EN: "Load picture cleared full, but wellness check flagged recovery",
      IS: "Álagsmynd cleared, en líðan flaggaði recovery",
    },
    recommendation: {
      EN: "Engines disagree. Confirm with the player before the training session and decide intensity then; pull at first sign of pain.",
      IS: "Kerfin eru ósammála. Talaðu við leikmanninn fyrir æfingu og ákveddu ákefð þá; draga út við fyrsta merki um sársauka.",
    },
  },
  MODIFIED: {
    icon: "⚠️",
    label: { EN: "Lighter session", IS: "Léttari æfing" },
    sentence: { EN: "Needs a lighter session today", IS: "Þarf léttari æfingu í dag" },
    recommendation: {
      EN: "Reduce volume 30-40% and skip max-intensity sprints",
      IS: "Lækka volume 30-40% og sleppa max-intensity sprints",
    },
  },
  RECOVERY: {
    icon: "🛑",
    label: { EN: "Rest", IS: "Hvíld" },
    sentence: { EN: "Rest or mobility only", IS: "Hvíld eða mobility eingöngu" },
    recommendation: {
      EN: "No high-intensity work — focus on mobility, recovery, light technical work",
      IS: "Engin high-intensity vinna — focus á hreyfanleika, recovery, light technical work",
    },
  },
  HOLD: {
    icon: "🛑",
    label: { EN: "Held out", IS: "Frá æfingu" },
    sentence: { EN: "Held out today", IS: "Frá æfingu í dag" },
    recommendation: {
      EN: "Medical/injury hold — do not include in team session",
      IS: "Medical/injury hold — ekki hafa með í team-session",
    },
  },
  // OFF day per team's week_plans — no session scheduled. Wellness
  // check-in is still captured for trend continuity but the engine
  // verdict is neutral instead of asserting a load/wellness recommendation.
  OFF_DAY: {
    icon: "🌙",
    label: { EN: "OFF day", IS: "Frídagur" },
    sentence: {
      EN: "No training scheduled today",
      IS: "Engin æfing skráð í dag",
    },
    recommendation: {
      EN: "Wellness check-in noted for trend. No action required today — verdicts resume on the next training day.",
      IS: "Líðan-check-in skráð fyrir trend. Engin aðgerð í dag — verdicts halda áfram næsta æfingadag.",
    },
  },
};

const INJURY_VERDICT: Record<string, BilingualVerdict> = {
  injured: {
    icon: "🚫",
    label: { EN: "Out — injury", IS: "Frá æfingu — meiðsl" },
    sentence: { EN: "Acute injury — no training", IS: "Acute meiðsli — engin æfing" },
    recommendation: {
      EN: "Medical/physio protocol. No team training until physio clears.",
      IS: "Medical/physio prótókoll. Engin team-æfing fyrr en sjúkraþjálfari clear-ar.",
    },
  },
  rehabilitation: {
    icon: "🏥",
    label: { EN: "Rehab", IS: "Endurhæfing" },
    sentence: { EN: "In rehabilitation with physio", IS: "Í endurhæfingu hjá sjúkraþjálfara" },
    recommendation: {
      EN: "Physio-prescribed exercises only. No team work or running yet.",
      IS: "Aðeins physio-prescribed exercises. Engin team-vinna eða running.",
    },
  },
  rtp_training: {
    icon: "🩹",
    label: { EN: "Return-to-play", IS: "Return-to-play" },
    sentence: { EN: "Returning — modified team work", IS: "Í endurkomu — modified team work" },
    recommendation: {
      EN: "Lighter sessions with the team. Skip max-intensity sprints and full contact until stage 5.",
      IS: "Léttari æfingar með liðinu. Sleppa max-intensity sprints og full contact þar til stage 5.",
    },
  },
};

const ILLNESS_VERDICT: Record<string, BilingualVerdict> = {
  acute: {
    icon: "🤒",
    label: { EN: "Sick", IS: "Veikur" },
    sentence: { EN: "Sick — no training", IS: "Veikur — engin æfing" },
    recommendation: {
      EN: "No training. Rest, hydrate, monitor symptoms. Keep distance from teammates due to contagion risk.",
      IS: "Engin æfing. Hvíld, drekka mikið, monitor symptoms. Fjarlægð frá öðrum leikmönnum vegna smithættu.",
    },
  },
  recovering: {
    icon: "🫧",
    label: { EN: "Recovering", IS: "Að jafna sig" },
    sentence: { EN: "Recovering — lighter session", IS: "Á batavegi — léttari æfing" },
    recommendation: {
      EN: "Light technical/aerobic work today. Skip max-intensity sprints. Hydrate well. Re-assess after session.",
      IS: "Light technical/aerobic work í dag. Sleppa max-intensity sprints. Drekka mikið. Skoða aftur eftir session.",
    },
  },
};

function resolveVerdict(map: BilingualVerdict, lang: Lang): ResolvedVerdict {
  return {
    icon: map.icon,
    label: lang === "IS" ? map.label.IS : map.label.EN,
    sentence: lang === "IS" ? map.sentence.IS : map.sentence.EN,
    recommendation: lang === "IS" ? map.recommendation.IS : map.recommendation.EN,
  };
}

// ── UI string translations (headings, small labels) ─────────────────────
const I18N = {
  activeIllness: { EN: "Active illness", IS: "Active veikindi" },
  activeInjury: { EN: "Active injury", IS: "Active meiðsli" },
  illness: { EN: "Illness", IS: "Veikindi" },
  injury: { EN: "Injury", IS: "Meiðsl" },
  estimatedReturn: { EN: "Estimated return", IS: "Áætluð endurkoma" },
  rtpStage: { EN: "RTP stage", IS: "RTP stage" },
  why: { EN: "Why", IS: "Hvers vegna" },
  coachGuidance: { EN: "Coach guidance", IS: "Þjálfara-leiðbeining" },
  verify: { EN: "Verify", IS: "Verifya" },
  askPlayer: { EN: "Question for player", IS: "Spurning til leikmanns" },
  acwrLabel: { EN: "ACWR (7d:28d)", IS: "ACWR (7d:28d)" },
  acwrRisk: { EN: "Risk", IS: "Risk" },
  acwrCaution: { EN: "Caution", IS: "Caution" },
  acwrSweetSpot: { EN: "Sweet spot", IS: "Sweet spot" },
  indoor7d: { EN: "Indoor (7d)", IS: "Indoor (7d)" },
  sessionsLabel: { EN: "sessions", IS: "sessions" },
  sessionLabel: { EN: "session", IS: "session" },
  indoorLoad: { EN: "Indoor load (höll-mode)", IS: "Indoor load (höll-mode)" },
  concernBumped: { EN: "↑ Concern bumped", IS: "↑ Concern bumped" },
  indoorScore: { EN: "Indoor score", IS: "Indoor score" },
  mcburnieIndoor: { EN: "McBurnie indoor", IS: "McBurnie indoor" },
  healthy: { EN: "Healthy", IS: "Heilbrigt" },
  atRisk: { EN: "At-risk", IS: "Risk" },
  caution: { EN: "Caution", IS: "Caution" },
} as const;
function t(key: keyof typeof I18N, lang: Lang): string {
  return lang === "IS" ? I18N[key].IS : I18N[key].EN;
}

/** True if this injury record is actually an illness (not musculoskeletal). */
function isIllnessRecord(bodyPart: string | null | undefined): boolean {
  if (!bodyPart) return false;
  const bp = bodyPart.toLowerCase();
  return bp.includes("illness") || bp.includes("sjúk") || bp.includes("veik") || bp.includes("flu") || bp.includes("cold");
}

const UNKNOWN_VERDICT_BILINGUAL: BilingualVerdict = {
  icon: "❓",
  label: { EN: "No data", IS: "Engin gögn" },
  sentence: { EN: "Not enough data to assess", IS: "Ekki nóg gögn til að meta" },
  recommendation: {
    EN: "Rely on coach's eye today",
    IS: "Treysta á eyemark þjálfara í dag",
  },
};

/**
 * Resolve verdict in EN or IS based on user's language preference.
 * Priority: illness override → injury override → load-based action → unknown.
 */
function getIcelandicVerdict(
  action: string | null,
  injuryStatus: string | null | undefined,
  bodyPart: string | null | undefined,
  lang: Lang = "EN",
): ResolvedVerdict {
  if (injuryStatus && injuryStatus !== "cleared" && isIllnessRecord(bodyPart)) {
    return resolveVerdict(
      injuryStatus === "injured" ? ILLNESS_VERDICT.acute : ILLNESS_VERDICT.recovering,
      lang,
    );
  }
  if (injuryStatus && injuryStatus !== "cleared" && INJURY_VERDICT[injuryStatus]) {
    return resolveVerdict(INJURY_VERDICT[injuryStatus], lang);
  }
  if (action && VERDICT_MAP[action]) {
    return resolveVerdict(VERDICT_MAP[action], lang);
  }
  return resolveVerdict(UNKNOWN_VERDICT_BILINGUAL, lang);
}

// ── Risk flag labels ──────────────────────────────────────────────────────
// Maps the engine's internal riskFlags to coach-friendly English.

const RISK_FLAG_LABEL: Record<string, string> = {
  high_acwr:                  "ACWR above 1.5 — acute load far exceeds chronic",
  acwr_spike:                 "ACWR elevated (1.3–1.5) — load rising fast",
  load_spike:                 "Session load >20% above 7-day average",
  recent_load_drop:           "Significant load drop recently",
  high_soreness:              "High soreness reported (≤ 2/5)",
  low_sleep:                  "Poor sleep quality reported (≤ 2/5)",
  low_recovery:               "Low recovery score reported (≤ 2/5)",
  high_fatigue:               "Low energy reported (≤ 2/5)",
  high_stress:                "High stress / poor mood reported (≤ 2/5)",
  low_z:                      "Below own baseline (Z ≤ −1.5 / STEN ≤ 3.5)",
  injury_risk_high:           "Injury risk system flagged HIGH",
  injury_risk_elevated:       "Injury risk system flagged ELEVATED",
  high_hsr_exposure:          "High-speed running exposure spike",
  high_accel_decel_exposure:  "High acceleration/deceleration load",
  high_mechanical_load:       "High total mechanical load",
  missing_load_data:          "Load data unavailable",
  missing_wellness:           "Wellness data unavailable",
  manual_review:              "Manually flagged for review",
};

// Maps matchedRules to a one-line explanation of the combination that fired.
const MATCHED_RULE_LABEL: Record<string, string> = {
  force_red:                 "RED: critical combination of risk factors",
  force_yellow:              "YELLOW: one or more elevated risk flags",
  insufficient_core_inputs:  "Insufficient data — GRAY pending",
};

/**
 * Returns an array of human-readable strings explaining WHY the decision
 * was triggered, based on the engine's riskFlags and matchedRules.
 */
function buildDecisionReasons(final: FinalRecommendationDecision | null, displayAction: string | null): string[] {
  if (!final) return [];
  // Only show for RED / YELLOW — FULL doesn't need an explanation
  if (displayAction !== "RECOVERY" && displayAction !== "HOLD" && displayAction !== "MODIFIED") return [];

  const reasons: string[] = [];

  // Leading summary from matchedRules (e.g. "force_red")
  for (const rule of (final.debug?.matchedRules ?? [])) {
    const label = MATCHED_RULE_LABEL[rule];
    if (label) { reasons.push(label); break; }
  }

  // Individual risk flags
  for (const flag of (final.riskFlags ?? [])) {
    const label = RISK_FLAG_LABEL[flag];
    if (label) reasons.push(label);
  }

  return reasons;
}

// ── Player Detail Modal ───────────────────────────────────────────────────

const RECOVERY_FOCUS_LABEL: Record<string, string> = {
  SLEEP: "Prioritise sleep and rest",
  SOFT_TISSUE: "Soft tissue treatment",
  LOW_INTENSITY_AEROBIC: "Low-intensity aerobic only",
  MOBILITY: "Mobility and activation",
  DOWNREGULATION: "Downregulation protocol",
  HYDRATION: "Hydration and nutrition focus",
  TRAVEL_RECOVERY: "Travel recovery protocol",
  NUTRITION: "Nutrition and fuelling focus",
  NO_EXTRA_RECOVERY_NEEDED: "No extra recovery needed",
};

/**
 * Marker for a verdict built from an estimated (imputed) check-in.
 *
 * Deliberately quiet: the colour stays, because a rolling-median estimate is a
 * reasonable guess and hiding it would leave the coach with a blank card. What
 * is NOT acceptable is presenting the estimate identically to a real answer —
 * that turns a claim about the data into a claim about the athlete. Same
 * null-vs-zero discipline the ingestion layer applies to missing GPS.
 */
const EstimatedMarker: FC<{ row: DecisionSummaryRow; lang?: Lang; size?: "sm" | "md" }> = ({
  row,
  lang = "EN",
  size = "sm",
}) => {
  if (!isEstimatedVerdict(row)) return null;
  const { label, tip } = estimatedMarkerCopy(lang);
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 rounded border border-dashed border-amber-400 bg-amber-50 font-medium text-amber-700 whitespace-nowrap ${
        size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      ~ {label}
    </span>
  );
};

const PlayerModal: FC<{
  row: DecisionSummaryRow;
  onClose: () => void;
  lang?: Lang;
  /** Team-level load pipeline override — see DecisionSummaryCard prop. */
  trainingMode?: "auto" | "indoor" | "outdoor";
  /** Foster Monotony & Strain (per player, last 7 days). Surfaces the
   *  Lite-tier overtraining-risk signal directly in this modal so coaches
   *  see it at the point of decision, not on a separate page. */
  foster?: FosterMetrics | null;
}> = ({ row, onClose, lang = "EN", trainingMode = "auto", foster = null }) => {
  const displayAction = resolveDisplayAction(row);
  const cfg = STATE_CONFIG[displayAction ?? ""] ?? UNKNOWN_STATE;
  const verdict = getIcelandicVerdict(displayAction, row._injury_status, row._injury_body_part, lang);
  const isInjured =
    row._injury_status === "injured" ||
    row._injury_status === "rehabilitation" ||
    row._injury_status === "rtp_training";
  const isIll = isInjured && isIllnessRecord(row._injury_body_part);
  const final = row._final_recommendation_decision?.finalRecommendation ?? null;

  const confidenceRaw = final?.confidence ?? row._final_recommendation_decision?.confidence ?? null;
  const confidence = confidenceToBand(confidenceRaw);

  const primaryDriver = final?.primaryDrivers?.[0] ?? null;
  const zText = zScoreToText(row._z_today);
  const trendDir = row._neural_volatility_intelligence?.trendState?.direction;
  const trendText = trendToText(trendDir) ?? deltaToText(row._dz);
  const primarySentence = buildPrimaryDriverSentence(primaryDriver, zText, trendText);
  const allSecondary = buildSecondaryLabels(final?.primaryDrivers, primaryDriver?.key);
  const actionBlock = buildCoachActionBlock(displayAction, final, {
    status: row._injury_status ?? null,
    bodyPart: row._injury_body_part ?? null,
    rtpStage: row._injury_rtp_stage ?? null,
    isIllness: isIllnessRecord(row._injury_body_part),
  });
  const decisionReasons = buildDecisionReasons(
    row._final_recommendation_decision ?? null,
    displayAction
  );

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Trend forecast — fits a linear trend over the last 14 days of STEN
  // and projects 3 days out. Pure deterministic, fetched once on modal
  // open. Surfaced as a one-line hint above the AI summary so coach gets
  // the forward-looking signal instantly (no AI generation wait).
  const [trendForecast, setTrendForecast] = useState<{
    text: string;
    direction: "improving" | "stable" | "declining" | "sharply_declining";
    projectedSten3d: number | null;
    todaySten: number | null;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/player/${row.player_id}/trend-forecast?lang=${lang}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        if (json?.text && json?.payload) {
          setTrendForecast({
            text: json.text as string,
            direction: json.payload.direction,
            projectedSten3d: json.payload.projectedSten3d ?? null,
            todaySten: json.payload.todaySten ?? null,
          });
        }
      } catch { /* silent — trend hint is optional */ }
    })();
    return () => { alive = false; };
  }, [row.player_id, lang]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-2xl rounded-xl border ${cfg.cardBorderClass} bg-white shadow-2xl overflow-y-auto max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colour bar */}
        <div className={`${cfg.topBarClass} h-2 w-full`} />

        <div className="flex flex-col gap-6 p-8">
          {/* Header — leads with plain-Icelandic verdict so coach gets clear answer first */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">{row.full_name}</h2>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-lg font-bold ${cfg.badgeBgClass} ${cfg.badgeTextClass}`}
                  title={verdict.recommendation}
                >
                  {verdict.icon} {verdict.label}
                </span>
                {confidence && (
                  <span className="text-base text-slate-500 font-medium">{confidence} confidence</span>
                )}
                <EstimatedMarker row={row} lang={lang} size="md" />
              </div>
              <p className="mt-2 text-sm text-slate-600 italic">{verdict.sentence}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>

          {/* Override warning — shown when coach set FULL but STEN signals otherwise */}
          {(() => {
            const hasSten = row._z_today != null && Number.isFinite(row._z_today);
            const sten = hasSten ? zToSten(row._z_today!) : null;
            const warn = stenOverrideWarning(displayAction, sten);
            if (!warn) return null;
            return (
              <div className={`flex items-start gap-3 rounded-xl border px-5 py-4 ${
                warn.level === "critical"
                  ? "bg-rose-50 border-rose-300"
                  : "bg-amber-50 border-amber-300"
              }`}>
                <svg className={`mt-0.5 shrink-0 ${warn.level === "critical" ? "text-rose-500" : "text-amber-500"}`} width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1L1 14h14L8 1zm0 3l5.2 9H2.8L8 4zm-.75 3v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z"/>
                </svg>
                <div>
                  <p className={`text-sm font-bold leading-snug ${warn.level === "critical" ? "text-rose-800" : "text-amber-800"}`}>
                    Engine conflict — review before training
                  </p>
                  <p className={`text-sm leading-snug mt-0.5 ${warn.level === "critical" ? "text-rose-700" : "text-amber-700"}`}>
                    {warn.text}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Trend forecast — 14-day STEN slope projected 3 days forward.
              Deterministic, instant — coach sees the forward-looking
              signal before the AI summary loads. Hidden when trend is
              stable / low-confidence (the formatter returns "" then). */}
          {trendForecast && trendForecast.text && (() => {
            const tone = trendForecast.direction === "improving"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : trendForecast.direction === "sharply_declining"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-amber-200 bg-amber-50 text-amber-900";
            const icon = trendForecast.direction === "improving" ? "↗" : "↘";
            return (
              <div className={`rounded-xl border-2 px-5 py-4 ${tone}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 text-2xl leading-none">{icon}</span>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-widest font-semibold opacity-70">
                      {lang === "IS" ? "Spá fyrir næstu 3 daga" : "3-day forecast"}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-snug">
                      {trendForecast.text}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* AI summary — 3-4 sentence English narrative synthesising snapshot + pattern. */}
          <PlayerSummaryCard
            playerId={row.player_id}
            coachVerdict={{
              state:    String(displayAction ?? "unknown"),
              headline: String(verdict ?? ""),
              why_lines: decisionReasons.map((r) => String(r)),
              action:    actionBlock?.headline
                ? `${actionBlock.headline}${actionBlock.details.length ? ". " + actionBlock.details.join(". ") : ""}`
                : undefined,
            }}
          />

          {/* Q&A dropdown — coach asks specific question, gets focused English
              answer. English-only because Icelandic LLM output had spelling
              errors. Different cognitive mode from Summary: lean-forward. */}
          <PlayerAskCard playerId={row.player_id} />

          {/* Active Injury / Illness context — shown FIRST when player is injured/sick/RTP */}
          {isInjured && (
            <div
              className={`rounded-xl border-2 px-5 py-4 ${
                isIll ? "border-teal-300 bg-teal-50" : "border-violet-300 bg-violet-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <p
                  className={`text-xs uppercase tracking-widest font-semibold ${
                    isIll ? "text-teal-700" : "text-violet-700"
                  }`}
                >
                  {isIll ? `🤒 ${t("activeIllness", lang)}` : t("activeInjury", lang)}
                </p>
                {row._injury_severity && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${
                      isIll ? "bg-teal-100 text-teal-700" : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {row._injury_severity}
                  </span>
                )}
                {!isIll && row._injury_rtp_stage != null && (
                  <span className="rounded-md bg-white border border-violet-200 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                    RTP stage {row._injury_rtp_stage}/5
                  </span>
                )}
              </div>
              <p className="text-base font-bold text-slate-900">
                {isIll
                  ? row._injury_type ?? t("illness", lang)
                  : `${row._injury_body_part ?? t("injury", lang)}${row._injury_type ? ` — ${row._injury_type}` : ""}`}
              </p>
              {row._injury_estimated_return && (
                <p className={`mt-1 text-sm ${isIll ? "text-teal-700" : "text-violet-700"}`}>
                  {t("estimatedReturn", lang)}:{" "}
                  <span className="font-semibold">{row._injury_estimated_return}</span>
                </p>
              )}
            </div>
          )}

          {/* Þjálfara-leiðbeining — explanation engine output */}
          {(() => {
            // Map row data into explain.ts input
            const verdictKey = isIll
              ? row._injury_status === "injured" ? "ILL" : "RECOVERING_ILL"
              : isInjured
              ? row._injury_status === "injured" ? "INJURED"
                : row._injury_status === "rehabilitation" ? "REHAB"
                : row._injury_status === "rtp_training" ? "RTP" : "INJURED"
              : (displayAction as ExplainInput["verdict"]) ?? "NO_DATA";

            // Override context — pass the readiness side so the engine can
            // surface the conflict when displayAction=FULL but STEN is low.
            // Mirrors the same logic as stenOverrideWarning() above so the
            // banner and the explanation stay in sync.
            const stenForExplain = row._z_today != null && Number.isFinite(row._z_today)
              ? zToSten(row._z_today!)
              : null;
            const isOverridden = displayAction === "FULL" && stenForExplain != null && stenForExplain <= 4;
            const systemRec: ExplainInput["system_recommendation"] =
              !isOverridden ? null
                : (stenForExplain != null && stenForExplain <= 2) ? "RECOVERY"
                : "MODIFIED";
            // trendText is computed earlier in the same render scope
            const trendForExplain = (typeof trendText === "string" && trendText.length) ? trendText : null;

            const explanation = buildVerdictExplanation({
              verdict: verdictKey,
              composite_score: row._indoor_composite_score ?? null,
              composite_band: row._indoor_composite_band ?? null,
              acwr_value: row._indoor_acwr_value ?? null,
              acwr_flag: row._indoor_acwr_flag ?? null,
              mcburnie_ratio: row._indoor_mcburnie_ratio ?? null,
              mcburnie_flag: row._indoor_mcburnie_flag ?? null,
              indoor_sessions_7d: row._indoor_sessions_7d ?? null,
              injury_status: row._injury_status ?? null,
              injury_body_part: row._injury_body_part ?? null,
              injury_type: row._injury_type ?? null,
              injury_rtp_stage: row._injury_rtp_stage ?? null,
              injury_estimated_return: row._injury_estimated_return ?? null,
              injury_severity: row._injury_severity ?? null,
              has_readiness_today: row.sleep_quality != null || row.fatigue_energy != null,
              fatigue_energy: row.fatigue_energy ?? null,
              muscle_soreness: row.muscle_soreness ?? null,
              sleep_quality: row.sleep_quality ?? null,
              trained_recently: row._yesterday_load?.playerLoad != null && row._yesterday_load.playerLoad > 0,
              readiness_sten: stenForExplain,
              readiness_trend: trendForExplain,
              is_overridden: isOverridden,
              system_recommendation: systemRec,
              // Composite concern context — same signals Daily Briefing uses
              // for Top Concerns. Lets the FULL branch surface the
              // watch-this state when MLI/fatigue/PL spike are flagging
              // despite ACWR + composite_band looking fine.
              composite_concern_level: row._today_composite_concern ?? null,
              fatigue_type: row._today_fatigue_type ?? null,
              pl_spike_ratio: row._today_player_load_spike ?? null,
              // Decide which load pipeline is primary for this player
              // today. Team-level trainingMode wins when set explicitly
              // (Settings toggle); otherwise fall back to per-player
              // heuristic based on session counts.
              //
              //   trainingMode = 'indoor' or 'outdoor' → force that pipeline
              //   trainingMode = 'auto' (default):
              //     - 3+ indoor sessions/week  → höll-mode dominant
              //     - any outdoor PL or concern → outdoor pipeline
              //     - 1–2 indoor sessions only → indoor (sparse but real)
              //     - nothing                  → null (no data line)
              //
              // For Iceland football this means winter (höll season) shows
              // Indoor numbers, summer (gervigras) shows GPS numbers, and
              // the coach can flip it manually when the team transitions.
              primary_load_source: (() => {
                if (trainingMode === "indoor") return "indoor";
                if (trainingMode === "outdoor") return "outdoor";
                const indoor7d = row._indoor_sessions_7d ?? 0;
                const hasOutdoorActivity =
                  (row._yesterday_load?.playerLoad ?? 0) > 0
                  || row._today_composite_concern != null
                  || row._today_player_load_spike != null;
                if (indoor7d >= 3) return "indoor";
                if (hasOutdoorActivity) return "outdoor";
                if (indoor7d >= 1) return "indoor";
                return null;
              })(),
            }, lang);

            const containerColor =
              isIll
                ? "bg-teal-50 border-teal-200"
                : isInjured
                ? "bg-violet-50 border-violet-200"
                : displayAction === "RECOVERY" || displayAction === "HOLD"
                ? "bg-rose-50 border-rose-200"
                : displayAction === "MODIFIED"
                ? "bg-amber-50 border-amber-200"
                : displayAction === "FULL"
                ? "bg-emerald-50 border-emerald-200"
                : "bg-slate-50 border-slate-200";

            return (
              <div className={`rounded-xl border px-5 py-4 space-y-3 ${containerColor}`}>
                {/* WHY — top driving signals */}
                {explanation.why.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">
                      {t("why", lang)}
                    </p>
                    <ul className="space-y-0.5 text-sm text-slate-800">
                      {explanation.why.map((line, i) => (
                        <li key={i} className="leading-snug">· {line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* ACTION — concrete coaching action */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">
                    {t("coachGuidance", lang)}
                  </p>
                  <p className="text-base font-semibold text-slate-900 leading-snug">
                    {explanation.action || verdict.recommendation}
                  </p>
                </div>
                {/* VERIFY — what to check (only if relevant) */}
                {explanation.verify.length > 0 && (
                  <div className="border-t border-current border-opacity-20 pt-3">
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">
                      {t("verify", lang)}
                    </p>
                    <ul className="space-y-0.5 text-sm text-slate-700">
                      {explanation.verify.map((line, i) => (
                        <li key={i} className="leading-snug">⚠ {line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* ASK — suggested question for player (only if data missing) */}
                {explanation.ask && (
                  <div className="border-t border-current border-opacity-20 pt-3">
                    <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">
                      {t("askPlayer", lang)}
                    </p>
                    <p className="text-sm italic text-slate-700">"{explanation.ask}"</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Primary driver */}
          {primarySentence && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Primary driver</p>
              <p className="text-lg text-slate-800 leading-snug font-medium">{primarySentence}</p>
            </div>
          )}

          {/* Secondary drivers */}
          {allSecondary.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Secondary drivers</p>
              <div className="space-y-2">
                {allSecondary.map((d, i) => (
                  <p key={i} className="text-base text-slate-600 leading-snug">· {d}</p>
                ))}
              </div>
            </div>
          )}

          {/* Why this decision? */}
          {decisionReasons.length > 0 && (
            <div className={`rounded-xl border px-5 py-4 ${
              displayAction === "RECOVERY" || displayAction === "HOLD"
                ? "bg-rose-50 border-rose-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Why this decision?</p>
              <div className="space-y-1.5">
                {decisionReasons.map((r, i) => (
                  <p key={i} className={`text-sm leading-snug font-medium ${
                    i === 0 && (displayAction === "RECOVERY" || displayAction === "HOLD")
                      ? "text-rose-800"
                      : i === 0
                      ? "text-amber-800"
                      : "text-slate-700"
                  }`}>
                    {i === 0 ? r : `· ${r}`}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Neural signal — STEN score + baseline comparison */}
          {(row._z_today != null || trendText) && (() => {
            const hasSten = row._z_today != null && Number.isFinite(row._z_today);
            const sten = hasSten ? zToSten(row._z_today!) : null;
            const band = sten != null ? stenToBand(sten) : null;
            return (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
                <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-3">Baseline readiness (STEN)</p>

                {hasSten && sten != null && band != null && (
                  <div className="flex items-start gap-4 mb-3">
                    {/* Big STEN number */}
                    <div className={`rounded-xl px-4 py-2 ${band.chipBg} flex flex-col items-center min-w-[5rem]`}>
                      <span className={`text-3xl font-black leading-none ${band.chipText}`}>{sten}</span>
                      <span className={`text-[10px] font-bold mt-0.5 uppercase tracking-wider ${band.chipText}`}>/ 10</span>
                    </div>
                    {/* Band label + explanation */}
                    <div className="flex flex-col gap-1 justify-center">
                      <span className={`text-base font-bold ${band.textColor}`}>{band.label}</span>
                      <p className="text-sm text-slate-600 leading-snug">{band.readinessText}</p>
                    </div>
                  </div>
                )}

                {/* STEN scale reference */}
                {hasSten && (
                  <div className="flex items-center gap-0.5 mb-3">
                    {[1,2,3,4,5,6,7,8,9,10].map((n) => {
                      const isActive = sten != null && Math.round(sten) === n;
                      return (
                        <div
                          key={n}
                          className={`h-2 flex-1 rounded-sm transition-all ${
                            isActive
                              ? (n <= 2 ? "bg-rose-500" : n <= 4 ? "bg-amber-400" : n <= 6 ? "bg-slate-400" : "bg-emerald-500")
                              : "bg-slate-200"
                          }`}
                          title={`STEN ${n}`}
                        />
                      );
                    })}
                  </div>
                )}
                {hasSten && (
                  <div className="flex justify-between text-[10px] text-slate-400 mb-3 px-0.5">
                    <span>Very low</span>
                    <span>Normal</span>
                    <span>Peak form</span>
                  </div>
                )}

                <div className="space-y-1.5 pt-1 border-t border-slate-200">
                  {zText && <p className="text-sm text-slate-600">Load is <span className="font-semibold text-slate-800">{zText}</span> vs. this player's own average</p>}
                  {trendText && <p className="text-sm text-slate-600">Trajectory: <span className="font-semibold text-slate-800">{trendText}</span></p>}
                </div>
              </div>
            );
          })()}

          {/* Readiness ↔ Load detail */}
          <ReadinessLoadDetail row={row} lang={lang} foster={foster} />

          {/* Action */}
          <div className={`rounded-xl border ${cfg.actionBgClass} px-5 py-5`}>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Coach action</p>
            <p className={`text-xl font-bold leading-snug ${cfg.actionHeadlineClass}`}>→ {actionBlock.headline}</p>
            {actionBlock.details.length > 0 && (
              <div className="mt-3 space-y-2">
                {actionBlock.details.map((d, i) => (
                  <p key={i} className="text-base text-slate-700 leading-snug">· {d}</p>
                ))}
              </div>
            )}
            {(final?.recoveryFocus ?? []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                {(final?.recoveryFocus ?? []).map((tag, i) => {
                  const t = RECOVERY_FOCUS_LABEL[tag];
                  return t ? <p key={i} className="text-base text-slate-500 leading-snug">· {t}</p> : null;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Readiness ↔ Load helpers ─────────────────────────────────────────────
// Readiness questions: 1–5 scale. ALL metrics same direction:
//   1–2 = bad, 3 = moderate, 4–5 = good.
// Soreness: 1 = very sore (bad/red), 4 = fresh (good/green), 5 = very fresh.
// No inversion needed — low score always = worse for every metric.

type ReadinessItem = {
  label: string;
  shortLabel: string;   // IS short ("Svefn", "Verk", …)
  shortLabelEn: string; // EN short ("Sleep", "Soreness", …) — shown in EN mode
  value: number;
};

function readinessColor(value: number): { bg: string; text: string } {
  if (value <= 2) return { bg: "bg-rose-100", text: "text-rose-700" };
  if (value <= 3) return { bg: "bg-amber-100", text: "text-amber-700" };
  return { bg: "bg-emerald-100", text: "text-emerald-700" };
}

/** Plain-language descriptor for a wellness 1–5 score. Returned only for
 *  the extreme bands (≤ 2 = bad, ≥ 4 = good) so coach gets an instant
 *  qualitative read for the chips that actually matter. The middle band
 *  (=3) returns null — "OK" labels add visual noise without insight.
 *  Soreness has the same scale convention as the others (1 = sore, 5 = fresh)
 *  so the same mapping works across all four metrics. */
function readinessDescriptor(value: number, lang: Lang = "EN"): string | null {
  if (value <= 1) return lang === "IS" ? "Slæmt" : "Bad";
  if (value <= 2) return lang === "IS" ? "Lélegt" : "Poor";
  if (value >= 5) return lang === "IS" ? "Frábært" : "Great";
  if (value >= 4) return lang === "IS" ? "Gott" : "Good";
  return null;
}

/** Build a coach-friendly tooltip for a wellness chip. Combines the score,
 *  the qualitative band and (when available) the descriptor — so coach
 *  hovering "Svefn 2" sees "Sleep quality: 2/5 — Lélegt". */
function readinessTooltip(label: string, value: number, lang: Lang = "EN"): string {
  const desc = readinessDescriptor(value, lang);
  return desc ? `${label}: ${value}/5 — ${desc}` : `${label}: ${value}/5`;
}

/** Day-over-day delta badge derived from existing _dz field (z-score
 *  change vs yesterday). Coach sees direction-of-change at a glance
 *  without having to remember yesterday's STEN. Threshold ±0.4 is one
 *  STEN band — anything smaller is noise.
 *  Returns null when _dz is missing or under threshold. */
function buildDeltaBadge(dz: number | null | undefined, lang: Lang = "EN"): {
  text: string; tone: "up" | "down";
} | null {
  if (dz == null || !Number.isFinite(dz)) return null;
  const big = Math.abs(dz) >= 0.8;
  if (dz >= 0.4) {
    return {
      text: lang === "IS"
        ? (big ? "↑↑ Mun betri en í gær" : "↑ Betri en í gær")
        : (big ? "↑↑ Much better than yesterday" : "↑ Better than yesterday"),
      tone: "up",
    };
  }
  if (dz <= -0.4) {
    return {
      text: lang === "IS"
        ? (big ? "↓↓ Mun verri en í gær" : "↓ Verri en í gær")
        : (big ? "↓↓ Much worse than yesterday" : "↓ Worse than yesterday"),
      tone: "down",
    };
  }
  return null;
}

function getReadinessItems(row: DecisionSummaryRow): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  if (row.sleep_quality != null) items.push({ label: "Sleep quality", shortLabel: "Svefn", shortLabelEn: "Sleep", value: row.sleep_quality });
  if (row.muscle_soreness != null) items.push({ label: "Soreness", shortLabel: "Verk", shortLabelEn: "Soreness", value: row.muscle_soreness });
  if (row.fatigue_energy != null) items.push({ label: "Energy", shortLabel: "Orka", shortLabelEn: "Energy", value: row.fatigue_energy });
  if (row.stress_mood != null) items.push({ label: "Mood", shortLabel: "Streita", shortLabelEn: "Mood", value: row.stress_mood });
  return items;
}

// Each chip carries a plain-language visible `label` plus the raw S&C `code`
// and a one-line `tip` (hover) so a non-S&C coach reads "High-speed" and can
// still see it means velocity band 5 on hover. Explainability manifesto: plain
// by default, jargon a hover away.
type LoadItem = { label: string; code: string; value: number; unit: string; tip: string };

function getLoadItems(row: DecisionSummaryRow): LoadItem[] {
  const load = row._yesterday_load;
  const items: LoadItem[] = [];
  if (load) {
    if (load.totalDistance != null && load.totalDistance > 0)
      items.push({ label: "Distance", code: "Dist", value: Math.round(load.totalDistance), unit: "m", tip: "Total distance covered last session" });
    if (load.playerLoad != null && load.playerLoad > 0)
      items.push({ label: "Body load", code: "PL", value: Math.round(load.playerLoad * 10) / 10, unit: "", tip: "Player Load — overall mechanical workload measured by the GPS/IMU unit" });
    if (load.velocityBand5TotalDistance != null && load.velocityBand5TotalDistance > 0)
      items.push({ label: "High-speed", code: "VB5", value: Math.round(load.velocityBand5TotalDistance), unit: "m", tip: "High-speed running distance (velocity band 5)" });
    if (load.velocityBand6TotalDistance != null && load.velocityBand6TotalDistance > 0)
      items.push({ label: "Sprint", code: "VB6", value: Math.round(load.velocityBand6TotalDistance), unit: "m", tip: "Sprint distance (velocity band 6)" });
    if (load.accelBand2to3Efforts != null && load.accelBand2to3Efforts > 0)
      items.push({ label: "Accels", code: "Acc", value: Math.round(load.accelBand2to3Efforts), unit: "", tip: "Hard accelerations (band 2–3 efforts)" });
    if (load.decelBand2to3Efforts != null && load.decelBand2to3Efforts > 0)
      items.push({ label: "Braking", code: "Dec", value: Math.round(load.decelBand2to3Efforts), unit: "", tip: "Hard decelerations / braking (band 2–3 efforts)" });
  }
  // Composite scores (fetched independently from MLI/Metabolic APIs)
  if (row._yesterday_mli != null)
    items.push({ label: "Muscle load", code: "MLI", value: Math.round(row._yesterday_mli * 10) / 10, unit: "", tip: "Mechanical Load Index — estimate of muscular strain" });
  if (row._yesterday_metabolic_score != null)
    items.push({ label: "Metabolic", code: "Metab", value: Math.round(row._yesterday_metabolic_score), unit: "", tip: "Metabolic load score — energy-system demand" });
  return items;
}

// ── Soreness ↔ Load explanatory text ─────────────────────────────────────
// When soreness is high (≤ 2), highlight which GPS metrics from yesterday
// were elevated to help the coach understand the likely cause.

function buildSorenessLoadNote(row: DecisionSummaryRow): string | null {
  const soreness = row.muscle_soreness;
  if (soreness == null || soreness > 2) return null; // only for high soreness (1–2)

  const load = row._yesterday_load;
  if (!load) return null;

  const elevated: string[] = [];

  // Check each metric — flag if present and non-trivial
  if (load.velocityBand6TotalDistance != null && load.velocityBand6TotalDistance > 50)
    elevated.push(`VB6 ${Math.round(load.velocityBand6TotalDistance)}m`);
  if (load.decelBand2to3Efforts != null && load.decelBand2to3Efforts > 15)
    elevated.push(`Dec ${Math.round(load.decelBand2to3Efforts)}`);
  if (load.accelBand2to3Efforts != null && load.accelBand2to3Efforts > 15)
    elevated.push(`Acc ${Math.round(load.accelBand2to3Efforts)}`);
  if (load.totalDistance != null && load.totalDistance > 5000)
    elevated.push(`Dist ${Math.round(load.totalDistance).toLocaleString("is-IS")}m`);

  // MLI / Metabolic composite
  if (row._yesterday_mli != null && row._yesterday_mli >= 60)
    elevated.push(`MLI ${Math.round(row._yesterday_mli)}`);
  if (row._yesterday_metabolic_score != null && row._yesterday_metabolic_score >= 60)
    elevated.push(`Metab ${Math.round(row._yesterday_metabolic_score)}`);

  if (!elevated.length) return null;
  return `Possible load link: ${elevated.join(", ")} yesterday`;
}

/**
 * Yesterday's sRPE vs the planned intensity for its MD-day (× match minutes).
 * Always shows the logged RPE; upgrades to a within/under/over/missed-topup flag
 * when the MD-day resolves. Descriptive planning feedback — never the readiness colour.
 */
const RpeExpectationChip: FC<{ row: DecisionSummaryRow; lang?: Lang; compact?: boolean }> = ({ row, lang = "EN", compact = false }) => {
  const rpe = row._yesterday_rpe ?? null;
  if (rpe == null) return null; // no RPE logged yesterday → nothing to show
  const isEN = lang !== "IS";
  const read = evaluateRpeExpectation({
    mdDay: row._yesterday_md_day ?? null,
    matchMinutes: row._yesterday_match_minutes ?? null,
    actualRpe: rpe,
  });
  const known = isRpeExpectationActionable(read); // MD-day resolved → real verdict
  const tone = !known
    ? "border-slate-200 bg-slate-50 text-slate-600"
    : read.status === "within"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-300 bg-amber-50 text-amber-900";
  const prefix = isEN ? "Yesterday" : "Í gær";
  const text = known
    ? (isEN ? read.verdict.en : read.verdict.is)
    : (isEN ? `RPE ${rpe} logged (no MD-day plan to compare)` : `RPE ${rpe} skráð (engin MD-áætlun til að bera saman)`);
  const tip = known
    ? (isEN
        ? `Judged against the ${read.bandSource} band for ${read.mdDay}${read.expected ? ` (${read.expected[0]}–${read.expected[1]})` : ""}. Planning feedback — not the readiness colour.`
        : `Metið gegn ${read.bandSource === "coach" ? "þjálfara" : "sjálfgefnu"} bandi fyrir ${read.mdDay}${read.expected ? ` (${read.expected[0]}–${read.expected[1]})` : ""}. Áætlunar-endurgjöf — ekki readiness-liturinn.`)
    : (isEN ? "Session RPE logged yesterday (no matching MD-day plan)." : "sRPE skráð í gær (engin MD-áætlun passar).");
  return (
    <div className="w-full mt-0.5">
      <span
        className={`inline-flex items-start gap-1 rounded border leading-snug ${tone} ${compact ? "px-1.5 py-0.5 text-[9px]" : "px-3 py-1.5 text-[12.5px]"}`}
        title={tip}
      >
        <span className="font-semibold shrink-0">{prefix}:</span>
        <span>{text}</span>
      </span>
    </div>
  );
};

/** Compact readiness + load strip for player cards */
const ReadinessLoadStrip: FC<{ row: DecisionSummaryRow; lang?: Lang }> = ({ row, lang = "EN" }) => {
  const readiness = getReadinessItems(row);
  const load = getLoadItems(row);
  if (readiness.length === 0 && load.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
      {/* Readiness pills — score + qualitative descriptor when extreme */}
      {readiness.length > 0 && (
        <div className="flex items-center gap-1">
          {readiness.map((item) => {
            const col = readinessColor(item.value);
            const desc = readinessDescriptor(item.value, lang);
            return (
              <span
                key={item.shortLabel}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${col.bg} ${col.text}`}
                title={readinessTooltip(item.label, item.value, lang)}
              >
                <span>{lang === "IS" ? item.shortLabel : item.shortLabelEn} {item.value}</span>
                {desc && <span className="opacity-80 font-medium">· {desc}</span>}
              </span>
            );
          })}
        </div>
      )}
      {/* Load pills */}
      {load.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[8px] text-slate-400 font-semibold uppercase">Load</span>
          {load.map((item) => {
            // Highlight MLI/Metabolic if high
            const isComposite = item.code === "MLI" || item.code === "Metab";
            const isHigh = isComposite && item.value >= 60;
            const isVeryHigh = isComposite && item.value >= 75;
            const pillClass = isVeryHigh
              ? "bg-rose-100 text-rose-700"
              : isHigh
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600";
            return (
              <span
                key={item.code}
                className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium ${pillClass}`}
                title={`${item.label} (${item.code}) — ${item.tip}`}
              >
                {item.label} {item.value.toLocaleString("is-IS")}{item.unit ? <span className="text-[8px] opacity-60">{item.unit}</span> : null}
              </span>
            );
          })}
        </div>
      )}
      {/* Soreness ↔ Load note */}
      {(() => {
        const note = buildSorenessLoadNote(row);
        if (!note) return null;
        return (
          <div className="w-full mt-0.5">
            <p className="text-[9px] text-rose-600 font-semibold leading-tight">{note}</p>
          </div>
        );
      })()}
      {/* VBT fatigue flags */}
      {row._vbt_fatigue_flags && row._vbt_fatigue_flags.length > 0 && (
        <div className="w-full mt-0.5 flex flex-wrap gap-1">
          {row._vbt_fatigue_flags.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700"
              title={`${f.exerciseName} @ ${f.loadKg}kg: ${f.velocityDropPct}% velocity drop (baseline ${f.baselineVelocity} → ${f.worstVelocity} m/s)`}
            >
              ⚡ {f.exerciseName.split(" ")[0]} {f.velocityDropPct}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** Detailed readiness + load section for player modal */
const ReadinessLoadDetail: FC<{
  row: DecisionSummaryRow;
  lang?: Lang;
  /** Foster Monotony & Strain (Foster 1998) for this player — surfaced
   *  here so Lite-tier coaches see overtraining risk inside the per-player
   *  modal instead of having to navigate to /coach/load-intelligence. */
  foster?: FosterMetrics | null;
}> = ({ row, lang = "EN", foster = null }) => {
  const readiness = getReadinessItems(row);
  const load = getLoadItems(row);
  if (readiness.length === 0 && load.length === 0) return null;

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
      <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-3">Readiness &amp; Load context</p>
      <div className="flex flex-col gap-3">
        {/* Readiness bars */}
        {readiness.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Readiness (1–5)</p>
            {readiness.map((item) => {
              const col = readinessColor(item.value);
              const pct = (item.value / 5) * 100;
              return (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-20 shrink-0">{item.label}</span>
                  <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: item.value <= 2 ? "#c26449" : item.value <= 3 ? "#de9328" : "#47a06f" }}
                    />
                  </div>
                  <span className={`text-sm font-bold tabular-nums w-6 text-right ${col.text}`}>{item.value}</span>
                </div>
              );
            })}
          </div>
        )}
        {/* Sore / stiff areas — shown when player reported specific body parts */}
        {row.sore_areas && row.sore_areas.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1.5">Sore / stiff areas</p>
            <div className="flex flex-wrap gap-1.5">
              {row.sore_areas.map((area) => (
                <span
                  key={area}
                  className="inline-flex rounded-full border border-red-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-red-700 capitalize"
                >
                  {area.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Load metrics */}
        {load.length > 0 && (() => {
          // Build date label from the same signalsDate the load-signals block uses,
          // so the coach can see which day this GPS snapshot is for (e.g. 13.04).
          const signalsDate = row._load_signals_date ?? null;
          const todayIsoForLoad = new Date().toISOString().slice(0, 10);
          const loadDateLabel = !signalsDate
            ? null
            : (() => {
                const [, m, d] = signalsDate.split("-");
                return d && m ? `${d}.${m}` : signalsDate;
              })();
          const loadHeading = !signalsDate
            ? "Yesterday's GPS load"
            : signalsDate === todayIsoForLoad
            ? `Today's GPS load (${loadDateLabel})`
            : `Latest GPS load (${loadDateLabel})`;
          return (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">{loadHeading}</p>
            <div className="flex flex-wrap gap-3">
              {load.map((item) => {
                const isComposite = item.code === "MLI" || item.code === "Metab";
                const isHigh = isComposite && item.value >= 60;
                const isVeryHigh = isComposite && item.value >= 75;
                const borderClass = isVeryHigh
                  ? "border-rose-300 bg-rose-50"
                  : isHigh
                  ? "border-amber-300 bg-amber-50"
                  : "border-slate-200 bg-white";
                const valueClass = isVeryHigh
                  ? "text-rose-700"
                  : isHigh
                  ? "text-amber-700"
                  : "text-slate-800";
                return (
                  <div key={item.code} title={`${item.label} (${item.code}) — ${item.tip}`} className={`flex flex-col items-center rounded-lg border px-3 py-2 min-w-[4.5rem] ${borderClass}`}>
                    <span className="text-[9px] text-slate-400 font-semibold uppercase">{item.label}</span>
                    <span className={`text-lg font-bold tabular-nums ${valueClass}`}>{item.value.toLocaleString("is-IS")}</span>
                    {item.unit && <span className="text-[9px] text-slate-400">{item.unit}</span>}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}
        {/* RPE vs planned intensity for yesterday's MD-day (× match minutes). */}
        {row._yesterday_rpe != null && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
              {lang !== "IS" ? "Intensity vs plan" : "Ákefð vs áætlun"}
            </p>
            <RpeExpectationChip row={row} lang={lang} />
          </div>
        )}
        {/* Soft check-in-reliability note — descriptive only, never the verdict/colour.
            Tells the coach WHY a flag might rest on an unreliable personal norm. */}
        {row._checkin_reliability && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
              {lang !== "IS" ? "Norm reliability" : "Áreiðanleiki viðmiðs"}
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="mt-px text-amber-600" aria-hidden>ⓘ</span>
              <p className="text-[12px] leading-snug text-amber-900">
                {lang !== "IS" ? row._checkin_reliability.reason : row._checkin_reliability.reasonIs}
              </p>
            </div>
          </div>
        )}
        {/* Today's load signals — interpretation of raw GPS into actionable bands */}
        {(() => {
          const nbs = row._today_nbs;
          const comp = row._today_composite_score;
          const concern = row._today_composite_concern ?? null;
          const fatigue = row._today_fatigue_type ?? null;
          const spike = row._today_player_load_spike ?? null;
          const signalsDate = row._load_signals_date ?? null;
          const hasFoster =
            foster != null &&
            foster.monotony != null &&
            foster.strain != null;
          const hasAny =
            (nbs != null && Number.isFinite(nbs)) ||
            (comp != null && Number.isFinite(comp)) ||
            (spike != null && Number.isFinite(spike)) ||
            hasFoster;
          if (!hasAny) return null;

          // Heading reflects the date the signals were computed for —
          // matches the "Yesterday's GPS load" block above when today has no sync.
          const todayIso = new Date().toISOString().slice(0, 10);
          const signalsDateLabel = !signalsDate
            ? null
            : (() => {
                const [, m, d] = signalsDate.split("-");
                return d && m ? `${d}.${m}` : signalsDate;
              })();
          const heading = !signalsDate
            ? "Load signals"
            : signalsDate === todayIso
            ? `Today's load signals (${signalsDateLabel})`
            : `Load signals (${signalsDateLabel})`;

          // NBS tone: <0.34 normal, 0.34–0.66 elevated, ≥0.66 high
          const nbsTone = nbs == null ? null
            : nbs >= 0.66 ? { cls: "border-rose-300 bg-rose-50 text-rose-700", label: "High" }
            : nbs >= 0.34 ? { cls: "border-amber-300 bg-amber-50 text-amber-700", label: "Elevated" }
            : { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Normal" };
          // Composite concern tone mirrors the 0.15/0.40/0.68 bands from
          // computeCompositeLoadConcern so colours match the quadrant legend.
          const compTone = concern == null ? null
            : concern === "high" ? { cls: "border-rose-300 bg-rose-50 text-rose-700", label: "Há áhætta" }
            : concern === "moderate" ? { cls: "border-orange-200 bg-orange-50 text-orange-700", label: "Hækkuð" }
            : concern === "low" ? { cls: "border-slate-200 bg-slate-50 text-slate-600", label: "Væg" }
            : { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Engin" };

          // Fatigue-type label (short, Icelandic). Only show when non-normal.
          const fatigueLabel = !fatigue || fatigue === "normal" ? null
            : fatigue === "mechanical_fatigue" ? "Vélrænt álag"
            : fatigue === "metabolic_fatigue" ? "Efnaskiptaálag"
            : fatigue === "global_fatigue" ? "Heildarþreyta"
            : fatigue;

          return (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                {heading}
              </p>
              <div className="flex flex-wrap gap-3">
                {nbs != null && nbsTone ? (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${nbsTone.cls}`}
                    title="Neuromuscular burden score — weighted GPS signals (HIR, decel, density, max vel, band6) vs 28-day baseline."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">GPS burden</span>
                    <span className="text-lg font-bold tabular-nums">{nbs.toFixed(2)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{nbsTone.label}</span>
                  </div>
                ) : null}
                {comp != null && compTone ? (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${compTone.cls}`}
                    title="Composite load concern — RPE ACWR × 0.55 + GPS burden × 0.45, with escalation when external load state is elevated/high."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">Composite</span>
                    <span className="text-lg font-bold tabular-nums">{comp.toFixed(2)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{compTone.label}</span>
                  </div>
                ) : null}
                {spike != null ? (
                  <div
                    className="flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 min-w-[7rem]"
                    title="Today's PlayerLoad ÷ 28-day baseline. 1.0 = on baseline. >1.15 begins to feed overload risk."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70 text-slate-400">PL vs baseline</span>
                    <span className="text-lg font-bold tabular-nums text-slate-800">{spike.toFixed(2)}×</span>
                    <span className="text-[10px] text-slate-500">
                      {spike >= 1.5 ? "Heavy" : spike >= 1.15 ? "Above" : spike >= 0.85 ? "Normal" : "Light"}
                    </span>
                  </div>
                ) : null}
                {fatigueLabel ? (
                  <div className="flex flex-col rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 min-w-[7rem]">
                    <span className="text-[9px] font-semibold uppercase opacity-70 text-indigo-600">Fatigue type</span>
                    <span className="text-sm font-bold text-indigo-800 leading-tight pt-1">{fatigueLabel}</span>
                  </div>
                ) : null}
                {(() => {
                  // Foster Monotony & Strain (Foster 1998) per player —
                  // works on Lite tier from RPE × duration alone (no GPS
                  // required). Surfaces overtraining risk at the point
                  // of decision instead of forcing the coach to navigate
                  // to /coach/load-intelligence.
                  const f = foster;
                  if (!f || f.monotony == null || f.strain == null) return null;
                  const monotony = f.monotony;
                  const strain = f.strain;
                  const status = fosterStatus(monotony, strain);
                  const tone = status === "danger"
                    ? { cls: "border-rose-300 bg-rose-50 text-rose-700", label: "Danger" }
                    : status === "watch"
                    ? { cls: "border-amber-300 bg-amber-50 text-amber-700", label: "Watch" }
                    : { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Safe" };
                  return (
                    <div
                      className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${tone.cls}`}
                      title={`Foster Monotony & Strain (last 7 days). Monotony ${monotony.toFixed(2)} (${monotony > 2.0 ? "HIGH" : monotony > 1.5 ? "WATCH" : "SAFE"}) — day-to-day load variability. Strain ${Math.round(strain).toLocaleString()} AU (${strain > 6000 ? "DANGER" : strain > 4000 ? "WATCH" : "SAFE"}) — weekly load × monotony. Foster 1998 method; cutoffs tuned to our data.`}
                    >
                      <span className="text-[9px] font-semibold uppercase opacity-70">Foster strain</span>
                      <span className="text-lg font-bold tabular-nums">{Math.round(strain).toLocaleString()}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide">{tone.label} · M {monotony.toFixed(2)}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
        {/* Deceleration metrics — McBurnie et al. 2022 */}
        {(() => {
          const decelBurden = row._today_decel_burden;
          const decelBand = row._today_decel_burden_band;
          const adRatio = row._today_accel_decel_ratio;
          const loadProf = row._today_load_profile;
          const hidPct = row._today_hid_percentage;
          const resDecel = row._today_residual_decel;
          const resDecelBand = row._today_residual_decel_band;
          const hasDecel =
            (decelBurden != null && Number.isFinite(decelBurden)) ||
            (adRatio != null && Number.isFinite(adRatio)) ||
            (hidPct != null && Number.isFinite(hidPct));
          if (!hasDecel) return null;

          const decelTone = decelBand == null ? null
            : decelBand === "high" ? { cls: "border-rose-300 bg-rose-50 text-rose-700", label: "High" }
            : decelBand === "elevated" ? { cls: "border-amber-300 bg-amber-50 text-amber-700", label: "Elevated" }
            : decelBand === "moderate" ? { cls: "border-slate-200 bg-slate-50 text-slate-600", label: "Moderate" }
            : { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Low" };

          const profileLabel = loadProf === "eccentric_dominant" ? "Eccentric"
            : loadProf === "concentric_dominant" ? "Concentric"
            : loadProf === "balanced" ? "Balanced" : null;
          const profileTone = loadProf === "eccentric_dominant"
            ? "border-orange-200 bg-orange-50 text-orange-700"
            : loadProf === "concentric_dominant"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-50 text-slate-600";

          const resDecelTone = resDecelBand === "HIGH"
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : resDecelBand === "CAUTION"
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-600";

          return (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Deceleration profile
              </p>
              <div className="flex flex-wrap gap-3">
                {decelBurden != null && decelTone ? (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${decelTone.cls}`}
                    title="Standalone decel burden — high-intensity braking load vs 28d baseline. Tracks eccentric tissue stress independently from NBS."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">Decel burden</span>
                    <span className="text-lg font-bold tabular-nums">{decelBurden.toFixed(2)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{decelTone.label}</span>
                  </div>
                ) : null}
                {adRatio != null && profileLabel ? (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${profileTone}`}
                    title="Accel÷Decel ratio from high-intensity efforts. <0.7 = eccentric-dominant (ACL + quadriceps + patellar tendon risk — peak quad activation 161% MVC during deceleration per McBurnie 2022), >1.3 = concentric-dominant (hamstring + glute risk from sprint exposure)."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">Accel:Decel</span>
                    <span className="text-lg font-bold tabular-nums">{adRatio.toFixed(2)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{profileLabel}</span>
                  </div>
                ) : null}
                {hidPct != null ? (() => {
                  const hidFatigue = row._today_hid_fatigue_flag === true;
                  const hidDecline = row._today_hid_decline_pct;
                  const hasTrend = hidDecline != null && Number.isFinite(hidDecline);
                  // Color: fatigue flag → amber/rose; otherwise neutral
                  const hidBorderCls = hidFatigue
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-white";
                  const hidValueCls = hidFatigue ? "text-amber-700" : "text-slate-800";
                  // Trend arrow
                  const trendArrow = !hasTrend ? null
                    : (hidDecline as number) >= 0.20 ? "↓↓"
                    : (hidDecline as number) >= 0.10 ? "↓"
                    : (hidDecline as number) <= -0.10 ? "↑" : "→";
                  const trendColor = !hasTrend ? ""
                    : (hidDecline as number) >= 0.20 ? "text-rose-600"
                    : (hidDecline as number) >= 0.10 ? "text-amber-600"
                    : (hidDecline as number) <= -0.10 ? "text-emerald-600" : "text-slate-400";

                  return (
                    <div
                      className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${hidBorderCls}`}
                      title={hidFatigue
                        ? `HID% dropped ${((hidDecline ?? 0) * 100).toFixed(0)}% vs 7-day avg — neuromuscular fatigue signal (Harper et al. 2019). Athlete covers distance but at lower intensity.`
                        : "High-Intensity Distance % — HIR (Band5+Band6) as fraction of total distance. Declining trend signals fatigue."}
                    >
                      <span className="text-[9px] font-semibold uppercase opacity-70 text-slate-400">HID%</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${hidValueCls}`}>{(hidPct * 100).toFixed(1)}%</span>
                        {trendArrow ? (
                          <span className={`text-sm font-bold ${trendColor}`} title={hasTrend ? `${((hidDecline as number) * 100).toFixed(0)}% vs 7d avg` : undefined}>
                            {trendArrow}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {hidFatigue ? "Fatigue trend" : hidPct >= 0.30 ? "High intensity" : hidPct >= 0.20 ? "Moderate" : "Low intensity"}
                      </span>
                    </div>
                  );
                })() : null}
                {resDecel != null && resDecelBand ? (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${resDecelTone}`}
                    title="Residual Decel Index — 3-day weighted accumulation of deceleration burden. ≥100 CAUTION, ≥135 HIGH."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">Residual Decel</span>
                    <span className="text-lg font-bold tabular-nums">{resDecel.toFixed(0)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{resDecelBand}</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })()}
        {/* Indoor Load (FMP-driven, höll-mode) — shown when player has recent indoor session */}
        {(() => {
          const indoorScore = row._indoor_composite_score;
          const indoorBand = row._indoor_composite_band;
          const indoorMcburnieFlag = row._indoor_mcburnie_flag;
          const indoorSessions7d = row._indoor_sessions_7d ?? 0;
          if (indoorScore == null || indoorSessions7d === 0) return null;

          const scoreTone =
            indoorBand === "spike"
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : indoorBand === "heavy"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : indoorBand === "typical"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : indoorBand === "below_average"
              ? "border-sky-200 bg-sky-50 text-sky-700"
              : "border-slate-200 bg-slate-50 text-slate-600";
          const scoreLabel =
            indoorBand === "spike" ? "Spike"
              : indoorBand === "heavy" ? "Heavy"
              : indoorBand === "typical" ? "Typical"
              : indoorBand === "below_average" ? "Below avg"
              : "Light";

          const mcburnieTone =
            indoorMcburnieFlag === "red"
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : indoorMcburnieFlag === "yellow"
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700";
          const mcburnieLabel =
            indoorMcburnieFlag === "red" ? t("atRisk", lang)
              : indoorMcburnieFlag === "yellow" ? t("caution", lang)
              : t("healthy", lang);

          // Escalation indicator: spike score OR red McBurnie → concern level was bumped
          const escalated = indoorBand === "spike" || indoorMcburnieFlag === "red";

          return (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-2 flex items-center gap-2">
                {t("indoorLoad", lang)}
                {escalated && (
                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700 normal-case">
                    {t("concernBumped", lang)}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                <div
                  className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${scoreTone}`}
                  title="Composite Indoor Load Score: weighted combo of player_load, dyn_high_pct, ima_total, hmld, decel_b23 normalized to 28d baseline. 100 = personal avg."
                >
                  <span className="text-[9px] font-semibold uppercase opacity-70">{t("indoorScore", lang)}</span>
                  <span className="text-lg font-bold tabular-nums">{indoorScore}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{scoreLabel}</span>
                </div>
                {indoorMcburnieFlag && (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${mcburnieTone}`}
                    title="Indoor McBurnie proxy: decel events per minute of high-intensity FMP movement. Healthy 1-10."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">{t("mcburnieIndoor", lang)}</span>
                    <span className="text-lg font-bold tabular-nums">
                      {row._indoor_mcburnie_ratio?.toFixed(2) ?? "—"}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{mcburnieLabel}</span>
                  </div>
                )}
                <div className="flex flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 min-w-[7rem]">
                  <span className="text-[9px] font-semibold uppercase opacity-70 text-slate-500">{t("indoor7d", lang)}</span>
                  <span className="text-lg font-bold tabular-nums text-slate-800">{indoorSessions7d}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {indoorSessions7d === 1 ? t("sessionLabel", lang) : t("sessionsLabel", lang)}
                  </span>
                </div>
                {row._indoor_acwr_value != null && row._indoor_acwr_flag && (
                  <div
                    className={`flex flex-col rounded-lg border px-3 py-2 min-w-[7rem] ${
                      row._indoor_acwr_flag === "red"
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : row._indoor_acwr_flag === "yellow"
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                    title="Acute:Chronic Workload Ratio (Gabbett 2017). Sweet spot 0.8-1.3; >1.5 = sharp load spike. A workload-management signal, not an injury predictor (Impellizzeri 2020)."
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70">{t("acwrLabel", lang)}</span>
                    <span className="text-lg font-bold tabular-nums">{row._indoor_acwr_value.toFixed(2)}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide">
                      {row._indoor_acwr_flag === "red" ? t("acwrRisk", lang)
                        : row._indoor_acwr_flag === "yellow" ? t("acwrCaution", lang)
                        : t("acwrSweetSpot", lang)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
        {/* Soreness ↔ Load connection note */}
        {(() => {
          const note = buildSorenessLoadNote(row);
          if (!note) return null;
          return (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 mt-1">
              <p className="text-xs text-rose-700 font-semibold leading-snug">{note}</p>
            </div>
          );
        })()}
        {/* VBT velocity loss fatigue */}
        {row._vbt_fatigue_flags && row._vbt_fatigue_flags.length > 0 && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 mt-1">
            <p className="text-[10px] uppercase tracking-wider text-orange-500 font-semibold mb-2">VBT velocity loss</p>
            <div className="space-y-2">
              {row._vbt_fatigue_flags.map((f, i) => {
                const dropAbs = Math.abs(f.velocityDropPct);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-orange-700">{f.exerciseName}</span>
                    <span className="text-[10px] text-orange-600">{f.loadKg}kg</span>
                    <span className={`text-sm font-bold tabular-nums ${dropAbs >= 20 ? "text-rose-600" : "text-orange-700"}`}>
                      {f.velocityDropPct}%
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {f.baselineVelocity} → {f.worstVelocity} m/s
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-orange-500 leading-snug">
              Baseline: average of first 2 sets. Flag at ≥10% drop.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Player Card ───────────────────────────────────────────────────────────
// Red/Yellow: full detail — coach needs all info to make a decision
// Green: compact — just a quick confirmation, no noise

const PlayerCard: FC<{ row: DecisionSummaryRow; onClick: () => void; lang?: Lang }> = ({ row, onClick, lang = "EN" }) => {
  const displayAction = resolveDisplayAction(row);
  const cfg = STATE_CONFIG[displayAction ?? ""] ?? UNKNOWN_STATE;
  const verdict = getIcelandicVerdict(displayAction, row._injury_status, row._injury_body_part, lang);
  const isInjured =
    row._injury_status === "injured" ||
    row._injury_status === "rehabilitation" ||
    row._injury_status === "rtp_training";
  const isIll = isInjured && isIllnessRecord(row._injury_body_part);
  const final = row._final_recommendation_decision?.finalRecommendation ?? null;
  const isAlert = displayAction === "RECOVERY" || displayAction === "HOLD";
  const isWarning = displayAction === "MODIFIED";
  const needsDetail = isAlert || isWarning;

  const confidenceRaw = final?.confidence ?? row._final_recommendation_decision?.confidence ?? null;
  const confidence = confidenceToBand(confidenceRaw);

  const primaryDriver = final?.primaryDrivers?.[0] ?? null;
  const zText = zScoreToText(row._z_today);
  const trendDir = row._neural_volatility_intelligence?.trendState?.direction;
  const trendText = trendToText(trendDir) ?? deltaToText(row._dz);
  const primarySentence = buildPrimaryDriverSentence(primaryDriver, zText, trendText);

  // Secondary: show both for red/yellow, none for green
  const secondaryLabels = needsDetail
    ? buildSecondaryLabels(final?.primaryDrivers, primaryDriver?.key)
    : [];

  const actionBlock = buildCoachActionBlock(displayAction, final, {
    status: row._injury_status ?? null,
    bodyPart: row._injury_body_part ?? null,
    rtpStage: row._injury_rtp_stage ?? null,
    isIllness: isIllnessRecord(row._injury_body_part),
  });

  return (
    <div
      data-player-id={row.player_id}
      className={`flex flex-col rounded-lg border-l-4 border ${cfg.cardBorderClass} ${cfg.cardBgClass} overflow-hidden cursor-pointer transition-shadow hover:shadow-md`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <div className="flex flex-col gap-1.5 px-3 py-2.5">

        {/* Row 1: Name + plain-Icelandic verdict badge + confidence */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-sm font-bold text-slate-900 leading-tight">
              {row.full_name}
            </span>
            <EstimatedMarker row={row} lang={lang} />
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                isIll
                  ? "bg-teal-600 text-white"
                  : isInjured
                  ? "bg-violet-600 text-white"
                  : `${cfg.badgeBgClass} ${cfg.badgeTextClass}`
              }`}
              title={verdict.recommendation}
            >
              {verdict.icon} {verdict.label}
            </span>
            {confidence && (
              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                {confidence} conf.
              </span>
            )}
          </div>
        </div>

        {/* Day-over-day delta badge — derived from existing _dz field
            (z-score change vs yesterday). Coach sees direction of change
            at a glance without remembering yesterday's STEN. Renders only
            when |Δz| ≥ 0.4 (about one STEN band) — sub-threshold is noise. */}
        {(() => {
          const delta = buildDeltaBadge(row._dz, lang);
          if (!delta) return null;
          const tone = delta.tone === "up"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-rose-50 text-rose-700 border border-rose-200";
          return (
            <div className="flex">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
                title={lang === "IS"
                  ? "Breyting í STEN-stigi miðað við gærdaginn (eigin grunnlína)."
                  : "Change in STEN score vs yesterday (personal baseline)."}
              >
                {delta.text}
              </span>
            </div>
          );
        })()}
        {/* Unfamiliar load chip — promotes the movement-load spike from the
            modal onto the card face, at the decision point. Same threshold as
            the Needs attention badge (PL_SPIKE_ALERT) + the same honest framing:
            it flags the SIZE of the jump into unfamiliar load, NOT injury risk
            (ACWR is not a validated predictor — Impellizzeri 2020). */}
        {(() => {
          const spike = row._today_player_load_spike;
          if (typeof spike !== "number" || spike < PL_SPIKE_ALERT) return null;
          const pct = Math.round((spike - 1) * 100);
          return (
            <div className="flex">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border border-rose-200 bg-rose-50 text-rose-700"
                title={lang === "IS"
                  ? `Hreyfingaálag í gær var +${pct}% yfir hans 28-daga vana (${spike.toFixed(2)}×) — óvanalegt álag. Sýnir STÆRÐ stökksins, ekki meiðsla-áhættu (Impellizzeri 2020).`
                  : `Movement load yesterday was +${pct}% over his 28-day norm (${spike.toFixed(2)}×) — unfamiliar load. Flags the SIZE of the jump, not injury risk (Impellizzeri 2020).`}
              >
                ⚡ {lang === "IS" ? "Óvanalegt álag" : "Unfamiliar load"} · {spike.toFixed(1)}×
              </span>
            </div>
          );
        })()}
        {/* Injury / illness context line — body part + estimated return */}
        {isInjured && (row._injury_body_part || row._injury_estimated_return) && (
          <p
            className={`text-[11px] font-medium leading-snug ${
              isIll ? "text-teal-700" : "text-violet-700"
            }`}
          >
            {isIll ? t("illness", lang) : row._injury_body_part ?? t("injury", lang)}
            {row._injury_type ? ` (${row._injury_type})` : ""}
            {row._injury_estimated_return
              ? ` · ${t("estimatedReturn", lang)} ${row._injury_estimated_return.slice(5)}`
              : ""}
            {!isIll && row._injury_rtp_stage != null ? ` · ${t("rtpStage", lang)} ${row._injury_rtp_stage}/5` : ""}
          </p>
        )}

        {/* Primary driver — full text, no truncation for red/yellow */}
        {primarySentence && (
          <p className={`text-xs text-slate-600 leading-snug ${needsDetail ? "" : "truncate"}`}>
            {primarySentence}
          </p>
        )}

        {/* Secondary drivers — only for red/yellow */}
        {secondaryLabels.length > 0 && (
          <div className="text-xs text-slate-500 leading-snug space-y-0.5">
            {secondaryLabels.map((d, i) => (
              <p key={i}>· {d}</p>
            ))}
          </div>
        )}

        {/* Action block */}
        <div className={`rounded-md border ${cfg.actionBgClass} px-2.5 py-1.5 mt-0.5`}>
          {/* Headline always shown */}
          <p className={`text-xs font-bold leading-snug ${cfg.actionHeadlineClass}`}>
            → {actionBlock.headline}
          </p>
          {/* Details: show all for red/yellow, first only for green */}
          {actionBlock.details.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {(needsDetail ? actionBlock.details : actionBlock.details.slice(0, 1)).map((d, i) => (
                <p key={i} className="text-xs text-slate-600 leading-snug">· {d}</p>
              ))}
            </div>
          )}
        </div>

        {/* STEN score chip + override warning */}
        {row._z_today != null && Number.isFinite(row._z_today) && (() => {
          const sten = zToSten(row._z_today!);
          const band = stenToBand(sten);
          const warn = stenOverrideWarning(displayAction, sten);
          return (
            <>
              <div
                className="flex items-center gap-1.5 mt-0.5"
                title={`${lang === "IS" ? "Líðan vs hans eigin grunnlína" : "Wellness vs his own baseline"} — STEN ${sten} (1–10 personal z-scale, ${band.shortLabel})`}
              >
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${band.chipBg} ${band.chipText}`}>
                  {lang === "IS" ? "Líðan" : "Wellness"}: {band.shortLabel}
                </span>
              </div>
              {warn && (
                <div className={`flex items-start gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold leading-snug ${
                  warn.level === "critical"
                    ? "bg-rose-50 border border-rose-200 text-rose-700"
                    : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}>
                  <svg className="mt-px shrink-0" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1L1 14h14L8 1zm0 3l5.2 9H2.8L8 4zm-.75 3v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z"/>
                  </svg>
                  {warn.text}
                </div>
              )}
            </>
          );
        })()}

        {/* Chronic-risk chip — Bishop 2020 high-tier L/R CoD asymmetry over
            14 days. Informational only (does NOT modify the verdict): coach
            decides whether to swap max-effort cutting drills for unilateral
            work today. We only render when:
              - high-tier asymmetry ≥ 15% (concern + high zones)
              - and the verdict isn't already RECOVERY/HOLD/OFF (where the
                chip would be redundant — player isn't doing the high-intensity
                work today anyway). */}
        {(() => {
          const pct = row._cod_high_asym_pct;
          if (pct == null || !Number.isFinite(pct) || pct < 15) return null;
          if (
            displayAction === "RECOVERY" ||
            displayAction === "HOLD" ||
            displayAction === "OFF_DAY"
          ) {
            return null;
          }
          const isHigh = pct >= 18;
          const headline = lang === "IS"
            ? `Sterki munur á fótunum (${pct.toFixed(0)}%)`
            : `One leg working harder than the other (${pct.toFixed(0)}%)`;
          const action = isHigh
            ? (lang === "IS"
              ? "Sleppa hörðum cutting æfingum í dag. Vinna einn fót í einu (split squat, B-stance) til að jafna."
              : "Skip hard cutting drills today. Do single-leg work (split squat, B-stance) to even it out.")
            : (lang === "IS"
              ? "Bæta við einfættri vinnu í dag — meiri vinnu á veikari fót."
              : "Add some single-leg work today — extra reps on the weaker side.");
          return (
            <div
              className={`mt-3 inline-flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                isHigh
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              title="Interlimb asymmetry > 15% is a commonly-flagged imbalance that is associated with injury risk (a risk factor, not a validated predictor — the Bishop/Fort-Vanmeerhaeghe evidence is mainly single-leg-jump asymmetry). 14-day rolling window. Chronic baseline signal — does not change today's verdict, but the coach may consider unilateral work."
            >
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>
                <span className="font-semibold">{headline}</span>
                {" · "}{action}
              </span>
            </div>
          );
        })()}

        {/* Sprint Speed Drop chip — Edouard 2018 / Buchheit 2014.
            A drop in today's max sprint velocity vs the player's personal
            top-3 mean over 28d signals accumulated fatigue (reduced hamstring/
            horizontal-force capacity) — a fatigue flag, not an injury
            multiplier. Render only when:
              - drop ≥ 3% (above session-to-session noise threshold)
              - and the verdict isn't already RECOVERY/HOLD/OFF (player
                isn't doing high-intensity work today anyway).
            Informational chip — does NOT modify today's verdict. */}
        {(() => {
          const drop = row._sprint_drop_pct;
          if (drop == null || !Number.isFinite(drop) || drop < 3) return null;
          if (
            displayAction === "RECOVERY" ||
            displayAction === "HOLD" ||
            displayAction === "OFF_DAY"
          ) {
            return null;
          }
          const today = row._sprint_today_kmh;
          const ref = row._sprint_ref_kmh;
          const isHigh = drop >= 12;
          const isConcern = drop >= 7;
          const tone = isHigh
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : isConcern
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-amber-100 bg-amber-50/60 text-amber-900";
          const action = isHigh
            ? (lang === "IS"
              ? "Sleppa max-spretti í dag. Hamstring áhætta há — halda æfingu undir 80% sprett-hraða."
              : "No max sprints today. Hamstring risk is high — keep all sprint work under 80%.")
            : isConcern
              ? (lang === "IS"
                ? "Forðast max-spretti í dag. Fylgjast vel með næstu 1-2 æfingar."
                : "Avoid max sprints today. Watch closely the next 1-2 sessions.")
              : (lang === "IS"
                ? "Fylgjast með í næstu 1-2 æfingum."
                : "Watch this over the next 1-2 sessions.");
          const speedContext = today != null && ref != null
            ? (lang === "IS"
              ? `${today.toFixed(1)} km/klst í dag, hámark er ${ref.toFixed(1)}`
              : `${today.toFixed(1)} km/h today, peak is ${ref.toFixed(1)}`)
            : null;
          const headline = lang === "IS"
            ? `Hægari sprettir en venjulega (${drop.toFixed(0)}% undir hámarki)`
            : `Slower sprints than usual (${drop.toFixed(0)}% below peak)`;
          return (
            <div
              className={`mt-3 inline-flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${tone}`}
              title="A > 10% drop in max sprint speed vs personal peak can signal accumulated fatigue — sprint-induced fatigue reduces hamstring force and horizontal-force capacity (Edouard 2018). Treat it as a fatigue flag, not a precise injury-risk figure. Today's max velocity is compared to the top-3 mean over the last 28 days. Sub-3% drops are normal session-to-session noise."
            >
              <span className="mt-0.5 shrink-0">🏃</span>
              <span>
                <span className="font-semibold">{headline}</span>
                {" · "}{action}
                {speedContext && (
                  <span className="block mt-0.5 text-[10px] opacity-80">{speedContext}</span>
                )}
              </span>
            </div>
          );
        })()}

        {/* Sprint Exposure chip — Malone 2017 volume-side companion to the
            Sprint Speed Drop chip above. UNDERLOAD (< 50% of match demand)
            leaves players under-prepared (moderate exposure is protective);
            OVERLOAD (> 150%) is an accumulated spike. Render only when:
              - band is UNDERLOAD / WATCH / OVERLOAD (skip SAFE + INSUF_DATA)
              - verdict isn't RECOVERY / HOLD / OFF (no high-intensity work)
            Informational chip — does NOT modify today's verdict, mirroring
            Sprint Speed Drop's stance until 2–3 coaches confirm fit. */}
        {(() => {
          const band = row._sprint_exposure_band;
          const ratio = row._sprint_exposure_ratio;
          if (
            band == null ||
            band === "SAFE" ||
            band === "INSUFFICIENT_DATA" ||
            ratio == null ||
            !Number.isFinite(ratio)
          ) {
            return null;
          }
          if (
            displayAction === "RECOVERY" ||
            displayAction === "HOLD" ||
            displayAction === "OFF_DAY"
          ) {
            return null;
          }
          const pct = Math.round(ratio * 100);
          const matchDays = row._sprint_exposure_match_days ?? 0;
          const matchDaysMeasured = row._sprint_exposure_match_days_measured ?? matchDays;
          const matchDaysEstimated = row._sprint_exposure_match_days_estimated ?? 0;
          const matchDaysScheduled = row._sprint_exposure_match_days_scheduled ?? matchDays;
          const lowConfidence = matchDays <= 1;
          const dataGap = matchDaysScheduled > matchDays;
          const hasGpsEstimate = matchDaysEstimated > 0;
          const isSevere = band === "UNDERLOAD" || band === "OVERLOAD";
          const tone = isSevere
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : "border-amber-200 bg-amber-50 text-amber-900";
          // Plain-language headline + action — coach-facing, no jargon.
          const headline = (() => {
            if (band === "UNDERLOAD") {
              return lang === "IS"
                ? `Of fáir sprettir í vikunni (aðeins ${pct}% miðað við leik)`
                : `Not enough sprinting this week (only ${pct}% of match demand)`;
            }
            if (band === "OVERLOAD") {
              return lang === "IS"
                ? `Of margir sprettir í vikunni (${pct}% miðað við leik)`
                : `Too much sprinting this week (${pct}% of match demand)`;
            }
            return lang === "IS"
              ? `Sprett-magn aðeins lægra en venjulega (${pct}% af leik)`
              : `Sprint volume slightly below normal (${pct}% of match demand)`;
          })();
          const action = (() => {
            if (band === "UNDERLOAD") {
              return lang === "IS"
                ? "Bæta við sprett-blokk fyrir næstu æfingu — lítil sprett-útsetning skilur leikmenn eftir vanbúna."
                : "Add a sprint block to the next session — low sprint exposure leaves players under-prepared.";
            }
            if (band === "OVERLOAD") {
              return lang === "IS"
                ? "Skera niður spretti næstu 2 daga. Sleppa max-effort sprettum."
                : "Cut sprint volume the next 2 days. No max-effort sprints.";
            }
            return lang === "IS"
              ? "Fylgjast með — bæta við smávegis ef leikur er á næstu leiti."
              : "Watch this — top up a bit if a match is coming up.";
          })();
          // Confidence line — be transparent about how the baseline was
          // built. Three layers, in priority order:
          //   1. measured + estimated mix → say so ("2 measured + 1 GPS-estimated")
          //   2. data gap (scheduled > observed) → say so ("3 of 5 matches")
          //   3. genuinely 1 match → "low confidence"
          const conf = (() => {
            if (hasGpsEstimate) {
              if (matchDaysMeasured === 0) {
                return lang === "IS"
                  ? `Byggt á ${matchDays} leik${matchDays === 1 ? "" : "jum"} (öll GPS-áætluð, eldri IMA gögn vantar).`
                  : `Based on ${matchDays} match${matchDays === 1 ? "" : "es"} (all GPS-estimated — older IMA data missing).`;
              }
              return lang === "IS"
                ? `Byggt á ${matchDays} leikjum (${matchDaysMeasured} mæld + ${matchDaysEstimated} GPS-áætluð).`
                : `Based on ${matchDays} matches (${matchDaysMeasured} measured + ${matchDaysEstimated} GPS-estimated).`;
            }
            if (dataGap) {
              return lang === "IS"
                ? `Byggt á ${matchDays} af ${matchDaysScheduled} leikjum í síðustu 4 vikum (hinir vantar gögn).`
                : `Based on ${matchDays} of ${matchDaysScheduled} matches in the last 4 weeks (others missing data).`;
            }
            if (lowConfidence) {
              return lang === "IS"
                ? "Bara 1 leikur til viðmiðunar — túlka með varúð."
                : "Only 1 match in baseline — interpret with caution.";
            }
            return null;
          })();
          return (
            <div
              className={`mt-3 inline-flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${tone}`}
              title="Malone 2017: low sprint exposure leaves players under-prepared (moderate exposure is protective vs lower-limb injury); the strongest injury signal is large RAPID INCREASES in sprint/HSR (≈3–6× odds), not the level itself. < 50% of match demand = under-exposed; > 150% = an accumulated spike. Bands 5-8 of Catapult IMA Free Running are summed over the last 7 days and compared to the per-match average across the last 28 days."
            >
              <span className="mt-0.5 shrink-0">📊</span>
              <span>
                <span className="font-semibold">{headline}</span>
                {" · "}{action}
                {conf && (
                  <span className="block mt-0.5 text-[10px] opacity-80 italic">{conf}</span>
                )}
              </span>
            </div>
          );
        })()}

        {/* Readiness ↔ Load context strip */}
        <ReadinessLoadStrip row={row} lang={lang} />
        {/* Yesterday's RPE vs planned intensity (rendered independently of the
            strip's early-return, so it shows whenever an RPE was logged). */}
        <RpeExpectationChip row={row} lang={lang} compact />
      </div>
    </div>
  );
};

// ── Main Card ─────────────────────────────────────────────────────────────

const DecisionSummaryCard: FC<{
  rows: DecisionSummaryRow[];
  /**
   * Manual override for the load pipeline used in the verdict
   * explanation. 'auto' (default) lets the per-player heuristic decide
   * — see primary_load_source resolution at the buildVerdictExplanation
   * callsite. 'indoor' / 'outdoor' force one pipeline for the whole
   * team, useful for season toggles in Iceland football.
   */
  trainingMode?: "auto" | "indoor" | "outdoor";
  /**
   * Lota B / B4b — when provided, a player-card click calls this instead of
   * opening the internal S&C modal, so the parent can open the head-coach
   * PlayerDecisionDrawer (works for green players too). Omit to keep the
   * original behaviour (click → internal modal).
   */
  onPlayerClick?: (playerId: string) => void;
  /**
   * Controlled entry into the rich S&C modal — set by the parent (from the
   * drawer's "Show details — S&C") to open the modal for a specific player.
   */
  scDetailPlayerId?: string | null;
  onScDetailClose?: () => void;
}> = ({ rows, trainingMode = "auto", onPlayerClick, scDetailPlayerId = null, onScDetailClose }) => {
  const [selectedRow, setSelectedRow] = useState<DecisionSummaryRow | null>(null);
  const [lang] = useLang();
  // Smart filter — when ON, hide all green/FULL players and show only
  // those that need coach attention (REDUCED, RECOVERY, HOLD, injuries,
  // chronic-risk chips, big day-over-day drops). Coach can flip this to
  // skip the boring 25 cards and see only the ~3–4 that matter today.
  // Default OFF so first-time coaches see the whole squad.
  const [attentionOnly, setAttentionOnly] = useState(false);

  // Foster Monotony & Strain per player — single team-wide fetch on
  // mount, computed in memory, indexed by player_id. Surfaces the
  // Lite-tier overtraining-risk signal (Foster 1998) inside the
  // per-player modal so coaches don't have to navigate to a separate
  // page to read it. Works on RPE × duration alone — no GPS needed.
  const [fosterByPlayer, setFosterByPlayer] = useState<Map<string, FosterMetrics>>(new Map());
  const playerIds = useMemo(() => rows.map((r) => r.player_id), [rows]);

  useEffect(() => {
    if (playerIds.length === 0) return;
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const today = new Date().toISOString().slice(0, 10);
        const start = (() => {
          const d = new Date(`${today}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - 6);
          return d.toISOString().slice(0, 10);
        })();
        const { data } = await sb
          .from("session_rpe_entries")
          .select("player_id, session_date, session_load")
          .in("player_id", playerIds)
          .gte("session_date", start)
          .lte("session_date", today)
          .gt("session_load", 0);
        if (!alive) return;
        const rpeRows = (data ?? []) as Array<{ player_id: string; session_date: string; session_load: number | null }>;

        // Build dense 7-day window per player; zero-pad missing days
        // so SD reflects true variability, not just "I trained 3 days
        // and skipped 4" (that's monotony of zero, not low monotony).
        const windowDates: string[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(`${today}T00:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - i);
          windowDates.push(d.toISOString().slice(0, 10));
        }
        const byPlayer = new Map<string, Map<string, number>>();
        for (const r of rpeRows) {
          const inner = byPlayer.get(r.player_id) ?? new Map<string, number>();
          inner.set(r.session_date, (inner.get(r.session_date) ?? 0) + Number(r.session_load ?? 0));
          byPlayer.set(r.player_id, inner);
        }
        const out = new Map<string, FosterMetrics>();
        for (const pid of playerIds) {
          const inner = byPlayer.get(pid) ?? new Map<string, number>();
          const loads = windowDates.map((d) => ({ date: d, load: inner.get(d) ?? 0 }));
          const metrics = computeFosterMetrics(loads);
          out.set(pid, metrics);
        }
        if (alive) setFosterByPlayer(out);
      } catch {
        // best-effort — Foster tile just won't render if fetch fails
      }
    })();
    return () => { alive = false; };
  }, [playerIds]);

  if (!rows.length) return null;

  // Coach-attention rule — true when a card MUST be looked at today.
  // Drives the "Show only attention" toggle.
  //
  // SCOPE: ACUTE concerns only — anything that changes TODAY's session
  // decision. Matches the Daily Briefing "ATTENTION N all clear" count
  // so the two surfaces never contradict each other.
  //
  // Chronic-risk chips (Bishop 2020 CoD asymmetry, Edouard 2019 sprint
  // speed drop, etc.) are INFORMATIONAL — they remain visible on the
  // player cards themselves but do NOT count toward "needs attention"
  // because they don't change the verdict for today's session. A coach
  // glancing at the dashboard wants the acute count; chronic context
  // lives on the cards for when they drill into a specific player.
  //
  // EXCEPTION: Sprint Exposure (Malone 2018) is technically a 7-day signal,
  // but UNDERLOAD / OVERLOAD bands are actionable TODAY — the coach should
  // add (UNDERLOAD) or cap (OVERLOAD) sprint volume in the current session.
  // WATCH is excluded (50–80% is still close to demand). This keeps the
  // filter focused on what changes today's plan.
  const needsAttention = (row: DecisionSummaryRow): boolean => {
    const action = resolveDisplayAction(row);
    if (action === "RECOVERY" || action === "MODIFIED" || action === "REDUCED" || action === "HOLD") return true;
    if (row._injury_status === "injured" || row._injury_status === "rehabilitation" || row._injury_status === "rtp_training") return true;
    if (row._sprint_exposure_band === "UNDERLOAD" || row._sprint_exposure_band === "OVERLOAD") return true;
    return false;
  };

  const sorted = [...rows].sort((a, b) => {
    const pa = (STATE_CONFIG[resolveDisplayAction(a) ?? ""] ?? UNKNOWN_STATE).sortPriority;
    const pb = (STATE_CONFIG[resolveDisplayAction(b) ?? ""] ?? UNKNOWN_STATE).sortPriority;
    if (pa !== pb) return pa - pb;
    return a.full_name.localeCompare(b.full_name);
  });

  const attentionRows = sorted.filter(needsAttention);
  const visibleRows = attentionOnly ? attentionRows : sorted;

  const counts = sorted.reduce<Record<string, number>>((acc, row) => {
    const a = resolveDisplayAction(row) ?? "UNKNOWN";
    acc[a] = (acc[a] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-lg font-semibold uppercase tracking-[0.18em] text-slate-900">
              Decision Summary
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-slate-500">
              Per-player training decision today
            </CardDescription>
          </div>
          {/* Quick tally + smart filter toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <CoachTutorialButton slug="decision-summary" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
            {counts["RECOVERY"] != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                🔴 {counts["RECOVERY"]} recovery
              </span>
            )}
            {counts["MODIFIED"] != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                🟡 {counts["MODIFIED"]} modified
              </span>
            )}
            {counts["FULL"] != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                🟢 {counts["FULL"]} full
              </span>
            )}

            {/* Smart filter toggle — flip from "all 28 cards" to "just the
                ones that need attention today". Disabled when nothing is
                flagged so the button doesn't suggest there's hidden work. */}
            <button
              type="button"
              onClick={() => setAttentionOnly((v) => !v)}
              disabled={attentionRows.length === 0}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                attentionRows.length === 0
                  ? "border border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                  : attentionOnly
                    ? "border border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              title={attentionRows.length === 0
                ? (lang === "IS" ? "Engin viðvörun í dag — engir leikmenn til að fela." : "No flags today — nothing to filter.")
                : (lang === "IS"
                  ? `Sýna aðeins ${attentionRows.length} leikmenn sem þurfa athygli í dag (felur ${sorted.length - attentionRows.length} græn spjöld).`
                  : `Show only the ${attentionRows.length} player(s) needing attention today (hides ${sorted.length - attentionRows.length} green cards).`)
              }
            >
              <span>{attentionOnly ? "✓" : "⚑"}</span>
              {lang === "IS" ? "Þurfa athygli" : "Needs attention"}
              <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                attentionOnly ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
              }`}>
                {attentionRows.length}
              </span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibleRows.length === 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {lang === "IS"
              ? "🎉 Allir leikmenn eru í lagi í dag — engin viðvörun. Smelltu á 'Þurfa athygli' til að sjá allt liðið."
              : "🎉 Every player is clear today — no flags. Toggle 'Needs attention' off to see the full squad."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleRows.map((row) => (
              <PlayerCard
                key={row.player_id}
                row={row}
                onClick={() => (onPlayerClick ? onPlayerClick(row.player_id) : setSelectedRow(row))}
                lang={lang}
              />
            ))}
          </div>
        )}
      </CardContent>

      {/* Detail modal — opens from an internal card click (when no onPlayerClick
          is wired) OR when the parent sets scDetailPlayerId (the drawer's
          "Show details — S&C"). Click outside / Escape to close. */}
      {(() => {
        const scRow = scDetailPlayerId ? rows.find((r) => r.player_id === scDetailPlayerId) ?? null : null;
        const modalRow = selectedRow ?? scRow;
        if (!modalRow) return null;
        return (
          <PlayerModal
            row={modalRow}
            onClose={() => { setSelectedRow(null); onScDetailClose?.(); }}
            lang={lang}
            trainingMode={trainingMode}
            foster={fosterByPlayer.get(modalRow.player_id) ?? null}
          />
        );
      })()}
    </Card>
  );
};

export default DecisionSummaryCard;
