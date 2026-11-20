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
import type { Exercise, ExerciseCategory, PrescribedExercise } from "./types";
import { rxForProfile, type LiftRx, type RxBarKey, type RxLine, type RxRowKey, type SessionLiftProfile } from "@/lib/micropulse/goalPlan/liftRx";
import { readVbtPlayerCard, type VbtPlayerCard } from "@/lib/micropulse/vbtMethods";

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

/**
 * Rest in whole seconds from a session's rest text, for the between-sets timer: "90s" → 90, "2-3 min" → 120 (the
 * lower end; the player can add time), "1:30" → 90, "rest 2 min between sets" → 120. Null when there is no rest in it.
 */
export function restSecondsFromText(text: unknown): number | null {
  if (typeof text === "number") return text > 0 && text <= 900 ? Math.round(text) : null;
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t || /^[—–-]+$/.test(t)) return null;
  const clock = /\b(\d{1,2}):([0-5]\d)\b/.exec(t);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]) || null;
  const m = /(\d+(?:\.\d+)?)(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*(s|sec|secs|seconds|sek|m|min|mins|minutes|mín)\b/i.exec(t);
  if (!m) return /^\d+$/.test(t) ? restSecondsFromText(Number(t)) : null;
  const n = Number(m[1]);
  const sec = /^m/i.test(m[2]) ? n * 60 : n;
  return sec > 0 && sec <= 900 ? Math.round(sec) : null;
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
 * Structured values a caller already read (the PT plans, `ptLiftRx.ts`): a rep-speed line from a tempo code, a
 * target bar speed and the speed to stop the set at (m/s), and the trainer's bar-speed rule for THIS exercise (shown
 * whatever the lift, unlike the Today block rule that only the main lifts take). Today itself passes none of these.
 */
export type RxItemExtra = { tempo?: RxLine | null; target?: number | null; cut?: number | null; coachVbt?: VbtPlayerCard | null };

const fmtMs = (v: number) => String(Math.round(v * 100) / 100);

/** The item's bar-speed zone (`TodayStructureItem.speedZone`), or null when absent or not a sane m/s range. */
function speedZoneOf(raw: unknown): { min: number; max: number | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const { min, max } = raw as { min?: unknown; max?: unknown };
  if (typeof min !== "number" || !(min > 0 && min < 3)) return null;
  if (max == null) return { min, max: null };
  return typeof max === "number" && max > min && max < 3 ? { min, max } : null;
}

/**
 * The "All the details" table for one Today item, or null when there is nothing to add (a header, warm-up or
 * mobility, an unknown free-text line, or a line with no load, effort, speed or rest).
 */
export function rxForTodayItem(raw: unknown, parsed: ParsedTodayLine, block: unknown, extra?: RxItemExtra): LiftRx | null {
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
      tempo: extra?.tempo ?? own.tempo ?? base?.rows.tempo,
      rest: rest ?? base?.rows.rest,
    };
    for (const k of ROWS) if (pick[k]) rows[k] = pick[k]!;

    const vl = typeof item.vlCap === "number" && item.vlCap > 0 && item.vlCap <= 50 ? item.vlCap : null;
    const coach = extra?.coachVbt ?? readVbtPlayerCard((block as Record<string, unknown> | null)?.vbt);
    const takesVbt = profile === "heavy" || profile === "jump_squat" || profile === "pull" || (lib != null && VBT_CATEGORIES.has(lib.category));
    if (coach && (takesVbt || extra?.coachVbt)) {
      barSpeed = [{ key: "coach", line: sess(coach.headline, coach.headline) }];
    } else {
      if (base) {
        barSpeed = base.barSpeed.map((x) => (x.key === "stop" && vl ? { key: "stop", line: vlStop(vl) } : x));
        if (vl && !barSpeed.some((x) => x.key === "stop") && !barSpeed.some((x) => x.key === "none")) barSpeed.push({ key: "stop", line: vlStop(vl) });
      } else if (vl) {
        barSpeed = [{ key: "stop", line: vlStop(vl) }];
      }
      // A target speed the session states means a device is used: it replaces "not used" and the general target.
      const target = extra?.target != null && extra.target > 0 && extra.target < 3 ? extra.target : null;
      if (target != null) {
        const t = fmtMs(target);
        const line = { key: "target" as const, line: sess(`About ${t} m/s on each rep.`, `Um ${isNum(t)} m/s í hverri endurtekningu.`) };
        barSpeed = barSpeed.filter((x) => x.key !== "none");
        const i = barSpeed.findIndex((x) => x.key === "target");
        if (i >= 0) barSpeed[i] = line;
        else barSpeed.unshift(line);
        const cut = extra?.cut != null && extra.cut > 0 && extra.cut < target ? extra.cut : null;
        if (cut != null) {
          const c = fmtMs(cut);
          const pct = Math.round((1 - cut / target) * 100);
          const stop = { key: "stop" as const, line: sess(
            `Stop the set when a rep drops below about ${c} m/s (about ${pct}% under the target).`,
            `Hættu settinu þegar endurtekning fer undir um ${isNum(c)} m/s (um ${pct}% undir markhraða).`,
          ) };
          const j = barSpeed.findIndex((x) => x.key === "stop");
          if (j >= 0) barSpeed[j] = stop;
          else barSpeed.splice(barSpeed.findIndex((x) => x.key === "target") + 1, 0, stop);
        }
      }
      // Close to the match the week rule sets a bar-speed zone (2026-11-20): it replaces the lift's own speed line
      // ("No target speed …"). The speed sets the load; the % on the load row is only where to start.
      const zone = speedZoneOf(item.speedZone);
      if (target == null && zone) {
        const lo = zone.min.toFixed(1);
        const hi = zone.max != null ? zone.max.toFixed(1) : null;
        const line = { key: "target" as const, line: hi
          ? sess(`${lo}–${hi} m/s on each rep. Faster: add weight. Slower: take weight off.`, `${isNum(lo)}–${isNum(hi)} m/s í hverri endurtekningu. Hraðar: bættu á. Hægar: taktu af.`)
          : sess(`${lo} m/s or faster on each rep. Slower: take weight off.`, `${isNum(lo)} m/s eða hraðar í hverri endurtekningu. Hægar: taktu af.`) };
        barSpeed = barSpeed.filter((x) => x.key !== "none");
        const i = barSpeed.findIndex((x) => x.key === "target");
        if (i >= 0) barSpeed[i] = line;
        else barSpeed.unshift(line);
      }
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

/**
 * The same table for an exercise in a built `StrengthSession` (the coach's /coach/strength card): the item is shaped
 * exactly as `strengthSessionToTodayStructure` sends it, so the coach sees what the player will see. `vbt` = the
 * block's bar-speed card when the block takes it (`blockTakesVbt`), else null.
 */
export function rxForPrescribed(ex: PrescribedExercise, vbt: VbtPlayerCard | null, lang: "EN" | "IS"): LiftRx | null {
  const name = (lang === "IS" ? ex.nameIS : ex.nameEN) || ex.nameEN || ex.nameIS;
  const item = {
    name,
    sets: ex.dose.sets,
    reps: ex.dose.reps,
    rest: ex.dose.rest,
    method: [ex.dose.intensity, ex.dose.cue].filter(Boolean).join(" · "),
    exerciseId: ex.exerciseId,
    ...(ex.dose.velocityLossCap ? { vlCap: ex.dose.velocityLossCap } : {}),
    ...(ex.dose.speedZone ? { speedZone: ex.dose.speedZone } : {}),
  };
  return rxForTodayItem(item, { name, setsReps: `${ex.dose.sets}×${ex.dose.reps}`, isHeader: false }, vbt ? { vbt } : {});
}
