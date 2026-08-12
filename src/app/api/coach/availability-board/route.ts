export const runtime = "nodejs";

/**
 * GET /api/coach/availability-board?date=YYYY-MM-DD
 *
 * The matchday selection board. For every active player it composes ONE
 * availability tier (available / limited / unavailable) from two sources kept
 * deliberately apart:
 *
 *   • the medical record (player_injuries) — authoritative gate on availability;
 *   • the canonical readiness colour (v_coach_readiness_today_v8.final_color) —
 *     the state for medically-cleared players.
 *
 * Plus a load advisory from recent match minutes (match_player_minutes) and
 * ACWR (readiness_entries.training_modifier). DESCRIPTIVE and READ-ONLY — it
 * never writes and NEVER touches the readiness verdict; it only reads the
 * canonical colour and composes a selection view from it.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildAvailabilityBoard,
  toReadinessColor,
  toInjuryStatus,
  type AvailabilityInput,
  type InjuryStatus,
} from "@/lib/micropulse/availabilityBoard";

type AuthProfile = { role: string | null; team_id: string | null };

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

function daysBefore(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof, error: profErr } = await sb
    .from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  if (profErr) throw new Error(profErr.message);
  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

function toFinite(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}

/** Pull ACWR out of the readiness training_modifier JSONB (same shape the
 *  decisions engine reads). Best-effort — null when absent. */
function extractAcwr(tmRaw: unknown): number | null {
  let tm: Record<string, unknown> | null = null;
  if (tmRaw && typeof tmRaw === "object") tm = tmRaw as Record<string, unknown>;
  else if (typeof tmRaw === "string" && tmRaw.trim()) { try { tm = JSON.parse(tmRaw); } catch { tm = null; } }
  if (!tm) return null;
  const direct = toFinite(tm.acwr);
  if (direct != null) return direct;
  const load = tm.load && typeof tm.load === "object" ? (tm.load as Record<string, unknown>) : null;
  return load ? toFinite(load.acwr) : null;
}

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || todayInReykjavik();
    const windowStart = daysBefore(date, 7);

    // Roster (active only) — the universe of selectable players.
    const { data: rosterData, error: rosterErr } = await sb
      .from("players")
      .select("id, full_name, position")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("full_name");
    if (rosterErr) throw rosterErr;
    const roster = (rosterData ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
    if (!roster.length) {
      return NextResponse.json(buildAvailabilityBoard(date, []));
    }
    const playerIds = roster.map((p) => p.id);

    const [readinessRes, injuryRes, minutesRes, tmRes] = await Promise.all([
      // Canonical readiness colour for the date. team_id first, fall back to team.
      sb.from("v_coach_readiness_today_v8")
        .select("player_id, final_color, total_score, team_id")
        .eq("entry_date", date)
        .eq("team_id", teamId),
      // Latest injury row per player (most recent first; we keep the first per id).
      sb.from("player_injuries")
        .select("player_id, status, injury_type, body_part, rtp_stage, estimated_return_date, injury_date")
        .in("player_id", playerIds)
        .order("injury_date", { ascending: false }),
      // Match minutes in the last 7 days.
      sb.from("match_player_minutes")
        .select("player_id, match_date, minutes_played, is_dnp")
        .in("player_id", playerIds)
        .gte("match_date", windowStart)
        .lte("match_date", date),
      // Today's training_modifier for ACWR.
      sb.from("readiness_entries")
        .select("player_id, training_modifier")
        .eq("entry_date", date)
        .in("player_id", playerIds),
    ]);

    // Readiness map (with team-column fallback for older view shapes).
    let readinessRows = (readinessRes.data ?? []) as Array<Record<string, unknown>>;
    if ((readinessRes.error || readinessRows.length === 0)) {
      const alt = await sb.from("v_coach_readiness_today_v8")
        .select("player_id, final_color, total_score, team_id, team")
        .eq("entry_date", date);
      readinessRows = ((alt.data ?? []) as Array<Record<string, unknown>>)
        .filter((r) => String(r.team_id ?? r.team ?? "") === teamId);
    }
    const readinessByPlayer = new Map<string, { color: unknown; hasCheckin: boolean }>();
    for (const r of readinessRows) {
      const pid = String(r.player_id ?? "");
      if (!pid) continue;
      readinessByPlayer.set(pid, { color: r.final_color, hasCheckin: toFinite(r.total_score) != null });
    }

    // Latest injury per player (rows are DESC by injury_date → first wins).
    const injuryByPlayer = new Map<string, {
      status: InjuryStatus; injuryType: string | null; bodyPart: string | null; rtpStage: string | number | null; estimatedReturn: string | null;
    }>();
    for (const r of (injuryRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.player_id ?? "");
      if (!pid || injuryByPlayer.has(pid)) continue;
      injuryByPlayer.set(pid, {
        status: toInjuryStatus(r.status),
        injuryType: (r.injury_type as string | null) ?? null,
        bodyPart: (r.body_part as string | null) ?? null,
        // rtp_stage can be numeric or text in the DB — pass through; the engine coerces.
        rtpStage: (r.rtp_stage as string | number | null) ?? null,
        estimatedReturn: (r.estimated_return_date as string | null) ?? null,
      });
    }

    // Minutes + match count in window.
    const minutesByPlayer = new Map<string, { minutes: number; matches: number }>();
    for (const r of (minutesRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.player_id ?? "");
      if (!pid) continue;
      if (r.is_dnp === true) continue;
      const mins = toFinite(r.minutes_played) ?? 0;
      if (mins <= 0) continue;
      const cur = minutesByPlayer.get(pid) ?? { minutes: 0, matches: 0 };
      cur.minutes += mins;
      cur.matches += 1;
      minutesByPlayer.set(pid, cur);
    }

    const acwrByPlayer = new Map<string, number | null>();
    for (const r of (tmRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.player_id ?? "");
      if (!pid) continue;
      acwrByPlayer.set(pid, extractAcwr(r.training_modifier));
    }

    const inputs: AvailabilityInput[] = roster.map((p) => {
      const readiness = readinessByPlayer.get(p.id);
      const injury = injuryByPlayer.get(p.id);
      const mins = minutesByPlayer.get(p.id);
      return {
        playerId: p.id,
        name: (p.full_name ?? "").trim() || "—",
        position: p.position ?? null,
        readiness: toReadinessColor(readiness?.color),
        hasCheckinToday: readiness?.hasCheckin ?? false,
        injuryStatus: injury?.status ?? null,
        injuryType: injury?.injuryType ?? null,
        bodyPart: injury?.bodyPart ?? null,
        rtpStage: injury?.rtpStage ?? null,
        estimatedReturn: injury?.estimatedReturn ?? null,
        minutesLast7: mins?.minutes ?? 0,
        matchesLast7: mins?.matches ?? 0,
        acwr: acwrByPlayer.get(p.id) ?? null,
      };
    });

    return NextResponse.json(buildAvailabilityBoard(date, inputs));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build availability board.";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message === "No team context" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
