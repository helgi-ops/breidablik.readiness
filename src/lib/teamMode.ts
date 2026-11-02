/**
 * src/lib/teamMode.ts
 *
 * Single source of truth for the team's operating mode (server-safe).
 *
 *   Full Suite  → uses_wellness_features = true  (default for all existing teams)
 *     - Check-in + RPE + wearables + decision card
 *     - Wellness notifications
 *     - Foster Monotony/Strain on sRPE × duration
 *     - ACWR on sRPE load
 *     - All GPS / IMA intelligence
 *
 *   GPS Intelligence Only → uses_wellness_features = false
 *     - Check-in + RPE + wearables + decision card all HIDDEN
 *     - No wellness notifications
 *     - Foster Monotony/Strain on external player_load
 *     - ACWR on external player_load
 *     - All GPS / IMA intelligence unchanged
 *
 * This file is server-safe — it only contains types, plain functions, and
 * Supabase calls that work in any runtime. The matching client-side React
 * hook lives in `src/lib/useTeamMode.ts` so server modules (e.g. the
 * notification scheduler) can import this without dragging useState /
 * useEffect into a server bundle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamMode = "full_suite" | "gps_only";

export type TeamModeRow = {
  teamId: string;
  usesWellnessFeatures: boolean;
  mode: TeamMode;
};

/** Translate a boolean flag to the typed mode. */
export function modeFromFlag(usesWellnessFeatures: boolean): TeamMode {
  return usesWellnessFeatures ? "full_suite" : "gps_only";
}

/** The effective mode when a team has NOT explicitly chosen (team_settings
 *  row missing or uses_wellness_features = null). A personal-trainer practice
 *  defaults to check-in OFF — its clients just track load/strength and the
 *  trainer opts in to wellness. Every other team type defaults to Full Suite. */
export function defaultWellnessForTeamType(teamType: string | null | undefined): boolean {
  return String(teamType ?? "").toLowerCase() !== "personal_trainer";
}

/** Server-side: read team mode for a given team. An explicit true/false always
 *  wins; when unset (no row / null), the default follows team_type — club teams
 *  keep Full Suite, personal-trainer practices default to check-in OFF. */
export async function getTeamMode(
  sb: SupabaseClient,
  teamId: string,
): Promise<TeamModeRow> {
  // team_type decides the default when the practice hasn't chosen yet.
  let teamType: string | null = null;
  try {
    const { data: t } = await sb.from("teams").select("team_type").eq("id", teamId).maybeSingle();
    teamType = (t as { team_type?: string | null } | null)?.team_type ?? null;
  } catch {
    teamType = null; // unknown → treated as club (Full Suite) below
  }
  const fallback = defaultWellnessForTeamType(teamType);

  const { data, error } = await sb
    .from("team_settings")
    .select("uses_wellness_features")
    .eq("team_id", teamId)
    .maybeSingle();

  // Tolerant: if RLS blocks the settings read, fall back to the team_type
  // default (club → Full Suite, PT → off). No silent, wrong override either way.
  if (error) {
    return { teamId, usesWellnessFeatures: fallback, mode: modeFromFlag(fallback) };
  }

  const usesWellnessFeatures = (data as { uses_wellness_features?: boolean | null } | null)?.uses_wellness_features;
  const resolved = typeof usesWellnessFeatures === "boolean" ? usesWellnessFeatures : fallback;
  return { teamId, usesWellnessFeatures: resolved, mode: modeFromFlag(resolved) };
}

/** Convenience helper: true if the team should show wellness features. */
export function showsWellness(row: TeamModeRow | null | undefined): boolean {
  if (!row) return true; // safe default during load
  return row.usesWellnessFeatures;
}

/** Convenience helper: true if the team is running in pure GPS mode. */
export function isGpsOnly(row: TeamModeRow | null | undefined): boolean {
  if (!row) return false;
  return !row.usesWellnessFeatures;
}

/** Server-side: returns the set of team_ids that run in GPS/load-only mode
 *  (no check-in). Used by the notification scheduler to skip check-in and RPE
 *  reminders without a per-team round trip. Two sources:
 *    1. any team that explicitly opted out (uses_wellness_features = false);
 *    2. every personal-trainer practice that has NOT explicitly opted in
 *       (uses_wellness_features = true) — PT defaults to off.
 *  Returns empty set on any error — safer to send reminders than to silently
 *  skip them. */
export async function getGpsOnlyTeamIds(
  sb: SupabaseClient,
): Promise<Set<string>> {
  try {
    const out = new Set<string>();

    // 1. Explicit opt-out, any team type.
    const { data: off, error: offErr } = await sb
      .from("team_settings")
      .select("team_id")
      .eq("uses_wellness_features", false);
    if (offErr) return new Set();
    for (const r of (off ?? []) as Array<{ team_id: string }>) out.add(String(r.team_id));

    // 2. Personal-trainer practices default to off unless explicitly opted in.
    const { data: ptTeams, error: ptErr } = await sb
      .from("teams")
      .select("id")
      .eq("team_type", "personal_trainer");
    if (ptErr) return out;
    const ptIds = ((ptTeams ?? []) as Array<{ id: string }>).map((r) => String(r.id));
    if (ptIds.length > 0) {
      const { data: optedIn } = await sb
        .from("team_settings")
        .select("team_id")
        .eq("uses_wellness_features", true)
        .in("team_id", ptIds);
      const optedInSet = new Set(((optedIn ?? []) as Array<{ team_id: string }>).map((r) => String(r.team_id)));
      for (const id of ptIds) if (!optedInSet.has(id)) out.add(id);
    }

    return out;
  } catch {
    return new Set();
  }
}
