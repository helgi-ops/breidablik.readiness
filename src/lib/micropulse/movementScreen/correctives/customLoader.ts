/**
 * Load club-custom corrective exercises (added through the app) from the
 * corrective_exercises table, as CorrectiveExercise[] ready to merge into a
 * prescription. Only rows with a `definition` (a full CorrectiveExercise) AND an
 * `addresses` list are routable — those without addresses are catalogue-only.
 * RLS already limits SELECT to the global library + the coach's own team; the
 * team filter here is defensive. Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectiveExercise } from "./registry";

export async function loadCustomCorrectives(sb: SupabaseClient, teamId: string | null): Promise<CorrectiveExercise[]> {
  const { data } = await sb
    .from("corrective_exercises")
    .select("slug, phase, active, team_id, definition")
    .eq("active", true)
    .not("definition", "is", null);
  const rows = (data ?? []) as Array<{ slug: string; phase: string; team_id: string | null; definition: unknown }>;
  const out: CorrectiveExercise[] = [];
  for (const r of rows) {
    if (r.team_id != null && r.team_id !== teamId) continue; // global (null) or own team only
    const def = r.definition as Partial<CorrectiveExercise> | null;
    if (!def || !Array.isArray(def.addresses) || def.addresses.length === 0) continue;
    out.push({ ...(def as CorrectiveExercise), slug: r.slug, source: "custom" });
  }
  return out;
}
