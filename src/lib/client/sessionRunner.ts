/**
 * Pure logic for the PT client's in-session logger (SessionRunner).
 *
 * A session is a list of performed blocks. A block is one exercise on its own,
 * or a group (superset, triset, giant set, contrast) done back to back. Groups
 * always have the same number of sets per exercise, so the unit of work is a
 * round: round N of a block is set N of each exercise in it. That maps straight
 * onto pt_exercise_set_logs (one row per exercise per set), so nothing about
 * storage changes.
 */

import { buildSessionBlocks, type GroupKind } from "./sessionGrouping";

export const DEFAULT_REST_SECONDS = 120;

export type PlanRow = {
  exercise: string;
  reps?: unknown;
  sets?: number | null;
  group?: string | null;
  group_method?: string | null;
  num?: string | null;
  target_kg?: number | null;
  set_rest?: string | null;
  description?: string | null;
  description_is?: string | null;
  video_url?: string | null;
};

export type LoggedSet = {
  session_date: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  is_bodyweight?: boolean | null;
};

export type RunSet = {
  weight_kg: number | null;
  reps: number | null;
  is_bodyweight: boolean;
  done: boolean;
  skipped?: boolean;
};

export type LastTime = { weight_kg: number | null; reps: number | null; is_bodyweight: boolean };

export type RunExercise = {
  name: string;
  sets: RunSet[];
  last: LastTime | null;
  plannedKg: number | null;
  plannedReps: number | null;
  description: string | null;
  descriptionIs: string | null;
  videoUrl: string | null;
};

export type RunBlock = {
  key: string;
  kind: GroupKind;
  label: { EN: string; IS: string };
  howto: { EN: string; IS: string };
  tag: string;
  exercises: RunExercise[];
  restSeconds: number;
};

export type Position = { block: number; round: number };

/** "90 sec", "2 min", "2:30", "60s", 90 → seconds. Unusable → the 2-min default. */
export function parseRestSeconds(raw: unknown): number {
  if (typeof raw === "number") return raw > 0 ? Math.round(raw) : DEFAULT_REST_SECONDS;
  if (typeof raw !== "string") return DEFAULT_REST_SECONDS;
  const clock = raw.match(/(\d+):(\d{2})/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(min|m\b|mín)?/i);
  if (!m) return DEFAULT_REST_SECONDS;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REST_SECONDS;
  return Math.round(m[2] ? n * 60 : n);
}

function parseReps(reps: unknown): number | null {
  if (typeof reps === "number") return Number.isFinite(reps) ? reps : null;
  if (typeof reps !== "string") return null;
  const m = reps.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Heaviest set of the most recent earlier day, per exercise. */
export function lastTimeByExercise(rows: LoggedSet[], today: string): Map<string, LastTime> {
  const latestDay = new Map<string, string>();
  for (const r of rows) {
    if (r.session_date >= today) continue;
    const d = latestDay.get(r.exercise_name);
    if (!d || r.session_date > d) latestDay.set(r.exercise_name, r.session_date);
  }
  const out = new Map<string, LastTime>();
  for (const r of rows) {
    if (r.session_date !== latestDay.get(r.exercise_name)) continue;
    const cur = out.get(r.exercise_name);
    if (!cur || (r.weight_kg ?? 0) > (cur.weight_kg ?? 0)) {
      out.set(r.exercise_name, { weight_kg: r.weight_kg, reps: r.reps, is_bodyweight: r.is_bodyweight === true });
    }
  }
  return out;
}

export function buildRunnerBlocks(rows: PlanRow[], last: Map<string, LastTime>): RunBlock[] {
  const usable = rows.filter((r) => r.exercise);
  return buildSessionBlocks(usable).map((b) => ({
    key: b.key,
    kind: b.kind,
    label: b.label,
    howto: b.howto,
    tag: b.tag,
    // Rest sits between rounds, so it's read from the end of the group.
    restSeconds: parseRestSeconds([...b.rows].reverse().find((r) => r.set_rest)?.set_rest),
    exercises: b.rows.map((r) => {
      const prev = last.get(r.exercise) ?? null;
      const plannedKg = r.target_kg ?? null;
      const startKg = plannedKg ?? prev?.weight_kg ?? null;
      const plannedReps = parseReps(r.reps);
      const nSets = Math.max(1, Number(r.sets) || 1);
      return {
        name: r.exercise,
        last: prev,
        plannedKg,
        plannedReps,
        description: r.description ?? null,
        descriptionIs: r.description_is ?? null,
        videoUrl: r.video_url ?? null,
        // No weight known → bodyweight; the client can still add one.
        sets: Array.from({ length: nSets }, () => ({
          weight_kg: startKg,
          reps: plannedReps ?? prev?.reps ?? null,
          is_bodyweight: startKg == null,
          done: false,
        })),
      };
    }),
  }));
}

export const roundsIn = (b: RunBlock) => Math.max(...b.exercises.map((e) => e.sets.length));

/** Mark what's already saved for today, so a closed app resumes where it was. */
export function applySaved(blocks: RunBlock[], rows: LoggedSet[]): RunBlock[] {
  return blocks.map((b) => ({
    ...b,
    exercises: b.exercises.map((e) => {
      const saved = rows.filter((r) => r.exercise_name === e.name).sort((a, c) => a.set_number - c.set_number);
      if (saved.length === 0) return e;
      const sets = e.sets.map((s, i) => {
        const r = saved[i];
        return r
          ? { weight_kg: r.weight_kg, reps: r.reps, is_bodyweight: r.is_bodyweight === true, done: true }
          : s;
      });
      for (let i = sets.length; i < saved.length; i++) {
        const r = saved[i];
        sets.push({ weight_kg: r.weight_kg, reps: r.reps, is_bodyweight: r.is_bodyweight === true, done: true });
      }
      return { ...e, sets };
    }),
  }));
}

/** The first round still to do, in order; null = session complete. */
export function firstOpen(blocks: RunBlock[]): Position | null {
  for (let b = 0; b < blocks.length; b++) {
    const rounds = roundsIn(blocks[b]);
    for (let r = 0; r < rounds; r++) {
      if (blocks[b].exercises.some((e) => e.sets[r] && !e.sets[r].done && !e.sets[r].skipped)) {
        return { block: b, round: r };
      }
    }
  }
  return null;
}

export function completeRound(blocks: RunBlock[], pos: Position): RunBlock[] {
  return blocks.map((b, i) => i !== pos.block ? b : {
    ...b,
    exercises: b.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s, j) => j === pos.round ? { ...s, done: true } : s),
    })),
  });
}

/** Change a value on this round; rounds still to come follow it. */
export function updateSet(
  blocks: RunBlock[], pos: Position, exercise: number,
  patch: Partial<Pick<RunSet, "weight_kg" | "reps" | "is_bodyweight">>,
): RunBlock[] {
  return blocks.map((b, i) => i !== pos.block ? b : {
    ...b,
    exercises: b.exercises.map((e, x) => x !== exercise ? e : {
      ...e,
      sets: e.sets.map((s, j) => j >= pos.round && !s.done ? { ...s, ...patch } : s),
    }),
  });
}

export function addSet(blocks: RunBlock[], block: number): RunBlock[] {
  return blocks.map((b, i) => i !== block ? b : {
    ...b,
    exercises: b.exercises.map((e) => {
      const lastSet = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { ...lastSet, done: false, skipped: false }] };
    }),
  });
}

export function skipBlock(blocks: RunBlock[], block: number): RunBlock[] {
  return blocks.map((b, i) => i !== block ? b : {
    ...b,
    exercises: b.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => s.done ? s : { ...s, skipped: true }),
    })),
  });
}

/** The save payload: finished sets only, set numbers closed up. */
export function toPayload(blocks: RunBlock[]) {
  return blocks
    .flatMap((b) => b.exercises)
    .map((e) => ({
      name: e.name,
      sets: e.sets.filter((s) => s.done).map((s) => ({
        weight_kg: s.is_bodyweight ? null : s.weight_kg,
        reps: s.reps,
        rpe: null,
        is_bodyweight: s.is_bodyweight,
      })),
    }))
    .filter((e) => e.sets.length > 0);
}

export function summarize(blocks: RunBlock[]) {
  const done = toPayload(blocks);
  const all = blocks.flatMap((b) => b.exercises);
  return {
    exercisesDone: done.length,
    exercisesTotal: all.length,
    sets: done.reduce((n, e) => n + e.sets.length, 0),
    liftedKg: Math.round(done.reduce(
      (n, e) => n + e.sets.reduce((m, s) => m + (s.weight_kg ?? 0) * (s.reps ?? 0), 0), 0,
    )),
  };
}
