/**
 * Expected post-match recovery curve — the "capacity-back" curve the research says a player SHOULD
 * follow after a match, sex-specific and scaled to the match dose. The board already shows the OBSERVED
 * rebound (canonical colour + process reads); this is the EXPECTED line to compare against, so a flag at
 * MD+2 reads as lagging behind his expected curve — or, on a women's squad, as exactly on the expected
 * (later) curve.
 *
 * Post-match fatigue is not one clock: neuromuscular, biochemical (muscle damage), perceptual and
 * autonomic systems recover on different timelines, and the female clock differs from the male one
 * (later neuromuscular trough, longer biochemical tail). This is a lookup/rules model — NOT AI. Every
 * template value carries a paper citation. Pure, deterministic, null-safe. Display-only: it never writes
 * or influences readiness_entries.color / v_coach_readiness_today_v8 / athlete_decision_history /
 * stage4_decisions.
 *
 * Citations:
 *   Goulart 2022 (Sports Med Open 8:72) — female-soccer fatigue/recovery meta: CMJ trough 12–24h,
 *     sprint down 48h, CK/LDH persist to 72h, perceptual at 12h.
 *   Nédélec 2012 — recovery kinetics / rebound by MD+2–MD+3.
 *   Brownstein/Thomas 2017 (Front Physiol 8:831) — neuromuscular fatigue after soccer (central +
 *     peripheral, ~48–72h).
 *   Doeven 2018 (BMJ Open SEM) — CK elevated 24–72h in team ball sports.
 *   McBurnie 2022 — high-intensity decelerations → muscle damage (the dose).
 */

import type { Bi } from "@/lib/recovery/processReads";
import { isNightMatch } from "@/lib/recovery/nightMatch";

export type Sex = "male" | "female" | "unknown";
export type ProcessKey = "neuromuscular" | "biochemical" | "perceptual" | "autonomic";
export type Dose = "low" | "moderate" | "high";

/** One expected point on one process's recovery clock. */
export interface ExpectedPoint {
  hoursPost: number;              // 0 (immediate), 12, 24, 48, 72
  mdOffset: number | null;        // MD+1 / MD+2 / MD+3 mapped from hoursPost + kickoff
  pctCapacityBack: number;        // 0–100 — modelled "% of capacity back" at this point
}
export interface ProcessCurve {
  process: ProcessKey;
  points: ExpectedPoint[];
  troughHours: number;            // where the low point sits (male ~24 NM, female later)
  fullByHours: number | null;     // modelled return-to-~100% (null = still recovering at 72h, e.g. female CK)
  why: Bi;                        // plain-language, sex-aware
}
export interface RecoveryCurve {
  sex: Sex;
  templateLabel: Bi;
  dose: Dose;
  curves: ProcessCurve[];
  confidence: "high" | "moderate" | "low";
  caveat: Bi;
}

// ─── Templates ───────────────────────────────────────────────────────────────
// Each template is a per-process series of {hoursPost, basePct} at MODERATE dose. basePct = modelled
// "% of capacity back" from the effect sizes in the cited papers (a larger dip ⇒ lower pct). Dose scales
// the DEPTH of the dip (see applyDose). No magic numbers — every row is anchored to a citation.

type TemplateRow = { hoursPost: number; basePct: number };
interface SexTemplate {
  label: Bi;
  neuromuscular: { rows: TemplateRow[]; troughHours: number; fullByHours: number | null; why: Bi };
  biochemical:   { rows: TemplateRow[]; troughHours: number; fullByHours: number | null; why: Bi };
  perceptual:    { rows: TemplateRow[]; troughHours: number; fullByHours: number | null; why: Bi };
  autonomic:     { rows: TemplateRow[]; troughHours: number; fullByHours: number | null; why: Bi };
}

const MALE: SexTemplate = {
  label: { en: "male template (Nédélec 2012 · Brownstein 2017)", is: "karla-viðmið (Nédélec 2012 · Brownstein 2017)" },
  // NM trough ~MD+1 (24h), largely back by MD+2–MD+3 (Nédélec 2012; Brownstein 2017 central+peripheral ~48–72h).
  neuromuscular: {
    rows: [{ hoursPost: 0, basePct: 78 }, { hoursPost: 12, basePct: 72 }, { hoursPost: 24, basePct: 70 }, { hoursPost: 48, basePct: 88 }, { hoursPost: 72, basePct: 98 }],
    troughHours: 24, fullByHours: 72,
    why: { en: "Men's jump/sprint power troughs around MD+1 and is largely back by MD+2–MD+3.", is: "Stökk-/spretthraði karla er lægstur um MD+1 og að mestu kominn til baka við MD+2–MD+3." },
  },
  // CK/LDH peak ~24h, elevated 24–72h (Doeven 2018) — back toward normal by ~72h in men.
  biochemical: {
    rows: [{ hoursPost: 0, basePct: 82 }, { hoursPost: 12, basePct: 66 }, { hoursPost: 24, basePct: 58 }, { hoursPost: 48, basePct: 76 }, { hoursPost: 72, basePct: 92 }],
    troughHours: 24, fullByHours: 72,
    why: { en: "Muscle-damage markers (CK) peak ~24h and settle by ~72h in men.", is: "Vöðvaskemmda-mælar (CK) toppa ~24 klst og jafna sig við ~72 klst hjá körlum." },
  },
  // Perceptual: soreness/fatigue up immediately + 24h, usually resolved by MD+2 (Nédélec 2012).
  perceptual: {
    rows: [{ hoursPost: 0, basePct: 60 }, { hoursPost: 12, basePct: 64 }, { hoursPost: 24, basePct: 74 }, { hoursPost: 48, basePct: 92 }, { hoursPost: 72, basePct: 99 }],
    troughHours: 0, fullByHours: 48,
    why: { en: "Soreness/fatigue is worst right after the match and usually clears by MD+2.", is: "Harðsperrur/þreyta eru verstar strax eftir leik og hverfa yfirleitt við MD+2." },
  },
  // Autonomic HRV/RHR depressed post-match, back over ~24–48h.
  autonomic: {
    rows: [{ hoursPost: 0, basePct: 66 }, { hoursPost: 12, basePct: 72 }, { hoursPost: 24, basePct: 84 }, { hoursPost: 48, basePct: 96 }, { hoursPost: 72, basePct: 100 }],
    troughHours: 0, fullByHours: 48,
    why: { en: "Heart-rate variability recovers over ~24–48h (later after a night match).", is: "Hjartsláttarbreytileiki jafnar sig á ~24–48 klst (seinna eftir kvöldleik)." },
  },
};

const FEMALE: SexTemplate = {
  label: { en: "female template (Goulart 2022)", is: "kvenna-viðmið (Goulart 2022)" },
  // Female CMJ dip is DELAYED: negligible immediately (ES ≈ −0.04), present at 12h (ES ≈ −0.38) and 24h
  // (ES ≈ −0.42); sprint down at 48h (ES ≈ −0.75). Trough sits at 12–24h → a MD+1 flag is ON-curve.
  neuromuscular: {
    rows: [{ hoursPost: 0, basePct: 96 }, { hoursPost: 12, basePct: 74 }, { hoursPost: 24, basePct: 70 }, { hoursPost: 48, basePct: 74 }, { hoursPost: 72, basePct: 90 }],
    troughHours: 20, fullByHours: null,
    why: { en: "Women's jump-power dip comes LATER — around 12–24h, not right after the match — so a morning-after (MD+1) flag is expected, not alarming; sprint is still down at 48h.", is: "Stökkkrafts-dýfa kvenna kemur SEINNA — um 12–24 klst, ekki strax eftir leik — svo flögg morguninn eftir (MD+1) eru væntanleg, ekki áhyggjuefni; sprettur er enn niðri við 48 klst." },
  },
  // CK ES ≈ 3.79, LDH ES ≈ 7.46 STILL elevated at 72h (Goulart 2022) — the long tail.
  biochemical: {
    rows: [{ hoursPost: 0, basePct: 80 }, { hoursPost: 12, basePct: 62 }, { hoursPost: 24, basePct: 54 }, { hoursPost: 48, basePct: 58 }, { hoursPost: 72, basePct: 66 }],
    troughHours: 24, fullByHours: null,
    why: { en: "Muscle-damage markers (CK/LDH) stay elevated to 72h in women — the long tail behind a normal-looking colour.", is: "Vöðvaskemmda-mælar (CK/LDH) haldast hækkaðir í 72 klst hjá konum — langi halinn á bak við eðlilegan lit." },
  },
  // Perceptual: fatigue up / vigor down at 12h, soreness up immediately + 24h (Goulart 2022).
  perceptual: {
    rows: [{ hoursPost: 0, basePct: 62 }, { hoursPost: 12, basePct: 60 }, { hoursPost: 24, basePct: 70 }, { hoursPost: 48, basePct: 88 }, { hoursPost: 72, basePct: 97 }],
    troughHours: 12, fullByHours: 72,
    why: { en: "Fatigue peaks around 12h and soreness stays up through 24h before easing.", is: "Þreyta toppar um 12 klst og harðsperrur haldast fram að 24 klst áður en þær minnka." },
  },
  // Autonomic — comparable ~24–48h return (limited female-specific data → pooled with team-sport norms).
  autonomic: {
    rows: [{ hoursPost: 0, basePct: 68 }, { hoursPost: 12, basePct: 74 }, { hoursPost: 24, basePct: 86 }, { hoursPost: 48, basePct: 96 }, { hoursPost: 72, basePct: 100 }],
    troughHours: 0, fullByHours: 48,
    why: { en: "Autonomic (HRV) recovers over ~24–48h (limited female-specific data).", is: "Sjálfvirka taugakerfið (HRV) jafnar sig á ~24–48 klst (takmörkuð kvenna-gögn)." },
  },
};

// Pooled = the average of the two, for a mixed/unknown squad. Labelled as a general template.
function pooledTemplate(): SexTemplate {
  const avgRows = (a: TemplateRow[], b: TemplateRow[]): TemplateRow[] =>
    a.map((r, i) => ({ hoursPost: r.hoursPost, basePct: Math.round((r.basePct + b[i].basePct) / 2) }));
  const proc = (k: Exclude<keyof SexTemplate, "label">) => ({
    rows: avgRows(MALE[k].rows, FEMALE[k].rows),
    troughHours: Math.round((MALE[k].troughHours + FEMALE[k].troughHours) / 2),
    fullByHours: MALE[k].fullByHours == null || FEMALE[k].fullByHours == null ? null : Math.max(MALE[k].fullByHours!, FEMALE[k].fullByHours!),
    why: {
      en: "General team-sport template (squad sex not set) — pooled male/female recovery kinetics.",
      is: "Almennt hópíþrótta-viðmið (kyn liðs ekki stillt) — samsett karla/kvenna endurheimt.",
    } as Bi,
  });
  return {
    label: { en: "general team-sport template (squad sex not set)", is: "almennt hópíþrótta-viðmið (kyn liðs ekki stillt)" },
    neuromuscular: proc("neuromuscular"),
    biochemical: proc("biochemical"),
    perceptual: proc("perceptual"),
    autonomic: proc("autonomic"),
  };
}

const templateFor = (sex: Sex): SexTemplate => (sex === "male" ? MALE : sex === "female" ? FEMALE : pooledTemplate());

// ─── Dose ────────────────────────────────────────────────────────────────────
// The board's weighted IMA "dose" (decel 1.0, accel 0.6, cod 0.4, jumps 0.3) + minutes scale the DEPTH
// of the dip and the LENGTH of the tail (McBurnie 2022: more hard decel ⇒ more muscle damage). Thresholds
// are screening bands, not norms.
export function classifyDose(matchImaDose: number | null, minutes: number | null): Dose {
  if (matchImaDose == null && minutes == null) return "moderate"; // no dose → template's moderate curve
  const d = matchImaDose ?? 0;
  const m = minutes ?? 0;
  // A full 90' with a heavy decel load is "high"; a cameo with little load is "low".
  const heavy = d >= 220 || (d >= 160 && m >= 75);
  const light = (d > 0 && d < 90) || (m > 0 && m < 30);
  if (heavy) return "high";
  if (light) return "low";
  return "moderate";
}

/** Deeper dip + longer tail at higher dose. gain scales how far each point's DEFICIT (100−pct) moves. */
function applyDose(pct: number, dose: Dose): number {
  const gain = dose === "high" ? 1.3 : dose === "low" ? 0.65 : 1;
  const deficit = Math.max(0, 100 - pct) * gain;
  return Math.round(Math.max(0, Math.min(100, 100 - deficit)));
}

// Map hoursPost → MD offset given the kickoff. A day match (afternoon) → 12h ≈ MD+1 morning; a night
// match pushes the clock ~½ day later, so 12h still reads as MD+1 but the autonomic/sleep points lag.
function mdOffsetFor(hoursPost: number, night: boolean): number | null {
  if (hoursPost <= 0) return 0;
  const shifted = night ? hoursPost - 6 : hoursPost; // night match: the first morning is "later" into recovery
  if (shifted <= 18) return 1;
  if (shifted <= 42) return 2;
  if (shifted <= 66) return 3;
  return 4;
}

export function buildExpectedRecoveryCurve(opts: {
  sex: Sex;
  matchImaDose: number | null;
  minutes: number | null;
  /** Pre-classified dose (e.g. the board's IMA "tier") — wins over matchImaDose/minutes when given. */
  doseOverride?: Dose | null;
  kickoffTime?: string | null;
  baselineMaturityDays?: number | null;
}): RecoveryCurve {
  const tpl = templateFor(opts.sex);
  const dose = opts.doseOverride ?? classifyDose(opts.matchImaDose, opts.minutes);
  const night = isNightMatch(opts.kickoffTime ?? null);

  const build = (k: Exclude<keyof SexTemplate, "label">): ProcessCurve => {
    const t = tpl[k];
    const points: ExpectedPoint[] = t.rows.map((r) => ({
      hoursPost: r.hoursPost,
      mdOffset: mdOffsetFor(r.hoursPost, night),
      pctCapacityBack: applyDose(r.basePct, dose),
    }));
    // A high dose lengthens the tail: a curve that would return by 72h no longer fully does.
    const fullByHours = t.fullByHours != null && dose === "high" && t.fullByHours >= 72 ? null : t.fullByHours;
    return { process: k, points, troughHours: t.troughHours, fullByHours, why: t.why };
  };

  // Confidence: baseline maturity (how established his personal norms are) is the main driver.
  const bl = opts.baselineMaturityDays ?? null;
  const confidence: RecoveryCurve["confidence"] =
    bl == null ? "low" : bl >= 42 ? "high" : bl >= 21 ? "moderate" : "low";

  return {
    sex: opts.sex,
    templateLabel: tpl.label,
    dose,
    curves: [build("neuromuscular"), build("biochemical"), build("perceptual"), build("autonomic")],
    confidence,
    caveat: {
      en: "Expected model from the research, not a measurement — compare it to the observed rebound. It never changes the readiness colour or the day's decision.",
      is: "Væntanlegt líkan úr rannsóknum, ekki mæling — berðu það saman við raun-endurheimtina. Það breytir aldrei readiness-litnum eða ákvörðun dagsins.",
    },
  };
}

// ─── Observed vs expected ──────────────────────────────────────────────────────

export type Tracking = "ahead" | "on_track" | "behind" | "no_data";
export interface CurveComparison {
  process: ProcessKey;
  hoursPost: number;
  expectedPct: number;
  observedStatus: "recovered" | "lagging" | "no_data";
  tracking: Tracking;
  note: Bi;
}

/** Nearest expected point (by hoursPost) for a process. */
function pointAt(curve: ProcessCurve, hoursPost: number): ExpectedPoint | null {
  if (!curve.points.length) return null;
  return curve.points.reduce((best, p) => (Math.abs(p.hoursPost - hoursPost) < Math.abs(best.hoursPost - hoursPost) ? p : best));
}

/**
 * Turn observed process statuses into ahead|on_track|behind against the sex-specific expected point.
 * The whole value: a "lagging" neuromuscular read at 24h is `behind` on a male curve but `on_track` on
 * the female curve (whose trough sits there). A high expected deficit means "lagging" is expected.
 */
export function compareToExpected(
  curve: RecoveryCurve,
  observed: Array<{ process: ProcessKey; hoursPost: number; status: "recovered" | "lagging" | "no_data" }>,
): CurveComparison[] {
  return observed.map((o) => {
    const c = curve.curves.find((x) => x.process === o.process);
    const pt = c ? pointAt(c, o.hoursPost) : null;
    const expectedPct = pt?.pctCapacityBack ?? 100;
    // "Expected to be down" when the modelled capacity-back is meaningfully below full at this point.
    const expectedDown = expectedPct < 80;

    let tracking: Tracking;
    let note: Bi;
    if (o.status === "no_data") {
      tracking = "no_data";
      note = o.process === "biochemical"
        ? { en: "No direct marker — biochemical damage is the invisible tail; watch the expected line.", is: "Enginn beinn mælir — lífefna-skemmd er ósýnilegi halinn; fylgstu með væntanlegu línunni." }
        : { en: "No reading at this timepoint.", is: "Engin mæling á þessum tímapunkti." };
    } else if (o.status === "recovered") {
      tracking = expectedDown ? "ahead" : "on_track";
      note = expectedDown
        ? { en: "Recovered already — ahead of the expected dip at this point.", is: "Þegar endurheimt — á undan væntanlegu dýfunni á þessum tíma." }
        : { en: "Recovered — on his expected curve.", is: "Endurheimt — á væntanlegu kúrfunni hans." };
    } else {
      // status === "lagging"
      tracking = expectedDown ? "on_track" : "behind";
      note = expectedDown
        ? { en: `Flagged — but this is the expected trough for ${curve.sex === "female" ? "women" : curve.sex === "male" ? "men" : "the squad"} at this point, so on-curve.`, is: `Flaggað — en þetta er væntanlega dýfan fyrir ${curve.sex === "female" ? "konur" : curve.sex === "male" ? "karla" : "liðið"} á þessum tíma, svo á kúrfu.` }
        : { en: "Behind expected — taking longer than the match should have cost. Worth a look.", is: "Á eftir áætlun — lengur en leikurinn hefði átt að kosta. Þess virði að skoða." };
    }
    return { process: o.process, hoursPost: o.hoursPost, expectedPct, observedStatus: o.status, tracking, note };
  });
}
