/**
 * /api/player/decision
 *
 * Returns the same verdict bundle the coach sees on the Decision Summary
 * card, but for the calling player only. Built specifically to fix the
 * coach-vs-player divergence: prior to 2026-04-29 the player UI computed
 * its own verdict from a sparse subset of inputs (just total_score +
 * sleep_quality + muscle_soreness) while the coach side ran the full
 * pipeline. Same player, same day, two different colors on screen.
 *
 * This endpoint shares the engine with /api/team/decisions via the
 * `buildOnePlayerDecision` helper in lib/micropulse/playerDecision —
 * so the verdict is guaranteed identical to whatever the coach is
 * looking at.
 *
 * Auth: requires a valid Supabase session whose profile resolves to
 * an active player linked to a team. RLS handles the rest.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildOnePlayerDecision } from "@/lib/micropulse/playerDecision";

export const runtime = "nodejs";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

async function resolvePlayerContext(
  req: NextRequest,
): Promise<{ playerId: string; teamId: string } | { error: string; status: number }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };

  const sb = getAdminClient();
  const { data: userRes, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };

  const userId = userRes.user.id;
  const { data: prof } = await sb
    .from("profiles")
    .select("player_id, team_id")
    .eq("id", userId)
    .maybeSingle();

  const playerId = (prof as { player_id?: string | null } | null)?.player_id;
  const teamId = (prof as { team_id?: string | null } | null)?.team_id;
  if (!playerId) return { error: "Profile not linked to a player", status: 403 };

  // If profile lacks team_id, fall back to players table.
  let resolvedTeamId = teamId ?? null;
  if (!resolvedTeamId) {
    const { data: playerRow } = await sb
      .from("players")
      .select("team_id")
      .eq("id", playerId)
      .maybeSingle();
    resolvedTeamId = (playerRow as { team_id?: string | null } | null)?.team_id ?? null;
  }
  if (!resolvedTeamId) return { error: "Player not linked to a team", status: 400 };

  return { playerId, teamId: resolvedTeamId };
}

export async function GET(req: NextRequest) {
  const ctx = await resolvePlayerContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || todayInReykjavik();

  try {
    const sb = getAdminClient();
    // Cast through `unknown` because @supabase/supabase-js typings produce
    // slightly different generic args depending on import context (this
    // route's vs. the lib's). Both clients are created with the same
    // service role key + URL — they're functionally identical at runtime.
    const decision = await buildOnePlayerDecision({
      sb: sb as unknown as Parameters<typeof buildOnePlayerDecision>[0]["sb"],
      teamId: ctx.teamId,
      playerId: ctx.playerId,
      date,
    });

    // Canonical color from readiness_entries (the dashboard's source).
    // Fetched separately because buildOnePlayerDecision returns the
    // engine's own verdict, which can disagree with the coach-facing
    // color. The Player PWA's "why am I [color]?" card uses canonical so
    // it always matches what the coach told the player they are.
    // See CLAUDE.md > "Canonical verdict source".
    const { data: canonicalRow } = await sb
      .from("v_coach_readiness_today_v8")
      .select("final_color, total_score")
      .eq("player_id", ctx.playerId)
      .eq("entry_date", date)
      .maybeSingle();
    const canonicalColor = (canonicalRow as { final_color?: string | null } | null)?.final_color
      ? String((canonicalRow as { final_color: string }).final_color).toUpperCase()
      : null;
    const canonicalTotalScore = (canonicalRow as { total_score?: number | null } | null)?.total_score ?? null;

    if (!decision) {
      // No coach row for this player today — likely no readiness check-in
      // has been submitted yet. Return an empty-state shape so the client
      // can render a "complete your check-in" prompt without error.
      return NextResponse.json({
        ok: true,
        date,
        playerId: ctx.playerId,
        teamId: ctx.teamId,
        decision: null,
        canonicalColor,
        canonicalTotalScore,
        note: "No readiness entry for this date yet.",
      });
    }

    return NextResponse.json({
      ok: true,
      date,
      playerId: ctx.playerId,
      teamId: ctx.teamId,
      decision,
      canonicalColor,
      canonicalTotalScore,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[/api/player/decision] failed:", msg);
    return NextResponse.json(
      { error: `Decision pipeline failed: ${msg}` },
      { status: 500 },
    );
  }
}
