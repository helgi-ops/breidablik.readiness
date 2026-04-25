/**
 * Verdict Explanation Engine
 *
 * Synthesizes per-player signals into a coach-readable explanation in plain Icelandic.
 * Returns structured why/verify/action/ask blocks that the UI renders below the verdict.
 *
 * Design principles:
 *   - Pure data-driven (no LLM, no API costs, no hallucinations)
 *   - Plain Icelandic, not technical jargon
 *   - Top 2-3 driving signals per verdict (not exhaustive list)
 *   - Surface uncertainty explicitly when data is sparse
 *   - Suggest concrete actions and questions, not vague advice
 */

export type VerdictExplanation = {
  /** Top 2-3 signals driving this verdict, in plain Icelandic */
  why: string[];
  /** What the coach should verify (if data is uncertain or missing) */
  verify: string[];
  /** Concrete coaching action for today */
  action: string;
  /** Optional question to ask the player (when data is missing) */
  ask: string | null;
};

export type ExplainInput = {
  // Verdict context
  verdict: "FULL" | "MODIFIED" | "RECOVERY" | "HOLD" | "INJURED" | "REHAB" | "RTP" | "ILL" | "RECOVERING_ILL" | "NO_DATA";
  // Indoor load signals
  composite_score?: number | null;
  composite_band?: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  acwr_value?: number | null;
  acwr_flag?: "green" | "yellow" | "red" | null;
  mcburnie_ratio?: number | null;
  mcburnie_flag?: "green" | "yellow" | "red" | null;
  indoor_sessions_7d?: number | null;
  // Injury / illness context
  injury_status?: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
  injury_body_part?: string | null;
  injury_type?: string | null;
  injury_rtp_stage?: number | null;
  injury_estimated_return?: string | null;
  injury_severity?: string | null;
  // Recent training signal (was player active recently?)
  trained_recently?: boolean;
  // Readiness questionnaire (subjective)
  has_readiness_today?: boolean;
  fatigue_energy?: number | null;
  muscle_soreness?: number | null;
  sleep_quality?: number | null;
};

/** Detect illness from body_part marker */
function isIllness(bodyPart: string | null | undefined): boolean {
  if (!bodyPart) return false;
  const bp = bodyPart.toLowerCase();
  return bp.includes("illness") || bp.includes("sjúk") || bp.includes("veik") || bp.includes("flu") || bp.includes("cold");
}

export function buildVerdictExplanation(input: ExplainInput): VerdictExplanation {
  const why: string[] = [];
  const verify: string[] = [];
  let action = "";
  let ask: string | null = null;

  // ── ILLNESS PATH ─────────────────────────────────────────
  if (input.verdict === "ILL") {
    if (input.injury_body_part || input.injury_type) {
      why.push(
        `Skráður veikur fyrir ${daysAgo(input.injury_estimated_return ? null : null)}engin training data síðan`,
      );
    } else {
      why.push("Skráður veikur — engin training data síðan");
    }
    if (!input.has_readiness_today) {
      verify.push("Engin readiness submission í dag");
    }
    if (input.injury_estimated_return) {
      why.push(`Áætluð endurkoma: ${input.injury_estimated_return}`);
    }
    action = "Engin æfing. Hvíld, drekka mikið. Halda fjarlægð frá öðrum vegna smithættu.";
    ask = "Hvernig líður þér í dag — er hiti enn til staðar?";
    return { why, verify, action, ask };
  }

  if (input.verdict === "RECOVERING_ILL") {
    why.push("Skráður veikur en kom í æfingu nýlega");
    why.push("Symptoms ætti að vera að minnka");
    if (input.fatigue_energy != null && input.fatigue_energy <= 2) {
      why.push(`Reported low energy (${input.fatigue_energy}/5)`);
      verify.push("Energy enn lágt — getur þýtt að líkaminn sé enn að jafna sig");
    }
    action = "Light technical/aerobic work. Sleppa max-intensity sprints. Drekka mikið. Skoða aftur eftir session.";
    ask = "Líður þér betur en fyrir 2-3 dögum?";
    return { why, verify, action, ask };
  }

  // ── INJURY PATH (musculoskeletal) ───────────────────────
  if (input.verdict === "INJURED") {
    if (input.injury_body_part) {
      const sev = input.injury_severity ? ` (${input.injury_severity})` : "";
      why.push(`${input.injury_body_part}-meiðsl${sev}, status: acute`);
    }
    if (input.injury_estimated_return) {
      why.push(`Áætluð endurkoma: ${input.injury_estimated_return}`);
    }
    action = "Medical/physio prótókoll. Engin team-æfing fyrr en sjúkraþjálfari clear-ar.";
    return { why, verify, action, ask };
  }

  if (input.verdict === "REHAB") {
    if (input.injury_body_part) {
      why.push(`${input.injury_body_part}-meiðsl í endurhæfingu`);
    }
    if (input.injury_rtp_stage != null) {
      why.push(`Return-to-play stage ${input.injury_rtp_stage}/5 (rehab phase)`);
    }
    if (input.injury_estimated_return) {
      why.push(`Áætluð endurkoma: ${input.injury_estimated_return}`);
    }
    action = "Aðeins physio-prescribed exercises. Engin team-vinna eða running enn.";
    return { why, verify, action, ask };
  }

  if (input.verdict === "RTP") {
    if (input.injury_body_part) {
      why.push(`${input.injury_body_part}-meiðsl í return-to-play prótókol`);
    }
    if (input.injury_rtp_stage != null) {
      why.push(`Stage ${input.injury_rtp_stage}/5 — modified team training tíminn`);
    }
    action = "Léttari æfingar með liðinu. Sleppa max-intensity sprints og full contact þar til stage 5.";
    verify.push("Sjúkraþjálfari ætti að approve að færa á næsta stage");
    return { why, verify, action, ask };
  }

  // ── LOAD-BASED PATH ────────────────────────────────────
  if (input.verdict === "RECOVERY") {
    // Identify red signal(s)
    if (input.composite_band === "spike" && input.composite_score != null) {
      why.push(
        `Composite score ${input.composite_score} (spike — ${Math.round(((input.composite_score - 100) / 100) * 100)}% yfir personal baseline)`,
      );
    }
    if (input.acwr_flag === "red" && input.acwr_value != null) {
      if (input.acwr_value > 1.5) {
        why.push(`ACWR ${input.acwr_value.toFixed(2)} — acute spike (62%+ yfir 4-week baseline, injury risk hátt)`);
      } else if (input.acwr_value < 0.5) {
        why.push(`ACWR ${input.acwr_value.toFixed(2)} — severe undertraining (50%+ undir baseline)`);
      }
    }
    if (input.mcburnie_flag === "red") {
      why.push("Decel:intensity coupling skekkja — overload eða undirvinnsla");
    }
    verify.push("Var í gær leikdagur? Athugaðu match calendar");
    action = "Recovery only í dag — mobility, light technical, foam roll. Engar high-intensity sprints.";
    return { why, verify, action, ask };
  }

  if (input.verdict === "MODIFIED") {
    // Yellow flags
    if (input.composite_band === "heavy" && input.composite_score != null) {
      why.push(`Composite score ${input.composite_score} (heavy — match-style training í gær)`);
    }
    if (input.composite_band === "light") {
      why.push("Mjög létt æfing nýlega — gæti verið að jafna sig eftir veikindi/meiðsl");
    }
    if (input.acwr_flag === "yellow" && input.acwr_value != null) {
      if (input.acwr_value > 1.3) {
        why.push(`ACWR ${input.acwr_value.toFixed(2)} (caution — 30%+ yfir baseline)`);
      } else if (input.acwr_value < 0.8) {
        why.push(`ACWR ${input.acwr_value.toFixed(2)} (detraining — 20%+ undir baseline)`);
      }
    }
    if (input.mcburnie_flag === "yellow") {
      why.push("Decel:intensity coupling utan sweet spot");
    }
    if (why.length === 0) {
      why.push("Eitt eða fleiri load-merki utan kjörsviðs");
    }
    action = "Lækka volume 30-40% í dag og sleppa max-intensity sprints. Halda technical og tactical work.";
    return { why, verify, action, ask };
  }

  if (input.verdict === "FULL") {
    why.push("Allir load-merki innan healthy band — engin warning flags");
    if (input.composite_score != null) {
      why.push(`Composite ${input.composite_score} (typical, ~${input.composite_band ?? "balanced"})`);
    }
    if (input.acwr_value != null && input.acwr_flag === "green") {
      why.push(`ACWR ${input.acwr_value.toFixed(2)} (sweet spot 0.8-1.3 — adapted)`);
    }
    if (input.indoor_sessions_7d != null && input.indoor_sessions_7d >= 4) {
      why.push(`${input.indoor_sessions_7d} æfingar sl. 7 daga — distributed load, no spike`);
    }
    action = "Engin takmörk — fullt æfing, sprint work OK, max-intensity efforts allowed.";
    return { why, verify, action, ask };
  }

  if (input.verdict === "HOLD") {
    why.push("Coach setti manual hold (medical eða annað)");
    action = "Ekki hafa með í team-session. Confirma með coach hvers vegna.";
    return { why, verify, action, ask };
  }

  // NO_DATA
  why.push("Ekki nóg gögn til að gefa explicit verdict");
  if (!input.has_readiness_today) {
    verify.push("Engin readiness submission í dag");
    ask = "Skilaðu inn readiness check svo við getum gefið scoring";
  }
  if (!input.trained_recently) {
    verify.push("Engin training data í síðustu vikum");
  }
  action = "Treysta á eyemark þjálfara í dag.";
  return { why, verify, action, ask };
}

/** Helper: format days-ago when we have an injury date */
function daysAgo(_unused: null): string {
  // Reserved for future enhancement when we pass injury_date through
  return "";
}
