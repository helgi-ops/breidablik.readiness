/**
 * Strength / periodization consumer — the second reader of the reconciled ledger.
 * Pulls the deficits that feed STRENGTH (strength-capacity / speed-power /
 * asymmetry) and turns them into strength emphases + VBT force-velocity targeting,
 * each traceable to its driving deficit(s), source and confidence — for the
 * per-player periodization block. Pure — no DB.
 *
 * Descriptive/advisory — never the readiness colour; rules recommend, the coach
 * decides; a low-confidence deficit is a hint, not a hard target. Grows as the
 * VBT / VALD strength-capacity writers land (hamstring capacity, F-V gap, …).
 */
import type { Bi, EvidenceGrade, StrengthEmphasis } from "../movementScreen/registry";
import type { QualityKey } from "./quality";
import type { ReconciledDeficit, ConfidenceTier } from "./reconcile";

export type StrengthTarget = {
  emphasis: StrengthEmphasis;
  label: Bi;
  /** How to apply it in the periodization block. */
  howTo: Bi;
  /** VBT force-velocity targeting hint (where on the curve). */
  vbtNote: Bi;
  drivers: Array<{ quality: QualityKey; label: Bi; source: string; status: string; confidence: number }>;
  confidenceTier: ConfidenceTier;
  evidenceGrade?: EvidenceGrade;
};

type Spec = { emphasis: StrengthEmphasis; label: Bi; howTo: Bi; vbtNote: Bi };

/** Strength-feeding quality → strength emphasis + how-to + VBT targeting. */
const QUALITY_STRENGTH: Partial<Record<QualityKey, Spec>> = {
  reactive_strength: {
    emphasis: "plyometric",
    label: { en: "Plyometric / reactive-strength emphasis", is: "Plyometric / viðbragðsstyrks áhersla" },
    howTo: { en: "SSC progression (pogos → hops → bounds) on the power day (MD-3); build RSI, quality over volume.", is: "SSC stigmögnun (pogos → hopp → bounds) á kraft-degi (MD-3); byggja RSI, gæði fram yfir magn." },
    vbtNote: { en: "Velocity end of the force-velocity curve — light, maximal-intent, fast (power/speed-strength zone).", is: "Hraða-endi kraft-hraða ferilsins — létt, hámarks-ásetningur, hratt (kraft/hraða-styrks svæði)." },
  },
  limb_asymmetry: {
    emphasis: "unilateral",
    label: { en: "Unilateral loading (weaker side)", is: "Einhliða álag (veikari hlið)" },
    howTo: { en: "Bias single-leg work to the weaker side (split squat, SL-RDL, step-up); re-test LSI, aim ≥ 90%.", is: "Beindu einfættri vinnu á veikari hlið (klofbeygja, SL-RDL, uppstig); endurmældu LSI, markmið ≥ 90%." },
    vbtNote: { en: "Match velocity between limbs — VBT surfaces the lagging side's output at the same load.", is: "Jafnaðu hraða milli útlima — VBT sýnir minni afköst veikari hliðar við sama álag." },
  },
  decel_mechanics: {
    emphasis: "eccentric",
    label: { en: "Eccentric / deceleration emphasis", is: "Eccentric / hemlunar áhersla" },
    howTo: { en: "Eccentric overload + deceleration mechanics (tempo/flywheel, plant-and-brake drills); build braking capacity.", is: "Eccentric yfirálag + hemlunar-tækni (tempo/flywheel, plöntun-og-bremsa); byggja bremsu-getu." },
    vbtNote: { en: "Control the eccentric; force/strength end of the curve for braking capacity.", is: "Stýrðu eccentric; kraft/styrks-endi ferilsins fyrir bremsu-getu." },
  },
};

/** Build the strength plan from the reconciled ledger (strength-feeding, non-
 *  medical, non-dismissed deficits), grouped by emphasis. */
export function buildStrengthPlan(reconciled: ReconciledDeficit[]): StrengthTarget[] {
  const byEmphasis = new Map<StrengthEmphasis, StrengthTarget>();
  for (const d of reconciled) {
    if (d.medicalReferral || d.overridden === "dismiss" || !d.feeds.includes("strength")) continue;
    const spec = QUALITY_STRENGTH[d.quality];
    if (!spec) continue;
    let t = byEmphasis.get(spec.emphasis);
    if (!t) { t = { emphasis: spec.emphasis, label: spec.label, howTo: spec.howTo, vbtNote: spec.vbtNote, drivers: [], confidenceTier: "hint", evidenceGrade: d.evidenceGrade }; byEmphasis.set(spec.emphasis, t); }
    for (const s of d.sources) t.drivers.push({ quality: d.quality, label: d.label, source: s.source, status: s.status, confidence: s.confidence });
    // The target's tier = the strongest contributing deficit.
    if (d.confidenceTier === "high" || (d.confidenceTier === "moderate" && t.confidenceTier === "hint")) t.confidenceTier = d.confidenceTier;
    if (d.evidenceGrade && !t.evidenceGrade) t.evidenceGrade = d.evidenceGrade;
  }
  // Higher-confidence emphases first.
  const rank: Record<ConfidenceTier, number> = { high: 2, moderate: 1, hint: 0 };
  return [...byEmphasis.values()].sort((a, b) => rank[b.confidenceTier] - rank[a.confidenceTier]);
}
