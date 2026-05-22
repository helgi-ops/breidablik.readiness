/**
 * src/lib/micropulse/physicalAssessment/interpret.ts
 *
 * Physical Assessment Battery — Phase 2 interpretation layer.
 *
 * Turns the raw physical_assessments + physical_assessment_metrics rows into
 * a per-player profile a coach can read:
 *
 *   • change vs the player's PREVIOUS assessment (delta, % change, direction)
 *   • where the player ranks within their own AGE BAND in the squad
 *     (cohort percentile — correct for a youth/academy group where a
 *      16-year-old must not be compared against an 18-year-old)
 *
 * Deliberately metric-agnostic: it iterates over whatever metric_codes are
 * present, reading direction-of-better / unit / display name from the
 * catalog. New metrics in the battery need no change here.
 */

import { getMetricDef, type AssessmentMetricCategory } from "@/lib/integrations/physical-assessment/metricCatalog";

// ── Raw input rows (shape as fetched from Supabase) ──────────────────────────

export type AssessmentRowInput = {
  id: string;
  player_id: string;
  assessment_date: string;
  age_years_at_assessment: number | null;
};

export type AssessmentMetricRowInput = {
  assessment_id: string;
  metric_code: string;
  metric_category: string | null;
  value: number | null;
  unit: string | null;
};

export type PlayerInput = {
  id: string;
  full_name: string | null;
};

// ── Output shape ─────────────────────────────────────────────────────────────

export type MetricDirection = "improving" | "static" | "regressing" | "new";

export type MetricReading = {
  code: string;
  category: AssessmentMetricCategory | "other";
  nameEN: string;
  nameIS: string;
  unit: string;
  higherIsBetter: boolean;
  /** Latest assessment value. */
  value: number;
  /** Value at the player's previous assessment, if any. */
  previousValue: number | null;
  /** Signed change (latest − previous). null when no previous. */
  delta: number | null;
  /** Signed % change vs previous. null when no previous. */
  deltaPct: number | null;
  /** Change read against direction-of-better. */
  direction: MetricDirection;
  /** 0–100 rank within the player's age band. null when cohort too small. */
  percentile: number | null;
  /** Number of players (incl. self) in the age-band cohort for this metric. */
  cohortSize: number;
};

export type PlayerAssessmentProfile = {
  playerId: string;
  name: string;
  latestDate: string | null;
  previousDate: string | null;
  ageAtLatest: number | null;
  metrics: MetricReading[];
  summary: {
    improving: number;
    regressing: number;
    /** Metrics where the player sits in the bottom quartile of their age band. */
    weakLinks: string[];
    /** Metrics where the player sits in the top quartile of their age band. */
    strengths: string[];
  };
};

// ── Tuning constants ─────────────────────────────────────────────────────────

/** A change smaller than this (in %) is treated as "static" — within noise. */
const STATIC_PCT = 2;
/** Half-width of the age band, in years, for cohort comparison. */
const AGE_BAND_HALF_WIDTH = 1.5;
/** Minimum cohort size (incl. self) before a percentile is shown. */
const MIN_COHORT = 4;
/** Percentile cut-points for weak link / strength flags. */
const WEAK_PCTL = 25;
const STRONG_PCTL = 75;

// ── Core ─────────────────────────────────────────────────────────────────────

type LatestSnapshot = {
  playerId: string;
  age: number | null;
  /** metric_code → latest value */
  values: Map<string, number>;
};

/**
 * Build a profile for every player that has at least one assessment.
 *
 * @param assessments  all physical_assessments rows for the squad
 * @param metrics      all physical_assessment_metrics rows for those assessments
 * @param players      roster (for names)
 */
export function buildSquadAssessmentProfiles(
  assessments: AssessmentRowInput[],
  metrics: AssessmentMetricRowInput[],
  players: PlayerInput[],
): PlayerAssessmentProfile[] {
  const nameById = new Map(players.map((p) => [p.id, p.full_name ?? "—"]));

  // metric rows grouped by assessment_id
  const metricsByAssessment = new Map<string, AssessmentMetricRowInput[]>();
  for (const m of metrics) {
    if (m.value == null) continue;
    const list = metricsByAssessment.get(m.assessment_id);
    if (list) list.push(m);
    else metricsByAssessment.set(m.assessment_id, [m]);
  }

  // assessments grouped by player, newest first
  const byPlayer = new Map<string, AssessmentRowInput[]>();
  for (const a of assessments) {
    const list = byPlayer.get(a.player_id);
    if (list) list.push(a);
    else byPlayer.set(a.player_id, [a]);
  }
  for (const list of byPlayer.values()) {
    list.sort((x, y) => (x.assessment_date < y.assessment_date ? 1 : -1));
  }

  // Squad-wide latest snapshot — the basis for cohort percentiles.
  const snapshots: LatestSnapshot[] = [];
  for (const [playerId, list] of byPlayer) {
    const latest = list[0];
    const values = new Map<string, number>();
    for (const m of metricsByAssessment.get(latest.id) ?? []) {
      if (m.value != null) values.set(m.metric_code, Number(m.value));
    }
    snapshots.push({ playerId, age: latest.age_years_at_assessment, values });
  }
  const snapshotById = new Map(snapshots.map((s) => [s.playerId, s]));

  const profiles: PlayerAssessmentProfile[] = [];

  for (const [playerId, list] of byPlayer) {
    const latest = list[0];
    const previous = list[1] ?? null;
    const latestMetrics = metricsByAssessment.get(latest.id) ?? [];
    const previousValues = new Map<string, number>();
    if (previous) {
      for (const m of metricsByAssessment.get(previous.id) ?? []) {
        if (m.value != null) previousValues.set(m.metric_code, Number(m.value));
      }
    }

    const self = snapshotById.get(playerId)!;
    const readings: MetricReading[] = [];

    for (const m of latestMetrics) {
      if (m.value == null) continue;
      const def = getMetricDef(m.metric_code);
      const higherIsBetter = def?.higherIsBetter ?? true;
      const value = Number(m.value);
      const prev = previousValues.get(m.metric_code) ?? null;

      let delta: number | null = null;
      let deltaPct: number | null = null;
      let direction: MetricDirection = "new";
      if (prev != null && prev !== 0) {
        delta = value - prev;
        deltaPct = (delta / Math.abs(prev)) * 100;
        if (Math.abs(deltaPct) < STATIC_PCT) {
          direction = "static";
        } else {
          const improved = higherIsBetter ? delta > 0 : delta < 0;
          direction = improved ? "improving" : "regressing";
        }
      } else if (prev != null && prev === 0) {
        delta = value - prev;
        direction = "static";
      }

      const { percentile, cohortSize } = cohortPercentile(
        self, snapshots, m.metric_code, value, higherIsBetter,
      );

      readings.push({
        code: m.metric_code,
        category: (def?.category ?? (m.metric_category as AssessmentMetricCategory) ?? "other"),
        nameEN: def?.nameEN ?? m.metric_code,
        nameIS: def?.nameIS ?? def?.nameEN ?? m.metric_code,
        unit: def?.unit ?? m.unit ?? "",
        higherIsBetter,
        value,
        previousValue: prev,
        delta,
        deltaPct,
        direction,
        percentile,
        cohortSize,
      });
    }

    // Stable display order: category, then name.
    const catOrder: Record<string, number> = { speed: 0, jump: 1, anthropometric: 2, other: 3 };
    readings.sort((a, b) =>
      (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9) ||
      a.nameEN.localeCompare(b.nameEN));

    const improving = readings.filter((r) => r.direction === "improving").length;
    const regressing = readings.filter((r) => r.direction === "regressing").length;
    const weakLinks = readings
      .filter((r) => r.percentile != null && r.percentile < WEAK_PCTL)
      .map((r) => r.nameEN);
    const strengths = readings
      .filter((r) => r.percentile != null && r.percentile >= STRONG_PCTL)
      .map((r) => r.nameEN);

    profiles.push({
      playerId,
      name: nameById.get(playerId) ?? "—",
      latestDate: latest.assessment_date,
      previousDate: previous?.assessment_date ?? null,
      ageAtLatest: latest.age_years_at_assessment,
      metrics: readings,
      summary: { improving, regressing, weakLinks, strengths },
    });
  }

  profiles.sort((a, b) => a.name.localeCompare(b.name));
  return profiles;
}

/**
 * Percentile rank of a player's value within their age-band cohort.
 * Respects direction-of-better: a faster sprint time yields a higher
 * percentile even though the raw number is lower.
 */
function cohortPercentile(
  self: LatestSnapshot,
  snapshots: LatestSnapshot[],
  metricCode: string,
  value: number,
  higherIsBetter: boolean,
): { percentile: number | null; cohortSize: number } {
  if (self.age == null) return { percentile: null, cohortSize: 0 };

  // Cohort = players inside the age band who have this metric.
  const cohort: number[] = [];
  for (const s of snapshots) {
    if (s.age == null) continue;
    if (Math.abs(s.age - self.age) > AGE_BAND_HALF_WIDTH) continue;
    const v = s.values.get(metricCode);
    if (v != null) cohort.push(v);
  }
  const cohortSize = cohort.length;
  if (cohortSize < MIN_COHORT) return { percentile: null, cohortSize };

  // Of the OTHERS, how many does this player beat?
  let better = 0;
  let equal = 0;
  let others = 0;
  let selfSeen = false;
  for (const v of cohort) {
    if (!selfSeen && v === value) { selfSeen = true; continue; } // skip one self
    others += 1;
    if (v === value) equal += 1;
    else {
      const playerBeatsThis = higherIsBetter ? value > v : value < v;
      if (playerBeatsThis) better += 1;
    }
  }
  if (others === 0) return { percentile: null, cohortSize };
  const pct = Math.round(((better + 0.5 * equal) / others) * 100);
  return { percentile: Math.min(100, Math.max(0, pct)), cohortSize };
}
