"use client";

/**
 * src/lib/useTeamMode.ts
 *
 * Client-side React hook for reading the team's operating mode (Full Suite
 * vs GPS Intelligence Only). Lives in its own file because importing
 * useState/useEffect into modules that get bundled server-side (e.g. the
 * notification scheduler imports teamMode.ts transitively) breaks Next.js
 * webpack with "this React Hook only works in a Client Component".
 *
 * The matching server-side helpers (getTeamMode, getGpsOnlyTeamIds,
 * isGpsOnly, showsWellness) live in `src/lib/teamMode.ts` and stay
 * server-safe (no React imports).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { modeFromFlag, type TeamModeRow } from "@/lib/teamMode";

/** Returns null while loading, then the team mode row. Components that
 *  gate themselves on this should treat null as "loading" (render nothing
 *  or skeleton) — NOT as "hidden", because we don't want a flash of hidden
 *  state on a Full Suite team. */
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
