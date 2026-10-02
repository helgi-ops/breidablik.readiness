/**
 * Minutes-driven post-match recovery recommendation (MD+1 and MD+3).
 *
 * The day-after prescription can be driven by how much a player actually PLAYED —
 * no CMJ/force-plate test required — but when a CMJ IS logged it OVERRIDES the minutes/load proxy. This works
 * for GPS-less teams too, where the Catapult-load auto-trigger can't fire. Pure,
 * null-safe, no IO. Advisory/descriptive — never the readiness colour.
 *
 * Evidence (systematic reviews / meta-analyses on file):
 *  - Time course (Drayton et al. 2025, JSCR, "Time Course of Postmatch Physical Impairments";
 *    Silva et al. 2018, Sports Med, acute/residual meta): immediately + MD+1 the neuromuscular
 *    system and ECCENTRIC HAMSTRING strength are impaired; sprint/COD/technical recover by
 *    MD+1–MD+2; CMJ/RSI/hamstring MVC can still lag at MD+3, especially after a full match and
 *    in lower-strength/lower-aerobic-fitness players (fitter players recover CMJ by MD+2).
 *    Fatigue magnitude + duration scale with match load (minutes / HIR).
 *  - Biochemical residual (Doeven et al. 2018, BMJ Open Sport Exerc Med): muscle-damage /
 *    inflammatory markers (CK, CRP) stay elevated up to ~72 h → a physiological basis for the
 *    MD+3 caution, not just performance tests.
 *  - Central vs peripheral (Brownstein et al. 2017, Front Physiol): both central (voluntary
 *    activation) and peripheral fatigue contribute; central recovers earlier (~MD+2), so the
 *    residual at MD+3 is largely peripheral/tissue — hence the hamstring/jump protection.
 *  - Sex (Goulart et al. 2022, Sports Med Open, female soccer fatigue meta): women show a CMJ
 *    trough ~12–24 h but physical capacity is largely recovered by ~72 h → MD+3 is cleared
 *    earlier than for men.
 *  - Modality efficacy (Querido et al. 2022, IJSPP, graded review; consistent with
 *    Altarriba-Bartes et al. 2020, PLoS ONE): cold-water immersion & massage are GRADE B for
 *    PERCEPTION (soreness/wellness) only, not measured physical/physiological recovery; active
 *    recovery grade B against; sleep hygiene essential long-term. So the honest framing: the
 *    protocol protects how the player feels and guards against premature loading — the biggest
 *    lever is easing LOAD while impaired, not a modality.
 */

import { md1MinutesTier, MD1_HIGH_MINUTES, MD1_LOW_MINUTES, type Md1Tier } from "@/lib/micropulse/strengthProgramming/md1Tier";
import type { MdContext } from "@/lib/micropulse/strengthProgramming/types";
import type { RecoveryEvidenceTier } from "./types";

export type MinutesRecoveryAction =
  | "full_recovery" // MD+1, played a lot → full recovery emphasis
  | "light_recovery" // MD+1, partial minutes → lighter recovery
  | "rebuild" // MD+1, played little / DNP → a training/rebuild day, NOT recovery
  | "reload_caution" // MD+3, high exposure → reintroduce intensity but still protect jump/hamstring
  | "reload_clear"; // MD+3 (or female) → recovered, cleared to reload

/** Slugs of the recovery protocols this engine can assign (seeded in the DB). */
export const MD_PLUS_1_SLUG = "md_plus_1_recovery_bundle";
export const MD_PLUS_3_SLUG = "md_plus_3_reload_readiness";

export type MinutesRecoveryPlan = {
  mdContext: "MD+1" | "MD+3";
  tier: Md1Tier;
  action: MinutesRecoveryAction;
  /** Protocol to assign, or null when the recommendation is "no protocol" (rebuild / cleared). */
  protocolSlug: string | null;
  /** Honest evidence grade of the day-after TIMING call (modality limits live in the caveat). */
  evidenceTier: RecoveryEvidenceTier;
  /** Keep high-intent eccentric/jump work off the plan (hamstring/CMJ still fatigued). */
  protectEccentric: boolean;
  /** What set the tier: "minutes" (floor), "load" (GPS/IMA dose escalated it), or "cmj" (an objective
   *  jump test overrode the proxy). */
  driver: "minutes" | "load" | "cmj";
  labelEN: string;
  labelIS: string;
  whyEN: string;
  whyIS: string;
  /** Honest limit of the recommendation (e.g. modalities help perception, not measured recovery). */
  caveatEN: string | null;
  caveatIS: string | null;
};

export type MinutesRecoveryInput = {
  mdContext: MdContext | null | undefined;
  minutes: number | null | undefined;
  isDnp?: boolean;
  /** From teams.gender; "female" clears MD+3 earlier. */
  sex?: "male" | "female" | "unknown" | null;
  /**
   * GPS/IMA mechanical match-load tier for this player (decel-weighted; or Player-Load-vs-baseline),
   * when available. Minutes is the FLOOR; a high mechanical dose can ESCALATE the recovery tier
   * (a 45-min cameo with very high decel/HSR load fatigues more than the minutes imply — Silva 2018,
   * McBurnie 2022), but load never LOWERS it below the exposure the minutes already show. Null/omitted
   * for GPS-less teams → minutes-only (unchanged).
   */
  mechanicalDose?: "high" | "mid" | "low" | null;
  /**
   * CMJ jump-height change vs the player's own pre-match baseline, in PERCENT (negative = depressed),
   * when a post-match ForceDecks jump is logged for this MD day. The objective neuromuscular test — when
   * present it OVERRIDES the minutes/load proxy ("the test wins", Gathercole 2015): a recovered jump
   * clears the player, a still-depressed jump keeps the protection on, regardless of minutes/sex.
   */
  cmjJhPct?: number | null;
};

/** Classify a CMJ %-vs-baseline reading. Meaningful jump depression post-match ≈ ≥5% (Gathercole 2015
 *  CV-based smallest worthwhile change); within ~2% of baseline = recovered; the band between = unclear
 *  → defer to minutes/load. Null when no jump was logged. */
function classifyCmj(jhPct: number | null | undefined): "recovered" | "depressed" | "ambiguous" | null {
  if (jhPct == null || !Number.isFinite(jhPct)) return null;
  if (jhPct <= -5) return "depressed";
  if (jhPct >= -2) return "recovered";
  return "ambiguous";
}

/**
 * Recommend a minutes-driven recovery action for MD+1 / MD+3.
 * Returns null when it does not apply: a non-MD+1/MD+3 day, or minutes unknown
 * and not a DNP (then the caller keeps existing behaviour / shows nothing).
 */
export function recommendMinutesRecovery(input: MinutesRecoveryInput): MinutesRecoveryPlan | null {
  const md = input.mdContext;
  if (md !== "MD+1" && md !== "MD+3") return null;

  const minutesTier = md1MinutesTier(input.minutes, input.isDnp);
  if (minutesTier == null) return null; // minutes unknown and not DNP → can't drive

  // Minutes set the FLOOR; a high GPS/IMA mechanical dose escalates a partial-minutes player to full
  // recovery (big decel/HSR dose fatigues beyond the minutes). It never lowers the floor, and a
  // <30-min/DNP player who barely played stays a rebuild regardless of any (implausible) load tier.
  const escalatedByLoad = minutesTier === "moderate" && input.mechanicalDose === "high";
  const tier: Md1Tier = escalatedByLoad ? "high" : minutesTier;
  const driver: "minutes" | "load" = escalatedByLoad ? "load" : "minutes";
  const loadBumpEN = escalatedByLoad ? " GPS/IMA mechanical load was HIGH despite partial minutes, so recovery is treated as a full-match day." : "";
  const loadBumpIS = escalatedByLoad ? " GPS/IMA vélrænt álag var HÁTT þrátt fyrir hálfan leik, svo endurheimt er meðhöndluð sem heill leikur." : "";

  const isFemale = input.sex === "female";
  // CMJ, when logged, is the objective neuromuscular read and OVERRIDES the minutes/load proxy.
  const cmjState = classifyCmj(input.cmjJhPct);
  const cmjTxt = input.cmjJhPct != null ? `${input.cmjJhPct > 0 ? "+" : ""}${input.cmjJhPct}%` : "";

  if (md === "MD+1") {
    // ── CMJ overrides minutes/load when a jump was logged and is decisive ──
    if (cmjState === "depressed") {
      return {
        mdContext: "MD+1", tier: "high", action: "full_recovery", protocolSlug: MD_PLUS_1_SLUG,
        evidenceTier: "strong", protectEccentric: true, driver: "cmj",
        labelEN: "Full recovery", labelIS: "Full endurheimt",
        whyEN: `CMJ jump height is down ${cmjTxt} vs baseline — an objective sign the neuromuscular system is still fatigued (overrides minutes). Recovery emphasis; keep high-intent eccentric/sprint work off today.`,
        whyIS: `CMJ stökkhæð er niðri ${cmjTxt} vs grunnlínu — hlutlægt merki um að taugavöðvakerfið sé enn þreytt (ræður yfir mínútum). Áhersla á endurheimt; slepptu þungu eccentric/spretti í dag.`,
        caveatEN: null, caveatIS: null,
      };
    }
    if (cmjState === "recovered" && minutesTier !== "low") {
      return {
        mdContext: "MD+1", tier, action: "light_recovery", protocolSlug: MD_PLUS_1_SLUG,
        evidenceTier: "strong", protectEccentric: true, driver: "cmj",
        labelEN: "Light recovery", labelIS: "Létt endurheimt",
        whyEN: `CMJ is back to baseline (${cmjTxt}) — neuromuscularly recovered, so keep it light (test overrides minutes). Still ease eccentric/jump load; hamstring tissue can lag the jump.`,
        whyIS: `CMJ er komið á grunnlínu (${cmjTxt}) — taugavöðvalega endurheimt, svo hafðu það létt (próf ræður yfir mínútum). Dragðu samt úr eccentric/stökki; aftanlæris-vefur getur verið á eftir stökkinu.`,
        caveatEN: null, caveatIS: null,
      };
    }
    // recovered CMJ + low minutes → fall through to rebuild (fresh and missed match load).
    // ambiguous / no CMJ → minutes/load logic below.
    if (tier === "high") {
      return {
        mdContext: "MD+1", tier, action: "full_recovery", protocolSlug: MD_PLUS_1_SLUG,
        evidenceTier: "moderate", protectEccentric: true, driver,
        labelEN: "Full recovery", labelIS: "Full endurheimt",
        whyEN: `${escalatedByLoad ? "" : `Played ≥${MD1_HIGH_MINUTES} min — `}neuromuscular and eccentric-hamstring fatigue are highest the day after (Drayton 2025). Recovery emphasis; keep high-intent eccentric/sprint work off today.${loadBumpEN}`,
        whyIS: `${escalatedByLoad ? "" : `Lék ≥${MD1_HIGH_MINUTES} mín — `}taugavöðva- og aftanlæris-þreyta er mest daginn eftir (Drayton 2025). Áhersla á endurheimt; slepptu þungu eccentric/spretti í dag.${loadBumpIS}`,
        caveatEN: "Cold-water immersion / massage help soreness & perception (grade B, Querido 2022), not measured physical recovery — the main lever is easing load today.",
        caveatIS: "Kalt bað / nudd hjálpa eymslum og líðan (grade B, Querido 2022), ekki mældri líkamlegri endurheimt — stærsti stýriþátturinn er að létta álagið í dag.",
      };
    }
    if (tier === "moderate") {
      return {
        mdContext: "MD+1", tier, action: "light_recovery", protocolSlug: MD_PLUS_1_SLUG,
        evidenceTier: "moderate", protectEccentric: true, driver,
        labelEN: "Light recovery", labelIS: "Létt endurheimt",
        whyEN: `Played ${MD1_LOW_MINUTES}–${MD1_HIGH_MINUTES - 1} min — a partial dose. A lighter recovery session (breathing + tendon iso); still ease eccentric/jump load.`,
        whyIS: `Lék ${MD1_LOW_MINUTES}–${MD1_HIGH_MINUTES - 1} mín — hálfur skammtur. Léttari endurheimt (öndun + sinaiso); dragðu samt úr eccentric/stökk-álagi.`,
        caveatEN: "Modalities help perception more than measured recovery (grade B, Querido 2022).",
        caveatIS: "Aðferðir hjálpa líðan meira en mældri endurheimt (grade B, Querido 2022).",
      };
    }
    // low / DNP
    return {
      mdContext: "MD+1", tier, action: "rebuild", protocolSlug: null,
      evidenceTier: "moderate", protectEccentric: false, driver,
      labelEN: "Rebuild (not recovery)", labelIS: "Uppbygging (ekki endurheimt)",
      whyEN: `Played <${MD1_LOW_MINUTES} min / did not play — missed match load, so MD+1 is a training day, not recovery: give a real strength/running stimulus so they don't fall behind the week (Rønnestad 2023). No recovery protocol assigned.`,
      whyIS: `Lék <${MD1_LOW_MINUTES} mín / spilaði ekki — missti leikálag, svo MD+1 er æfingadagur, ekki endurheimt: gefðu alvöru styrk/hlaupa-áreiti svo hann dragist ekki aftur úr vikunni (Rønnestad 2023). Ekkert recovery-prótokoll úthlutað.`,
      caveatEN: null, caveatIS: null,
    };
  }

  // MD+3
  // CMJ overrides when logged: a recovered jump clears, a depressed jump keeps the protection on —
  // regardless of minutes or sex (the objective test wins).
  if (cmjState === "recovered") {
    return {
      mdContext: "MD+3", tier, action: "reload_clear", protocolSlug: null,
      evidenceTier: "strong", protectEccentric: false, driver: "cmj",
      labelEN: "Cleared to reload", labelIS: "Klár í aukið álag",
      whyEN: `CMJ is back to baseline (${cmjTxt}) at MD+3 — neuromuscularly recovered, cleared to reintroduce full intensity (test overrides minutes).`,
      whyIS: `CMJ er komið á grunnlínu (${cmjTxt}) við MD+3 — taugavöðvalega endurheimt, klár í fulla ákefð (próf ræður yfir mínútum).`,
      caveatEN: null, caveatIS: null,
    };
  }
  if (cmjState === "depressed") {
    return {
      mdContext: "MD+3", tier, action: "reload_caution", protocolSlug: MD_PLUS_3_SLUG,
      evidenceTier: "strong", protectEccentric: true, driver: "cmj",
      labelEN: "Reload — protect jump/hamstring", labelIS: "Aukið álag — verja stökk/aftanlæri",
      whyEN: `CMJ is still down ${cmjTxt} vs baseline at MD+3 (~72 h) — the jump has not recovered, so keep a hamstring/jump-protective primer before full intensity (test overrides minutes/sex).`,
      whyIS: `CMJ er enn niðri ${cmjTxt} vs grunnlínu við MD+3 (~72 klst) — stökkið er ekki komið til baka, svo haltu aftanlæris/stökk-verndandi upphitun fyrir fulla ákefð (próf ræður yfir mínútum/kyni).`,
      caveatEN: null, caveatIS: null,
    };
  }
  // Women largely recover physical capacity by ~72 h → cleared regardless of exposure.
  if (isFemale || tier !== "high") {
    return {
      mdContext: "MD+3", tier, action: "reload_clear", protocolSlug: null,
      evidenceTier: "moderate", protectEccentric: false, driver,
      labelEN: "Cleared to reload", labelIS: "Klár í aukið álag",
      whyEN: isFemale
        ? "By MD+3 (~72 h) women have largely recovered physical capacity (female-soccer fatigue meta) — cleared to reintroduce full intensity."
        : `Limited match exposure (<${MD1_HIGH_MINUTES} min) — recovered by MD+3 (~72 h); cleared to reload.`,
      whyIS: isFemale
        ? "Við MD+3 (~72 klst) hafa konur að mestu endurheimt líkamlega getu (female-soccer meta) — klár í fulla ákefð á ný."
        : `Takmarkað leikálag (<${MD1_HIGH_MINUTES} mín) — endurheimt við MD+3 (~72 klst); klár í aukið álag.`,
      caveatEN: null, caveatIS: null,
    };
  }
  // male/unknown + high exposure
  return {
    mdContext: "MD+3", tier, action: "reload_caution", protocolSlug: MD_PLUS_3_SLUG,
    evidenceTier: "moderate", protectEccentric: true, driver,
    labelEN: "Reload — protect jump/hamstring", labelIS: "Aukið álag — verja stökk/aftanlæri",
    whyEN: `After ${escalatedByLoad ? "a high mechanical match load" : "a full match"}, CMJ, reactive strength and hamstring strength can still lag at MD+3 (~72 h), especially in lower-strength/lower-fitness players (Drayton 2025; biochemical markers elevated to ~72 h, Doeven 2018). Reintroduce intensity but keep a hamstring/jump-protective primer.`,
    whyIS: `Eftir ${escalatedByLoad ? "hátt vélrænt leikálag" : "heilan leik"} geta CMJ, viðbragðsstyrkur og aftanlæris-styrkur enn verið skert við MD+3 (~72 klst), einkum hjá leikmönnum með lægri styrk/þol (Drayton 2025; lífefnamerki há upp í ~72 klst, Doeven 2018). Auktu ákefð en haltu aftanlæris/stökk-verndandi upphitun.`,
    caveatEN: "If a CMJ / strength test is logged and back to baseline, this player is cleared to full load — minutes is a proxy, the test wins.",
    caveatIS: "Ef CMJ / styrktarpróf er skráð og komið á grunnlínu er leikmaður klár í fullt álag — mínútur eru staðgengill, prófið ræður.",
  };
}
