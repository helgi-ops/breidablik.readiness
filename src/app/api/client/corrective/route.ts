/**
 * /api/client/corrective
 *
 * POST { itemsDone, itemsTotal, pain } — records today's finished corrective for
 * the signed-in client (one row per day; redoing it replaces the answer). The
 * date is the server's, so a device clock can't move it. Never touches load.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const PAIN = new Set(["none", "little", "yes"]);

export async function POST(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: p } = await sb.from("players").select("id, team_id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  const player = p as { id: string; team_id: string | null };

  let body: { itemsDone?: unknown; itemsTotal?: unknown; pain?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const pain = String(body.pain ?? "");
  if (!PAIN.has(pain)) return NextResponse.json({ error: "Pain answer required" }, { status: 400 });
  const itemsDone = Math.max(0, Math.round(Number(body.itemsDone) || 0));
  const itemsTotal = Math.max(itemsDone, Math.round(Number(body.itemsTotal) || 0));

  const { error } = await sb.from("pt_corrective_logs").upsert({
    player_id: player.id,
    team_id: player.team_id,
    log_date: new Date().toISOString().slice(0, 10),
    items_done: itemsDone,
    items_total: itemsTotal,
    pain,
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id,log_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
