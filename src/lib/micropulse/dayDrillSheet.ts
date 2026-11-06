/**
 * Drills for a training day, for print — pure. Two sources side by side, per match-day-relative day:
 *   - research: drills from published studies (`drill_library_public`), each with its citation. A row is
 *               paired to a day type by `day_fit`, set when the row was checked against its paper. The rule:
 *               where the study places the drill on a day of its own week, that day wins (Martín-García 2018);
 *               otherwise game size and pitch size per player (Hill-Haas 2011; Riboli 2020). An unverified
 *               row never prints.
 *   - ideas:    the general on-pitch examples from `pitchIdeasFor` (dayIdeas.ts).
 *
 * The coach's own library is deliberately NOT a source: a personal library follows the coach to every team
 * he opens, so one club's drills printed on another team's document. A day with no research drill still
 * carries its ideas. Descriptive planning aid: the coach still picks, and it never touches the readiness colour.
 */
import { resolveDrillStimulus, type StimulusType } from "@/lib/drill-stimulus";
import type { DrillPickInput, DaySessionType } from "./pitchSession/dayDrillPicker";
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

/** `mds` = the MD labels the day falls on ("MD-1"), when known: a row tied to one MD day prints only there. */
export type DrillDay = { stimulus: StimulusType | null; character?: string | null; mds?: string[] | null };

/** A `drill_library_public` row (numeric columns may arrive as strings). */
export type ResearchDrillRow = {
  id: string; drill_name: string; drill_name_is?: string | null; drill_format?: string | null;
  field_length_m?: number | string | null; field_width_m?: number | string | null; area_per_player_m2?: number | string | null;
  reps?: string | null; coach_encouragement?: boolean | null;
  source_citation?: string | null; source_doi?: string | null;
  day_fit?: string[] | null; finding_en?: string | null; finding_is?: string | null; verified_from?: string | null;
};

export type ResearchDayKey = "mechanical" | "locomotive" | "mixed" | "activation" | "topup";

/** The day type a research drill is paired on. A technical day and an activation day are the same low-load
 *  slot (MD-1 / MD-2); top-up and recovery are both the day after a match. A rest day has none. */
export function researchDayKey(day: DrillDay): ResearchDayKey | null {
  const c = String(day.character ?? "").toUpperCase();
  if (c === "OFF") return null;
  if (day.stimulus === "technical") return "activation";
  if (day.stimulus) return day.stimulus;
  return c === "ACTIVATION" ? "activation" : c === "TOPUP" || c === "RECOVERY" ? "topup" : null;
}

/** How a row was checked against its paper, best first: the full text, the abstract, or an excerpt of the
 *  paper's table surfaced by a search. Anything else is unchecked and never prints. */
const VERIFIED = ["full_text", "abstract", "excerpt"];
const isMdToken = (t: string) => /^MD[+-]?\d*$/i.test(t);

/** The research drills paired to a day: best-checked first, then the measured ones, game sizes kept
 *  different. Leaves out a row nobody checked against its paper, the "no coach encouragement" twin of a drill
 *  (same drill, same pitch), and a row its study ties to another MD day than this one. */
export function researchDrillsForDay(rows: ResearchDrillRow[], day: DrillDay, limit = 3): ResearchDrillRow[] {
  const key = researchDayKey(day);
  if (!key) return [];
  const mds = (day.mds ?? []).map((m) => m.toUpperCase());
  const rank = (r: ResearchDrillRow) => VERIFIED.indexOf(String(r.verified_from ?? ""));
  const fit = rows
    .filter((r) => {
      const tokens = r.day_fit ?? [];
      if (!tokens.includes(key) || rank(r) < 0 || r.coach_encouragement === false) return false;
      const own = tokens.filter(isMdToken).map((t) => t.toUpperCase());
      return own.length === 0 || mds.length === 0 || own.some((t) => mds.includes(t));
    })
    .sort((a, b) => rank(a) - rank(b) || Number(!!b.finding_en) - Number(!!a.finding_en) || a.drill_name.localeCompare(b.drill_name));
  const out: ResearchDrillRow[] = []; const formats = new Set<string>();
  for (const r of fit) {
    const f = String(r.drill_format ?? r.id);
    if (out.length < limit && !formats.has(f)) { out.push(r); formats.add(f); }
  }
  for (const r of fit) if (out.length < limit && !out.includes(r)) out.push(r);
  return out;
}

const num = (v: unknown): number | null => { const n = typeof v === "string" ? Number(v) : v; return typeof n === "number" && Number.isFinite(n) ? n : null; };
const trim1 = (n: number) => String(Math.round(n * 10) / 10);

/** A research drill as printed: its name, what the paper set up (pitch · space per player · bouts), the one
 *  measured fact, and the short citation ("Rampinini et al. 2007"). Only what the row carries. */
export function researchDrillPrint(r: ResearchDrillRow, isIS: boolean): { name: string; meta: string; finding: string; cite: string } {
  const L = num(r.field_length_m), W = num(r.field_width_m), area = num(r.area_per_player_m2);
  // A bare duration ("4 min") is the length of one bout; "3 × 5 min" already says so.
  const bouts = r.reps && /^\d+ min$/.test(r.reps.trim()) ? `${r.reps.trim()} bouts` : r.reps;
  const reps = bouts ? (isIS ? bouts.replace(/\bmin\b/g, "mín").replace(/\bbouts\b/g, "lotur") : bouts) : null;
  return {
    name: (isIS && r.drill_name_is) || r.drill_name,
    meta: [L != null && W != null ? `${trim1(L)} × ${trim1(W)} m` : null, area != null ? `${Math.round(area)} m²/${isIS ? "leikm." : "player"}` : null, reps].filter(Boolean).join(" · "),
    finding: ((isIS ? r.finding_is : r.finding_en) ?? "").trim(),
    cite: String(r.source_citation ?? "").split(" — ")[0].trim(),
  };
}

/** A printed idea as one line: form · pitch · bouts. */
export const ideaText = (p: PitchForm, isIS: boolean): string => [p.form, p.area, p.bout].map((b) => (isIS ? b.is : b.en)).join(" · ");

export type DayDrillRow = { type: CalType; mds: string[]; label: Bi; research: ResearchDrillRow[]; ideas: PitchForm[] };

const SHEET_ORDER: CalType[] = ["mechanical", "locomotive", "mixed", "activation", "topup"];
const dayOfCalType = (t: CalType): DrillDay | null =>
  t === "mechanical" || t === "locomotive" || t === "mixed" ? { stimulus: t }
    : t === "activation" ? { stimulus: null, character: "ACTIVATION" }
    : t === "topup" ? { stimulus: null, character: "TOPUP" } : null;

/** One row per training day type a block uses (match and rest days have none), with the MD days it falls on. */
export function buildDayDrillSheet(opts: { days: Array<{ type: CalType; md: string; label: Bi }>; rows: ResearchDrillRow[]; phase?: string | null; limit?: number }): DayDrillRow[] {
  const seen = new Map<CalType, { label: Bi; mds: string[] }>();
  for (const d of opts.days) {
    if (!dayOfCalType(d.type)) continue;
    const e = seen.get(d.type) ?? { label: d.label, mds: [] };
    if (d.md && !e.mds.includes(d.md)) e.mds.push(d.md);
    seen.set(d.type, e);
  }
  return SHEET_ORDER.filter((t) => seen.has(t)).map((t) => {
    const day = dayOfCalType(t)!; const e = seen.get(t)!;
    return { type: t, mds: e.mds, label: e.label, research: researchDrillsForDay(opts.rows, { ...day, mds: e.mds }, opts.limit ?? 3), ideas: pitchIdeasFor({ ...day, phase: opts.phase }) };
  });
}
