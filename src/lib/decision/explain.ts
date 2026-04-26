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
  // ── Override + readiness context ─────────────────────────
  // When verdict is FULL but the system would have recommended RECOVERY or
  // MODIFIED based on STEN, the explanation must surface that conflict
  // rather than rendering load-only "all clear" text. Without this the
  // coach guidance gives "max-intensity OK" on a player whose self-reported
  // readiness is at the floor — a clinical safety hole.
  readiness_sten?: number | null;          // 1-10, computed via zToSten(_z_today)
  readiness_trend?: string | null;         // e.g. "sharply declining", "stable"
  is_overridden?: boolean;                 // coach has manually set FULL while STEN says otherwise
  system_recommendation?: "RECOVERY" | "MODIFIED" | "FULL" | null;
  // ── Composite load concern context ───────────────────────
  // Daily Briefing's Top Concerns flags players based on these signals
  // (MLI / fatigue type / PL spike) which the verdict logic doesn't
  // currently see. When verdict is FULL but these flag concern, surface
  // it so the coach guidance acknowledges the watch-this state instead
  // of saying "max-intensity OK" alongside a Top Concerns flag for the
  // same player.
  composite_concern_level?: "none" | "low" | "moderate" | "high" | null;
  fatigue_type?: string | null;             // mechanical_fatigue | metabolic_fatigue | global_fatigue | normal
  pl_spike_ratio?: number | null;           // today vs 28d baseline; ≥1.6 = spike
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
    // ── Override-aware branch ───────────────────────────────
    // If the coach has set FULL but STEN signals the player is below their
    // baseline, surface the conflict prominently. Without this we tell the
    // coach "max-intensity OK" on a player whose readiness is at the floor.
    if (input.is_overridden && input.readiness_sten != null && input.readiness_sten <= 4) {
      const sten = input.readiness_sten;
      const sysRec = input.system_recommendation ?? (sten <= 2 ? "RECOVERY" : "MODIFIED");
      const trendBit = input.readiness_trend ? `, ${input.readiness_trend} trend` : "";
      const trendBitIs = input.readiness_trend ? `, ${input.readiness_trend}` : "";

      why.push(t({
        EN: `Coach override active — system recommended ${sysRec} based on STEN ${sten}${trendBit}`,
        IS: `Coach override virkur — kerfið mælti með ${sysRec} út frá STEN ${sten}${trendBitIs}`,
      }, lang));
      why.push(t({
        EN: `Self-reported readiness is ${sten <= 2 ? "very low" : "below baseline"} — load picture below is healthy, but the player's body is signalling otherwise`,
        IS: `Sjálfs-mat á readiness er ${sten <= 2 ? "mjög lágt" : "undir baseline"} — load merki að neðan eru í lagi en líkami leikmannsins er að segja annað`,
      }, lang));
      // Add load context for transparency (so the coach sees both sides)
      if (input.composite_score != null) {
        why.push(t({
          EN: `Load: composite ${input.composite_score} (${input.composite_band ?? "balanced"})${input.acwr_value != null ? `, ACWR ${input.acwr_value.toFixed(2)}` : ""}`,
          IS: `Load: composite ${input.composite_score} (${input.composite_band ?? "balanced"})${input.acwr_value != null ? `, ACWR ${input.acwr_value.toFixed(2)}` : ""}`,
        }, lang));
      }
      verify.push(t({
        EN: "Confirm with player before warmup — sleep, soreness, anything outside training",
        IS: "Staðfestu með leikmanni fyrir warmup — svefn, harðsperrur, eitthvað utan æfingar",
      }, lang));
      verify.push(t({
        EN: "Watch RPE and body language during first 15 min — pull back if it doesn't lift",
        IS: "Fylgstu með RPE og body language fyrstu 15 mín — bakka ef það lyftist ekki",
      }, lang));
      action = sten <= 2
        ? t({
            EN: "Light start, modified-friendly. No max-intensity sprints in opening block. Re-assess after warmup — if still flat, drop to recovery work.",
            IS: "Léttur byrjunarkafli, modified-friendly. Engar max-intensity sprints í fyrsta blokk. Endurmettu eftir warmup — ef enn flatur, færðu yfir í recovery work.",
          }, lang)
        : t({
            EN: "Modified intensity start. Skip max-intensity sprints early. Watch warmup carefully — escalate to full only if body language is good.",
            IS: "Modified intensity í byrjun. Sleppa max-intensity sprints snemma. Fylgstu vel með warmup — escalate-aðu á fullt aðeins ef body language er góð.",
          }, lang);
      ask = sten <= 2
        ? t({
            EN: "How did you sleep, and how do your legs feel right now?",
            IS: "Hvernig svafstu og hvernig líður fótum þínum núna?",
          }, lang)
        : t({
            EN: "Anything outside training pulling on you (life, school, sleep)?",
            IS: "Eitthvað utan æfinga sem dregur á þig (líf, skóli, svefn)?",
          }, lang);
      return { why, verify, action, ask };
    }

    // ── Watchful-FULL branch ────────────────────────────────
    // STEN says ready, but composite concern signals (MLI / fatigue type
    // / PL spike) are flagging this player to Top Concerns on the Daily
    // Briefing. Without this branch the coach sees Aron flagged at the
    // top + "max-intensity OK" two scrolls down — contradictory. Surface
    // the watchful state instead.
    const concernHigh = input.composite_concern_level === "high";
    const concernMod = input.composite_concern_level === "moderate";
    const fatigueFlag = input.fatigue_type && input.fatigue_type !== "normal" ? input.fatigue_type : null;
    const plSpike = (input.pl_spike_ratio ?? 0) >= 1.6;
    const plElevated = !plSpike && (input.pl_spike_ratio ?? 0) >= 1.15;
    const isWatchful = concernHigh || concernMod || fatigueFlag != null || plSpike || plElevated;

    if (isWatchful) {
      const stenBit = input.readiness_sten != null ? `STEN ${input.readiness_sten}` : "readiness OK";
      why.push(t({
        EN: `Ready today (${stenBit}${input.readiness_trend ? `, ${input.readiness_trend}` : ""}) — body is reporting it can train`,
        IS: `Tilbúinn í dag (${stenBit}${input.readiness_trend ? `, ${input.readiness_trend}` : ""}) — líkaminn segir hann ráði við æfinguna`,
      }, lang));

      const fatigueLabelEn =
        fatigueFlag === "mechanical_fatigue" ? "mechanical load (sprints, decels)"
        : fatigueFlag === "metabolic_fatigue" ? "metabolic load (high-intensity running)"
        : fatigueFlag === "global_fatigue"    ? "overall accumulated load"
        : null;
      const fatigueLabelIs =
        fatigueFlag === "mechanical_fatigue" ? "mechanical álag (sprettir, decels)"
        : fatigueFlag === "metabolic_fatigue" ? "metabolic álag (high-intensity hlaup)"
        : fatigueFlag === "global_fatigue"    ? "heildar uppsafnað álag"
        : null;

      if (concernHigh) {
        why.push(t({
          EN: `Composite load concern: HIGH${fatigueLabelEn ? ` — ${fatigueLabelEn} in red zone` : ""}. Body is handling it now, may not next week if trend continues.`,
          IS: `Composite load concern: HÁTT${fatigueLabelIs ? ` — ${fatigueLabelIs} í rauðu` : ""}. Líkaminn ræður við það núna, gæti ekki næstu viku ef stefnan heldur.`,
        }, lang));
      } else if (concernMod) {
        why.push(t({
          EN: `Composite load concern: MODERATE${fatigueLabelEn ? ` — ${fatigueLabelEn} elevated` : ""}. Worth tracking across the week.`,
          IS: `Composite load concern: HÓF${fatigueLabelIs ? ` — ${fatigueLabelIs} hækkað` : ""}. Vert að fylgjast með í gegnum vikuna.`,
        }, lang));
      } else if (fatigueFlag) {
        why.push(t({
          EN: `Fatigue signal: ${fatigueLabelEn} flagged. Single-day, may resolve with normal recovery.`,
          IS: `Fatigue signal: ${fatigueLabelIs} flag-að. Einn dagur, getur hjaðnað með venjulegu recovery.`,
        }, lang));
      }

      if (plSpike && input.pl_spike_ratio != null) {
        why.push(t({
          EN: `PlayerLoad ${input.pl_spike_ratio.toFixed(2)}× above 28d baseline — acute spike (≥1.6× = injury risk window opens)`,
          IS: `PlayerLoad ${input.pl_spike_ratio.toFixed(2)}× yfir 28d baseline — acute spike (≥1.6× = injury risk gluggi opnast)`,
        }, lang));
      } else if (plElevated && input.pl_spike_ratio != null) {
        why.push(t({
          EN: `PlayerLoad ${input.pl_spike_ratio.toFixed(2)}× baseline — elevated but not spike (caution band 1.15–1.6×)`,
          IS: `PlayerLoad ${input.pl_spike_ratio.toFixed(2)}× baseline — hækkað en ekki spike (caution band 1.15–1.6×)`,
        }, lang));
      }

      verify.push(t({
        EN: "Compare today's composite + fatigue type to the 7-day rolling avg — is the trend rising?",
        IS: "Berðu saman composite + fatigue type í dag við 7-day rolling avg — er stefnan upp á við?",
      }, lang));
      if (fatigueFlag === "mechanical_fatigue") {
        verify.push(t({
          EN: "Check accel/decel volume — taper sprints/CoD if MLI keeps climbing day-on-day",
          IS: "Skoðaðu accel/decel volume — taper sprints/CoD ef MLI heldur áfram að hækka dag fyrir dag",
        }, lang));
      } else if (fatigueFlag === "metabolic_fatigue") {
        verify.push(t({
          EN: "Watch HR / sRPE response in warmup — pull intensity if recovery between drills lags",
          IS: "Fylgstu með HR / sRPE response í warmup — bakka intensity ef recovery milli drills dregst",
        }, lang));
      }

      action = concernHigh || plSpike
        ? t({
            EN: "Full session OK today, but treat as borderline. Skip the highest-intensity blocks (max sprints, contact). Watch volume across the rest of the week — drop a session if signal stays red.",
            IS: "Fullt session OK í dag, en líttu á þetta sem borderline. Sleppa hæstu intensity blokkum (max sprints, contact). Fylgstu með volume í afgangi vikunnar — sleppa session ef merki helst rautt.",
          }, lang)
        : t({
            EN: "Full session OK. One signal is elevated but not critical — keep an eye on it across the next 2–3 sessions before changing the plan.",
            IS: "Fullt session OK. Eitt merki er hækkað en ekki critical — fylgstu með í næstu 2-3 sessions áður en þú breytir plani.",
          }, lang);
      ask = t({
        EN: "How are your legs feeling — any heavy or stiff spots from yesterday?",
        IS: "Hvernig líður fótum þínum — eitthvað þungt eða stíft frá því í gær?",
      }, lang);
      return { why, verify, action, ask };
    }

    // ── Genuine FULL branch (no override conflict, no watchful flags) ──
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
