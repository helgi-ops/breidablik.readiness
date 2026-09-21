/**
 * Body composition — skinfold (Jackson-Pollock → body density → Siri/Brožek %fat) and circumference
 * (US Navy) estimates, plus lean/fat mass. Pure, deterministic, no I/O.
 *
 * ATHLETE WELLBEING (non-negotiable): this is an INDIVIDUAL-TREND monitoring read, never a verdict.
 * There is no "ideal %", no pass/fail on the body, no target, no prescription. Every result carries
 * its estimate error (±3–5 %) and the reminder that the trend is only meaningful with a CONSISTENT
 * method/tester/sites. Descriptive-only — it must NEVER feed the readiness colour, the load target,
 * the daily decision, or a prescriptive focus (body-comp codes are already excluded from
 * physicalAssessment/recommend.ts — keep it that way).
 *
 * Cite: Jackson & Pollock 1978 (men 3/7-site); Jackson, Pollock & Ward 1980 (women); Siri 1961 &
 * Brožek 1963 (density → %fat); Hodgdon & Beckett 1984 (US Navy circumference).
 */

import type { Bi } from "./peakPeriod";

export type Sex = "M" | "F";
export type SkinfoldSite = "chest" | "abdomen" | "thigh" | "triceps" | "suprailiac" | "subscapular" | "midaxillary";
export type Skinfolds = Partial<Record<SkinfoldSite, number>>;
export type Conversion = "siri" | "brozek";
export type BodyCompMethod = "jp3" | "jp7" | "navy";

export interface BodyCompResult {
  bodyFatPct: number;
  method: BodyCompMethod;
  bodyDensity: number | null;      // null for the Navy method (no density step)
  sumSkinfoldsMm: number | null;   // null for the Navy method
  leanKg: number | null;
  fatKg: number | null;
  conversion: Conversion;
  caveat: Bi;
}

const SKINFOLD_MIN = 1, SKINFOLD_MAX = 60;   // mm — plausible caliper range
const GIRTH_MIN = 10, GIRTH_MAX = 250;       // cm
const HEIGHT_MIN = 100, HEIGHT_MAX = 250;    // cm
const AGE_MIN = 5, AGE_MAX = 90;
const BF_MIN = 2, BF_MAX = 60;               // implausible outside this → null (matches the DB check)

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

const CAVEAT: Bi = {
  en: "A skinfold/circumference ESTIMATE from a population equation — typical error ±3–5 %, not a lab measure (DXA/hydrostatic). Read it as an INDIVIDUAL TREND over time, and only when the same tester, the same sites and the same equation are used under similar conditions; otherwise the change is noise. Descriptive monitoring only — no ideal %, no target, no judgement of the body.",
  is: "MAT úr húðfellinga-/ummáls-jöfnu fyrir þýði — dæmigerð skekkja ±3–5 %, ekki rannsóknarstofumæling (DXA/vatnsvigtun). Lestu sem EINSTAKLINGS-ÞRÓUN yfir tíma, og aðeins þegar sami mælandi, sömu staðir og sama jafna eru notuð við sambærilegar aðstæður; annars er breytingin suð. Lýsandi eftirlit — ekkert kjörhlutfall, ekkert markmið, enginn dómur um líkamann.",
};

const validSkinfold = (v: number | undefined): v is number => isNum(v) && v >= SKINFOLD_MIN && v <= SKINFOLD_MAX;
const validGirth = (v: number | undefined | null): v is number => isNum(v) && v >= GIRTH_MIN && v <= GIRTH_MAX;

/** Convert body density to %fat. Returns null if BD is non-physical. */
function densityToBf(bd: number, conversion: Conversion): number | null {
  if (!isNum(bd) || bd <= 0) return null;
  const bf = conversion === "brozek" ? 457 / bd - 414.2 : 495 / bd - 450;
  return isNum(bf) ? bf : null;
}

/** Assemble a result from a computed %fat, or null when it lands outside a plausible range. */
function finalize(method: BodyCompMethod, bodyFatPct: number | null, bodyDensity: number | null, sum: number | null, conversion: Conversion): BodyCompResult | null {
  if (bodyFatPct == null || !isNum(bodyFatPct) || bodyFatPct < BF_MIN || bodyFatPct > BF_MAX) return null;
  return {
    bodyFatPct: r1(bodyFatPct), method, bodyDensity: bodyDensity == null ? null : r5(bodyDensity),
    sumSkinfoldsMm: sum == null ? null : Math.round(sum), leanKg: null, fatKg: null, conversion, caveat: CAVEAT,
  };
}

/**
 * Jackson-Pollock 3-site → body density → %fat. Pure.
 * Men need chest+abdomen+thigh; women need triceps+suprailiac+thigh. Null on any missing/out-of-range
 * site, absent/implausible age, or an implausible result.
 */
export function jacksonPollock3(o: { sex: Sex; ageYears: number; sites: Skinfolds; conversion?: Conversion }): BodyCompResult | null {
  const conversion = o.conversion ?? "siri";
  const age = o.ageYears;
  if (!isNum(age) || age < AGE_MIN || age > AGE_MAX) return null;

  const req: SkinfoldSite[] = o.sex === "M" ? ["chest", "abdomen", "thigh"] : ["triceps", "suprailiac", "thigh"];
  const vals = req.map((s) => o.sites[s]);
  if (!vals.every(validSkinfold)) return null;
  const S = (vals as number[]).reduce((a, b) => a + b, 0);

  const bd = o.sex === "M"
    ? 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * age
    : 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * age;

  return finalize("jp3", densityToBf(bd, conversion), bd, S, conversion);
}

/**
 * Jackson-Pollock 7-site → body density → %fat. Pure.
 * Needs all 7 sites (chest, midaxillary, triceps, subscapular, abdomen, suprailiac, thigh).
 */
export function jacksonPollock7(o: { sex: Sex; ageYears: number; sites: Skinfolds; conversion?: Conversion }): BodyCompResult | null {
  const conversion = o.conversion ?? "siri";
  const age = o.ageYears;
  if (!isNum(age) || age < AGE_MIN || age > AGE_MAX) return null;

  const req: SkinfoldSite[] = ["chest", "midaxillary", "triceps", "subscapular", "abdomen", "suprailiac", "thigh"];
  const vals = req.map((s) => o.sites[s]);
  if (!vals.every(validSkinfold)) return null;
  const S = (vals as number[]).reduce((a, b) => a + b, 0);

  const bd = o.sex === "M"
    ? 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * age
    : 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * age;

  return finalize("jp7", densityToBf(bd, conversion), bd, S, conversion);
}

/**
 * US Navy circumference %fat (no calipers). Pure. Measurements in cm.
 * Men need neck + waist; women also need hip. Null on missing/out-of-range inputs or an
 * implausible result (e.g. waist ≤ neck).
 */
export function navyCircumference(o: { sex: Sex; heightCm: number; neckCm: number; waistCm: number; hipCm?: number }): BodyCompResult | null {
  if (!isNum(o.heightCm) || o.heightCm < HEIGHT_MIN || o.heightCm > HEIGHT_MAX) return null;
  if (!validGirth(o.neckCm) || !validGirth(o.waistCm)) return null;

  let bf: number | null = null;
  if (o.sex === "M") {
    const d = o.waistCm - o.neckCm;
    if (d <= 0) return null; // log10 of a non-positive → invalid
    bf = 495 / (1.0324 - 0.19077 * Math.log10(d) + 0.15456 * Math.log10(o.heightCm)) - 450;
  } else {
    if (!validGirth(o.hipCm)) return null; // hip required for the female equation
    const d = o.waistCm + (o.hipCm as number) - o.neckCm;
    if (d <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(d) + 0.22100 * Math.log10(o.heightCm)) - 450;
  }
  // Navy has no density/skinfold-sum step; conversion label is siri by convention (its constant is Siri-derived).
  return finalize("navy", bf, null, null, "siri");
}

/** Add lean/fat mass from a known body mass. Returns the result unchanged (lean/fat null) if mass is unknown. */
export function withLeanMass(r: BodyCompResult, massKg: number | null): BodyCompResult {
  if (!isNum(massKg) || massKg <= 20 || massKg >= 300) return { ...r, leanKg: null, fatKg: null };
  const fat = massKg * (r.bodyFatPct / 100);
  return { ...r, leanKg: r1(massKg - fat), fatKg: r1(fat) };
}

/** Sum whatever skinfold sites are present (for display), or null if none valid. */
export function sumSkinfolds(sites: Skinfolds): number | null {
  const vals = Object.values(sites ?? {}).filter((v): v is number => validSkinfold(v));
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0)) : null;
}
