/**
 * /api/client/readiness — today's readiness score + a plain-language training
 * recommendation. The canonical colour (readiness_entries.color) decides; the
 * recommendation just explains it (manifesto: rules decide, surface explains).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function iso(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

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

  const { data: r } = await sb
    .from("readiness_entries")
    .select("color, total_score")
    .eq("player_id", playerId)
    .eq("entry_date", today)
    .maybeSingle();
  if (!r) return NextResponse.json({ ok: true, readiness: null });

  const row = r as { color: string | null; total_score: number | null };
  // total_score is 5..25 (5 dimensions × 1..5) → 0..100.
  const score = row.total_score != null
    ? Math.max(0, Math.min(100, Math.round(((row.total_score - 5) / 20) * 100)))
    : null;
  const color = String(row.color ?? "").toUpperCase(); // GREEN | YELLOW | RED | GRAY

  // Confidence from check-in maturity (how settled the baseline is).
  const { data: checks } = await sb
    .from("readiness_entries").select("entry_date")
    .eq("player_id", playerId).gte("entry_date", iso(27));
  const n = (checks ?? []).length;
  const confidence: "low" | "medium" | "high" = n >= 20 ? "high" : n >= 10 ? "medium" : "low";

  return NextResponse.json({
    ok: true,
    readiness: { score, color: color || "GRAY", confidence },
  });
}
