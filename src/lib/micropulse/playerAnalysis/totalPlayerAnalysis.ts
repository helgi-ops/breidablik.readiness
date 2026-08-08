/**
 * Total Player Analysis — combines the two axes into one hub read.
 *
 * Pure, IO-free. Takes the already-built FOOTBALLER analysis (from
 * `buildPlayerAnalysis`, Wyscout/StatsBomb per-90 percentiles) and the ATHLETE
 * profile (from `buildAthleteProfile`, GPS/VALD/VBT position-percentiles) and:
 *   1. keeps them as TWO labelled reads (never a blended score),
 *   2. computes rule-based CROSS-LINKS — where an athletic quality does or does
 *      not show up in match output, each citing both numbers,
 *   3. reports coverage (which axes/sources this player has),
 *   4. writes a plain one-line headline (verdict-first, explainability layer 0).
 *
 * Cross-links are the differentiator no siloed tool gives. They are descriptive
 * association, never causation or prediction, and never touch the readiness
 * colour or the medical view.
 */

import type { PlayerAnalysis, Category } from "./index";
import type { AthleteProfile, QualityId } from "./athleteProfile";

// A quality/category counts as "high" or "low" only past these percentile gates,
// so a cross-link needs a genuinely strong side AND a genuinely weak side to fire.
export const CROSS_HIGH_PCTL = 65;
export const CROSS_LOW_PCTL = 35;

export type CrossLink = {
  id: string;
  en: string;
  is: string;
  /** "insight" = a neutral translation observation; "watch" = a gap worth a look. */
  severity: "insight" | "watch";
  /** the two (or more) numbers that fired the rule, short + bilingual, cited. */
  evidence: Array<{ en: string; is: string }>;
};

export type TotalPlayerAnalysis = {
  playerId: string | null;
  footballer: PlayerAnalysis | null;
  athlete: AthleteProfile | null;
  crossLinks: CrossLink[];
  coverage: {
    footballer: boolean;
    athlete: boolean;
    athleteRatio: number;        // 0–1, share of athlete qualities with data
    sources: string[];           // distinct provenance labels across both axes
  };
  headline: { en: string; is: string };
};

const pct = (v: number | null | undefined): string => (v == null ? "—" : `${Math.round(v)}th %ile`);
const pctIs = (v: number | null | undefined): string => (v == null ? "—" : `${Math.round(v)}. percentíl`);

/** Athlete quality primary percentile (position pool, squad fallback), or null. */
function aPctl(athlete: AthleteProfile | null, id: QualityId): number | null {
  const q = athlete?.qualities.find((x) => x.id === id && x.value != null);
  return q?.positionPercentile ?? null;
}
/** Footballer category percentile (outfield only), or null. */
function fCat(footballer: PlayerAnalysis | null, c: Category): number | null {
  if (!footballer || footballer.goalkeeper) return null;
  return footballer.byCategory[c] ?? null;
}

export function buildCrossLinks(footballer: PlayerAnalysis | null, athlete: AthleteProfile | null): CrossLink[] {
  const links: CrossLink[] = [];
  const hi = (v: number | null) => v != null && v >= CROSS_HIGH_PCTL;
  const lo = (v: number | null) => v != null && v <= CROSS_LOW_PCTL;

  const strength = aPctl(athlete, "max_strength");
  const vbt = aPctl(athlete, "vbt_power");
  const speed = aPctl(athlete, "speed");
  const work = aPctl(athlete, "work_capacity");
  const reactive = aPctl(athlete, "reactive_power");
  const attacking = fCat(footballer, "attacking");
  const possession = fCat(footballer, "possession");

  // 1. Gym strength / power high, but sprint & work output on the pitch low.
  const gymTop = Math.max(strength ?? -1, vbt ?? -1);
  const gymSide = (strength ?? -1) >= (vbt ?? -1) ? { label: "Max strength", labelIs: "Hámarkskraftur", v: strength } : { label: "Power output", labelIs: "Aflframleiðsla", v: vbt };
  if (gymTop >= CROSS_HIGH_PCTL && (lo(speed) || lo(work))) {
    const pitch = lo(speed) ? { label: "Speed", labelIs: "Hraði", v: speed } : { label: "Work capacity", labelIs: "Vinnugeta", v: work };
    links.push({
      id: "gym_not_on_pitch", severity: "watch",
      en: "Gym strength isn't translating to the pitch — strong in the weight room, lower sprint/running output in games.",
      is: "Ræktarstyrkur skilar sér ekki á völlinn — sterkur í lyftingum en minni spretta/hlaup í leikjum.",
      evidence: [
        { en: `${gymSide.label} ${pct(gymSide.v)}`, is: `${gymSide.labelIs} ${pctIs(gymSide.v)}` },
        { en: `${pitch.label} ${pct(pitch.v)}`, is: `${pitch.labelIs} ${pctIs(pitch.v)}` },
      ],
    });
  }

  // 2. Covers a lot of ground, but low attacking end-product.
  if (hi(work) && lo(attacking)) {
    links.push({
      id: "ground_no_endproduct", severity: "insight",
      en: "Covers the ground but low end-product — high work capacity, attacking output below the squad.",
      is: "Vinnur mikið en lítil lokaafurð — mikil vinnugeta en sóknarafurð undir liðinu.",
      evidence: [
        { en: `Work capacity ${pct(work)}`, is: `Vinnugeta ${pctIs(work)}` },
        { en: `Attacking ${pct(attacking)}`, is: `Sókn ${pctIs(attacking)}` },
      ],
    });
  }

  // 3. Explosive on the plates, not top-end fast in games.
  if (hi(reactive) && lo(speed)) {
    links.push({
      id: "power_not_speed", severity: "insight",
      en: "Explosive on the force plates but not top-end fast in games — power without expressed max speed.",
      is: "Sprengikröftugur á kraftplötum en ekki hraðskreiður í leikjum — kraftur án útfærðs hámarkshraða.",
      evidence: [
        { en: `Reactive power ${pct(reactive)}`, is: `Viðbragðskraftur ${pctIs(reactive)}` },
        { en: `Speed ${pct(speed)}`, is: `Hraði ${pctIs(speed)}` },
      ],
    });
  }

  // 4. Quick, but low involvement in build-up.
  if (hi(speed) && lo(possession)) {
    links.push({
      id: "fast_low_involvement", severity: "insight",
      en: "Quick, but light involvement in possession — pace is there, on-ball contribution below the squad.",
      is: "Hraður en lítil þátttaka í uppbyggingu — hraðinn er til staðar en boltasnerting undir liðinu.",
      evidence: [
        { en: `Speed ${pct(speed)}`, is: `Hraði ${pctIs(speed)}` },
        { en: `Possession ${pct(possession)}`, is: `Boltameðferð ${pctIs(possession)}` },
      ],
    });
  }

  return links;
}

/** Classify an axis into strong / developing / balanced from its strength/weakness counts. */
function axisVerdict(strengths: number, weaknesses: number, hasData: boolean): "strong" | "developing" | "balanced" | null {
  if (!hasData) return null;
  if (strengths >= 2 && strengths > weaknesses) return "strong";
  if (weaknesses > strengths && weaknesses >= 2) return "developing";
  return "balanced";
}

const AXIS_EN = { strong: "strong", developing: "developing", balanced: "balanced" } as const;
const AXIS_IS = { strong: "sterkur", developing: "í þróun", balanced: "í jafnvægi" } as const;

function headlineOf(footballer: PlayerAnalysis | null, athlete: AthleteProfile | null): { en: string; is: string } {
  const aData = !!athlete && athlete.coverage.qualitiesWithData > 0;
  const fData = !!footballer && !footballer.goalkeeper && (footballer.strengths.length + footballer.weaknesses.length + (footballer.role ? 1 : 0)) > 0;
  const aV = axisVerdict(athlete?.strengths.length ?? 0, athlete?.weaknesses.length ?? 0, aData);
  const fV = axisVerdict(footballer?.strengths.length ?? 0, footballer?.weaknesses.length ?? 0, fData);

  if (!aV && !fV) return { en: "Not enough data yet for a profile.", is: "Ekki næg gögn fyrir prófíl enn." };
  if (aV && !fV) return {
    en: `A ${AXIS_EN[aV]} athlete — footballer data not linked yet.`,
    is: `${cap(AXIS_IS[aV])} íþróttamaður — fótboltagögn ekki tengd enn.`,
  };
  if (fV && !aV) return {
    en: `A ${AXIS_EN[fV]} footballer — athlete data not linked yet.`,
    is: `${cap(AXIS_IS[fV])} fótboltamaður — íþróttagögn ekki tengd enn.`,
  };
  return {
    en: `A ${AXIS_EN[aV!]} athlete, ${AXIS_EN[fV!]} footballer.`,
    is: `${cap(AXIS_IS[aV!])} íþróttamaður, ${AXIS_IS[fV!]} fótboltamaður.`,
  };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildTotalPlayerAnalysis(args: {
  playerId: string | null;
  footballer: PlayerAnalysis | null;
  athlete: AthleteProfile | null;
}): TotalPlayerAnalysis {
  const { playerId, footballer, athlete } = args;
  const crossLinks = buildCrossLinks(footballer, athlete);
  const athleteSources = athlete?.coverage.sources ?? [];
  const footballerSources = footballer && !footballer.goalkeeper && (footballer.metrics.length > 0) ? ["Footballer stats"] : [];
  return {
    playerId,
    footballer,
    athlete,
    crossLinks,
    coverage: {
      footballer: !!footballer,
      athlete: !!athlete && athlete.coverage.qualitiesWithData > 0,
      athleteRatio: athlete?.coverage.ratio ?? 0,
      sources: Array.from(new Set([...footballerSources, ...athleteSources])),
    },
    headline: headlineOf(footballer, athlete),
  };
}
