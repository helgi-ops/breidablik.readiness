/**
 * trainingNeeds — the ONE place a player's PLAN-steering "training needs" are assembled from the
 * analysis reads, so every planning surface maps the same signals the same way.
 *
 * Two raw signals become steer inputs here:
 *   - Train-like-you-Play per-metric EXPOSURE flags (training vs his own matches) → axis exposures.
 *   - train-vs-play-shape under-trained DIRECTIONS (IMA clock) → fwd/back/lat shape dirs.
 *
 * Pure mapping, no IO (the callers own the fetches). This is the bounded, low-risk slice of the
 * analysis→plan consolidation: the metric→axis and direction→family maps already live in
 * buildUpSteer; this module is the shared assembler the Periodization Hub uses and any future
 * planning surface (Session Builder, a player-needs endpoint) can reuse without recomputing.
 * See docs analysis→plan loop. The full buildPlayerContext IO-consolidation stays deferred.
 */

import { TLYP_METRIC_AXIS, DIR_FAMILY, type ExposureInput, type ShapeDirInput } from "@/lib/micropulse/periodization/buildUpSteer";

export type TlypMetricCell = { flag?: string | null; pct?: number | null };
export type TrainingNeeds = { exposures: ExposureInput[]; shapeDirs: ShapeDirInput[] };

/** Map a player's Train-like-you-Play per-metric cells → axis exposures (under / gap only; metrics
 *  with no axis — e.g. pl_per_min, a rate — are skipped). */
export function exposuresFromTlyp(tlypMetrics: Record<string, TlypMetricCell> | null | undefined): ExposureInput[] {
  const out: ExposureInput[] = [];
  for (const [key, cell] of Object.entries(tlypMetrics ?? {})) {
    const ax = TLYP_METRIC_AXIS[key];
    if (!ax || (cell?.flag !== "under" && cell?.flag !== "gap")) continue;
    out.push({ key, axis: ax.axis, label: ax.label, flag: cell.flag as "under" | "gap", pct: cell.pct ?? null });
  }
  return out;
}

/** Map train-vs-play-shape under-trained directions → shape dirs (only the 12 clock directions the
 *  family map knows; delta carried through as the under-training magnitude). */
export function shapeDirsFromShape(underTrained: Array<{ dir: string; delta: number }> | null | undefined): ShapeDirInput[] {
  return (underTrained ?? [])
    .filter((u) => u && DIR_FAMILY[u.dir] != null && typeof u.delta === "number")
    .map((u) => ({ dir: u.dir, delta: u.delta }));
}

/** Assemble both needs at once. */
export function assembleTrainingNeeds(
  tlypMetrics: Record<string, TlypMetricCell> | null | undefined,
  shapeUnderTrained: Array<{ dir: string; delta: number }> | null | undefined,
): TrainingNeeds {
  return { exposures: exposuresFromTlyp(tlypMetrics), shapeDirs: shapeDirsFromShape(shapeUnderTrained) };
}
