/**
 * Player-facing explanation builder.
 *
 * Pure function — no I/O, no Supabase. Takes already-fetched data from
 * readiness entries, MLI, metabolic load, GPS signals, and VALD, and
 * returns an array of human-readable explanation lines (IS + EN) that
 * tell the player WHY their readiness colour is what it is.
 *
 * Only surfaces factors that had a NEGATIVE impact (pulled the colour
 * down). If the player is GREEN with no concerns, returns an empty array
 * so the UI can hide the card entirely.
 */

export type Lang = "IS" | "EN";

// ── Input types ───────────────────────────────────────────────────────

export interface PlayerExplanationInput {
  lang: Lang;

  /** The final colour shown to the player. */
  finalFlag: "GREEN" | "GREEN_PLUS" | "YELLOW" | "RED" | null;

  /**
   * The hybrid readiness PI object stored in
   * readiness_entries.training_modifier.pi
   */
  pi?: {
    abs?: string | null;
    dev?: string | null;
    final?: string | null;
    z?: number | null;
    sten?: number | null;
    n?: number | null;
    delta_z?: number | null;
    low_count?: number | null;
    very_low_count?: number | null;
    override_note?: string | null;
  } | null;

  /** MLI data (from Catapult mechanical load) */
  mli?: {
    score: number | null;
    band: string | null;
    residualMli: number | null;
    residualBand: string | null;
  } | null;

  /** Metabolic load data */
  metabolic?: {
    score: number | null;
    band: string | null;
    deltaScore: number | null;
    fatigueType: string | null;
  } | null;

  /** GPS external load spike */
  gpsSpike?: boolean | null;

  /** ACWR (Acute:Chronic Workload Ratio) */
  acwr?: number | null;

  /** VALD neuromuscular adjustment */
  valdAdjustment?: {
    applied: boolean;
    direction: "down" | "up" | "none" | null;
    reason: string | null;
  } | null;

  /** RPE z-score (perceived effort relative to own baseline) */
  rpeZScore?: number | null;
}

export interface ExplanationLine {
  /** Short category label */
  category: string;
  /** Human-readable explanation */
  text: string;
  /** Severity: how much this factor contributed */
  severity: "high" | "moderate" | "low";
}

// ── Builder ───────────────────────────────────────────────────────────

export function buildPlayerExplanation(input: PlayerExplanationInput): ExplanationLine[] {
  const { lang, finalFlag, pi, mli, metabolic, gpsSpike, acwr, valdAdjustment, rpeZScore } = input;
  const lines: ExplanationLine[] = [];

  // If GREEN / GREEN_PLUS with no concerns — nothing to explain
  if (finalFlag === "GREEN" || finalFlag === "GREEN_PLUS" || finalFlag == null) {
    return lines;
  }

  const is = lang === "IS";

  // ── 1. Checkin / z-score deviation ──────────────────────────────────

  if (pi) {
    const abs = (pi.abs ?? "").toUpperCase();
    const dev = (pi.dev ?? "").toUpperCase();
    const z = pi.z;
    const n = pi.n ?? 0;

    // Deviation pulled colour down (score is low for THIS player)
    if (dev === "RED" || dev === "YELLOW") {
      if (typeof z === "number" && n >= 10) {
        lines.push({
          category: is ? "Checkin" : "Check-in",
          text: is
            ? `Svarið þitt er lægra en þitt eigin meðaltal (z = ${z.toFixed(1)}). Þetta þýðir að þú ert undir þínu venjulega gildi miðað við síðustu 28 daga.`
            : `Your score is lower than your own average (z = ${z.toFixed(1)}). This means you're below your usual level over the past 28 days.`,
          severity: dev === "RED" ? "high" : "moderate",
        });
      }
    }

    // Absolute rule fired (raw score is objectively low)
    if (abs === "RED" && dev !== "RED") {
      const lowCount = pi.low_count ?? 0;
      const veryLow = pi.very_low_count ?? 0;
      lines.push({
        category: is ? "Checkin" : "Check-in",
        text: is
          ? `Heildarskor í dag er lágt${veryLow > 0 ? ` — ${veryLow} svör eru mjög lág` : lowCount > 0 ? ` — ${lowCount} svör eru lág` : ""}.`
          : `Overall score today is low${veryLow > 0 ? ` — ${veryLow} answers are very low` : lowCount > 0 ? ` — ${lowCount} answers are low` : ""}.`,
        severity: "high",
      });
    } else if (abs === "YELLOW" && dev !== "YELLOW" && dev !== "RED") {
      lines.push({
        category: is ? "Checkin" : "Check-in",
        text: is
          ? "Heildarskor er á jaðri — ekki nógu lágt til að vera rautt en ekki alveg gott."
          : "Overall score is borderline — not low enough for red but not fully green.",
        severity: "moderate",
      });
    }

    // Delta-Z: rapid decline from yesterday
    if (typeof pi.delta_z === "number" && pi.delta_z <= -1.0) {
      lines.push({
        category: is ? "Þróun" : "Trend",
        text: is
          ? `Svarið þitt hefur lækkað hratt frá í gær (Δz = ${pi.delta_z.toFixed(1)}).`
          : `Your score has dropped quickly since yesterday (Δz = ${pi.delta_z.toFixed(1)}).`,
        severity: pi.delta_z <= -1.5 ? "high" : "moderate",
      });
    }
  }

  // ── 2. MLI (Mechanical Load) ────────────────────────────────────────

  if (mli && typeof mli.score === "number") {
    const band = (mli.band ?? "").toUpperCase();
    if (band === "EXTREME" || band === "VERY_HIGH") {
      lines.push({
        category: "MLI",
        text: is
          ? `Vélrænt álag (MLI ${mli.score.toFixed(0)}) er ${band === "EXTREME" ? "gríðarlega hátt" : "mjög hátt"}. Hremming og hröðun í síðustu æfingu/leik var vel yfir baseline.`
          : `Mechanical load (MLI ${mli.score.toFixed(0)}) is ${band === "EXTREME" ? "extreme" : "very high"}. Deceleration and acceleration in the last session was well above baseline.`,
        severity: band === "EXTREME" ? "high" : "moderate",
      });
    } else if (band === "HIGH") {
      lines.push({
        category: "MLI",
        text: is
          ? `Vélrænt álag (MLI ${mli.score.toFixed(0)}) er hátt — hremming/hröðun var yfir baseline.`
          : `Mechanical load (MLI ${mli.score.toFixed(0)}) is high — deceleration/acceleration was above baseline.`,
        severity: "moderate",
      });
    }

    // Residual elevated
    const resBand = (mli.residualBand ?? "").toUpperCase();
    if (resBand === "HIGH" || resBand === "CAUTION") {
      lines.push({
        category: is ? "Uppsafnað álag" : "Accumulated load",
        text: is
          ? "Vélrænt álag hefur verið hátt í nokkra daga í röð — uppsafnað álag er enn til staðar."
          : "Mechanical load has been elevated for several days — accumulated stress is still present.",
        severity: resBand === "HIGH" ? "high" : "moderate",
      });
    }
  }

  // ── 3. Metabolic Load ───────────────────────────────────────────────

  if (metabolic && typeof metabolic.score === "number") {
    const band = (metabolic.band ?? "").toLowerCase();
    if (band === "very_high" || band === "high") {
      lines.push({
        category: is ? "Efnaskipti" : "Metabolic",
        text: is
          ? `Efnaskiptaálag (${metabolic.score.toFixed(0)}) er ${band === "very_high" ? "mjög hátt" : "hátt"} miðað við baseline.`
          : `Metabolic load (${metabolic.score.toFixed(0)}) is ${band === "very_high" ? "very high" : "high"} relative to baseline.`,
        severity: band === "very_high" ? "high" : "moderate",
      });
    }

    // Rising metabolic trend
    if (typeof metabolic.deltaScore === "number" && metabolic.deltaScore >= 15) {
      lines.push({
        category: is ? "Efnaskipti" : "Metabolic",
        text: is
          ? `Efnaskiptaálag hefur hækkað um ${metabolic.deltaScore.toFixed(0)} stig á 5 dögum — álag er að hlaðast upp.`
          : `Metabolic load has risen by ${metabolic.deltaScore.toFixed(0)} points over 5 days — load is accumulating.`,
        severity: metabolic.deltaScore >= 25 ? "high" : "moderate",
      });
    }

    // Fatigue type
    const ft = (metabolic.fatigueType ?? "").toLowerCase();
    if (ft === "global_fatigue") {
      lines.push({
        category: is ? "Þreyta" : "Fatigue",
        text: is
          ? "Bæði vélrænt og efnaskiptaálag er hátt — heildarþreyta."
          : "Both mechanical and metabolic load are elevated — global fatigue.",
        severity: "high",
      });
    }
  }

  // ── 4. GPS spike / ACWR ─────────────────────────────────────────────

  if (gpsSpike) {
    lines.push({
      category: "GPS",
      text: is
        ? "GPS gögn sýna skyndilega hækkun í álagi (spike) miðað við baseline."
        : "GPS data shows a sudden load spike compared to baseline.",
      severity: "moderate",
    });
  }

  if (typeof acwr === "number" && acwr > 1.5) {
    lines.push({
      category: "ACWR",
      text: is
        ? `Hlutfall bráðs og langvarandi álags (ACWR ${acwr.toFixed(2)}) er hátt — nýlegt álag er miklu meira en undanfarnar vikur.`
        : `Acute-to-chronic workload ratio (ACWR ${acwr.toFixed(2)}) is high — recent load is much greater than previous weeks.`,
      severity: acwr > 1.8 ? "high" : "moderate",
    });
  }

  // ── 5. VALD neuromuscular ───────────────────────────────────────────

  if (valdAdjustment?.applied && valdAdjustment.direction === "down") {
    lines.push({
      category: "VALD",
      text: is
        ? "Taugavöðvamæling (VALD) sýnir lækkun í krafti — aukið áhættumat."
        : "Neuromuscular testing (VALD) shows reduced force output — elevated risk.",
      severity: "moderate",
    });
  }

  // ── 6. RPE perceived load mismatch ──────────────────────────────────

  if (typeof rpeZScore === "number" && rpeZScore >= 1.0) {
    lines.push({
      category: "RPE",
      text: is
        ? "Þú matir álag í síðustu æfingu hærra en venjulega — líkaminn upplifir meiri áreynslu en GPS sýnir."
        : "You rated last session's effort higher than usual — your body is experiencing more strain than GPS shows.",
      severity: rpeZScore >= 1.5 ? "high" : "moderate",
    });
  }

  return lines;
}
