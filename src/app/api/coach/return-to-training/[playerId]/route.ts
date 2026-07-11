/**
 * GET  /api/coach/return-to-training/[playerId]?window=180
 * PUT  /api/coach/return-to-training/[playerId]   (save start date / overrides)
 *
 * Return-to-training history + injury-aware plan for one player. Team-scoped
 * (requireCoachAccessForTeam). The heavy computation lives in buildRttForPlayer
 * (shared with the team-summary endpoint) so the page and the post-training
 * report can never drift.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { buildRttForPlayer, plannedSessionsThisWeek } from "@/lib/micropulse/rttForPlayer";

export const runtime = "nodejs";

async function resolve(req: Request, playerId: string) {
  const sb = getSupabaseAdmin();
  const { data: pl } = await sb.from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  const player = pl as { id: string; team_id: string | null; full_name: string | null } | null;
  if (!player?.team_id) throw new Error("Player not found");
  const { teamId } = await requireCoachAccessForTeam(sb, req, player.team_id);
  if (teamId !== player.team_id) throw new Error("Forbidden");
  return { sb, player, teamId: player.team_id };
}

export async function GET(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const { playerId } = await params;
    const { sb, player, teamId } = await resolve(req, playerId);
    const url = new URL(req.url);
    const windowDays = Math.min(400, Math.max(30, Number(url.searchParams.get("window")) || 180));

    const built = await buildRttForPlayer(sb, playerId, teamId, windowDays);
    const result = built.result;
    const plannedSessions = await plannedSessionsThisWeek(sb, teamId).catch(() => null);

    // ── Apply coach overrides to the computed plan (rules recommend; the coach
    // can override, and the override is logged). Latest override per (quality,
    // week) wins; the target is replaced and flagged so the UI shows it + why.
    const overrides = (Array.isArray(built.savedOverrides)
      ? (built.savedOverrides as Array<{ quality?: string; week?: number; to?: number; reason?: string }>)
      : []);
    if (result.plan && overrides.length) {
      const latest = new Map<string, { to: number; reason: string }>();
      for (const o of overrides) {
        if (o?.quality == null || o?.week == null || typeof o?.to !== "number") continue;
        latest.set(`${o.quality}:${o.week}`, { to: o.to, reason: String(o.reason ?? "") });
      }
      for (const w of result.plan.weeks) {
        const ov = latest.get(`${w.quality}:${w.week}`);
        if (!ov) continue;
        const ceiling = result.baseline[w.quality] || 0;
        w.target = ov.to;
        w.pctOfHealthy = ceiling > 0 ? Math.round((ov.to / ceiling) * 100) : 0;
        (w as typeof w & { overridden?: boolean; overrideReason?: string }).overridden = true;
        (w as typeof w & { overridden?: boolean; overrideReason?: string }).overrideReason = ov.reason;
      }
    }

    return NextResponse.json({
      player: { id: player.id, name: player.full_name ?? "—" },
      window: windowDays,
      history: built.sessions,
      injuryWindows: built.windows,
      injuryDiscrepancy: built.injuryDiscrepancy,
      headInjury: built.headInjury,
      injuryProfile: built.injuryProfile,
      rtp: built.rtp,
      rttStartDate: built.rttStartDate,
      plannedSessionsThisWeek: plannedSessions,
      overrides,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: /Forbidden/.test(msg) ? 403 : 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const { playerId } = await params;
    const { sb, teamId } = await resolve(req, playerId);
    const { coachUserId } = await requireCoachAccessForTeam(sb, req, teamId);
    const body = (await req.json().catch(() => ({}))) as {
      rttStartDate?: string | null;
      weeks?: unknown;
      override?: { quality: string; week: number; from: number; to: number; reason: string };
    };

    const { data: existing } = await sb.from("rtt_plans").select("weeks, overrides").eq("player_id", playerId).maybeSingle();
    const overrides = Array.isArray((existing as { overrides?: unknown } | null)?.overrides) ? ((existing as { overrides: unknown[] }).overrides) : [];
    if (body.override) {
      overrides.push({ ...body.override, by: coachUserId, at: new Date().toISOString() });
    }

    const payload: Record<string, unknown> = { player_id: playerId, team_id: teamId, overrides, updated_at: new Date().toISOString(), created_by: coachUserId };
    if (body.rttStartDate !== undefined) payload.rtt_start_date = body.rttStartDate;
    if (body.weeks !== undefined) payload.weeks = body.weeks;

    const { error } = await sb.from("rtt_plans").upsert(payload, { onConflict: "player_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, overrides });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: /Forbidden/.test(msg) ? 403 : 500 });
  }
}
