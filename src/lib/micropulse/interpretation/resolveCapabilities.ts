/**
 * Capability resolver — detect which interpretation DIMENSIONS a club can support
 * from the SIGNALS it actually has (docs/interpretation-architecture.md, step 2).
 *
 * Never reads a `tier` column. Coverage is computed from the data over a window;
 * a metric is "available" at >= 50% coverage (non-null & non-zero). Each dimension
 * resolves to the best-preference available metric, or null (omitted, not faked).
 * This same coverage feeds the confidence chip.
 *
 * Pure core (`computeCoverage`, `resolveFromCoverage`) is DB-free and unit-tested;
 * `resolveCapabilities` wraps it with the team/window fetch.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DIMENSIONS, REGISTRY_KEYS, metricsForDimension, type Dimension } from "./registry";

export const AVAILABILITY_THRESHOLD = 0.5;

export type CapabilityResult = {
  /** Metric keys with coverage >= threshold over the window. */
  available: Set<string>;
  /** Best available metric column per dimension (null = omitted). */
  dimensions: Record<Dimension, string | null>;
  /** Coverage (0..1) of the chosen metric per dimension (0 when none). */
  coverageByDimension: Record<Dimension, number>;
  /** How many of the interpretation dimensions resolved — feeds confidence (n/total). */
  dimensionsCovered: number;
};

/**
 * Coverage per metric key over a set of rows = fraction non-null AND non-zero.
 * (Zero is treated as "not captured" — a 0 decel-effort day carries no signal and
 * would otherwise inflate coverage for clubs that simply don't export the column.)
 */
export function computeCoverage(rows: Array<Record<string, unknown>>, keys: string[] = REGISTRY_KEYS): Record<string, number> {
  const n = rows.length;
  const out: Record<string, number> = {};
  for (const key of keys) {
    if (n === 0) { out[key] = 0; continue; }
    let present = 0;
    for (const r of rows) {
      const v = r[key];
      if (v != null && Number(v) !== 0 && Number.isFinite(Number(v))) present += 1;
    }
    out[key] = present / n;
  }
  return out;
}

/**
 * Pure resolution: coverage map → available set + best metric per dimension.
 * The heart of the architecture; everything testable lives here.
 */
export function resolveFromCoverage(
  coverage: Record<string, number>,
  threshold: number = AVAILABILITY_THRESHOLD,
): CapabilityResult {
  const available = new Set<string>(
    Object.entries(coverage).filter(([, c]) => c >= threshold).map(([k]) => k),
  );

  const dimensions = {} as Record<Dimension, string | null>;
  const coverageByDimension = {} as Record<Dimension, number>;

  for (const dim of DIMENSIONS) {
    const chosen = metricsForDimension(dim).find((m) => available.has(m.key)) ?? null;
    dimensions[dim] = chosen?.key ?? null;
    coverageByDimension[dim] = chosen ? (coverage[chosen.key] ?? 0) : 0;
  }

  const dimensionsCovered = DIMENSIONS.filter((d) => dimensions[d] != null).length;
  return { available, dimensions, coverageByDimension, dimensionsCovered };
}

export type CapabilityWindow = { from: string; to: string };

/**
 * Team/window resolution: fetch the registry columns for the team over the window,
 * compute coverage, resolve. Detected from data, never from a tier column. Caller
 * may cache per (team, day) since coverage is stable within a day.
 */
export async function resolveCapabilities(
  supabase: SupabaseClient,
  teamId: string,
  window: CapabilityWindow,
): Promise<CapabilityResult & { rowsObserved: number }> {
  const { data, error } = await supabase
    .from("player_external_load_daily")
    .select(["date", ...REGISTRY_KEYS].join(", "))
    .eq("source", "catapult")
    .eq("team_id", teamId)
    .gte("date", window.from)
    .lte("date", window.to)
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const coverage = computeCoverage(rows, REGISTRY_KEYS);
  return { ...resolveFromCoverage(coverage), rowsObserved: rows.length };
}
