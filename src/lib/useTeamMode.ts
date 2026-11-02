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
import { defaultWellnessForTeamType, modeFromFlag, type TeamModeRow } from "@/lib/teamMode";

/** Returns null while loading, then the team mode row. Components that
 *  gate themselves on this should treat null as "loading" (render nothing
 *  or skeleton) — NOT as "hidden", because we don't want a flash of hidden
 *  state on a Full Suite team.
 *
 *  An explicit uses_wellness_features true/false always wins; when the practice
 *  hasn't chosen (no row / null) the default follows team_type — club teams keep
 *  Full Suite, personal-trainer practices default to check-in OFF. Pass
 *  `teamType` when the caller already knows it (e.g. the client Today page has
 *  it from the today response) so the default is correct even if the player's
 *  RLS can't read the teams table. */
export function useTeamMode(
  teamId: string | null | undefined,
  teamType?: string | null,
): TeamModeRow | null {
  const [mode, setMode] = useState<TeamModeRow | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!teamId) {
        if (alive) setMode(null);
        return;
      }
      try {
        // Resolve team_type for the unset-default: prefer the caller-supplied
        // value, else read it (best-effort; unknown → club default).
        let resolvedType = teamType ?? null;
        if (resolvedType == null) {
          const { data: t } = await supabase.from("teams").select("team_type").eq("id", teamId).maybeSingle();
          resolvedType = (t as { team_type?: string | null } | null)?.team_type ?? null;
        }
        const fallback = defaultWellnessForTeamType(resolvedType);

        const { data, error } = await supabase
          .from("team_settings")
          .select("uses_wellness_features")
          .eq("team_id", teamId)
          .maybeSingle();
        if (!alive) return;
        if (error) {
          setMode({ teamId, usesWellnessFeatures: fallback, mode: modeFromFlag(fallback) });
          return;
        }
        const flag = (data as { uses_wellness_features?: boolean | null } | null)?.uses_wellness_features;
        const resolved = typeof flag === "boolean" ? flag : fallback;
        setMode({ teamId, usesWellnessFeatures: resolved, mode: modeFromFlag(resolved) });
      } catch {
        if (alive) setMode({ teamId, usesWellnessFeatures: true, mode: "full_suite" });
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [teamId, teamType]);

  return mode;
}
