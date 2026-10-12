/**
 * In-season strength MODE — microdose vs traditional — pure, side-effect free.
 *
 * Both maintain strength when weekly volume is equated (Cuthbert 2021), so this is an equal,
 * evidence-based CHOICE, not one right way:
 *  - microdose (default): the week's strength volume stays distributed across the MD days.
 *  - traditional: the same weekly volume is concentrated onto 1–4 chosen lift days (the coach's
 *    per-MD Off/lift picks; default MD-4 + MD-2), the rest Off. The WEEKLY TOTAL is preserved either way.
 *
 * Advisory; the engine still produces the per-MD sessions — this only redistributes their strength
 * volume. Never the readiness colour or the daily decision.
 *
 * Cite: Cuthbert et al. 2021 (frequency/volume distribution); Rønnestad 2011.
 */

export type InSeasonStrengthMode = "microdose" | "traditional";

/** The dedicated days a traditional week concentrates onto, and their share of the weekly volume. */
const TRADITIONAL_DAYS: Array<{ md: string; share: number }> = [
  { md: "MD-4", share: 0.6 },
  { md: "MD-2", share: 0.4 },
];

/**
 * Redistribute per-MD strength volume for the chosen mode, preserving the weekly total.
 * `perMd` maps an MD tag ("MD-4", "MD-3", …) → strength volume units for that day.
 *
 * `liftDays` (traditional only) are the coach's chosen lift days — 1 to 4 of them, from the
 * per-MD Off/lift picks. When given, the weekly total concentrates onto exactly those days,
 * weighted by each day's own taper weight (so MD-4 still carries more than MD-2), and every
 * other day is zeroed. Without it, traditional falls back to the default dedicated days
 * (MD-4 + MD-2), then to the two highest-volume days.
 */
export function distributeStrengthVolume(
  perMd: Record<string, number>,
  mode: InSeasonStrengthMode,
  liftDays?: string[],
): Record<string, number> {
  const keys = Object.keys(perMd ?? {});
  const total = keys.reduce((a, k) => a + (Number(perMd[k]) || 0), 0);
  if (mode === "microdose" || total <= 0 || keys.length === 0) {
    // Distributed as the engine laid it out.
    return { ...perMd };
  }

  // Traditional: concentrate the SAME weekly total onto the chosen lift days.
  //   1) the coach's explicit lift days (1–4), when provided;
  //   2) else the default dedicated days (MD-4 + MD-2);
  //   3) else the two highest-volume days in the week.
  let targetKeys = (liftDays ?? []).filter((d) => keys.includes(d)).slice(0, 4);
  if (targetKeys.length === 0) targetKeys = TRADITIONAL_DAYS.map((t) => t.md).filter((d) => keys.includes(d));
  if (targetKeys.length === 0) {
    targetKeys = [...keys].sort((a, b) => (Number(perMd[b]) || 0) - (Number(perMd[a]) || 0)).slice(0, Math.min(2, keys.length));
  }
  // Weight each target by its own volume (preserve the taper emphasis). A single lift day
  // simply carries the whole total.
  const weightSum = targetKeys.reduce((a, d) => a + (Number(perMd[d]) || 0), 0) || targetKeys.length || 1;
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  let assigned = 0;
  targetKeys.forEach((d, i) => {
    const w = Number(perMd[d]) || 1;
    const v = i === targetKeys.length - 1 ? total - assigned : Math.round((total * w) / weightSum);
    out[d] = v;
    assigned += v;
  });
  return out;
}
