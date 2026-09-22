/**
 * Block emphasis — the MESO layer applied to a built strength session.
 *
 * The macro→meso→micro spine is shared with the load periodization (Accumulation → Transmutation →
 * Realization + deload, Issurin 2010). buildStrengthSession lays out the MD-day (micro) session; this
 * pure post-processor tilts THAT session toward the block it sits in:
 *   (a) a bounded, recorded volume nudge per block goal — Accumulation adds a set (hypertrophy volume),
 *       Realization trims non-power volume (taper, keep output), Deload halves it. Transmutation is the
 *       engine's default in-season expression → no set change, just the intent note.
 *   (b) playerBlockLean — how ONE athlete leans WITHIN the block, from his own pre-season emphasis.
 *
 * Bounded + reviewable: every change is appended to appliedAdaptations with a citation, applied ON TOP
 * of readiness/MD tuning (the outer periodization layer). Advisory — the coach sees and can override.
 * Pure: no fetch, no readiness colour.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { StrengthSession, SessionBlock, AppliedAdaptation } from "./types";
import type { BlockGoalKey, SeasonPhaseKey } from "./seasonPhaseStrength";
import { strengthForBlockGoal } from "./seasonPhaseStrength";

export type BlockEmphasis = {
  goalKey: BlockGoalKey;
  blockLabel: Bi;   // Accumulation / Transmutation / Realization / Deload
  quality: Bi;      // the block's strength quality (from strengthForBlockGoal)
  intent: Bi;       // how-to (set/rep intent)
  applied: Bi;      // what THIS session had done to it (layer-0 read)
  cite: string;
  playerLean?: Bi | null;   // (b) per-player lean within the block
};

const BLOCK_LABEL: Record<BlockGoalKey, Bi> = {
  accum: { en: "Accumulation", is: "Uppsöfnun" },
  transmute: { en: "Transmutation", is: "Umbreyting" },
  realize: { en: "Realization", is: "Framkvæmd" },
  deload: { en: "Deload", is: "Niðurtröppun" },
};

// Blocks whose volume the block tilt scales. Power/plyo/contrast/med-ball are OUTPUT work — never
// trimmed for a taper and never inflated for accumulation; they express the quality, not the volume.
const VOLUME_TYPES: ReadonlySet<SessionBlock["type"]> = new Set(["COMPOUND", "ACCESSORY", "UNILATERAL", "POSTERIOR", "ADDUCTOR"]);

const CITE = "Issurin 2010 (block periodisation); Cuthbert 2021 (volume distribution); Rønnestad 2011";

/** Clamp a set count into a sane range so a nudge can never zero-out or balloon a block. */
const clampSets = (n: number) => Math.max(1, Math.min(6, Math.round(n)));

/**
 * Tilt a built session toward its meso block. Returns a NEW session (never mutates the input); a null
 * or unknown goalKey, or a session with no blocks, is returned unchanged (backwards-compatible).
 */
export function applyBlockToSession(
  session: StrengthSession | null,
  goalKey: BlockGoalKey | null,
  phase: SeasonPhaseKey,
): StrengthSession | null {
  if (!session || !goalKey) return session;
  const scheme = strengthForBlockGoal(goalKey, phase);
  const label = BLOCK_LABEL[goalKey];

  // Deload / Realization / (pre-season) Accumulation carry a bounded set nudge; Transmutation and an
  // in-season re-accumulation keep the engine's dosing (note only).
  const delta =
    goalKey === "deload" ? "halve"
    : goalKey === "realize" ? "trim"
    : goalKey === "accum" && phase === "preseason" ? "add"
    : "none";

  let changed = 0;
  const blocks: SessionBlock[] = session.blocks.map((b) => {
    if (delta === "none" || !VOLUME_TYPES.has(b.type)) return b;
    const exercises = b.exercises.map((ex) => {
      const before = ex.dose.sets;
      const after =
        delta === "halve" ? clampSets(before / 2)
        : delta === "trim" ? clampSets(before - 1)
        : clampSets(before + 1); // add
      if (after === before) return ex;
      changed += 1;
      return { ...ex, dose: { ...ex.dose, sets: after } };
    });
    return { ...b, exercises };
  });

  const applied: Bi =
    delta === "halve" ? { en: "Deload week — volume cut ~50% across accessory/compound, intensity touches kept.", is: "Niðurtröppunar-vika — magn skorið ~50% á auka/grunnæfingum, ákefðar-snertingar haldast." }
    : delta === "trim" ? { en: "Realization taper — trimmed a set off accessory/compound; power & contrast kept intact.", is: "Framkvæmdar-taper — tók sett af auka/grunnæfingum; kraftur & kontrast haldast óbreytt." }
    : delta === "add" ? { en: "Accumulation — added a set of hypertrophy/base volume to accessory/compound work.", is: "Uppsöfnun — bætti setti af hypertrophy/grunn-magni á auka/grunnæfingar." }
    : goalKey === "accum" ? { en: "In-season re-accumulation — hold volume, bias compound heavier to rebuild a strength base.", is: "Endur-uppsöfnun á tímabili — haltu magni, þyngdu grunnæfingar til að endurbyggja styrk-grunn." }
    : { en: "Strength–power — the day's default expression; keep bar speed high (velocity-loss cap).", is: "Styrkur–kraftur — sjálfgefin tjáning dagsins; haltu stangarhraða háum (hraðatap-þak)." };

  const blockEmphasis: BlockEmphasis = {
    goalKey, blockLabel: label, quality: scheme.quality, intent: scheme.scheme, applied, cite: CITE,
  };

  const adaptation: AppliedAdaptation | null = changed > 0 ? {
    ruleId: `BLOCK_${goalKey.toUpperCase()}`,
    triggerEN: `Meso block: ${label.en} (${scheme.quality.en})`,
    triggerIS: `Meso blokk: ${label.is} (${scheme.quality.is})`,
    actionEN: applied.en,
    actionIS: applied.is,
    evidence: CITE,
  } : null;

  return {
    ...session,
    blocks,
    blockEmphasis,
    appliedAdaptations: adaptation ? [...session.appliedAdaptations, adaptation] : session.appliedAdaptations,
  };
}

// ───────────────────── (b) per-player lean WITHIN the block ─────────────────────
// The pre-season emphasis recommender gives each athlete a bias (hypertrophy / max_strength / power /
// strength_endurance / injury_prevention_priority). This maps (block × his emphasis) → one directive:
// how the coach should tilt THIS player's session inside the shared block. Descriptive.

type Emphasis = "hypertrophy" | "max_strength" | "power" | "strength_endurance" | "injury_prevention_priority" | string;

export function playerBlockLean(goalKey: BlockGoalKey | null, emphasis: Emphasis | null | undefined): Bi | null {
  if (!goalKey || !emphasis || goalKey === "deload") return null;
  const e = String(emphasis);
  if (e === "injury_prevention_priority") {
    return { en: "Injury-prevention priority — keep his Nordic/Copenhagen dose in regardless of the block tilt.", is: "Meiðslavarnir í forgang — haltu Nordic/Copenhagen skammtinum inni óháð blokkar-halla." };
  }
  if (goalKey === "accum") {
    return e === "hypertrophy" ? { en: "Leans hypertrophy — take the extra accumulation volume; higher reps on his accessories.", is: "Hallast að hypertrophy — taktu auka-uppsöfnunar-magnið; fleiri endurtekningar á auka-æfingum." }
      : e === "max_strength" ? { en: "Leans max strength — bias his compound work heavier/lower-rep even in accumulation.", is: "Hallast að hámarksstyrk — þyngdu grunnæfingar hans / færri endurt. jafnvel í uppsöfnun." }
      : e === "power" ? { en: "Leans power — protect a power primer; don't let accumulation volume blunt his output.", is: "Hallast að afli — verndaðu kraft-inngang; ekki láta uppsöfnunar-magn deyfa afköst hans." }
      : { en: "Recondition — build volume gradually; accumulation is his re-entry ramp.", is: "Enduruppbygging — byggðu magn hægt; uppsöfnun er hans endurkomu-rampi." };
  }
  if (goalKey === "transmute") {
    return e === "power" ? { en: "Leans power — push the strength–power end (contrast / WL derivatives).", is: "Hallast að afli — ýttu á styrk–kraft endann (kontrast / lyftinga-afleiður)." }
      : e === "max_strength" ? { en: "Leans max strength — keep the heavy compound as the anchor of his transmutation.", is: "Hallast að hámarksstyrk — haltu þungri grunnæfingu sem akkeri umbreytingar hans." }
      : { en: "Convert his built volume into football power — explosive intent, capped velocity loss.", is: "Umbreyttu byggðu magni hans í fótbolta-kraft — sprengikraftur, þak á hraðatapi." };
  }
  // realize
  return e === "power" ? { en: "Leans power — this is his block: prioritise jumps/throws + contrast, minimal grinding.", is: "Hallast að afli — þetta er hans blokk: forgangsraðaðu stökkum/köstum + kontrast, lágmarks-púl." }
    : e === "max_strength" ? { en: "Keep one heavy potentiator (PAP) — but taper volume hard into the fixture.", is: "Haltu einum þungum potentiator (PAP) — en trappaðu magn hratt niður í leikinn." }
    : { en: "Taper — express what he built; low volume, high output into the fixture.", is: "Taper — tjáðu það sem hann byggði; lágt magn, há afköst í leikinn." };
}
