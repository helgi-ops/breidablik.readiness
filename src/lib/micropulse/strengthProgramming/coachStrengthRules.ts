import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachStrengthRules } from "./seasonPhaseStrength";

/**
 * Loads a team's coach-authored strength rules (coach_strength_rules.rules) — the sparse override map
 * the strength coach sets for how the build is structured (scheme per block×phase, phase config). The
 * engine merges these OVER the evidence-based defaults in seasonPhaseStrength.ts, so a team with no row
 * behaves exactly as before. Returns null on empty/error → defaults win. Descriptive config only; it
 * never reads or writes the readiness colour or the daily decision.
 */
export async function loadCoachStrengthRules(
  sb: SupabaseClient,
  teamId: string | null | undefined,
): Promise<CoachStrengthRules | null> {
  if (!teamId) return null;
  try {
    const { data } = await sb
      .from("coach_strength_rules")
      .select("rules")
      .eq("team_id", teamId)
      .maybeSingle();
    const rules = (data as { rules?: CoachStrengthRules } | null)?.rules;
    if (!rules || typeof rules !== "object") return null;
    return rules;
  } catch {
    return null;
  }
}
