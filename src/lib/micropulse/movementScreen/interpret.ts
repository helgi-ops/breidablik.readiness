/**
 * Movement-screen interpretation engine. Applies a test definition's
 * finding→cause→corrective/strength rules to a coach's recorded findings and
 * returns cited readings with a confidence, plus RTP / asymmetry / red-flag
 * routing. Pure — no DB, no readiness colour.
 *
 * Boundaries (house rules): a movement compensation maps to a TRAINING target,
 * never a diagnosis. Any reported pain / red flag suppresses interpretation and
 * routes to a clinician. Confidence is honest: low-precision variables (RSI /
 * contact time from 30 fps phone video) are capped low even on a good capture.
 */
import type { Bi, MovementTest, Severity, StrengthEmphasis, EvidenceGrade } from "./registry";
import { severityAtLeast } from "./registry";

export type Leg = "L" | "R" | "both";
export type Confidence = "high" | "moderate" | "low";
export type PoseQuality = "good" | "fair" | "poor";

/** One recorded finding (Stage 1 the coach selects the band; Stage 2 the pose
 *  pipeline sets it). `value` is an optional raw number (LSI %, RSI, degrees). */
export type ScreenFinding = {
  variableKey: string;
  leg?: Leg | null;
  severity?: Severity | null;
  value?: number | null;
  note?: string | null;
};

export type ScreenContext = {
  painReported?: boolean;
  /** 1 (front only) or 2 (front + side). */
  viewCount?: number;
  poseQuality?: PoseQuality | null;
  /** true when this player has prior screens to trend against. */
  repeated?: boolean;
};

export type ScreenReading = {
  ruleId: string;
  variableKey: string;
  leg: Leg | null;
  finding: Bi;
  cause: Bi;
  lever: Bi;
  strengthEmphasis: StrengthEmphasis;
  flag: "rtp" | "asymmetry" | null;
  confidence: Confidence;
  citation: string;
  evidenceGrade: EvidenceGrade;
};

export type ScreenResult = {
  readings: ScreenReading[];
  redFlag: boolean;
  redFlagNote: Bi | null;
  rtpFlag: boolean;
  asymmetryFlag: boolean;
  confidence: Confidence;
};

const CONF_RANK: Record<Confidence, number> = { low: 0, moderate: 1, high: 2 };
const minConf = (a: Confidence, b: Confidence): Confidence => (CONF_RANK[a] <= CONF_RANK[b] ? a : b);

function contextConfidence(ctx: ScreenContext): Confidence {
  const views = ctx.viewCount ?? 1;
  const pose = ctx.poseQuality ?? "fair";
  if (views >= 2 && pose === "good" && ctx.repeated) return "high";
  if (views >= 1 && pose !== "poor") return "moderate";
  return "low";
}

const RED_FLAG_NOTE: Bi = {
  en: "Pain / red flag reported — refer to a clinician. This is a movement screen, not a diagnosis; no interpretation is offered here.",
  is: "Verkur / rautt flagg skráð — vísaðu til klíníkers. Þetta er hreyfiskimun, ekki greining; engin túlkun er gefin hér.",
};

export function interpretScreen(test: MovementTest, findings: ScreenFinding[], ctx: ScreenContext = {}): ScreenResult {
  // House rule: pain / red flag → no interpretation, route to a clinician.
  if (ctx.painReported) {
    return { readings: [], redFlag: true, redFlagNote: RED_FLAG_NOTE, rtpFlag: false, asymmetryFlag: false, confidence: "low" };
  }

  const ctxConf = contextConfidence(ctx);
  const varByKey = new Map(test.variables.map((v) => [v.key, v] as const));
  const readings: ScreenReading[] = [];

  for (const rule of test.rules) {
    const matches = findings.filter(
      (f) => f.variableKey === rule.match.variableKey && f.severity != null && severityAtLeast(f.severity, rule.match.minSeverity),
    );
    for (const f of matches) {
      const variable = varByKey.get(rule.match.variableKey);
      // Honest confidence: cap by the variable's reliability from phone video.
      let conf = ctxConf;
      if (variable?.reliability === "low_precision") conf = minConf(conf, "low");
      else if (variable?.reliability === "moderate") conf = minConf(conf, "moderate");
      readings.push({
        ruleId: rule.id,
        variableKey: rule.match.variableKey,
        leg: f.leg ?? null,
        finding: rule.finding,
        cause: rule.cause,
        lever: rule.lever,
        strengthEmphasis: rule.strengthEmphasis,
        flag: rule.flag,
        confidence: conf,
        citation: rule.citation,
        evidenceGrade: rule.evidenceGrade,
      });
    }
  }

  const rtpFlag = readings.some((r) => r.flag === "rtp");
  const asymmetryFlag = readings.some((r) => r.flag === "asymmetry" || r.flag === "rtp");
  const confidence = readings.length ? readings.map((r) => r.confidence).reduce(minConf) : "low";

  return { readings, redFlag: false, redFlagNote: null, rtpFlag, asymmetryFlag, confidence };
}

export const STRENGTH_EMPHASIS_LABEL: Record<StrengthEmphasis, Bi> = {
  unilateral: { en: "Unilateral loading", is: "Einhliða álag" },
  eccentric: { en: "Eccentric / absorption", is: "Eccentric / deyfing" },
  plyometric: { en: "Plyometric / reactive", is: "Plyometric / viðbragð" },
  hip_abductor_er: { en: "Hip abductor / ER strength", is: "Mjaðma-fráfærsla / útsnúningsstyrkur" },
  posterior_chain: { en: "Posterior chain", is: "Aftari keðja" },
  mobility: { en: "Mobility", is: "Hreyfanleiki" },
  trunk_control: { en: "Trunk control", is: "Búkstjórn" },
  none: { en: "—", is: "—" },
};
