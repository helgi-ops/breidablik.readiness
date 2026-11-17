/**
 * GET / POST /api/coach/team/strength-send-mode
 *
 * The team's DEFAULT strength-send mode (teams.strength_send_mode):
 *   'individualised' — data + screen driven session (readiness + MD-aware, plus the
 *     player's movement-screen corrective + deficit-ledger emphases + F-V driver).
 *   'standard' — the team's Custom Programme (the MD template, still readiness/MD-tuned,
 *     without those per-player layers, when no programme covers the day).
 *   'individualised_goals' (2026-11-17) — individualised, and the players take part: they
 *     choose a goal and exercises (sendMode.ts). This is the team switch for player choices;
 *     going to / from it is kept in the picks history (who, when).
 * The team send may still override this per send; this is only the default.
 * Auth: coach token only. FREE-locked teams can't choose the goals mode (402).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchMdContextInfo } from "@/lib/micropulse/playerContext/domains";
import { noMatchDayFor, sanitizeNoMatchWeek } from "@/lib/micropulse/strengthProgramming/structures";
import { isSendMode, normalizeSendMode } from "@/lib/micropulse/strengthProgramming/sendMode";
import { logTeamModeChange } from "@/lib/micropulse/strengthProgramming/playerPicksStore";

export const runtime = "nodejs";

async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, userId: userRes.user.id } as const;
}


export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data } = await supabase.from("teams").select("strength_send_mode, strength_auto_send").eq("id", auth.teamId).maybeSingle();
  const row = (data ?? {}) as { strength_send_mode?: string; strength_auto_send?: boolean };
  // The MD the auto (week_plans) path would send today — so the send UI can show
  // the REAL MD, never the PDF-preview control's value.
  const todayIso = new Date().toISOString().slice(0, 10);
  const info = await fetchMdContextInfo(supabase, auth.teamId, todayIso, null);
  const autoMd = info.mdContext;
  // A week without a match (2026-11-17): what the coach's weekday plan says today is (individualised modes use it).
  let autoNoMatchDay: string | null = null;
  if (info.noMatchNearby) {
    const { data: pal } = await supabase.from("team_strength_palette").select("no_match_week").eq("team_id", auth.teamId).maybeSingle();
    autoNoMatchDay = noMatchDayFor(todayIso, sanitizeNoMatchWeek((pal as { no_match_week?: unknown } | null)?.no_match_week));
  }
  return NextResponse.json({ ok: true, mode: normalizeSendMode(row.strength_send_mode), autoSend: !!row.strength_auto_send, autoMd, autoNoMatchDay });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { mode?: string; autoSend?: boolean };
  const patch: { strength_send_mode?: string; strength_auto_send?: boolean } = {};
  if (body.mode !== undefined) {
    if (!isSendMode(body.mode)) {
      return NextResponse.json({ error: "mode must be 'standard', 'individualised' or 'individualised_goals'" }, { status: 400 });
    }
    if (body.mode === "individualised_goals") {
      const { data: locked } = await supabase.rpc("is_free_locked_team", { p_team_id: auth.teamId });
      if (locked === true) return NextResponse.json({ error: "Not on this plan", error_is: "Ekki í áskrift liðsins" }, { status: 402 });
    }
    patch.strength_send_mode = body.mode;
  }
  if (typeof body.autoSend === "boolean") patch.strength_auto_send = body.autoSend;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const { data: before } = patch.strength_send_mode
    ? await supabase.from("teams").select("strength_send_mode").eq("id", auth.teamId).maybeSingle()
    : { data: null };
  const { error } = await supabase.from("teams").update(patch).eq("id", auth.teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (patch.strength_send_mode) {
    // Going to / from the goals mode turns player choices on / off for the team: kept in the history. Best-effort.
    await logTeamModeChange(supabase, {
      teamId: auth.teamId,
      from: normalizeSendMode((before as { strength_send_mode?: string } | null)?.strength_send_mode),
      to: normalizeSendMode(patch.strength_send_mode),
      actor: { role: "coach", userId: auth.userId },
    }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, ...patch });
}
