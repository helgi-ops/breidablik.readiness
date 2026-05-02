/**
 * Catapult data-tier detection ("Lite Mode" gating).
 *
 * Lower-tier Catapult contracts (e.g. Afturelding) don't expose
 * Acceleration/Deceleration B2-3 efforts in their reporting params —
 * only the B1+ aggregate. Decel Intelligence (McBurnie 2022),
 * Indoor Load (FMP IMA bands), and full Quadrant View are silently
 * empty for those clubs. To preserve coach trust we hide those
 * surfaces from teams with insufficient data and surface a friendly
 * "limited Catapult tier" banner if they navigate to one directly.
 *
 * Tier resolution lives in the Postgres function get_catapult_data_tier
 * (see migration 20260502170000) which:
 *   - honors teams.catapult_data_tier_override when set to 'full'/'lite'
 *   - otherwise checks the last 30 days of player_external_load_daily
 *     and returns 'full' if ≥5 rows have B2-3 efforts populated, else 'lite'
 *
 * The "lite" default for unknown teams is deliberate: under-promise,
 * auto-promote when data starts flowing.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CatapultDataTier = "full" | "lite";

export type CatapultTierFeatures = {
  /** McBurnie Decel Intelligence (per-player decel burden, A:D coupling) */
  decelIntelligence: boolean;
  /** Indoor Load page (FMP IMA-band driven) */
  indoorLoad: boolean;
  /** Quadrant View (Gabbett 2017 — needs both axes from same source) */
  quadrantView: boolean;
  /** Decel Narrative AI feature (writes prose around McBurnie payload) */
  decelNarrative: boolean;
};

const FULL_FEATURES: CatapultTierFeatures = {
  decelIntelligence: true,
  indoorLoad:        true,
  quadrantView:      true,
  decelNarrative:    true,
};

const LITE_FEATURES: CatapultTierFeatures = {
  decelIntelligence: false,
  indoorLoad:        false,
  quadrantView:      false,
  decelNarrative:    false,
};

/**
 * Resolve the team's current Catapult data tier. Returns 'lite' as a
 * conservative default if the RPC fails — better to hide a feature than
 * to show a broken one.
 */
export async function getCatapultDataTier(
  supabase: SupabaseClient,
  teamId: string,
): Promise<CatapultDataTier> {
  try {
    const { data, error } = await supabase.rpc("get_catapult_data_tier", { p_team_id: teamId });
    if (error || data == null) return "lite";
    const tier = String(data).toLowerCase();
    return tier === "full" ? "full" : "lite";
  } catch {
    return "lite";
  }
}

/** Map a tier to its feature flags for use in UI / API gating. */
export function tierFeatures(tier: CatapultDataTier): CatapultTierFeatures {
  return tier === "full" ? FULL_FEATURES : LITE_FEATURES;
}

/** Friendly response shape for an API route that's not available on Lite. */
export const LITE_TIER_BLOCKED_RESPONSE = {
  status: 423 as const, // Locked — distinct from 402 (ELITE-required)
  body: {
    error: "CATAPULT_TIER_TOO_LOW",
    message:
      "This feature requires Catapult B2-3 efforts data, which is not available on your current Catapult plan. Contact Catapult to upgrade your reporting parameters.",
    feature: "DECEL_INTELLIGENCE",
    upgrade_path: "catapult_reporting_params",
  },
};
