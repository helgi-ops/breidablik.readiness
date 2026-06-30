/**
 * /api/client/bodyweight
 *
 *   POST  { weight_kg, log_date?, notes? }
 *   GET   ?days=90  → recent logs ascending by date
 *   DELETE ?id=…
 *
 * Auth: caller must be a player (players.user_id = auth.uid).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: p } = await sb.from("players").select("id, team_id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  const pp = p as { id: string; team_id: string };
  return { sb, playerId: pp.id, teamId: pp.team_id } as const;
}

export async function POST(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  let body: { weight_kg?: number; log_date?: string; notes?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const w = Number(body.weight_kg);
  if (!Number.isFinite(w) || w <= 0 || w > 500) {
    return NextResponse.json({ error: "weight_kg must be 0–500" }, { status: 400 });
  }
  const logDate = (body.log_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const { error } = await a.sb.from("client_body_weight_logs").upsert({
    player_id: a.playerId, team_id: a.teamId, log_date: logDate,
    weight_kg: Number(w.toFixed(2)),
    notes: (body.notes ?? "").toString().trim() || null,
  }, { onConflict: "player_id,log_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, weight_kg: Number(w.toFixed(2)), log_date: logDate });
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "90")));
  const since = new Date(); since.setDate(since.getDate() - days);
  const { data, error } = await a.sb
    .from("client_body_weight_logs")
    .select("id, log_date, weight_kg, notes")
    .eq("player_id", a.playerId)
    .gte("log_date", since.toISOString().slice(0, 10))
    .order("log_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, logs: data ?? [] });
}

export async function DELETE(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await a.sb.from("client_body_weight_logs").delete().eq("id", id).eq("player_id", a.playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
