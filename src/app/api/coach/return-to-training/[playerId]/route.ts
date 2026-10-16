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
import { loadCccInput } from "@/lib/micropulse/ccc/loader";
import { computeCccRead } from "@/lib/micropulse/ccc/bands";
import { isCccPhaseKey, type CccPhaseKey } from "@/lib/micropulse/ccc/continuum";
import { loadCccChaos } from "@/lib/micropulse/ccc/chaosLoad";
import { summarizeChaosExposure } from "@/lib/micropulse/ccc/chaos";
import { summarizeVcExposure, isVcLevel } from "@/lib/micropulse/ccc/visualCognitive";

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

    // ── Control-Chaos Continuum (CCC) layer — per-phase GPS target bands as % of
    // the player's own game load + force-plate criteria gates. Phase state lives
    // in rehab_track_progress (track_key='ccc'); the clinician advances it. Purely
    // descriptive decision-support; GPS/force-plate tier-gated.
    const { data: cccProgress } = await sb.from("rehab_track_progress")
      .select("id, current_phase_key, status, entered_current_phase_at, started_at")
      .eq("player_id", playerId).eq("track_key", "ccc").in("status", ["active", "paused"])
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const cccRow = cccProgress as { current_phase_key: string; status: string; entered_current_phase_at: string | null } | null;
    const phaseKey: CccPhaseKey = cccRow && isCccPhaseKey(cccRow.current_phase_key) ? cccRow.current_phase_key : "high_control";
    const injuryCategory = (built.injuryProfile as { category?: string } | null)?.category ?? "general";
    const cccRead = await loadCccInput(sb, teamId, playerId, phaseKey, injuryCategory)
      .then((input) => computeCccRead(input))
      .catch(() => null);
    const { data: cccEvents } = await sb.from("rehab_phase_events")
      .select("from_phase_key, to_phase_key, action, criteria_met, reason, event_date, created_at")
      .eq("player_id", playerId).eq("track_key", "ccc").order("created_at", { ascending: false }).limit(20);
    const rtpStatus = (built.rtp as { status?: string | null } | null)?.status ?? null;
    const cccRelevant = !!cccRow || (rtpStatus != null && rtpStatus !== "cleared") || (Array.isArray(built.windows) && built.windows.length > 0);

    // Per-session chaos — the control↔chaos axis the volume bands can't see. IMA
    // CoD density as % of own-game demand → suggested level; physio tags confirm.
    const cccChaos = cccRelevant
      ? await loadCccChaos(sb, playerId)
          .then((c) => ({ ...c, exposure: summarizeChaosExposure(c.sessions, phaseKey), vc: summarizeVcExposure(c.sessions, phaseKey) }))
          .catch(() => null)
      : null;

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
      ccc: { active: !!cccRow, relevant: cccRelevant, enteredAt: cccRow?.entered_current_phase_at ?? null, read: cccRead, events: cccEvents ?? [], chaos: cccChaos },
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: /Forbidden/.test(msg) ? 403 : 500 });
  }
}

/** CCC phase transition — enter / advance / regress / discharge the player on the
 *  Control-Chaos Continuum. Writes rehab_track_progress + a logged rehab_phase_events
 *  row (track_key='ccc'); a reason is required to advance/regress/discharge. Nothing
 *  auto-advances — the clinician gates every step. Never the readiness colour. */
export async function POST(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const { playerId } = await params;
    const { sb, teamId } = await resolve(req, playerId);
    const { coachUserId } = await requireCoachAccessForTeam(sb, req, teamId);
    const b = (await req.json().catch(() => ({}))) as { action?: string; to_phase_key?: string; reason?: string; criteria_met?: string[]; session_date?: string; chaos_level?: string; cognitive_level?: string; chaos_index_pct?: number | null; note?: string };

    const action = String(b.action ?? "");

    // ── Per-session tag — the physio confirms / overrides a session's place on the
    // physical control↔chaos axis AND / OR classifies its visual-cognitive decision
    // load (two independent axes). A tag may carry either or both; the one not sent
    // is preserved (merge). One tag per (player, date); logged with tagged_by.
    // Descriptive — never the readiness colour.
    if (action === "tag_chaos") {
      const sessionDate = String(b.session_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return NextResponse.json({ error: "session_date required (YYYY-MM-DD)" }, { status: 400 });
      const chaosProvided = b.chaos_level != null && b.chaos_level !== "";
      const cogProvided = b.cognitive_level != null && b.cognitive_level !== "";
      if (chaosProvided && !isCccPhaseKey(String(b.chaos_level))) return NextResponse.json({ error: "chaos_level not a CCC phase" }, { status: 400 });
      if (cogProvided && !isVcLevel(String(b.cognitive_level))) return NextResponse.json({ error: "cognitive_level not a VC level" }, { status: 400 });
      if (!chaosProvided && !cogProvided) return NextResponse.json({ error: "chaos_level or cognitive_level required" }, { status: 400 });

      // Merge with any existing tag so setting one axis never wipes the other.
      const { data: existing } = await sb.from("ccc_session_chaos_tags")
        .select("chaos_level, cognitive_level, chaos_index_pct, note")
        .eq("player_id", playerId).eq("session_date", sessionDate).maybeSingle();
      const ex = existing as { chaos_level: string | null; cognitive_level: string | null; chaos_index_pct: number | null; note: string | null } | null;

      const noteProvided = b.note !== undefined;
      const { error } = await sb.from("ccc_session_chaos_tags").upsert({
        team_id: teamId, player_id: playerId, session_date: sessionDate,
        chaos_level: chaosProvided ? String(b.chaos_level) : (ex?.chaos_level ?? null),
        cognitive_level: cogProvided ? String(b.cognitive_level) : (ex?.cognitive_level ?? null),
        chaos_index_pct: chaosProvided ? (typeof b.chaos_index_pct === "number" ? b.chaos_index_pct : null) : (ex?.chaos_index_pct ?? null),
        source: "coach", note: noteProvided ? (String(b.note).trim() || null) : (ex?.note ?? null),
        tagged_by: coachUserId, updated_at: new Date().toISOString(),
      }, { onConflict: "player_id,session_date" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!["enter", "advance", "regress", "discharge"].includes(action)) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
    const reason = b.reason ? String(b.reason).trim() : "";
    if (["advance", "regress", "discharge"].includes(action) && !reason) {
      return NextResponse.json({ error: `A reason is required to ${action}.` }, { status: 400 });
    }
    const toPhase = String(b.to_phase_key ?? "");
    const criteriaMet = Array.isArray(b.criteria_met) ? b.criteria_met.map(String) : [];
    const nowIso = new Date().toISOString();
    const todayIso = nowIso.slice(0, 10);

    const { data: rowData } = await sb.from("rehab_track_progress")
      .select("id, current_phase_key, status")
      .eq("player_id", playerId).eq("track_key", "ccc").in("status", ["active", "paused"])
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const row = rowData as { id: string; current_phase_key: string; status: string } | null;

    const writeEvent = (progressId: string, from: string | null, to: string | null) =>
      sb.from("rehab_phase_events").insert({
        progress_id: progressId, team_id: teamId, player_id: playerId, track_key: "ccc",
        from_phase_key: from, to_phase_key: to, action, criteria_met: criteriaMet, reason: reason || null, decided_by: coachUserId,
      });

    if (action === "enter") {
      const to = isCccPhaseKey(toPhase) ? toPhase : "high_control";
      if (row) return NextResponse.json({ error: "Player already on the CCC — advance/regress or discharge first." }, { status: 409 });
      const { data: created, error } = await sb.from("rehab_track_progress")
        .insert({ team_id: teamId, player_id: playerId, track_key: "ccc", current_phase_key: to, status: "active", created_by: coachUserId })
        .select("id").single();
      if (error || !created) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
      await writeEvent((created as { id: string }).id, null, to);
      return NextResponse.json({ ok: true });
    }

    if (!row) return NextResponse.json({ error: "No active CCC — enter the player first." }, { status: 409 });

    if (action === "advance" || action === "regress") {
      if (!isCccPhaseKey(toPhase)) return NextResponse.json({ error: "to_phase_key not a CCC phase" }, { status: 400 });
      const { error } = await sb.from("rehab_track_progress")
        .update({ current_phase_key: toPhase, entered_current_phase_at: todayIso, updated_at: nowIso }).eq("id", row.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await writeEvent(row.id, row.current_phase_key, toPhase);
      return NextResponse.json({ ok: true });
    }

    // discharge
    const { error } = await sb.from("rehab_track_progress").update({ status: "discharged", updated_at: nowIso }).eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await writeEvent(row.id, row.current_phase_key, null);
    return NextResponse.json({ ok: true });
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
