/**
 * Four-week coach-sendable strength blocks, built from the exercise library so every item is
 * SWAPPABLE on the player's Today card (each carries its library `exerciseId` + curated `alternatives`).
 * 4 sessions/week — Mon Upper-Push, Tue Lower-Quad, Thu Upper-Pull, Fri Lower-Hinge — with progressive
 * overload (load climbs weekly, reps drop).
 *
 * Three METHODS (off-season power methods reuse the existing structure library so the player gets the
 * matching how-to via `structureId`):
 *   - upper_lower    : straight-sets hypertrophy/strength (default).
 *   - contrast       : heavy strength A1 + explosive A2 pair (structureId "contrast").
 *   - french_contrast: 4-exercise complex A1 heavy → A2 plyo → A3 loaded jump → A4 reactive
 *                      (structureId "french-contrast").
 *
 * Emits `TodayStructureBlock[]` (toTodayStructure shape) — the send route writes it per date into
 * player_today_strength_override; existing swap + Today rendering + structureHowTo work unchanged.
 * Descriptive — never the readiness colour.
 *
 * Overload: Issurin 2010. Contrast/complex PAP: Cormie 2011, Dietz (French contrast). Nordic: van Dyk 2019.
 */

import { EXERCISES_BY_ID } from "@/lib/micropulse/strengthProgramming/exerciseLibrary";
import type { TodayStructureBlock, TodayStructureItem } from "@/lib/micropulse/strengthProgramming/toTodayStructure";

export type BlockDayKey = "push" | "quad" | "pull" | "hinge";
export type BlockMethod = "upper_lower" | "contrast" | "french_contrast";
type Lang = "EN" | "IS";
type Role = "main" | "accessory" | "nordic" | "heavy" | "plyo" | "loadedjump" | "reactive";

export const METHOD_LABELS: Record<BlockMethod, { en: string; is: string }> = {
  upper_lower: { en: "Upper / Lower (strength)", is: "Efri / Neðri (styrkur)" },
  contrast: { en: "Contrast (power)", is: "Contrast (kraftur)" },
  french_contrast: { en: "French Contrast (power)", is: "French Contrast (kraftur)" },
};
const METHOD_STRUCTURE_ID: Record<BlockMethod, string | undefined> = {
  upper_lower: undefined, contrast: "contrast", french_contrast: "french-contrast",
};

const DAY_META: Record<BlockDayKey, { dow: number; en: string; is: string }> = {
  push:  { dow: 0, en: "Upper — Push",           is: "Efri — Ýta" },
  quad:  { dow: 1, en: "Lower — Quad-dominant",  is: "Neðri — Framlæri" },
  pull:  { dow: 3, en: "Upper — Pull",           is: "Efri — Tog" },
  hinge: { dow: 4, en: "Lower — Hinge-dominant", is: "Neðri — Mjaðmahjör" },
};
export const BLOCK_DAY_ORDER: BlockDayKey[] = ["push", "quad", "pull", "hinge"];

// Exercise slots per method × day (library ids). role drives the weekly scheme.
const METHOD_SLOTS: Record<BlockMethod, Record<BlockDayKey, Array<{ id: string; role: Role }>>> = {
  upper_lower: {
    push:  [{ id: "ex_bb_bench_press", role: "main" }, { id: "ex_db_shoulder_press", role: "main" }, { id: "ex_incline_db_press", role: "accessory" }, { id: "ex_weighted_pushup", role: "accessory" }],
    quad:  [{ id: "ex_back_squat", role: "main" }, { id: "ex_bulgarian_ss", role: "accessory" }, { id: "ex_reverse_lunge", role: "accessory" }, { id: "ex_heavy_calf_raise", role: "accessory" }],
    pull:  [{ id: "ex_chin_up", role: "main" }, { id: "ex_bb_bent_row", role: "main" }, { id: "ex_db_row", role: "accessory" }],
    hinge: [{ id: "ex_rdl", role: "main" }, { id: "ex_hip_thrust", role: "accessory" }, { id: "ex_nordic_curl", role: "nordic" }, { id: "ex_single_leg_rdl", role: "accessory" }],
  },
  contrast: {
    push:  [{ id: "ex_bb_bench_press", role: "heavy" }, { id: "ex_plyo_pushup", role: "plyo" }, { id: "ex_incline_db_press", role: "accessory" }, { id: "ex_db_row", role: "accessory" }],
    quad:  [{ id: "ex_back_squat", role: "heavy" }, { id: "ex_box_jump", role: "plyo" }, { id: "ex_bulgarian_ss", role: "accessory" }, { id: "ex_heavy_calf_raise", role: "accessory" }],
    pull:  [{ id: "ex_bb_bent_row", role: "heavy" }, { id: "ex_mb_slam", role: "plyo" }, { id: "ex_chin_up", role: "accessory" }, { id: "ex_db_row", role: "accessory" }],
    hinge: [{ id: "ex_trap_bar_dl", role: "heavy" }, { id: "ex_broad_jump", role: "plyo" }, { id: "ex_nordic_curl", role: "nordic" }, { id: "ex_hip_thrust", role: "accessory" }],
  },
  french_contrast: {
    push:  [{ id: "ex_bb_bench_press", role: "heavy" }, { id: "ex_plyo_pushup", role: "plyo" }, { id: "ex_db_push_press", role: "loadedjump" }, { id: "ex_mb_chest_pass", role: "reactive" }],
    quad:  [{ id: "ex_back_squat", role: "heavy" }, { id: "ex_box_jump", role: "plyo" }, { id: "ex_trap_bar_jump_squat", role: "loadedjump" }, { id: "ex_depth_jump", role: "reactive" }],
    pull:  [{ id: "ex_bb_bent_row", role: "heavy" }, { id: "ex_mb_slam", role: "plyo" }, { id: "ex_db_push_press", role: "loadedjump" }, { id: "ex_mb_chest_pass", role: "reactive" }],
    hinge: [{ id: "ex_trap_bar_dl", role: "heavy" }, { id: "ex_broad_jump", role: "plyo" }, { id: "ex_kb_swing", role: "loadedjump" }, { id: "ex_lateral_bound", role: "reactive" }],
  },
};

// Progressive overload per role, per week (1-based). Load climbs W1→W4 on the loaded roles.
const SCHEME: Record<Role, Array<{ sets: number; reps: string; rpe: string }>> = {
  main:       [{ sets: 3, reps: "8", rpe: "RPE 7" }, { sets: 4, reps: "8", rpe: "RPE 8" }, { sets: 4, reps: "5", rpe: "RPE 8.5" }, { sets: 5, reps: "3", rpe: "RPE 9" }],
  accessory:  [{ sets: 3, reps: "12", rpe: "RPE 7" }, { sets: 3, reps: "12", rpe: "RPE 8" }, { sets: 3, reps: "10", rpe: "RPE 8" }, { sets: 3, reps: "10", rpe: "RPE 8.5" }],
  nordic:     [{ sets: 3, reps: "5", rpe: "3–4s ecc." }, { sets: 3, reps: "6", rpe: "3–4s ecc." }, { sets: 4, reps: "6", rpe: "3–4s ecc." }, { sets: 4, reps: "8", rpe: "3–4s ecc." }],
  heavy:      [{ sets: 4, reps: "3", rpe: "~70% · RPE 7" }, { sets: 4, reps: "3", rpe: "~75% · RPE 8" }, { sets: 5, reps: "2", rpe: "~80%" }, { sets: 4, reps: "2", rpe: "~85%" }],
  plyo:       [{ sets: 3, reps: "3", rpe: "max intent" }, { sets: 3, reps: "3", rpe: "max intent" }, { sets: 4, reps: "3", rpe: "max intent" }, { sets: 4, reps: "3", rpe: "max intent" }],
  loadedjump: [{ sets: 3, reps: "3", rpe: "~30% · max velocity" }, { sets: 3, reps: "3", rpe: "~30% · max velocity" }, { sets: 4, reps: "3", rpe: "~30% · max velocity" }, { sets: 4, reps: "3", rpe: "~30% · max velocity" }],
  reactive:   [{ sets: 3, reps: "3", rpe: "reactive · short contact" }, { sets: 3, reps: "3", rpe: "reactive · short contact" }, { sets: 4, reps: "3", rpe: "reactive · short contact" }, { sets: 4, reps: "3", rpe: "reactive · short contact" }],
};
const REST: Record<Role, string> = { main: "2–3 min", accessory: "60–90s", nordic: "90s", heavy: "in complex", plyo: "in complex", loadedjump: "in complex", reactive: "3–5 min / set" };

function methodNote(role: Role, method: BlockMethod, isIS: boolean): string {
  if (role === "main") return isIS ? "aðal-lyfta, þyngist vikulega" : "main lift, load ↑ weekly";
  if (role === "nordic") return isIS ? "sérvirkni — meiðslavörn" : "eccentric — injury prevention";
  if (role === "accessory") return isIS ? "tvöföld framvinda" : "double progression";
  if (role === "heavy") return isIS ? "þung undirstaða (A1) — kveikir kraftinn" : "heavy primer (A1) — potentiates the power";
  if (role === "plyo") return isIS ? "sprengikraftur (A2) — hámarks ásetningur" : "explosive (A2) — maximal intent";
  if (role === "loadedjump") return isIS ? "hlaðið stökk (A3) — hámarks hraði" : "loaded jump (A3) — max velocity";
  if (role === "reactive") return isIS ? "viðbragð (A4) — stutt snerting" : "reactive (A4) — short ground contact";
  return "";
}

export const BLOCK_WEEKS = 4;
export const BLOCK_LABELS = ["Accumulate", "Build", "Intensify", "Peak"] as const;
export const BLOCK_LABELS_IS = ["Uppsöfnun", "Uppbygging", "Ákefð", "Toppur"] as const;

function isoAddDays(iso: string, d: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
}
export function mondayOf(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  const dow = (dt.getUTCDay() + 6) % 7;
  return isoAddDays(iso, -dow);
}

export function buildBlockSession(dayKey: BlockDayKey, week: number, lang: Lang, method: BlockMethod = "upper_lower"): { title: string; blocks: TodayStructureBlock[]; summary: string; durationMin: number } {
  const isIS = lang === "IS";
  const wi = Math.min(BLOCK_WEEKS, Math.max(1, week)) - 1;
  const meta = DAY_META[dayKey];
  const structureId = METHOD_STRUCTURE_ID[method];
  const items: TodayStructureItem[] = METHOD_SLOTS[method][dayKey].map(({ id, role }) => {
    const lib = EXERCISES_BY_ID.get(id);
    const sc = SCHEME[role][wi];
    const item: TodayStructureItem = {
      name: lib ? (isIS ? lib.nameIS : lib.nameEN) || lib.nameEN : id,
      sets: sc.sets, reps: sc.reps, rest: REST[role],
      method: `${sc.rpe} · ${methodNote(role, method, isIS)}`,
    };
    if (lib) {
      item.exerciseId = lib.id;
      const alts = (lib.alternatives ?? [])
        .map((aid) => EXERCISES_BY_ID.get(aid))
        .filter((a): a is NonNullable<typeof a> => !!a && a.id !== lib.id)
        .map((a) => ({ id: a.id, name: (isIS ? a.nameIS : a.nameEN) || a.nameEN }));
      if (alts.length) item.alternatives = alts;
    }
    return item;
  });

  const label = isIS ? BLOCK_LABELS_IS[wi] : BLOCK_LABELS[wi];
  const focus = isIS ? meta.is : meta.en;
  const methodLbl = isIS ? METHOD_LABELS[method].is : METHOD_LABELS[method].en;
  const block: TodayStructureBlock = { block: focus, items };
  if (structureId) block.structureId = structureId;
  return {
    title: `${focus} · ${isIS ? "Vika" : "Week"} ${wi + 1} — ${label}`,
    blocks: [block],
    summary: isIS
      ? `${methodLbl} — ${focus.toLowerCase()}, vika ${wi + 1} (${label}). Álag þyngist vikulega; skiptu um æfingu ef þú vilt.`
      : `${methodLbl} — ${focus.toLowerCase()}, week ${wi + 1} (${label}). Load climbs weekly; swap any exercise if you need.`,
    durationMin: method === "upper_lower" ? 55 : 50,
  };
}

export function buildBlockSchedule(startIso: string, lang: Lang, method: BlockMethod = "upper_lower"): Array<{ dateIso: string; week: number; dayKey: BlockDayKey; title: string; blocks: TodayStructureBlock[]; summary: string; durationMin: number }> {
  const monday = mondayOf(startIso);
  const out: Array<{ dateIso: string; week: number; dayKey: BlockDayKey; title: string; blocks: TodayStructureBlock[]; summary: string; durationMin: number }> = [];
  for (let w = 1; w <= BLOCK_WEEKS; w++) {
    for (const dayKey of BLOCK_DAY_ORDER) {
      const dateIso = isoAddDays(monday, (w - 1) * 7 + DAY_META[dayKey].dow);
      out.push({ dateIso, week: w, dayKey, ...buildBlockSession(dayKey, w, lang, method) });
    }
  }
  return out;
}

/** Day × week matrix for the PDF/export. */
export function blockDayMatrix(dayKey: BlockDayKey, lang: Lang, method: BlockMethod = "upper_lower"): {
  focus: string;
  exercises: Array<{ name: string; role: Role; rest: string; weeks: Array<{ sets: number; reps: string; rpe: string }> }>;
} {
  const isIS = lang === "IS";
  const meta = DAY_META[dayKey];
  const exercises = METHOD_SLOTS[method][dayKey].map(({ id, role }) => {
    const lib = EXERCISES_BY_ID.get(id);
    return {
      name: lib ? (isIS ? lib.nameIS : lib.nameEN) || lib.nameEN : id,
      role, rest: REST[role],
      weeks: SCHEME[role].map((s) => ({ sets: s.sets, reps: s.reps, rpe: s.rpe })),
    };
  });
  return { focus: isIS ? meta.is : meta.en, exercises };
}
