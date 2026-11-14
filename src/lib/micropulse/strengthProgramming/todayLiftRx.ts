/**
 * Lota 8: "All the details" for each lift in the player's Today session ("Æfing dagsins").
 *
 * The session the coach (or the engine) sent already stores rest, load (% of max, kg, body weight) and how hard
 * (RPE) per lift, but the Today card turns each line into one string and only shows name + sets × reps. This reads
 * the RAW item instead and returns the same `LiftRx` table the goal plans use (`goalPlan/liftRx.ts`), so the player
 * sees load, how hard, the speed of each rep, rest and the bar-speed lines in plain words.
 *
 * Rules:
 *   - The session's own numbers always win (source `session`). MicroPulse's lines for the lift's profile (lota 7) only
 *     fill a line the session leaves open, and only for the lifts with a profile (heavy squat / deadlift, RDL, loaded
 *     jump squat, weightlifting pulls, Nordic). Other lifts get only the session's own lines; nothing is made up.
 *   - An RPE defines the load, so a lift with an RPE never gets a default load or "how hard" line.
 *   - Free-text template lines get a table only when the name matches a library exercise with a profile exactly and the
 *     line has sets × reps; a line that states its own load or rest never gets a default for it.
 *   - Warm-up, mobility, plyometric and med-ball work gets no table (not gym lifts).
 *
 * Pure and client-safe; derived at render time, never stored (Today reads the session every morning).
 */

import { EXERCISE_LIBRARY, EXERCISES_BY_ID } from "./exerciseLibrary";
import type { Exercise, ExerciseCategory } from "./types";
import { rxForProfile, type LiftRx, type RxBarKey, type RxLine, type RxRowKey, type SessionLiftProfile } from "@/lib/micropulse/goalPlan/liftRx";
import { readVbtPlayerCard } from "@/lib/micropulse/vbtMethods";

/** Library exercises read as one of the plans' lift profiles. Anything else gets only the session's own lines. */
export const TODAY_PROFILE_BY_ID: Record<string, SessionLiftProfile> = {
  ex_trap_bar_dl: "heavy",
  ex_back_squat: "heavy",
  ex_front_squat: "heavy",
  ex_deadlift: "heavy",
  ex_ssb_squat: "heavy",
  ex_rdl: "rdl",
  ex_b_stance_rdl: "rdl",
  ex_trap_bar_jump_squat: "jump_squat",
  ex_jump_shrug: "pull",
  ex_hang_high_pull: "pull",
  ex_mid_thigh_pull_dynamic: "pull",
  ex_nordic_curl: "nordic",
};

/** Not gym lifts: no table. */
const NOT_GYM = new Set<ExerciseCategory>(["MOVEMENT_PREP", "MOBILITY", "PLYOMETRIC", "MED_BALL"]);
/** Lifts the coach's bar-speed rule applies to (same set as `blockTakesVbt` in toTodayStructure). */
const VBT_CATEGORIES = new Set<ExerciseCategory>(["COMPOUND_STRENGTH", "EXPLOSIVE_OLYMPIC", "BALLISTIC"]);

const sess = (en: string, is: string, ...refs: string[]): RxLine => ({ text: { en, is }, source: "session", ...(refs.length ? { refs } : {}) });

const dash = (s: string) => s.replace(/(\d)\s*[-–]\s*(\d)/g, "$1–$2");
const isNum = (s: string) => s.replace(/(\d)\.(\d)/g, "$1,$2");

function normName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const BY_NAME: Map<string, Exercise> = (() => {
  const m = new Map<string, Exercise>();
  for (const e of EXERCISE_LIBRARY) {
    for (const n of [e.nameEN, e.nameIS]) {
      if (!n) continue;
      m.set(normName(n), e);
      const bare = n.replace(/\s*\([^)]*\)\s*/g, " ").trim();
      if (bare && bare !== n && !m.has(normName(bare))) m.set(normName(bare), e);
    }
  }
  return m;
})();

/** The library exercise a session item is (by id, else by its exact name). */
export function libraryExerciseFor(exerciseId: unknown, name: string): Exercise | null {
  if (typeof exerciseId === "string") {
    const byId = EXERCISES_BY_ID.get(exerciseId);
    if (byId) return byId;
  }
  return BY_NAME.get(normName(name.replace(/^[•\-–]\s*/, ""))) ?? null;
}

// ─── Reading the session's own words ─────────────────────────────────────────────────────────────────────────────

/** Reps left in the tank for an RPE (Zourdos 2016: RPE 10 = 0 left, 9 = 1, 8 = 2 …). */
function repsLeft(lo: number, hi: number): string {
  const a = Math.max(0, Math.floor(10 - hi));
  const b = Math.max(0, Math.ceil(10 - lo));
  return a === b ? String(a) : `${a}–${b}`;
}

function effortFromRpe(token: string): RxLine | null {
  const m = /RPE\s*(\d+(?:\.\d)?)(?:\s*[–-]\s*(\d+(?:\.\d)?))?/i.exec(token);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  if (!(lo >= 1 && hi <= 10)) return null;
  const r = repsLeft(lo, hi);
  if (r === "0") return sess("Go to the last rep you can do with good technique.", "Farðu í síðustu endurtekninguna sem þú nærð með góðri tækni.", "zourdos2016");
  const one = r === "1";
  return sess(
    `Stop each set with about ${r} ${one ? "rep" : "reps"} left in the tank; never to failure.`,
    `Hættu hverju setti með um ${r} ${one ? "endurtekningu" : "endurtekningar"} eftir; aldrei í þrot.`,
    "zourdos2016",
  );
}

const LIFT_MAX: Record<string, { en: string; is: string }> = {
  deadlift: { en: "your deadlift max", is: "hámarki í réttstöðulyftu" },
  clean: { en: "your clean max", is: "hámarki í clean" },
  squat: { en: "your squat max", is: "hámarki í hnébeygju" },
};

function loadFromToken(token: string): RxLine | null {
  const t = token.trim();
  let m = /(\d+(?:\s*[–-]\s*\d+)?)\s*%\s*1\s*RM(?:\s*\(([a-z]+)\))?/i.exec(t);
  if (m) {
    const r = dash(m[1].replace(/\s+/g, ""));
    const of = LIFT_MAX[(m[2] ?? "").toLowerCase()];
    return sess(`About ${r}% of ${of ? of.en : "max"}.`, `Um ${r}% af ${of ? of.is : "hámarki"}.`);
  }
  m = /(\d+(?:\s*[–-]\s*\d+)?)\s*%\s*MVC/i.exec(t);
  if (m) {
    const r = dash(m[1].replace(/\s+/g, ""));
    return r === "100"
      ? sess("Push or pull as hard as you can.", "Ýttu eða togaðu eins fast og þú getur.")
      : sess(`About ${r}% of your hardest push or pull.`, `Um ${r}% af mesta krafti þínum.`);
  }
  m = /^(\d+(?:\.\d)?(?:\s*[–-]\s*\d+(?:\.\d)?)?)\s*kg\b/i.exec(t);
  if (m) {
    const r = dash(m[1].replace(/\s+/g, ""));
    return sess(`${r} kg.`, `${isNum(r)} kg.`);
  }
  if (/^(bw|bodyweight|body weight)\b/i.test(t)) return sess("Body weight.", "Eigin þyngd.");
  if (/^bar only\b|^empty bar\b/i.test(t)) return sess("Empty bar.", "Tóm stöng.");
  return null;
}

function tempoFromText(text: string): RxLine | null {
  const slow = /(\d+(?:\s*[–-]\s*\d+)?)\s*s(?:ec)?\b[^·]{0,12}?(descent|ecc|down)/i.exec(text) ?? null;
  if (slow) {
    const r = dash(slow[1].replace(/\s+/g, ""));
    return sess(`Lower slowly, over about ${r} s.`, `Farðu hægt niður, á um ${r} sek.`);
  }
  if (/\btempo\s*X\b|\bmax(?:imal)? intent\b|\bmax(?:imal|imum)? (?:bar )?velocity\b|\bexplosive\b|\bexplode\b|\bfast\b/i.test(text)) {
    return sess("Every rep as fast as possible.", "Hver endurtekning eins hröð og hægt er.");
  }
  return null;
}

/** "90s" → 90 s / 90 sek, "2-3 min" → 2–3 min / 2–3 mín; "—" → nothing. */
export function restFromText(rest: unknown): RxLine | null {
  if (typeof rest !== "string" && typeof rest !== "number") return null;
  const t = dash(String(rest).trim());
  if (!t || /^[—–-]+$/.test(t)) return null;
  let m = /^(\d+(?:–\d+)?)\s*(?:s|sec|secs|seconds)\.?$/i.exec(t);
  if (m) return sess(`${m[1]} s.`, `${m[1]} sek.`);
  m = /^(\d+(?:–\d+)?)\s*(?:min|mins|minutes)\.?$/i.exec(t);
  if (m) return sess(`${m[1]} min.`, `${m[1]} mín.`);
  if (/^\d+$/.test(t)) return sess(`${t} s.`, `${t} sek.`);
  return sess(t, t);
}

/** Load, how hard and rep speed from the session's method line ("85% 1RM / RPE 8 · Cluster …"). */
export function readMethod(method: unknown): { load: RxLine | null; effort: RxLine | null; tempo: RxLine | null } {
  const text = typeof method === "string" ? method : "";
  const tokens = text.split(/\s+·\s+|\s+\/\s+|,\s+/).map((x) => x.trim()).filter(Boolean);
  let load: RxLine | null = null;
  let effort: RxLine | null = null;
  for (const t of tokens) {
    load ??= loadFromToken(t);
    effort ??= effortFromRpe(t);
  }
  return { load, effort, tempo: tempoFromText(text) };
}

function vlStop(n: number): RxLine {
  return sess(
    `Stop the set when the bar has slowed about ${n}% from the fastest rep.`,
    `Hættu settinu þegar stöngin hefur hægt á sér um ${n}% frá hröðustu endurtekningunni.`,
  );
}

// ─── One item → its table ────────────────────────────────────────────────────────────────────────────────────────

/** What the Today card already parsed out of the line (PlayerClient's ParsedExercise). */
export type ParsedTodayLine = { name: string; setsReps: string | null; isHeader: boolean };

const ROWS: RxRowKey[] = ["load", "effort", "tempo", "rest"];

/**
 * The "All the details" table for one Today item, or null when there is nothing to add (a header, warm-up or
 * mobility, an unknown free-text line, or a line with no load, effort, speed or rest).
 */
export function rxForTodayItem(raw: unknown, parsed: ParsedTodayLine, block: unknown): LiftRx | null {
  if (parsed.isHeader || !parsed.name.trim()) return null;
  const isObj = raw != null && typeof raw === "object";
  const item = (isObj ? raw : {}) as Record<string, unknown>;
  const name = isObj ? String(item.name ?? item.title ?? item.exercise ?? parsed.name).trim() : parsed.name.trim();
  if (!name) return null;

  const lib = libraryExerciseFor(isObj ? item.exerciseId : null, isObj ? name : parsed.name);
  if (lib && NOT_GYM.has(lib.category)) return null;
  const profile: SessionLiftProfile | null = lib ? TODAY_PROFILE_BY_ID[lib.id] ?? null : null;
  const base = profile ? rxForProfile(profile) : null;

  const rows: Partial<Record<RxRowKey, RxLine>> = {};
  let barSpeed: { key: RxBarKey; line: RxLine }[] = [];

  if (isObj) {
    const own = readMethod(item.method);
    const rest = restFromText(item.rest);
    const hasRpe = own.effort != null;
    const pick: Record<string, RxLine | null | undefined> = {
      load: own.load ?? (hasRpe ? null : base?.rows.load),
      effort: own.effort ?? base?.rows.effort,
      tempo: own.tempo ?? base?.rows.tempo,
      rest: rest ?? base?.rows.rest,
    };
    for (const k of ROWS) if (pick[k]) rows[k] = pick[k]!;

    const vl = typeof item.vlCap === "number" && item.vlCap > 0 && item.vlCap <= 50 ? item.vlCap : null;
    const coach = readVbtPlayerCard((block as Record<string, unknown> | null)?.vbt);
    const takesVbt = profile === "heavy" || profile === "jump_squat" || profile === "pull" || (lib != null && VBT_CATEGORIES.has(lib.category));
    if (coach && takesVbt) {
      barSpeed = [{ key: "coach", line: sess(coach.headline, coach.headline) }];
    } else if (base) {
      barSpeed = base.barSpeed.map((x) => (x.key === "stop" && vl ? { key: "stop", line: vlStop(vl) } : x));
      if (vl && !barSpeed.some((x) => x.key === "stop") && !barSpeed.some((x) => x.key === "none")) barSpeed.push({ key: "stop", line: vlStop(vl) });
    } else if (vl) {
      barSpeed = [{ key: "stop", line: vlStop(vl) }];
    }
  } else {
    // A free-text template line: only an exact library lift with a profile, and only with sets × reps.
    if (!base || !parsed.setsReps) return null;
    const text = typeof raw === "string" ? raw : "";
    const statesLoad = /%|\bkg\b|\bRPE\b|\bRIR\b/i.test(text);
    const statesRest = /\brest\b|hvíld|\d\s*(?:s|sec|min|mín)\b/i.test(text);
    for (const k of ROWS) {
      if (k === "load" && statesLoad) continue;
      if (k === "effort" && statesLoad) continue;
      if (k === "rest" && statesRest) continue;
      if (base.rows[k]) rows[k] = base.rows[k]!;
    }
    barSpeed = base.barSpeed;
  }

  const visibleBar = barSpeed.filter((x) => x.key !== "none");
  if (!Object.keys(rows).length && !visibleBar.length) return null;

  const sets = isObj && item.sets != null ? String(item.sets) : "";
  const reps = isObj && item.reps != null ? String(item.reps) : "";
  return {
    profile: profile ?? "general",
    exercise: { en: name, is: name },
    sets,
    reps,
    rows,
    barSpeed,
  };
}
