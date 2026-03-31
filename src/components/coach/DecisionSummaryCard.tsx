"use client";

import { useState, useEffect, type FC } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
  if (prescAction) return prescAction;

  // 2. Coach/system decision (matches Squad tab final_decision field)
  const finalDec = normaliseAction(row.final_decision);
  if (finalDec) return finalDec;

  const sysDec = normaliseAction(row.system_decision);
  if (sysDec) return sysDec;

  // 3. Flag (same mapping as flagToAction in dashboard) — same source as Squad tab colours
  const fromFlag = flagToDisplayAction(row.final_flag);
  if (fromFlag) return fromFlag;

  // 4. Color (fallback)
  return colorToDisplayAction(row.final_color);
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
  final: PrescriptionDecision | null
): ActionBlock {
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

const PlayerModal: FC<{ row: DecisionSummaryRow; onClose: () => void }> = ({ row, onClose }) => {
  const displayAction = resolveDisplayAction(row);
  const cfg = STATE_CONFIG[displayAction ?? ""] ?? UNKNOWN_STATE;
  const final = row._final_recommendation_decision?.finalRecommendation ?? null;

  const confidenceRaw = final?.confidence ?? row._final_recommendation_decision?.confidence ?? null;
  const confidence = confidenceToBand(confidenceRaw);

  const primaryDriver = final?.primaryDrivers?.[0] ?? null;
  const zText = zScoreToText(row._z_today);
  const trendDir = row._neural_volatility_intelligence?.trendState?.direction;
  const trendText = trendToText(trendDir) ?? deltaToText(row._dz);
  const primarySentence = buildPrimaryDriverSentence(primaryDriver, zText, trendText);
  const allSecondary = buildSecondaryLabels(final?.primaryDrivers, primaryDriver?.key);
  const actionBlock = buildCoachActionBlock(displayAction, final);
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
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 leading-tight">{row.full_name}</h2>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-lg font-bold ${cfg.badgeBgClass} ${cfg.badgeTextClass}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                {confidence && (
                  <span className="text-base text-slate-500 font-medium">{confidence} confidence</span>
                )}
              </div>
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

          {/* Neural signal */}
          {(row._z_today != null || trendText) && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-2">Neural signal</p>
              <div className="space-y-1.5">
                {zText && <p className="text-base text-slate-700">Load: <span className="font-semibold">{zText}</span> compared to this player's baseline</p>}
                {trendText && <p className="text-base text-slate-700">Trajectory: <span className="font-semibold">{trendText}</span></p>}
              </div>
            </div>
          )}

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

// ── Player Card ───────────────────────────────────────────────────────────
// Red/Yellow: full detail — coach needs all info to make a decision
// Green: compact — just a quick confirmation, no noise

const PlayerCard: FC<{ row: DecisionSummaryRow; onClick: () => void }> = ({ row, onClick }) => {
  const displayAction = resolveDisplayAction(row);
  const cfg = STATE_CONFIG[displayAction ?? ""] ?? UNKNOWN_STATE;
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

  const actionBlock = buildCoachActionBlock(displayAction, final);

  return (
    <div
      className={`flex flex-col rounded-lg border-l-4 border ${cfg.cardBorderClass} ${cfg.cardBgClass} overflow-hidden cursor-pointer transition-shadow hover:shadow-md`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <div className="flex flex-col gap-1.5 px-3 py-2.5">

        {/* Row 1: Name + badge + confidence */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <span className="text-sm font-bold text-slate-900 leading-tight">
            {row.full_name}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${cfg.badgeBgClass} ${cfg.badgeTextClass}`}>
              {cfg.emoji} {cfg.label}
            </span>
            {confidence && (
              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                {confidence} conf.
              </span>
            )}
          </div>
        </div>

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
      </div>
    </div>
  );
};

// ── Main Card ─────────────────────────────────────────────────────────────

const DecisionSummaryCard: FC<{ rows: DecisionSummaryRow[] }> = ({ rows }) => {
  const [selectedRow, setSelectedRow] = useState<DecisionSummaryRow | null>(null);

  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => {
    const pa = (STATE_CONFIG[resolveDisplayAction(a) ?? ""] ?? UNKNOWN_STATE).sortPriority;
    const pb = (STATE_CONFIG[resolveDisplayAction(b) ?? ""] ?? UNKNOWN_STATE).sortPriority;
    if (pa !== pb) return pa - pb;
    return a.full_name.localeCompare(b.full_name);
  });

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
          {/* Quick tally */}
          <div className="flex items-center gap-2 flex-wrap">
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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((row) => (
            <PlayerCard key={row.player_id} row={row} onClick={() => setSelectedRow(row)} />
          ))}
        </div>
      </CardContent>

      {/* Detail modal — click anywhere outside or press Escape to close */}
      {selectedRow && (
        <PlayerModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </Card>
  );
};

export default DecisionSummaryCard;
