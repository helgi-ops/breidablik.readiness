/**
 * src/lib/teamMode.ts
 *
 * Single source of truth for the team's operating mode.
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
 * Used everywhere that gates a wellness component — Coach Sidebar, Player
 * PWA bottom nav, Decision Card, Vikan þín digest, notification scheduler.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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

/** Server-side: read team mode for a given team. Defaults to Full Suite if
 *  no team_settings row exists yet — keeps the safe behaviour for any team
 *  that hasn't been touched since the migration. */
export async function getTeamMode(
  sb: SupabaseClient,
  teamId: string,
): Promise<TeamModeRow> {
  const { data, error } = await sb
    .from("team_settings")
    .select("uses_wellness_features")
    .eq("team_id", teamId)
    .maybeSingle();

  // Tolerant: if RLS blocks read or the column doesn't exist yet, default to
  // Full Suite. Better to over-show wellness than to silently hide it.
  if (error) {
    return { teamId, usesWellnessFeatures: true, mode: "full_suite" };
  }

  const usesWellnessFeatures = (data as { uses_wellness_features?: boolean } | null)?.uses_wellness_features;
  const resolved = typeof usesWellnessFeatures === "boolean" ? usesWellnessFeatures : true;
  return { teamId, usesWellnessFeatures: resolved, mode: modeFromFlag(resolved) };
}

/** Client-side React hook. Returns null while loading, then the team mode
 *  row. Components that gate themselves on this should treat null as
 *  "loading" (render nothing or skeleton) — NOT as "hidden", because we
 *  don't want a flash of hidden state on a Full Suite team. */
export function useTeamMode(teamId: string | null | undefined): TeamModeRow | null {
  const [mode, setMode] = useState<TeamModeRow | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!teamId) {
        if (alive) setMode(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("team_settings")
          .select("uses_wellness_features")
          .eq("team_id", teamId)
          .maybeSingle();
        if (!alive) return;
        if (error) {
          // Default to Full Suite on read failure
          setMode({ teamId, usesWellnessFeatures: true, mode: "full_suite" });
          return;
        }
        const flag = (data as { uses_wellness_features?: boolean } | null)?.uses_wellness_features;
        const resolved = typeof flag === "boolean" ? flag : true;
        setMode({ teamId, usesWellnessFeatures: resolved, mode: modeFromFlag(resolved) });
      } catch {
        if (alive) setMode({ teamId, usesWellnessFeatures: true, mode: "full_suite" });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [teamId]);

  return mode;
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

/** Server-side: returns the set of team_ids that have
 *  uses_wellness_features = false. Used by the notification scheduler to
 *  skip check-in and RPE reminders for GPS-only teams without making a
 *  per-team round trip. Returns empty set on any error — safer to send
 *  reminders than to silently skip them. */
export async function getGpsOnlyTeamIds(
  sb: SupabaseClient,
): Promise<Set<string>> {
  try {
    const { data, error } = await sb
      .from("team_settings")
      .select("team_id")
      .eq("uses_wellness_features", false);
    if (error) return new Set();
    const rows = (data ?? []) as Array<{ team_id: string }>;
    return new Set(rows.map((r) => String(r.team_id)));
  } catch {
    return new Set();
  }
}
