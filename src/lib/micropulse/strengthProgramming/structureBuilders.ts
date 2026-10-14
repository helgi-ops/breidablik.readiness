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
  // MD-5 is the furthest-out development day — dose like MD-4 (dose tables are keyed
  // on the MD- days, so it resolves there).
  "MD-5": ["MD-4", "MD-3", "MD-2", "MD-1"],
  "MD-4": ["MD-4", "MD-3", "MD-2", "MD-1"],
  "MD-3": ["MD-3", "MD-4", "MD-2", "MD-1"],
  "MD-2": ["MD-2", "MD-3", "MD-4", "MD-1"],
  "MD-1": ["MD-1", "MD-2", "MD-3"],
  // MD+1 structures only build for the LOW tier (DNP / <30 min) — a real strength
  // stimulus — so dose it like a development day (MD-4), not the light recovery dose.
  "MD+1": ["MD-4", "MD-3", "MD-2", "MD-1"],
  // Recovery-side rebuild: MD+2 doses like a moderate day, MD+3 / MD+4 like a
  // development day (dose tables are keyed on the MD- days, so fall back there).
  "MD+2": ["MD+2", "MD-2", "MD-3", "MD-4"],
  "MD+3": ["MD+3", "MD-3", "MD-4", "MD-2"],
  "MD+4": ["MD-3", "MD-4", "MD-2", "MD-1"],
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

/** Build a prescribed exercise with a FULLY specified dose (independent of the
 *  sparse per-MD dose table) — for accumulation methods dosed by rep target. */
function prescribeFixed(exId: string, dose: ExerciseDose): PrescribedExercise | null {
  const ex = EXERCISES_BY_ID.get(exId);
  if (!ex) return null;
  return { exerciseId: ex.id, nameEN: ex.nameEN, nameIS: ex.nameIS, category: ex.category, dose, rationale: ex.evidence };
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

  // Yielding isometric — HIMA. Sub-maximal LONG-LENGTH holds (resist the load to
  // keep the position) for tissue / hypertrophy, not max strength (Lum 2026: hold
  // > push for muscle thickness; Oranchuk 2019: long length drives hypertrophy).
  // Low-fatigue — a strength-day (MD-4) or recovery-rebuild (MD+2/MD+3) option.
  // ISOMETRIC_LONG owns no palette slot, so the coach's picks don't overwrite it.
  if (key === "yielding_isometric") {
    const quad = prescribe("ex_spanish_squat", md, {
      sets: 3, reps: "30-45s hold", intensity: "60-70% MVC · long muscle length · resist, don't push",
      rest: "90s", intraRepRestSec: null, velocityLossCap: null,
      cue: "Sink to a long muscle length and HOLD the position against the load — controlled, sub-maximal",
    });
    const ham = prescribe("ex_iso_ham_bridge_long", md, {
      sets: 3, reps: "30s hold each side", intensity: "60-70% MVC · long lever",
      rest: "90s", intraRepRestSec: null, velocityLossCap: null,
      cue: "Long-lever bridge, knee nearly straight — hold the lengthened position",
    });
    if (!quad && !ham) return null;
    const block: SessionBlock = {
      id: "struct-yielding-iso",
      titleEN: "Yielding isometric (long-length holds)",
      titleIS: "Yielding ísómetría (löng hald)",
      type: "ISO_FINISH",
      exercises: compact([quad, ham]),
      structureId: sid,
      noteEN: "HOLD the position at a long muscle length (don't push into a stop) — 3 × 30-45s, sub-maximal, 90s rest. Yielding holds favour muscle thickness / tissue and carry very little fatigue; good on a development day or the recovery-side rebuild (Lum 2026, Oranchuk 2019).",
      noteIS: "HALTU stöðunni við langa vöðvalengd (ekki ýta í stopp) — 3 × 30-45s, undir hámarki, 90s hvíld. Yielding hald ýta undir vöðvaþykkt / vef og valda mjög lítilli þreytu; hentar á þróunardegi eða í bata-uppbyggingu (Lum 2026, Oranchuk 2019).",
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

  if (key === "straight_sets") {
    const main = prescribe(DEFAULT_COMPOUND, md, { sets: 3, intraRepRestSec: null });
    if (!main) return null;
    const block: SessionBlock = {
      id: "struct-compound",
      titleEN: "Compound strength (straight sets)",
      titleIS: "Aðallyfta (bein sett)",
      type: "COMPOUND",
      exercises: [main],
      structureId: sid,
      noteEN: "Straight sets: 3 × 3-5, full rest. Stop at 20% velocity loss.",
      noteIS: "Bein sett: 3 × 3-5, full hvíld. Stopp við 20% velocity drop.",
    };
    return compact([prep, block, ...prevention]) as SessionBlock[];
  }

  // Cluster PROTOCOLS — one main lift, each with its own fully-specified cluster
  // shape (rep count, %1RM, intra-rep rest, velocity cap). Same fatigue adaptation
  // as straight sets but with less fatigue (Davies 2021), re-dosed along the
  // continuum so each sits on its own MD day. The compound is palette-substituted.
  if (key === "cluster" || key === "cluster_max_strength" || key === "cluster_hypertrophy" || key === "cluster_metabolic") {
    const CLUSTER_SPEC: Record<
      "cluster" | "cluster_max_strength" | "cluster_hypertrophy" | "cluster_metabolic",
      { titleEN: string; titleIS: string; dose: ExerciseDose; noteEN: string; noteIS: string }
    > = {
      cluster: {
        titleEN: "Cluster · Mechanical stress (CS2)", titleIS: "Cluster · Vélrænt álag (CS2)",
        dose: { sets: 3, reps: "12 (6+6, 15s mid-set pause)", intensity: "80% 1RM", rest: "2-3 min", intraRepRestSec: 15, velocityLossCap: 20, cue: "Pause mid-set, then finish strong; stop at 20% velocity loss" },
        noteEN: "Mechanical-stress cluster (Tufano CS2): 3 × 12 at ~80% 1RM with a 15s pause partway through each set. More force + time-under-tension than a straight set, less fatigue. Stop at 20% velocity loss (Tufano 2017; Davies 2021).",
        noteIS: "Vélræns-álags cluster (Tufano CS2): 3 × 12 á ~80% 1RM með 15s pásu í miðju hverju setti. Meiri kraftur + tími-undir-álagi en bein sett, minni þreyta. Stopp við 20% velocity drop (Tufano 2017; Davies 2021).",
      },
      cluster_max_strength: {
        titleEN: "Cluster · Max-strength singles", titleIS: "Cluster · Hámarksstyrkur (einstök)",
        dose: { sets: 4, reps: "6 × 1 (singles)", intensity: "85-90% 1RM", rest: "1 min between blocks", intraRepRestSec: 12, velocityLossCap: 20, cue: "Every single fast + max intent; 12s between reps keeps each one fresh" },
        noteEN: "Heavy max-strength singles (Hansen cluster): 4 sets of 6 × 1 at 85-90% 1RM, 12s between reps, 1 min between sets. Keeps bar speed high on a near-max load — strong neural stimulus, less fatigue than straight singles (Tufano 2017; Davies 2021). A development-day method.",
        noteIS: "Þungar hámarksstyrks-einstök (Hansen cluster): 4 sett af 6 × 1 á 85-90% 1RM, 12s milli enda, 1 mín milli setta. Heldur stangarhraða háum á næstum hámarksálagi — sterk taugaörvun, minni þreyta en bein einstök (Tufano 2017; Davies 2021). Þróunardaga-aðferð.",
      },
      cluster_hypertrophy: {
        titleEN: "Cluster · Hypertrophy (CS4)", titleIS: "Cluster · Vöðvastækkun (CS4)",
        dose: { sets: 3, reps: "12 (break after rep 4 & 8)", intensity: "75% 1RM", rest: "2 min", intraRepRestSec: 30, velocityLossCap: null, cue: "30s break after the 4th and 8th rep — keep every rep crisp" },
        noteEN: "Hypertrophy + power cluster (Tufano CS4): 3 × 12 at ~75% 1RM with a 30s pause after rep 4 and rep 8. Accumulation volume while maintaining bar speed — between CS2 and a regular set (Tufano 2017).",
        noteIS: "Vöðvastækkunar- + afl-cluster (Tufano CS4): 3 × 12 á ~75% 1RM með 30s pásu eftir 4. og 8. end. Uppsöfnunarmagn en heldur stangarhraða — milli CS2 og venjulegs setts (Tufano 2017).",
      },
      cluster_metabolic: {
        titleEN: "Cluster · Metabolic (Oliver)", titleIS: "Cluster · Efnaskipti (Oliver)",
        dose: { sets: 4, reps: "5 + 5 (30s mid-set)", intensity: "~75% 1RM", rest: "90s", intraRepRestSec: 30, velocityLossCap: null, cue: "5 reps → 30s → 5 reps; the break keeps force up and lactate down" },
        noteEN: "Metabolic conditioning cluster (Oliver): 4 sets of (5 → 30s rest → 5) on a lower-body compound, 90s between sets. The mid-set break keeps force high while lowering lactate/fatigue vs a straight 10.",
        noteIS: "Efnaskipta-cluster (Oliver): 4 sett af (5 → 30s hvíld → 5) á neðri-líkama lyftu, 90s milli setta. Pásan í miðju setti heldur krafti háum en lækkar laktat/þreytu vs bein 10.",
      },
    };
    const spec = CLUSTER_SPEC[key];
    const main = prescribeFixed(DEFAULT_COMPOUND, spec.dose);
    if (!main) return null;
    const block: SessionBlock = {
      id: "struct-compound",
      titleEN: spec.titleEN,
      titleIS: spec.titleIS,
      type: "COMPOUND",
      exercises: [main],
      structureId: sid,
      noteEN: spec.noteEN,
      noteIS: spec.noteIS,
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

  // Supersets / trisets — time-efficient ACCUMULATION. A pair (superset) or trio
  // (triset) done back-to-back. The lower-body (A1) and upper-body (A2 / A3) both
  // own palette slots, so the coach's picks substitute in; a sensible default
  // otherwise. Moderate rep-target dose, independent of the per-MD load table.
  if (key === "supersets" || key === "trisets") {
    const triset = key === "trisets";
    const dose = (over: Partial<ExerciseDose>): ExerciseDose => ({
      sets: 3, reps: "8-10", intensity: "moderate · 1-2 RIR", rest: "45-60s",
      intraRepRestSec: null, velocityLossCap: null, ...over,
    });
    const lower = prescribeFixed(DEFAULT_COMPOUND, dose({ cue: "A1 — control the lift, then straight into the next exercise" }));
    const upper = prescribeFixed("ex_bb_bench_press", dose({ cue: "A2 — upper push" }));
    const pull = triset ? prescribeFixed("ex_chin_up", dose({ reps: "6-10", cue: "A3 — pull" })) : null;
    const exercises = compact([lower, upper, pull]);
    if (exercises.length < 2) return null;
    const block: SessionBlock = {
      id: triset ? "struct-triset" : "struct-superset",
      titleEN: triset ? "Triset (three back-to-back)" : "Superset (lower + upper)",
      titleIS: triset ? "Þrísett (þrjár í röð)" : "Samsett sett (neðri + efri)",
      type: "ACCESSORY",
      exercises,
      structureId: sid,
      noteEN: triset
        ? "Three exercises as one set — A1 → A2 → A3, 15-30s between, then 1.5-2 min rest. 3 sets. Time-efficient accumulation; keep 1-2 reps in reserve (Weakley 2017)."
        : "Two exercises back-to-back — lower A1 → upper A2, 30-60s between, then 1.5-2 min rest. 3 sets. Time-efficient accumulation; keep 1-2 reps in reserve (Robbins 2010).",
      noteIS: triset
        ? "Þrjár æfingar sem eitt sett — A1 → A2 → A3, 15-30s á milli, svo 1,5-2 mín hvíld. 3 sett. Tímasparandi uppsöfnun; haltu 1-2 endum í varasjóði (Weakley 2017)."
        : "Tvær æfingar í röð — neðri A1 → efri A2, 30-60s á milli, svo 1,5-2 mín hvíld. 3 sett. Tímasparandi uppsöfnun; haltu 1-2 endum í varasjóði (Robbins 2010).",
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
