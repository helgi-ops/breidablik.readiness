/**
 * CMJ trial averaging — the mean of a test's valid trials, not the best trial.
 *
 * Claudino et al. 2017 (J Sci Med Sport, meta-analysis of 151 studies): the
 * MEAN of the trials is more fatigue-sensitive than the best trial — the odds of
 * catching a true change are ~10:1 in favour of averaging, because the mean
 * shrinks trial-to-trial measurement error. Rows in `vald_forcedecks_results`
 * are stored one per jump (typically 3 per CMJ test, keyed by raw_test_id +
 * trial_number), so today a "best trial" read throws away that noise reduction.
 *
 * This module collapses per-trial rows into one aggregate per TEST: the mean of
 * each metric across that test's valid trials, with the trial count carried
 * through so confidence can reflect it. Pure and side-effect free.
 * [10.1016/j.jsams.2016.08.011]
 */

export type TrialMetricRow = {
  /** Groups trials belonging to the same test/session. */
  rawTestId: string | null;
  /** ISO timestamp of the trial (used for ordering + a fallback group key). */
  testTimestamp: string;
  /** Metric name → value for this single trial (null when the trial lacks it). */
  metrics: Record<string, number | null>;
};

export type TestAggregate = {
  rawTestId: string | null;
  /** The most recent trial timestamp within the group. */
  testTimestamp: string;
  /** Number of trials in the test (whether or not each metric was present). */
  trialCount: number;
  /** Metric name → mean across the trials that carried a finite value (null if none did). */
  metrics: Record<string, number | null>;
};

function isFinite(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Collapse per-trial rows into one aggregate per test.
 *
 * Grouping key is `raw_test_id`; when it is null (legacy rows) the trial's
 * calendar day is used so same-day trials still average together rather than
 * each counting as its own "test". Per metric, the aggregate is the mean of the
 * trials that carried a finite value — a trial missing one metric still
 * contributes to the metrics it does have. Results are sorted newest test first.
 */
export function aggregateTrialsByTest(
  rows: TrialMetricRow[],
  metricKeys: string[],
): TestAggregate[] {
  const groups = new Map<string, TrialMetricRow[]>();
  for (const row of rows) {
    const key = row.rawTestId ?? `day:${(row.testTimestamp ?? "").slice(0, 10)}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const aggregates: TestAggregate[] = [];
  for (const [, trials] of groups) {
    const metrics: Record<string, number | null> = {};
    for (const metric of metricKeys) {
      const vals = trials.map((t) => t.metrics[metric]).filter(isFinite);
      metrics[metric] = mean(vals);
    }
    const timestamps = trials.map((t) => t.testTimestamp).filter((t) => !!t).sort();
    aggregates.push({
      rawTestId: trials[0]?.rawTestId ?? null,
      testTimestamp: timestamps[timestamps.length - 1] ?? trials[0]?.testTimestamp ?? "",
      trialCount: trials.length,
      metrics,
    });
  }

  aggregates.sort((a, b) => (a.testTimestamp < b.testTimestamp ? 1 : a.testTimestamp > b.testTimestamp ? -1 : 0));
  return aggregates;
}

/** Convenience: the per-test mean series for one metric, newest test first, nulls dropped. */
export function metricSeries(aggregates: TestAggregate[], metric: string): number[] {
  return aggregates.map((a) => a.metrics[metric]).filter(isFinite);
}
