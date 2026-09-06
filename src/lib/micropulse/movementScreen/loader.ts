import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_MOVEMENT_TESTS, type MovementTest } from "./registry";
import type { ScreenContext, ScreenFinding, ScreenResult } from "./interpret";

const SEED_BY_SLUG: Record<string, MovementTest> = Object.fromEntries(SEED_MOVEMENT_TESTS.map((t) => [t.slug, t]));

/** A built-in test definition by slug (typed/tested source of truth). */
export function getMovementTest(slug: string): MovementTest | null {
  return SEED_BY_SLUG[slug] ?? null;
}

/**
 * The registry for a team: DB rows (global + team-scoped) hydrated to full
 * definitions — a custom row's `definition` jsonb, else the built-in code seed
 * by slug. Built-in seeds are always included even if a row is missing.
 */
export async function loadMovementTests(sb: SupabaseClient, teamId: string): Promise<MovementTest[]> {
  const { data } = await sb
    .from("movement_tests")
    .select("slug, definition, active, team_id")
    .eq("active", true)
    .or(`team_id.is.null,team_id.eq.${teamId}`);
  const out: MovementTest[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as Array<{ slug: string; definition: MovementTest | null }>) {
    const def = r.definition ?? SEED_BY_SLUG[r.slug] ?? null;
    if (def && !seen.has(def.slug)) {
      out.push(def);
      seen.add(def.slug);
    }
  }
  for (const t of SEED_MOVEMENT_TESTS) if (!seen.has(t.slug)) { out.push(t); seen.add(t.slug); }
  return out;
}

export type MovementScreenRow = {
  id: string;
  playerId: string | null;
  testSlug: string;
  screenDate: string;
  fileName: string | null;
  videoUrl: string | null;
  /** Short-lived signed URL for an uploaded video (private bucket), else null. */
  url: string | null;
  findings: ScreenFinding[];
  context: ScreenContext;
  result: ScreenResult | null;
  confidence: string | null;
  redFlag: boolean;
  rtpFlag: boolean;
  createdAt: string;
};

type RawScreen = {
  id: string; player_id: string | null; test_slug: string; screen_date: string;
  file_path: string | null; file_name: string | null; video_url: string | null;
  findings: ScreenFinding[] | null; context: ScreenContext | null; result: ScreenResult | null;
  confidence: string | null; red_flag: boolean | null; rtp_flag: boolean | null; created_at: string;
};

export async function loadPlayerMovementScreens(sb: SupabaseClient, playerId: string, limit = 20): Promise<MovementScreenRow[]> {
  const { data } = await sb
    .from("movement_screens")
    .select("id, player_id, test_slug, screen_date, file_path, file_name, video_url, findings, context, result, confidence, red_flag, rtp_flag, created_at")
    .eq("player_id", playerId)
    .order("screen_date", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as RawScreen[];
  const out: MovementScreenRow[] = [];
  for (const r of rows) {
    let url: string | null = null;
    if (r.file_path) {
      const { data: signed } = await sb.storage.from("movement-screen-videos").createSignedUrl(r.file_path, 3600);
      url = signed?.signedUrl ?? null;
    }
    out.push({
      id: r.id,
      playerId: r.player_id,
      testSlug: r.test_slug,
      screenDate: r.screen_date,
      fileName: r.file_name,
      videoUrl: r.video_url,
      url,
      findings: r.findings ?? [],
      context: r.context ?? {},
      result: r.result ?? null,
      confidence: r.confidence,
      redFlag: r.red_flag ?? false,
      rtpFlag: r.rtp_flag ?? false,
      createdAt: r.created_at,
    });
  }
  return out;
}
