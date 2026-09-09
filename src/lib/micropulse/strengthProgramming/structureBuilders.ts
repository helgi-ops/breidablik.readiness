/**
 * structureBuilders — lay out a chosen training METHOD as session blocks.
 *
 * These produce the SAME `SessionBlock[]` shape the built-in MD templates do, so
 * everything downstream is identical: the palette substitution (symmetry picks
 * uni/bi), the adaptation rules (readiness / soreness / decel), coach overrides
 * and serialization all run on top unchanged. A builder therefore only decides
 * the METHOD's block layout + the MD dose — it uses sensible DEFAULT exercises;
 * the team palette then replaces them with the coach's chosen lifts (Phase 2).
 *
 * Dose is exercise + MD specific and sparse in the library (a plyo is dosed for
 * MD-3/MD-2, a compound for MD-4/MD-3), so `resolveDose` falls back to the nearest
 * available MD dose when a method places an exercise on a day it isn't dosed for —
 * the taper/readiness adjustment still governs the final load.
 *
 * Evidence: Tufano 2017 (cluster), Cormie 2011 / Liu 2023 (French contrast),
 * van Dyk 2019 (Nordic), Harøy 2019 (Copenhagen).
 */
import type { SessionBlock, PrescribedExercise, MdContext, ExerciseDose } from "./types";
import { EXERCISES_BY_ID } from "./exerciseLibrary";
import { STRUCTURE_HOWTO_KEY, type StructureKey } from "./structures";

/** Nearest-MD dose fallback order (the chosen day first). */
const DOSE_FALLBACK: Record<MdContext, MdContext[]> = {
  "MD-4": ["MD-4", "MD-3", "MD-2", "MD-1"],
  "MD-3": ["MD-3", "MD-4", "MD-2", "MD-1"],
  "MD-2": ["MD-2", "MD-3", "MD-4", "MD-1"],
  "MD-1": ["MD-1", "MD-2", "MD-3"],
  "MD+1": ["MD+1", "MD-2", "MD-3"],
  "MD+2": ["MD+2"],
  OFF: ["OFF"],
};

function resolveDose(exId: string, md: MdContext): ExerciseDose | null {
  const ex = EXERCISES_BY_ID.get(exId);
  if (!ex) return null;
  for (const m of DOSE_FALLBACK[md] ?? [md]) {
    const d = ex.defaultDosing[m];
    if (d) return d;
  }
  return null;
}

/** Prescribe a default exercise at the MD dose (null if the exercise is unknown
 *  or has no dose anywhere — the caller drops it). `over` tweaks the dose. */
function prescribe(exId: string, md: MdContext, over?: Partial<ExerciseDose>): PrescribedExercise | null {
  const ex = EXERCISES_BY_ID.get(exId);
  const base = resolveDose(exId, md);
  if (!ex || !base) return null;
  return {
    exerciseId: ex.id,
    nameEN: ex.nameEN,
    nameIS: ex.nameIS,
    category: ex.category,
    dose: over ? { ...base, ...over } : base,
    rationale: ex.evidence,
  };
}

const compact = <T,>(xs: (T | null)[]): T[] => xs.filter((x): x is T => !!x);

/** Prep block (shared) — glute activation before strength, pogo before power. */
function prepBlock(power: boolean, md: MdContext): SessionBlock | null {
  const ex = prescribe(power ? "mp_pogo_warmup" : "mp_glute_activation", md);
  if (!ex) return null;
  return {
    id: "struct-prep",
    titleEN: power ? "Movement prep + plyo primer" : "Movement prep",
    titleIS: power ? "Hreyfilína + plyo primer" : "Upphitun",
    type: "PREP",
    exercises: [ex],
  };
}

/** Injury-prevention block — Nordic + Copenhagen, non-negotiable (kept out of the
 *  palette so it always survives). */
function preventionBlocks(md: MdContext): SessionBlock[] {
  const nordic = prescribe("ex_nordic_curl", md, { sets: 2 });
  const copenhagen = prescribe("ex_copenhagen", md, { sets: 2 });
  const out: SessionBlock[] = [];
  if (nordic) out.push({ id: "struct-posterior", titleEN: "Nordic hamstring (prevention)", titleIS: "Nordic hamstring (forvörn)", type: "POSTERIOR", exercises: [nordic], noteEN: "Non-negotiable. 51% hamstring injury reduction (van Dyk 2019).", noteIS: "Non-negotiable. 51% færri hamstring meiðsl (van Dyk 2019)." });
  if (copenhagen) out.push({ id: "struct-adductor", titleEN: "Copenhagen adduction (prevention)", titleIS: "Copenhagen (forvörn)", type: "ADDUCTOR", exercises: [copenhagen], noteEN: "Non-negotiable. 41% groin injury reduction (Harøy 2019).", noteIS: "Non-negotiable. 41% færri nárameiðsl (Harøy 2019)." });
  return out;
}

/** Default main compound for a strength/power day (palette replaces it later). */
const DEFAULT_COMPOUND = "ex_trap_bar_dl";
const DEFAULT_PLYO = "ex_box_jump";
const DEFAULT_BALLISTIC = "ex_trap_bar_jump_squat";
const DEFAULT_MEDBALL = "ex_mb_rotational_throw";
const DEFAULT_OLYMPIC = "ex_jump_shrug"; // loaded triple-extension for the power contrast
const DEFAULT_ISO = "ex_iso_squat_90";  // overcoming iso at long muscle length (90° knee)

/**
 * Build one training method's blocks at the given MD dose. Returns null if the
 * method's core lift can't be dosed (caller then falls back to the template).
 * `structureId` is stamped on the method block so the card shows its how-to.
 */
export function buildStructuredBlocks(key: StructureKey, md: MdContext): SessionBlock[] | null {
  const sid = STRUCTURE_HOWTO_KEY[key];
  const isPowerMethod = key === "contrast" || key === "french_contrast" || key === "power_contrast" || key === "potentiation_cluster";
  const prep = prepBlock(isPowerMethod, md);
  // Injury-prevention (Nordic + Copenhagen) belongs on the strength/power days
  // (MD-4 / MD-3); the taper days (MD-2 / MD-1) stay light primers with no
  // eccentric prevention load.
  const prevention = md === "MD-4" || md === "MD-3" ? preventionBlocks(md) : [];

  // Velocity / explosive taper-day methods — deliberately dosed light + fast (PAP),
  // independent of the day's default library load. Both live in the power_explosive
  // palette slot, so the coach's power picks substitute in.
  if (key === "potentiation_cluster") {
    const main = prescribe(DEFAULT_BALLISTIC, md, {
      sets: 3, reps: "3", intensity: "explosive · max intent", rest: "2-3 min",
      intraRepRestSec: 20, velocityLossCap: 10, cue: "Every rep at maximal velocity",
    });
    if (!main) return null;
    const block: SessionBlock = {
      id: "struct-pot-cluster",
      titleEN: "Potentiation cluster (explosive)",
      titleIS: "Potentiation cluster (sprengikraftur)",
      type: "POWER_PRIMER",
      exercises: [main],
      structureId: sid,
      noteEN: "Cluster: 3 fast reps → 20s intra-set rest → repeat, 3 sets. Velocity-based (stop at 10% drop). Post-activation potentiation, no fatigue (Tufano 2017).",
      noteIS: "Cluster: 3 hraðar endur → 20s innan-setts hvíld → endurtaka, 3 sett. Velocity-based (stopp við 10% drop). PAP án þreytu (Tufano 2017).",
    };
    return compact([prep, block, ...prevention]);
  }

  // Overcoming isometric — max strength / RFD. Long muscle length + high intent +
  // high load push against immovable resistance (Oranchuk 2023). A strength-day
  // method; keeps injury-prevention.
  if (key === "overcoming_isometric") {
    const main = prescribe(DEFAULT_ISO, md, {
      sets: 4, reps: "5s hold", intensity: "≥70% MVC · long muscle length · push max",
      rest: "2-3 min", intraRepRestSec: null, velocityLossCap: null,
      cue: "Push as hard AND as fast as you can from the very first second",
    });
    if (!main) return null;
    const block: SessionBlock = {
      id: "struct-overcoming-iso",
      titleEN: "Overcoming isometric (max strength)",
      titleIS: "Overcoming ísómetría (hámarksstyrkur)",
      type: "COMPOUND",
      exercises: [main],
      structureId: sid,
      noteEN: "Push maximally against an immovable bar/pins at a long muscle length (deep joint angle). 4 × 5s, 2-3 min rest. High intent drives motor-unit recruitment + RFD without joint movement (Oranchuk 2023).",
      noteIS: "Ýttu af hámarkskrafti gegn óhreyfanlegri stöng/pinnum við langa vöðvalengd (djúpt liðhorn). 4 × 5s, 2-3 mín hvíld. Hár ásetningur eykur virkjun hreyfitauga + RFD án hreyfingar (Oranchuk 2023).",
    };
    return compact([prep, block, ...prevention]);
  }

  // Isometric PAP primer — a maximal isometric conditioning activity that
  // potentiates a following explosive set (PAPE). 3 sets × 3×3s max iso, then the
  // explosive action; effect at 3-6 min (Krzysztofik 2023, Jarosz 2025). Taper day.
  if (key === "iso_pap_primer") {
    const ica = prescribe(DEFAULT_ISO, md, {
      sets: 3, reps: "3 × 3s", intensity: "near-max · explosive intent",
      rest: "3-6 min", intraRepRestSec: 20, velocityLossCap: null,
      cue: "3s maximal push, then rest 3-6 min before the explosive set",
    });
    const explosive = prescribe(DEFAULT_PLYO, md, { sets: 3, reps: "3-5", intensity: "bodyweight · max height", rest: "2 min" });
    if (!ica || !explosive) return null;
    const block: SessionBlock = {
      id: "struct-iso-pap",
      titleEN: "Isometric PAP primer → explosive",
      titleIS: "Ísómetrísk PAP-örvun → sprengikraftur",
      type: "FRENCH_CONTRAST",
      exercises: [ica, explosive],
      structureId: sid,
      noteEN: "Conditioning activity: 3 sets × 3×3s maximal isometric push. Rest 3-6 min, then the explosive set — the isometric potentiates it (higher jump/sprint output). Volume matters: one set does nothing (Jarosz 2025).",
      noteIS: "Örvun: 3 lotur × 3×3s hámarks ísómetrísk ýting. Hvíld 3-6 mín, svo sprengiæfingin — ísómetrían örvar hana (hærra stökk/spretthraði). Magn skiptir máli: ein lota gerir ekkert (Jarosz 2025).",
    };
    return compact([prep, block, ...prevention]);
  }

  if (key === "power_contrast") {
    const loaded = prescribe(DEFAULT_OLYMPIC, md, { sets: 3, reps: "3", intensity: "loaded · fast", rest: "20-30s", velocityLossCap: 10 });
    const plyo = prescribe(DEFAULT_PLYO, md, { sets: 3, reps: "3-5", intensity: "bodyweight · max height", rest: "2 min" });
    if (!loaded || !plyo) return null;
    const block: SessionBlock = {
      id: "struct-power-contrast",
      titleEN: "Power contrast (velocity)",
      titleIS: "Afl-contrast (hraði)",
      type: "FRENCH_CONTRAST",
      exercises: [loaded, plyo],
      structureId: sid,
      noteEN: "Pair each round: loaded fast lift 3 → 20-30s → plyometric 3-5 → 2 min. 2-3 rounds. Speed intent throughout — potentiation, not load (Cormie 2011).",
      noteIS: "Paraðu hvern hring: hlaðin hröð lyfta 3 → 20-30s → plyo 3-5 → 2 mín. 2-3 hringir. Hraði allan tímann — potentiation, ekki álag (Cormie 2011).",
    };
    return compact([prep, block, ...prevention]);
  }

  if (key === "cluster" || key === "straight_sets") {
    const cluster = key === "cluster";
    const main = prescribe(DEFAULT_COMPOUND, md, cluster ? { sets: 3 } : { sets: 3, intraRepRestSec: null });
    if (!main) return null;
    const block: SessionBlock = {
      id: "struct-compound",
      titleEN: cluster ? "Compound strength (cluster)" : "Compound strength (straight sets)",
      titleIS: cluster ? "Aðallyfta (cluster)" : "Aðallyfta (bein sett)",
      type: "COMPOUND",
      exercises: [main],
      structureId: sid,
      noteEN: cluster
        ? "Cluster: 3 reps → 25s pause → repeat, 3 sets. Stop at 20% velocity loss (Tufano 2017)."
        : "Straight sets: 3 × 3-5, full rest. Stop at 20% velocity loss.",
      noteIS: cluster
        ? "Cluster: 3 endur → 25s pása → endurtaka, 3 sett. Stopp við 20% velocity drop (Tufano 2017)."
        : "Bein sett: 3 × 3-5, full hvíld. Stopp við 20% velocity drop.",
    };
    return compact([prep, block, ...prevention]) as SessionBlock[];
  }

  if (key === "contrast") {
    const heavy = prescribe(DEFAULT_COMPOUND, md, { sets: 3 });
    const plyo = prescribe(DEFAULT_PLYO, md, { sets: 3 });
    if (!heavy || !plyo) return null;
    const block: SessionBlock = {
      id: "struct-contrast",
      titleEN: "Contrast (strength + plyo)",
      titleIS: "Contrast (styrkur + plyo)",
      type: "FRENCH_CONTRAST",
      exercises: [heavy, plyo],
      structureId: sid,
      noteEN: "Pair each round: heavy lift 3 reps → 30s rest → matched plyo 3-5 → 2-3 min. 3 rounds. Post-activation potentiation (Cormie 2011).",
      noteIS: "Paraðu hvern hring: þung lyfta 3 endur → 30s → plyo 3-5 → 2-3 mín. 3 hringir. Post-activation potentiation (Cormie 2011).",
    };
    return compact([prep, block, ...prevention]) as SessionBlock[];
  }

  // french_contrast — 4-part complex + med-ball finisher.
  const quad = compact([
    prescribe(DEFAULT_COMPOUND, md, { sets: 2 }),
    prescribe(DEFAULT_PLYO, md, { sets: 2 }),
    prescribe(DEFAULT_BALLISTIC, md, { sets: 2 }),
    prescribe(DEFAULT_MEDBALL, md, { sets: 2 }),
  ]);
  if (quad.length < 2) return null;
  const block: SessionBlock = {
    id: "struct-french-contrast",
    titleEN: "French Contrast complex",
    titleIS: "French Contrast komplex",
    type: "FRENCH_CONTRAST",
    exercises: quad,
    structureId: sid,
    noteEN: "One complex per round: heavy 3 → 30s → plyo 3 → 30s → loaded jump 3 → 30s → med-ball 4/side. 2-3 rounds (Liu 2023).",
    noteIS: "Eitt komplex per hring: þung 3 → 30s → plyo 3 → 30s → hlaðið stökk 3 → 30s → med-ball 4/hlið. 2-3 hringir (Liu 2023).",
  };
  return compact([prep, block, ...prevention]) as SessionBlock[];
}
