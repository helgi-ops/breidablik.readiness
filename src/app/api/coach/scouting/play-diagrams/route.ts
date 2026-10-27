export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/scouting/play-diagrams — set-play diagrams for basketball opponent scouting.
 *   GET    ?opponent=…        → this opponent's diagrams for the coach's team
 *   POST   { opponent, name, playType?, diagram, source?, confidence?, notes? } → create
 *   PUT    { id, name?, playType?, diagram?, notes?, confirmed? }               → update / confirm
 *   DELETE ?id=…              → delete
 *
 * Team-scoped (owner_team_id from the caller's profile, same as the scout route);
 * opponent_key = foldName(opponent) so a play belongs to the opponent being scouted.
 * Descriptive scouting only — never touches the readiness colour or a training action.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

const foldName = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId, userId: userRes.user.id } as const;
}

const SELECT = "id, opponent_key, name, play_type, diagram, source, confidence, confirmed, confirmed_by, notes, created_at, updated_at";

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const opponent = (new URL(req.url).searchParams.get("opponent") ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });
  const { data, error } = await auth.supabase
    .from("opponent_play_diagrams").select(SELECT)
    .eq("owner_team_id", auth.teamId).eq("opponent_key", foldName(opponent))
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, diagrams: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim();
  const name = String(body?.name ?? "").trim();
  if (!opponent || !name) return NextResponse.json({ ok: false, error: "opponent and name are required" }, { status: 400 });
  if (!body?.diagram || typeof body.diagram !== "object") return NextResponse.json({ ok: false, error: "diagram is required" }, { status: 400 });
  const source = body?.source === "ai_draft" ? "ai_draft" : "manual";
  const row = {
    owner_team_id: auth.teamId,
    opponent_key: foldName(opponent),
    name,
    play_type: body?.playType ? String(body.playType) : null,
    diagram: body.diagram,
    source,
    confidence: source === "ai_draft" && body?.confidence ? String(body.confidence) : null,
    // Manual plays are confirmed on save; AI drafts start unconfirmed until the coach confirms.
    confirmed: source === "manual",
    confirmed_by: source === "manual" ? auth.userId : null,
    notes: body?.notes ? String(body.notes) : null,
  };
  const { data, error } = await auth.supabase.from("opponent_play_diagrams").insert(row as never).select(SELECT).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, diagram: data });
}

export async function PUT(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string") patch.name = body.name.trim();
  if ("playType" in body) patch.play_type = body.playType ? String(body.playType) : null;
  if (body?.diagram && typeof body.diagram === "object") patch.diagram = body.diagram;
  if ("notes" in body) patch.notes = body.notes ? String(body.notes) : null;
  // Confirming a play (coach is the source of truth — logs who confirmed).
  if (body?.confirmed === true) { patch.confirmed = true; patch.confirmed_by = auth.userId; }
  else if (body?.confirmed === false) { patch.confirmed = false; patch.confirmed_by = null; }
  const { data, error } = await auth.supabase
    .from("opponent_play_diagrams").update(patch as never)
    .eq("id", id).eq("owner_team_id", auth.teamId).select(SELECT).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, diagram: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  const { error } = await auth.supabase.from("opponent_play_diagrams").delete().eq("id", id).eq("owner_team_id", auth.teamId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
