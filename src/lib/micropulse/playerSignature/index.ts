/**
 * Player signature / archetype (fusion #3) — pure, IO-free.
 *
 * Answers "what KIND of player is this when physical + tactical are combined?" — e.g. an
 * explosive vertical winger with high end product, vs a low-load technician. It fuses the
 * physical fingerprint (engine GPS percentiles + IMA driver archetype) with the tactical
 * output level, assigns a transparent ARCHETYPE from composite axes (rules, not a black-box
 * cluster — clustering is unstable on a single small squad), and lists the MOST SIMILAR
 * players within position (nearest neighbour on the percentile vector). Built for scouting /
 * recruitment / role decisions. Descriptive/advisory — never touches the readiness colour.
 *
 * Small-sample honesty: similarity ranks against same-position peers when there are enough
 * (else the whole squad), and confidence reflects both signal coverage and the pool size.
 * Every quality percentile is position-scoped and squad-relative (see athleteProfile).
 */

import { QUALITY_BY_ID, type QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { positionGroup } from "@/lib/micropulse/positionStyle";

export type Bi = { en: string; is: string };
export type Confidence = "high" | "medium" | "low";
export type OutputQualifier = "productive" | "at_norm" | "under";
export type ArchetypeKey = "vertical" | "multidirectional" | "engine" | "physical" | "balanced";

/** Composite archetype axes over the engine qualities (each = mean of its covered members). */
const AXES: Record<Exclude<ArchetypeKey, "balanced">, QualityId[]> = {
  vertical: ["speed", "anaerobic_reserve", "peak_demands", "acceleration"],
  multidirectional: ["change_of_direction", "mechanical_power", "deceleration"],
  engine: ["aerobic_endurance", "work_capacity"],
  physical: ["robustness", "reactive_power", "max_strength"],
};

export const ARCHETYPE_LABEL: Record<ArchetypeKey, Bi> = {
  vertical: { en: "Explosive / vertical threat", is: "Sprengikraftur / lóðrétt ógn" },
  multidirectional: { en: "Multidirectional creator", is: "Fjölátta skapari" },
  engine: { en: "High-volume engine", is: "Vél / mikið magn" },
  physical: { en: "Physical / duel-dominant", is: "Líkamlegur / návígjasterkur" },
  balanced: { en: "Balanced all-rounder", is: "Alhliða leikmaður" },
};

const OUTPUT_LABEL: Record<OutputQualifier, Bi> = {
  productive: { en: "high end product", is: "mikil lokaafurð" },
  at_norm: { en: "output at his norm", is: "output við venju" },
  under: { en: "low end product", is: "lítil lokaafurð" },
};

export type SignaturePlayer = {
  playerId: string;
  name: string;
  position: string | null;
  /** position percentiles (0-100) by quality — from AthleteProfile. */
  qualities: Partial<Record<QualityId, number>>;
};

export type SignatureInput = {
  target: SignaturePlayer & { driverPrimary: string | null; outputRead: OutputQualifier | null; sport?: string | null };
  pool: SignaturePlayer[]; // the squad (target may be included; it is excluded from neighbours)
};

export type AxisScore = { key: ArchetypeKey; label: Bi; score: number | null };
export type Neighbour = { playerId: string; name: string; position: string | null; similarity: number };

export type SignatureRead = {
  playerId: string;
  name: string;
  position: string | null;
  applicable: boolean;   // false for goalkeepers (the outfield archetype model doesn't apply)
  archetype: ArchetypeKey;
  archetypeLabel: Bi;
  outputRead: OutputQualifier | null;
  verdict: Bi;
  facts: Bi[];
  axes: AxisScore[];
  neighbours: Neighbour[];
  neighbourPool: "position" | "squad";
  confidence: Confidence;
  coverage: number; // qualities with data
  citation: string;
};

export const CITATION =
  "Composite physical (GPS/IMA percentiles) x tactical output archetype — Bradley & Ade (role-contextualised profiling); position-scoped percentiles";

const MIN_POSITION_POOL = 3;
const num = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const mean = (xs: Array<number | null>): number | null => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function axisScore(q: Partial<Record<QualityId, number>>, ids: QualityId[]): number | null {
  return mean(ids.map((id) => num(q[id])));
}

/** Euclidean similarity (0-100) on the shared covered quality dims; null when too few shared. */
function similarity(a: Partial<Record<QualityId, number>>, b: Partial<Record<QualityId, number>>): number | null {
  const dims = (Object.keys(QUALITY_BY_ID) as QualityId[]).filter((k) => num(a[k]) != null && num(b[k]) != null);
  if (dims.length < 3) return null;
  const sse = dims.reduce((s, k) => s + ((a[k] as number) - (b[k] as number)) ** 2, 0);
  const rms = Math.sqrt(sse / dims.length); // 0 (identical) .. 100 (opposite)
  return Math.max(0, Math.round(100 - rms));
}

export function computePlayerSignature(input: SignatureInput): SignatureRead {
  const { target } = input;
  const q = target.qualities;
  const coverage = (Object.keys(QUALITY_BY_ID) as QualityId[]).filter((k) => num(q[k]) != null).length;
  const grp = positionGroup(target.position, target.sport);

  // Goalkeepers: the outfield archetype axes (vertical/multidirectional/engine/physical) don't
  // apply — honest out-of-scope, never a misleading "duel-dominant" label from outfield metrics.
  if (grp === "GK") {
    return {
      playerId: target.playerId, name: target.name, position: target.position, applicable: false,
      archetype: "balanced", archetypeLabel: ARCHETYPE_LABEL.balanced, outputRead: target.outputRead,
      verdict: { en: `${target.name} — goalkeeper; the outfield archetype model doesn't apply.`, is: `${target.name} — markvörður; útileikmanna-erkitýpan á ekki við.` },
      facts: [], axes: [], neighbours: [], neighbourPool: "position", confidence: "low", coverage, citation: CITATION,
    };
  }

  const axes: AxisScore[] = (Object.keys(AXES) as Array<Exclude<ArchetypeKey, "balanced">>)
    .map((key) => ({ key, label: ARCHETYPE_LABEL[key], score: axisScore(q, AXES[key]) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const covered = axes.filter((a) => a.score != null);
  const topAxis = covered[0];
  const secondAxis = covered[1];
  // Archetype = the dominant axis when it clears the field; else balanced.
  const archetype: ArchetypeKey = !topAxis || topAxis.score == null ? "balanced"
    : (secondAxis?.score != null && topAxis.score - secondAxis.score < 8) || topAxis.score < 45 ? "balanced"
    : topAxis.key;
  const archetypeLabel = ARCHETYPE_LABEL[archetype];

  // Nearest neighbours — same-position peers when enough, else the whole squad.
  const samePos = input.pool.filter((p) => p.playerId !== target.playerId && positionGroup(p.position, target.sport) === grp);
  const usePosition = samePos.length >= MIN_POSITION_POOL;
  const candidates = usePosition ? samePos : input.pool.filter((p) => p.playerId !== target.playerId);
  const neighbours: Neighbour[] = candidates
    .map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, similarity: similarity(q, p.qualities) }))
    .filter((n): n is Neighbour => n.similarity != null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

  // Verdict — archetype + output qualifier, position-aware, plain.
  const outQ = target.outputRead ? OUTPUT_LABEL[target.outputRead] : null;
  const verdict: Bi = archetype === "balanced"
    ? { en: `${target.name} — a balanced all-rounder${outQ ? `, ${outQ.en}` : ""}.`, is: `${target.name} — alhliða leikmaður${outQ ? `, ${outQ.is}` : ""}.` }
    : { en: `${target.name} — ${archetypeLabel.en.toLowerCase()}${outQ ? ` with ${outQ.en}` : ""}.`, is: `${target.name} — ${archetypeLabel.is.toLowerCase()}${outQ ? `, ${outQ.is}` : ""}.` };

  const facts: Bi[] = [];
  if (topAxis?.score != null) facts.push({
    en: `Strongest composite axis: ${topAxis.label.en} (${Math.round(topAxis.score)}/100 for his position).`,
    is: `Sterkasti samsetti ásinn: ${topAxis.label.is} (${Math.round(topAxis.score)}/100 fyrir stöðuna).`,
  });
  if (target.driverPrimary) facts.push({
    en: `Movement style leans ${target.driverPrimary}.`, is: `Hreyfistíll hallast að ${target.driverPrimary}.`,
  });
  if (neighbours.length) facts.push({
    en: `Most similar ${usePosition ? "in his position" : "in the squad"}: ${neighbours.map((n) => `${n.name.split(" ")[0]} (${n.similarity}%)`).join(", ")}.`,
    is: `Líkastir ${usePosition ? "í hans stöðu" : "í liðinu"}: ${neighbours.map((n) => `${n.name.split(" ")[0]} (${n.similarity}%)`).join(", ")}.`,
  });

  const confidence: Confidence = coverage >= 6 && neighbours.length >= 2 && usePosition ? "high"
    : coverage >= 4 ? "medium" : "low";

  return {
    playerId: target.playerId, name: target.name, position: target.position, applicable: true,
    archetype, archetypeLabel, outputRead: target.outputRead, verdict,
    facts: facts.length ? facts : [{ en: cap("not enough athletic data to place an archetype yet."), is: "Ekki nóg íþrótta-gögn til að staðsetja erkitýpu enn." }],
    axes, neighbours, neighbourPool: usePosition ? "position" : "squad", confidence, coverage, citation: CITATION,
  };
}
