/**
 * Rehab-track progression — the persisted, clinician-gated state over the
 * movement-quality tracks (rehabTracks.ts). GET returns the player's tracked rows
 * + recent events; POST is the ONLY path that moves a player between phases
 * (enter / advance / regress / discharge / pause / resume), each writing a logged
 * event with a reason. Nothing auto-advances; criteria are never auto-evaluated as
 * met. Advancing confirms the track's ledger deficits; discharge resolves them
 * (source rehab_track, the clinician as scorer). Descriptive — never the readiness
 * colour; pain / red flags → clinician.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REHAB_TRACKS, TRACK_QUALITIES, type RehabTrackKey } from "@/lib/micropulse/movementScreen/correctives/rehabTracks";

export const runtime = "nodejs";

type Ctx = { sb: SupabaseClient; uid: string; teamId: string | null; role: string };
type Action = "enter" | "advance" | "regress" | "discharge" | "pause" | "resume";
const REASON_REQUIRED: Action[] = ["advance", "regress", "discharge"];

async function requireCoach(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  return { sb, uid, teamId: p.team_id ?? null, role };
}
async function resolvePlayerTeam(ctx: Ctx, playerId: string): Promise<string> {
  const { data } = await ctx.sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  return (data as { team_id?: string } | null)?.team_id ?? ctx.teamId ?? "";
}
async function coachCanAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!data;
}

const isTrackKey = (k: string): k is RehabTrackKey => k in REHAB_TRACKS;
const phaseInTrack = (track: RehabTrackKey, key: string) => REHAB_TRACKS[track].phases.some((p) => p.key === key);

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const playerId = new URL(req.url).searchParams.get("player_id") ?? "";
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: progress } = await ctx.sb.from("rehab_track_progress")
    .select("id, track_key, current_phase_key, status, entered_current_phase_at, started_at, note, updated_at")
    .eq("player_id", playerId).order("updated_at", { ascending: false });
  const { data: events } = await ctx.sb.from("rehab_phase_events")
    .select("track_key, from_phase_key, to_phase_key, action, criteria_met, reason, event_date, created_at")
    .eq("player_id", playerId).order("created_at", { ascending: false }).limit(50);
  return NextResponse.json({ ok: true, progress: progress ?? [], events: events ?? [] });
}

/** On advance → confirm the track's ledger qualities; on discharge → resolve them.
 *  Source rehab_track, the clinician as scorer. Best-effort — a ledger hiccup must
 *  not block the clinician's transition. */
async function syncLedger(ctx: Ctx, teamId: string, playerId: string, track: RehabTrackKey, status: "confirmed" | "resolved", detail: string) {
  const qualities = TRACK_QUALITIES[track] ?? [];
  for (const quality of qualities) {
    try {
      await ctx.sb.from("player_deficits").delete().eq("player_id", playerId).eq("quality", quality).eq("source", "rehab_track");
      await ctx.sb.from("player_deficits").insert({
        team_id: teamId, player_id: playerId, quality, source: "rehab_track", status,
        confidence: 0.9, evidence_grade: "moderate", source_detail: detail, created_by: ctx.uid,
      });
    } catch { /* best-effort ledger sync */ }
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => ({}));
  const b = body as { player_id?: string; track_key?: string; action?: string; to_phase_key?: string; criteria_met?: string[]; reason?: string; note?: string };
  const playerId = String(b.player_id ?? "");
  const trackKey = String(b.track_key ?? "");
  const action = String(b.action ?? "") as Action;
  if (!playerId || !isTrackKey(trackKey)) return NextResponse.json({ error: "player_id and a valid track_key required" }, { status: 400 });
  if (!(["enter", "advance", "regress", "discharge", "pause", "resume"] as string[]).includes(action)) return NextResponse.json({ error: "invalid action" }, { status: 400 });
  const reason = b.reason ? String(b.reason).trim() : "";
  if (REASON_REQUIRED.includes(action) && !reason) return NextResponse.json({ error: `A reason is required to ${action}.` }, { status: 400 });

  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // The player's live (non-terminal) row for this track, if any.
  const { data: existing } = await ctx.sb.from("rehab_track_progress")
    .select("id, current_phase_key, status")
    .eq("player_id", playerId).eq("track_key", trackKey)
    .in("status", ["active", "paused"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const row = existing as { id: string; current_phase_key: string; status: string } | null;

  const criteriaMet = Array.isArray(b.criteria_met) ? b.criteria_met.map(String) : [];
  const writeEvent = async (progressId: string, from: string | null, to: string | null) => {
    await ctx.sb.from("rehab_phase_events").insert({
      progress_id: progressId, team_id: teamId, player_id: playerId, track_key: trackKey,
      from_phase_key: from, to_phase_key: to, action, criteria_met: criteriaMet, reason: reason || null, decided_by: ctx.uid,
    });
  };

  if (action === "enter") {
    const to = String(b.to_phase_key ?? "");
    if (!phaseInTrack(trackKey, to)) return NextResponse.json({ error: "to_phase_key not in track" }, { status: 400 });
    if (row) return NextResponse.json({ error: "Player already has an active track — advance/regress or discharge it first." }, { status: 409 });
    const { data: created, error } = await ctx.sb.from("rehab_track_progress").insert({
      team_id: teamId, player_id: playerId, track_key: trackKey, current_phase_key: to, status: "active",
      note: b.note ? String(b.note) : null, created_by: ctx.uid,
    }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
    await writeEvent((created as { id: string }).id, null, to);
    return NextResponse.json({ ok: true });
  }

  if (!row) return NextResponse.json({ error: "No active track to update — enter the player into the track first." }, { status: 409 });

  if (action === "advance" || action === "regress") {
    const to = String(b.to_phase_key ?? "");
    if (!phaseInTrack(trackKey, to)) return NextResponse.json({ error: "to_phase_key not in track" }, { status: 400 });
    const { error } = await ctx.sb.from("rehab_track_progress")
      .update({ current_phase_key: to, entered_current_phase_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeEvent(row.id, row.current_phase_key, to);
    if (action === "advance") await syncLedger(ctx, teamId, playerId, trackKey, "confirmed", `${trackKey} → ${to} (clinician)`);
    return NextResponse.json({ ok: true });
  }

  if (action === "discharge") {
    const { error } = await ctx.sb.from("rehab_track_progress")
      .update({ status: "discharged", updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeEvent(row.id, row.current_phase_key, null);
    await syncLedger(ctx, teamId, playerId, trackKey, "resolved", `${trackKey} discharged (clinician)`);
    return NextResponse.json({ ok: true });
  }

  // pause / resume
  const nextStatus = action === "pause" ? "paused" : "active";
  const { error } = await ctx.sb.from("rehab_track_progress")
    .update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeEvent(row.id, row.current_phase_key, row.current_phase_key);
  return NextResponse.json({ ok: true });
}
