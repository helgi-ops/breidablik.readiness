/**
 * playerContext / the walls
 *
 * The north-star keeps the performance ⊥ readiness ⊥ medical boundaries as
 * VIEW-ACCESS RULES on one shared substrate — never by duplicating the data.
 * Today those walls are enforced only by omission + docstring convention (see
 * `playerAnalysis/totalPlayerAnalysis.ts` header, every `unifiedDeficits/*`
 * header); there is no runtime check that would catch a leak. This module gives
 * the view layer a small structural guard to build on as the readiness /
 * performance / medical views land.
 *
 * A "walled" view (performance, and the coach-facing readiness colour) must
 * NEVER project medical/clinical fields (active injury detail, clinical pain,
 * rehab-track specifics). The strength view is NOT walled in that sense — a
 * strength session legitimately reads injury STATUS to deload/skip — so it does
 * not call this guard. Later performance/readiness views WILL.
 */

/** Field-name fragments that must never appear in a walled (performance) view. */
const MEDICAL_FIELD_MARKERS = [
  "clinical",
  "diagnosis",
  "pain",
  "rehabTrack",
  "rehab_track",
  "injuryDetail",
  "medicalNote",
  "clearance",
] as const;

/**
 * Assert a projected view object carries no medical/clinical field. Throws in
 * development so a leak is caught at the seam; in production it is a cheap
 * shallow key scan. Use it inside a walled view's projection, e.g.
 *   return assertNoMedicalLeak(performanceProjection, "performanceView");
 */
export function assertNoMedicalLeak<T extends object>(view: T, viewName: string): T {
  for (const key of Object.keys(view)) {
    const lower = key.toLowerCase();
    if (MEDICAL_FIELD_MARKERS.some((m) => lower.includes(m.toLowerCase()))) {
      throw new Error(`[playerContext] ${viewName} leaked a medical field: "${key}" — walled views must not project the medical domain.`);
    }
  }
  return view;
}
