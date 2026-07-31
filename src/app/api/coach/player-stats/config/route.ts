export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never statically cache — always read live DB

/**
 * /api/coach/player-stats/config
 *   GET  → this team's stat_ingestion_config + whether the Wyscout API secret is
 *          present server-side (boolean only — the secret is never returned).
 *   POST → upsert { source, wyscout_team_id, enabled }.
 * Coach-scoped. Selecting 'wyscout_api' only takes effect once the API secret +
 * the fetch seam are in place.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isWyscoutApiConfigured } from "@/lib/integrations/wyscout/config";
import { isBasketballApiConfigured } from "@/lib/integrations/basketball/config";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error } = await supabase.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data } = await ctx.supabase
    .from("stat_ingestion_config").select("source, wyscout_team_id, enabled, basketball_team_ref").eq("team_id", ctx.teamId).maybeSingle();
  const sport = await resolveTeamSport(ctx.supabase, ctx.teamId);
  // A basketball team with no row yet defaults to the (disabled) feed source so
  // the config card shows the right controls.
  const fallback = sport === "basketball"
    ? { source: "baskethotel", wyscout_team_id: null, enabled: false, basketball_team_ref: null }
    : { source: "excel", wyscout_team_id: null, enabled: true, basketball_team_ref: null };
  return NextResponse.json({
    config: data ?? fallback,
    apiSecretConfigured: isWyscoutApiConfigured(),
    basketballFeedConfigured: isBasketballApiConfigured(),
    sport,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const source = ["wyscout_api", "baskethotel"].includes(body.source) ? body.source : "excel";
  const wyscoutTeamId = typeof body.wyscout_team_id === "string" && body.wyscout_team_id.trim() ? body.wyscout_team_id.trim() : null;
  const basketballTeamRef = typeof body.basketball_team_ref === "string" && body.basketball_team_ref.trim() ? body.basketball_team_ref.trim() : null;
  const enabled = body.enabled !== false;
  const row = { team_id: ctx.teamId, source, wyscout_team_id: wyscoutTeamId, basketball_team_ref: basketballTeamRef, enabled };
  const { error } = await ctx.supabase.from("stat_ingestion_config").upsert(row as never, { onConflict: "team_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: { source, wyscout_team_id: wyscoutTeamId, basketball_team_ref: basketballTeamRef, enabled } });
}
