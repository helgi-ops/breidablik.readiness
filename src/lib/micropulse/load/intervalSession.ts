/**
 * MAS interval-session builder — turns a player's MAS speed ZONES into an actual running HIIT
 * session: reps × work / rest × sets at HIS km/h, with the per-rep distance. A format maps a
 * training goal to a work/rest structure (Buchheit & Laursen 2013 "weapons"); the SPEED comes from
 * the player's MAS zone (via the shared `intervalSpeedsFromMas` — never re-derived here).
 *
 * Descriptive planning aid the coach OWNS and adjusts — a starting template, not a prescription. It
 * never touches the readiness colour, the load target, or the daily decision (same framing as
 * sessionPlan.ts). Pure, no I/O; returns null (never a fabricated speed) when MAS is missing.
 *
 * Cite: Buchheit & Laursen 2013 (Science and Application of HIIT — format weapons + %MAS zones);
 * Buchheit 2008 (30-15 IFT / %VIFT). Same zones as periodization/index.ts.
 */

import type { Bi } from "./peakPeriod";
import { intervalSpeedsFromMas } from "@/lib/micropulse/periodization";

export type HiitFormatId = "long" | "short" | "threshold" | "rsa" | "recovery";
export type MasConfidence = "high" | "moderate" | "low";

export interface HiitFormatDef {
  id: HiitFormatId; label: Bi; goal: Bi; zoneType: number;
  workSec: number; restSec: number; reps: number; sets: number; restBetweenSetsSec?: number;
  codNote?: boolean; nearMax?: boolean; continuous?: boolean; cite: string;
}

export interface IntervalPrescription {
  format: HiitFormatId; label: Bi; goal: Bi;
  masKmh: number; pctMas: number; speedKmh: number; speedMs: number;
  workSec: number; restSec: number; reps: number; sets: number; restBetweenSetsSec: number | null;
  repDistanceM: number | null; totalWorkMin: number; totalSessionMin: number; sessionDistanceM: number | null;
  note: Bi; confidence: MasConfidence; cite: string;
}

const CITE = "Buchheit & Laursen 2013 (Science and Application of HIIT); Buchheit 2008 (30-15 IFT)";

// The format weapons — editable starting defaults (the coach adjusts reps/rest to the block).
export const HIIT_FORMATS: Record<HiitFormatId, HiitFormatDef> = {
  long: {
    id: "long", zoneType: 4, workSec: 240, restSec: 150, reps: 4, sets: 1, cite: CITE,
    label: { en: "Long intervals", is: "Löng intervöl" },
    goal: { en: "VO₂max / aerobic power", is: "VO₂max / loftháð afl" },
  },
  short: {
    id: "short", zoneType: 4, workSec: 15, restSec: 15, reps: 15, sets: 2, restBetweenSetsSec: 180, codNote: true, cite: CITE,
    label: { en: "Short intervals (15-15)", is: "Stutt intervöl (15-15)" },
    goal: { en: "VO₂max at a lower mechanical load", is: "VO₂max með minna vélrænu álagi" },
  },
  threshold: {
    id: "threshold", zoneType: 3, workSec: 300, restSec: 75, reps: 3, sets: 1, cite: CITE,
    label: { en: "Threshold / tempo", is: "Þröskuldur / tempó" },
    goal: { en: "Extensive aerobic (tempo)", is: "Almennt loftháð þol (tempó)" },
  },
  rsa: {
    id: "rsa", zoneType: 5, workSec: 6, restSec: 20, reps: 7, sets: 2, restBetweenSetsSec: 240, codNote: true, nearMax: true, cite: CITE,
    label: { en: "Repeated-sprint (RSA)", is: "Endurteknir sprettir (RSA)" },
    goal: { en: "Speed endurance / repeated-sprint ability", is: "Hraðaþol / endurtekin sprettgeta" },
  },
  recovery: {
    id: "recovery", zoneType: 1, workSec: 1800, restSec: 0, reps: 1, sets: 1, continuous: true, cite: CITE,
    label: { en: "Aerobic / recovery run", is: "Loftháð / endurheimtar-hlaup" },
    goal: { en: "Recovery / aerobic base", is: "Endurheimt / loftháður grunnur" },
  },
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r1 = (n: number) => Math.round(n * 10) / 10;
const pos = (v: number | undefined, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

/**
 * Build a per-player interval session for one format. Pure.
 * Speed comes only from `intervalSpeedsFromMas` at the format's zoneType. Returns null when MAS is
 * missing (the caller shows "record a MAS test first" — never a fabricated speed).
 */
export function buildIntervalSession(opts: {
  masKmh: number | null;
  masConfidence?: MasConfidence;
  format: HiitFormatId;
  overrides?: Partial<Pick<HiitFormatDef, "workSec" | "restSec" | "reps" | "sets">>;
}): IntervalPrescription | null {
  const mas = num(opts.masKmh);
  if (mas === null || mas <= 0) return null;

  const def = HIIT_FORMATS[opts.format];
  if (!def) return null;

  const zone = intervalSpeedsFromMas(mas).find((z) => z.type === def.zoneType);
  const speedKmh = zone?.kmh ?? null;
  const pctMas = zone?.pctMas ?? 0;
  if (speedKmh === null) return null; // guard (mas present → won't happen, but never fabricate)

  const workSec = pos(opts.overrides?.workSec, def.workSec);
  const restSec = def.continuous ? 0 : Math.max(0, opts.overrides?.restSec ?? def.restSec);
  const reps = Math.round(pos(opts.overrides?.reps, def.reps));
  const sets = Math.round(pos(opts.overrides?.sets, def.sets));
  const restBetweenSetsSec = def.restBetweenSetsSec ?? null;

  const speedMs = speedKmh / 3.6;
  const repDistanceM = Math.round(speedMs * workSec);
  const totalWorkMin = r1((workSec * reps * sets) / 60);
  const totalSessionMin = r1(((workSec + restSec) * reps * sets + (restBetweenSetsSec ?? 0) * Math.max(0, sets - 1)) / 60);
  const sessionDistanceM = repDistanceM * reps * sets;

  // Honest note: template, coach-owned, speed only as good as the MAS test. COD / near-max caveats.
  const codEn = def.codNote ? " With change-of-direction (shuttles), the effective speed is ~5–10% lower — shorten the distance rather than expecting the flat speed." : "";
  const codIs = def.codNote ? " Með stefnubreytingum (shuttle) er raunhraðinn ~5–10% lægri — styttu vegalengdina frekar en að ætlast til flata hraðans." : "";
  const nmEn = def.nearMax ? " Sprint reps are run near-maximal — the km/h shown is an indicative floor, not a cap." : "";
  const nmIs = def.nearMax ? " Sprettir eru nálægt hámarki — km/klst sem sýnt er er viðmiðunar-lágmark, ekki þak." : "";
  const note: Bi = {
    en: `Starting template (Buchheit & Laursen 2013) — the coach adjusts reps/rest to the block. Speeds are only as accurate as the MAS test; run it as time or as the marked distance on the pitch.${codEn}${nmEn} Descriptive planning aid — it never sets the readiness colour or the daily plan.`,
    is: `Byrjunar-sniðmát (Buchheit & Laursen 2013) — þjálfari stillir endurtekningar/hvíld eftir blokkinni. Hraðar eru aðeins jafn nákvæmir og MAS-prófið; keyrðu sem tíma eða mælda vegalengd á vellinum.${codIs}${nmIs} Lýsandi skipulags-hjálp — hún setur aldrei readiness-litinn eða dagsáætlunina.`,
  };

  return {
    format: def.id, label: def.label, goal: def.goal,
    masKmh: r1(mas), pctMas, speedKmh, speedMs: r1(speedMs),
    workSec, restSec, reps, sets, restBetweenSetsSec,
    repDistanceM, totalWorkMin, totalSessionMin, sessionDistanceM,
    note, confidence: opts.masConfidence ?? "moderate", cite: def.cite,
  };
}
