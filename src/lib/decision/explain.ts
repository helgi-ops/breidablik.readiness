/**
 * Verdict Explanation Engine — bilingual EN/IS.
 *
 * Synthesizes per-player signals into a coach-readable explanation.
 * Pure data-driven (no LLM), default English with Icelandic toggle.
 */

import type { Lang } from "@/lib/lang";

export type VerdictExplanation = {
  why: string[];
  verify: string[];
  action: string;
  ask: string | null;
};

export type ExplainInput = {
  verdict: "FULL" | "MODIFIED" | "RECOVERY" | "HOLD" | "INJURED" | "REHAB" | "RTP" | "ILL" | "RECOVERING_ILL" | "NO_DATA";
  composite_score?: number | null;
  composite_band?: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  acwr_value?: number | null;
  acwr_flag?: "green" | "yellow" | "red" | null;
  mcburnie_ratio?: number | null;
  mcburnie_flag?: "green" | "yellow" | "red" | null;
  indoor_sessions_7d?: number | null;
  injury_status?: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
  injury_body_part?: string | null;
  injury_type?: string | null;
  injury_rtp_stage?: number | null;
  injury_estimated_return?: string | null;
  injury_severity?: string | null;
  trained_recently?: boolean;
  has_readiness_today?: boolean;
  fatigue_energy?: number | null;
  muscle_soreness?: number | null;
  sleep_quality?: number | null;
};

type Bilingual = { EN: string; IS: string };
function t(b: Bilingual, lang: Lang): string {
  return lang === "IS" ? b.IS : b.EN;
}

export function buildVerdictExplanation(input: ExplainInput, lang: Lang = "EN"): VerdictExplanation {
  const why: string[] = [];
  const verify: string[] = [];
  let action = "";
  let ask: string | null = null;

  // ── ILLNESS PATH ─────────────────────────────────────────
  if (input.verdict === "ILL") {
    why.push(t({
      EN: "Logged sick — no training data since",
      IS: "Skráður veikur — engin training data síðan",
    }, lang));
    if (!input.has_readiness_today) {
      verify.push(t({
        EN: "No readiness check-in today",
        IS: "Engin readiness submission í dag",
      }, lang));
    }
    if (input.injury_estimated_return) {
      why.push(t({
        EN: `Estimated return: ${input.injury_estimated_return}`,
        IS: `Áætluð endurkoma: ${input.injury_estimated_return}`,
      }, lang));
    }
    action = t({
      EN: "No training. Rest, hydrate, monitor symptoms. Keep distance from teammates due to contagion risk.",
      IS: "Engin æfing. Hvíld, drekka mikið, monitor symptoms. Halda fjarlægð frá öðrum leikmönnum vegna smithættu.",
    }, lang);
    ask = t({
      EN: "How are you feeling today — any fever still?",
      IS: "Hvernig líður þér í dag — er hiti enn til staðar?",
    }, lang);
    return { why, verify, action, ask };
  }

  if (input.verdict === "RECOVERING_ILL") {
    why.push(t({
      EN: "Logged sick but resumed training recently",
      IS: "Skráður veikur en kom í æfingu nýlega",
    }, lang));
    why.push(t({
      EN: "Symptoms should be subsiding",
      IS: "Symptoms ætti að vera að minnka",
    }, lang));
    if (input.fatigue_energy != null && input.fatigue_energy <= 2) {
      why.push(t({
        EN: `Reported low energy (${input.fatigue_energy}/5)`,
        IS: `Reported low energy (${input.fatigue_energy}/5)`,
      }, lang));
      verify.push(t({
        EN: "Energy still low — body may still be recovering",
        IS: "Energy enn lágt — getur þýtt að líkaminn sé enn að jafna sig",
      }, lang));
    }
    action = t({
      EN: "Light technical/aerobic work. Skip max-intensity sprints. Hydrate well. Re-assess after session.",
      IS: "Light technical/aerobic work í dag. Sleppa max-intensity sprints. Drekka mikið. Skoða aftur eftir session.",
    }, lang);
    ask = t({
      EN: "Are you feeling better than 2-3 days ago?",
      IS: "Líður þér betur en fyrir 2-3 dögum?",
    }, lang);
    return { why, verify, action, ask };
  }

  // ── INJURY PATH ───────────────────────────────────────
  if (input.verdict === "INJURED") {
    if (input.injury_body_part) {
      const sev = input.injury_severity ? ` (${input.injury_severity})` : "";
      why.push(t({
        EN: `${input.injury_body_part} injury${sev}, status: acute`,
        IS: `${input.injury_body_part}-meiðsl${sev}, status: acute`,
      }, lang));
    }
    if (input.injury_estimated_return) {
      why.push(t({
        EN: `Estimated return: ${input.injury_estimated_return}`,
        IS: `Áætluð endurkoma: ${input.injury_estimated_return}`,
      }, lang));
    }
    action = t({
      EN: "Medical/physio protocol. No team training until physio clears.",
      IS: "Medical/physio prótókoll. Engin team-æfing fyrr en sjúkraþjálfari clear-ar.",
    }, lang);
    return { why, verify, action, ask };
  }

  if (input.verdict === "REHAB") {
    if (input.injury_body_part) {
      why.push(t({
        EN: `${input.injury_body_part} injury in rehabilitation`,
        IS: `${input.injury_body_part}-meiðsl í endurhæfingu`,
      }, lang));
    }
    if (input.injury_rtp_stage != null) {
      why.push(t({
        EN: `Return-to-play stage ${input.injury_rtp_stage}/5 (rehab phase)`,
        IS: `Return-to-play stage ${input.injury_rtp_stage}/5 (rehab phase)`,
      }, lang));
    }
    if (input.injury_estimated_return) {
      why.push(t({
        EN: `Estimated return: ${input.injury_estimated_return}`,
        IS: `Áætluð endurkoma: ${input.injury_estimated_return}`,
      }, lang));
    }
    action = t({
      EN: "Physio-prescribed exercises only. No team work or running yet.",
      IS: "Aðeins physio-prescribed exercises. Engin team-vinna eða running enn.",
    }, lang);
    return { why, verify, action, ask };
  }

  if (input.verdict === "RTP") {
    if (input.injury_body_part) {
      why.push(t({
        EN: `${input.injury_body_part} injury in return-to-play protocol`,
        IS: `${input.injury_body_part}-meiðsl í return-to-play prótókol`,
      }, lang));
    }
    if (input.injury_rtp_stage != null) {
      why.push(t({
        EN: `Stage ${input.injury_rtp_stage}/5 — modified team training time`,
        IS: `Stage ${input.injury_rtp_stage}/5 — modified team training tíminn`,
      }, lang));
    }
    action = t({
      EN: "Lighter sessions with the team. Skip max-intensity sprints and full contact until stage 5.",
      IS: "Léttari æfingar með liðinu. Sleppa max-intensity sprints og full contact þar til stage 5.",
    }, lang);
    verify.push(t({
      EN: "Physio should approve the move to next stage",
      IS: "Sjúkraþjálfari ætti að approve að færa á næsta stage",
    }, lang));
    return { why, verify, action, ask };
  }

  // ── LOAD-BASED PATH ────────────────────────────────────
  if (input.verdict === "RECOVERY") {
    if (input.composite_band === "spike" && input.composite_score != null) {
      const pctAbove = Math.round(((input.composite_score - 100) / 100) * 100);
      why.push(t({
        EN: `Composite score ${input.composite_score} (spike — ${pctAbove}% above personal baseline)`,
        IS: `Composite score ${input.composite_score} (spike — ${pctAbove}% yfir personal baseline)`,
      }, lang));
    }
    if (input.acwr_flag === "red" && input.acwr_value != null) {
      if (input.acwr_value > 1.5) {
        why.push(t({
          EN: `ACWR ${input.acwr_value.toFixed(2)} — acute spike (62%+ above 4-week baseline, injury risk elevated)`,
          IS: `ACWR ${input.acwr_value.toFixed(2)} — acute spike (62%+ yfir 4-week baseline, injury risk hátt)`,
        }, lang));
      } else if (input.acwr_value < 0.5) {
        why.push(t({
          EN: `ACWR ${input.acwr_value.toFixed(2)} — severe undertraining (50%+ below baseline)`,
          IS: `ACWR ${input.acwr_value.toFixed(2)} — severe undertraining (50%+ undir baseline)`,
        }, lang));
      }
    }
    if (input.mcburnie_flag === "red") {
      why.push(t({
        EN: "Decel:intensity coupling out of range — overload or undertraining",
        IS: "Decel:intensity coupling skekkja — overload eða undirvinnsla",
      }, lang));
    }
    verify.push(t({
      EN: "Was yesterday a match day? Check the match calendar",
      IS: "Var í gær leikdagur? Athugaðu match calendar",
    }, lang));
    action = t({
      EN: "Recovery only today — mobility, light technical, foam roll. No high-intensity sprints.",
      IS: "Recovery only í dag — mobility, light technical, foam roll. Engar high-intensity sprints.",
    }, lang);
    return { why, verify, action, ask };
  }

  if (input.verdict === "MODIFIED") {
    if (input.composite_band === "heavy" && input.composite_score != null) {
      why.push(t({
        EN: `Composite score ${input.composite_score} (heavy — match-style training yesterday)`,
        IS: `Composite score ${input.composite_score} (heavy — match-style training í gær)`,
      }, lang));
    }
    if (input.composite_band === "light") {
      why.push(t({
        EN: "Very light recent session — possibly recovering from illness/injury",
        IS: "Mjög létt æfing nýlega — gæti verið að jafna sig eftir veikindi/meiðsl",
      }, lang));
    }
    if (input.acwr_flag === "yellow" && input.acwr_value != null) {
      if (input.acwr_value > 1.3) {
        why.push(t({
          EN: `ACWR ${input.acwr_value.toFixed(2)} (caution — 30%+ above baseline)`,
          IS: `ACWR ${input.acwr_value.toFixed(2)} (caution — 30%+ yfir baseline)`,
        }, lang));
      } else if (input.acwr_value < 0.8) {
        why.push(t({
          EN: `ACWR ${input.acwr_value.toFixed(2)} (detraining — 20%+ below baseline)`,
          IS: `ACWR ${input.acwr_value.toFixed(2)} (detraining — 20%+ undir baseline)`,
        }, lang));
      }
    }
    if (input.mcburnie_flag === "yellow") {
      why.push(t({
        EN: "Decel:intensity coupling outside sweet spot",
        IS: "Decel:intensity coupling utan sweet spot",
      }, lang));
    }
    if (why.length === 0) {
      why.push(t({
        EN: "One or more load signals outside healthy range",
        IS: "Eitt eða fleiri load-merki utan kjörsviðs",
      }, lang));
    }
    action = t({
      EN: "Reduce volume 30-40% today and skip max-intensity sprints. Keep technical and tactical work.",
      IS: "Lækka volume 30-40% í dag og sleppa max-intensity sprints. Halda technical og tactical work.",
    }, lang);
    return { why, verify, action, ask };
  }

  if (input.verdict === "FULL") {
    why.push(t({
      EN: "All load signals within healthy band — no warning flags",
      IS: "Allir load-merki innan healthy band — engin warning flags",
    }, lang));
    if (input.composite_score != null) {
      why.push(t({
        EN: `Composite ${input.composite_score} (typical, ~${input.composite_band ?? "balanced"})`,
        IS: `Composite ${input.composite_score} (typical, ~${input.composite_band ?? "balanced"})`,
      }, lang));
    }
    if (input.acwr_value != null && input.acwr_flag === "green") {
      why.push(t({
        EN: `ACWR ${input.acwr_value.toFixed(2)} (sweet spot 0.8-1.3 — adapted)`,
        IS: `ACWR ${input.acwr_value.toFixed(2)} (sweet spot 0.8-1.3 — adapted)`,
      }, lang));
    }
    if (input.indoor_sessions_7d != null && input.indoor_sessions_7d >= 4) {
      why.push(t({
        EN: `${input.indoor_sessions_7d} sessions in last 7 days — distributed load, no spike`,
        IS: `${input.indoor_sessions_7d} æfingar sl. 7 daga — distributed load, no spike`,
      }, lang));
    }
    action = t({
      EN: "No restrictions — full training, sprint work OK, max-intensity efforts allowed.",
      IS: "Engin takmörk — fullt æfing, sprint work OK, max-intensity efforts allowed.",
    }, lang);
    return { why, verify, action, ask };
  }

  if (input.verdict === "HOLD") {
    why.push(t({
      EN: "Coach set a manual hold (medical or other)",
      IS: "Coach setti manual hold (medical eða annað)",
    }, lang));
    action = t({
      EN: "Do not include in team session. Confirm reason with coach.",
      IS: "Ekki hafa með í team-session. Confirma með coach hvers vegna.",
    }, lang);
    return { why, verify, action, ask };
  }

  // NO_DATA
  why.push(t({
    EN: "Not enough data to give an explicit verdict",
    IS: "Ekki nóg gögn til að gefa explicit verdict",
  }, lang));
  if (!input.has_readiness_today) {
    verify.push(t({
      EN: "No readiness check-in today",
      IS: "Engin readiness submission í dag",
    }, lang));
    ask = t({
      EN: "Please submit a readiness check so we can score you",
      IS: "Skilaðu inn readiness check svo við getum gefið scoring",
    }, lang);
  }
  if (!input.trained_recently) {
    verify.push(t({
      EN: "No training data in recent weeks",
      IS: "Engin training data í síðustu vikum",
    }, lang));
  }
  action = t({
    EN: "Rely on coach's eye today.",
    IS: "Treysta á eyemark þjálfara í dag.",
  }, lang);
  return { why, verify, action, ask };
}
