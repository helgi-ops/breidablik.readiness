/**
 * CMJ neuromuscular-fatigue engine (robustness #5).
 *
 * Two genuinely-new reads on top of the existing CMJ surfaces, both grounded in
 * `docs/research/cmj-neuromuscular-fatigue-assessment.md`:
 *
 *  1. MULTI-DAY SLOPE — read the trend across several jumps, not today's value
 *     (Neyroud 2016: a universal threshold is an averaging artifact — personal-
 *     norm only; Carroll/Taylor/Gandevia 2017: a still-depressed multi-day
 *     rebound is peripheral, a fast next-day rebound is central). Expressed as a
 *     personal z so the injury-risk rule can gate on it (`cmjSlopeZ`, negative =
 *     jump trending down vs his own spread).
 *
 *  2. CENTRAL-vs-PERIPHERAL fatigue TYPE — a CMJ measures net output, so it
 *     cannot by itself say WHERE the fatigue is (Gandevia 2001; Enoka & Stuart).
 *     Triangulate the three axes MicroPulse already has: CMJ height/power =
 *     peripheral-metabolic (Jiménez-Reyes 2018, r ~ 0.91-0.99 vs lactate/ammonia
 *     within a player); soreness = peripheral-muscular; sleep/stress = central-
 *     autonomic (Amann 2011). Turns "his jump is down" into "his jump is down
 *     BECAUSE X" — the plain "why" the manifesto wants, from data on hand.
 *
 * The expected post-match recovery deficit (Hader 2019 HSR-personalised curve)
 * is composed from the existing `cmjRecovery` module — this engine only turns
 * its band verdict into the 0-1 deficit the injury-risk rule reads.
 *
 * Pure. No IO. Never moves the readiness colour — descriptive early-warning only.
 * Every result carries its inputs + a bilingual, cited "why".
 */

import { expectedCmjBand, classifyRecovery, type RecoveryLabel } from "@/lib/micropulse/cmjRecovery";

export type Bi = { en: string; is: string };
export type FatigueType = "peripheral" | "central" | "mixed";
export type FatigueConfidence = "low" | "moderate" | "high";

/** One CMJ observation for the slope fit. */
export type CmjPoint = {
  /** ISO timestamp of the test (any parseable date-time). */
  ts: string;
  /** Jump height in cm (or peak power — whichever series the caller passes). */
  value: number;
};

export type CmjFatigueInput = {
  /**
   * The player's CMJ jump-height series over the trend window, oldest->newest
   * (the caller sorts; we tolerate any order). Needs >= MIN_SLOPE_TESTS to fit.
   */
  jumps: CmjPoint[];
  /** Latest CMJ jump height (cm), for the drop-vs-baseline read. */
  latestJump?: number | null;
  /** The player's own baseline mean/SD of jump height (cm) over the window. */
  baselineMean?: number | null;
  baselineSd?: number | null;

  // ── Fatigue-type triangulation (all personal z, negative = worse) ──
  /** Sleep-quality personal z (negative = below his usual). */
  sleepZ?: number | null;
  /** Soreness personal z (negative = more sore than his usual). */
  sorenessZ?: number | null;
  /** Stress/mood personal z (negative = worse than his usual). Optional. */
  stressZ?: number | null;

  // ── Expected post-match recovery (Hader 2019), composed from cmjRecovery ──
  /** The most recent match's high-speed-running metres (>5.5 m/s). */
  matchHsr?: number | null;
  /** Hours since that match at the time of the latest CMJ. */
  hoursPostMatch?: number | null;
  /** Observed latest CMJ as a % of the player's own baseline. */
  observedPctOfBaseline?: number | null;
};

export type CmjFatigueRead = {
  hasData: boolean;
  /** Personal z of the multi-day trend (negative = declining). Null if too few tests. */
  cmjSlopeZ: number | null;
  /** Latest jump vs baseline, personal z (negative = below norm). Null if no baseline. */
  latestZ: number | null;
  /** True when the CMJ itself reads fatigued (slope declining OR latest below norm). */
  cmjFatigued: boolean;
  /** Where the fatigue most likely sits — only when the CMJ reads fatigued. */
  fatigueType: FatigueType | null;
  /** 0-1 shortfall below the HSR-personalised expected recovery curve. Null if no band. */
  cmjRecoveryDeficit: number | null;
  /** The recovery band label, for provenance. */
  recoveryLabel: RecoveryLabel | null;
  confidence: FatigueConfidence;
  /** Bilingual verdict (the one-line read). */
  verdict: Bi;
  /** Plain supporting facts (bilingual). */
  facts: Bi[];
  citation: string;
};

const MIN_SLOPE_TESTS = 4;
/** A CMJ reads "down" at <= -1 personal SD (matches the signalPack cmjJump flag). */
const CMJ_DOWN_Z = -1;
/** Recovery / soreness / sleep read "poor" at <= -1 personal SD. */
const POOR_Z = -1;
const CITATION = "Neyroud 2016 · Carroll 2017 · Jiménez-Reyes 2018 · Amann 2011 · Hader 2019";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Simple OLS slope + R^2 over (x, y). Null when < 2 points or x has no spread. */
function linRegress(xs: number[], ys: number[]): { slope: number; r2: number } | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) { const yh = slope * xs[i] + intercept; ssRes += (ys[i] - yh) ** 2; ssTot += (ys[i] - my) ** 2; }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, r2 };
}

const dayNum = (ts: string): number | null => {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
};

/**
 * Multi-day CMJ slope as a personal z: the total modelled change across the
 * observed span, expressed in units of the player's own between-test SD. So
 * cmjSlopeZ = -1 means "the trend line moved him a full personal-SD DOWN across
 * the window". Null when there are too few tests, no time spread, or no SD.
 */
export function computeCmjSlope(jumps: CmjPoint[]): { slopeZ: number | null; r2: number | null; nTests: number } {
  const pts = jumps
    .map((p) => ({ d: dayNum(p.ts), v: finite(p.value) ? p.value : null }))
    .filter((p): p is { d: number; v: number } => p.d != null && p.v != null)
    .sort((a, b) => a.d - b.d);
  if (pts.length < MIN_SLOPE_TESTS) return { slopeZ: null, r2: null, nTests: pts.length };
  const vs = pts.map((p) => p.v);
  const m = mean(vs);
  const sd = Math.sqrt(mean(vs.map((v) => (v - m) ** 2)));
  const fit = linRegress(pts.map((p) => p.d), vs);
  if (!fit || sd <= 0) return { slopeZ: null, r2: fit?.r2 ?? null, nTests: pts.length };
  const spanDays = pts[pts.length - 1].d - pts[0].d;
  if (spanDays <= 0) return { slopeZ: null, r2: fit.r2, nTests: pts.length };
  const totalChange = fit.slope * spanDays; // modelled change over the observed span
  const slopeZ = Math.round((totalChange / sd) * 100) / 100;
  return { slopeZ, r2: Math.round(fit.r2 * 100) / 100, nTests: pts.length };
}

/**
 * Locate the fatigue when the CMJ reads down. The CMJ height/power drop IS the
 * peripheral-metabolic axis; soreness adds peripheral-muscular; poor sleep/stress
 * adds central-autonomic. Returns null when the CMJ isn't fatigued (nothing to
 * locate).
 */
export function classifyFatigueType(input: {
  cmjFatigued: boolean;
  sorenessZ?: number | null;
  sleepZ?: number | null;
  stressZ?: number | null;
}): FatigueType | null {
  if (!input.cmjFatigued) return null;
  const peripheralMuscular = finite(input.sorenessZ) && input.sorenessZ <= POOR_Z;
  const centralAutonomic =
    (finite(input.sleepZ) && input.sleepZ <= POOR_Z) ||
    (finite(input.stressZ) && input.stressZ <= POOR_Z);
  if (peripheralMuscular && centralAutonomic) return "mixed";
  if (centralAutonomic && !peripheralMuscular) return "central";
  // Sore, or neither companion (a CMJ/power drop alone is peripheral-metabolic).
  return "peripheral";
}

/**
 * Turn the HSR-personalised expected-recovery band (cmjRecovery) into the 0-1
 * deficit the injury-risk rule reads: 0 when on-track/ahead (within the noise
 * band), a positive fraction of baseline when recovering BEHIND expected. Null
 * when the band can't be built (missing match HSR / hours / observed value).
 */
export function computeCmjRecoveryDeficit(input: {
  matchHsr?: number | null;
  hoursPostMatch?: number | null;
  observedPctOfBaseline?: number | null;
}): { deficit: number | null; label: RecoveryLabel | null } {
  const band = expectedCmjBand({ matchHsr: input.matchHsr ?? null, hoursPostMatch: input.hoursPostMatch ?? null });
  if (!band) return { deficit: null, label: null };
  const observed = input.observedPctOfBaseline;
  const label = classifyRecovery(observed ?? null, band);
  if (label == null || !finite(observed)) return { deficit: 0, label: null };
  // Below the noise band = genuinely slow; size it from the expected midpoint.
  const deficit = label === "slow" ? Math.max(0, Math.round((band.expectedPct - observed)) / 100) : 0;
  return { deficit, label };
}

function fatigueTypeLabel(t: FatigueType): Bi {
  if (t === "peripheral") return { en: "muscular / metabolic", is: "vöðva / efnaskipta" };
  if (t === "central") return { en: "central (sleep / stress)", is: "miðlægt (svefn / streita)" };
  return { en: "mixed (muscular + central)", is: "blandað (vöðva + miðlægt)" };
}

/** Full read: slope + fatigue-type + recovery deficit + a bilingual layered "why". */
export function computeCmjFatigue(input: CmjFatigueInput): CmjFatigueRead {
  const slope = computeCmjSlope(input.jumps ?? []);
  const latestZ =
    finite(input.latestJump) && finite(input.baselineMean) && finite(input.baselineSd) && (input.baselineSd as number) > 0.3
      ? Math.round(((input.latestJump as number) - (input.baselineMean as number)) / (input.baselineSd as number) * 100) / 100
      : null;

  const slopeDown = slope.slopeZ != null && slope.slopeZ <= CMJ_DOWN_Z;
  const latestDown = latestZ != null && latestZ <= CMJ_DOWN_Z;
  const cmjFatigued = slopeDown || latestDown;

  const fatigueType = classifyFatigueType({ cmjFatigued, sorenessZ: input.sorenessZ, sleepZ: input.sleepZ, stressZ: input.stressZ });
  const recovery = computeCmjRecoveryDeficit(input);

  const hasData = slope.slopeZ != null || latestZ != null || recovery.deficit != null;

  // Confidence: test cadence for the slope; drops to low on thin data.
  let confidence: FatigueConfidence = "low";
  if (slope.nTests >= 6) confidence = "high";
  else if (slope.nTests >= MIN_SLOPE_TESTS) confidence = "moderate";

  const facts: Bi[] = [];
  if (slope.slopeZ != null) {
    const dir = slope.slopeZ <= CMJ_DOWN_Z ? { en: "trending down", is: "á niðurleið" } : slope.slopeZ >= 1 ? { en: "trending up", is: "á uppleið" } : { en: "steady", is: "stöðugt" };
    facts.push({
      en: `Jump is ${dir.en} over the last ${slope.nTests} tests (${slope.slopeZ.toFixed(1)} personal SD across the window).`,
      is: `Stökk er ${dir.is} yfir síðustu ${slope.nTests} próf (${slope.slopeZ.toFixed(1)} eigin SD yfir tímabilið).`,
    });
  }
  if (cmjFatigued && fatigueType) {
    const lab = fatigueTypeLabel(fatigueType);
    facts.push({
      en: `Likely fatigue type: ${lab.en} — ${fatigueType === "central" ? "rest / sleep addresses it" : fatigueType === "peripheral" ? "load reduction addresses it" : "both load and recovery need attention"}.`,
      is: `Líkleg þreytutegund: ${lab.is} — ${fatigueType === "central" ? "hvíld / svefn lagar það" : fatigueType === "peripheral" ? "minnkað álag lagar það" : "bæði álag og endurheimt þarf að huga að"}.`,
    });
  }
  if (recovery.deficit != null && recovery.deficit > 0) {
    facts.push({
      en: `Jump recovery is ${Math.round(recovery.deficit * 100)}% below the level expected for the last match's high-speed load.`,
      is: `Endurheimt stökks er ${Math.round(recovery.deficit * 100)}% undir því sem vænst er miðað við háhraðaálag síðasta leiks.`,
    });
  }

  const verdict: Bi = cmjFatigued
    ? fatigueType === "central"
      ? { en: "Jump down — looks central (sleep / stress).", is: "Stökk niðri — lítur út fyrir að vera miðlægt (svefn / streita)." }
      : fatigueType === "mixed"
        ? { en: "Jump down — mixed muscular + central fatigue.", is: "Stökk niðri — blönduð vöðva- + miðlæg þreyta." }
        : { en: "Jump down — looks muscular / metabolic.", is: "Stökk niðri — lítur út fyrir að vera vöðva / efnaskipta." }
    : hasData
      ? { en: "Jump steady vs his own norm.", is: "Stökk stöðugt vs eigin venju." }
      : { en: "No CMJ trend data yet.", is: "Engin CMJ-þróunargögn enn." };

  return {
    hasData,
    cmjSlopeZ: slope.slopeZ,
    latestZ,
    cmjFatigued,
    fatigueType,
    cmjRecoveryDeficit: recovery.deficit,
    recoveryLabel: recovery.label,
    confidence,
    verdict,
    facts,
    citation: CITATION,
  };
}
