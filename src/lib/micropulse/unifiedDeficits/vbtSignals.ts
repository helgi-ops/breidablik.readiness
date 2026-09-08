/**
 * VBT writer — the force-velocity gap. From the player's GymAware load-velocity
 * data (gymaware_vbt_sessions), fit the LV profile (lvProfile) and classify:
 *   • velocity_dominant → FORCE deficit (loses force at load) → max-strength work.
 *   • strength_dominant → VELOCITY deficit (flat V at light load) → speed-strength.
 *   • balanced / insufficient → no deficit.
 * This is the piece the movement screen and IMA can't see — where on the F-V curve
 * the player needs to train. Confirmed (instrumented). Descriptive — never the
 * readiness colour. Pure classifier + a server loader.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLvProfile, LV_EXERCISES, type LvExerciseKey, type LvProfileType, type LvDatapoint } from "@/lib/lvProfile";
import type { DeficitRow } from "./reconcile";

const LOOKBACK_DAYS = 90;
const round = (n: number) => Math.round(n * 100) / 100;

/** Pure: an LV-profile classification → a deficit row (or none). */
export function vbtDeficitFromProfile(profile: LvProfileType, opts: { exerciseLabel: string; date: string | null; n: number }): DeficitRow | null {
  const prov = (en: string, is: string): { en: string; is: string } => ({
    en: `VBT ${opts.exerciseLabel} · ${en} (${opts.n} loads${opts.date ? ` · ${opts.date}` : ""})`,
    is: `VBT ${opts.exerciseLabel} · ${is} (${opts.n} álög${opts.date ? ` · ${opts.date}` : ""})`,
  });
  if (profile === "velocity_dominant") {
    return { quality: "force_deficit", source: "vbt", status: "confirmed", confidence: 0.8, provenance: prov("velocity-dominant → force gap", "hraða-drifinn → kraft-gat"), evidenceGrade: "moderate" };
  }
  if (profile === "strength_dominant") {
    return { quality: "velocity_deficit", source: "vbt", status: "confirmed", confidence: 0.8, provenance: prov("strength-dominant → velocity gap", "styrk-drifinn → hraða-gat"), evidenceGrade: "moderate" };
  }
  return null; // balanced / insufficient_data → no deficit (honest)
}

/** Map a free-text GymAware exercise name to a known LV lift (for its MVT). */
function resolveLift(name: string | null): LvExerciseKey {
  const n = (name ?? "").toLowerCase();
  if (n.includes("bench")) return "bench_press";
  if (n.includes("trap")) return "trap_bar_deadlift";
  if (n.includes("dead")) return "deadlift";
  if (n.includes("squat jump") || n.includes("jump squat") || n.includes("cmj")) return "squat_jump";
  if (n.includes("squat")) return "back_squat";
  return "custom";
}

type Row = { session_date: string | null; exercise_name: string | null; load_kg: number | null; mean_velocity: number | null };

/** Server: fit the player's main VBT lift and derive the F-V gap deficit. */
export async function loadVbtDeficitRows(sb: SupabaseClient, playerId: string): Promise<DeficitRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("gymaware_vbt_sessions")
    .select("session_date, exercise_name, load_kg, mean_velocity")
    .eq("player_id", playerId)
    .gte("session_date", since)
    .order("session_date", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];
  if (rows.length < 2) return [];

  // Group by resolved lift; pick the lift with the most DISTINCT loads.
  const byLift = new Map<LvExerciseKey, { pts: LvDatapoint[]; loads: Set<number>; date: string | null }>();
  for (const r of rows) {
    if (r.load_kg == null || r.mean_velocity == null || r.mean_velocity <= 0) continue;
    const key = resolveLift(r.exercise_name);
    const g = byLift.get(key) ?? { pts: [], loads: new Set<number>(), date: null };
    g.pts.push({ load: r.load_kg, velocity: r.mean_velocity });
    g.loads.add(Math.round(r.load_kg));
    if (!g.date && r.session_date) g.date = r.session_date;
    byLift.set(key, g);
  }
  let best: { key: LvExerciseKey; g: { pts: LvDatapoint[]; loads: Set<number>; date: string | null } } | null = null;
  for (const [key, g] of byLift) if (g.loads.size >= 2 && (!best || g.loads.size > best.g.loads.size)) best = { key, g };
  if (!best) return [];

  const spec = LV_EXERCISES[best.key];
  const profile = computeLvProfile(best.g.pts, spec.mvt);
  if (!profile) return [];
  const row = vbtDeficitFromProfile(profile.profile, { exerciseLabel: spec.label, date: best.g.date, n: best.g.loads.size });
  if (!row) return [];
  return [{ ...row, value: round(profile.estOneRm) }];
}
