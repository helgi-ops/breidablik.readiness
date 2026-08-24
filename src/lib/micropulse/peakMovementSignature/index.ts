/**
 * Peak-window MOVEMENT SIGNATURE (flagship #2, Catapult-only path) — pure, IO-free ENGINE.
 *
 * Answers the coaching half of Ju et al. (2022)'s question — "what is his peak intensity MADE OF?"
 * — WITHOUT the hand-coded tactical taxonomy (Push-up Pitch, Over/Underlap, …), which was coded
 * from video by analysts and is exported by no feed. Instead it classifies the peak window from the
 * movement signals we already ingest: the IMA directional clock (forward / backward / lateral, with
 * intensity tiers) plus the peak window's high-speed rate and top speed. That splits the tactically
 * meaningful archetypes a coach acts on — forward attacking sprints vs backward recovery running vs
 * multidirectional pressing/agility vs a low-intensity trough — at high confidence, from Catapult
 * alone.
 *
 * HONEST SCOPE: this is a MOVEMENT-pattern read (GPS/IMA-derived), NOT the Ju hand-coded tactical
 * variables — it is labelled as such. The IMA clock is a whole-session directional fingerprint, so
 * direction/agility contextualise the peak window rather than being coded per-second inside it; the
 * window's own high-speed rate is the per-window signal. The Ju paper is cited as INSPIRATION (a
 * movement reduction of the contextualised-peak concept), not as a reproduction of its taxonomy.
 * Descriptive/advisory — it never touches the readiness colour or the daily decision.
 *
 * Cite: Ju W et al. 2022, Contextualised peak periods of play in the EPL, Biol Sport 39(4):973-983.
 */

import type { ClockGrid } from "@/lib/micropulse/directionalSignature";

export type Bi = { en: string; is: string };
export type Confidence = "high" | "medium" | "low";

export type MovementArchetype =
  | "straight_attacking"    // forward high-speed running (run in behind / break / penetrate)
  | "straight_recovery"     // backward high-speed running (recovery run toward own goal)
  | "multidirectional"      // lateral cutting + accel/decel (press / cover / support)
  | "low_intensity";        // the low-effort trough

export const ARCHETYPE_LABEL: Record<MovementArchetype, Bi> = {
  straight_attacking: { en: "Forward attacking sprints", is: "Sóknar-sprettir fram á við" },
  straight_recovery: { en: "Backward recovery running", is: "Endurheimtar-hlaup aftur á bak" },
  multidirectional: { en: "Multidirectional pressing / agility", is: "Fjölstefnu pressa / snerpa" },
  low_intensity: { en: "Low-intensity movement", is: "Lág-ákefðar hreyfing" },
};

export const CITATION =
  "Ju W et al. 2022, Contextualised peak periods of play in the EPL, Biol Sport 39(4):973-983";

const CAVEAT: Bi = {
  en: "The movement pattern of a player's peak-intensity window, derived from GPS/IMA — the direction of his intense efforts (forward / backward / lateral, from the Catapult IMA clock) plus the window's high-speed rate. This is a MOVEMENT signature, not Ju's hand-coded tactical variables (Run in Behind, Over/Underlap …), which no feed exports; the paper is cited as inspiration for the movement reduction, not reproduced. The IMA clock is a whole-session fingerprint, so it contextualises the window rather than coding it second-by-second. Descriptive context — it never changes the readiness verdict or the daily plan.",
  is: "Hreyfimynstur hámarks-ákefðar glugga leikmanns, leitt af GPS/IMA — stefna ákafra hreyfinga hans (fram / aftur / til hliðar, úr Catapult IMA-klukkunni) auk háhraða-hlutfalls gluggans. Þetta er HREYFI-undirskrift, ekki handkóðaðar taktískar breytur Ju (hlaup á bak við, yfir/undirlap …) sem enginn straumur skilar; greinin er nefnd sem innblástur að hreyfi-nálguninni, ekki endurgerð. IMA-klukkan er heil-lotu fingrafar, svo hún setur gluggann í samhengi frekar en að kóða hann sekúndu fyrir sekúndu. Lýsandi samhengi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

// Clock sectors (12 = straight forward) grouped into movement families.
const FORWARD_SECTORS = ["11", "12", "1"];
const BACKWARD_SECTORS = ["5", "6", "7"];
const LATERAL_SECTORS = ["2", "3", "4", "8", "9", "10"];

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Intense (high+medium) and low-tier sums over a set of clock sectors. */
function sectorMass(grid: ClockGrid, sectors: string[]): { intense: number; low: number } {
  let intense = 0, low = 0;
  for (const s of sectors) {
    const c = grid[s];
    if (!c) continue;
    intense += n(c.high) + n(c.medium);
    low += n(c.low);
  }
  return { intense, low };
}

export type MovementSegment = { key: "forward" | "backward" | "multidirectional"; label: Bi; share: number };

export type PeakMovementInput = {
  /** Aggregated IMA directional clock for the match session(s) around the peak window. */
  clock: ClockGrid | null;
  /** Peak-window high-speed-running rate (m/min), if the CTR window feed carries it. */
  hsrPerMin?: number | null;
  /** Peak-window total-distance rate (m/min) from the MII peak feed. */
  peakDistancePerMin?: number | null;
  /** Best game top speed (km/h) — separates a true high-speed straight run from a jog. */
  topSpeedKmh?: number | null;
  /** The window length this signature contextualises (1/3/5), for the read. */
  windowMin?: number | null;
};

export type PeakMovementRead = {
  hasData: boolean;
  archetype: MovementArchetype | null;
  /** forward / backward / multidirectional — share of his INTENSE directional efforts (sums to 1). */
  segments: MovementSegment[];
  /** Fraction of ALL his directional efforts that were intense (high+medium) vs low. */
  intenseShare: number | null;
  intenseEvents: number;           // high+medium IMA events behind the split (confidence basis)
  verdict: Bi;
  facts: Bi[];
  confidence: Confidence;
  citation: string;
  caveat: Bi;
};

const SEG_LABEL: Record<MovementSegment["key"], Bi> = {
  forward: { en: "Forward (attacking)", is: "Fram (sókn)" },
  backward: { en: "Backward (recovery)", is: "Aftur (endurheimt)" },
  multidirectional: { en: "Multidirectional (cuts)", is: "Fjölstefnu (skurðir)" },
};

// Uniform-movement baselines: forward and backward each span 3 clock sectors
// (3/12 = 25%), lateral spans 6 (6/12 = 50%). A player who moved equally in every
// direction would already show 50% lateral — so the ARCHETYPE is the family whose
// intense share most EXCEEDS its baseline, not the raw-largest (which is always
// lateral). This removes the sector-count bias the raw split has.
const BASELINE = { forward: 0.25, backward: 0.25, multidirectional: 0.5 } as const;

/** Top speed at/above which a forward-dominant window reads as a genuine high-speed sprint (km/h). */
const HIGH_SPEED_KMH = 30;
/** Below this many intense directional efforts, there is no meaningful peak movement to classify. */
const MIN_INTENSE = 8;

export function computePeakMovementSignature(input: PeakMovementInput): PeakMovementRead {
  const base: PeakMovementRead = {
    hasData: false, archetype: null, segments: [], intenseShare: null, intenseEvents: 0,
    verdict: { en: "", is: "" }, facts: [], confidence: "low", citation: CITATION, caveat: CAVEAT,
  };

  const grid = input.clock;
  if (!grid || typeof grid !== "object") {
    return { ...base, verdict: {
      en: "No IMA directional data for this match yet — needs the Catapult IMA clock to read his peak-window movement.",
      is: "Engin IMA-stefnugögn fyrir leikinn enn — þarf Catapult IMA-klukkuna til að lesa hreyfingu hámarksgluggans." } };
  }

  const fwd = sectorMass(grid, FORWARD_SECTORS);
  const bwd = sectorMass(grid, BACKWARD_SECTORS);
  const lat = sectorMass(grid, LATERAL_SECTORS);
  const lowTotal = fwd.low + bwd.low + lat.low;
  const intenseTotal = fwd.intense + bwd.intense + lat.intense;
  const grand = intenseTotal + lowTotal;
  if (grand <= 0) {
    return { ...base, verdict: {
      en: "IMA clock is present but empty for this match — no directional efforts to classify.",
      is: "IMA-klukka til staðar en tóm fyrir leikinn — engar stefnu-hreyfingar til að flokka." } };
  }
  const intenseShare = intenseTotal / grand;

  // Too little intense directional movement to read a peak archetype (a genuine
  // low-intensity block, or a session with almost no high/medium efforts).
  if (intenseTotal < MIN_INTENSE) {
    const facts: Bi[] = [{
      en: `Only ${Math.round(intenseShare * 100)}% of his directional movement was intense — too little to read a peak movement pattern.`,
      is: `Aðeins ${Math.round(intenseShare * 100)}% af stefnu-hreyfingu hans var ákaft — of lítið til að lesa hámarks-hreyfimynstur.`,
    }];
    return { ...base, hasData: true, archetype: "low_intensity", intenseShare, intenseEvents: Math.round(intenseTotal),
      segments: [], facts, confidence: "low",
      verdict: { en: "His movement here is mostly low-intensity — too little intense directional work to read a pattern.", is: "Hreyfing hans hér er aðallega lág-ákefðar — of lítil áköf stefnu-vinna til að lesa mynstur." } };
  }

  // Directional split of the INTENSE efforts (sums to 1) — the movement bar.
  const segments: MovementSegment[] = [
    { key: "forward", label: SEG_LABEL.forward, share: fwd.intense / intenseTotal },
    { key: "backward", label: SEG_LABEL.backward, share: bwd.intense / intenseTotal },
    { key: "multidirectional", label: SEG_LABEL.multidirectional, share: lat.intense / intenseTotal },
  ];

  // Archetype = family whose intense share most exceeds its uniform baseline.
  const excess = { forward: segments[0].share - BASELINE.forward, backward: segments[1].share - BASELINE.backward, multidirectional: segments[2].share - BASELINE.multidirectional };
  const winner = (Object.entries(excess).sort((a, b) => b[1] - a[1])[0][0]) as keyof typeof excess;
  const highSpeed = (input.topSpeedKmh ?? 0) >= HIGH_SPEED_KMH || (input.hsrPerMin ?? 0) > 0;
  const archetype: MovementArchetype =
    winner === "forward" ? "straight_attacking" : winner === "backward" ? "straight_recovery" : "multidirectional";

  const pct = (x: number) => Math.round(x * 100);
  const label = ARCHETYPE_LABEL[archetype];
  const verdict: Bi = {
    en: `His high-intensity movement is mostly ${label.en.toLowerCase()}.`,
    is: `Ákafa-hreyfing hans er aðallega ${label.is.toLowerCase()}.`,
  };

  const facts: Bi[] = [
    {
      en: `Of his intense directional efforts: ${pct(segments[0].share)}% forward, ${pct(segments[1].share)}% backward, ${pct(segments[2].share)}% multidirectional (cuts).`,
      is: `Af ákafum stefnu-hreyfingum hans: ${pct(segments[0].share)}% fram, ${pct(segments[1].share)}% aftur, ${pct(segments[2].share)}% fjölstefnu (skurðir).`,
    },
  ];
  if (archetype === "straight_attacking" && !highSpeed) {
    facts.push({
      en: "Forward-dominant, but without a high top-speed reading — forward accelerations rather than full sprints.",
      is: "Fram-drifið, en án hás topphraða — sóknar-hröðun frekar en fullir sprettir.",
    });
  }
  if (input.topSpeedKmh != null) {
    facts.push({ en: `Top speed this match: ${input.topSpeedKmh.toFixed(1)} km/h.`, is: `Topphraði í leiknum: ${input.topSpeedKmh.toFixed(1)} km/klst.` });
  }
  if (input.peakDistancePerMin != null) {
    facts.push({ en: `Peak rate: ${Math.round(input.peakDistancePerMin)} m/min.`, is: `Hámarkshraði: ${Math.round(input.peakDistancePerMin)} m/mín.` });
  }

  const confidence: Confidence = intenseTotal >= 40 ? "high" : intenseTotal >= 15 ? "medium" : "low";

  return { ...base, hasData: true, archetype, segments, intenseShare, intenseEvents: Math.round(intenseTotal), verdict, facts, confidence };
}

/** Sum several daily/session IMA clocks into one aggregate grid (for a match or a match block). */
export function sumClocks(grids: Array<ClockGrid | null | undefined>): ClockGrid | null {
  const out: ClockGrid = {};
  let any = false;
  for (const g of grids) {
    if (!g || typeof g !== "object") continue;
    for (const [k, c] of Object.entries(g)) {
      if (!c) continue;
      any = true;
      const cur = out[k] ?? { high: 0, medium: 0, low: 0 };
      out[k] = { high: n(cur.high) + n(c.high), medium: n(cur.medium) + n(c.medium), low: n(cur.low) + n(c.low) };
    }
  }
  return any ? out : null;
}
