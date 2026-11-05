export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/scouting/set-videos — opponent set-play VIDEO links for basketball scouting.
 *   GET    ?opponent=…            → this opponent's set-play videos for the coach's team
 *   POST   { opponent, label, url, note? } → add a link
 *   DELETE ?id=…                  → remove one (team-scoped)
 *
 * The simple alternative to drawn diagrams: paste a YouTube (or other) link per set play. No video is
 * downloaded or re-hosted — just the link. Team-scoped; opponent_key = foldName(opponent).
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
  return { supabase, teamId } as const;
}

const SELECT = "id, label, url, note, created_at";

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const opponent = (new URL(req.url).searchParams.get("opponent") ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });
  const { data, error } = await auth.supabase
    .from("opponent_set_videos").select(SELECT)
    .eq("owner_team_id", auth.teamId).eq("opponent_key", foldName(opponent))
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, videos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim();
  const label = String(body?.label ?? "").trim();
  const url = String(body?.url ?? "").trim();
  if (!opponent || !label) return NextResponse.json({ ok: false, error: "opponent and label are required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ ok: false, error: "A valid http(s) link is required" }, { status: 400 });
  const row = {
    owner_team_id: auth.teamId,
    opponent_key: foldName(opponent),
    label: label.slice(0, 120),
    url: url.slice(0, 2000),
    note: body?.note ? String(body.note).slice(0, 500) : null,
  };
  const { data, error } = await auth.supabase.from("opponent_set_videos").insert(row as never).select(SELECT).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, video: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  const { error } = await auth.supabase.from("opponent_set_videos").delete().eq("id", id).eq("owner_team_id", auth.teamId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
