/**
 * Basketball Lineup Intelligence — 5-man-unit analytics. Pure, IO-free.
 *
 * Answers the question no box score answers: which units on the floor TOGETHER actually
 * win? It reads each season 5-man lineup's net margin and points against its possessions
 * (pace-adjusted), ranks them, and tags each as an anchor (lean on it), a spark (worth more
 * minutes, small sample), a leak (reconsider), or too thin to judge.
 *
 * DESCRIPTIVE ONLY. It never reads-as or writes the readiness colour, the load target, or the
 * daily decision — it is an analysis lens on past on-court results, layered beside them.
 *
 * The whole point is honest small-sample gating: basketball lineup data is noisy, so a unit is
 * only judged once it clears a possession floor; below it, the row is shown but never verdicted.
 *
 * Cite: Oliver 2004 (Basketball on Paper — possession-based net rating, the correct unit of
 *       efficiency); Kubatko et al. 2007 (A Starting Point for Analyzing Basketball Statistics —
 *       pace/possession estimation).
 */

export type Bi = { en: string; is: string };
export type Confidence = "high" | "moderate" | "low";
export type LineupTier = "anchor" | "spark" | "leak" | "thin";
export type LineupVerdict = "clear_anchor" | "mixed" | "leaks" | "insufficient";

export const T = {
  minPoss: 20,        // possessions a unit must cover before it is judged (per-game-avg basis)
  goodNet: 3,         // net points per 100 poss above which a sampled unit is an "anchor"
  leakNet: -3,        // net per 100 below which a sampled unit is a "leak"
  minJudged: 2,       // judged units (clearing minPoss) needed to emit a team verdict
  highConfPoss: 60,   // total possessions across judged units for high confidence
};

export const CITATIONS = [
  "Oliver 2004 — Basketball on Paper: possession-based net rating (efficiency per 100)",
  "Kubatko et al. 2007 — A Starting Point for Analyzing Basketball Statistics: pace/possessions",
];

export type LineupMember = { jersey: string | null; name: string; playerId: string | null };

export type LineupUnit = {
  lineupHash: string;
  members: LineupMember[];
  minutes: number | null;      // per-game average minutes the unit shared the floor
  possessions: number | null;  // per-game average possessions
  points: number | null;       // points scored by the unit (per-game average)
  plusMinus: number | null;    // net margin while on court (per-game average)
};

export type TaggedUnit = LineupUnit & {
  label: string;               // "4 D. Rodriguez, 12 B. Dinkins, …" for the table
  offPer100: number | null;    // points / possessions * 100
  netPer100: number | null;    // plusMinus / possessions * 100
  minutesShare: number | null; // share of total lineup minutes (0..1)
  tier: LineupTier;
};

export type LineupInput = {
  season: string | null;
  units: LineupUnit[];
};

export type LineupRead = {
  season: string | null;
  verdict: LineupVerdict;
  headline: Bi;
  facts: Bi[];
  confidence: Confidence;
  units: TaggedUnit[];         // sorted: judged first (by net desc), then thin (by minutes desc)
  judgedN: number;
  citations: string[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────────
const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const nd = (v: number | null, d = 1): string => (v == null ? "—" : v.toFixed(d));
const signed = (v: number | null, d = 1): string => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`);

/** Short label from the members ("4 D. Rodriguez, 12 B. Dinkins, …"). */
export function unitLabel(u: LineupUnit): string {
  return u.members.map((m) => `${m.jersey ? `${m.jersey} ` : ""}${m.name}`).join(", ");
}

const per100 = (numer: number | null, poss: number | null): number | null =>
  has(numer) && has(poss) && poss > 0 ? (numer / poss) * 100 : null;

/**
 * anchor — cleared the sample floor AND net ≥ goodNet (lean on it).
 * leak   — cleared the floor AND net ≤ leakNet (reconsider).
 * spark  — positive net but NOT a confirmed anchor (sampled-but-small, or below the floor) →
 *          promising, worth more minutes, small-sample caveat.
 * thin   — nothing to say (below floor & non-positive, or sampled but roughly neutral).
 */
function tierOf(possessions: number | null, netPer100: number | null): LineupTier {
  const sampled = has(possessions) && possessions >= T.minPoss;
  if (sampled && has(netPer100) && netPer100 >= T.goodNet) return "anchor";
  if (sampled && has(netPer100) && netPer100 <= T.leakNet) return "leak";
  if (has(netPer100) && netPer100 > 0) return "spark";
  return "thin";
}

/** The lineup-intelligence read for a team's season 5-man units. Pure — every number traceable. */
export function computeLineupIntelligence(input: LineupInput): LineupRead {
  const totalMinutes = input.units.reduce((s, u) => s + (has(u.minutes) ? u.minutes : 0), 0);

  const tagged: TaggedUnit[] = input.units.map((u) => {
    const netPer100 = per100(u.plusMinus, u.possessions);
    return {
      ...u,
      label: unitLabel(u),
      offPer100: per100(u.points, u.possessions),
      netPer100,
      minutesShare: totalMinutes > 0 && has(u.minutes) ? u.minutes / totalMinutes : null,
      tier: tierOf(u.possessions, netPer100),
    };
  });

  // Confirmed units (anchor/leak) rank first by net desc; the rest (spark/thin) by minutes desc.
  const confirmed = (t: TaggedUnit) => (t.tier === "anchor" || t.tier === "leak" ? 1 : 0);
  const units = [...tagged].sort((a, b) => {
    if (confirmed(a) !== confirmed(b)) return confirmed(b) - confirmed(a);
    if (confirmed(a) === 1) return (b.netPer100 ?? -1e9) - (a.netPer100 ?? -1e9);
    return (b.minutes ?? 0) - (a.minutes ?? 0);
  });

  const judgedN = tagged.filter((t) => has(t.possessions) && t.possessions >= T.minPoss).length;
  const anchors = tagged.filter((t) => t.tier === "anchor").sort((a, b) => (b.netPer100 ?? 0) - (a.netPer100 ?? 0));
  const leaks = tagged.filter((t) => t.tier === "leak").sort((a, b) => (a.netPer100 ?? 0) - (b.netPer100 ?? 0));

  const base: LineupRead = {
    season: input.season, verdict: "insufficient",
    headline: { en: "", is: "" }, facts: [], confidence: "low",
    units, judgedN, citations: CITATIONS,
  };

  // Not enough sampled units to speak to — show the tagged units, never guess.
  if (judgedN < T.minJudged) {
    return { ...base, verdict: "insufficient",
      headline: { en: `Not enough lineup minutes yet to separate the units.`, is: `Ekki nógu margar fimmundir með nægar sóknir enn til að greina þær í sundur.` },
      facts: [
        { en: `Only ${judgedN} unit${judgedN === 1 ? "" : "s"} has enough possessions (≥ ${T.minPoss}) to judge; the rest are shown but not verdicted.`,
          is: `Aðeins ${judgedN} fimmund${judgedN === 1 ? "" : "ir"} með nógu margar sóknir (≥ ${T.minPoss}) til að dæma; hinar eru sýndar en ekki dæmdar.` },
      ] };
  }

  const totalJudgedPoss = tagged.filter((t) => has(t.possessions) && t.possessions >= T.minPoss).reduce((s, t) => s + (t.possessions ?? 0), 0);
  const top = anchors[0] ?? null;
  const worst = leaks[0] ?? null;

  let verdict: LineupVerdict = "mixed";
  if (anchors.length > 0 && leaks.length === 0) verdict = "clear_anchor";
  else if (leaks.length > 0 && anchors.length === 0) verdict = "leaks";
  else verdict = "mixed";

  const facts: Bi[] = [];
  if (top) facts.push({
    en: `Best unit: ${top.label} — ${signed(top.netPer100)}/100 over ${nd(top.possessions)} poss/game.`,
    is: `Besta fimmundin: ${top.label} — ${signed(top.netPer100)}/100 yfir ${nd(top.possessions)} sóknir/leik.`,
  });
  if (worst) facts.push({
    en: `Leaking unit: ${worst.label} — ${signed(worst.netPer100)}/100 over ${nd(worst.possessions)} poss/game.`,
    is: `Fimmund sem lekur: ${worst.label} — ${signed(worst.netPer100)}/100 yfir ${nd(worst.possessions)} sóknir/leik.`,
  });
  facts.push({
    en: `${judgedN} unit${judgedN === 1 ? "" : "s"} cleared the ${T.minPoss}-possession floor (${anchors.length} anchor, ${leaks.length} leak).`,
    is: `${judgedN} fimmund${judgedN === 1 ? "" : "ir"} yfir ${T.minPoss}-sóknar þröskuldinn (${anchors.length} kjölfesta, ${leaks.length} leki).`,
  });

  const V: Record<LineupVerdict, Bi> = {
    clear_anchor: { en: "a clear go-to unit", is: "skýr kjölfestu-fimmund" },
    mixed: { en: "some units win, some leak", is: "sumar vinna, sumar leka" },
    leaks: { en: "units to reconsider", is: "fimmundir til að endurskoða" },
    insufficient: { en: "not enough minutes yet", is: "ekki nægar mínútur enn" },
  };

  const confidence: Confidence = totalJudgedPoss >= T.highConfPoss ? "high" : judgedN >= T.minJudged ? "moderate" : "low";

  return { ...base, verdict, confidence, facts,
    headline: { en: `Lineups — ${V[verdict].en}.`, is: `Fimmundir — ${V[verdict].is}.` } };
}
