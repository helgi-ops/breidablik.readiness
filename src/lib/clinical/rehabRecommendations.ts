/**
 * Rehab exercise recommendations derived from a confirmed clinical report.
 *
 * RULES DECIDE, AI EXPLAINS. This is the deterministic core: it maps a player's
 * injury (as read from the report) onto a citeable rehab protocol + the key
 * exercises for that injury, plus the qualities to protect on return to play.
 * It never invents load numbers and always cites a paper — the protocol carries
 * its own `references`. The clinician's note stays authoritative; this is a
 * suggestion the coach reviews, not a prescription.
 *
 * Reuses:
 *  - injuryRiskProfile() (returnToTraining.ts) — injury text → category + the
 *    re-injury qualities to ramp slowly (the "what to protect" anchor).
 *  - the isometric protocol library (isometrics/protocols.ts) — the actual
 *    phased rehab protocol + citations.
 */
import { injuryRiskProfile, type QualityKey } from "@/lib/micropulse/returnToTraining";
import { getProtocolById, type IsoProtocol } from "@/lib/micropulse/isometrics/protocols";
import { coerceInjuryType } from "@/lib/clinical/extractReport";

export type Bi = { en: string; is: string };
export type RehabExercise = { name: Bi; why: Bi };
export type RehabRecommendation = {
  /** injuryRiskProfile category (groin/hamstring/knee/…/general). */
  category: string;
  /** Plain "what to protect and why" sentence (from injuryRiskProfile.label). */
  protectLabel: Bi;
  /** The re-injury qualities to ramp slowly (short bilingual labels). */
  protectQualities: Array<{ key: QualityKey; label: Bi }>;
  /** The matched rehab protocol (null for head injury — symptom-limited). */
  protocol: { id: string; titleEN: string; titleIS: string; references: string[] } | null;
  /** Full protocol for the "Show details" layer (phases/steps). */
  protocolFull: IsoProtocol | null;
  /** 2–3 key exercises for this injury (name + one-line why). */
  exercises: RehabExercise[];
  /** Optional caveat (e.g. head injury: no loading protocol). */
  note: Bi | null;
};

// Short, chip-friendly quality labels (RTT_QUALITY_LABELS is weekly-phrased).
const QUALITY_SHORT: Record<QualityKey, Bi> = {
  volume: { en: "player load", is: "álag" },
  distance: { en: "distance", is: "vegalengd" },
  hsr: { en: "high-speed running", is: "háhraðahlaup" },
  sprint: { en: "sprinting", is: "sprettir" },
  stride: { en: "high-cadence running", is: "hátíðni hlaup" },
  strideTop: { en: "top-speed running", is: "topphraða hlaup" },
  accel: { en: "acceleration", is: "hröðun" },
  decel: { en: "braking", is: "hemlun" },
  decelHigh: { en: "hard braking", is: "hörð hemlun" },
  cod: { en: "change of direction", is: "stefnubreytingar" },
  efforts: { en: "hard efforts", is: "átök" },
};

// injuryRiskProfile category → isometric rehab protocol id (null = no loading
// protocol, e.g. head injury). Football is lower-limb dominant, so upper-body /
// unmatched injuries fall to the general prevention protocol.
const CATEGORY_PROTOCOL: Record<string, string | null> = {
  head: null,
  hamstring: "hamstring_tendinopathy",
  calf: "achilles_tendinopathy",
  quad: "tendinopathy_rehab_3phase",
  groin: "groin_adductor",
  knee: "patellar_tendinopathy",
  ankle: "injury_prevention_longevity",
  hip: "injury_prevention_longevity",
  muscle: "tendinopathy_rehab_3phase",
  general: "injury_prevention_longevity",
};

// Curated key exercises per category — standard, evidence-based movements. The
// citation lives on the protocol; these are the concrete things to actually do.
const CATEGORY_EXERCISES: Record<string, RehabExercise[]> = {
  groin: [
    { name: { en: "Copenhagen adduction", is: "Copenhagen aðfærsla" }, why: { en: "Loads the adductors in a lengthened position — the strongest evidence for groin injury prevention and rehab.", is: "Hleður aðfæruvöðva í lengdri stöðu — sterkasta gagnreynda æfingin fyrir nára." } },
    { name: { en: "Adductor squeeze isometric (ball between knees)", is: "Aðfærslu-kreista ísómetrísk (bolti milli hnjáa)" }, why: { en: "Pain-monitored isometric to build adductor tolerance early.", is: "Verkjastýrð ísómetrísk til að byggja upp þol snemma." } },
    { name: { en: "Side-lying hip adduction", is: "Hlið-liggjandi mjaðmar-aðfærsla" }, why: { en: "Low-load adductor strengthening once symptoms settle.", is: "Létt aðfæru-styrking þegar einkenni róast." } },
  ],
  hamstring: [
    { name: { en: "Long-lever bridge hold (isometric)", is: "Long-lever brú-hald (ísómetrísk)" }, why: { en: "Loads the proximal hamstring tendon at length without deep hip flexion.", is: "Hleður proximal hamstring-sin í lengd án djúprar mjaðmabeygju." } },
    { name: { en: "Nordic hamstring curl", is: "Nordic aftanlæris-beygja" }, why: { en: "Eccentric loading — the single most evidence-based hamstring re-injury reducer.", is: "Eccentrísk hleðsla — mest gagnreynda æfingin gegn endurmeiðslum í aftanlæri." } },
    { name: { en: "Single-leg Romanian deadlift", is: "Einfætt rúmensk réttstöðulyfta" }, why: { en: "Restores hinge strength and hamstring capacity through range.", is: "Endurheimtir mjaðmar-hjörustyrk og aftanlæris-getu í gegnum hreyfiferil." } },
  ],
  calf: [
    { name: { en: "Isometric single-leg calf raise hold", is: "Ísómetrísk einfætt kálfarís-hald" }, why: { en: "Analgesic tendon loading for Achilles / calf without excessive stretch.", is: "Verkjastillandi sina-hleðsla fyrir hásin/kálfa án of mikillar teygju." } },
    { name: { en: "Heavy slow calf raises (Silbernagel)", is: "Þungar hægar kálfarísur (Silbernagel)" }, why: { en: "Progressive concentric-eccentric loading of the Achilles.", is: "Stigvaxandi concentric-eccentric hleðsla á hásin." } },
    { name: { en: "Seated (soleus) calf raise", is: "Sitjandi (soleus) kálfarís" }, why: { en: "Targets the soleus, the main brake in running.", is: "Beinir álagi á soleus, aðal-hemil í hlaupum." } },
  ],
  quad: [
    { name: { en: "Spanish squat (isometric hold)", is: "Spænsk hnébeygja (ísómetrísk hald)" }, why: { en: "Knee-extensor isometric — analgesic loading without high speed.", is: "Ísómetrísk hné-réttistaða — verkjastillandi hleðsla án háhraða." } },
    { name: { en: "Split squat isometric hold", is: "Split squat ísómetrísk hald" }, why: { en: "Rebuilds single-leg quad capacity before returning to sprint.", is: "Byggir upp einfætta framlæris-getu áður en farið er í sprett." } },
  ],
  knee: [
    { name: { en: "Spanish squat (isometric hold)", is: "Spænsk hnébeygja (ísómetrísk hald)" }, why: { en: "Patellar-tendon isometric with a ~45-min analgesic window (Rio 2015).", is: "Patellar-sina ísómetrísk með ~45-mín verkjastillandi glugga (Rio 2015)." } },
    { name: { en: "Single-leg decline squat", is: "Einfætt halla-hnébeygja" }, why: { en: "Progressive patellar-tendon loading through range.", is: "Stigvaxandi patellar-sina hleðsla í gegnum hreyfiferil." } },
    { name: { en: "Isometric split-squat hold", is: "Ísómetrísk split-squat hald" }, why: { en: "Controlled single-leg loading before change-of-direction work.", is: "Stýrð einfætt hleðsla áður en stefnubreytingar hefjast." } },
  ],
  ankle: [
    { name: { en: "Single-leg balance progressions", is: "Einfætt jafnvægis-þrepun" }, why: { en: "Restores ankle proprioception — the key deficit after a sprain.", is: "Endurheimtir ökkla-stöðuskyn — lykil-skerðing eftir tognun." } },
    { name: { en: "Isometric calf raise hold", is: "Ísómetrísk kálfarís-hald" }, why: { en: "Rebuilds plantar-flexor strength for push-off and landing.", is: "Byggir upp plantarflexor-styrk fyrir fráspyrnu og lendingu." } },
  ],
  hip: [
    { name: { en: "Wall sit (isometric)", is: "Veggseta (ísómetrísk)" }, why: { en: "Low-irritation lower-limb loading while hip settles.", is: "Lág-ertandi neðri-útlima hleðsla meðan mjöðm róast." } },
    { name: { en: "Side-lying hip abduction", is: "Hlið-liggjandi mjaðmar-fráfærsla" }, why: { en: "Rebuilds hip stabiliser strength.", is: "Byggir upp styrk mjaðmar-stöðugleikavöðva." } },
  ],
  muscle: [
    { name: { en: "Isometric hold of the injured muscle (mid-range)", is: "Ísómetrísk hald á skaddaðan vöðva (mið-svið)" }, why: { en: "Pain-monitored isometric loading to start the reload.", is: "Verkjastýrð ísómetrísk hleðsla til að hefja endurhleðslu." } },
    { name: { en: "Progressive eccentric loading", is: "Stigvaxandi eccentrísk hleðsla" }, why: { en: "Restores tissue capacity through range before high speed.", is: "Endurheimtir vefjagetu í gegnum hreyfiferil áður en háhraði hefst." } },
  ],
  general: [
    { name: { en: "Wall sit (isometric)", is: "Veggseta (ísómetrísk)" }, why: { en: "Low-volume maintenance loading — safe general starting point.", is: "Lág-rúmmáls viðhalds-hleðsla — öruggur almennur upphafspunktur." } },
    { name: { en: "Hamstring bridge hold", is: "Aftanlæris brú-hald" }, why: { en: "Posterior-chain isometric to maintain capacity.", is: "Ísómetrísk aftari-keðja til að viðhalda getu." } },
  ],
  head: [],
};

const HEAD_NOTE: Bi = {
  en: "Head injury — return is symptom-limited (graded return-to-play protocol), not a loading protocol. No strength exercises are prescribed here.",
  is: "Höfuðáverki — endurkoma er einkenna-stýrð (þrepaskipt return-to-play), ekki hleðslu-prótókoll. Engar styrktaræfingar eru ráðlagðar hér.",
};

/**
 * Build a rehab recommendation from the injury descriptions on a report. Always
 * returns something (falls back to the general prevention protocol) so the coach
 * surface never shows an empty recommendation.
 */
export function buildRehabRecommendation(injuryTypes: string[]): RehabRecommendation {
  // injuryRiskProfile keys off English terms, but report text is often Icelandic.
  // Normalise each description to the injury enum (coerceInjuryType is IS-aware)
  // and feed BOTH the raw text and the enums, so "aftanlæri" → hamstring resolves.
  const enums = injuryTypes.map((t) => coerceInjuryType(t));
  const profile = injuryRiskProfile([...injuryTypes, ...enums]);
  const category = profile.category;
  const protocolId = category in CATEGORY_PROTOCOL ? CATEGORY_PROTOCOL[category] : "injury_prevention_longevity";
  const protocolFull = protocolId ? getProtocolById(protocolId) ?? null : null;

  return {
    category,
    protectLabel: profile.label,
    protectQualities: profile.riskQualities.map((key) => ({ key, label: QUALITY_SHORT[key] })),
    protocol: protocolFull
      ? { id: protocolFull.id, titleEN: protocolFull.titleEN, titleIS: protocolFull.titleIS, references: protocolFull.references }
      : null,
    protocolFull,
    exercises: CATEGORY_EXERCISES[category] ?? CATEGORY_EXERCISES.general,
    note: category === "head" ? HEAD_NOTE : null,
  };
}
