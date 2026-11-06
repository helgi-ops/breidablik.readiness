/**
 * Drills for a training day, for print — pure. Two sources side by side, per match-day-relative day:
 *   - own:   the coach's own drills from the library, picked by `pickDrillsForDay` (day type + pitch size
 *            per player, Hill-Haas 2011). A rule, not AI; nothing is filled in that the drill doesn't carry.
 *   - ideas: the general on-pitch examples from `pitchIdeasFor` (dayIdeas.ts), each with its citation.
 *
 * A library with nothing that fits gives `own: []`, and the day still carries its ideas. Descriptive
 * planning aid: the coach still picks, and it never touches the readiness colour.
 */
import { resolveDrillStimulus, type StimulusType } from "@/lib/drill-stimulus";
import { pickDrillsForDay, type DrillPickInput, type DaySessionType } from "./pitchSession/dayDrillPicker";
import { pitchIdeasFor, type Bi, type PitchForm } from "./dayIdeas";
import type { CalType } from "./periodization";

/** The `drill_library` columns the day pick reads. */
export type DrillLibraryRow = {
  id: string; drill_name: string; category?: string | null;
  vel_b5?: number | null; vel_b6?: number | null; accel_b23?: number | null; decel_b23?: number | null;
  stimulus_type?: string | null; area_per_player_m2?: number | null; total_players?: number | null; duration_min?: number | null;
};

/** A library row as the day picker reads it: GPS metrics decide the stimulus, else the stored one. */
export function toDrillPickInput(d: DrillLibraryRow): DrillPickInput {
  return {
    id: d.id, name: d.drill_name, category: d.category ?? null,
    stimulus: resolveDrillStimulus({ vel_b5: d.vel_b5, vel_b6: d.vel_b6, accel_b23: d.accel_b23, decel_b23: d.decel_b23, stimulus_type: d.stimulus_type ?? null }) as DaySessionType | null,
    areaPerPlayerM2: d.area_per_player_m2 ?? null, totalPlayers: d.total_players ?? null,
  };
}

/** One of the coach's drills, with only what the library has recorded for it. */
export type OwnDrill = { id: string; name: string; category: string | null; players: number | null; areaM2: number | null; durationMin: number | null };

export type DrillDay = { stimulus: StimulusType | null; character?: string | null };

/** Top-up and recovery days (MD+1) serve the low-minute players, so the pick blends all three loads. */
export const isLowMinutesDay = (day: DrillDay): boolean => {
  const c = String(day.character ?? "").toUpperCase();
  return !day.stimulus && (c === "TOPUP" || c === "RECOVERY");
};

/** The coach's drills that fit the day, best first. Activation (MD-1) reads as a technical day; a top-up /
 *  recovery day takes one drill per load (running, mechanical, match-like), as the session builder does. */
export function drillsForDay(rows: DrillLibraryRow[], day: DrillDay, limit = 3): OwnDrill[] {
  const char = String(day.character ?? "").toUpperCase();
  if (!rows.length || char === "OFF") return [];
  const pool = rows.map(toDrillPickInput);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const types: DaySessionType[] = day.stimulus ? [day.stimulus]
    : char === "ACTIVATION" ? ["technical"]
    : isLowMinutesDay(day) ? ["locomotive", "mechanical", "mixed"] : [];
  const perType = types.length > 1 ? 1 : limit;
  const out: OwnDrill[] = []; const seen = new Set<string>();
  for (const t of types) for (const p of pickDrillsForDay(pool, t, { limit: perType })) {
    if (seen.has(p.id) || out.length >= limit) continue;
    seen.add(p.id);
    const r = byId.get(p.id);
    // The measured pitch only: an area estimated from the player count says nothing the count doesn't.
    out.push({ id: p.id, name: p.name, category: p.category, players: r?.total_players ?? null, areaM2: p.areaEstimated ? null : p.areaPerPlayerM2, durationMin: r?.duration_min ?? null });
  }
  return out;
}

const CATEGORY: Record<string, Bi> = {
  possession: { en: "Possession", is: "Boltahald" }, ssg: { en: "Small-sided game", is: "Fámennur leikur" },
  transition: { en: "Transition", is: "Umskipti" }, running: { en: "Running", is: "Hlaup" },
  finishing: { en: "Finishing", is: "Klárun" }, warmup: { en: "Warm-up", is: "Upphitun" },
};

/** The recorded facts of a drill as one line ("Possession · 12 players · 20 min"); empty when it has none. */
export function ownDrillMeta(d: OwnDrill, isIS: boolean): string {
  const cat = CATEGORY[String(d.category ?? "").toLowerCase()];
  return [
    cat ? (isIS ? cat.is : cat.en) : null,
    d.players != null ? `${d.players} ${isIS ? "leikm." : "players"}` : null,
    d.areaM2 != null ? `${Math.round(d.areaM2)} m²/${isIS ? "leikm." : "player"}` : null,
    d.durationMin != null ? `${Math.round(d.durationMin)} ${isIS ? "mín" : "min"}` : null,
  ].filter(Boolean).join(" · ");
}

/** A printed idea as one line: form · pitch · bouts. */
export const ideaText = (p: PitchForm, isIS: boolean): string => [p.form, p.area, p.bout].map((b) => (isIS ? b.is : b.en)).join(" · ");

export type DayDrillRow = { type: CalType; mds: string[]; label: Bi; lowMinutes: boolean; own: OwnDrill[]; ideas: PitchForm[] };

const SHEET_ORDER: CalType[] = ["mechanical", "locomotive", "mixed", "activation", "topup"];
const dayOfCalType = (t: CalType): DrillDay | null =>
  t === "mechanical" || t === "locomotive" || t === "mixed" ? { stimulus: t }
    : t === "activation" ? { stimulus: null, character: "ACTIVATION" }
    : t === "topup" ? { stimulus: null, character: "TOPUP" } : null;

/** One row per training day type a block uses (match and rest days have none), with the MD days it falls on. */
export function buildDayDrillSheet(opts: { days: Array<{ type: CalType; md: string; label: Bi }>; rows: DrillLibraryRow[]; phase?: string | null; limit?: number }): DayDrillRow[] {
  const seen = new Map<CalType, { label: Bi; mds: string[] }>();
  for (const d of opts.days) {
    if (!dayOfCalType(d.type)) continue;
    const e = seen.get(d.type) ?? { label: d.label, mds: [] };
    if (d.md && !e.mds.includes(d.md)) e.mds.push(d.md);
    seen.set(d.type, e);
  }
  return SHEET_ORDER.filter((t) => seen.has(t)).map((t) => {
    const day = dayOfCalType(t)!; const e = seen.get(t)!;
    return { type: t, mds: e.mds, label: e.label, lowMinutes: isLowMinutesDay(day), own: drillsForDay(opts.rows, day, opts.limit ?? 3), ideas: pitchIdeasFor({ ...day, phase: opts.phase }) };
  });
}
