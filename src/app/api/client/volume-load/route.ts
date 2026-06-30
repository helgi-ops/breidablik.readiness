/**
 * /api/client/volume-load — weekly tonnage for the calling PT client.
 * Computation in lib/client/volumeLoad (shared with the trainer endpoint).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";
import { computeVolumeLoad } from "@/lib/client/volumeLoad";

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

  const volume = await computeVolumeLoad(sb, (p as { id: string }).id);
  return NextResponse.json({ ok: true, volume });
}
