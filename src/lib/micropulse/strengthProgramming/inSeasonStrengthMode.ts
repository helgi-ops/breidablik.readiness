/**
 * In-season strength MODE — microdose vs traditional — pure, side-effect free.
 *
 * Both maintain strength when weekly volume is equated (Cuthbert 2021), so this is an equal,
 * evidence-based CHOICE, not one right way:
 *  - microdose (default): the week's strength volume stays distributed across the MD days.
 *  - traditional: the same weekly volume is concentrated into 1–2 dedicated days (MD-4 + MD-2),
 *    the rest lightened. The WEEKLY TOTAL is preserved either way.
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
 */
export function distributeStrengthVolume(perMd: Record<string, number>, mode: InSeasonStrengthMode): Record<string, number> {
  const keys = Object.keys(perMd ?? {});
  const total = keys.reduce((a, k) => a + (Number(perMd[k]) || 0), 0);
  if (mode === "microdose" || total <= 0 || keys.length === 0) {
    // Distributed as the engine laid it out.
    return { ...perMd };
  }

  // Traditional: concentrate the SAME total onto the dedicated days (fall back to the two
  // highest-volume days when MD-4/MD-2 aren't in the week), zero the rest.
  let targets = TRADITIONAL_DAYS.filter((t) => keys.includes(t.md));
  if (targets.length === 0) {
    const topTwo = [...keys].sort((a, b) => (Number(perMd[b]) || 0) - (Number(perMd[a]) || 0)).slice(0, 2);
    targets = topTwo.map((md, i) => ({ md, share: i === 0 ? 0.6 : 0.4 }));
  }
  // Normalise shares in case only one dedicated day exists in the week.
  const shareSum = targets.reduce((a, t) => a + t.share, 0) || 1;

  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  let assigned = 0;
  targets.forEach((t, i) => {
    const v = i === targets.length - 1 ? total - assigned : Math.round((total * t.share) / shareSum);
    out[t.md] = v;
    assigned += v;
  });
  return out;
}
