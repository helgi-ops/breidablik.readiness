/**
 * Game-Plan Fit — pure, IO-free engine.
 *
 * Per matchday, per player: is he physically ready TODAY to execute the tactical-physical
 * demands his ROLE requires against THIS opponent? A transparent composite of
 *   role demand  ×  opponent modifier  ×  player capacity  ×  readiness.
 * Rules compute the fit; the AI (elsewhere) only phrases it. ADVISORY ONLY — it never
 * reads or writes the readiness colour, the load target, or the daily decision. It is a
 * matchday PLANNING LENS layered beside readiness, never feeding back into it.
 *
 * Scientific basis (every weight cites its paper):
 *  - Bradley & Ade — read physical capacity against the tactical role, not a generic average.
 *  - Modric et al. 2019 (IJERPH 16:4032) — which running quality drives game performance is
 *    position-specific: forwards sprint (r=0.80); full-backs decel (r=-0.43); centre-backs
 *    HI-accel (r=0.49) + running distance (r=0.42); central mids greatest total distance.
 *  - Janetzki et al. 2023 — CMJ/neuromuscular is the validated readiness marker (V2 input).
 */

import { positionGroup } from "@/lib/micropulse/positionStyle";
import { QUALITY_BY_ID, type QualityId, type AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { GAME_PLAN_ROLE_DEMAND } from "@/lib/micropulse/roleModel";

export type Bi = { en: string; is: string };
export type Confidence = "high" | "moderate" | "low";
export type FitTier = "strong" | "caution" | "poor" | "unknown";
export type RoleGroup = "GK" | "CB" | "FB" | "CM" | "AM" | "CF" | "OTHER";
export type StyleTag = "low_block" | "high_press" | "direct" | "possession" | "balanced";

// ── Thresholds (transparent constants) ─────────────────────────────────────────
export const T = {
  strongPctl: 60,       // capacity position-percentile >= this (weighted) = strong for the role
  cautionPctl: 40,      // >= this = caution; below = poor
  coverageFloor: 0.25,  // demanded-weight fraction below which capacity is "not enough to judge"
  coverageMin: 0.4,     // below this a scored read is capped to LOW confidence (partial data — e.g. Lite aerobic-only)
  possHigh: 55, possLow: 45,   // opponent possession % (mirror opponentReport.T)
  ppdaPress: 1.5,       // opponent PPDA below league - this = high press; above + this = passive/low block
  // CMJ neuromuscular readiness (Janetzki 2023) — jump height vs own 6-wk norm. Mirrors the
  // app-wide VALD_THRESHOLDS so it agrees with the VALD snapshot.
  cmjModerateDropPct: 5, cmjSevereDropPct: 10, cmjApplyDays: 10,
};

export const CITATIONS = [
  "Bradley & Ade — integrated, role-contextualised physical model",
  "Modric et al. 2019 (IJERPH) — running ↔ game performance, position-specific",
  "Janetzki et al. 2023 — athlete-readiness markers (meta-analysis)",
];

// ── 1. Role demand profile — weights over capacity axes, per role (Modric + Bradley/Ade) ──
// The canonical table now lives in roleModel.ts (shared with Role-Demand Fit). Re-exported
// here so this engine's public API is unchanged. Base weights need not sum to 1 (normalised
// at compute time). GK is intentionally unscored.
export const ROLE_DEMAND: Record<Exclude<RoleGroup, "GK" | "OTHER">, Partial<Record<QualityId, number>>> = GAME_PLAN_ROLE_DEMAND;

// ── 2. Opponent / game-plan modifier — multiplicative up-weights on the role demand ──
export const OPPONENT_MODIFIERS: Record<StyleTag, Partial<Record<QualityId, number>>> = {
  // Low block, cross-heavy: a possession-chase, not a track meet — sustained engine + creation + aerial.
  low_block: { aerobic_endurance: 1.5, change_of_direction: 1.4, reactive_power: 1.2, speed: 0.8 },
  // High press: braking + short-burst reserve + quick transition.
  high_press: { deceleration: 1.5, anaerobic_reserve: 1.4, acceleration: 1.2, work_capacity: 1.1 },
  // Direct / counter: recovery-run engine + braking + aerial.
  direct: { aerobic_endurance: 1.4, deceleration: 1.3, reactive_power: 1.2 },
  // Possession: chase the ball — volume + engine.
  possession: { work_capacity: 1.2, aerobic_endurance: 1.2, change_of_direction: 1.1 },
  balanced: {},
};

const STYLE_LABEL: Record<StyleTag, Bi> = {
  low_block: { en: "low block / cross-heavy", is: "lág vörn / fyrirgjafamikið" },
  high_press: { en: "high press", is: "há pressa" },
  direct: { en: "direct / counter", is: "beint / skyndisóknir" },
  possession: { en: "possession", is: "boltahald" },
  balanced: { en: "balanced", is: "jafnvægi" },
};
export const styleLabel = (tag: StyleTag): Bi => STYLE_LABEL[tag];

const ROLE_LABEL: Record<RoleGroup, Bi> = {
  GK: { en: "Goalkeeper", is: "Markvörður" }, CB: { en: "Centre-back", is: "Miðvörður" },
  FB: { en: "Full-back", is: "Bakvörður" }, CM: { en: "Central midfield", is: "Miðjumaður" },
  AM: { en: "Wide / attacking mid", is: "Kant-/sóknarmiðja" }, CF: { en: "Forward", is: "Framherji" },
  OTHER: { en: "Outfield", is: "Útileikmaður" },
};

// ── Opponent metrics (only the fields the style classifier needs) ──────────────
export type OppStyleMetrics = { possession: number | null; ppda: number | null };

/** Suggest the opponent style tag from the scouted season profile vs the league (same
 *  thresholds as opponentReport). Falls back to `balanced` when the numbers are absent. */
export function classifyOpponentStyle(opp: OppStyleMetrics, league: OppStyleMetrics): { tag: StyleTag; why: Bi } {
  const has = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);
  if (has(opp.possession) && opp.possession >= T.possHigh)
    return { tag: "possession", why: { en: `Possession ${opp.possession.toFixed(0)}% — they keep the ball.`, is: `Boltahald ${opp.possession.toFixed(0)}% — þeir halda boltanum.` } };
  if (has(opp.ppda) && has(league.ppda) && opp.ppda <= league.ppda - T.ppdaPress)
    return { tag: "high_press", why: { en: `PPDA ${opp.ppda.toFixed(1)} (league ${league.ppda.toFixed(1)}) — they press high.`, is: `PPDA ${opp.ppda.toFixed(1)} (deild ${league.ppda.toFixed(1)}) — þeir pressa hátt.` } };
  if (has(opp.possession) && opp.possession <= T.possLow)
    return { tag: "direct", why: { en: `Possession ${opp.possession.toFixed(0)}% — they play direct.`, is: `Boltahald ${opp.possession.toFixed(0)}% — þeir spila beint.` } };
  if (has(opp.ppda) && has(league.ppda) && opp.ppda >= league.ppda + T.ppdaPress)
    return { tag: "low_block", why: { en: `PPDA ${opp.ppda.toFixed(1)} (league ${league.ppda.toFixed(1)}) — they sit in a block.`, is: `PPDA ${opp.ppda.toFixed(1)} (deild ${league.ppda.toFixed(1)}) — þeir sitja í vörn.` } };
  return { tag: "balanced", why: { en: "No standout style in the numbers — treating them as balanced.", is: "Enginn afgerandi stíll í tölunum — meðhöndlað sem jafnvægi." } };
}

// ── Role from position ─────────────────────────────────────────────────────────
export function roleFromPosition(position: string | null, positionGroupHint?: string | null): RoleGroup {
  const g = (positionGroupHint ?? (position ? positionGroup(position, null) : null) ?? "").toUpperCase();
  if (g === "GK" || g === "CB" || g === "FB" || g === "CM" || g === "AM" || g === "CF") return g;
  return "OTHER";
}

// ── Outputs ────────────────────────────────────────────────────────────────────
export type DemandRow = { quality: QualityId; weight: number; percentile: number | null };
export type FitRead = {
  playerId: string;
  name: string;
  position: string | null;
  role: RoleGroup;
  scored: boolean;              // false for GK / unmapped roles
  verdict: FitTier;
  headline: Bi;
  driver: Bi;
  facts: Bi[];
  capacityPct: number | null;   // demand-weighted position percentile (0-100)
  capacityTier: FitTier;
  readinessColor: string | null;
  readinessTier: FitTier;       // wellness-colour tier (shown as the colour, never changed)
  cmjDropPct: number | null;    // CMJ jump height vs own 6-wk norm, % (negative = below)
  cmjTier: FitTier | null;      // neuromuscular tier — a distinct signal beside the colour
  confidence: Confidence;
  counterfactual: Bi | null;
  advice: Bi | null;            // one concrete, overridable coaching lever for a non-strong fit
  opponentTag: StyleTag;
  demand: DemandRow[];          // layer 2 — the weights and percentiles
  citations: string[];
};

// Per-instruction advice — one concrete lever per limiting capacity axis (advisory, coach
// overrides). The mechanism is named so it reads as a prompt, not a prescription.
const ADVICE_BY_QUALITY: Partial<Record<QualityId, Bi>> = {
  speed: { en: "he won't win a foot-race today — use him to hold and link, and pair a runner alongside to stretch the line.", is: "hann vinnur ekki spretthlaup í dag — notaðu hann til að halda og tengja, og settu hlaupara við hlið hans til að teygja vörnina." },
  acceleration: { en: "protect the space behind him — start the line a touch deeper and cover with the holding mid.", is: "verndaðu svæðið á bak við hann — byrjaðu vörnina aðeins dýpra og hyldu með varnarmiðjunni." },
  deceleration: { en: "cut his braking exposure — fewer overlaps / recovery sprints; a deeper starting position saves the hard stops.", is: "minnkaðu hemlunar-álagið — færri overlaps / recovery-spretti; dýpri byrjunarstaða sparar hörðu stoppin." },
  anaerobic_reserve: { en: "ration his repeated max sprints — pick the moments to run in behind rather than every transition.", is: "skammtaðu endurteknu hámarks-sprettina — veldu augnablikin til að hlaupa á bak við frekar en hverja umskiptingu." },
  aerobic_endurance: { en: "keep the engine fresh — shorter shifts or an earlier sub, and pair him with a higher-endurance partner.", is: "haltu vélinni ferskri — styttri skiptingar eða fyrri skiptingu, og paraðu hann með þolmeiri félaga." },
  work_capacity: { en: "reduce his covering load — tighten his zone so he isn't asked to run the most metres in this game.", is: "minnkaðu yfirferðar-álagið — þrengdu svæðið hans svo hann þurfi ekki að hlaupa flesta metrana í þessum leik." },
  change_of_direction: { en: "simplify his role in tight spaces — fewer isolation 1v1s, more first-time combinations.", is: "einfaldaðu hlutverk hans í þröngum rýmum — færri einangruð 1v1, meira fyrsta-snertingar samspil." },
  reactive_power: { en: "manage the aerial/jump load — assign set-piece marking to a fresher jumper.", is: "stýrðu loft-/stökk-álaginu — settu fastaleikja-markvörslu á ferskari stökkvara." },
};

export type FitInput = {
  playerId: string;
  name: string;
  position: string | null;
  profile: AthleteProfile | null;   // from buildAthleteProfile
  readinessColor: string | null;    // v_coach_readiness_today_v8.final_color
  readinessImputed: boolean;        // is_imputed — an estimate, not a real check-in
  opponentTag: StyleTag;
  // CMJ neuromuscular freshness (Janetzki 2023) — jump height vs own norm. Optional; when
  // present and recent it sharpens the readiness gate (can only downgrade, never upgrade).
  cmj?: { dropPct: number | null; daysSince: number | null } | null;
};

const TIER_RANK: Record<FitTier, number> = { poor: 0, caution: 1, strong: 2, unknown: -1 };
const worseTier = (a: FitTier, b: FitTier): FitTier => (TIER_RANK[a] <= TIER_RANK[b] ? a : b);
const readinessTierOf = (color: string | null): FitTier => {
  const c = (color ?? "").toUpperCase();
  if (c === "GREEN" || c === "GREEN_PLUS") return "strong";
  if (c === "YELLOW") return "caution";
  if (c === "RED") return "poor";
  return "unknown";
};
const capLabel = (id: QualityId, lang: "en" | "is") => QUALITY_BY_ID[id][lang];
const nth = (p: number) => `${Math.round(p)}${p % 10 === 1 && p % 100 !== 11 ? "st" : p % 10 === 2 && p % 100 !== 12 ? "nd" : p % 10 === 3 && p % 100 !== 13 ? "rd" : "th"}`;

/** The four-layer fit for one player. Pure — every number is traceable to a layer. */
export function computeGamePlanFit(input: FitInput): FitRead {
  const { playerId, name, position, profile, readinessColor, readinessImputed, opponentTag } = input;
  const role = roleFromPosition(position, profile?.positionGroup ?? null);
  const wellnessTier = readinessTierOf(readinessColor);
  // CMJ neuromuscular signal — only applied when recent and it has a baseline.
  const cmjApplies = !!input.cmj && input.cmj.dropPct != null && (input.cmj.daysSince == null || input.cmj.daysSince <= T.cmjApplyDays);
  const cmjDropPct = cmjApplies ? (input.cmj!.dropPct as number) : null;
  const cmjTier: FitTier | null = cmjDropPct == null ? null
    : cmjDropPct <= -T.cmjSevereDropPct ? "poor" : cmjDropPct <= -T.cmjModerateDropPct ? "caution" : "strong";
  // The gate: CMJ can only DOWNGRADE the wellness colour, never upgrade it (advisory).
  const gateReadinessTier: FitTier = cmjTier && wellnessTier !== "unknown" ? worseTier(wellnessTier, cmjTier) : wellnessTier;
  const base: FitRead = {
    playerId, name, position, role, scored: false, verdict: "unknown",
    headline: { en: "", is: "" }, driver: { en: "", is: "" }, facts: [],
    capacityPct: null, capacityTier: "unknown", readinessColor, readinessTier: wellnessTier,
    cmjDropPct, cmjTier, confidence: "low", counterfactual: null, advice: null, opponentTag, demand: [], citations: CITATIONS,
  };

  // GK / unmapped roles: honest out-of-scope (the outfield demand model doesn't apply).
  if (role === "GK" || role === "OTHER") {
    return { ...base,
      headline: role === "GK"
        ? { en: `${name} — Goalkeeper. Outfield fit model out of scope.`, is: `${name} — Markvörður. Útileikmanna-líkanið á ekki við.` }
        : { en: `${name} — role not mapped for fit.`, is: `${name} — leikstaða ekki kortlögð fyrir fit.` },
      driver: { en: "Not scored.", is: "Ekki metið." } };
  }

  // Layer 1 × 2 — role demand modified by the opponent style, then normalised.
  const baseW = ROLE_DEMAND[role];
  const mod = OPPONENT_MODIFIERS[opponentTag];
  const raw: Array<{ quality: QualityId; weight: number }> = (Object.keys(baseW) as QualityId[])
    .map((q) => ({ quality: q, weight: (baseW[q] ?? 0) * (mod[q] ?? 1) }));
  const wSum = raw.reduce((s, r) => s + r.weight, 0) || 1;
  const findPctl = (q: QualityId): number | null => profile?.qualities.find((x) => x.id === q)?.positionPercentile ?? null;
  const demand: DemandRow[] = raw.map((r) => ({ quality: r.quality, weight: r.weight / wSum, percentile: findPctl(r.quality) }));

  // Layer 3 — capacity: demand-weighted position percentile over the covered qualities.
  const covered = demand.filter((d) => d.percentile != null);
  const coveredWeight = covered.reduce((s, d) => s + d.weight, 0); // fraction of demand with data
  const capacityPct = covered.length ? covered.reduce((s, d) => s + d.weight * (d.percentile as number), 0) / coveredWeight : null;
  const partialCapacity = coveredWeight >= T.coverageFloor && coveredWeight < T.coverageMin; // e.g. Lite aerobic-only
  const capacityTier: FitTier = capacityPct == null || coveredWeight < T.coverageFloor ? "unknown"
    : capacityPct >= T.strongPctl ? "strong" : capacityPct >= T.cautionPctl ? "caution" : "poor";

  // Layer 4 — gate by readiness (wellness colour, sharpened by the CMJ neuromuscular signal).
  // Fit needs BOTH capacity and readiness; a missing layer → unknown.
  const verdict: FitTier = (capacityTier === "unknown" || gateReadinessTier === "unknown")
    ? "unknown" : worseTier(capacityTier, gateReadinessTier);

  // Confidence — coverage + readiness presence/imputation + overall athlete coverage.
  const ratio = profile?.coverage.ratio ?? 0;
  let confidence: Confidence = "moderate";
  if (coveredWeight < T.coverageMin || wellnessTier === "unknown") confidence = "low"; // partial data → low
  else if (coveredWeight >= 0.7 && ratio >= 0.5 && !readinessImputed) confidence = "high";
  if (readinessImputed && confidence === "high") confidence = "moderate";

  const roleName = ROLE_LABEL[role];
  const styLbl = STYLE_LABEL[opponentTag];
  // The limiting / enabling driver quality (highest weight × shortfall / surplus).
  const limiter = [...covered].sort((a, b) => (b.weight * (100 - (b.percentile as number))) - (a.weight * (100 - (a.percentile as number))))[0];
  const enabler = [...covered].sort((a, b) => (b.weight * (b.percentile as number)) - (a.weight * (a.percentile as number)))[0];

  // Unknown verdict — say which layer is missing, never guess.
  if (verdict === "unknown") {
    const missing = capacityTier === "unknown" && gateReadinessTier === "unknown"
      ? { en: "no capacity data and no readiness check-in", is: "engin getu-gögn og engin readiness-skráning" }
      : capacityTier === "unknown"
        ? { en: "not enough movement-capacity data for his role", is: "ekki nóg hreyfigetu-gögn fyrir hans stöðu" }
        : { en: "no readiness check-in today", is: "engin readiness-skráning í dag" };
    return { ...base, scored: true, verdict: "unknown", capacityPct, capacityTier, confidence, demand, opponentTag,
      headline: { en: `${name} — ${roleName.en}. Not enough to judge fit today.`, is: `${name} — ${roleName.is}. Ekki nóg til að dæma fit í dag.` },
      driver: { en: `Can't judge — ${missing.en}.`, is: `Ekki hægt að dæma — ${missing.is}.` },
      facts: [{ en: `Plan taxes ${capLabel(demand[0].quality, "en")} for a ${roleName.en.toLowerCase()} vs a ${styLbl.en} opponent.`, is: `Áætlunin reynir á ${capLabel(demand[0].quality, "is")} hjá ${roleName.is.toLowerCase()} gegn ${styLbl.is} andstæðingi.` }] };
  }

  // Scored verdict — the gate picks the worse of capacity and readiness; name the driver.
  const readinessWorse = TIER_RANK[gateReadinessTier] < TIER_RANK[capacityTier];
  // CMJ is the reason for the readiness drop when it is worse than the wellness colour.
  const cmjDriven = cmjTier != null && TIER_RANK[cmjTier] < TIER_RANK[wellnessTier];
  const cmjTxt = cmjDropPct != null ? `${Math.abs(Math.round(cmjDropPct))}%` : "";
  const tierWord = (t: FitTier): Bi => t === "strong" ? { en: "strong", is: "sterkt" } : t === "caution" ? { en: "caution", is: "varúð" } : { en: "poor", is: "veikt" };
  const vWord = tierWord(verdict);
  const colorTxt = (readinessColor ?? "").toUpperCase().replace("_", " ");

  let driver: Bi;
  let counterfactual: Bi | null = null;
  if (readinessWorse && cmjDriven) {
    driver = { en: `CMJ ${cmjTxt} below his norm — neuromuscular fatigue (wellness ${colorTxt}).`, is: `CMJ ${cmjTxt} undir hans venju — taugavöðva-þreyta (wellness ${colorTxt}).` };
    counterfactual = { en: `At his own CMJ norm → ${tierWord(worseTier(capacityTier, wellnessTier)).en} fit.`, is: `Við hans eigin CMJ-venju → ${tierWord(worseTier(capacityTier, wellnessTier)).is} fit.` };
  } else if (readinessWorse) {
    driver = { en: `Readiness ${colorTxt}${readinessImputed ? " (estimated)" : ""} — the limiter today.`, is: `Readiness ${colorTxt}${readinessImputed ? " (áætlað)" : ""} — takmörkunin í dag.` };
    counterfactual = { en: `If his readiness were GREEN → ${tierWord(capacityTier).en} fit (his capacity for this plan).`, is: `Ef readiness væri GRÆNT → ${tierWord(capacityTier).is} fit (getan hans fyrir þessa áætlun).` };
  } else if (limiter && (capacityTier !== "strong")) {
    const p = limiter.percentile as number;
    driver = { en: `${capLabel(limiter.quality, "en")} ${nth(p)} pct for a ${roleName.en.toLowerCase()} — the limiter.`, is: `${capLabel(limiter.quality, "is")} ${Math.round(p)}. hundraðsraðar hjá ${roleName.is.toLowerCase()} — takmörkunin.` };
    counterfactual = { en: `At role-median ${capLabel(limiter.quality, "en").toLowerCase()} → a stronger fit.`, is: `Við miðgildi stöðu í ${capLabel(limiter.quality, "is").toLowerCase()} → sterkara fit.` };
  } else {
    driver = enabler
      ? { en: `${capLabel(enabler.quality, "en")} ${nth(enabler.percentile as number)} pct drives the plan; readiness ${colorTxt}.`, is: `${capLabel(enabler.quality, "is")} ${Math.round(enabler.percentile as number)}. hundraðsraðar knýr áætlunina; readiness ${colorTxt}.` }
      : { en: `Ready and capable for the plan.`, is: `Klár og fær í áætlunina.` };
  }

  const facts: Bi[] = [
    { en: `Plan needs ${capLabel(demand[0].quality, "en")} for a ${roleName.en.toLowerCase()} vs a ${styLbl.en} opponent.`, is: `Áætlunin þarf ${capLabel(demand[0].quality, "is")} hjá ${roleName.is.toLowerCase()} gegn ${styLbl.is} andstæðingi.` },
    enabler ? { en: `${capLabel(enabler.quality, "en")} is ${nth(enabler.percentile as number)} pct for his role.`, is: `${capLabel(enabler.quality, "is")} er ${Math.round(enabler.percentile as number)}. hundraðsraðar fyrir hans stöðu.` } : { en: "Capacity data is thin.", is: "Getu-gögn eru þunn." },
    { en: `Readiness ${colorTxt}${readinessImputed ? " (estimated)" : ""}.`, is: `Readiness ${colorTxt}${readinessImputed ? " (áætlað)" : ""}.` },
  ];
  if (cmjDropPct != null) {
    const up = cmjDropPct >= 0;
    facts.push(up
      ? { en: `CMJ ${cmjTxt} above his 6-wk norm — neuromuscularly fresh.`, is: `CMJ ${cmjTxt} yfir 6-vikna venju — taugavöðva-ferskur.` }
      : { en: `CMJ ${cmjTxt} below his 6-wk norm${cmjTier === "poor" ? " — meaningful drop" : cmjTier === "caution" ? " — moderate drop" : ""}.`, is: `CMJ ${cmjTxt} undir 6-vikna venju${cmjTier === "poor" ? " — marktæk lækkun" : cmjTier === "caution" ? " — hófleg lækkun" : ""}.` });
  }
  if (partialCapacity) facts.push({ en: "Partial capacity — only his conditioning (field-test) axis is measured for this role; read at low confidence.", is: "Hluti getu — aðeins þol-ás (vallarpróf) er mældur fyrir þessa stöðu; lesið með lágri vissu." });

  // Per-instruction advice — a concrete lever for a non-strong fit, tied to the limiter.
  let advice: Bi | null = null;
  if (verdict !== "strong") {
    if (readinessWorse && cmjDriven) advice = { en: "Consider: manage his high-intensity load and recheck CMJ pre-match — the neuromuscular dip may recover with 24-48h.", is: "Íhugaðu: stýrðu há-ákafa álaginu og endurmældu CMJ fyrir leik — taugavöðva-lækkunin gæti jafnað sig á 24-48 klst." };
    else if (readinessWorse) advice = { en: "Consider: manage his minutes / an earlier sub, or rotate — readiness is the drag, not the plan.", is: "Íhugaðu: stýrðu mínútum hans / fyrri skiptingu, eða snúðu — readiness er dragbíturinn, ekki áætlunin." };
    else if (limiter && capacityTier !== "strong") { const a = ADVICE_BY_QUALITY[limiter.quality]; if (a) advice = { en: `Consider: ${a.en}`, is: `Íhugaðu: ${a.is}` }; }
  }

  return {
    ...base, scored: true, verdict, capacityPct, capacityTier, confidence, counterfactual, advice, demand, opponentTag, driver, facts,
    headline: { en: `${name} — ${roleName.en}. ${cap(vWord.en)} fit today.`, is: `${name} — ${roleName.is}. ${cap(vWord.is)} fit í dag.` },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
