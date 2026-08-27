/**
 * RTP VALD-test recommender — pure, no IO.
 *
 * Given the injured body part (from player_injuries → RtpInjury.bodyPart), recommend which VALD tests
 * to run for return-to-play, what each measures, and the return criterion (LSI / RSI thresholds). This
 * is rule-based DECISION SUPPORT for the medical / S&C staff — it recommends tests, it does not clear a
 * player or diagnose. Every battery is cited. Descriptive: it never touches the readiness colour.
 *
 * Cite: Read et al. 2020 (criteria-based RTP test battery); Taberner et al. 2019 (control–chaos
 * continuum); Buckthorpe 2019 (criteria-based ACL RTP); Green et al. 2020 (muscle-injury RTP);
 * O'Brien/Copenhagen (adductor squeeze); Opar/van Dyk (Nordic eccentric hamstring).
 */

export type Bi = { en: string; is: string };
export type RtpRegion = "calf" | "hamstring" | "groin" | "quad" | "knee" | "ankle" | "hip" | "general";
export type Device = "ForceDecks" | "NordBord" | "ForceFrame";
export type RecoTest = { key: string; name: Bi; device: Device; measures: Bi; criterion: Bi; priority: 1 | 2 | 3 };
export type TestRecommendation = { region: RtpRegion; regionLabel: Bi; matchedFrom: string | null; tests: RecoTest[]; note: Bi; citations: string[] };

export const REGION_LABEL: Record<RtpRegion, Bi> = {
  calf: { en: "Calf / Achilles", is: "Kálfi / hásin" },
  hamstring: { en: "Hamstring", is: "Aftanlæri" },
  groin: { en: "Groin / adductor", is: "Nári / aðlæg vöðvi" },
  quad: { en: "Quadriceps / thigh", is: "Framlæri / læri" },
  knee: { en: "Knee (incl. ACL)", is: "Hné (þ.m.t. ACL)" },
  ankle: { en: "Ankle", is: "Ökkli" },
  hip: { en: "Hip", is: "Mjöðm" },
  general: { en: "Lower limb (general)", is: "Neðri útlimur (almennt)" },
};

// ── Test definitions (shared pool) ────────────────────────────────────────────
const t = {
  ffPlantar: { key: "ff_plantar", device: "ForceFrame", name: { en: "Isometric plantar-flexion", is: "Ísómetrísk plantar-flexion" }, measures: { en: "Direct calf strength, side-to-side", is: "Beinn kálfa-styrkur, hlið-fyrir-hlið" }, criterion: { en: "LSI ≥ 90–95%", is: "LSI ≥ 90–95%" }, priority: 1 } as RecoTest,
  nordic: { key: "nordbord", device: "NordBord", name: { en: "Nordic hamstring (eccentric)", is: "Nordic aftanlæri (sérvirkt)" }, measures: { en: "Eccentric hamstring strength + symmetry", is: "Sérvirkur aftanlæris-styrkur + samhverfa" }, criterion: { en: "LSI ≥ 90% · re-injury risk rises below squad norm", is: "LSI ≥ 90% · endur-meiðsli aukast undir liðs-viðmiði" }, priority: 1 } as RecoTest,
  ffAdductor: { key: "ff_adductor", device: "ForceFrame", name: { en: "Adductor / abductor squeeze", is: "Aðlægni / fráfærslu kreistupróf" }, measures: { en: "Adductor strength + adductor:abductor ratio", is: "Aðlægni-styrkur + aðlægni:fráfærslu hlutfall" }, criterion: { en: "Adductor LSI ≥ 90% · ratio ~0.9–1.0", is: "Aðlægni LSI ≥ 90% · hlutfall ~0.9–1.0" }, priority: 1 } as RecoTest,
  imtp: { key: "imtp", device: "ForceDecks", name: { en: "IMTP (isometric mid-thigh pull)", is: "IMTP (ísómetrískt mid-thigh pull)" }, measures: { en: "Whole-chain isometric strength (peak / rel. force)", is: "Heildar-keðju ísómetrískur styrkur (peak / rel. force)" }, criterion: { en: "Return to pre-injury / squad norm", is: "Aftur í fyrri / liðs-viðmið" }, priority: 2 } as RecoTest,
  cmj: { key: "cmj", device: "ForceDecks", name: { en: "CMJ (bilateral)", is: "CMJ (báðir fætur)" }, measures: { en: "Neuromuscular output + inter-limb asymmetry", is: "Taugavöðva-afköst + ósamhverfa milli fóta" }, criterion: { en: "Asymmetry < 10% · height back to baseline", is: "Ósamhverfa < 10% · hæð aftur í grunnlínu" }, priority: 2 } as RecoTest,
  slj: { key: "slj", device: "ForceDecks", name: { en: "Single-leg jump / SL CMJ", is: "Einfætt stökk / SL CMJ" }, measures: { en: "Single-leg force production, side-to-side", is: "Einfætt kraftframleiðsla, hlið-fyrir-hlið" }, criterion: { en: "LSI ≥ 90%", is: "LSI ≥ 90%" }, priority: 2 } as RecoTest,
  sldjRsi: { key: "sldj_rsi", device: "ForceDecks", name: { en: "Single-leg drop jump (RSI)", is: "Einfætt drop jump (RSI)" }, measures: { en: "Reactive strength — spring/running tolerance", is: "Reactive strength — spyrnu/hlaupa-þol" }, criterion: { en: "RSI within norm · LSI ≥ 90%", is: "RSI innan norms · LSI ≥ 90%" }, priority: 1 } as RecoTest,
  djRsi: { key: "dj_rsi", device: "ForceDecks", name: { en: "Drop / rebound jump (RSI)", is: "Drop / rebound jump (RSI)" }, measures: { en: "Reactive strength + landing quality", is: "Reactive strength + lendingar-gæði" }, criterion: { en: "RSI within norm, symmetrical", is: "RSI innan norms, samhverft" }, priority: 2 } as RecoTest,
  hop: { key: "hop", device: "ForceDecks", name: { en: "Single-leg hop for distance / repeated hop", is: "Einfætt hopp (fjarlægð) / endurtekin hopp" }, measures: { en: "Capacity under repeated load, side-to-side", is: "Þol undir endurteknu álagi, hlið-fyrir-hlið" }, criterion: { en: "LSI ≥ 90%", is: "LSI ≥ 90%" }, priority: 2 } as RecoTest,
};

const BATTERY: Record<RtpRegion, RecoTest[]> = {
  calf: [t.ffPlantar, t.sldjRsi, t.slj, t.hop, t.cmj],
  hamstring: [t.nordic, t.imtp, t.slj, t.sldjRsi],
  groin: [t.ffAdductor, t.slj, t.imtp],
  quad: [t.imtp, t.slj, t.sldjRsi, t.cmj],
  knee: [t.cmj, t.slj, t.djRsi, t.imtp, t.hop],
  ankle: [t.sldjRsi, t.ffPlantar, t.hop, t.slj],
  hip: [t.imtp, t.slj, t.cmj, t.djRsi],
  general: [t.cmj, t.imtp, t.djRsi, t.slj, t.hop],
};

const CITES: Record<RtpRegion, string[]> = {
  calf: ["Read 2020", "Taberner 2019", "Green 2020"],
  hamstring: ["Opar / van Dyk (Nordic)", "Read 2020", "Green 2020"],
  groin: ["O'Brien / Copenhagen", "Read 2020"],
  quad: ["Read 2020", "Buckthorpe 2019"],
  knee: ["Buckthorpe 2019 (ACL)", "Read 2020"],
  ankle: ["Read 2020", "Taberner 2019"],
  hip: ["Read 2020"],
  general: ["Read 2020", "Taberner 2019"],
};

/** Map a free-text body part (EN or IS) to a canonical region. */
export function regionForBodyPart(bodyPart: string | null | undefined): RtpRegion {
  const s = String(bodyPart ?? "").toLowerCase();
  if (!s.trim()) return "general";
  if (/calf|achilles|gastroc|soleus|kálf|hásin|kalf/.test(s)) return "calf";
  if (/hamstring|biceps fem|aftanlær|aftanl/.test(s)) return "hamstring";
  if (/groin|adductor|adduct|pubic|nár|nari|aðlæg/.test(s)) return "groin";
  if (/quad|rectus|framlær|framanlær|framl/.test(s)) return "quad";
  if (/knee|acl|mcl|pcl|patell|meniscus|hné|hne|kné/.test(s)) return "knee";
  if (/ankle|lateral ligament|ökkl|okkl/.test(s)) return "ankle";
  if (/hip|glute|mjöðm|mjaðm|mjodm/.test(s)) return "hip";
  if (/thigh|læri|laeri/.test(s)) return "hamstring"; // ambiguous thigh → posterior default (screens hamstring)
  return "general";
}

/** Recommend the VALD test battery for an injured body part. */
export function recommendValdTests(bodyPart: string | null | undefined): TestRecommendation {
  const region = regionForBodyPart(bodyPart);
  const tests = [...BATTERY[region]].sort((a, b) => a.priority - b.priority);
  const note: Bi = {
    en: "Rule-based decision support for the medical / S&C staff — recommends which VALD tests to run and the return criterion; it does not clear the player or replace clinical judgement. Compare the injured limb to the healthy side (LSI) and to the player's pre-injury / squad norm across repeated sessions.",
    is: "Reglu-byggð ákvörðunar-hjálp fyrir læknateymi / S&C — mælir með hvaða VALD-próf á að taka og return-viðmið; hún klárar leikmanninn ekki né kemur í stað klínísks mats. Berðu slasaða útliminn saman við heilbrigða (LSI) og við fyrri / liðs-viðmið leikmannsins yfir endurteknar lotur.",
  };
  return { region, regionLabel: REGION_LABEL[region], matchedFrom: bodyPart ?? null, tests, note, citations: CITES[region] };
}
