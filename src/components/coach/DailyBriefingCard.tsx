"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DailyBriefingCard
// ─────────────────────────────────────────────────────────────────────────────
//
// Closes the Communicate step of Gabbett's (2020) monitoring cycle
// (Collect → Analyse → Communicate → Decide). MicroPulse already collects and
// analyses — this card is the one auto-generated morning view the coach opens
// first, bringing together readiness + planned session + ACWR + flagged
// players so they don't have to click across three screens to assemble the
// picture themselves.
//
// Placement: top of Today tab, ABOVE the Command Center. Minimal prop
// surface — everything it needs is already computed by the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  flagAgainstBaseline,
  type AthleteMetricBaseline,
} from "@/lib/micropulse/baselines";

// ── Types (loose — we only read fields we care about) ──────────────────────

type FinalColor = "red" | "yellow" | "green";

type BriefingRow = {
  player_id: string;
  full_name: string;
  entry_date?: string | null;
  final_color?: FinalColor | null;
  total_score?: number | null;
  _yesterday_z?: number | null;
  _z_today?: number | null;
  _dz?: number | null;
  // Wellness subscores on the 1–5 Likert scale. Surfaced here so the
  // briefing card can explain *which variable* drove a YELLOW/RED flag
  // without the coach having to open the player modal.
  sleep_quality?: number | null;
  fatigue_energy?: number | null;
  stress_mood?: number | null;
  muscle_soreness?: number | null;
  planned_day_type?: string | null;
  planned_focus?: string | null;
  md_day?: string | null;
  _neural_bias_applied?: boolean;
  _adaptation?: {
    protectTissue?: "ACHILLES" | "HAMSTRING" | "PATELLAR" | null;
    recoveryBias?: boolean;
    swapBallistic?: boolean;
  } | null;
};

type PlayerCompositeEntry = {
  compositeScore: number;
  concernLevel: "none" | "low" | "moderate" | "high";
  fatigueType: string | null;
  playerLoadSpike: number | null;
  loadRatio: number | null;
  // ── Per-source spikes — surface what *kind* of work spiked.
  // The composite score is a single number; this breakdown lets the coach
  // see whether "load high" means accel/decel volume, sprint volume, or
  // mechanical-impact density. All optional — outdoor mode populates HIR
  // and decel/accel; indoor mode populates FMP.
  hirSpike?: number | null;
  decelSpike?: number | null;
  accelSpike?: number | null;
  imaTotalSpike?: number | null;
  fmpDynamicHighSpike?: number | null;
  mode?: "indoor" | "outdoor" | null;
};

type ComplianceCounts = { submitted: number; imputed: number; missing: number };

type ComplianceSummary = {
  checkin: ComplianceCounts;
  rpe: ComplianceCounts;
};

type TeamSignalLike = {
  n_players?: number | null;
  n_full?: number | null;
  n_reduced?: number | null;
  n_recovery?: number | null;
} | null;

export type DailyBriefingCardProps = {
  today: string; // ISO yyyy-mm-dd
  lang: "IS" | "EN";
  rows: BriefingRow[];
  playerComposites: Record<string, PlayerCompositeEntry>;
  complianceSummary?: ComplianceSummary | null;
  mdDayToday?: string | number | null;
  teamSignal?: TeamSignalLike;
  dayStateLabel?: string | null; // e.g. "Medium training"
  // Optional: last 7 days of week plan day types keyed by ISO date. Used
  // to contextualise today's readiness with info like "after OFF" or
  // "after 2 OFF days" when yesterday had no real data.
  recentDayTypes?: Record<string, string | null> | null;
  // Per-player wellness baselines from athlete_metric_baselines.
  // Keyed by player_id → metric_key → baseline. Enables personalised
  // (Robertson 2017) z-score flagging instead of the global ≤2 threshold,
  // which surfaces false yellows for players whose personal norm is itself
  // ~3/5 (and misses real concern for players whose norm is 4-5/5).
  // Optional — when absent the card falls back to the global threshold.
  playerBaselines?: Record<string, Record<string, AthleteMetricBaseline>>;
  // ── Counterfactual lookup (per player) ─────────────────────────
  // Map of player_id → top counterfactuals (already sorted by impact
  // desc by the engine). The card renders the single highest-impact
  // entry as a 1-line italic hint under the driver chips, surfacing
  // the "what-if" lever directly in the morning view. Only populated
  // by the dashboard when a player has flagged YELLOW/RED — GREEN
  // players don't need them.
  playerCounterfactuals?: Record<string, Array<{
    signal: string;
    currentValue: string;
    hypotheticalValue: string;
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    impact: 1 | 2 | 3;
    descriptionEN: string;
    descriptionIS: string;
  }>>;
  // ── Injury status (per player) ─────────────────────────────────
  // Keyed by player_id. Sourced from player_injuries / injury_events
  // (same data the Decision summary uses). When a player is in the
  // injury pipeline the briefing must flag it explicitly — otherwise an
  // injured player reads as an ordinary "yellow readiness" monitor row,
  // which is misleading. Optional — absent map = no injury data.
  playerInjuries?: Record<string, {
    status: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
    bodyPart?: string | null;
    injuryType?: string | null;
  } | null>;
  // ── Yesterday's snapshot per player ───────────────────────────────────
  // Used to render day-over-day delta badges on attention rows ("fór úr
  // grænu í gult"). Coaches care about CHANGE far more than absolute
  // state — a player who's been yellow for 3 days needs a different
  // response than a player who flipped from green to yellow today.
  // Optional — when absent, no delta is shown (no false impressions).
  playerDeltas?: Record<string, {
    color: "green" | "yellow" | "red" | null;
    score: number | null;
  }>;
};

// ── Copy (IS / EN) ─────────────────────────────────────────────────────────

const COPY = {
  IS: {
    title: "Daily briefing",
    subtitle: "Auto-unnin morgunskýrsla — það sem þú þarft að vita í dag",
    headlineWatch: (n: number) =>
      n === 0 ? "Enginn þarf sérstaka athygli í dag" : n === 1 ? "Fylgstu með 1 leikmanni" : `Fylgstu með ${n} leikmönnum`,
    tileReadiness: "Readiness",
    tilePlanned: "Planned",
    tileLoad: "Load",
    tileAttention: "Attention",
    readinessFull: "tilbúnir",
    readinessReduced: "dregið úr",
    readinessRecovery: "hvíld",
    spikeLabel: "hækkað PL",
    loadMonitor: "monitor",
    loadNormal: "í lagi",
    attentionAlert: "alert",
    attentionMonitor: "monitor",
    attentionNone: "allt í lagi",
    topAttention: "Top attention today",
    showMore: (n: number) => `+${n} fleiri`,
    showLess: "Sýna færri",
    compliance: "Compliance",
    checkin: "Check-in",
    rpe: "RPE",
    noPlanned: "Engin áætlun skráð",
    mdBadge: (md: string) => md,
    noRows: "Engin readiness gögn í dag ennþá.",
    teamPulse: "Team pulse",
    avgReadiness: "Meðal readiness",
    fatigueMix: "Þreytumunstur",
    mech: "vélrænt",
    metab: "efnaskipti",
    global: "heild",
    noFatigue: "engin þreyta skráð",
    trendUp: "↑ batnar vs í gær",
    trendDown: "↓ versnar vs í gær",
    trendFlat: "= stöðugt vs í gær",
    chipScore: "Skor",
    chipComp: "Comp",
    chipPl: "PL",
    // Context badge — appears on the top-of-card headline when yesterday
    // (or previous days) were OFF. Neutral grey so it reads as context,
    // not as an alert or driver. See handleOffDay comment in the header.
    afterOffOne: "eftir OFF dag",
    afterOffMany: (n: number) => `eftir ${n} OFF daga`,
    // Diagnostic driver chips — orsök (cause), not recommendation.
    // Kept short and numeric-first so they don't overlap with
    // Decision summary (which tells the coach *what to do*).
    drivers: {
      sleep: (n: number) => `svefn ${n}/5`,
      energy: (n: number) => `orka ${n}/5`,
      stress: (n: number) => `streita ${n}/5`,
      soreness: (n: number) => `strengir ${n}/5`,
      dzDrop: (dz: number) => `Δz ${dz.toFixed(1)}`,
      total: (n: number) => `total ${n}/25`,
    },
    // Tier B — personal-norm tooltip lines. When a value triggers a
    // chip, the tooltip explains *why* (z-score against personal mean)
    // so the coach knows it's the player's personal norm, not the
    // global threshold, that drove the flag.
    chipTooltip: {
      personal: (mean: number, sd: number, z: number) =>
        `Hans norm ${mean.toFixed(1)}/5 (SD ${sd.toFixed(1)}) — í dag ${z.toFixed(1)} SD frá norm`,
      noBaseline: "Engin persónuleg baseline ennþá — nota global þröskuld (≤2)",
      chronic: (mean: number) =>
        `Persónuleg norm hjá honum er ${mean.toFixed(1)}/5 — chronic-low yfir 28 daga`,
    },
    chronicTag: "chronic-low",
    reasons: {
      redReadiness: "RAUTT readiness",
      yellowReadiness: "GULT readiness",
      lowScore: (n: number) => `skor ${n}/25`,
      compositeHigh: "há composite load",
      compositeMod: "hækkuð composite",
      neuralBias: "neural bias",
      plSpike: (ratio: number) => `PL ${ratio.toFixed(2)}×`,
      plSpikePostMatch: (ratio: number) => `PL ${ratio.toFixed(2)}× (eftir leik — eðlilegt)`,
      protectTissue: (t: string) => `vernda ${t.toLowerCase()}`,
      recoveryBias: "recovery bias",
      mechFatigue: "vélrænt álag",
      metabFatigue: "efnaskiptaálag",
      globalFatigue: "heildarþreyta",
      compositeHighPostMatch: "há composite load (eftir leik)",
    },
    injury: {
      injured: "Meiddur — ekki í æfingu",
      rehab: "Í endurhæfingu",
      rtp: "RTP — takmörkuð þátttaka",
      badgeInjured: "MEIDDUR",
      badgeRehab: "ENDURHÆFING",
      badgeRtp: "RTP",
    },
    // Compact-mode status phrases — single short label per player. Designed
    // for non-S&C coaches: ACTION-oriented. The badge says what the coach
    // should consider doing today; the prose line beneath says WHY. This
    // shortcuts the "OK, but what do I do with that?" gap that pure
    // descriptive labels leave behind. Phrased as soft recommendations
    // ("forðastu...", "léttari...") to respect coach autonomy.
    compact: {
      recoveryFocus:    "Þarf hvíld í dag",
      postMatchEcho:    "Slakari dagur — eftir leik",
      heavyLoad:        "Léttari æfing — álag síðustu daga",
      highIntensity:    "Léttari æfing — eftir erfiðan dag",
      belowNormal:      "Fylgstu vel með í dag",
      mechStrain:       "Forðastu miklar hröðanir",
      metabStrain:      "Forðastu mikla háhraða-vinnu",
      generalFatigue:   "Léttari æfing — þreyttur",
      neuralBias:       "Forðastu kraftaæfingar",
      protectTissue:    (t: string) => `Vernda ${t.toLowerCase()}`,
      monitor:          "Fylgjast með",
    },
  },
  EN: {
    title: "Daily briefing",
    subtitle: "Auto-generated morning view — what you need to know today",
    headlineWatch: (n: number) =>
      n === 0 ? "No players need special attention today" : n === 1 ? "Watch 1 player" : `Watch ${n} players`,
    tileReadiness: "Readiness",
    tilePlanned: "Planned",
    tileLoad: "Load",
    tileAttention: "Attention",
    readinessFull: "full",
    readinessReduced: "reduced",
    readinessRecovery: "recovery",
    spikeLabel: "PL spike",
    loadMonitor: "monitor",
    loadNormal: "normal",
    attentionAlert: "alert",
    attentionMonitor: "monitor",
    attentionNone: "all clear",
    topAttention: "Top attention today",
    showMore: (n: number) => `+${n} more`,
    showLess: "Show fewer",
    compliance: "Compliance",
    checkin: "Check-in",
    rpe: "RPE",
    noPlanned: "No plan on file",
    mdBadge: (md: string) => md,
    noRows: "No readiness data yet today.",
    teamPulse: "Team pulse",
    avgReadiness: "Avg readiness",
    fatigueMix: "Fatigue mix",
    mech: "mech",
    metab: "metab",
    global: "global",
    noFatigue: "no fatigue flagged",
    trendUp: "↑ improving vs yesterday",
    trendDown: "↓ declining vs yesterday",
    trendFlat: "= stable vs yesterday",
    chipScore: "Score",
    chipComp: "Comp",
    chipPl: "PL",
    // Context badge — neutral grey, shown near the headline when
    // yesterday had no real data (team OFF day).
    afterOffOne: "after OFF day",
    afterOffMany: (n: number) => `after ${n} OFF days`,
    // Diagnostic driver chips — cause, not recommendation.
    drivers: {
      sleep: (n: number) => `sleep ${n}/5`,
      energy: (n: number) => `energy ${n}/5`,
      stress: (n: number) => `stress ${n}/5`,
      soreness: (n: number) => `soreness ${n}/5`,
      dzDrop: (dz: number) => `Δz ${dz.toFixed(1)}`,
      total: (n: number) => `total ${n}/25`,
    },
    // Tier B — personal-norm tooltip lines.
    chipTooltip: {
      personal: (mean: number, sd: number, z: number) =>
        `His norm ${mean.toFixed(1)}/5 (SD ${sd.toFixed(1)}) — today ${z.toFixed(1)} SD from norm`,
      noBaseline: "No personal baseline yet — using global threshold (≤2)",
      chronic: (mean: number) =>
        `His personal norm is ${mean.toFixed(1)}/5 — chronic-low across 28d`,
    },
    chronicTag: "chronic-low",
    reasons: {
      redReadiness: "RED readiness",
      yellowReadiness: "YELLOW readiness",
      lowScore: (n: number) => `score ${n}/25`,
      compositeHigh: "high composite load",
      compositeMod: "elevated composite",
      neuralBias: "neural bias",
      plSpike: (ratio: number) => `PL ${ratio.toFixed(2)}×`,
      plSpikePostMatch: (ratio: number) => `PL ${ratio.toFixed(2)}× (post-match — expected)`,
      protectTissue: (t: string) => `protect ${t.toLowerCase()}`,
      recoveryBias: "recovery bias",
      mechFatigue: "mechanical fatigue",
      metabFatigue: "metabolic fatigue",
      globalFatigue: "global fatigue",
      compositeHighPostMatch: "high composite load (post-match)",
    },
    injury: {
      injured: "Injured — not training",
      rehab: "In rehabilitation",
      rtp: "RTP — restricted participation",
      badgeInjured: "INJURED",
      badgeRehab: "REHAB",
      badgeRtp: "RTP",
    },
    // Compact-mode status phrases — action-oriented soft recommendations.
    // The badge says what to consider doing today; prose beneath gives why.
    compact: {
      recoveryFocus:    "Needs rest today",
      postMatchEcho:    "Easier day — post-match",
      heavyLoad:        "Lighter session — high recent load",
      highIntensity:    "Lighter session — hard day yesterday",
      belowNormal:      "Watch him today",
      mechStrain:       "Avoid heavy sprinting",
      metabStrain:      "Avoid high-speed running",
      generalFatigue:   "Lighter session — fatigued",
      neuralBias:       "Avoid power work",
      protectTissue:    (t: string) => `Protect ${t.toLowerCase()}`,
      monitor:          "Monitor",
    },
  },
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateHeader(iso: string, lang: "IS" | "EN"): string {
  const d = new Date(iso + "T00:00:00");
  const locale = lang === "IS" ? "is-IS" : "en-GB";
  return d.toLocaleDateString(locale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFocus(row: BriefingRow | undefined, lang: "IS" | "EN"): string {
  if (!row) return COPY[lang].noPlanned;
  // Prefer explicit focus ("FORCE", "NEURAL / VELOCITY", ...) → fall back
  // to planned_day_type ("TRAIN", "RECOVERY", "GAME", "OFF").
  const focus = (row.planned_focus ?? "").trim();
  if (focus) return focus;
  const dayType = (row.planned_day_type ?? "").trim();
  return dayType || COPY[lang].noPlanned;
}

type AttentionLevel = "alert" | "monitor" | "ok";

type DriverKind = "sleep" | "energy" | "stress" | "soreness" | "dz" | "total";

type DriverChip = {
  kind: DriverKind;
  value: number;
  // ── Tier B/C personalisation context ─────────────────────
  // baselineMean / baselineSd / z populate the personal-norm tooltip
  // ("His norm 4.1/5, today -1.6 SD from norm") and let the coach
  // immediately see *why* this player's value triggered a flag while
  // another player with the same value didn't.
  // chronic = true when this metric's personal norm is itself ≤ 2.5
  // across the 28-day baseline window — these players need long-term
  // escalation even when z stays green.
  baselineMean?: number;
  baselineSd?: number;
  z?: number;
  baselineSource?: "personal" | "global"; // global = fell back to ≤2 because no baseline
  chronic?: boolean;
};

type AttentionItem = {
  playerId: string;
  name: string;
  level: AttentionLevel;
  reasons: string[];
  // Single coach-friendly status phrase used in Compact mode — collapses all
  // the multi-clause reasons into one short label like "Post-match echo
  // (expected)" or "Heavy training load". Built from the same signals that
  // populate `reasons`. Detailed mode keeps the full reasons.join(" · ").
  compactStatus: string;
  // Numeric context for inline chips on the attention row — lets the coach
  // read the "why" without opening the player modal.
  score: number | null;
  composite: number | null;
  plSpike: number | null;
  fatigueType: string | null;
  // ── Driver chips — the *orsök* layer. These are raw-data-level
  // explanations of why readiness dropped to YELLOW/RED. Intentionally
  // diagnostic (not prescriptive) so they don't duplicate Decision summary.
  drivers: DriverChip[];
  // ── Counterfactual hint — the actionable lever ─────────────────
  // Top single-lever flip that would have improved today's verdict.
  // Surfaced as a small italic line beneath the driver chips so the
  // coach can read "what's wrong" + "what would change it" without
  // opening the player accordion. Null when no useful counterfactual
  // exists (engine returned empty — e.g. multi-concern day where no
  // single change helps).
  topCounterfactual?: {
    hypotheticalState: "GREEN" | "YELLOW" | "RED" | "GRAY";
    descriptionEN: string;
    descriptionIS: string;
  } | null;
  // Active injury — when set, the row is in the injury pipeline and is
  // rendered with a prominent badge (shown in both Compact and Detailed
  // modes) so it can never be mistaken for an ordinary readiness item.
  injury?: {
    kind: "injured" | "rehab" | "rtp";
    badge: string;
    detail: string;
  } | null;
  // Data confidence — coverage + freshness of the inputs behind this
  // verdict. Surfaced in both modes so the coach immediately sees whether
  // the flag rests on full data or on a partial / stale signal set.
  confidence: {
    level: "high" | "moderate" | "low";
    signalCount: number;
    signalTotal: number;
    notes: string[]; // localized, ready to render in a tooltip
  };
  // ── Plain-language explanation — the prose layer ────────────────────
  // 1-2 sentences that synthesise drivers + score + load signals + post-
  // match context into one coach-readable line. The chips above answer
  // "what" — this answers "why this player needs attention" without
  // numbers or jargon. Both modes show the same prose; null when no
  // useful prose can be built (typically injured players, where the
  // injury badge already carries the story).
  explanation: {
    is: string;
    en: string;
  } | null;
  // ── Load breakdown — composite score is a single number; this carries
  // the per-source spikes the coach can use to see *what kind of work*
  // spiked. Only spikes > 1.0× are surfaced (irrelevant ones are dropped).
  // Empty array when there's no load breakdown to show (e.g. wellness-only
  // flag with no GPS spike).
  loadBreakdown: Array<{ label: string; value: number }>;
  // ── Baseline maturity — how mature the *personal norm* is that the
  // verdict rests on. n_observations across the wellness baseline window
  // (typically 28d). Surfaced as a small subtitle on the confidence pill
  // so the coach can see when a flag rests on a thin baseline.
  baselineMaturity: {
    obs: number;
    windowDays: number;
  } | null;
  // ── Day-over-day delta — the most actionable single signal for a coach
  // doing the morning brief. Null when no yesterday data exists; otherwise
  // carries the verbal change ("Nýtt í dag — var grænn í gær") and a
  // direction tag for visual styling. Computed once in the item-builder
  // so the renderer just reads it.
  delta: {
    kind: "new" | "worse" | "better" | "same";
    summaryIS: string;
    summaryEN: string;
  } | null;
};

// Δz baseline drop — match the same breakpoint used for dev-color YELLOW.
const DZ_DRIVER_THRESHOLD = 0.5;

// Fallback global threshold used only when a player has no personal
// baseline yet (insufficient_data status, < 7 obs). Once their personal
// baseline is active we use ±1 SD against personal mean instead.
// Robertson 2017 — personal norms beat group thresholds for wellness.
const WELLNESS_GLOBAL_FALLBACK_THRESHOLD = 2;

// Tier C — chronic-low absolute floor. When a player's *personal mean*
// for a sub-score is at or below this value across the 28-day baseline
// window, their z-score will rarely flag (because the baseline is itself
// low) — but the absolute reading is still concerning. Surface a
// chronic-low tag so the coach knows long-term escalation may be needed.
const CHRONIC_LOW_MEAN_THRESHOLD = 2.5;

// Map driver chip kinds to the corresponding athlete_metric_baselines
// metric_key. Stress chip uses wellness.stress_mood; soreness uses
// wellness.muscle_soreness, etc.
const DRIVER_TO_METRIC: Record<Exclude<DriverKind, "dz" | "total">, string> = {
  sleep: "wellness.sleep_quality",
  energy: "wellness.fatigue_energy",
  stress: "wellness.stress_mood",
  soreness: "wellness.muscle_soreness",
};

function deriveReadinessDrivers(
  row: BriefingRow,
  baselines: Record<string, AthleteMetricBaseline> | null,
): DriverChip[] {
  const drivers: DriverChip[] = [];

  const subs: Array<{ kind: Exclude<DriverKind, "dz" | "total">; value: number | null | undefined }> = [
    { kind: "sleep", value: row.sleep_quality },
    { kind: "energy", value: row.fatigue_energy },
    { kind: "stress", value: row.stress_mood },
    { kind: "soreness", value: row.muscle_soreness },
  ];

  // Each candidate gets evaluated against its personal baseline (Tier A).
  // Three outcomes per sub-score:
  //   1. baseline exists + flag is yellow/red  → show chip with personal context
  //   2. baseline exists + flag is green       → suppress chip (it's normal for this player)
  //   3. no baseline yet                       → fall back to global ≤2 threshold
  // We rank by "concerning-ness" so the most extreme deviations show first.
  type Candidate = DriverChip & { rankScore: number };
  const candidates: Candidate[] = [];

  for (const s of subs) {
    if (typeof s.value !== "number") continue;
    const metricKey = DRIVER_TO_METRIC[s.kind];
    const baseline = baselines?.[metricKey] ?? null;

    if (baseline && baseline.status !== "insufficient_data") {
      // Tier A — personal z-score check
      const result = flagAgainstBaseline(s.value, baseline, metricKey);
      const chronic = baseline.mean <= CHRONIC_LOW_MEAN_THRESHOLD;

      if (result.flag === "green" && !chronic) continue; // genuinely normal for this player

      // Surface chip when either (a) z makes it concerning today, or
      // (b) the player's chronic personal norm is itself in the danger zone.
      // Ranking: actively concerning (yellow/red flag) ALWAYS beats
      // chronic-only — a player whose value crashed today matters more
      // for today's verdict than a player whose long-term norm is low
      // but is having a normal day. Within "active", more-negative z
      // wins; within "chronic-only", lower personal mean wins.
      const z = result.z ?? 0;
      const rankScore = result.flag === "green"
        ? -0.1 + (baseline.mean - CHRONIC_LOW_MEAN_THRESHOLD) * 0.01 // chronic-only — small negative range
        : z; // active concern — wins by virtue of z ≤ -1 ≪ -0.1
      candidates.push({
        kind: s.kind,
        value: s.value,
        baselineMean: baseline.mean,
        baselineSd: baseline.sd,
        z,
        baselineSource: "personal",
        chronic,
        rankScore,
      });
    } else if (s.value <= WELLNESS_GLOBAL_FALLBACK_THRESHOLD) {
      // Tier A fallback — no personal baseline, use the original ≤2 threshold
      candidates.push({
        kind: s.kind,
        value: s.value,
        baselineSource: "global",
        rankScore: s.value, // lower = worse
      });
    }
  }

  // Take the two most concerning sub-scores. Cap at 2 to match prior
  // behaviour (more chips become noise, and Decision summary handles
  // the prescription side).
  candidates.sort((a, b) => a.rankScore - b.rankScore);
  for (const c of candidates.slice(0, 2)) {
    const { rankScore: _r, ...chip } = c;
    drivers.push(chip);
  }

  // Δz baseline drop — only when the coach sees a dev-driven flag.
  const dz = typeof row._dz === "number" ? row._dz : null;
  if (dz != null && dz <= -DZ_DRIVER_THRESHOLD) {
    drivers.push({ kind: "dz", value: dz });
  }

  // Total score anchor — only when it's the *reason* the row is RED and
  // no wellness subscore already explains it (avoids a redundant chip
  // when sleep=1 already tells the full story).
  const total = typeof row.total_score === "number" ? row.total_score : null;
  if (total != null && total <= 17 && drivers.length === 0) {
    drivers.push({ kind: "total", value: total });
  }

  return drivers;
}

/**
 * Was the previous day or two a match? Used to soften load-spike alerts that
 * are merely the expected post-match echo. Looks at row.md_day (today's MD-day
 * resolved) and recentDayTypes (planned day types over last week).
 *
 * Returns true if today is MD+1 or MD+2 OR if any of the last 3 days had
 * day_type containing "MATCH" / "GAME". Coach reads "PL spike (post-match)"
 * and immediately understands no action needed.
 */
function isPostMatchContext(
  row: BriefingRow,
  recentDayTypes: Record<string, string | null> | null | undefined,
  todayIso: string,
): boolean {
  const md = String(row.md_day ?? "").toUpperCase();
  if (md === "MD+1" || md === "MD+2") return true;
  if (!recentDayTypes) return false;
  for (let dayBack = 1; dayBack <= 3; dayBack++) {
    const d = new Date(todayIso);
    d.setUTCDate(d.getUTCDate() - dayBack);
    const iso = d.toISOString().slice(0, 10);
    const dt = String(recentDayTypes[iso] ?? "").toUpperCase();
    if (dt.includes("MATCH") || dt.includes("GAME")) return true;
  }
  return false;
}

/**
 * Score the data behind a verdict — coverage (how many input signals are
 * present today) plus a freshness note when the row's check-in date isn't
 * today. Surfaced as a pill so a coach reading the briefing can tell at a
 * glance whether a RED flag rests on full data or on a partial / stale
 * signal set. Note text is localized — the caller drops it straight into
 * the tooltip.
 */
function computeAttentionConfidence(
  row: BriefingRow,
  comp: PlayerCompositeEntry | undefined,
  baselines: Record<string, AthleteMetricBaseline> | null,
  todayIso: string,
  lang: "IS" | "EN",
): AttentionItem["confidence"] {
  const notes: string[] = [];
  let signalCount = 0;
  const signalTotal = 5;

  // 1) Wellness check-in — all four sub-scores present.
  const subs = [row.sleep_quality, row.fatigue_energy, row.stress_mood, row.muscle_soreness];
  const subsPresent = subs.filter((v) => typeof v === "number").length;
  if (subsPresent === 4) {
    signalCount += 1;
  } else if (subsPresent === 0) {
    notes.push(lang === "IS" ? "Engin checkin í dag" : "No check-in today");
  } else {
    notes.push(lang === "IS"
      ? `Aðeins ${subsPresent}/4 wellness gildi`
      : `Only ${subsPresent}/4 wellness values`);
  }

  // 2) Total daily readiness score present.
  if (typeof row.total_score === "number") signalCount += 1;

  // 3) Yesterday-comparison Δz.
  if (typeof row._dz === "number") {
    signalCount += 1;
  } else {
    notes.push(lang === "IS" ? "Engin samanburður við í gær" : "No yesterday comparison");
  }

  // 4) Load composite (external load engine has run).
  if (comp && typeof comp.compositeScore === "number") {
    signalCount += 1;
  } else {
    notes.push(lang === "IS" ? "Engin álagsgögn" : "No load data");
  }

  // 5) Personal wellness baselines (Robertson 2017 personal-norm anchor).
  const baselineActive = !!baselines && Object.values(baselines).some(
    (b) => b && b.status !== "insufficient_data",
  );
  if (baselineActive) {
    signalCount += 1;
  } else {
    notes.push(lang === "IS"
      ? "Engin persónuleg baseline ennþá"
      : "No personal baseline yet");
  }

  // Freshness — flag if today's verdict is built on an older row's data.
  if (row.entry_date && row.entry_date !== todayIso) {
    notes.push(lang === "IS"
      ? `Síðasta checkin: ${row.entry_date}`
      : `Last check-in: ${row.entry_date}`);
  }

  const ratio = signalCount / signalTotal;
  const level: AttentionItem["confidence"]["level"] =
    ratio >= 0.8 ? "high" : ratio >= 0.5 ? "moderate" : "low";

  return { level, signalCount, signalTotal, notes };
}

/**
 * Compose a 1-2 sentence plain-language explanation for an attention row.
 *
 * The chips above the explanation answer "what" (numbers, tags). This
 * answers "why does this player need attention" in a sentence a non-S&C
 * coach can read without any decoding. Built deterministically from the
 * SAME signals already on the item (drivers, score, PL spike, fatigue
 * type, post-match context, counterfactual) — no LLM, no extra data.
 *
 * Returns null for injured players: the injury badge already carries the
 * whole story, so a second sentence would just be noise.
 *
 * The result has two strings per language:
 *   • shortIS/EN — the lead sentence only (used in Compact mode).
 *   • fullIS/EN — lead + counterfactual / post-match nuance (Detailed).
 */
function composeAttentionExplanation(
  item: Omit<AttentionItem, "explanation">,
  postMatch: boolean,
  isRedToday: boolean,
): { is: string; en: string } | null {
  if (item.injury) return null;

  // ── Build sentence-1 phrases from typed signals, in priority order.
  // Each phrase is a noun phrase that slots cleanly into a list — the
  // sentence builder joins them with "; " (semicolon) for the lead clause
  // plus " og " / " and " for subsequent clauses.
  const phraseIS: string[] = [];
  const phraseEN: string[] = [];

  // (1) Wellness drivers — pick up to two by largest |z|, fall back to
  // value when no z (e.g. global-threshold fallback).
  const wellnessDrivers = item.drivers
    .filter((d) => d.kind === "sleep" || d.kind === "energy" || d.kind === "stress" || d.kind === "soreness")
    .slice()
    .sort((a, b) => {
      const az = typeof a.z === "number" ? Math.abs(a.z) : 0;
      const bz = typeof b.z === "number" ? Math.abs(b.z) : 0;
      if (az !== bz) return bz - az;
      // Tie-breaker: lower raw value first (more concerning).
      return a.value - b.value;
    })
    .slice(0, 2);

  if (wellnessDrivers.length > 0) {
    const labelIS = (k: string) =>
      k === "sleep" ? "svefn" : k === "energy" ? "orka" : k === "stress" ? "streita" : "strengir";
    const labelEN = (k: string) =>
      k === "sleep" ? "sleep" : k === "energy" ? "energy" : k === "stress" ? "stress" : "soreness";
    const partsIS = wellnessDrivers.map((d) => {
      const normIS = typeof d.baselineMean === "number" ? ` (venja ${d.baselineMean.toFixed(1)})` : "";
      return `${labelIS(d.kind)} ${d.value}/5${normIS}`;
    });
    const partsEN = wellnessDrivers.map((d) => {
      const normEN = typeof d.baselineMean === "number" ? ` (usual ${d.baselineMean.toFixed(1)})` : "";
      return `${labelEN(d.kind)} ${d.value}/5${normEN}`;
    });
    phraseIS.push(`${partsIS.join(" og ")} — undir því sem hann skráir venjulega`);
    phraseEN.push(`${partsEN.join(" and ")} — below what he usually reports`);
  }

  // (2) Low total score — only when wellness drivers didn't already say it.
  if (wellnessDrivers.length === 0 && item.score != null && item.score <= 17) {
    phraseIS.push(`heildar-líðan ${item.score}/25 lægri en venjulega`);
    phraseEN.push(`overall wellness ${item.score}/25 lower than usual`);
  }

  // (3) PL spike — translate the ratio into "% over usual" so the coach
  // doesn't have to interpret "1,73×". Annotate post-match clearly so the
  // coach knows it's expected echo rather than an unplanned overreach.
  if (item.plSpike != null && item.plSpike >= 1.6) {
    const pct = Math.round((item.plSpike - 1) * 100);
    if (postMatch) {
      phraseIS.push(`æfingaálag í gær var ${pct}% yfir venjulegu (passar við leikinn)`);
      phraseEN.push(`yesterday's training load was ${pct}% above usual (matches the game)`);
    } else {
      phraseIS.push(`æfingaálag í gær var ${pct}% yfir venjulegu`);
      phraseEN.push(`yesterday's training load was ${pct}% above usual`);
    }
  } else if (item.composite != null && item.composite >= 0.75 && (item.plSpike == null || item.plSpike < 1.6)) {
    if (postMatch) {
      phraseIS.push("samanlagt álag síðustu daga er hátt (eðlilegt eftir leik)");
      phraseEN.push("recent days' combined load is high (expected post-match)");
    } else {
      phraseIS.push("samanlagt álag síðustu daga er hátt");
      phraseEN.push("recent days' combined load is high");
    }
  }

  // (4) Fatigue type — translate into what kind of WORK strained the body,
  // not the sport-science term for the strain. "Mechanical" means accel/
  // decel volume; "metabolic" means high-speed running volume.
  const ft = item.fatigueType;
  if (ft === "mechanical_fatigue") {
    phraseIS.push("mikið af hröðunum og hemlunum — tekur á vöðva og sinum");
    phraseEN.push("a lot of accelerations and decelerations — heavy on muscles and tendons");
  } else if (ft === "metabolic_fatigue") {
    phraseIS.push("mikið af háhraða-hlaupum — þolfærið tekur á sig");
    phraseEN.push("a lot of high-speed running — heavy on the engine");
  } else if (ft === "global_fatigue") {
    phraseIS.push("álag á allt kerfið — bæði vöðvar og þol");
    phraseEN.push("strain across the whole system — both muscles and engine");
  }

  // ── Build lead sentence. If we have nothing typed-specific, fall back
  // to the compactStatus phrase so the row is never empty of prose.
  const buildLead = (parts: string[], conj: string, fallback: string): string => {
    if (parts.length === 0) return capitaliseFirst(fallback) + ".";
    const first = capitaliseFirst(parts[0]);
    if (parts.length === 1) return first + ".";
    // Join the rest with "; " — feels right for stacked clinical phrases.
    return first + "; " + parts.slice(1).join(conj) + ".";
  };

  const leadIS = buildLead(phraseIS, " og ", item.compactStatus);
  const leadEN = buildLead(phraseEN, " and ", item.compactStatus);

  // ── Sentence 2 — the actionable lever, or a "this is expected" tail
  // for post-match echo with no counterfactual.
  let tailIS = "";
  let tailEN = "";
  if (item.topCounterfactual) {
    // Counterfactual descriptions already read as full sentences ending
    // with "→ GREEN" etc.; capitalise & ensure trailing period.
    tailIS = " " + ensurePeriod(capitaliseFirst(item.topCounterfactual.descriptionIS));
    tailEN = " " + ensurePeriod(capitaliseFirst(item.topCounterfactual.descriptionEN));
  } else if (postMatch && !isRedToday) {
    tailIS = " Þetta er eðlilegt eftir leik — fylgjast með honum, en engin sérstök aðgerð.";
    tailEN = " This is expected after a match — keep an eye on him, but no extra action.";
  }

  return {
    is: leadIS + tailIS,
    en: leadEN + tailEN,
  };
}

function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensurePeriod(s: string): string {
  if (!s) return s;
  const last = s.charAt(s.length - 1);
  return /[.!?]/.test(last) ? s : s + ".";
}

/**
 * Build a 5-second team-pulse headline. The coach should be able to glance
 * at the top of the briefing card and know — in ONE sentence — what state
 * the squad is in, who needs attention, and what kind of day it is. Tiles
 * and chips below are for drill-down; this is the headline answer.
 *
 * Designed to never need decoding: noun-phrase verdict ("Squad is fresh
 * and ready" / "Caution day" / "Risk day" / "Rest day") plus the top
 * 1-2 names by severity, plus the readiness count.
 *
 * Returns level for the colour band wrapper and a single short sentence
 * for the headline text. MD-day context (e.g. "Day before match") is
 * appended only when it materially changes how the coach should read the
 * pulse — otherwise the MD-badge in the card header already shows it.
 */
function computeTeamPulse(
  attention: AttentionItem[],
  alertCount: number,
  monitorCount: number,
  nFull: number,
  nPlayers: number,
  isOffDay: boolean,
  mdLabel: string | null,
  lang: "IS" | "EN",
): { level: "fresh" | "caution" | "risk" | "rest"; sentence: string } {
  const is = lang === "IS";

  // Top 1-2 names by severity (alerts first, then monitors). Used in the
  // pulse sentence so the coach knows WHO without scanning the attention
  // list. Pull first names only — keeps the headline scannable.
  const firstNameOf = (full: string): string => full.split(/\s+/)[0] || full;
  const namesByPriority = attention
    .slice()
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "alert" ? -1 : 1;
      return b.reasons.length - a.reasons.length;
    })
    .map((x) => firstNameOf(x.name))
    .slice(0, 2);

  // Format a name list as "Andri" / "Andri og Höskuldur" / "Andri og 2 til viðbótar".
  const formatNames = (): string => {
    const remaining = (alertCount + monitorCount) - namesByPriority.length;
    if (namesByPriority.length === 0) return "";
    if (namesByPriority.length === 1) {
      if (remaining > 0) {
        return is
          ? `${namesByPriority[0]} og ${remaining} til viðbótar`
          : `${namesByPriority[0]} and ${remaining} more`;
      }
      return namesByPriority[0];
    }
    // 2 names
    if (remaining > 0) {
      return is
        ? `${namesByPriority[0]}, ${namesByPriority[1]} og ${remaining} til viðbótar`
        : `${namesByPriority[0]}, ${namesByPriority[1]} and ${remaining} more`;
    }
    return is
      ? `${namesByPriority[0]} og ${namesByPriority[1]}`
      : `${namesByPriority[0]} and ${namesByPriority[1]}`;
  };

  // ── OFF day — squad isn't training, just monitoring.
  if (isOffDay) {
    if (alertCount + monitorCount === 0) {
      return {
        level: "rest",
        sentence: is
          ? `Frídagur — enginn að athuga í dag. ${nFull}/${nPlayers} skiluðu daglegri líðan.`
          : `Rest day — no one to watch today. ${nFull}/${nPlayers} completed their daily check-in.`,
      };
    }
    return {
      level: "rest",
      sentence: is
        ? `Frídagur — ${formatNames()} að fylgjast með, restin er í lagi.`
        : `Rest day — watching ${formatNames()}, the rest are fine.`,
    };
  }

  // ── Match-day context — leads the sentence with kickoff framing.
  const md = (mdLabel ?? "").toUpperCase();
  const isMatchDay = md === "MD" || md === "MD+0" || md === "MD0";
  if (isMatchDay) {
    if (alertCount === 0 && monitorCount === 0) {
      return {
        level: "fresh",
        sentence: is
          ? `Leikdagur — ${nFull}/${nPlayers} klárir í leikinn.`
          : `Match day — ${nFull}/${nPlayers} cleared for the match.`,
      };
    }
    return {
      level: alertCount > 0 ? "risk" : "caution",
      sentence: is
        ? `Leikdagur — ${formatNames()} ${alertCount > 0 ? "í rauðu" : "í gulu"}, ${nFull}/${nPlayers} klárir.`
        : `Match day — ${formatNames()} ${alertCount > 0 ? "in red" : "in yellow"}, ${nFull}/${nPlayers} cleared.`,
    };
  }

  // ── Training day — three bands by severity.
  if (alertCount === 0 && monitorCount === 0) {
    return {
      level: "fresh",
      sentence: is
        ? `Liðið er hresst og tilbúið — ${nFull}/${nPlayers} klárir í fulla æfingu.`
        : `Squad is fresh and ready — ${nFull}/${nPlayers} cleared for a full session.`,
    };
  }
  if (alertCount === 0) {
    // Monitor-only — caution day, no real risk
    return {
      level: "caution",
      sentence: is
        ? `Hóflegt — fylgstu með ${formatNames()}, restin klár (${nFull}/${nPlayers}).`
        : `Mixed day — watch ${formatNames()}, the rest are ready (${nFull}/${nPlayers}).`,
    };
  }
  // Has at least one alert — risk day
  return {
    level: "risk",
    sentence: is
      ? `Áhættudagur — ${formatNames()} ${alertCount > 0 ? "í rauðu" : "í gulu"}; ${nFull}/${nPlayers} klárir í fulla æfingu.`
      : `Risk day — ${formatNames()} ${alertCount > 0 ? "in red" : "in yellow"}; ${nFull}/${nPlayers} cleared for a full session.`,
  };
}

/**
 * Tooltip text for the Compact-mode status badge — surfaces the science
 * provenance behind each status phrase so the coach can see WHICH research
 * underpins the label. Increases trust without cluttering the visible UI.
 */
/**
 * Compute the day-over-day delta verdict for an attention row. Coaches
 * read deltas faster than absolute states — "Jón fór úr grænu í gult í
 * dag" triggers action; "Jón er í gulu" might just be his baseline. This
 * makes the change part of the row.
 *
 * Returns null when there's no yesterday snapshot, or when nothing
 * actionable changed (avoids visual noise on routine days).
 */
function computeDelta(
  todayColor: "green" | "yellow" | "red" | null,
  todayScore: number | null,
  yesterday: { color: "green" | "yellow" | "red" | null; score: number | null } | null,
): { kind: "new" | "worse" | "better" | "same"; summaryIS: string; summaryEN: string } | null {
  if (!yesterday) return null;
  const yColor = yesterday.color;
  const yScore = yesterday.score;

  const rank = (c: "green" | "yellow" | "red" | null): number =>
    c === "red" ? 3 : c === "yellow" ? 2 : c === "green" ? 1 : 0;

  // Yesterday-OFF / no yesterday data — say "new today" so the coach
  // doesn't assume it's a persistent state.
  if (yColor == null) {
    return {
      kind: "new",
      summaryIS: "Nýtt í dag — engar gögn frá í gær",
      summaryEN: "New today — no data from yesterday",
    };
  }

  const rToday = rank(todayColor);
  const rYday = rank(yColor);

  const colourWord = (c: "green" | "yellow" | "red" | null, is: boolean): string => {
    if (c === "green") return is ? "grænu" : "green";
    if (c === "yellow") return is ? "gulu" : "yellow";
    if (c === "red") return is ? "rauðu" : "red";
    return is ? "engu" : "n/a";
  };

  // (1) Same colour today as yesterday — small delta only if score moved
  // meaningfully (>= 3 of 25). Otherwise return "same" so we can show
  // "óbreyttur" if useful.
  if (todayColor === yColor) {
    const scoreDelta = (todayScore != null && yScore != null) ? todayScore - yScore : null;
    if (scoreDelta != null && Math.abs(scoreDelta) >= 3) {
      const better = scoreDelta > 0;
      return {
        kind: better ? "better" : "worse",
        summaryIS: better
          ? `Skár en í gær (skor +${scoreDelta})`
          : `Verri en í gær (skor ${scoreDelta})`,
        summaryEN: better
          ? `Better than yesterday (score +${scoreDelta})`
          : `Worse than yesterday (score ${scoreDelta})`,
      };
    }
    return {
      kind: "same",
      summaryIS: `Óbreyttur — var líka í ${colourWord(yColor, true)} í gær`,
      summaryEN: `Unchanged — also ${colourWord(yColor, false)} yesterday`,
    };
  }

  // (2) Different colour — that's the most actionable case.
  if (rToday > rYday) {
    // Worse today than yesterday — coach attention trigger.
    return {
      kind: "worse",
      summaryIS: `Verri en í gær — fór úr ${colourWord(yColor, true)} í ${colourWord(todayColor, true)}`,
      summaryEN: `Worse than yesterday — moved from ${colourWord(yColor, false)} to ${colourWord(todayColor, false)}`,
    };
  }
  // rToday < rYday — improved today.
  return {
    kind: "better",
    summaryIS: `Skár en í gær — fór úr ${colourWord(yColor, true)} í ${colourWord(todayColor, true)}`,
    summaryEN: `Better than yesterday — moved from ${colourWord(yColor, false)} to ${colourWord(todayColor, false)}`,
  };
}

function statusSourceHint(item: AttentionItem, lang: "IS" | "EN"): string {
  const is = lang === "IS";
  // Walk the same priority order the status-builder uses, so the hint
  // matches whatever phrase the coach is actually seeing. Plain language
  // only — short sentence + research source as a tail attribution.
  if (item.injury) {
    return is
      ? "Skráð meiðsli — sést líka í Decision summary."
      : "Logged injury — also shown in Decision summary.";
  }
  const ft = item.fatigueType;
  if (item.plSpike != null && item.plSpike >= 1.6) {
    return is
      ? "Hreyfingaálag í gær var verulega yfir því sem hann gerir venjulega. Heimild: Gabbett 2017."
      : "His movement load yesterday was clearly above what he usually does. Source: Gabbett 2017.";
  }
  if (ft === "mechanical_fatigue") {
    return is
      ? "Mikið af hröðunum og hemlunum í gær — tekur á vöðva og sinum. Heimild: McBurnie 2022."
      : "Lots of accelerations and decelerations yesterday — heavy on muscles and tendons. Source: McBurnie 2022.";
  }
  if (ft === "metabolic_fatigue") {
    return is
      ? "Mikið af háhraða-hlaupum í gær — þolfærið tekur á sig. Heimild: di Prampero 2015."
      : "Lots of high-speed running yesterday — heavy on the engine. Source: di Prampero 2015.";
  }
  if (ft === "global_fatigue") {
    return is
      ? "Bæði vöðva- og þolfærisálag — álag á allt kerfið. Heimild: Gabbett 2017."
      : "Both muscle and engine strain — load on the whole system. Source: Gabbett 2017.";
  }
  // Fall back to a generic explanation for the wellness/composite case.
  return is
    ? "Tölurnar í dag eru lægri en það sem hann skráir venjulega. Heimild: Robertson 2017, Buchheit 2024."
    : "Today's numbers are lower than what he usually reports. Source: Robertson 2017, Buchheit 2024.";
}

function buildAttentionList(
  rows: BriefingRow[],
  playerComposites: Record<string, PlayerCompositeEntry>,
  lang: "IS" | "EN",
  playerBaselines: Record<string, Record<string, AthleteMetricBaseline>> | null,
  playerCounterfactuals: DailyBriefingCardProps["playerCounterfactuals"] | null,
  recentDayTypes: Record<string, string | null> | null | undefined,
  todayIso: string,
  playerInjuries: DailyBriefingCardProps["playerInjuries"] | null,
  playerDeltas: DailyBriefingCardProps["playerDeltas"] | null,
): AttentionItem[] {
  const r = COPY[lang].reasons;
  const cl = COPY[lang].compact;
  const inj = COPY[lang].injury;
  const out: AttentionItem[] = [];

  for (const row of rows) {
    const reasons: string[] = [];
    let level: AttentionLevel = "ok";

    // ── Active injury — highest-priority context. An injured player must
    // never read as an ordinary readiness row: injury leads the reasons
    // list and forces the row into the attention list even when the
    // player's wellness readiness happens to be green.
    const injRec = playerInjuries?.[String(row.player_id)] ?? null;
    const injStatus = injRec?.status ?? null;
    let injury: AttentionItem["injury"] = null;
    if (injStatus === "injured" || injStatus === "rehabilitation" || injStatus === "rtp_training") {
      const detail = [injRec?.bodyPart, injRec?.injuryType]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      if (injStatus === "injured") {
        injury = { kind: "injured", badge: inj.badgeInjured, detail };
        reasons.push(inj.injured);
        level = "alert";
      } else if (injStatus === "rehabilitation") {
        injury = { kind: "rehab", badge: inj.badgeRehab, detail };
        reasons.push(inj.rehab);
        level = "alert";
      } else {
        injury = { kind: "rtp", badge: inj.badgeRtp, detail };
        reasons.push(inj.rtp);
        level = "monitor";
      }
    }

    // ── Match-day awareness (Gabbett 2017 + di Prampero 2015 — load spikes
    // following matches are expected and should not fire alert; they're an
    // echo of match exposure, not an unplanned overreach). When detected, we
    // (a) downgrade alert→monitor and (b) annotate the reason with "post-match"
    // so coach reads it correctly.
    const postMatch = isPostMatchContext(row, recentDayTypes, todayIso);

    const col = row.final_color ?? null;
    if (col === "red") {
      reasons.push(r.redReadiness);
      level = "alert";
    } else if (col === "yellow") {
      reasons.push(r.yellowReadiness);
      if (level === "ok") level = "monitor";
    } else if ((row.total_score ?? 99) <= 12) {
      reasons.push(r.lowScore(row.total_score ?? 0));
      if (level === "ok") level = "monitor";
    }

    const comp = playerComposites[String(row.player_id)];
    if (comp) {
      if (comp.concernLevel === "high") {
        // Post-match: don't escalate composite-high to alert; it's expected.
        reasons.push(postMatch ? r.compositeHighPostMatch : r.compositeHigh);
        if (postMatch) {
          if (level === "ok") level = "monitor";
        } else {
          level = "alert";
        }
      } else if (comp.concernLevel === "moderate") {
        reasons.push(r.compositeMod);
        if (level === "ok") level = "monitor";
      }
      if (comp.playerLoadSpike != null && comp.playerLoadSpike >= 1.6) {
        // Post-match PL spike → annotate + downgrade to monitor.
        reasons.push(postMatch ? r.plSpikePostMatch(comp.playerLoadSpike) : r.plSpike(comp.playerLoadSpike));
        if (postMatch) {
          if (level === "ok") level = "monitor";
        } else {
          level = "alert";
        }
      } else if (comp.playerLoadSpike != null && comp.playerLoadSpike >= 1.15 && level === "ok") {
        reasons.push(postMatch ? r.plSpikePostMatch(comp.playerLoadSpike) : r.plSpike(comp.playerLoadSpike));
        level = "monitor";
      }
      const ft = comp.fatigueType ?? null;
      if (ft === "global_fatigue") reasons.push(r.globalFatigue);
      else if (ft === "mechanical_fatigue") reasons.push(r.mechFatigue);
      else if (ft === "metabolic_fatigue") reasons.push(r.metabFatigue);
    }

    if (row._neural_bias_applied) {
      reasons.push(r.neuralBias);
      if (level === "ok") level = "monitor";
    }

    const prot = row._adaptation?.protectTissue ?? null;
    if (prot) {
      reasons.push(r.protectTissue(prot));
      if (level === "ok") level = "monitor";
    }
    if (row._adaptation?.recoveryBias) {
      reasons.push(r.recoveryBias);
      if (level === "ok") level = "monitor";
    }

    if (level !== "ok" && reasons.length > 0) {
      // Dedupe reasons preserving order
      const seen = new Set<string>();
      const unique = reasons.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));

      // Derive a single coach-friendly status phrase for Compact mode.
      // Priority: recovery > post-match echo > heavy load > below normal >
      // fatigue type > monitor. The goal is one phrase that tells a non-S&C
      // coach what's going on without showing them numbers or jargon.
      const ft = comp?.fatigueType ?? null;
      let compactStatus: string;
      if (injury) {
        compactStatus = injury.kind === "injured" ? inj.injured
          : injury.kind === "rehab" ? inj.rehab
          : inj.rtp;
      } else if (col === "red") {
        compactStatus = cl.recoveryFocus;
      } else if (postMatch && (comp?.concernLevel === "high" || (comp?.playerLoadSpike != null && comp.playerLoadSpike >= 1.6))) {
        compactStatus = cl.postMatchEcho;
      } else if (comp?.concernLevel === "high") {
        compactStatus = cl.heavyLoad;
      } else if (comp?.playerLoadSpike != null && comp.playerLoadSpike >= 1.6) {
        compactStatus = cl.highIntensity;
      } else if (col === "yellow") {
        compactStatus = cl.belowNormal;
      } else if (ft === "mechanical_fatigue") {
        compactStatus = cl.mechStrain;
      } else if (ft === "metabolic_fatigue") {
        compactStatus = cl.metabStrain;
      } else if (ft === "global_fatigue") {
        compactStatus = cl.generalFatigue;
      } else if (row._neural_bias_applied) {
        compactStatus = cl.neuralBias;
      } else if (row._adaptation?.protectTissue) {
        compactStatus = cl.protectTissue(row._adaptation.protectTissue);
      } else {
        compactStatus = cl.monitor;
      }

      const drivers = deriveReadinessDrivers(
        row,
        playerBaselines?.[String(row.player_id)] ?? null,
      );
      // Pick the highest-impact counterfactual now so we can also feed it
      // into the explanation builder.
      const topCounterfactual = (() => {
        const list = playerCounterfactuals?.[String(row.player_id)];
        if (!list || list.length === 0) return null;
        const top = list[0];
        return {
          hypotheticalState: top.hypotheticalState,
          descriptionEN: top.descriptionEN,
          descriptionIS: top.descriptionIS,
        };
      })();
      // Load breakdown — surface what *kind* of work spiked, in plain coach
      // labels (no HIR / IMA / FMP / PL abbreviations). Only include sources
      // where the spike is > 1.05 (avoid noise from at-baseline values).
      // Limited to 4 entries to keep the strip compact.
      const loadBreakdown: AttentionItem["loadBreakdown"] = (() => {
        if (!comp) return [];
        const candidates: Array<{ label: string; value: number | null | undefined }> = [
          { label: lang === "IS" ? "Heildarhreyfing" : "Total movement", value: comp.playerLoadSpike },
          { label: lang === "IS" ? "Hröðun" : "Sprints",        value: comp.accelSpike },
          { label: lang === "IS" ? "Hemlun" : "Decelerations", value: comp.decelSpike },
          { label: lang === "IS" ? "Háhraði" : "High-speed running", value: comp.hirSpike },
          { label: lang === "IS" ? "Snöggar hreyfingar" : "Sharp movements", value: comp.imaTotalSpike },
          { label: lang === "IS" ? "Innanhúshreyfingar" : "Indoor bursts", value: comp.fmpDynamicHighSpike },
        ];
        return candidates
          .filter((c): c is { label: string; value: number } => typeof c.value === "number" && c.value > 1.05)
          .sort((a, b) => b.value - a.value)
          .slice(0, 4);
      })();
      // Baseline maturity — pull from the strongest wellness baseline the
      // player has (max n_observations across the four sub-scores). This
      // tells the coach how mature the personal norm behind today's
      // verdict actually is — a flag resting on 5 observations is on
      // thinner ice than one resting on 25.
      const baselineMaturity: AttentionItem["baselineMaturity"] = (() => {
        const bls = playerBaselines?.[String(row.player_id)] ?? null;
        if (!bls) return null;
        const keys = [
          "wellness.sleep_quality",
          "wellness.fatigue_energy",
          "wellness.stress_mood",
          "wellness.muscle_soreness",
        ];
        let maxObs = 0;
        let windowDays = 14;
        for (const k of keys) {
          const b = bls[k];
          if (b && typeof b.n_observations === "number" && b.n_observations > maxObs) {
            maxObs = b.n_observations;
            if (typeof b.window_days === "number") windowDays = b.window_days;
          }
        }
        if (maxObs === 0) return null;
        return { obs: maxObs, windowDays };
      })();
      // Day-over-day delta — coaches read change before state. Build from
      // yesterday's snapshot (passed in via playerDeltas); null when no
      // yesterday data is available.
      const delta = computeDelta(
        (col ?? null) as "green" | "yellow" | "red" | null,
        row.total_score ?? null,
        playerDeltas?.[String(row.player_id)] ?? null,
      );
      const itemForExplanation = {
        playerId: String(row.player_id),
        name: row.full_name,
        level,
        reasons: unique,
        compactStatus,
        score: row.total_score ?? null,
        composite: comp?.compositeScore ?? null,
        plSpike: comp?.playerLoadSpike ?? null,
        fatigueType: comp?.fatigueType ?? null,
        drivers,
        topCounterfactual,
        injury,
        confidence: computeAttentionConfidence(
          row,
          comp,
          playerBaselines?.[String(row.player_id)] ?? null,
          todayIso,
          lang,
        ),
        loadBreakdown,
        baselineMaturity,
        delta,
      };
      const explanation = composeAttentionExplanation(
        itemForExplanation,
        postMatch,
        col === "red",
      );

      out.push({
        ...itemForExplanation,
        // Counterfactual is already pre-computed above (single highest-
        // impact lever). The explanation builder used it to compose the
        // prose tail; the UI uses it for the inline "→GREEN" chip.
        topCounterfactual,
        explanation,
      });
    }
  }

  // Sort: alert before monitor, then by reason count desc
  out.sort((a, b) => {
    if (a.level !== b.level) return a.level === "alert" ? -1 : 1;
    return b.reasons.length - a.reasons.length;
  });

  return out;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DailyBriefingCard(props: DailyBriefingCardProps) {
  const {
    today,
    lang,
    rows,
    playerComposites,
    complianceSummary = null,
    mdDayToday = null,
    teamSignal = null,
    dayStateLabel = null,
    recentDayTypes = null,
    playerBaselines = null,
    playerCounterfactuals = null,
    playerInjuries = null,
    playerDeltas = null,
  } = props;

  const t = COPY[lang];

  const attention = useMemo(
    () => buildAttentionList(rows, playerComposites, lang, playerBaselines, playerCounterfactuals, recentDayTypes, today, playerInjuries, playerDeltas),
    [rows, playerComposites, lang, playerBaselines, playerCounterfactuals, recentDayTypes, today, playerInjuries, playerDeltas],
  );

  // ── Post-OFF context ──────────────────────────────────────────────────
  // Counts how many consecutive OFF days immediately precede `today`.
  // Zero when yesterday was a training/game/recovery day. Surfaces as a
  // neutral grey badge so the coach knows that comparisons to "yesterday"
  // are unavailable without being misled by imputed numbers.
  const consecutiveOffBeforeToday = useMemo(() => {
    if (!recentDayTypes) return 0;
    let count = 0;
    for (let offset = 1; offset <= 7; offset++) {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - offset);
      const key = d.toISOString().slice(0, 10);
      const raw = recentDayTypes[key];
      if (!raw) break; // no data → stop counting
      if (String(raw).toUpperCase() !== "OFF") break;
      count += 1;
    }
    return count;
  }, [recentDayTypes, today]);

  // Whether the attention list is expanded to show all rows or collapsed to
  // the first 5. Toggled by the "+N more" / "Sýna færri" button below.
  const [showAllAttention, setShowAllAttention] = useState(false);

  // Compact vs Detailed view (added 2026-04-29 after coach feedback that the
  // numeric chips were overwhelming for non-S&C coaches). Compact = name +
  // status dot + plain-language reasons + fatigue tag only. Detailed = adds
  // Score/Comp/PL chips, driver chips, and the "→ GREEN if X" counterfactual
  // line. Default is "compact" for new users; preference persisted in
  // localStorage so a numerate coach who flips to Detailed only does it once.
  const [verbosity, setVerbosity] = useState<"compact" | "detailed">(() => {
    if (typeof window === "undefined") return "compact";
    const saved = window.localStorage.getItem("coachDailyBriefingVerbosity");
    return saved === "detailed" ? "detailed" : "compact";
  });
  const detailed = verbosity === "detailed";
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("coachDailyBriefingVerbosity", verbosity);
  }, [verbosity]);

  const alertCount = attention.filter((x) => x.level === "alert").length;
  const monitorCount = attention.filter((x) => x.level === "monitor").length;
  const watchCount = alertCount + monitorCount;

  const plannedRow = rows[0]; // all rows on same day share planned_*
  const focusLabel = formatFocus(plannedRow, lang);

  // Count high-load signals across team
  const spikeCount = useMemo(
    () =>
      Object.values(playerComposites).filter(
        (c) => c.playerLoadSpike != null && c.playerLoadSpike >= 1.15,
      ).length,
    [playerComposites],
  );

  // ── Team pulse — single-glance aggregate across the squad ─────────────
  // Answers three morning-briefing questions:
  //   1) How does the team feel on average?  (avg total_score / 25)
  //   2) Is that better or worse than yesterday?  (z-delta from _z_today vs _yesterday_z)
  //   3) What kind of fatigue dominates?  (counts by fatigueType)
  const teamPulse = useMemo(() => {
    const scores = rows
      .map((r) => (typeof r.total_score === "number" ? r.total_score : null))
      .filter((x): x is number => x != null);
    const avgScore = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

    // Trend vs yesterday — compare daily z-scores if the dashboard
    // has hydrated them onto the row (DevCoachDashboardClient sets both).
    const deltas = rows
      .map((r) => {
        const zy = typeof r._yesterday_z === "number" ? r._yesterday_z : null;
        const zt = typeof r._z_today === "number" ? r._z_today : null;
        return zy != null && zt != null ? zt - zy : null;
      })
      .filter((x): x is number => x != null);
    const meanDelta = deltas.length
      ? deltas.reduce((a, b) => a + b, 0) / deltas.length
      : null;
    const trend: "up" | "down" | "flat" | null =
      meanDelta == null ? null
        : meanDelta > 0.1 ? "up"
        : meanDelta < -0.1 ? "down"
        : "flat";

    // Fatigue breakdown from playerComposites
    let mech = 0, metab = 0, global = 0;
    for (const c of Object.values(playerComposites)) {
      if (c.fatigueType === "mechanical_fatigue") mech++;
      else if (c.fatigueType === "metabolic_fatigue") metab++;
      else if (c.fatigueType === "global_fatigue") global++;
    }
    const fatigueTotal = mech + metab + global;

    return { avgScore, trend, mech, metab, global, fatigueTotal };
  }, [rows, playerComposites]);

  const nFull = Number(teamSignal?.n_full ?? 0);
  const nReduced = Number(teamSignal?.n_reduced ?? 0);
  const nRecovery = Number(teamSignal?.n_recovery ?? 0);
  const nPlayers = Number(teamSignal?.n_players ?? rows.length);

  const dateHeader = formatDateHeader(today, lang);

  // ── Badge de-duplication ──────────────────────────────────────────────
  // On a training day the three badges carry distinct info:
  //   MD-badge ("MD-3") · day state ("Medium training") · focus ("FORCE")
  // On OFF/OTHER days they collapse to the same word, which creates visual
  // noise (see screenshot 14.04: OTHER · OFF DAY · OFF). We therefore:
  //   - hide MD-badge when it's "OTHER" / "UNKNOWN" / empty
  //   - hide dayStateLabel when it's the same word as focus (case-insensitive)
  //     or when focus already signals OFF/RECOVERY (those are self-explanatory)
  const mdRaw = mdDayToday ? String(mdDayToday).trim() : "";
  const isUninformativeMd = !mdRaw || /^(other|unknown|—|-)$/i.test(mdRaw);
  const mdLabel = isUninformativeMd ? null : mdRaw;

  const focusNormalized = focusLabel.trim().toLowerCase();
  const dayStateNormalized = (dayStateLabel ?? "").trim().toLowerCase();
  const focusImpliesRest = /^(off|off day|recovery|hvíld)/i.test(focusLabel.trim());
  const dayStateRedundant =
    !dayStateNormalized ||
    dayStateNormalized === focusNormalized ||
    dayStateNormalized.includes(focusNormalized) ||
    focusNormalized.includes(dayStateNormalized) ||
    focusImpliesRest;
  const displayDayStateLabel = dayStateRedundant ? null : dayStateLabel;

  // ── Render ────────────────────────────────────────────────────────────
  if (!rows.length) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-4 text-sm text-slate-500">{t.noRows}</CardContent>
      </Card>
    );
  }

  // ── Team pulse — the 5-second answer to "what's the squad state?".
  // One noun-phrase verdict + top 1-2 names by severity + readiness count.
  // Replaces the older talley-style headline ("Watch 3 players") which
  // gave numbers without context. The colour band still tracks alert /
  // monitor severity so a coach scanning at a glance gets the same
  // traffic-light signal they had before, plus the prose verdict.
  const teamDayType = (plannedRow?.planned_day_type ?? "").trim().toUpperCase();
  const isOffToday = teamDayType === "OFF";
  const pulse = computeTeamPulse(
    attention,
    alertCount,
    monitorCount,
    nFull,
    nPlayers,
    isOffToday,
    mdLabel,
    lang,
  );

  const headlineTone =
    pulse.level === "risk"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : pulse.level === "caution"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : pulse.level === "rest"
      ? "border-slate-200 bg-slate-50 text-slate-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">
              {t.title}
            </div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900 capitalize">
              {dateHeader}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{t.subtitle}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mdLabel ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {mdLabel}
              </span>
            ) : null}
            {displayDayStateLabel ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {displayDayStateLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {focusLabel}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team pulse — the 5-second read.
            One prose sentence that captures: today's day-type verdict,
            the top 1-2 players who need attention BY NAME, and the
            readiness count. Coach should glance here ONCE and know:
            "what kind of day is today?" + "who needs me?". Tiles below
            are drill-down detail; this is the headline answer.
            The colour band still mirrors severity (rose/amber/emerald/
            slate) so the traffic-light signal is preserved.
            Below the sentence: keep the alert/monitor pill counts (now
            secondary, not primary) and the After-OFF context badge. */}
        <div className={`rounded-xl border px-4 py-3 ${headlineTone}`}>
          <div className="text-base font-semibold leading-snug">
            {pulse.sentence}
          </div>
          {(alertCount > 0 || monitorCount > 0 || consecutiveOffBeforeToday > 0) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {alertCount > 0 ? (
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  {alertCount} {t.attentionAlert}
                </span>
              ) : null}
              {monitorCount > 0 ? (
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  {monitorCount} {t.attentionMonitor}
                </span>
              ) : null}
              {consecutiveOffBeforeToday > 0 ? (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {consecutiveOffBeforeToday === 1
                    ? t.afterOffOne
                    : t.afterOffMany(consecutiveOffBeforeToday)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 4 quick-glance tiles */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tileReadiness}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums text-emerald-700">{nFull}</span>
              <span className="text-xs text-slate-500">/ {nPlayers} {t.readinessFull}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span className="text-amber-700">{nReduced} {t.readinessReduced}</span>
              <span className="text-slate-300">·</span>
              <span className="text-rose-700">{nRecovery} {t.readinessRecovery}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tilePlanned}
            </div>
            <div className="mt-1 truncate text-base font-semibold text-slate-900" title={focusLabel}>
              {focusLabel}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {(() => {
                const parts: string[] = [];
                if (mdLabel) parts.push(mdLabel);
                const dayType = plannedRow?.planned_day_type?.trim();
                // Skip redundant dayType — e.g. focus "OFF" with day_type "OFF"
                if (dayType && dayType.toLowerCase() !== focusNormalized) parts.push(dayType);
                return parts.join(" · ");
              })()}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tileLoad}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  spikeCount >= 3
                    ? "text-rose-700"
                    : spikeCount > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {spikeCount}
              </span>
              <span className="text-xs text-slate-500">{t.spikeLabel}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {spikeCount > 0 ? t.loadMonitor : t.loadNormal}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.tileAttention}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  alertCount > 0
                    ? "text-rose-700"
                    : monitorCount > 0
                    ? "text-amber-700"
                    : "text-emerald-700"
                }`}
              >
                {watchCount}
              </span>
              <span className="text-xs text-slate-500">
                {watchCount === 0 ? t.attentionNone : ""}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              {alertCount > 0 ? (
                <span className="text-rose-700">{alertCount} {t.attentionAlert}</span>
              ) : null}
              {alertCount > 0 && monitorCount > 0 ? <span className="text-slate-300">·</span> : null}
              {monitorCount > 0 ? (
                <span className="text-amber-700">{monitorCount} {t.attentionMonitor}</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Team pulse — aggregated signals across the squad */}
        <div className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              {t.teamPulse}
            </span>
            {teamPulse.trend ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  teamPulse.trend === "up"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : teamPulse.trend === "down"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {teamPulse.trend === "up"
                  ? t.trendUp
                  : teamPulse.trend === "down"
                  ? t.trendDown
                  : t.trendFlat}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700">
            {teamPulse.avgScore != null ? (
              <span>
                <span className="text-slate-500">{t.avgReadiness}: </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {teamPulse.avgScore.toFixed(1)}
                </span>
                <span className="text-slate-400"> / 25</span>
              </span>
            ) : null}
            <span>
              <span className="text-slate-500">{t.fatigueMix}: </span>
              {teamPulse.fatigueTotal === 0 ? (
                <span className="text-emerald-700">{t.noFatigue}</span>
              ) : (
                <span className="space-x-2">
                  {teamPulse.mech > 0 ? (
                    <span className="font-medium text-amber-700">
                      {teamPulse.mech} {t.mech}
                    </span>
                  ) : null}
                  {teamPulse.metab > 0 ? (
                    <span className="font-medium text-orange-700">
                      {teamPulse.metab} {t.metab}
                    </span>
                  ) : null}
                  {teamPulse.global > 0 ? (
                    <span className="font-medium text-rose-700">
                      {teamPulse.global} {t.global}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Top attention list — enriched with numeric chips so the coach
            sees the actual numbers (score, composite, PL spike) inline. */}
        {attention.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                {t.topAttention}
              </div>
              {/* Compact / Detailed toggle. Compact = action-first view for
                  coaches who don't want number-tokens crowding the page;
                  Detailed = numerate view with all chips + counterfactuals. */}
              <div className="inline-flex rounded-full border border-slate-200 bg-white text-[10px] overflow-hidden">
                {([
                  { v: "compact",  enLabel: "Compact",  isLabel: "Einfalt"  },
                  { v: "detailed", enLabel: "Detailed", isLabel: "Ítarlegt" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setVerbosity(opt.v)}
                    className={`px-2 py-0.5 transition-colors ${
                      verbosity === opt.v
                        ? "bg-slate-700 text-white font-semibold"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {lang === "IS" ? opt.isLabel : opt.enLabel}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-1.5">
              {(showAllAttention ? attention : attention.slice(0, 5)).map((item) => {
                const tone =
                  item.level === "alert"
                    ? "border-rose-200 bg-rose-50"
                    : "border-amber-200 bg-amber-50";
                const dot =
                  item.level === "alert" ? "bg-rose-500" : "bg-amber-500";

                // Chip tone logic mirrors the rest of the dashboard's
                // thresholds so coaches see consistent colouring across screens.
                const scoreChipCls =
                  item.score == null
                    ? null
                    : item.score <= 12
                    ? "border-rose-300 bg-white text-rose-700"
                    : item.score <= 17
                    ? "border-amber-300 bg-white text-amber-700"
                    : "border-slate-200 bg-white text-slate-700";
                const compChipCls =
                  item.composite == null
                    ? null
                    : item.composite >= 0.68
                    ? "border-rose-300 bg-white text-rose-700"
                    : item.composite >= 0.40
                    ? "border-orange-300 bg-white text-orange-700"
                    : item.composite >= 0.15
                    ? "border-slate-200 bg-white text-slate-700"
                    : null; // hide when none/very low — not informative
                const plChipCls =
                  item.plSpike == null || item.plSpike < 1.15
                    ? null
                    : item.plSpike >= 1.6
                    ? "border-rose-300 bg-white text-rose-700"
                    : "border-amber-300 bg-white text-amber-700";
                const fatigueChipLabel =
                  item.fatigueType === "mechanical_fatigue"
                    ? t.reasons.mechFatigue
                    : item.fatigueType === "metabolic_fatigue"
                    ? t.reasons.metabFatigue
                    : item.fatigueType === "global_fatigue"
                    ? t.reasons.globalFatigue
                    : null;

                // Driver chip labels — plug raw numeric values into the
                // localized formatter so the coach sees e.g. "svefn 2/5"
                // or "Δz -0.9". Capped at 3 chips per row to stay scannable.
                // Tier B/C: each chip carries baseline metadata for the
                // tooltip ("His norm 4.1/5, today -1.6 SD from norm") and
                // a chronic-low tag when the player's personal mean for
                // that metric is itself ≤ 2.5 across 28d.
                const driverChipsWithMeta = item.drivers.slice(0, 3).map((d) => {
                  let label = "";
                  switch (d.kind) {
                    case "sleep": label = t.drivers.sleep(d.value); break;
                    case "energy": label = t.drivers.energy(d.value); break;
                    case "stress": label = t.drivers.stress(d.value); break;
                    case "soreness": label = t.drivers.soreness(d.value); break;
                    case "dz": label = t.drivers.dzDrop(d.value); break;
                    case "total": label = t.drivers.total(d.value); break;
                  }

                  // Tier B — personal-norm tooltip text. Only meaningful
                  // for wellness sub-scores (sleep/energy/stress/soreness),
                  // where we have a baseline for comparison.
                  let tooltip: string | undefined;
                  if (d.baselineSource === "personal" && d.baselineMean != null && d.baselineSd != null) {
                    tooltip = t.chipTooltip.personal(d.baselineMean, d.baselineSd, d.z ?? 0);
                  } else if (d.baselineSource === "global") {
                    tooltip = t.chipTooltip.noBaseline;
                  }

                  return {
                    label,
                    tooltip,
                    chronic: d.chronic === true,
                    chronicTooltip: d.chronic && d.baselineMean != null
                      ? t.chipTooltip.chronic(d.baselineMean)
                      : undefined,
                  };
                }).filter((c) => c.label);

                return (
                  <li
                    key={item.playerId}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${tone}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900">
                          {item.name}
                        </span>
                        {/* Injury badge — shown in BOTH modes. An injured
                            player must be unmistakable; never hidden behind
                            the Compact/Detailed toggle. */}
                        {item.injury ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              item.injury.kind === "rtp"
                                ? "bg-amber-200 text-amber-900"
                                : "bg-rose-600 text-white"
                            }`}
                            title={item.injury.detail || undefined}
                          >
                            {item.injury.badge}
                            {item.injury.detail ? (
                              <span className="font-medium normal-case opacity-90">· {item.injury.detail}</span>
                            ) : null}
                          </span>
                        ) : null}
                        {/* Data-confidence pill — shown in BOTH modes. Tells the
                            coach how many input signals are behind this verdict
                            and surfaces missing/stale ones in a tooltip. */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                            item.confidence.level === "high"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : item.confidence.level === "moderate"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-300 border-dashed bg-slate-50 text-slate-600"
                          }`}
                          title={(() => {
                            // Tooltip in plain coach language: how many
                            // signals we have today + how mature his
                            // personal baseline is. No "n=", no "obs",
                            // no jargon.
                            const parts: string[] = [];
                            if (item.confidence.notes.length > 0) {
                              parts.push(item.confidence.notes.join(" · "));
                            } else {
                              parts.push(lang === "IS"
                                ? "Öll merki til staðar — góð gögn"
                                : "All signals present — full data");
                            }
                            if (item.baselineMaturity) {
                              parts.push(lang === "IS"
                                ? `Við höfum ${item.baselineMaturity.obs} skráningar frá honum síðustu ${item.baselineMaturity.windowDays} daga`
                                : `We have ${item.baselineMaturity.obs} entries from him over the last ${item.baselineMaturity.windowDays} days`);
                            }
                            return parts.join("\n");
                          })()}
                          aria-label={
                            lang === "IS"
                              ? `${item.confidence.signalCount} af ${item.confidence.signalTotal} merkjum til staðar`
                              : `${item.confidence.signalCount} of ${item.confidence.signalTotal} signals present`
                          }
                        >
                          {item.confidence.signalCount}/{item.confidence.signalTotal}
                          {/* Baseline maturity — small "fáar skráningar"
                              tag when the personal baseline is thin
                              (≤ 10 entries). Shown so the coach knows
                              when a verdict rests on partial data. */}
                          {item.baselineMaturity && item.baselineMaturity.obs <= 10 ? (
                            <span className="opacity-70">
                              · {lang === "IS" ? "fáar skráningar" : "few entries"}
                            </span>
                          ) : null}
                        </span>
                        {/* Day-over-day delta — the single most actionable
                            signal for a coach reading the brief. Coloured
                            by direction so worse (rose) catches the eye
                            and better (emerald) is reassuring. "Same"
                            renders muted so the coach knows it's a
                            persistent state, not a new flag. */}
                        {item.delta ? (
                          <span
                            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                              item.delta.kind === "worse" || item.delta.kind === "new"
                                ? "border-rose-300 bg-rose-50 text-rose-700"
                                : item.delta.kind === "better"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-500"
                            }`}
                            title={lang === "IS" ? item.delta.summaryIS : item.delta.summaryEN}
                          >
                            {(() => {
                              if (item.delta.kind === "worse" || item.delta.kind === "new") {
                                return lang === "IS" ? "Verri en í gær" : "Worse than yesterday";
                              }
                              if (item.delta.kind === "better") {
                                return lang === "IS" ? "Skár en í gær" : "Better than yesterday";
                              }
                              return lang === "IS" ? "Óbreyttur" : "Unchanged";
                            })()}
                          </span>
                        ) : null}
                        {/* Numeric chips — only in Detailed mode. Compact mode
                            keeps just the fatigue-type tag (which is plain
                            language, not a number) so non-S&C coaches see
                            "mechanical fatigue" instead of "Score 17/25 Comp
                            0.74 PL 1.74×". */}
                        {detailed && scoreChipCls ? (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${scoreChipCls}`}>
                            {t.chipScore} {item.score}/25
                          </span>
                        ) : null}
                        {detailed && compChipCls && item.composite != null ? (
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${compChipCls}`}
                            title={lang === "IS"
                              ? "Heildaræfingaálag síðustu daga (0-1). Yfir 0,75 = töluvert yfir venjulegu álagi. Byggt á rannsóknum Gabbett (2017) og Buchheit (2024)."
                              : "Combined training load over recent days (0-1). Above 0.75 = clearly above normal load. Based on Gabbett (2017) and Buchheit (2024)."}
                          >
                            {t.chipComp} {item.composite.toFixed(2)}
                          </span>
                        ) : null}
                        {detailed && plChipCls && item.plSpike != null ? (
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${plChipCls}`}
                            title={lang === "IS"
                              ? `Hreyfingaálag í gær á móti því sem hann gerir venjulega (28 daga meðaltal). ${Math.round((item.plSpike - 1) * 100)}% ${item.plSpike >= 1.6 ? "yfir venjulegu — veruleg hækkun" : "yfir venjulegu"}.`
                              : `His movement load yesterday vs what he usually does (28-day average). ${Math.round((item.plSpike - 1) * 100)}% ${item.plSpike >= 1.6 ? "above usual — a clear spike" : "above usual"}.`}
                          >
                            {t.chipPl} {item.plSpike.toFixed(2)}×
                          </span>
                        ) : null}
                        {/* Fatigue chip — hidden in Compact mode because the
                            single compactStatus badge below already conveys
                            the same info. */}
                        {detailed && fatigueChipLabel ? (
                          <span
                            className="rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
                            title={(() => {
                              if (lang === "IS") {
                                if (item.fatigueType === "mechanical_fatigue") return "Mikið af hröðunum og hemlunum í gær — tekur á vöðva og sinum.";
                                if (item.fatigueType === "metabolic_fatigue") return "Mikið af háhraða-hlaupum í gær — þolfærið tekur á sig.";
                                return "Bæði vöðva- og þolfærisálag — álag á allt kerfið í gær.";
                              }
                              if (item.fatigueType === "mechanical_fatigue") return "A lot of accelerations and decelerations yesterday — heavy on muscles and tendons.";
                              if (item.fatigueType === "metabolic_fatigue") return "A lot of high-speed running yesterday — heavy on the engine.";
                              return "Both muscle and engine strain — load on the whole system yesterday.";
                            })()}
                          >
                            {fatigueChipLabel}
                          </span>
                        ) : null}
                        {/* Compact-only status badge — single short phrase that
                            replaces the multi-clause reasons line. Tooltip
                            carries the science provenance so the coach can
                            see WHICH research underpins each status. */}
                        {!detailed ? (
                          <span
                            className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                            title={statusSourceHint(item, lang)}
                          >
                            {item.compactStatus}
                          </span>
                        ) : null}
                      </div>
                      {/* Plain-language explanation — the prose layer.
                          Sits directly under the chip row so a non-S&C
                          coach can read WHY the player is flagged in one
                          sentence, without having to decode chips, z-scores
                          or fatigue tags. Built deterministically from the
                          same signals as the chips (no LLM); injured-player
                          rows skip it because the injury badge already
                          tells the story. */}
                      {item.explanation ? (
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {lang === "IS" ? item.explanation.is : item.explanation.en}
                        </p>
                      ) : null}
                      {/* Load breakdown strip — shows WHAT kind of work
                          spiked behind the composite score. Only spikes
                          >1.05× are listed (sorted descending), capped at
                          4 entries. Detailed mode only — the brief overview
                          stays clean. Tooltip hovers explain each metric's
                          source. */}
                      {detailed && item.loadBreakdown.length > 0 ? (
                        <div
                          className="mt-1 flex flex-wrap items-center gap-1"
                          title={lang === "IS"
                            ? "Hvaða tegund vinnu var meiri en venjulega í gær — hröðun, hemlun, háhraði o.s.frv. Allar tölur eru í gær á móti því sem hann gerir venjulega."
                            : "Which kind of work was heavier than usual yesterday — sprints, decelerations, high-speed running, etc. Ratios are yesterday vs his usual."}
                        >
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mr-0.5">
                            {lang === "IS" ? "Tegund álags" : "Type of load"}:
                          </span>
                          {item.loadBreakdown.map((b, i) => {
                            const pct = Math.round((b.value - 1) * 100);
                            return (
                              <span
                                key={`${item.playerId}-bd-${i}`}
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                                  b.value >= 1.6 ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : b.value >= 1.3 ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-slate-200 bg-white text-slate-600"
                                }`}
                                title={lang === "IS"
                                  ? `${pct}% yfir því sem hann gerir venjulega`
                                  : `${pct}% above what he usually does`}
                              >
                                {b.label} +{pct}%
                              </span>
                            );
                          })}
                        </div>
                      ) : null}
                      {/* Driver chips — orsök layer. Separate row, orange
                          accent so they read as "why" (not as "what to do"
                          which is Decision summary's job).
                          Tier B: each chip carries a `title` tooltip with
                          personal-norm context ("His norm 4.1/5 …") so the
                          coach can see at a glance whether this is normal
                          for this player or a true deviation.
                          Tier C: chronic-low chips get a slate badge to
                          flag long-term low personal norm (e.g. a player
                          who consistently reports stress 2/5 — a chronic
                          warning, not a today problem). */}
                      {detailed && driverChipsWithMeta.length > 0 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {driverChipsWithMeta.map((c, idx) => (
                            <span
                              key={`${item.playerId}-drv-${idx}`}
                              className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-orange-800"
                              title={c.tooltip}
                            >
                              {c.label}
                              {c.chronic ? (
                                <span
                                  className="rounded-sm border border-slate-400 bg-slate-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-600"
                                  title={c.chronicTooltip}
                                >
                                  {t.chronicTag}
                                </span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {/* Multi-clause reasons line — Detailed mode only.
                          In Compact mode the single status badge above plus
                          the prose explanation carry the message.
                          Now that the prose explanation sits above this
                          line, the dot-joined reasons act as a diagnostic
                          backstop — we keep them, but visually muted so
                          they don't compete with the prose. */}
                      {detailed ? (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          <span className="opacity-70 mr-1">{lang === "IS" ? "Merki:" : "Signals:"}</span>
                          {item.reasons.join(" · ")}
                        </div>
                      ) : null}
                      {/* What-if hint — top counterfactual, single line.
                          Surfaces "if X had been Y → GREEN" right under
                          the reasons so the coach reads what's wrong AND
                          what would change it without expanding. Hidden
                          when no useful counterfactual (multi-concern
                          day where no single lever helps). */}
                      {detailed && item.topCounterfactual ? (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] italic text-sky-700">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold not-italic tabular-nums ${
                              item.topCounterfactual.hypotheticalState === "GREEN"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : item.topCounterfactual.hypotheticalState === "YELLOW"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-300 bg-white text-slate-600"
                            }`}
                            aria-hidden="true"
                          >
                            →{item.topCounterfactual.hypotheticalState}
                          </span>
                          <span className="truncate">
                            {lang === "IS"
                              ? item.topCounterfactual.descriptionIS
                              : item.topCounterfactual.descriptionEN}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {attention.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAllAttention((v) => !v)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-expanded={showAllAttention}
              >
                {showAllAttention
                  ? t.showLess
                  : t.showMore(attention.length - 5)}
                <span aria-hidden="true" className="text-[10px]">
                  {showAllAttention ? "▲" : "▼"}
                </span>
              </button>
            ) : null}
          </div>
        )}

        {/* Compliance strip */}
        {complianceSummary && (() => {
          const ci = complianceSummary.checkin;
          const rp = complianceSummary.rpe;
          const ciSubmitted = ci.submitted;
          const ciTotal = ci.submitted + ci.imputed + ci.missing;
          const rpSubmitted = rp.submitted;
          const rpTotal = rp.submitted + rp.imputed + rp.missing;
          const hasMissing = ci.missing > 0 || rp.missing > 0;
          return (
            <div
              className={`rounded-xl border px-4 py-2.5 text-xs ${
                hasMissing
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <span className="font-semibold">{t.compliance}:</span>{" "}
              <span>
                {t.checkin} {ciSubmitted}/{ciTotal}
              </span>
              <span className="mx-2 text-slate-300">·</span>
              <span>
                {t.rpe} {rpSubmitted}/{rpTotal}
              </span>
              {ci.missing > 0 ? (
                <span className="ml-2 text-amber-700">✗ {ci.missing} {t.checkin.toLowerCase()}</span>
              ) : null}
              {rp.missing > 0 ? (
                <span className="ml-2 text-amber-700">✗ {rp.missing} {t.rpe.toLowerCase()}</span>
              ) : null}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
