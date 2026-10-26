/**
 * Change-of-direction (CoD) L/R asymmetry — shared pure helpers so the API route and the injury
 * early-warning (robustnessWatch) agree on the maths and the footedness interpretation.
 *
 * Bishop 2020: it's the HIGH-INTENSITY L/R asymmetry that is injury-relevant — overall % can hide a
 * serious one-side preference at high effort. Thresholds: 9% watch · 15% concern · 18% high.
 *
 * Havanecz 2026 (leg-dominance): CoD FREQUENCY is balanced L/R, but directional LOAD depends on
 * footedness — players prefer the dominant limb as the PLANT limb, so a MODEST directional lean is
 * physiologically expected. Footedness is therefore interpretive CONTEXT, not a new threshold; the
 * Bishop magnitude stays the flag, and the side×footedness link is an interaction, not a simple
 * "dominant side higher" rule — so we surface the dominant foot and the favoured side and let the
 * reader judge, rather than hard-coding a direction.
 */

export type DominantFoot = "left" | "right" | "both";
export type CodFlag = "ok" | "watch" | "concern" | "high" | "no_data";

export const COD_WATCH_PCT = 9;
export const COD_CONCERN_PCT = 15;
export const COD_HIGH_PCT = 18;

/** L/R asymmetry as a % of the larger side. Null when there is no CoD volume. */
export function asymPct(left: number, right: number): number | null {
  const max = Math.max(left, right);
  if (max <= 0) return null;
  return (Math.abs(left - right) / max) * 100;
}

export function codFlag(pct: number | null): CodFlag {
  if (pct == null) return "no_data";
  if (pct >= COD_HIGH_PCT) return "high";
  if (pct >= COD_CONCERN_PCT) return "concern";
  if (pct >= COD_WATCH_PCT) return "watch";
  return "ok";
}

export type Bi = { en: string; is: string };

/** The side with more CoD volume, or "balanced" when within the watch threshold. */
export function favoredSide(left: number, right: number): "left" | "right" | "balanced" {
  const pct = asymPct(left, right);
  if (pct == null || pct < COD_WATCH_PCT) return "balanced";
  return right > left ? "right" : "left";
}

const FOOT_LABEL: Record<DominantFoot, Bi> = {
  left: { en: "left-footed", is: "örvfættur" },
  right: { en: "right-footed", is: "réttfættur" },
  both: { en: "two-footed", is: "jafnfættur" },
};
const SIDE_LABEL: Record<"left" | "right" | "balanced", Bi> = {
  left: { en: "left", is: "vinstri" },
  right: { en: "right", is: "hægri" },
  balanced: { en: "balanced", is: "jafnt" },
};

/**
 * Footedness-aware interpretation of the HIGH-intensity CoD asymmetry. Descriptive — names the dominant
 * foot and the favoured side, says a modest lean is expected (plant-limb, Havanecz) so magnitude is what
 * flags (Bishop), and that a large imbalance warrants attention. Not a new threshold.
 */
export function codFootednessNote(dominantFoot: DominantFoot | null, highLeft: number, highRight: number): Bi {
  const side = favoredSide(highLeft, highRight);
  const pct = asymPct(highLeft, highRight);
  const flagged = pct != null && pct >= COD_CONCERN_PCT;
  const foot = dominantFoot ? FOOT_LABEL[dominantFoot] : null;
  const s = SIDE_LABEL[side];
  if (side === "balanced") {
    return {
      en: `High-intensity cutting is balanced left/right${foot ? ` (${foot.en})` : ""}.`,
      is: `Háákefðar skurðir eru jafnir vinstri/hægri${foot ? ` (${foot.is})` : ""}.`,
    };
  }
  const footEn = foot ? `${foot.en}; ` : "dominant foot not set; ";
  const footIs = foot ? `${foot.is}; ` : "ríkjandi fótur óskráður; ";
  return {
    en: `High-intensity cutting leans ${s.en} (${foot ? footEn : footEn}a modest plant-limb lean is normal — Havanecz 2026). ${flagged ? "The size of the imbalance is the flag (Bishop 2020) — review alongside his footedness." : "Within the normal range; magnitude, not direction, is what would flag."}`,
    is: `Háákefðar skurðir halla til ${s.is} (${foot ? footIs : footIs}hóflegur plant-fótar halli er eðlilegur — Havanecz 2026). ${flagged ? "Stærð ójafnvægisins er merkið (Bishop 2020) — metið m.t.t. ríkjandi fótar." : "Innan eðlilegra marka; stærð, ekki stefna, myndi flagga."}`,
  };
}
