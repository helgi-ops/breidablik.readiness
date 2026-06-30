/**
 * /api/client/load-quadrant
 *
 * Fitness × Fatigue quadrant for the calling PT client. Computation lives in
 * lib/client/loadQuadrant so the trainer-facing endpoint stays identical.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";
import { computeLoadQuadrant } from "@/lib/client/loadQuadrant";

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

  const quadrant = await computeLoadQuadrant(sb, (p as { id: string }).id);
  return NextResponse.json({ ok: true, quadrant });
}
