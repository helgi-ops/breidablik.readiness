/**
 * /api/client/break-status — is the calling PT client on a declared vacation,
 * or returning from one? Drives the client-facing vacation / ease-in banner.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getClientBreakToday, getClientReturnPhase } from "@/lib/notifications/clientBreaks";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: p } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  const playerId = (p as { id: string }).id;
  const today = new Date().toISOString().slice(0, 10);

  const [brk, returnPhase] = await Promise.all([
    getClientBreakToday(sb, playerId, today),
    getClientReturnPhase(sb, playerId, today),
  ]);
  return NextResponse.json({ ok: true, on_break: !!brk, break: brk, returnPhase });
}
