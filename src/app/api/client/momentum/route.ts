/** /api/client/momentum — 14-day training momentum for the caller. */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";
import { computeMomentum } from "@/lib/client/momentum";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }

export async function GET(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: p } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not a player account" }, { status: 403 });

  const momentum = await computeMomentum(sb, (p as { id: string }).id);
  return NextResponse.json({ ok: true, momentum });
}
