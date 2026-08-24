/**
 * Robustness watch — the labelled injury early-warning SURFACE (fusion #5).
 *
 * The research is decisive: at ~25-player scale a black-box injury classifier
 * over-flags (Haller 2023: recall 25%, precision 11%, kappa 0.14; Leckey 2024:
 * clinical relevance "questionable"). So this NEVER ships a single injury
 * probability. It surfaces the SIGNALS — personal-norm, cited, confidence-rated,
 * each with a counterfactual — as a labelled trend read that sits NEXT TO the
 * readiness colour and never becomes it.
 *
 * Pure combiner. Composes what already exists:
 *   - the additive cited rule engine (`injuryRisk`) decides the LEVEL,
 *   - the explainable `signalPack` supplies the ranked "why" contributors,
 *   - `cmjFatigue` supplies the neuromuscular slope + fatigue TYPE,
 *   - `playerTrendForecast` supplies the forward trajectory direction,
 *   - the new mechanical personal-z signals (running asymmetry / footstrike /
 *     RHIE) become contributors in the SAME shape.
 *
 * `level` is WORDS ("steady" / "watch" / "elevated"), never a colour and never a
 * training decision. It is never written to readiness_entries / final_color.
 * Rules decide; these signals only explain.
 */

import {
  coverageConfidence,
  type Bi,
  type SigConfidence,
  type SignalContributor,
  type SignalPack,
} from "@/lib/micropulse/signalPack";
import type { InjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import type { CmjFatigueRead, FatigueType } from "@/lib/micropulse/cmjFatigue";
import type { TrendDirection } from "@/lib/micropulse/playerTrendForecast";

export type RobustnessLevel = "steady" | "watch" | "elevated";

export interface RobustnessMechanicalInput {
  /** Running bilateral-asymmetry personal z (positive = more asymmetric than norm). */
  runningAsymmetryZ: number | null;
  /** Raw asymmetry % for provenance. */
  runningAsymmetryPct: number | null;
  /** Footstrike-volume personal z (positive = spike). */
  footstrikesZ: number | null;
  /** RHIE-bout personal z (positive = clustered-effort spike). */
  rhieBoutsZ: number | null;
  /** Whether an ACWR/HSR volume flag is already active (RHIE is a modifier only). */
  hasLoadSpike: boolean;
}

export interface RobustnessWatchInput {
  asOf: string;
  playerId: string;
  playerName: string;
  /** The explainability spine — already-ranked contributors. */
  signalPack: SignalPack;
  /** The additive rule engine's decision (drives the level). */
  injury: InjuryRiskDecision;
  /** CMJ fatigue read (slope + type + recovery deficit). Null when no CMJ data. */
  cmj: CmjFatigueRead | null;
  /** Forward trajectory direction (z-trend). */
  trend: TrendDirection;
  /** New mechanical personal-z signals (null until the Catapult re-sync lands). */
  mechanical: RobustnessMechanicalInput;
  /** Coverage for confidence gating. */
  coverage: { loadDays: number; cmjTests: number };
}

export interface RobustnessWatch {
  level: RobustnessLevel;
  /** One-sentence bilingual verdict — the ~5s glance. */
  verdict: Bi;
  /** Ranked contributors (flagged first, then severity). The plain "why". */
  contributors: SignalContributor[];
  /** The top flagged contributor's counterfactual, or null when steady. */
  counterfactual: Bi | null;
  /** Signal coverage + baseline maturity. Thin data softens the language. */
  confidence: SigConfidence;
  /** Where the neuromuscular fatigue sits, when the CMJ reads down. */
  fatigueType: FatigueType | null;
  /** Forward trajectory direction. */
  trend: TrendDirection;
  citations: string;
  asOf: string;
  /** Provenance: which #5 inputs were present vs missing (feed honesty). */
  presentInputs: string[];
  missingInputs: string[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ROBUSTNESS_CITATION =
  "Gabbett 2017 · Majumdar 2022 · McBurnie 2022 · Saberisani 2025 · Hader 2019 · Neyroud 2016 · Hulin 2014";

// ── New #5 contributors, in the signalPack SignalContributor shape ──────────

/** Running bilateral asymmetry rising above the player's own norm. */
function runningAsymmetryContributor(z: number | null, pct: number | null): SignalContributor | null {
  if (z == null || !Number.isFinite(z)) return null;
  const flagged = z >= 1.5;
  const severity = clamp01((z - 0.5) / 2); // +0.5σ->0, +2.5σ->1
  const pctStr = pct != null ? `${Math.round(pct)}%` : null;
  return {
    key: "running_asymmetry",
    label: { en: "Running asymmetry", is: "Hlaupa-ósamhverfa" },
    why: flagged
      ? { en: `His left/right running is more lopsided than his usual${pctStr ? ` (${pctStr})` : ""}.`, is: `Vinstri/hægri hlaup hans er ójafnara en venjulega${pctStr ? ` (${pctStr})` : ""}.` }
      : { en: `His left/right running balance is around his usual.`, is: `Vinstri/hægri jafnvægi í hlaupi er um hans venju.` },
    counterfactual: flagged
      ? { en: `If his running asymmetry were back within ~1σ of his norm → this clears.`, is: `Ef hlaupa-ósamhverfan væri aftur innan ~1σ af hans venju → þetta hreinsast.` }
      : null,
    citation: "Bishop 2021 · Buchheit 2024",
    confidence: "moderate",
    severity, flagged,
    detail: {
      en: `Running asymmetry z ${z.toFixed(1)} vs his own norm${pctStr ? ` (${pctStr})` : ""}. Flag >= +1.5σ. Own-norm; bilateral running asymmetry as an early tissue-overload signal.`,
      is: `Hlaupa-ósamhverfa z ${z.toFixed(1)} vs eigin venja${pctStr ? ` (${pctStr})` : ""}. Flagg >= +1.5σ. Eigin-norm; ósamhverfa sem snemmbúið álagsmerki.`,
    },
  };
}

/** Footstrike-volume spike — supporting impact-load signal. */
function footstrikeContributor(z: number | null): SignalContributor | null {
  if (z == null || !Number.isFinite(z)) return null;
  const flagged = z >= 2.0;
  const severity = clamp01((z - 1) / 2);
  return {
    key: "footstrike_volume",
    label: { en: "Impact volume", is: "Höggálag" },
    why: flagged
      ? { en: `His footstrike (impact) volume has spiked above his usual.`, is: `Höggálag (fótstig) hans hefur rokið upp yfir venju.` }
      : { en: `His footstrike volume is around his usual.`, is: `Höggálag hans er um hans venju.` },
    counterfactual: flagged
      ? { en: `If his footstrike volume returned to his norm → this clears.`, is: `Ef höggálag hans færi aftur á venju → þetta hreinsast.` }
      : null,
    citation: "Verheul 2020",
    confidence: "moderate",
    severity, flagged,
    detail: {
      en: `Footstrike volume z ${z.toFixed(1)} vs his own norm. Flag >= +2σ (supporting signal, not a headline).`,
      is: `Höggálag z ${z.toFixed(1)} vs eigin venja. Flagg >= +2σ (stuðningsmerki, ekki aðalmerki).`,
    },
  };
}

/** RHIE (repeated-sprint) load-shape spike — a modifier alongside a volume flag. */
function rhieContributor(z: number | null, hasLoadSpike: boolean): SignalContributor | null {
  if (z == null || !Number.isFinite(z)) return null;
  const flagged = z >= 1.5;
  const severity = clamp01((z - 0.5) / 2) * (hasLoadSpike ? 1 : 0.6);
  return {
    key: "rhie_shape",
    label: { en: "Repeated-sprint load", is: "Endurtekið sprettaálag" },
    why: flagged
      ? { en: `His high-intensity efforts are clustered into more repeated bursts than usual${hasLoadSpike ? ", on top of a rising volume" : ""}.`, is: `Háákafa átök hans eru þéttari í endurteknum lotum en venjulega${hasLoadSpike ? ", ofan á vaxandi magn" : ""}.` }
      : { en: `His repeated-sprint pattern is around his usual.`, is: `Endurtekið sprettamynstur hans er um hans venju.` },
    counterfactual: flagged
      ? { en: `If his repeated-sprint bouts were back to his norm → this clears.`, is: `Ef endurteknar sprettalotur væru aftur á venju → þetta hreinsast.` }
      : null,
    citation: "Spencer 2004 · Buchheit 2010",
    confidence: "moderate",
    severity, flagged,
    detail: {
      en: `RHIE bouts z ${z.toFixed(1)} vs his own norm. Flag >= +1.5σ. A load-SHAPE modifier — it complements the ACWR volume signal, never stands alone.`,
      is: `RHIE lotur z ${z.toFixed(1)} vs eigin venja. Flagg >= +1.5σ. Álags-FORM breyta — bætir við ACWR magnmerkið, stendur aldrei ein.`,
    },
  };
}

/** CMJ multi-day fatigue trend + fatigue TYPE — the neuromuscular contributor. */
function cmjTrendContributor(cmj: CmjFatigueRead | null): SignalContributor | null {
  if (!cmj || cmj.cmjSlopeZ == null || !Number.isFinite(cmj.cmjSlopeZ)) return null;
  const z = cmj.cmjSlopeZ;
  const flagged = z <= -1.0;
  const severity = clamp01((-z - 0.5) / 2);
  const typeEn = cmj.fatigueType === "central" ? " — looks central (sleep/stress)"
    : cmj.fatigueType === "peripheral" ? " — looks muscular/metabolic"
    : cmj.fatigueType === "mixed" ? " — mixed muscular + central" : "";
  const typeIs = cmj.fatigueType === "central" ? " — lítur miðlægt út (svefn/streita)"
    : cmj.fatigueType === "peripheral" ? " — lítur vöðva/efnaskipta út"
    : cmj.fatigueType === "mixed" ? " — blandað vöðva + miðlægt" : "";
  return {
    key: "cmj_trend",
    label: { en: "Jump trend", is: "Stökk-þróun" },
    why: flagged
      ? { en: `His jump is trending down over several days${typeEn}.`, is: `Stökk hans er á niðurleið yfir nokkra daga${typeIs}.` }
      : { en: `His jump trend is steady vs his own norm.`, is: `Stökk-þróun hans er stöðug vs eigin venju.` },
    counterfactual: flagged
      ? { en: `If his jump returned to a steady multi-day trend → this clears.`, is: `Ef stökk hans færi aftur í stöðuga þróun milli daga → þetta hreinsast.` }
      : null,
    citation: "Neyroud 2016 · Carroll 2017",
    confidence: cmj.confidence,
    severity, flagged,
    detail: {
      en: `CMJ multi-day slope ${z.toFixed(1)} personal SD across the window${cmj.fatigueType ? `; likely ${cmj.fatigueType} fatigue` : ""}. Flag <= -1σ. Reads the trend, not today's value (Neyroud 2016).`,
      is: `CMJ þróun ${z.toFixed(1)} eigin SD yfir tímabilið${cmj.fatigueType ? `; líklega ${cmj.fatigueType} þreyta` : ""}. Flagg <= -1σ. Les þróunina, ekki gildi dagsins (Neyroud 2016).`,
    },
  };
}

/** CMJ post-match recovery deficit vs the HSR-personalised expected curve. */
function cmjRecoveryContributor(cmj: CmjFatigueRead | null): SignalContributor | null {
  if (!cmj || cmj.cmjRecoveryDeficit == null || !Number.isFinite(cmj.cmjRecoveryDeficit)) return null;
  const d = cmj.cmjRecoveryDeficit;
  const flagged = d >= 0.05;
  const severity = clamp01(d / 0.2); // 20 pts behind = max
  return {
    key: "cmj_recovery",
    label: { en: "Post-match recovery", is: "Endurheimt eftir leik" },
    why: flagged
      ? { en: `His jump is recovering below the level expected for the last match's high-speed load.`, is: `Stökk hans endurheimtist undir því sem vænst er miðað við háhraðaálag síðasta leiks.` }
      : { en: `His jump recovery is on track for the last match's load.`, is: `Endurheimt stökks er á áætlun miðað við álag síðasta leiks.` },
    counterfactual: flagged
      ? { en: `If his jump recovered to the expected level for this match's HSR → this clears.`, is: `Ef stökk hans næði væntu stigi miðað við háhraða leiksins → þetta hreinsast.` }
      : null,
    citation: "Hader 2019 · Silva 2018",
    confidence: cmj.confidence,
    severity, flagged,
    detail: {
      en: `Recovery deficit ${Math.round(d * 100)}% of baseline below the expected curve. Flag >= 5% (elevated) / 10% (high). Expected dip scaled by match HSR (Hader 2019).`,
      is: `Endurheimtar-halli ${Math.round(d * 100)}% af grunnlínu undir væntri feril. Flagg >= 5% (hækkað) / 10% (hátt). Vænt lækkun skölluð eftir háhraða leiks (Hader 2019).`,
    },
  };
}

/** Map the additive rule level to words, capping "elevated" when confidence is low. */
function toLevel(injuryLevel: InjuryRiskDecision["injuryRiskLevel"], confidence: SigConfidence): RobustnessLevel {
  const raw: RobustnessLevel = injuryLevel === "HIGH" ? "elevated" : injuryLevel === "MODERATE" ? "watch" : "steady";
  // Thin baselines / missing feeds never produce a hard "elevated".
  if (raw === "elevated" && confidence === "low") return "watch";
  return raw;
}

/** Lower of two SigConfidence levels — the honest floor. */
function minConfidence(a: SigConfidence, b: SigConfidence): SigConfidence {
  const order: SigConfidence[] = ["low", "moderate", "high"];
  return order[Math.min(order.indexOf(a), order.indexOf(b))];
}

/** Map the injury engine's low/medium/high to the SigConfidence vocabulary. */
function injuryConfidence(c: InjuryRiskDecision["confidence"]): SigConfidence {
  return c === "medium" ? "moderate" : c;
}

export function computeRobustnessWatch(input: RobustnessWatchInput): RobustnessWatch {
  // Merge the signalPack contributors with the new #5 contributors, re-rank.
  const extra = [
    runningAsymmetryContributor(input.mechanical.runningAsymmetryZ, input.mechanical.runningAsymmetryPct),
    footstrikeContributor(input.mechanical.footstrikesZ),
    rhieContributor(input.mechanical.rhieBoutsZ, input.mechanical.hasLoadSpike),
    cmjTrendContributor(input.cmj),
    cmjRecoveryContributor(input.cmj),
  ].filter((c): c is SignalContributor => c != null);

  const contributors = [...input.signalPack.contributors, ...extra]
    .sort((a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || b.severity - a.severity);

  // Confidence: the honest floor of load-coverage and the rule engine's own
  // confidence. Thin CMJ coverage can only lower it further.
  let confidence = minConfidence(coverageConfidence(input.coverage.loadDays), injuryConfidence(input.injury.confidence));
  if (input.coverage.cmjTests < 3 && input.coverage.loadDays < 10) confidence = "low";

  const level = toLevel(input.injury.injuryRiskLevel, confidence);

  const flagged = contributors.filter((c) => c.flagged);
  const top = flagged[0] ?? null;
  const extraFlagged = Math.max(0, flagged.length - 1);

  const verdict: Bi = level === "steady"
    ? { en: "Robustness steady.", is: "Robusthed stöðug." }
    : level === "watch"
      ? { en: `Watch: ${top?.label.en ?? "load pattern"} rising.`, is: `Fylgstu með: ${top?.label.is ?? "álagsmynstur"} hækkar.` }
      : { en: `Elevated: ${top?.label.en ?? "load pattern"}${extraFlagged ? ` + ${extraFlagged} more` : ""}.`, is: `Hækkað: ${top?.label.is ?? "álagsmynstur"}${extraFlagged ? ` + ${extraFlagged} til viðbótar` : ""}.` };

  const presentInputs: string[] = [];
  const missingInputs: string[] = [];
  const track = (name: string, present: boolean) => (present ? presentInputs : missingInputs).push(name);
  track("running_asymmetry", input.mechanical.runningAsymmetryZ != null);
  track("footstrikes", input.mechanical.footstrikesZ != null);
  track("rhie", input.mechanical.rhieBoutsZ != null);
  track("cmj_slope", input.cmj?.cmjSlopeZ != null);
  track("cmj_recovery", input.cmj?.cmjRecoveryDeficit != null);

  return {
    level,
    verdict,
    contributors,
    counterfactual: level === "steady" ? null : top?.counterfactual ?? null,
    confidence,
    fatigueType: input.cmj?.cmjFatigued ? input.cmj.fatigueType : null,
    trend: input.trend,
    citations: ROBUSTNESS_CITATION,
    asOf: input.asOf,
    presentInputs,
    missingInputs,
  };
}

export { ROBUSTNESS_CITATION };
