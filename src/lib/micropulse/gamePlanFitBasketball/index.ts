/**
 * Game-Plan Fit (basketball) — pure, IO-free engine.
 *
 * Per matchup, per player: does his ROLE's skill profile FIT what THIS opponent's style
 * demands, and is he ready TODAY? A transparent composite of
 *   role demand  ×  opponent modifier  ×  player capacity  ×  readiness.
 * Basketball is indoor / no-GPS, so "capacity" is box-score SKILL percentiles within his
 * position group (not GPS/VALD movement qualities). Rules compute the fit; ADVISORY ONLY —
 * it never reads or writes the readiness colour, the load target, or the daily decision.
 *
 * Basis: Oliver 2004 (Basketball on Paper — role/efficiency framing); Kubatko et al. 2007
 * (possession-based per-game rates); role-based matchup scouting (defend the opponent's
 * strength with the fitting skill set). Mirrors the football Game-Plan Fit house style.
 */

import { basketballPositionFamily, type BasketballFamily } from "@/lib/micropulse/playerBasketballStats";

export type Bi = { en: string; is: string };
export type Confidence = "high" | "moderate" | "low";
export type FitTier = "strong" | "caution" | "poor" | "unknown";
export type BStyleTag = "three_heavy" | "paint_heavy" | "pressure" | "fast_pace" | "glass" | "balanced";

export type BQualityId =
  | "scoring" | "efficiency" | "perimeter_shooting" | "playmaking" | "ball_security"
  | "rebounding" | "offensive_rebounding" | "perimeter_defense" | "rim_protection"
  | "free_throw" | "interior_scoring";

// ── Thresholds ─────────────────────────────────────────────────────────────────
export const T = {
  strongPctl: 60,       // demand-weighted skill percentile >= this = strong for the role
  cautionPctl: 40,      // >= this = caution; below = poor
  coverageFloor: 0.25,  // demanded-weight fraction with data below which capacity = unknown
  coverageMin: 0.4,     // below this a scored read is capped to LOW confidence
};

export const CITATIONS = [
  "Oliver 2004 — Basketball on Paper: role & efficiency framing",
  "Kubatko et al. 2007 — possession-based per-game rates",
  "Role-based matchup scouting — defend the opponent's strength with the fitting skill set",
];

/** The metric key (basketball catalog) each quality reads — used by the loader. */
export const QUALITY_METRIC: Record<BQualityId, string> = {
  scoring: "Points per game",
  efficiency: "True shooting %",
  perimeter_shooting: "Three-point %",
  playmaking: "Assists per game",
  ball_security: "Assist to turnover",
  rebounding: "Rebounds per game",
  offensive_rebounding: "Offensive rebounds per game",
  perimeter_defense: "Steals per game",
  rim_protection: "Blocks per game",
  free_throw: "Free throws %",
  interior_scoring: "Field goals %",
};

export const BQUALITY_LABEL: Record<BQualityId, Bi> = {
  scoring: { en: "Scoring", is: "Skorun" },
  efficiency: { en: "Scoring efficiency", is: "Skorunar-nýting" },
  perimeter_shooting: { en: "Perimeter shooting", is: "3ja stiga skot" },
  playmaking: { en: "Playmaking", is: "Spilastjórnun" },
  ball_security: { en: "Ball security", is: "Boltameðferð" },
  rebounding: { en: "Rebounding", is: "Fráköst" },
  offensive_rebounding: { en: "Offensive rebounding", is: "Sóknarfráköst" },
  perimeter_defense: { en: "Perimeter defence", is: "Vörn á jaðri" },
  rim_protection: { en: "Rim protection", is: "Vörn við körfu" },
  free_throw: { en: "Free-throw shooting", is: "Vítaskot" },
  interior_scoring: { en: "Interior scoring", is: "Skorun undir körfu" },
};

// ── 1. Role demand — skill weights per position family ──────────────────────────
export const ROLE_DEMAND: Record<BasketballFamily, Partial<Record<BQualityId, number>>> = {
  // Guard: initiate + shoot + take care of the ball + pressure the point of attack.
  GUARD: { playmaking: 0.28, perimeter_shooting: 0.24, ball_security: 0.18, perimeter_defense: 0.16, scoring: 0.14 },
  // Wing: space + score + guard the opponent's wing scorer; secondary rebounding.
  WING: { perimeter_shooting: 0.28, scoring: 0.22, perimeter_defense: 0.20, efficiency: 0.16, rebounding: 0.14 },
  // Big: control the glass + finish inside + protect the rim + second-chance points + free throws.
  BIG: { rebounding: 0.28, interior_scoring: 0.24, rim_protection: 0.20, offensive_rebounding: 0.16, free_throw: 0.12 },
};

// ── 2. Opponent style modifier — multiplicative up-weights on the role demand ────
export const OPPONENT_MODIFIERS: Record<BStyleTag, Partial<Record<BQualityId, number>>> = {
  // Three-point heavy: perimeter defence + closeouts matter most.
  three_heavy: { perimeter_defense: 1.6, perimeter_shooting: 1.2 },
  // Paint / inside heavy: rim protection + rebounding + interior D.
  paint_heavy: { rim_protection: 1.6, rebounding: 1.4, interior_scoring: 1.1 },
  // Ball-pressure / forces turnovers: ball security + a steady initiator.
  pressure: { ball_security: 1.7, playmaking: 1.2 },
  // Fast pace / transition: get-back defence + secure the ball + run.
  fast_pace: { perimeter_defense: 1.3, ball_security: 1.2, scoring: 1.1 },
  // Dominant on the glass: rebounding, both ends.
  glass: { rebounding: 1.6, offensive_rebounding: 1.5 },
  balanced: {},
};

const STYLE_LABEL: Record<BStyleTag, Bi> = {
  three_heavy: { en: "three-point heavy", is: "þriggja-stiga sinnað" },
  paint_heavy: { en: "paint / inside", is: "sókn undir körfu" },
  pressure: { en: "ball pressure", is: "pressa á bolta" },
  fast_pace: { en: "fast pace", is: "hraður leikur" },
  glass: { en: "dominant on the glass", is: "sterkt í fráköstum" },
  balanced: { en: "balanced", is: "jafnvægi" },
};
export const styleLabel = (tag: BStyleTag): Bi => STYLE_LABEL[tag];

const FAMILY_LABEL: Record<BasketballFamily, Bi> = {
  GUARD: { en: "Guard", is: "Bakvörður" },
  WING: { en: "Wing", is: "Kantmaður" },
  BIG: { en: "Big", is: "Miðherji" },
};

/** Opponent season rates the style classifier needs (per game / %). */
export type OppStyleMetrics = {
  threePtRate: number | null;   // 3PA / FGA (share of shots from three)
  possessions: number | null;   // pace
  oppTurnovers: number | null;  // turnovers they force (i.e. our TOs) — optional
  orebPerGame: number | null;   // their offensive rebounds/game
};

/** Suggest the opponent style from the scouted season profile. Falls back to balanced. */
export function classifyOpponentStyle(opp: OppStyleMetrics, league: OppStyleMetrics): { tag: BStyleTag; why: Bi } {
  const has = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);
  if (has(opp.threePtRate) && opp.threePtRate >= 0.42)
    return { tag: "three_heavy", why: { en: `${Math.round(opp.threePtRate * 100)}% of their shots are threes — they live on the perimeter.`, is: `${Math.round(opp.threePtRate * 100)}% skota þeirra eru þristar — þeir spila á jaðrinum.` } };
  if (has(opp.orebPerGame) && has(league.orebPerGame) && opp.orebPerGame >= league.orebPerGame + 2)
    return { tag: "glass", why: { en: `${opp.orebPerGame.toFixed(1)} offensive rebounds/game — they dominate the glass.`, is: `${opp.orebPerGame.toFixed(1)} sóknarfráköst/leik — þeir ráða fráköstunum.` } };
  if (has(opp.threePtRate) && opp.threePtRate <= 0.28)
    return { tag: "paint_heavy", why: { en: `Only ${Math.round(opp.threePtRate * 100)}% of shots from three — they attack the paint.`, is: `Aðeins ${Math.round(opp.threePtRate * 100)}% skota frá þristi — þeir sækja undir körfu.` } };
  if (has(opp.possessions) && has(league.possessions) && opp.possessions >= league.possessions + 3)
    return { tag: "fast_pace", why: { en: `${opp.possessions.toFixed(0)} possessions/game — a fast pace.`, is: `${opp.possessions.toFixed(0)} sóknir/leik — hraður leikur.` } };
  return { tag: "balanced", why: { en: "No standout style in the numbers — treating them as balanced.", is: "Enginn afgerandi stíll í tölunum — meðhöndlað sem jafnvægi." } };
}

// ── Outputs ──────────────────────────────────────────────────────────────────────
export type DemandRow = { quality: BQualityId; weight: number; percentile: number | null };
export type FitRead = {
  playerId: string;
  name: string;
  position: string | null;
  family: BasketballFamily;
  scored: boolean;
  verdict: FitTier;
  headline: Bi;
  driver: Bi;
  facts: Bi[];
  capacityPct: number | null;
  capacityTier: FitTier;
  readinessColor: string | null;
  readinessTier: FitTier;
  confidence: Confidence;
  counterfactual: Bi | null;
  advice: Bi | null;
  opponentTag: BStyleTag;
  demand: DemandRow[];
  citations: string[];
};

const ADVICE_BY_QUALITY: Partial<Record<BQualityId, Bi>> = {
  playmaking: { en: "let another initiator bring the ball up in his minutes — use him off the ball.", is: "láttu annan spilastjóra koma boltanum upp í hans mínútum — notaðu hann án bolta." },
  perimeter_shooting: { en: "don't rely on him to space the floor — give him cuts and dribble-drives instead.", is: "treystu ekki á hann til að opna völlinn — gefðu honum skurði og drif í staðinn." },
  ball_security: { en: "simplify his reads vs pressure — fewer live-dribble decisions, quicker outlets.", is: "einfaldaðu ákvarðanir hans gegn pressu — færri rekstrar-ákvarðanir, hraðari sendingar." },
  perimeter_defense: { en: "hide him on their weakest perimeter scorer and help off him.", is: "feldu hann á veikasta jaðar-skorara þeirra og hjálpaðu af honum." },
  rebounding: { en: "assign boxing-out to a stronger rebounder; get him back in transition instead.", is: "settu útilokun á sterkari fráköstumann; komdu honum frekar til baka í vörn." },
  rim_protection: { en: "drop him deeper in coverage and bring help early — he won't erase shots at the rim.", is: "láttu hann síga dýpra og komdu með hjálp snemma — hann ver ekki skot við körfuna." },
  interior_scoring: { en: "get him easier looks (cuts, offensive rebounds) rather than post-ups.", is: "gefðu honum léttari færi (skurði, sóknarfráköst) frekar en póst.", },
  free_throw: { en: "avoid late-game situations where he'll be fouled; sub for a better FT shooter.", is: "forðastu lokakafla þar sem á hann verður brotið; skiptu inn betri vítaskyttu." },
  scoring: { en: "don't build the plan around his scoring — use him as a connector.", is: "byggðu ekki áætlunina á skorun hans — notaðu hann sem tengilið." },
  efficiency: { en: "pick his spots — fewer tough contested attempts.", is: "veldu hans færi — færri erfið, varin skot." },
  offensive_rebounding: { en: "prioritise transition defence over crashing the glass with him.", is: "forgangsraðaðu vörn í umskiptingum fram yfir að sækja fráköst með honum." },
};

export type FitInput = {
  playerId: string;
  name: string;
  position: string | null;
  percentiles: Partial<Record<BQualityId, number>>;  // 0-100 within his family, from the loader
  coverageRatio: number;                             // fraction of squad-comparable qualities he has
  readinessColor: string | null;                     // v_coach_readiness_today_v8.final_color
  readinessImputed: boolean;
  opponentTag: BStyleTag;
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
const capLabel = (id: BQualityId, lang: "en" | "is") => BQUALITY_LABEL[id][lang];
const nth = (p: number) => `${Math.round(p)}${p % 10 === 1 && p % 100 !== 11 ? "st" : p % 10 === 2 && p % 100 !== 12 ? "nd" : p % 10 === 3 && p % 100 !== 13 ? "rd" : "th"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The four-layer basketball fit for one player. Pure — every number traceable to a layer. */
export function computeBasketballFit(input: FitInput): FitRead {
  const { playerId, name, position, percentiles, readinessColor, readinessImputed, opponentTag } = input;
  const family = basketballPositionFamily(position);
  const readinessTier = readinessTierOf(readinessColor);

  const base: FitRead = {
    playerId, name, position, family, scored: false, verdict: "unknown",
    headline: { en: "", is: "" }, driver: { en: "", is: "" }, facts: [],
    capacityPct: null, capacityTier: "unknown", readinessColor, readinessTier,
    confidence: "low", counterfactual: null, advice: null, opponentTag, demand: [], citations: CITATIONS,
  };

  // Layer 1 × 2 — role demand modified by the opponent style, normalised.
  const baseW = ROLE_DEMAND[family];
  const mod = OPPONENT_MODIFIERS[opponentTag];
  const raw = (Object.keys(baseW) as BQualityId[]).map((q) => ({ quality: q, weight: (baseW[q] ?? 0) * (mod[q] ?? 1) }));
  const wSum = raw.reduce((s, r) => s + r.weight, 0) || 1;
  const demand: DemandRow[] = raw.map((r) => ({ quality: r.quality, weight: r.weight / wSum, percentile: percentiles[r.quality] ?? null }));

  // Layer 3 — capacity: demand-weighted skill percentile over the covered qualities.
  const covered = demand.filter((d) => d.percentile != null);
  const coveredWeight = covered.reduce((s, d) => s + d.weight, 0);
  const capacityPct = covered.length ? covered.reduce((s, d) => s + d.weight * (d.percentile as number), 0) / coveredWeight : null;
  const capacityTier: FitTier = capacityPct == null || coveredWeight < T.coverageFloor ? "unknown"
    : capacityPct >= T.strongPctl ? "strong" : capacityPct >= T.cautionPctl ? "caution" : "poor";

  // Layer 4 — gate by readiness. Fit needs BOTH; a missing layer → unknown.
  const verdict: FitTier = (capacityTier === "unknown" || readinessTier === "unknown") ? "unknown" : worseTier(capacityTier, readinessTier);

  let confidence: Confidence = "moderate";
  if (coveredWeight < T.coverageMin || readinessTier === "unknown") confidence = "low";
  else if (coveredWeight >= 0.7 && input.coverageRatio >= 0.5 && !readinessImputed) confidence = "high";
  if (readinessImputed && confidence === "high") confidence = "moderate";

  const famName = FAMILY_LABEL[family];
  const styLbl = STYLE_LABEL[opponentTag];
  const limiter = [...covered].sort((a, b) => (b.weight * (100 - (b.percentile as number))) - (a.weight * (100 - (a.percentile as number))))[0];
  const enabler = [...covered].sort((a, b) => (b.weight * (b.percentile as number)) - (a.weight * (a.percentile as number)))[0];

  if (verdict === "unknown") {
    const missing = capacityTier === "unknown" && readinessTier === "unknown"
      ? { en: "no box-score data and no readiness check-in", is: "engin leikja-gögn og engin readiness-skráning" }
      : capacityTier === "unknown"
        ? { en: "not enough box-score data for his role", is: "ekki nóg leikja-gögn fyrir hans stöðu" }
        : { en: "no readiness check-in today", is: "engin readiness-skráning í dag" };
    return { ...base, scored: true, verdict: "unknown", capacityPct, capacityTier, confidence, demand,
      headline: { en: `${name} — ${famName.en}. Not enough to judge fit today.`, is: `${name} — ${famName.is}. Ekki nóg til að dæma fit í dag.` },
      driver: { en: `Can't judge — ${missing.en}.`, is: `Ekki hægt að dæma — ${missing.is}.` },
      facts: [{ en: `Plan taxes ${capLabel(demand[0].quality, "en").toLowerCase()} for a ${famName.en.toLowerCase()} vs a ${styLbl.en} opponent.`, is: `Áætlunin reynir á ${capLabel(demand[0].quality, "is").toLowerCase()} hjá ${famName.is.toLowerCase()} gegn ${styLbl.is} andstæðingi.` }] };
  }

  const readinessWorse = TIER_RANK[readinessTier] < TIER_RANK[capacityTier];
  const tierWord = (t: FitTier): Bi => t === "strong" ? { en: "strong", is: "sterkt" } : t === "caution" ? { en: "caution", is: "varúð" } : { en: "poor", is: "veikt" };
  const vWord = tierWord(verdict);
  const colorTxt = (readinessColor ?? "").toUpperCase().replace("_", " ");

  let driver: Bi;
  let counterfactual: Bi | null = null;
  if (readinessWorse) {
    driver = { en: `Readiness ${colorTxt}${readinessImputed ? " (estimated)" : ""} — the limiter today.`, is: `Readiness ${colorTxt}${readinessImputed ? " (áætlað)" : ""} — takmörkunin í dag.` };
    counterfactual = { en: `If his readiness were GREEN → ${tierWord(capacityTier).en} fit (his skill fit for this plan).`, is: `Ef readiness væri GRÆNT → ${tierWord(capacityTier).is} fit (hæfni hans fyrir þessa áætlun).` };
  } else if (limiter && capacityTier !== "strong") {
    const p = limiter.percentile as number;
    driver = { en: `${capLabel(limiter.quality, "en")} ${nth(p)} pct for a ${famName.en.toLowerCase()} vs this style — the limiter.`, is: `${capLabel(limiter.quality, "is")} ${Math.round(p)}. hundraðsraðar hjá ${famName.is.toLowerCase()} gegn þessum stíl — takmörkunin.` };
    counterfactual = { en: `At role-median ${capLabel(limiter.quality, "en").toLowerCase()} → a stronger fit.`, is: `Við miðgildi stöðu í ${capLabel(limiter.quality, "is").toLowerCase()} → sterkara fit.` };
  } else {
    driver = enabler
      ? { en: `${capLabel(enabler.quality, "en")} ${nth(enabler.percentile as number)} pct drives the matchup; readiness ${colorTxt}.`, is: `${capLabel(enabler.quality, "is")} ${Math.round(enabler.percentile as number)}. hundraðsraðar knýr viðureignina; readiness ${colorTxt}.` }
      : { en: `Ready and a fit for the plan.`, is: `Klár og passar í áætlunina.` };
  }

  const facts: Bi[] = [
    { en: `Plan needs ${capLabel(demand[0].quality, "en").toLowerCase()} for a ${famName.en.toLowerCase()} vs a ${styLbl.en} opponent.`, is: `Áætlunin þarf ${capLabel(demand[0].quality, "is").toLowerCase()} hjá ${famName.is.toLowerCase()} gegn ${styLbl.is} andstæðingi.` },
    enabler ? { en: `${capLabel(enabler.quality, "en")} is ${nth(enabler.percentile as number)} pct for his position.`, is: `${capLabel(enabler.quality, "is")} er ${Math.round(enabler.percentile as number)}. hundraðsraðar fyrir hans stöðu.` } : { en: "Box-score data is thin.", is: "Leikja-gögn eru þunn." },
    { en: `Readiness ${colorTxt}${readinessImputed ? " (estimated)" : ""}.`, is: `Readiness ${colorTxt}${readinessImputed ? " (áætlað)" : ""}.` },
  ];

  let advice: Bi | null = null;
  if (verdict !== "strong") {
    if (readinessWorse) advice = { en: "Consider: manage his minutes / an earlier sub, or rotate — readiness is the drag, not the matchup.", is: "Íhugaðu: stýrðu mínútum hans / fyrri skiptingu, eða snúðu — readiness er dragbíturinn, ekki viðureignin." };
    else if (limiter && capacityTier !== "strong") { const a = ADVICE_BY_QUALITY[limiter.quality]; if (a) advice = { en: `Consider: ${a.en}`, is: `Íhugaðu: ${a.is}` }; }
  }

  return {
    ...base, scored: true, verdict, capacityPct, capacityTier, confidence, counterfactual, advice, demand, driver, facts,
    headline: { en: `${name} — ${famName.en}. ${cap(vWord.en)} fit today.`, is: `${name} — ${famName.is}. ${cap(vWord.is)} fit í dag.` },
  };
}
