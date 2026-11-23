/**
 * Reads the screens behind screenRules.ts (brief §4c): the player's pose screens and latest screening form from the
 * last 56 days. Plain columns only (no video signing). Best-effort: a failed read is no flag. Never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SCREEN_RULE_LOOKBACK_DAYS, readScreenFlags, type ScreenFlags, type ScreenInput } from "./screenRules";

const DAY = 86_400_000;

export async function fetchScreenFlags(sb: SupabaseClient, playerId: string, todayIso: string): Promise<ScreenFlags | null> {
  try {
    const since = new Date(Date.parse(`${todayIso}T00:00:00Z`) - SCREEN_RULE_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
    const [{ data: screens }, { data: form }] = await Promise.all([
      sb.from("movement_screens")
        .select("test_slug, screen_date, findings, context, red_flag")
        .eq("player_id", playerId)
        .in("test_slug", ["overhead_squat_assessment", "single_leg_drop_jump"])
        .gte("screen_date", since)
        .lte("screen_date", todayIso)
        .order("screen_date", { ascending: false })
        .limit(20),
      sb.from("movement_assessment_forms")
        .select("assessment_date, fired")
        .eq("player_id", playerId)
        .gte("assessment_date", since)
        .lte("assessment_date", todayIso)
        .order("assessment_date", { ascending: false })
        .limit(1),
    ]);
    type Raw = { test_slug: string; screen_date: string; findings: ScreenInput["screens"][number]["findings"] | null; context: { painReported?: boolean } | null; red_flag: boolean | null };
    const f = ((form ?? []) as Array<{ assessment_date: string; fired: NonNullable<ScreenInput["form"]>["fired"] | null }>)[0];
    return readScreenFlags({
      todayIso,
      screens: ((screens ?? []) as Raw[]).map((r) => ({
        testSlug: r.test_slug, screenDate: r.screen_date, findings: r.findings ?? [],
        redFlag: !!r.red_flag, painReported: !!r.context?.painReported,
      })),
      form: f ? { assessmentDate: f.assessment_date, fired: f.fired ?? [] } : null,
    });
  } catch {
    return null;
  }
}
