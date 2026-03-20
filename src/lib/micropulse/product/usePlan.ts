"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { hasFeature as _hasFeature, isAtLeastPro as _isAtLeastPro, isElite as _isElite } from "./hasFeature";
import type { MicroPulseFeatureKey, MicroPulsePlanKey } from "./types";

export type UsePlanResult = {
  plan: MicroPulsePlanKey;
  loading: boolean;
  hasFeature: (feature: MicroPulseFeatureKey) => boolean;
  isAtLeastPro: boolean;
  isElite: boolean;
};

const DEFAULT_PLAN: MicroPulsePlanKey = "FREE";

/**
 * Reads the plan_tier for the current coach's team from Supabase.
 * Falls back to FREE if no plan is found or the user has no team.
 *
 * Usage:
 *   const { plan, hasFeature, isAtLeastPro, loading } = usePlan();
 *   if (!hasFeature("GPS_LOAD_MONITORING")) return <UpgradeWall requiredPlan="PRO" />;
 */
export function usePlan(): UsePlanResult {
  const [plan, setPlan] = useState<MicroPulsePlanKey>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function fetchPlan() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) { setPlan(DEFAULT_PLAN); setLoading(false); }
          return;
        }

        // Get team_id from profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("team_id")
          .eq("id", user.id)
          .maybeSingle();

        const teamId = profile?.team_id ?? null;
        if (!teamId) {
          if (!cancelled) { setPlan(DEFAULT_PLAN); setLoading(false); }
          return;
        }

        // Get plan_tier from teams
        const { data: team } = await supabase
          .from("teams")
          .select("plan_tier")
          .eq("id", teamId)
          .maybeSingle();

        const tier = (team?.plan_tier as MicroPulsePlanKey | null) ?? DEFAULT_PLAN;
        const validTiers: MicroPulsePlanKey[] = ["FREE", "PRO", "ELITE"];
        const resolved = validTiers.includes(tier) ? tier : DEFAULT_PLAN;

        if (!cancelled) {
          setPlan(resolved);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setPlan(DEFAULT_PLAN); setLoading(false); }
      }
    }

    fetchPlan();
    return () => { cancelled = true; };
  }, []);

  return {
    plan,
    loading,
    hasFeature: (feature: MicroPulseFeatureKey) => _hasFeature(plan, feature),
    isAtLeastPro: _isAtLeastPro(plan),
    isElite: _isElite(plan),
  };
}
