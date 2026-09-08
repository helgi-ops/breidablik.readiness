/**
 * Deficit ledger — the reconciler. Recorded observations from a movement-screening
 * assessment are aggregated by their canonical deficit (across tests), so a finding
 * seen on several tests (e.g. valgus on OHSA + single-leg squat + drop jump) becomes
 * ONE higher-confidence deficit rather than three separate weak flags — with the
 * confirmation tests still outstanding listed. Domain-tagged across the 8 domains.
 *
 * A deficit is a HYPOTHESIS to confirm, never a diagnosis; confidence reflects how
 * many tests corroborate it (+ pose measurement), never injury prediction. Pure —
 * no DB, no readiness colour.
 */
import {
  operationalFor, DEFICIT_LABEL, type DeficitKey, type ResultDomain, type Observation,
} from "./testCatalogue";
import type { Bi } from "./registry";

/** One recorded deviation from the form. */
export type FiredObservation = { testSlug: string; observationKey: string; side?: "L" | "R" | "both" };

export type LedgerDeficit = {
  deficitKey: DeficitKey;
  label: Bi;
  domains: ResultDomain[];
  /** Distinct tests that fired this deficit (the corroboration). */
  supportingTests: string[];
  /** provisional = one test; corroborated = ≥2 tests agree (or pose-measured). */
  confidence: "provisional" | "corroborated";
  poseSupported: boolean;
  sides: Array<"L" | "R" | "both">;
  /** Confirmation tests this deficit points to that have NOT been recorded yet. */
  outstandingConfirmations: string[];
};

function findObservation(testSlug: string, key: string): Observation | null {
  return operationalFor(testSlug)?.observations.find((x) => x.key === key) ?? null;
}

/**
 * Build the ledger from the fired observations + the set of tests actually
 * recorded (to know which confirmation tests are still outstanding).
 */
export function buildDeficitLedger(fired: FiredObservation[], recordedTestSlugs: string[]): LedgerDeficit[] {
  const recorded = new Set(recordedTestSlugs);
  const byDeficit = new Map<DeficitKey, {
    tests: Set<string>; domains: Set<ResultDomain>; pose: boolean;
    sides: Set<"L" | "R" | "both">; confirmations: Set<string>;
  }>();

  for (const f of fired) {
    const ob = findObservation(f.testSlug, f.observationKey);
    if (!ob) continue;
    let acc = byDeficit.get(ob.deficitKey);
    if (!acc) { acc = { tests: new Set(), domains: new Set(), pose: false, sides: new Set(), confirmations: new Set() }; byDeficit.set(ob.deficitKey, acc); }
    acc.tests.add(f.testSlug);
    for (const d of ob.domains) acc.domains.add(d);
    if (ob.poseMeasurable) acc.pose = true;
    if (f.side) acc.sides.add(f.side);
    for (const c of ob.confirmationTests) if (!recorded.has(c)) acc.confirmations.add(c);
  }

  const out: LedgerDeficit[] = [];
  for (const [deficitKey, acc] of byDeficit) {
    const supportingTests = [...acc.tests];
    out.push({
      deficitKey,
      label: DEFICIT_LABEL[deficitKey],
      domains: [...acc.domains],
      supportingTests,
      confidence: supportingTests.length >= 2 || acc.pose ? "corroborated" : "provisional",
      poseSupported: acc.pose,
      sides: [...acc.sides],
      outstandingConfirmations: [...acc.confirmations],
    });
  }
  // Most-corroborated first (the strong, cross-test targets lead).
  out.sort((a, b) => b.supportingTests.length - a.supportingTests.length);
  return out;
}
