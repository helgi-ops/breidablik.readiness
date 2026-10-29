/**
 * ABSOLUTE hip-adductor strength read (ForceFrame groin) — the risk-relevant signal.
 *
 * Research (Buchheit, Heiderscheit & Kotsifaki — Aspetar; King 2018): ABSOLUTE hip-adductor
 * weakness is the key modifiable risk factor for time-loss groin injury, while the
 * adductor:abductor ratio and symmetry-only reads show no significant association. So this leads
 * with absolute adductor strength (per-limb N + the summed/mean), and demotes asymmetry to a
 * secondary read. A player can be perfectly SYMMETRIC and still be absolutely weak (both sides
 * low) — the exact case an asymmetry-only view misses.
 *
 * There are no established ForceFrame population norms for absolute adduction (protocol / joint-
 * angle dependent — same reason the ankle plantar-flexion read grades symmetry, not magnitude).
 * So we never fabricate a "low vs the squad" band: the verdict is PERSONAL-NORM — a meaningful
 * drop vs the player's OWN prior baseline (which also catches "both sides low but symmetric"),
 * plus their own uninvolved side (the asymmetry). Descriptive, cited — never the readiness colour,
 * never an injury-prediction claim (the authors state it is "a rationale, not proof").
 *
 * See docs/research/buchheit-what-gets-measured-groin.md.
 */

import type { Bi } from "./benchmarks";
import type { RtpLimbStrengthTest, RtpLimbStrengthEntry } from "@/lib/micropulse/rtp/types";

/** On-surface citation for the absolute-adductor read (mirrors how other signals carry a paper). */
export const GROIN_STRENGTH_CITATION = "Buchheit/Heiderscheit/Kotsifaki 2024 (Aspetar) · King 2018";

/** Pragmatic "meaningful drop" threshold for isometric adductor strength vs the player's own
 *  baseline. The paper gives the rationale (absolute weakness is the risk factor), not a number,
 *  so this is a conservative change flag, not a validated cut-off. */
export const GROIN_STRENGTH_DROP_PCT = 10;

export type GroinStrengthTrend = {
  /** The player's own prior baseline (mean of earlier tests), N per limb. */
  baselineMeanN: number;
  /** % change of the latest mean vs that baseline (negative = weaker). */
  deltaPct: number;
  /** True when the latest mean dropped at least GROIN_STRENGTH_DROP_PCT below baseline. */
  dropped: boolean;
};

export type GroinStrengthRead = {
  present: boolean;
  testDate: string | null;
  /** Absolute per-limb peak adductor force (N) and their sum / mean — the primary numbers. */
  leftN: number | null;
  rightN: number | null;
  sumN: number | null;
  meanN: number | null;
  /** Secondary (demoted): the player's own uninvolved-side comparison. */
  asymmetryPct: number | null;
  asymmetrySide: string | null;
  /** Personal-norm trend vs the player's own history (null when there's no prior test). */
  trend: GroinStrengthTrend | null;
  /** Layered read: one-line verdict, then plain supporting facts (both bilingual). */
  verdict: Bi;
  facts: Bi[];
};

/** The ForceFrame adduction ("Squeeze") limb test — labelled "… (groin)" by buildRtpAssessment. */
export function findGroinAdductorTest(limbStrength: RtpLimbStrengthTest[] | null | undefined): RtpLimbStrengthTest | null {
  if (!limbStrength?.length) return null;
  return limbStrength.find((l) => l.device === "forceframe" && /groin/i.test(l.label)) ?? null;
}

const meanOf = (e: RtpLimbStrengthEntry): number | null =>
  e.leftN != null && e.rightN != null ? (e.leftN + e.rightN) / 2 : null;

const EMPTY: GroinStrengthRead = {
  present: false, testDate: null, leftN: null, rightN: null, sumN: null, meanN: null,
  asymmetryPct: null, asymmetrySide: null, trend: null,
  verdict: { en: "No groin force data for this player yet.", is: "Engin náragögn fyrir þennan leikmann enn." },
  facts: [],
};

/** Build the absolute-adductor read from the groin ForceFrame limb test (pure, descriptive). */
export function buildGroinStrength(groin: RtpLimbStrengthTest | null | undefined): GroinStrengthRead {
  if (!groin || groin.leftN == null || groin.rightN == null) return EMPTY;

  const leftN = Math.round(groin.leftN);
  const rightN = Math.round(groin.rightN);
  const sumN = leftN + rightN;
  const meanN = Math.round(sumN / 2);

  // Personal-norm trend: the latest mean vs the mean of all EARLIER tests (their own baseline).
  // History is newest-first and includes the latest, so drop index 0.
  const priorMeans = (groin.history ?? []).slice(1).map(meanOf).filter((m): m is number => m != null && m > 0);
  let trend: GroinStrengthTrend | null = null;
  if (priorMeans.length > 0) {
    const baselineMeanN = Math.round(priorMeans.reduce((a, b) => a + b, 0) / priorMeans.length);
    const deltaPct = baselineMeanN > 0 ? Number((((meanN - baselineMeanN) / baselineMeanN) * 100).toFixed(1)) : 0;
    trend = { baselineMeanN, deltaPct, dropped: deltaPct <= -GROIN_STRENGTH_DROP_PCT };
  }

  const asymmetryPct = groin.asymmetryPct ?? null;
  const asymmetrySide = groin.asymmetrySide ?? null;

  const verdict: Bi = trend?.dropped
    ? { en: `Adductor strength is down for this player (${trend.deltaPct}% vs own baseline).`,
        is: `Aðlægðarkraftur er lægri hjá leikmanni (${trend.deltaPct}% m.v. eigin grunnlínu).` }
    : trend
      ? { en: "Adductor strength is holding vs own baseline.", is: "Aðlægðarkraftur heldur sér m.v. eigin grunnlínu." }
      : { en: "Baseline adductor strength recorded — no prior test yet to compare.", is: "Grunnlína aðlægðarkrafts skráð — enginn fyrri prófun til samanburðar enn." };

  const facts: Bi[] = [
    { en: `Adductor peak force: ${leftN} N left · ${rightN} N right`,
      is: `Hámarkskraftur aðlægðar: ${leftN} N vinstri · ${rightN} N hægri` },
    { en: `Combined ${sumN} N · ${meanN} N per limb`,
      is: `Samtals ${sumN} N · ${meanN} N á fót` },
  ];
  if (trend) facts.push({
    en: `Own baseline ${trend.baselineMeanN} N/limb (${trend.deltaPct >= 0 ? "+" : ""}${trend.deltaPct}%)`,
    is: `Eigin grunnlína ${trend.baselineMeanN} N/fót (${trend.deltaPct >= 0 ? "+" : ""}${trend.deltaPct}%)`,
  });
  if (asymmetryPct != null) facts.push({
    en: `Side-to-side: ${asymmetryPct.toFixed(1)}% asymmetry${asymmetrySide ? ` (weaker: ${asymmetrySide})` : ""} — secondary to absolute strength`,
    is: `Hlið við hlið: ${asymmetryPct.toFixed(1)}% ósamhverfa${asymmetrySide ? ` (veikari: ${asymmetrySide})` : ""} — aukaatriði við hlið absólút styrks`,
  });

  return { present: true, testDate: groin.testDate ?? null, leftN, rightN, sumN, meanN, asymmetryPct, asymmetrySide, trend, verdict, facts };
}
