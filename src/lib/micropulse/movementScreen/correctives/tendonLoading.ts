/**
 * Tendon-adaptation layer — how the tendon itself loads and adapts (Keith Baar's
 * work), complementary to King (movement / intersegmental control) and the folder
 * EMG (muscle activation), never a replacement. Encodes Baar's dosing rule, the
 * isometric entry mode, an optional collagen-nutrition timing prompt, and
 * per-tendon specificity — each cited and HONESTLY graded.
 *
 * Honest grade: MECHANISTIC-STRONG / CLINICAL-OUTCOME-EMERGING. Much of the
 * mechanism work is in-vitro (engineered ligament) or rodent — strong for the dose
 * rationale, not athlete RCT outcomes; the gelatin + vitamin-C result is human but
 * on a collagen-synthesis blood marker (PINP), not clinical tendinopathy outcomes.
 * So this is a well-reasoned, mechanistically grounded protocol — NEVER a cure
 * claim. Nutrition guidance is "consider", not a medical prescription. Pain /
 * diagnosis → clinician. Never the readiness colour. Pure data module.
 */
import type { Bi } from "../registry";
import type { CompensationKey } from "./registry";
import type { RegionKey } from "../vision/regions";

export type TendonKey = "patellar" | "achilles" | "hamstring" | "adductor";

export const TENDON_LABEL: Record<TendonKey, Bi> = {
  patellar: { en: "Patellar tendon (jumper's knee)", is: "Hnéskeljar-sin (jumper's knee)" },
  achilles: { en: "Achilles tendon", is: "Hásin (Achilles)" },
  hamstring: { en: "Hamstring tendon", is: "Aftanlæris-sin" },
  adductor: { en: "Adductor tendon", is: "Aðfærslu-sin" },
};

/** Two-dimensional honesty tag surfaced on the card. */
export const TENDON_GRADE: Bi = {
  en: "Mechanistically strong, clinical-outcome emerging: in-vitro/rodent mechanism + a human collagen-synthesis biomarker (PINP). A well-reasoned loading + nutrition protocol, not a cure claim.",
  is: "Vélrænt sterkt, klínísk útkoma að koma fram: in-vitro/nagdýra vélbúnaður + mannlegur kollagen-myndunar lífvísir (PINP). Vel rökstutt álags- + næringar-prótókoll, ekki lækninga-fullyrðing.",
};

// ── 1. Mechanotransduction → the loading dose ──
export const TENDON_DOSING: { title: Bi; rule: Bi; why: Bi; citation: string } = {
  title: { en: "Loading dose — short & frequent, not long", is: "Álags-skammtur — stutt & oft, ekki langt" },
  rule: {
    en: "~10-minute tendon-loading bouts, 1–3×/day, separated by ~6 hours. Frequency over duration.",
    is: "~10 mín sina-álags lotur, 1–3×/dag, með ~6 klst millibili. Tíðni fram yfir lengd.",
  },
  why: {
    en: "Collagen-synthesis signalling (ERK1/2) plateaus within ~10 min of loading, so longer sessions add little; connective tissue then needs a refractory window before it responds again.",
    is: "Kollagen-myndunar boð (ERK1/2) ná hámarki innan ~10 mín, svo lengri lotur bæta litlu við; bandvefur þarf svo hvíldarglugga áður en hann svarar aftur.",
  },
  citation: "Paxton 2012 (Tissue Eng A); Baar 2017 (Sports Med); West 2015 (J Physiol)",
};

// ── 2. Isometric entry + stress relaxation ──
export const TENDON_ISOMETRIC: { title: Bi; detail: Bi; citation: string } = {
  title: { en: "Isometric entry mode", is: "Ísómetrísk byrjun" },
  detail: {
    en: "Heavy, sustained isometric / stress-relaxation loading up-regulates the tendon's build program (scleraxis + collagen-I) — the entry loading mode, progressing through the staged-loading protocol.",
    is: "Þungt, viðvarandi ísómetrískt / stress-relaxation álag eykur uppbyggingar-forrit sinarinnar (scleraxis + kollagen-I) — byrjunar-álagsmátinn, sem stigmagnast gegnum þrepaskiptа álags-prótókollið.",
  },
  citation: "Steffen 2022 (Matrix Biol); Baar 2019 (IJSNEM); Tam & Baar 2025 (Matrix Biol)",
};

// ── 3. Collagen nutrition — timing (optional, emerging) ──
export const TENDON_NUTRITION: { title: Bi; detail: Bi; caveat: Bi; citation: string } = {
  title: { en: "Collagen nutrition timing (consider)", is: "Kollagen-næring tímasetning (íhuga)" },
  detail: {
    en: "Consider ~15 g gelatin/collagen + vitamin C ~45 min BEFORE a loading bout — the amino-acid bolus must be available during the window (tendon blood flow is low). Avoid caffeine around the loading+nutrition window (it attenuated adaptation).",
    is: "Íhugaðu ~15 g gelatín/kollagen + C-vítamín ~45 mín FYRIR álags-lotu — amínósýru-skammturinn þarf að vera til staðar á meðan (blóðflæði sinar er lágt). Forðastu koffín í kringum álags+næringar-gluggann (það dró úr aðlögun).",
  },
  caveat: {
    en: "Emerging (blood-marker) evidence — nutrition guidance, NOT medical advice or a mandate. A sex/hormonal modifier exists (estrogen inhibits collagen cross-linking).",
    is: "Vísbendingar að koma fram (lífvísir) — næringar-leiðbeining, EKKI læknisráð eða skylda. Kynja-/hormóna þáttur er til staðar (estrógen hamlar kollagen-krosstengingu).",
  },
  citation: "Shaw 2017 (AJCN); Lis & Baar 2019 (IJSNEM); Steffen 2025 (JAP, caffeine); Lee 2015 (JAP, estrogen)",
};

// ── 4. Per-tendon specificity + intensity ──
export const TENDON_INTENSITY_NOTE: { detail: Bi; citation: string } = {
  detail: {
    en: "Intensity is a programmable variable, not one-size-fits-all — and tendons diverge (Achilles vs patellar have similar mechanical gains but different transcriptional responses), so keep per-tendon protocols.",
    is: "Ákefð er stillanleg breyta, ekki ein-stærð-fyrir-alla — og sinar eru ólíkar (Achilles vs hnéskeljar hafa svipaðan vélrænan ávinning en ólík umritunar-svör), svo haltu prótókollum per sin.",
  },
  citation: "Steffen 2023 (J Physiol); Gilmore 2024 (Sports Med Open)",
};

export const PER_TENDON_NOTE: Record<TendonKey, Bi> = {
  patellar: { en: "Patellar: isometric knee-extension holds (e.g. Spanish squat / leg-extension iso) as the entry mode; jumper's-knee staged loading.", is: "Hnéskeljar: ísómetrísk hné-réttu hald (t.d. spænsk hnébeygja / leg-extension iso) sem byrjun; jumper's-knee þrepaskipt álag." },
  achilles: { en: "Achilles: isometric heel-raise holds; progress to slow heavy calf loading (staged).", is: "Achilles: ísómetrísk hæl-lyftu hald; stigmagna í hægt þungt kálfa-álag (þrepaskipt)." },
  hamstring: { en: "Hamstring: isometric hamstring holds / long-lever bridges; progress to eccentric (Nordic).", is: "Aftanlæri: ísómetrísk aftanlæris-hald / löng-vogar brýr; stigmagna í eccentric (Nordic)." },
  adductor: { en: "Adductor: isometric ball-squeeze (45°/0°); progress to Copenhagen (staged).", is: "Aðfærslu: ísómetrísk bolta-kreisting (45°/0°); stigmagna í Copenhagen (þrepaskipt)." },
};

export const TENDON_CAVEAT: Bi = {
  en: "Tendon-loading & collagen-nutrition guidance (Baar) — how the tendon adapts, alongside movement control and muscle activation. Screening / training support only; never a diagnosis or a cure claim, never the readiness colour. Pain / suspected tendinopathy → clinician.",
  is: "Sina-álags & kollagen-næringar leiðbeining (Baar) — hvernig sinin aðlagast, samhliða hreyfistjórn og vöðva-virkjun. Aðeins skimun / þjálfunar-stuðningur; aldrei greining eða lækninga-fullyrðing, aldrei readiness-liturinn. Verkur / grunur um sinabólgu → klíníker.",
};

// Which tendon a screen compensation / a body region implicates (conservative).
const COMPENSATION_TENDON: Partial<Record<CompensationKey, TendonKey[]>> = {
  poor_absorption: ["patellar"],
  low_reactive_strength: ["patellar", "achilles"],
  limited_dorsiflexion: ["achilles"],
  landing_instability: ["achilles"],
};
const REGION_TENDON: Partial<Record<RegionKey, TendonKey[]>> = {
  knee: ["patellar"],
  ankle_foot: ["achilles"],
  hip: ["adductor", "hamstring"],
};

const uniq = (xs: TendonKey[]): TendonKey[] => [...new Set(xs)];

export function tendonsForCompensations(compKeys: CompensationKey[]): TendonKey[] {
  return uniq(compKeys.flatMap((k) => COMPENSATION_TENDON[k] ?? []));
}
export function tendonsForRegion(region: RegionKey): TendonKey[] {
  return REGION_TENDON[region] ?? [];
}
