// ─────────────────────────────────────────────────────────────────────────────
// Attention engine (formerly DailyBriefingCard)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pure logic behind the coach Today "Needs attention" surface: turns
// BriefingRow[] into a deduped, deterministically-ordered AttentionItem[]
// (buildAttentionList) plus the single-source count selector
// (selectNeedsAttention). No React, no data fetching — consumed by the dashboard
// mapping + AttentionList + unit tests. The Daily Briefing card that once lived
// here was retired when the Command Center absorbed its squad-level read; this
// module keeps the engine.
// ─────────────────────────────────────────────────────────────────────────────

import {
  flagAgainstBaseline,
  type AthleteMetricBaseline,
} from "@/lib/micropulse/baselines";
import { isEstimatedVerdict } from "@/lib/micropulse/readiness/imputedVerdict";
import {
  READINESS_LOW_SCORE,
  PL_SPIKE_MONITOR,
  PL_SPIKE_ALERT,
  COMPOSITE_HIGH_SCORE,
  DELTA_MEANINGFUL_SCORE,
  CONFIDENCE_HIGH_RATIO,
  CONFIDENCE_MODERATE_RATIO,
  MIN_MATURE_OBS,
} from "@/lib/micropulse/attention/thresholds";

// ── Types (loose — we only read fields we care about) ──────────────────────

type FinalColor = "red" | "yellow" | "green";

export type BriefingRow = {
  player_id: string;
  full_name: string;
  entry_date?: string | null;
  final_color?: FinalColor | null;
  total_score?: number | null;
  // Provenance of today's verdict. When true the player did NOT check in and
  // the colour/score are an estimate (rolling_10d_median), sourced from
  // v_coach_readiness_today_v8.is_imputed. An estimated verdict must never fire
  // an identical hard ALERT to a measured one — see buildAttentionList.
  is_imputed?: boolean | null;
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
    // Whether yesterday's snapshot was itself an estimate (no check-in). A
    // "worse/better" trend built on an imputed yesterday is not a real trend —
    // computeDelta relabels it rather than asserting a confident direction.
    imputed?: boolean | null;
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
        `Hans venja: ${mean.toFixed(1)}/5 (SD ${sd.toFixed(1)}) — í dag ${z.toFixed(1)} SD frá venju. Heimild: Robertson 2017 (persónuleg viðmið > heildarviðmið).`,
      noBaseline: "Engin persónuleg venja ennþá — nota heildarviðmið (≤2). Mun batna eftir 7+ skráningar (Robertson 2017).",
      chronic: (mean: number) =>
        `Hans venja er ${mean.toFixed(1)}/5 — undir 2,5 yfir 28 daga. Það er ekki dagsmál heldur langtíma viðvörun.`,
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
      plSpikeContextUnknown: (ratio: number) => `PL ${ratio.toFixed(2)}× (leikssamhengi óþekkt)`,
      compositeHighContextUnknown: "há composite load (leikssamhengi óþekkt)",
      protectTissue: (t: string) => `vernda ${t.toLowerCase()}`,
      recoveryBias: "recovery bias",
      mechFatigue: "vélrænt álag",
      metabFatigue: "efnaskiptaálag",
      globalFatigue: "heildarþreyta",
      compositeHighPostMatch: "há composite load (eftir leik)",
      robustnessElevated: "Álagsþol hækkað — áhættu-viðvörun (ekki readiness)",
      robustnessWatch: "Álagsþol: fylgstu með — áhættu-viðvörun (ekki readiness)",
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
        `His usual: ${mean.toFixed(1)}/5 (SD ${sd.toFixed(1)}) — today ${z.toFixed(1)} SD from usual. Source: Robertson 2017 (personal norms beat group thresholds).`,
      noBaseline: "No personal baseline yet — using group threshold (≤2). Will improve after 7+ check-ins (Robertson 2017).",
      chronic: (mean: number) =>
        `His usual is ${mean.toFixed(1)}/5 — below 2.5 across 28d. This is a long-term warning, not a today problem.`,
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
      plSpikeContextUnknown: (ratio: number) => `PL ${ratio.toFixed(2)}× (match context unknown)`,
      compositeHighContextUnknown: "high composite load (match context unknown)",
      protectTissue: (t: string) => `protect ${t.toLowerCase()}`,
      recoveryBias: "recovery bias",
      mechFatigue: "mechanical fatigue",
      metabFatigue: "metabolic fatigue",
      globalFatigue: "global fatigue",
      compositeHighPostMatch: "high composite load (post-match)",
      robustnessElevated: "Robustness elevated — injury early-warning (not readiness)",
      robustnessWatch: "Robustness: watch — injury early-warning (not readiness)",
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

export type AttentionItem = {
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
  // ── Provenance / confidence markers — keep a flag VISIBLE but never let an
  // estimate or a thin-baseline verdict impersonate a measured hard ALERT.
  //   • estimated — today's verdict is imputed (no check-in). Capped below
  //     hard-alert: a readiness/load concern on an estimate is a monitor, not
  //     an alert, and its delta is never a confident "worse/better".
  //   • provisional — measured, but the flag rests on low data-confidence or an
  //     immature personal baseline (obs ≤ MIN_MATURE_OBS). Level is kept, but
  //     the row is tagged so the coach sees the flag is on thinner ice.
  //   • stale — today's row is older than todayIso (no fresh check-in); the
  //     delta is not treated as a confident day-over-day trend.
  //   • matchContextUnknown — a load spike fired but there is no plan/day-type
  //     context to tell whether it's an expected post-match echo; annotated
  //     rather than silently hard-alerted.
  estimated?: boolean;
  provisional?: boolean;
  stale?: boolean;
  matchContextUnknown?: boolean;
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
    ratio >= CONFIDENCE_HIGH_RATIO ? "high" : ratio >= CONFIDENCE_MODERATE_RATIO ? "moderate" : "low";

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
  // Post-match neuromuscular + perceived fatigue persist ~24–72 h, heaviest
  // MD+1 and rebounding by MD+2/MD+3 (Nédélec 2012 / Silva 2018) — so the
  // coach-facing post-match clauses carry that citation inline.
  if (item.plSpike != null && item.plSpike >= PL_SPIKE_ALERT) {
    const pct = Math.round((item.plSpike - 1) * 100);
    if (postMatch) {
      phraseIS.push(`æfingaálag í gær var ${pct}% yfir venjulegu (passar við leikinn — Nédélec 2012)`);
      phraseEN.push(`yesterday's training load was ${pct}% above usual (matches the game — Nédélec 2012)`);
    } else {
      phraseIS.push(`æfingaálag í gær var ${pct}% yfir venjulegu`);
      phraseEN.push(`yesterday's training load was ${pct}% above usual`);
    }
  } else if (item.composite != null && item.composite >= COMPOSITE_HIGH_SCORE && (item.plSpike == null || item.plSpike < PL_SPIKE_ALERT)) {
    if (postMatch) {
      phraseIS.push("samanlagt álag síðustu daga er hátt (eðlilegt eftir leik — Nédélec 2012)");
      phraseEN.push("recent days' combined load is high (expected post-match — Nédélec 2012)");
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
  yesterday: { color: "green" | "yellow" | "red" | null; score: number | null; imputed?: boolean | null } | null,
  provenance?: { todayImputed?: boolean; todayStale?: boolean },
): { kind: "new" | "worse" | "better" | "same"; summaryIS: string; summaryEN: string } | null {
  if (!yesterday) return null;
  const yColor = yesterday.color;
  const yScore = yesterday.score;

  // Freshness / provenance gate — the single most dangerous output on the page
  // is a confident "↓↓ worse" built on an estimate. If today's verdict is
  // imputed or stale, or yesterday's was imputed, we do NOT assert a direction:
  // we still surface a labelled note, but never a hard worse/better trend.
  // (A brand-new "no data yesterday" case is handled below and is fine to show.)
  const notComparable =
    !!provenance?.todayImputed || !!provenance?.todayStale || yesterday.imputed === true;
  if (notComparable && yColor != null) {
    return {
      kind: "same", // "same" renders no directional arrow — never a false ↓↓/↑↑
      summaryIS: provenance?.todayStale
        ? "Ekki nýtt checkin í dag — samanburður við í gær óáreiðanlegur"
        : "Áætlað — samanburður við í gær óáreiðanlegur",
      summaryEN: provenance?.todayStale
        ? "No fresh check-in today — day-over-day comparison not reliable"
        : "Estimated — day-over-day comparison not reliable",
    };
  }

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
    if (scoreDelta != null && Math.abs(scoreDelta) >= DELTA_MEANINGFUL_SCORE) {
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

export function buildAttentionList(
  rows: BriefingRow[],
  playerComposites: Record<string, PlayerCompositeEntry>,
  lang: "IS" | "EN",
  playerBaselines: Record<string, Record<string, AthleteMetricBaseline>> | null,
  playerCounterfactuals: DailyBriefingCardProps["playerCounterfactuals"] | null,
  recentDayTypes: Record<string, string | null> | null | undefined,
  todayIso: string,
  playerInjuries: DailyBriefingCardProps["playerInjuries"] | null,
  playerDeltas: DailyBriefingCardProps["playerDeltas"] | null,
  /** Per-player robustness (injury early-warning #5) level. A "watch" or "elevated" level promotes an
   *  otherwise-OK (green) player into the list as a MONITOR — a green readiness colour can still hide
   *  rising injury risk. Advisory only: never a hard ALERT, never touches the readiness colour. The CALLER
   *  decides what belongs here (it confidence-gates watch to high/moderate); the engine promotes what it's
   *  given. "steady" (or an absent entry) never promotes. */
  playerRobustness?: Record<string, "steady" | "watch" | "elevated"> | null,
): AttentionItem[] {
  const r = COPY[lang].reasons;
  const cl = COPY[lang].compact;
  const inj = COPY[lang].injury;
  const out: AttentionItem[] = [];

  // Determinism — a duplicated row today must not list a player twice. Keep the
  // first occurrence (rows arrive sorted by the dashboard).
  const seenPlayers = new Set<string>();
  const deduped = rows.filter((row) => {
    const pid = String(row.player_id);
    if (seenPlayers.has(pid)) return false;
    seenPlayers.add(pid);
    return true;
  });

  for (const row of deduped) {
    const pid = String(row.player_id);
    const reasons: string[] = [];
    let level: AttentionLevel = "ok";
    let matchContextUnknown = false;

    // Provenance of today's verdict — an estimate (no check-in) or a stale
    // (older-than-today) row must never read as a measured hard alert, and its
    // day-over-day delta must not be a confident "worse/better".
    const estimated = isEstimatedVerdict(row);
    const stale = !!row.entry_date && row.entry_date !== todayIso;

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
    // Can we tell whether a load spike is an expected post-match echo? Only with
    // match context: a resolved MD-day token, a recent match in the day-type
    // history, or an explicit post-match day. With none of these, a spike is
    // ANNOTATED "context unknown" and softened — never silently hard-alerted.
    const mdKnown = /^MD([+-]\d+)?$/i.test(String(row.md_day ?? "").trim());
    let recentKnown = false;
    if (recentDayTypes) {
      for (let dayBack = 1; dayBack <= 3; dayBack++) {
        const d = new Date(todayIso);
        d.setUTCDate(d.getUTCDate() - dayBack);
        const iso = d.toISOString().slice(0, 10);
        if (String(recentDayTypes[iso] ?? "").trim() !== "") { recentKnown = true; break; }
      }
    }
    const contextUnknown = !postMatch && !mdKnown && !recentKnown;

    const col = row.final_color ?? null;
    if (col === "red") {
      reasons.push(r.redReadiness);
      level = "alert";
    } else if (col === "yellow") {
      reasons.push(r.yellowReadiness);
      if (level === "ok") level = "monitor";
    } else if (typeof row.total_score === "number" && row.total_score <= READINESS_LOW_SCORE) {
      // Real number only — a MISSING score is no-data, never a passing score.
      // (Kills the old `?? 99` sentinel that hid absence as "fine".)
      reasons.push(r.lowScore(row.total_score));
      if (level === "ok") level = "monitor";
    }

    const comp = playerComposites[String(row.player_id)];
    if (comp) {
      if (comp.concernLevel === "high") {
        // Post-match OR unknown-context: don't escalate composite-high to
        // alert; it's an expected echo (post-match) or unverifiable (no plan
        // context). Either way soften to monitor and annotate.
        const soften = postMatch || contextUnknown;
        reasons.push(
          postMatch ? r.compositeHighPostMatch
          : contextUnknown ? r.compositeHighContextUnknown
          : r.compositeHigh,
        );
        if (soften) {
          if (level === "ok") level = "monitor";
          if (contextUnknown) matchContextUnknown = true;
        } else {
          level = "alert";
        }
      } else if (comp.concernLevel === "moderate") {
        reasons.push(r.compositeMod);
        if (level === "ok") level = "monitor";
      }
      if (comp.playerLoadSpike != null && comp.playerLoadSpike >= PL_SPIKE_ALERT) {
        // Post-match / unknown-context PL spike → annotate + downgrade to monitor.
        const soften = postMatch || contextUnknown;
        reasons.push(
          postMatch ? r.plSpikePostMatch(comp.playerLoadSpike)
          : contextUnknown ? r.plSpikeContextUnknown(comp.playerLoadSpike)
          : r.plSpike(comp.playerLoadSpike),
        );
        if (soften) {
          if (level === "ok") level = "monitor";
          if (contextUnknown) matchContextUnknown = true;
        } else {
          level = "alert";
        }
      } else if (comp.playerLoadSpike != null && comp.playerLoadSpike >= PL_SPIKE_MONITOR && level === "ok") {
        reasons.push(
          postMatch ? r.plSpikePostMatch(comp.playerLoadSpike)
          : contextUnknown ? r.plSpikeContextUnknown(comp.playerLoadSpike)
          : r.plSpike(comp.playerLoadSpike),
        );
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

    // ── Injury early-warning promotion (Robustness watch #5). A watch/elevated robustness level pulls an
    // otherwise-OK (green, unflagged) player into the list as a MONITOR — the whole point of the
    // early-warning is that a green readiness colour can still hide rising injury risk (verified on real
    // Breiðablik data: elevated is rare, but green + watch is common). Only when the row is otherwise OK
    // (we don't restate it on an already-flagged player), and never above monitor: an advisory watch, not
    // a hard readiness alert. Confidence gating is the caller's job (watch is passed only at high/moderate).
    const rLvl = playerRobustness?.[pid];
    if ((rLvl === "elevated" || rLvl === "watch") && level === "ok" && !injury) {
      reasons.push(rLvl === "elevated" ? r.robustnessElevated : r.robustnessWatch);
      level = "monitor";
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
      } else if (postMatch && (comp?.concernLevel === "high" || (comp?.playerLoadSpike != null && comp.playerLoadSpike >= PL_SPIKE_ALERT))) {
        compactStatus = cl.postMatchEcho;
      } else if (comp?.concernLevel === "high") {
        compactStatus = cl.heavyLoad;
      } else if (comp?.playerLoadSpike != null && comp.playerLoadSpike >= PL_SPIKE_ALERT) {
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
        playerDeltas?.[pid] ?? null,
        { todayImputed: estimated, todayStale: stale },
      );
      const confidence = computeAttentionConfidence(
        row,
        comp,
        playerBaselines?.[pid] ?? null,
        todayIso,
        lang,
      );
      // ── Estimate / confidence gating ─────────────────────────────────────
      // An estimated (imputed) verdict must never render an identical hard
      // ALERT to a measured one. Cap a readiness/load-driven alert at monitor —
      // injury alerts rest on real data (player_injuries), so they stay.
      let finalLevel: AttentionLevel = level;
      if (estimated && !injury && finalLevel === "alert") finalLevel = "monitor";
      // Provisional — measured, but the flag rests on low data-confidence or an
      // immature personal baseline. Level is KEPT (a real concern stays
      // visible); the row is tagged so the coach sees it's on thinner ice.
      const immatureBaseline = baselineMaturity != null && baselineMaturity.obs <= MIN_MATURE_OBS;
      const provisional = !injury && !estimated && (confidence.level === "low" || immatureBaseline);
      const itemForExplanation = {
        playerId: pid,
        name: row.full_name,
        level: finalLevel,
        reasons: unique,
        compactStatus,
        score: row.total_score ?? null,
        composite: comp?.compositeScore ?? null,
        plSpike: comp?.playerLoadSpike ?? null,
        fatigueType: comp?.fatigueType ?? null,
        drivers,
        topCounterfactual,
        injury,
        confidence,
        loadBreakdown,
        baselineMaturity,
        delta,
        estimated,
        provisional,
        stale,
        matchContextUnknown,
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

  // Sort: alert before monitor, then by reason count desc, then a STABLE
  // final tiebreak on playerId so ordering can't jitter day-to-day when two
  // players tie on level + reason count (e.g. equal ACWR).
  out.sort((a, b) => {
    if (a.level !== b.level) return a.level === "alert" ? -1 : 1;
    if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
    return a.playerId.localeCompare(b.playerId);
  });

  return out;
}

/**
 * Single source of truth for "who needs attention today". Both the attention
 * panel header count and any other surface that shows a "Needs attention N"
 * badge must derive from THIS selector (never a second, independently-computed
 * count) so the numbers on the same screen can never silently diverge.
 *
 * `items`      — the full flagged list (alert + monitor), already deduped and
 *                deterministically ordered by buildAttentionList.
 * `alertCount` — hard alerts only (level === "alert"). This is the count a
 *                coach reads as "must act today"; estimated/provisional flags
 *                are demoted/monitor and are deliberately NOT in it.
 * `count`      — total flagged (items.length), the panel header number.
 */
export type NeedsAttentionSelection = {
  items: AttentionItem[];
  alertCount: number;
  count: number;
};

export function selectNeedsAttention(
  ...args: Parameters<typeof buildAttentionList>
): NeedsAttentionSelection {
  const items = buildAttentionList(...args);
  const alertCount = items.reduce((n, it) => n + (it.level === "alert" ? 1 : 0), 0);
  return { items, alertCount, count: items.length };
}
