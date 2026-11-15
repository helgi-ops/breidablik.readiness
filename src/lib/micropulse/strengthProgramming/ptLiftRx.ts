/**
 * "All the details" for each lift in a PT plan — the same table as the player's Today session (lota 8,
 * `todayLiftRx.ts`) and the goal plans (lota 7, `goalPlan/liftRx.ts`).
 *
 * A PT plan already stores every number per lift, in two shapes:
 *   - the plan the trainer builds (`PlanBuilder` `Exercise`: loadType "kg" | "%1RM" | "RPE" | "velocity", loadValue,
 *     rpeTarget, tempo code "3010", restSeconds, notes, vbt), and
 *   - the plan the client gets (`individual_training_prescriptions`, mapped by `/api/client/today` into rows:
 *     method = DB load type, load_value, rpe_target, tempo, set_rest, notes, vbt; Explosive Power rows carry pct1rm,
 *     velocity, dropoff instead).
 * Both are turned into one `PtLiftInput`, then read by `rxForTodayItem`, so the trainer sees (with sources) exactly
 * what the client sees.
 *
 * Rules (same as Today):
 *   - The plan's own numbers always win (source `session`). MicroPulse's lines for a lift's profile (heavy squat /
 *     deadlift, RDL, weightlifting pulls, Nordic) only fill a line the plan leaves open; other lifts get only the
 *     plan's own lines. Nothing is made up.
 *   - A load of 0 is "not set". A bar-speed ("velocity") load has no client field (it rides in `vbt`), so the
 *     trainer's view leaves it out too: what the trainer sees is what the client gets.
 *   - Warm-up, jumps, throws, sprints, planks and mobility get no table.
 *
 * Pure and client-safe; derived at render time, never stored.
 */

import { libraryExerciseFor, readMethod, rxForTodayItem } from "./todayLiftRx";
import type { LiftRx, RxLine } from "@/lib/micropulse/goalPlan/liftRx";
import { formatVbtForPlayer, sanitizeVbtPrescription } from "@/lib/micropulse/vbtMethods";

export type PtLiftInput = {
  name: string;
  sets?: unknown;
  reps?: unknown;
  /** "kg" | "%1RM" | "RPE" | "velocity" (plan builder) or "absolute_kg" | "pct_1rm" | "rpe_target" | "bodyweight" (DB). */
  loadType?: string | null;
  loadValue?: number | null;
  rpeTarget?: number | null;
  /** Explosive Power: fraction of max (0.8 = 80%). */
  pct1rm?: number | null;
  /** A computed kg target the client sees on the row. */
  targetKg?: number | null;
  /** Tempo code ("3010", "X0X0", "ISO 45s") or words. */
  tempo?: string | null;
  restSeconds?: number | null;
  restText?: string | null;
  notes?: string | null;
  /** Extra method words (Explosive Power "Cluster", "WL Derivative"). */
  method?: string | null;
  /** Explosive Power: target m/s (number) or words ("Fast as possible"). */
  velocity?: unknown;
  /** Explosive Power: speed drop that ends the set, as a fraction (0.2 = 20%). */
  dropoff?: number | null;
  vbt?: unknown;
};

const sess = (en: string, is: string): RxLine => ({ text: { en, is }, source: "session" });
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lifts that are not gym lifts when the name is not in the library (the library's own category decides otherwise). */
const NOT_GYM_NAME = /\b(plank|planks|jumps?|jumping|hops?|bounds?|bounding|throws?|toss|slams?|pass|sprints?|run|running|skips?|skipping|stretch(?:es|ing)?|mobility|warm[- ]?up|pogos?|plyo|medicine ball|med ball|carry|carries)\b/i;

const secWord = (n: string, isWord: "dat" | "acc") =>
  n === "1" ? (isWord === "dat" ? "sekúndu" : "sekúndu") : isWord === "dat" ? "sekúndum" : "sekúndur";

/**
 * A tempo code in plain words: "3010" → lower over about 3 s, then straight up; "X0X0" → down and up as fast as
 * possible; "ISO 45s" → hold still for about 45 s. Digits: lowering · pause at the bottom · lifting · pause at the top.
 */
export function tempoLineFromCode(code: unknown): RxLine | null {
  const t = (typeof code === "string" ? code : "").trim().toUpperCase();
  if (!t) return null;
  const iso = /^ISO(?:\s*(\d+(?:\s*[–-]\s*\d+)?)\s*S(?:EC)?)?\b/.exec(t);
  if (iso) {
    if (!iso[1]) return sess("Hold the position still.", "Haltu stöðunni kyrri.");
    const r = iso[1].replace(/\s+/g, "").replace("-", "–");
    return sess(`Hold the position still for about ${r} s.`, `Haltu stöðunni kyrri í um ${r} sek.`);
  }
  const m = /^([0-9X])[\s.-]?([0-9X])[\s.-]?([0-9X])[\s.-]?([0-9X])$/.exec(t);
  if (!m) return null;
  const [, ecc, bottom, con, top] = m;
  if (ecc === "X" && con === "X") return sess("Down and up as fast as possible.", "Niður og upp eins hratt og þú getur.");

  const eccEn = ecc === "X" ? "Go down fast" : Number(ecc) >= 2 ? `Lower over about ${ecc} s` : "Lower steadily";
  const eccIs = ecc === "X" ? "Farðu hratt niður" : Number(ecc) >= 2 ? `Farðu niður á um ${ecc} ${secWord(ecc, "dat")}` : "Farðu jafnt niður";
  const b = bottom !== "X" && Number(bottom) > 0 ? bottom : null;
  const pauseEn = b ? `, pause ${b} s at the bottom` : "";
  const pauseIs = b ? `, haltu ${b} ${secWord(b, "acc")} niðri` : "";
  const conEn = con === "X" ? "then up as fast as possible" : Number(con) >= 2 ? `then up over about ${con} s` : "then straight up";
  const conIs = con === "X" ? "og svo eins hratt upp og þú getur" : Number(con) >= 2 ? `og svo upp á um ${con} ${secWord(con, "dat")}` : "og svo beint upp";
  const tp = top !== "X" && Number(top) > 0 ? top : null;
  const topEn = tp ? `; pause ${tp} s at the top` : "";
  const topIs = tp ? `; haltu ${tp} ${secWord(tp, "acc")} uppi` : "";
  return sess(`${eccEn}${pauseEn}, ${conEn}${topEn}.`, `${eccIs}${pauseIs} ${conIs}${topIs}.`);
}

const DB_LOAD = new Set(["absolute_kg", "pct_1rm", "rpe_target", "bodyweight"]);

/** The table for one PT lift, or null (not a gym lift, or nothing to add). */
export function rxForPtLift(p: PtLiftInput, lang: "EN" | "IS"): LiftRx | null {
  const name = (p.name ?? "").trim();
  if (!name) return null;
  // The library lift, by its exact name or the singular ("Jump shrugs" → Jump shrug); its id carries the profile.
  const lib = libraryExerciseFor(null, name) ?? libraryExerciseFor(null, name.replace(/(\w{3,})s\b(?!.*\w)/, "$1"));
  if (!lib && NOT_GYM_NAME.test(name)) return null;

  // Load and effort tokens, in the words `readMethod` reads; the plan's own fields first.
  const tokens: string[] = [];
  const lt = (p.loadType ?? "").toLowerCase();
  const v = num(p.loadValue);
  const kg = num(p.targetKg);
  if (kg != null && kg > 0) tokens.push(`${kg} kg`);
  if (v != null && v > 0) {
    if (lt === "%1rm" || lt === "pct_1rm") tokens.push(`${v}% 1RM`);
    else if (lt === "kg" || lt === "absolute_kg") tokens.push(`${v} kg`);
    else if ((lt === "rpe" || lt === "rpe_target") && v <= 10) tokens.push(`RPE ${v}`);
  }
  if (lt === "bodyweight") tokens.push("BW");
  const pct = num(p.pct1rm);
  if (pct != null && pct > 0 && pct <= 1.5) tokens.push(`${Math.round(pct * 100)}% 1RM`);
  const rpe = num(p.rpeTarget);
  if (rpe != null && rpe >= 1 && rpe <= 10 && !tokens.some((x) => x.startsWith("RPE"))) tokens.push(`RPE ${rpe}`);

  const notes = str(p.notes);
  const methodWords = str(p.method);
  const velocity = num(p.velocity);
  const velocityWords = velocity == null ? str(p.velocity) : null;
  const method = [...tokens, methodWords && !DB_LOAD.has(methodWords) ? methodWords : null, velocityWords, notes].filter(Boolean).join(" · ");

  // Rest: seconds (0 = straight on to the next exercise, so no line), else the plan's rest words.
  const rs = num(p.restSeconds);
  const restWords = str(p.restText);
  const restSec = rs != null && rs > 0 ? Math.round(rs) : restWords && /^\d+\s*(?:s|sec|secs|seconds|sek)\.?$/i.test(restWords) ? Number(restWords.match(/\d+/)![0]) : null;
  const rest =
    restSec != null
      ? restSec >= 120 && restSec % 60 === 0 ? `${restSec / 60} min` : restSec > 0 ? `${restSec}s` : null
      : restWords && !/^0+\s*(?:s|sec|secs|seconds|sek)?\.?$/i.test(restWords) ? restWords : null;

  // Bar speed: a target and a stop the plan states ("VBT 0.65 m/s (cut 0.5525, 0.15)"; Explosive velocity/dropoff).
  const vbtNote = notes ? /\bVBT\s*(\d(?:[.,]\d+)?)\s*m\/s/i.exec(notes) : null;
  const cutNote = notes ? /\(\s*cut\s*(\d(?:\.\d+)?)\s*,\s*(0?\.\d+)\s*\)/i.exec(notes) : null;
  const target = velocity ?? (vbtNote ? Number(vbtNote[1].replace(",", ".")) : null);
  const drop = num(p.dropoff) ?? (cutNote ? Number(cutNote[2]) : null);
  const vlCap = drop != null && drop > 0 && drop <= 0.5 ? Math.round(drop * 100) : null;
  const cut = cutNote ? Number(cutNote[1]) : null;

  // Rep speed: the tempo code first, else the plan's words ("max intent" is read by `readMethod`), else "controlled".
  const tempo =
    tempoLineFromCode(p.tempo) ??
    (readMethod(method).tempo || !/\bcontrolled\b/i.test(method) ? null : sess("Slow and controlled.", "Hægt og með stjórn."));

  const vp = sanitizeVbtPrescription(p.vbt);
  const item = {
    name,
    sets: p.sets ?? "",
    reps: p.reps ?? "",
    rest: rest ?? "",
    method,
    ...(lib ? { exerciseId: lib.id } : {}),
    ...(vlCap ? { vlCap } : {}),
  };
  return rxForTodayItem(item, { name, setsReps: `${String(p.sets ?? "")}×${String(p.reps ?? "")}`, isHeader: false }, {}, {
    tempo,
    target,
    cut: target != null ? cut : null,
    coachVbt: vp ? formatVbtForPlayer(vp, lang) : null,
  });
}

/** A lift as the trainer builds it (`PlanBuilder` `Exercise`), shaped as the client will get it after assigning. */
export function ptInputFromPlanExercise(ex: {
  name?: string | null;
  name_is?: string | null;
  sets?: unknown;
  reps?: unknown;
  loadType?: string | null;
  loadValue?: number | null;
  rpeTarget?: number | null;
  tempo?: string | null;
  restSeconds?: number | null;
  notes?: string | null;
  vbt?: unknown;
}): PtLiftInput {
  // "velocity" has no client load type (toDbLoadType → null), so its value never reaches the client.
  const lt = ex.loadType && ex.loadType !== "velocity" ? ex.loadType : null;
  return {
    name: ex.name ?? "",
    sets: ex.sets,
    reps: ex.reps,
    loadType: lt,
    loadValue: lt ? ex.loadValue ?? null : null,
    rpeTarget: ex.rpeTarget ?? null,
    tempo: ex.tempo ?? null,
    restSeconds: ex.restSeconds ?? null,
    notes: ex.notes ?? null,
    vbt: ex.vbt,
  };
}

/** A row of the client's plan as `/api/client/today` sends it (individual plan or Explosive Power). */
export function ptInputFromClientRow(r: Record<string, unknown>): PtLiftInput {
  const m = str(r.method);
  const isDbLoad = m != null && DB_LOAD.has(m);
  return {
    name: String(r.exercise ?? ""),
    sets: r.sets,
    reps: r.reps,
    loadType: isDbLoad ? m : null,
    loadValue: num(r.load_value),
    rpeTarget: num(r.rpe_target),
    pct1rm: num(r.pct1rm),
    targetKg: num(r.target_kg),
    tempo: str(r.tempo),
    restText: str(r.set_rest),
    notes: str(r.notes),
    method: isDbLoad ? null : m,
    velocity: r.velocity,
    dropoff: num(r.dropoff),
    vbt: r.vbt,
  };
}
