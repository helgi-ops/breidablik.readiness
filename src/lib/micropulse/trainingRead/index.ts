/**
 * trainingRead — "How to train this player": ranked physical development emphases
 * from the team game model × how the player actually moves.
 * Spec: docs/train-like-you-play-individual.md.
 *
 * Deterministic + capability-driven. Rules (this engine + the fixed catalogue)
 * decide WHICH qualities; the endpoint supplies each quality's SQUAD-norm z (his
 * typical value vs the team's distribution, via flagAgainstBaseline) and whether
 * the signal is "rich" (Pro IMA) or a "proxy" (Lite GPS). The signed z ranks: a
 * quality he does a lot of for his role rises; one he barely does (a centre-back's
 * sprinting) drops below the floor. Branches on signals PRESENT, never tier name:
 * a quality whose signal is absent because the tier can't see it (CoD, L/R
 * asymmetry → IMA-only) goes to notAssessable with an honest "what unlocks it"
 * note, never guessed. Confidence DEGRADES as fewer qualities are assessable.
 *
 * This is a development read, a DISTINCT labelled signal — it never touches the
 * canonical readiness colour (CLAUDE.md). No AI in the decision; the headlines/why
 * are fixed cited templates.
 */

import {
  CATALOGUE, GAME_MODEL_LABEL, MODEL_DEMAND, QUALITY_KEYS,
  type GameModel, type Quality,
} from "./catalogue";

export const MIN_DAYS = 8; // mature-baseline floor (mirrors movementSignature / intensityVerdict)
const ACTIVE_DAYS = 14;
const SCORE_FLOOR = 0.3;   // below this, a quality isn't worth surfacing as an emphasis

export type ConfidenceLevel = "high" | "moderate" | "low";

/** Per-quality signal read, computed upstream by the endpoint. */
export type QualitySignal = {
  /** Signed z of his typical value vs the SQUAD norm (positive = high for the team). */
  z: number | null;
  /** Training sessions behind his own typical value (maturity gate). */
  baselineDays: number;
  /** True = Pro-rich signal (e.g. IMA); false = Lite GPS proxy → lower confidence. */
  rich: boolean;
};

export type TrainingReadInput = {
  playerId: string;
  position: string | null;
  firstName?: string;
  gameModel: GameModel;
  /** Only the qualities whose signal is present for this player (any maturity). */
  signals: Partial<Record<Quality, QualitySignal>>;
};

export type TrainingEmphasis = {
  quality: Quality;
  plain: { EN: string; IS: string };
  headline: { EN: string; IS: string };
  why: { EN: string; IS: string };
  evidence: { EN: string; IS: string };
  citation: string;
  methodFamily?: string;
  confidence: ConfidenceLevel;
};

export type NotAssessable = {
  quality: Quality;
  plain: { EN: string; IS: string };
  note: { EN: string; IS: string };
};

export type PlayerTrainingRead = {
  player_id: string;
  position: string | null;
  gameModel: GameModel;
  emphases: TrainingEmphasis[];
  notAssessable: NotAssessable[];
  confidence: { level: ConfidenceLevel; coverage: number; baselineDays: number };
};

function fmtZ(z: number): string { return `${z > 0 ? "+" : ""}${z}`; }

function emphasisConfidence(rich: boolean, baselineDays: number): ConfidenceLevel {
  if (rich) return baselineDays >= ACTIVE_DAYS ? "high" : "moderate";
  return baselineDays >= ACTIVE_DAYS ? "moderate" : "low";
}

const UNLOCK_NOTE: Partial<Record<Quality, { EN: string; IS: string }>> = {
  change_of_direction: {
    EN: "Pro-only: needs IMA (Catapult S7) to see change-of-direction load. Closest GPS proxy is total accel/decel efforts (low confidence) — don't read it as CoD.",
    IS: "Aðeins Pro: þarf IMA (Catapult S7) til að sjá stefnubreytinga-álag. Næsta GPS-nálgun er heildar accel/decel-átök (lítil vissa) — ekki lesa það sem CoD.",
  },
  lr_asymmetry: {
    EN: "Pro-only: left/right balance needs IMA directional data. Your GPS tier can't separate sides — add a ForceDecks/IMA source to unlock it.",
    IS: "Aðeins Pro: vinstri/hægri jafnvægi þarf IMA stefnu-gögn. GPS-þrepið þitt aðgreinir ekki hliðar — bættu ForceDecks/IMA við til að opna það.",
  },
};

export function computeTrainingRead(input: TrainingReadInput): PlayerTrainingRead {
  const demand = MODEL_DEMAND[input.gameModel];
  const modelLabel = GAME_MODEL_LABEL[input.gameModel];

  type Candidate = { q: Quality; score: number; sig: QualitySignal };
  const candidates: Candidate[] = [];
  const notAssessable: NotAssessable[] = [];
  let assessable = 0;
  let richCount = 0;
  let minBaseline = Infinity;

  for (const q of QUALITY_KEYS) {
    const def = CATALOGUE[q];
    const sig = input.signals[q];
    const present = sig != null && sig.z != null && sig.baselineDays >= MIN_DAYS;
    if (!present) {
      // Only flag tier-limited (Pro-only) qualities as "not assessable" — a missing
      // non-IMA signal is a data gap for this player, not a tier wall.
      if (def.proOnly) {
        notAssessable.push({ quality: q, plain: def.plain, note: UNLOCK_NOTE[q] ?? def.plain });
      }
      continue;
    }
    assessable += 1;
    if (sig!.rich) richCount += 1;
    minBaseline = Math.min(minBaseline, sig!.baselineDays);
    const d = demand[q] ?? (input.gameModel === "balanced" ? 0.5 : 0.3);
    // SIGNED z (vs his role/squad norm): high-for-his-role raises the score; a
    // quality he barely does for his position (e.g. a centre-back's sprinting)
    // drops below the floor instead of surfacing as an emphasis.
    const z = sig!.z ?? 0;
    candidates.push({ q, sig: sig!, score: Math.max(0, d * (1 + z / 2)) });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.filter((c) => c.score >= SCORE_FLOOR).slice(0, 3);

  const emphases: TrainingEmphasis[] = top.map(({ q, sig }) => {
    const def = CATALOGUE[q];
    const z = sig.z as number;
    const why = {
      EN: def.why.EN.replace("{model}", modelLabel.EN.toLowerCase()),
      IS: def.why.IS.replace("{model}", modelLabel.IS.toLowerCase()),
    };
    const evidence = {
      EN: `${def.signalPlain.EN} high vs his squad norm (z ${fmtZ(z)}, ${sig.baselineDays} sessions${sig.rich ? "" : ", GPS proxy"}).`,
      IS: `${def.signalPlain.IS} hátt vs liðs-venju (z ${fmtZ(z)}, ${sig.baselineDays} æfingar${sig.rich ? "" : ", GPS-nálgun"}).`,
    };
    return {
      quality: q, plain: def.plain, headline: def.headline, why, evidence,
      citation: def.citation, methodFamily: def.methodFamily,
      confidence: emphasisConfidence(sig.rich, sig.baselineDays),
    };
  });

  const coverage = Math.round((assessable / QUALITY_KEYS.length) * 100) / 100;
  const baselineDays = minBaseline === Infinity ? 0 : minBaseline;
  // Rich fraction: GPS-proxy-only reads (Lite) can't reach "high" even with good
  // coverage — the evidence is coarser, so confidence stays honestly capped.
  const richFraction = assessable ? richCount / assessable : 0;
  const level: ConfidenceLevel =
    coverage >= 0.66 && baselineDays >= ACTIVE_DAYS && richFraction >= 0.5 ? "high"
      : coverage >= 0.4 && baselineDays >= MIN_DAYS ? "moderate"
        : "low";

  return {
    player_id: input.playerId,
    position: input.position,
    gameModel: input.gameModel,
    emphases,
    notAssessable,
    confidence: { level, coverage, baselineDays },
  };
}
