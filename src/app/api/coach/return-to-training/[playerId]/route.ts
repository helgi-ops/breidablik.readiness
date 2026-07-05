/**
 * GET  /api/coach/return-to-training/[playerId]?window=180
 * PUT  /api/coach/return-to-training/[playerId]   (save start date / overrides)
 *
 * Return-to-training history + injury-aware plan for one player. Team-scoped
 * (requireCoachAccessForTeam). The ceiling is built from HEALTHY-window, non-
 * match, real sessions only — injury windows come from the UNION of
 * injury_events + player_injuries (either table can flag a date injured), and
 * any type mismatch is surfaced, not silently resolved.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { computeReturnToTraining, injuryRiskProfile, type RttSession } from "@/lib/micropulse/returnToTraining";

export const runtime = "nodejs";

type Win = { start: string; end: string; type: string; source: "injury_events" | "player_injuries"; isActive: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const clampSpeed = (v: unknown) => { const n = num(v); return n > 0 && n <= 45 ? n : 0; };
const inWindow = (d: string, w: Win) => d >= w.start && d <= w.end;

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
    const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
    const now = today();

    // ── Injury windows (union of both tables) ──────────────────────────────
    const [ieRes, piRes] = await Promise.all([
      sb.from("injury_events").select("injury_date, injury_type, return_date, is_active").eq("player_id", playerId),
      sb.from("player_injuries").select("injury_date, injury_type, status, rtp_stage, estimated_return_date, actual_return_date").eq("player_id", playerId),
    ]);
    const windows: Win[] = [];
    for (const r of (ieRes.data ?? []) as Array<{ injury_date: string; injury_type: string | null; return_date: string | null; is_active: boolean | null }>) {
      if (!r.injury_date) continue;
      const open = !r.return_date || !!r.is_active;
      windows.push({ start: r.injury_date, end: r.return_date ?? now, type: r.injury_type ?? "injury", source: "injury_events", isActive: open && (!r.return_date || r.return_date >= now) });
    }
    for (const r of (piRes.data ?? []) as Array<{ injury_date: string; injury_type: string | null; status: string | null; actual_return_date: string | null; estimated_return_date: string | null }>) {
      if (!r.injury_date) continue;
      const end = r.actual_return_date ?? r.estimated_return_date ?? now;
      const open = !r.actual_return_date;
      windows.push({ start: r.injury_date, end, type: r.injury_type ?? "injury", source: "player_injuries", isActive: open && end >= now });
    }
    const currentlyInjured = windows.some((w) => w.isActive && (!w.end || w.end >= now));
    const headInjury = windows.some((w) => /concuss|head/i.test(w.type) && (w.isActive || w.end >= since));
    // Surface a source disagreement (e.g. concussion vs sprain) rather than pick one.
    const typesByStart = new Map<string, Set<string>>();
    for (const w of windows) { const s = typesByStart.get(w.start) ?? new Set(); s.add(w.type.toLowerCase()); typesByStart.set(w.start, s); }
    const injuryDiscrepancy = [...typesByStart.values()].some((s) => s.size > 1);

    // ── Match dates (schedule with an opponent ∪ manual minutes) ───────────
    const [schedRes, minRes] = await Promise.all([
      sb.from("match_schedule").select("match_date, opponent").eq("team_id", teamId),
      sb.from("match_player_minutes").select("match_date").eq("player_id", playerId),
    ]);
    const matchDates = new Set<string>();
    for (const s of (schedRes.data ?? []) as Array<{ match_date: string; opponent: string | null }>) if ((s.opponent ?? "").trim() !== "") matchDates.add(s.match_date);
    for (const m of (minRes.data ?? []) as Array<{ match_date: string }>) matchDates.add(m.match_date);

    // ── Sessions ───────────────────────────────────────────────────────────
    const { data: load } = await sb
      .from("player_external_load_daily")
      .select("date, total_player_load, total_distance, high_speed_distance, sprint_distance, velocity_band6_total_distance, ima_accel, ima_decel, ima_band3_decel_count, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, accel_decel_efforts, max_velocity, raw_payload_json")
      .eq("player_id", playerId).eq("source", "catapult").gte("date", since).order("date");

    const sessions: RttSession[] = ((load ?? []) as Array<Record<string, unknown>>).map((r) => {
      const date = String(r.date);
      const codLeft = num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low);
      const codRight = num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
      const cod = codLeft + codRight;
      return {
        date,
        injured: windows.some((w) => inWindow(date, w)),
        isMatch: matchDates.has(date),
        estimated: !!(r.raw_payload_json as { estimated?: boolean } | null)?.estimated,
        load: num(r.total_player_load),
        distance: num(r.total_distance),
        hsr: num(r.high_speed_distance),
        sprint: num(r.sprint_distance) || num(r.velocity_band6_total_distance),
        accel: num(r.ima_accel),
        decel: num(r.ima_decel),
        decelHigh: num(r.ima_band3_decel_count),
        cod: cod > 0 ? cod : num(r.accel_decel_efforts),
        codLeft,
        codRight,
        topSpeed: clampSpeed(r.max_velocity),
      };
    });

    // ── Saved plan (start date + coach overrides) ──────────────────────────
    const { data: saved } = await sb.from("rtt_plans").select("rtt_start_date, weeks, overrides").eq("player_id", playerId).maybeSingle();
    const rttStartDate = (saved as { rtt_start_date?: string | null } | null)?.rtt_start_date ?? null;

    // Injury-type awareness: classify from the active injury (else the most
    // recent) so the plan ramps THAT injury's key re-injury qualities slower.
    const activeWins = windows.filter((w) => w.isActive);
    const activeTypes = activeWins.map((w) => w.type);
    const recentWin = [...windows].sort((a, b) => b.start.localeCompare(a.start))[0];
    const profile = injuryRiskProfile(activeTypes.length ? activeTypes : recentWin ? [recentWin.type] : []);

    // Layoff = days out for the governing injury (active one, else most recent):
    // from its start to when training resumes (coach's start date, else today).
    // Drives how high/long the ramp is — a short layoff barely detrains.
    const governing = activeWins.sort((a, b) => a.start.localeCompare(b.start))[0] ?? recentWin;
    const layoffEnd = rttStartDate ?? (governing && !currentlyInjured ? governing.end : now);
    const dayMs = 86400000;
    const layoffDays = governing ? Math.max(0, Math.round((Date.parse(layoffEnd) - Date.parse(governing.start)) / dayMs)) : null;

    const result = computeReturnToTraining({ sessions, refDate: now, rttStartDate, currentlyInjured, layoffDays, headInjury, riskQualities: profile.riskQualities });

    return NextResponse.json({
      player: { id: player.id, name: player.full_name ?? "—" },
      window: windowDays,
      history: sessions,
      injuryWindows: windows,
      injuryDiscrepancy,
      headInjury,
      injuryProfile: profile,
      rttStartDate,
      overrides: (saved as { overrides?: unknown } | null)?.overrides ?? [],
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
