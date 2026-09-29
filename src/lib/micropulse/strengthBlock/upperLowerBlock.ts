/**
 * Four-week Upper/Lower strength block — a fixed, coach-sendable programme built from the exercise
 * library so every item is SWAPPABLE on the player's Today card (each carries its library `exerciseId`
 * + curated `alternatives`). 4 sessions/week — Mon Upper-Push, Tue Lower-Quad, Thu Upper-Pull,
 * Fri Lower-Hinge — with progressive overload: the load climbs each week while the reps come down.
 *
 * Pure/deterministic. It emits the same `TodayStructureBlock[]` shape the coach-sent strength path uses
 * (toTodayStructure), so the send route just writes it into player_today_strength_override per date and
 * the existing swap + Today rendering work unchanged. Descriptive — never the readiness colour.
 *
 * Progressive overload: Issurin 2010 (block). Nordic eccentric: van Dyk 2019. RPE autoregulation: Helms 2016.
 */

import { EXERCISES_BY_ID } from "@/lib/micropulse/strengthProgramming/exerciseLibrary";
import type { TodayStructureBlock, TodayStructureItem } from "@/lib/micropulse/strengthProgramming/toTodayStructure";

export type BlockDayKey = "push" | "quad" | "pull" | "hinge";
type Lang = "EN" | "IS";

const DAY_META: Record<BlockDayKey, { dow: number; en: string; is: string }> = {
  push:  { dow: 0, en: "Upper — Push",           is: "Efri — Ýta" },       // Mon
  quad:  { dow: 1, en: "Lower — Quad-dominant",  is: "Neðri — Framlæri" }, // Tue
  pull:  { dow: 3, en: "Upper — Pull",           is: "Efri — Tog" },       // Thu
  hinge: { dow: 4, en: "Lower — Hinge-dominant", is: "Neðri — Mjaðmahjör" },// Fri
};
export const BLOCK_DAY_ORDER: BlockDayKey[] = ["push", "quad", "pull", "hinge"];

// Exercise slots per day (library ids). role drives the weekly scheme; "nordic" is a fixed eccentric ramp.
type Role = "main" | "accessory" | "nordic";
const DAY_SLOTS: Record<BlockDayKey, Array<{ id: string; role: Role }>> = {
  push:  [{ id: "ex_bb_bench_press", role: "main" }, { id: "ex_db_shoulder_press", role: "main" }, { id: "ex_incline_db_press", role: "accessory" }, { id: "ex_weighted_pushup", role: "accessory" }],
  quad:  [{ id: "ex_back_squat", role: "main" }, { id: "ex_bulgarian_ss", role: "accessory" }, { id: "ex_reverse_lunge", role: "accessory" }, { id: "ex_heavy_calf_raise", role: "accessory" }],
  pull:  [{ id: "ex_chin_up", role: "main" }, { id: "ex_bb_bent_row", role: "main" }, { id: "ex_db_row", role: "accessory" }],
  hinge: [{ id: "ex_rdl", role: "main" }, { id: "ex_hip_thrust", role: "accessory" }, { id: "ex_nordic_curl", role: "nordic" }, { id: "ex_single_leg_rdl", role: "accessory" }],
};

// Progressive overload — load climbs W1→W4 (reps drop, RPE rises). One scheme per role, per week (1-based).
const SCHEME: Record<Role, Array<{ sets: number; reps: string; rpe: string }>> = {
  main:      [{ sets: 3, reps: "8", rpe: "RPE 7" }, { sets: 4, reps: "8", rpe: "RPE 8" }, { sets: 4, reps: "5", rpe: "RPE 8.5" }, { sets: 5, reps: "3", rpe: "RPE 9" }],
  accessory: [{ sets: 3, reps: "12", rpe: "RPE 7" }, { sets: 3, reps: "12", rpe: "RPE 8" }, { sets: 3, reps: "10", rpe: "RPE 8" }, { sets: 3, reps: "10", rpe: "RPE 8.5" }],
  nordic:    [{ sets: 3, reps: "5", rpe: "3–4s ecc." }, { sets: 3, reps: "6", rpe: "3–4s ecc." }, { sets: 4, reps: "6", rpe: "3–4s ecc." }, { sets: 4, reps: "8", rpe: "3–4s ecc." }],
};
const REST: Record<Role, string> = { main: "2–3 min", accessory: "60–90s", nordic: "90s" };

export const BLOCK_WEEKS = 4;
export const BLOCK_LABELS = ["Accumulate", "Build", "Intensify", "Peak"] as const;
export const BLOCK_LABELS_IS = ["Uppsöfnun", "Uppbygging", "Ákefð", "Toppur"] as const;

function isoAddDays(iso: string, d: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
}
/** Monday of the week containing `iso` (UTC). */
export function mondayOf(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  const dow = (dt.getUTCDay() + 6) % 7;
  return isoAddDays(iso, -dow);
}

/** Build one session (a single Today block) for a given day-type + week (1-based). */
export function buildBlockSession(dayKey: BlockDayKey, week: number, lang: Lang): { title: string; blocks: TodayStructureBlock[]; summary: string; durationMin: number } {
  const isIS = lang === "IS";
  const wi = Math.min(BLOCK_WEEKS, Math.max(1, week)) - 1;
  const meta = DAY_META[dayKey];
  const items: TodayStructureItem[] = DAY_SLOTS[dayKey].map(({ id, role }) => {
    const lib = EXERCISES_BY_ID.get(id);
    const s = SCHEME[role][wi];
    const item: TodayStructureItem = {
      name: lib ? (isIS ? lib.nameIS : lib.nameEN) || lib.nameEN : id,
      sets: s.sets,
      reps: s.reps,
      rest: REST[role],
      method: role === "main" ? `${s.rpe} · ${isIS ? "aðal-lyfta, þyngist vikulega" : "main lift, load ↑ weekly"}` : role === "nordic" ? `${s.rpe} · ${isIS ? "sérvirkni — meiðslavörn" : "eccentric — injury prevention"}` : `${s.rpe} · ${isIS ? "tvöföld framvinda" : "double progression"}`,
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
  return {
    title: `${focus} · ${isIS ? "Vika" : "Week"} ${wi + 1} — ${label}`,
    blocks: [{ block: focus, items }],
    summary: isIS
      ? `4-vikna efri/neðri blokk — ${focus.toLowerCase()}, vika ${wi + 1} (${label}). Álag þyngist vikulega; skiptu um æfingu ef þú vilt.`
      : `4-week upper/lower block — ${focus.toLowerCase()}, week ${wi + 1} (${label}). Load climbs weekly; swap any exercise if you need.`,
    durationMin: 55,
  };
}

/** The 16 dated sessions of the block (4 weeks × 4 days), from the Monday of `startIso`. */
export function buildBlockSchedule(startIso: string, lang: Lang): Array<{ dateIso: string; week: number; dayKey: BlockDayKey; title: string; blocks: TodayStructureBlock[]; summary: string; durationMin: number }> {
  const monday = mondayOf(startIso);
  const out: Array<{ dateIso: string; week: number; dayKey: BlockDayKey; title: string; blocks: TodayStructureBlock[]; summary: string; durationMin: number }> = [];
  for (let w = 1; w <= BLOCK_WEEKS; w++) {
    for (const dayKey of BLOCK_DAY_ORDER) {
      const dateIso = isoAddDays(monday, (w - 1) * 7 + DAY_META[dayKey].dow);
      const s = buildBlockSession(dayKey, w, lang);
      out.push({ dateIso, week: w, dayKey, ...s });
    }
  }
  return out;
}
