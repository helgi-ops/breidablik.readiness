/**
 * src/lib/micropulse/physicalAssessment/recommend.ts
 *
 * Physical Assessment Battery — Phase 3 recommendation engine.
 *
 * Turns a player's interpreted assessment profile (Phase 2) into a small set
 * of TRAINING FOCUS AREAS the coach can act on over the next macrocycle
 * (≈until the next 6-monthly assessment).
 *
 * A metric drives a focus area when it is either:
 *   • WEAK    — bottom quartile of the player's age band (percentile < 25), or
 *   • REGRESSING — measurably worse than the player's previous assessment.
 *
 * Youth-safety note: this is an academy group. Body-composition metrics
 * (body fat, skinfolds) deliberately do NOT generate a prescriptive focus
 * area — youth body composition is confounded by maturation and prescribing
 * fat-loss from a dashboard is inappropriate. When flagged they produce an
 * informational note routed to medical/nutrition staff instead.
 */

import type { PlayerAssessmentProfile, MetricReading } from "./interpret";

export type FocusPriority = "high" | "medium";

export type FocusArea = {
  code: string;
  titleEN: string;
  titleIS: string;
  priority: FocusPriority;
  /** Display names of the metrics that triggered this focus area. */
  triggerMetrics: string[];
  rationaleEN: string;
  rationaleIS: string;
  emphasisEN: string;
  emphasisIS: string;
};

export type Bilingual = { EN: string; IS: string };

export type AssessmentRecommendation = {
  focusAreas: FocusArea[];
  notes: Bilingual[];
};

const WEAK_PCTL = 25;

type FocusRule = {
  code: string;
  titleEN: string;
  titleIS: string;
  /** Catalog metric codes that feed this focus area. */
  metricCodes: string[];
  rationaleEN: string;
  rationaleIS: string;
  emphasisEN: string;
  emphasisIS: string;
};

/**
 * Focus-area rule set. Each rule keys on catalog metric codes — so it keeps
 * working regardless of the exact CSV headers the testing party uses, as
 * long as the upload wizard maps columns onto these codes.
 */
const FOCUS_RULES: FocusRule[] = [
  {
    code: "acceleration",
    titleEN: "Acceleration & short-sprint mechanics",
    titleIS: "Hröðun og stutt-sprett tækni",
    metricCodes: ["sprint_5m_s", "sprint_10m_s"],
    rationaleEN: "Short-distance sprint performance (0–10 m) sits below the player's age band or has regressed — the acceleration phase is the limiting factor.",
    rationaleIS: "Frammistaða í stuttum sprettum (0–10 m) er undir aldursflokki eða hefur versnað — hröðunarfasinn er takmarkandi þátturinn.",
    emphasisEN: "Resisted sprints and sled pushes, horizontal hip-extension power (hip thrust, broad jump), and deliberate 0–10 m start-mechanics drills.",
    emphasisIS: "Mótstöðusprettir og sleðaýtingar, lárétt mjaðma-réttukraft (hip thrust, langstökk), og markviss 0–10 m byrjunartækni-æfingar.",
  },
  {
    code: "max_velocity",
    titleEN: "Maximum velocity / top speed",
    titleIS: "Hámarkshraði",
    metricCodes: ["sprint_20m_s", "sprint_30m_s", "sprint_40m_s", "flying_10m_s", "flying_20m_s", "max_velocity_ms"],
    rationaleEN: "Top-speed metrics sit below the player's age band or have regressed — the player reaches a velocity ceiling earlier than peers.",
    rationaleIS: "Hámarkshraða-mælingar eru undir aldursflokki eða hafa versnað — leikmaðurinn nær hraðaþaki fyrr en jafnaldrar.",
    emphasisEN: "Flying sprints (20–30 m build-ups), wicket runs for stride mechanics, and high-speed posterior-chain exposure.",
    emphasisIS: "Fljúgandi sprettir (20–30 m uppbygging), wicket-hlaup fyrir skreftækni, og aftari-keðju álag á háum hraða.",
  },
  {
    code: "reactive_strength",
    titleEN: "Reactive strength",
    titleIS: "Reactive strength (teygju-styttu hringur)",
    metricCodes: ["rsi", "drop_jump_cm"],
    rationaleEN: "Reactive strength (RSI / drop jump) sits below the player's age band or has regressed — ground-contact stiffness and the stretch-shortening cycle are underdeveloped.",
    rationaleIS: "Reactive strength (RSI / fallstökk) er undir aldursflokki eða hefur versnað — stífleiki í jarðsnertingu og teygju-styttu hringurinn eru vanþróuð.",
    emphasisEN: "Low-amplitude plyometric progression (pogo hops, ankle-stiffness drills) building toward depth jumps, with short ground-contact targets.",
    emphasisIS: "Lág-amplitude plyometrísk stigvaxandi æfing (pogo-hopp, ökkla-stífleika æfingar) sem byggir upp í fallstökk, með stuttri jarðsnertingu sem markmiði.",
  },
  {
    code: "explosive_power",
    titleEN: "Explosive / concentric power",
    titleIS: "Sprengikraftur",
    metricCodes: ["cmj_height_cm", "squat_jump_cm", "broad_jump_cm"],
    rationaleEN: "Jump output (CMJ / squat jump / broad jump) sits below the player's age band or has regressed — concentric power production is a development priority.",
    rationaleIS: "Stökkgeta (CMJ / kyrrstöðustökk / langstökk) er undir aldursflokki eða hefur versnað — sprengikraftframleiðsla er þróunarforgangur.",
    emphasisEN: "Jump squats and trap-bar jumps, loaded countermovement work, and Olympic-lift derivatives scaled to the player's training age.",
    emphasisIS: "Stökk-hnébeygjur og trap-bar stökk, hlaðin sveiflustökk, og ólympískar lyftu-afleiður sniðnar að æfingaaldri leikmannsins.",
  },
  {
    code: "strength_foundation",
    titleEN: "Strength foundation & lean mass",
    titleIS: "Styrktargrunnur og vöðvamassi",
    metricCodes: ["lean_mass_kg"],
    rationaleEN: "Lean mass sits below the player's age band — a broad strength foundation supports long-term athletic development.",
    rationaleIS: "Vöðvamassi er undir aldursflokki — breiður styrktargrunnur styður langtíma íþróttaþróun.",
    emphasisEN: "Progressive full-body strength — squat, hinge, push and pull patterns scaled to training age — to build lean mass across the macrocycle.",
    emphasisIS: "Stigvaxandi heildar-styrkur — hnébeygja, mjaðmahjör, ýta og toga, sniðið að æfingaaldri — til að byggja vöðvamassa yfir þjálfunartímabilið.",
  },
];

/** Body-composition codes — handled as an informational note, never as a
 *  prescriptive focus area (youth-safety). */
const BODY_COMP_CODES = new Set(["body_fat_pct", "sum_skinfolds_mm"]);

function isWeak(m: MetricReading): boolean {
  return m.percentile != null && m.percentile < WEAK_PCTL;
}

/**
 * Build the recommendation for one player from their interpreted profile.
 */
export function buildAssessmentRecommendation(
  profile: PlayerAssessmentProfile,
): AssessmentRecommendation {
  const byCode = new Map(profile.metrics.map((m) => [m.code, m]));
  const focusAreas: FocusArea[] = [];
  const notes: Bilingual[] = [];

  for (const rule of FOCUS_RULES) {
    const triggerMetrics: string[] = [];
    let anyWeak = false;

    for (const code of rule.metricCodes) {
      const m = byCode.get(code);
      if (!m) continue;
      const weak = isWeak(m);
      const regressing = m.direction === "regressing";
      if (weak || regressing) {
        triggerMetrics.push(m.nameEN);
        if (weak) anyWeak = true;
      }
    }

    if (triggerMetrics.length === 0) continue;
    // Weak (below the age band) is a stronger signal than a regression that
    // still leaves the player mid-pack — prioritise accordingly.
    const priority: FocusPriority = anyWeak ? "high" : "medium";
    focusAreas.push({
      code: rule.code,
      titleEN: rule.titleEN,
      titleIS: rule.titleIS,
      priority,
      triggerMetrics,
      rationaleEN: rule.rationaleEN,
      rationaleIS: rule.rationaleIS,
      emphasisEN: rule.emphasisEN,
      emphasisIS: rule.emphasisIS,
    });
  }

  // Sort: high priority first, then by title for stability.
  focusAreas.sort((a, b) =>
    (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1) ||
    a.titleEN.localeCompare(b.titleEN));

  // ── Notes ────────────────────────────────────────────────────────────────

  // Body-composition: informational only, routed to staff. Never prescriptive.
  const flaggedBodyComp = profile.metrics.filter(
    (m) => BODY_COMP_CODES.has(m.code) && (isWeak(m) || m.direction === "regressing"),
  );
  if (flaggedBodyComp.length > 0) {
    notes.push({
      EN: `Body-composition metrics (${flaggedBodyComp.map((m) => m.nameEN).join(", ")}) are outside the typical range — interpret with maturation in mind and review with medical / nutrition staff rather than prescribing from this screen.`,
      IS: `Líkamssamsetningar-mælingar (${flaggedBodyComp.map((m) => m.nameIS).join(", ")}) eru utan dæmigerðs bils — túlkið með þroska í huga og farið yfir með læknis-/næringarteymi frekar en að ávísa út frá þessum skjá.`,
    });
  }

  // Regressions not already captured by a focus area.
  const coveredCodes = new Set(FOCUS_RULES.flatMap((r) => r.metricCodes));
  const otherRegressions = profile.metrics.filter(
    (m) => m.direction === "regressing" && !coveredCodes.has(m.code) && !BODY_COMP_CODES.has(m.code),
  );
  if (otherRegressions.length > 0) {
    notes.push({
      EN: `Regressed since last assessment: ${otherRegressions.map((m) => m.nameEN).join(", ")} — worth a closer look.`,
      IS: `Versnað frá síðustu mælingu: ${otherRegressions.map((m) => m.nameIS).join(", ")} — vert að skoða nánar.`,
    });
  }

  // No focus areas at all — a positive note.
  if (focusAreas.length === 0 && notes.length === 0) {
    notes.push({
      EN: "No focus area flagged — the player is at or above their age band across all measured metrics. Maintain the current programme.",
      IS: "Engin áhersla flögguð — leikmaðurinn er á eða yfir aldursflokki í öllum mældum þáttum. Haldið núverandi prógrammi.",
    });
  }

  // Cohort caveat when most metrics had too small a cohort to rank.
  const ranked = profile.metrics.filter((m) => m.percentile != null).length;
  if (profile.metrics.length > 0 && ranked === 0) {
    notes.push({
      EN: "Age-band ranking unavailable — too few players in this player's age band. Recommendations here rest on change-since-last-test only.",
      IS: "Röðun innan aldursflokks ófáanleg — of fáir leikmenn í aldursflokki. Ráðleggingar hér byggja eingöngu á breytingu frá síðustu mælingu.",
    });
  }

  return { focusAreas, notes };
}
