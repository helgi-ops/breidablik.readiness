/**
 * src/lib/trainer/loadIntelligence.ts
 *
 * Three sport-science computations that differentiate MicroPulse PT from
 * generic workout-calendar apps. All pure functions — no DB, no IO. Callers
 * fetch data once and run all three.
 *
 *   1. computeFosterMonotonyStrain  (Foster 1998)
 *      Detects training overload risk from session-RPE load distribution.
 *      monotony = mean(daily load) / sd(daily load)
 *      strain   = sum(daily load) × monotony
 *      Risk thresholds (Foster 1998 → adapted for PT 7-day windows):
 *        monotony > 1.5  AND  strain > 4000  → "deload recommended"
 *        monotony > 2.0  OR   strain > 6000  → "deload required"
 *
 *   2. computeHeavyLiftingExposure  (Pareja-Blanco 2017)
 *      Counts working sets at ≥80% 1RM in the window. ≥80% is the velocity
 *      loss threshold zone where strength adaptations dominate over
 *      hypertrophy. Weekly cap ≈ 25 sets across all lifts (loose Pareja-
 *      Blanco / Schoenfeld 2017 synthesis). Returns count, cap, and a
 *      0-1 saturation ratio.
 *
 *   3. forecastPR  (linear regression on e1RM over time)
 *      For an exercise with ≥4 logged sessions: fit y = a + b·t (t in days
 *      since first session), project forward to the next round-number target
 *      above the current PR. Returns target_kg, eta_days, weekly_rate_kg.
 *      Empty result when slope is non-positive or sample is too small.
 *
 * Used by /api/client/today (client surface) and clientSummary lib (trainer
 * Summary prompt).
 */

// ── 1. Foster monotony + strain ───────────────────────────────────────────

export type SessionLoad = { date: string; load: number };

export type FosterResult = {
  daily_loads: number[];     // window aligned to dates, gaps imputed as 0
  total_load: number;
  mean_load: number;
  sd_load: number;
  monotony: number | null;   // null when sd is 0 (degenerate / single value)
  strain: number;
  /** "ok" | "watch" | "deload_recommended" | "deload_required" */
  status: "ok" | "watch" | "deload_recommended" | "deload_required";
  /** Why we returned the status — short reason string. */
  reason: string;
};

const FOSTER_MONOTONY_WATCH = 1.3;
const FOSTER_MONOTONY_RECOMMEND = 1.5;
const FOSTER_MONOTONY_REQUIRE = 2.0;
const FOSTER_STRAIN_RECOMMEND = 4000;
const FOSTER_STRAIN_REQUIRE = 6000;

export function computeFosterMonotonyStrain(
  loads: SessionLoad[],
  windowDays: number = 7,
  asOfDate?: string,
): FosterResult {
  // Build a date-indexed, gap-filled window so that rest days correctly
  // pull the sd up (and monotony down). Foster's original method treats
  // missing days as 0 load.
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  const days: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(asOf); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const byDate = new Map<string, number>();
  for (const l of loads) {
    if (!byDate.has(l.date)) byDate.set(l.date, 0);
    byDate.set(l.date, (byDate.get(l.date) ?? 0) + (Number.isFinite(l.load) ? l.load : 0));
  }
  const daily = days.map((d) => byDate.get(d) ?? 0);
  const total = daily.reduce((s, v) => s + v, 0);
  const mean = total / daily.length;
  const variance = daily.reduce((s, v) => s + (v - mean) ** 2, 0) / daily.length;
  const sd = Math.sqrt(variance);
  const monotony = sd > 0 ? Number((mean / sd).toFixed(2)) : null;
  const strain = monotony != null ? Math.round(total * monotony) : Math.round(total);

  let status: FosterResult["status"] = "ok";
  let reason = "Load distributed within safe range.";
  if (monotony != null) {
    if (monotony >= FOSTER_MONOTONY_REQUIRE || strain >= FOSTER_STRAIN_REQUIRE) {
      status = "deload_required";
      reason = `Monotony ${monotony.toFixed(2)} · strain ${strain} — high overload risk.`;
    } else if (monotony >= FOSTER_MONOTONY_RECOMMEND && strain >= FOSTER_STRAIN_RECOMMEND) {
      status = "deload_recommended";
      reason = `Monotony ${monotony.toFixed(2)} · strain ${strain} — variability too low for the load.`;
    } else if (monotony >= FOSTER_MONOTONY_WATCH) {
      status = "watch";
      reason = `Monotony ${monotony.toFixed(2)} edging up — watch for further compression.`;
    }
  }

  return {
    daily_loads: daily,
    total_load: Math.round(total),
    mean_load: Number(mean.toFixed(1)),
    sd_load: Number(sd.toFixed(1)),
    monotony,
    strain,
    status,
    reason,
  };
}

// ── 2. Heavy-lifting exposure (Pareja-Blanco threshold) ───────────────────

export type SetForExposure = {
  date: string;
  weight_kg: number;
  reps: number;
  /** Optional override — if known per exercise (from LV profile). */
  predicted_one_rm_kg?: number | null;
};

export type ExposureResult = {
  /** Sets ≥80% 1RM in the window. */
  heavy_sets: number;
  /** Soft weekly cap from Pareja-Blanco / Schoenfeld synthesis. */
  cap: number;
  /** heavy_sets / cap, clamped 0..1.5 */
  saturation: number;
  /** "low" | "optimal" | "high" | "excessive" */
  status: "low" | "optimal" | "high" | "excessive";
  reason: string;
};

const EXPOSURE_CAP_PER_WEEK = 25;
const EPLEY_1RM = (w: number, r: number) => w * (1 + Math.max(0, r) / 30);

export function computeHeavyLiftingExposure(
  sets: SetForExposure[],
  windowDays: number = 7,
  asOfDate?: string,
): ExposureResult {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  const since = new Date(asOf); since.setDate(since.getDate() - windowDays + 1);
  const sinceIso = since.toISOString().slice(0, 10);

  let heavy = 0;
  for (const s of sets) {
    if (s.date < sinceIso) continue;
    if (!Number.isFinite(s.weight_kg) || !Number.isFinite(s.reps) || s.weight_kg <= 0) continue;
    // If the caller passed a known 1RM use it; otherwise estimate from this
    // set via Epley as a conservative proxy.
    const oneRm = s.predicted_one_rm_kg && s.predicted_one_rm_kg > 0
      ? s.predicted_one_rm_kg
      : EPLEY_1RM(s.weight_kg, s.reps);
    if (oneRm <= 0) continue;
    const pct = s.weight_kg / oneRm;
    if (pct >= 0.80) heavy += 1;
  }
  const cap = EXPOSURE_CAP_PER_WEEK;
  const saturation = Number(Math.min(1.5, heavy / cap).toFixed(2));

  let status: ExposureResult["status"] = "low";
  let reason = `${heavy}/${cap} sets ≥80%1RM — room for more high-intensity work.`;
  if (saturation >= 1.2) {
    status = "excessive";
    reason = `${heavy}/${cap} sets ≥80%1RM — well above weekly cap, fatigue risk.`;
  } else if (saturation >= 1.0) {
    status = "high";
    reason = `${heavy}/${cap} sets ≥80%1RM — at the weekly cap, hold here.`;
  } else if (saturation >= 0.6) {
    status = "optimal";
    reason = `${heavy}/${cap} sets ≥80%1RM — in the productive zone.`;
  }

  return { heavy_sets: heavy, cap, saturation, status, reason };
}

// ── 3. PR forecast (linear regression) ────────────────────────────────────

export type ProgressionPoint = { date: string; e1rm: number };
export type PrForecast = {
  current_pr_kg: number;
  weekly_rate_kg: number;
  /** Round-number target above the current PR (5 kg increments). */
  target_kg: number;
  /** Days until target at the current weekly rate. null when slope is
   *  ≤0 or fewer than 4 sessions. */
  eta_days: number | null;
  eta_weeks: number | null;
  sessions: number;
  reason: string;
};

const ROUND_INCREMENT_KG = 5;

export function forecastPR(points: ProgressionPoint[]): PrForecast | null {
  if (points.length < 4) return null;

  // Sort by date for reproducibility.
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();
  const xs = sorted.map((p) => (new Date(p.date).getTime() - t0) / 86_400_000); // days
  const ys = sorted.map((p) => p.e1rm);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;            // kg per day
  const weeklyRate = Number((slope * 7).toFixed(2));
  const currentPr = Math.max(...ys);
  // Next round-number target above current PR.
  const target = Math.ceil((currentPr + 0.5) / ROUND_INCREMENT_KG) * ROUND_INCREMENT_KG;
  const gap = target - currentPr;

  let etaDays: number | null = null;
  let etaWeeks: number | null = null;
  let reason = "";
  if (slope <= 0) {
    reason = "Trend is flat or regressing — focus on volume / technique before chasing a PR.";
  } else {
    etaDays = Math.ceil(gap / slope);
    etaWeeks = Number((etaDays / 7).toFixed(1));
    reason = `On track to hit ${target} kg in ~${etaWeeks} weeks at +${weeklyRate.toFixed(1)} kg/wk.`;
  }

  return {
    current_pr_kg: Number(currentPr.toFixed(1)),
    weekly_rate_kg: weeklyRate,
    target_kg: target,
    eta_days: etaDays,
    eta_weeks: etaWeeks,
    sessions: n,
    reason,
  };
}
