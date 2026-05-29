/**
 * Personal Records engine.
 *
 * Detects PBs automatically from the athlete's logged sets (pt_exercise_set_logs)
 * — no manual entry. Per exercise we track the all-time best estimated 1RM
 * (Epley) and the heaviest single set, plus "recent PBs": sessions in the last
 * window whose e1RM beat everything that came before. Grouped by the exact
 * exercise (a PB on "Bulgarian split squat" is its own record, not merged into
 * "squat").
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PersonalRecord = {
  exercise: string;
  best_e1rm: number;
  best_e1rm_date: string;
  best_weight: number;
  best_weight_date: string;
};

export type RecentPR = {
  exercise: string;
  e1rm: number;
  date: string;
  prev_best: number;
  delta_kg: number;
};

export type PersonalRecords = {
  records: PersonalRecord[]; // all exercises, best e1RM desc
  recent_prs: RecentPR[];    // PBs within the recent window, newest first
};

const epley = (w: number, r: number) => w * (1 + Math.max(0, r) / 30);
const RECENT_DAYS = 14;

function isoDaysAgo(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function computePersonalRecords(
  sb: SupabaseClient,
  playerId: string,
  lookbackDays = 365,
): Promise<PersonalRecords> {
  const since = isoDaysAgo(lookbackDays);
  const { data } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps")
    .eq("player_id", playerId)
    .gte("session_date", since)
    .order("session_date", { ascending: true });

  const rows = ((data ?? []) as Array<{
    session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null;
  }>).filter((r) => r.weight_kg != null && r.reps != null && Number(r.weight_kg) > 0);

  // exercise key → per-session best e1RM and best weight (chronological).
  type Sess = { date: string; e1rm: number; weight: number };
  const byExercise = new Map<string, { display: string; sessions: Map<string, Sess> }>();

  for (const r of rows) {
    const display = r.exercise_name.trim();
    const key = display.toLowerCase();
    const e = epley(Number(r.weight_kg), Number(r.reps));
    const w = Number(r.weight_kg);
    if (!byExercise.has(key)) byExercise.set(key, { display, sessions: new Map() });
    const ex = byExercise.get(key)!;
    const prev = ex.sessions.get(r.session_date);
    if (!prev) ex.sessions.set(r.session_date, { date: r.session_date, e1rm: e, weight: w });
    else { prev.e1rm = Math.max(prev.e1rm, e); prev.weight = Math.max(prev.weight, w); }
  }

  const records: PersonalRecord[] = [];
  const recent_prs: RecentPR[] = [];
  const recentCutoff = isoDaysAgo(RECENT_DAYS);

  for (const { display, sessions } of byExercise.values()) {
    const sorted = Array.from(sessions.values()).sort((a, b) => a.date.localeCompare(b.date));
    let bestE = 0, bestEDate = "", bestW = 0, bestWDate = "";
    let runningBestE = 0;
    for (const s of sorted) {
      // PB if this session's e1RM beats everything before it (and there was a prior).
      if (runningBestE > 0 && s.e1rm > runningBestE && s.date >= recentCutoff) {
        recent_prs.push({
          exercise: display,
          e1rm: Math.round(s.e1rm * 10) / 10,
          date: s.date,
          prev_best: Math.round(runningBestE * 10) / 10,
          delta_kg: Math.round((s.e1rm - runningBestE) * 10) / 10,
        });
      }
      if (s.e1rm > runningBestE) runningBestE = s.e1rm;
      if (s.e1rm > bestE) { bestE = s.e1rm; bestEDate = s.date; }
      if (s.weight > bestW) { bestW = s.weight; bestWDate = s.date; }
    }
    if (bestE > 0) {
      records.push({
        exercise: display,
        best_e1rm: Math.round(bestE * 10) / 10,
        best_e1rm_date: bestEDate,
        best_weight: Math.round(bestW * 10) / 10,
        best_weight_date: bestWDate,
      });
    }
  }

  records.sort((a, b) => b.best_e1rm - a.best_e1rm);
  recent_prs.sort((a, b) => b.date.localeCompare(a.date));

  return { records, recent_prs };
}
