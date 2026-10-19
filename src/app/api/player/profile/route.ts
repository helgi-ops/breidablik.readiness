/**
 * GET/PUT /api/player/profile — a player edits their OWN name (fix a misspelling).
 *
 * Self-scoped and column-restricted: the service-role client only ever touches the authenticated player's
 * own `players` row (resolved from the bearer token), and only `full_name` — never team, status, or
 * position (those are coach/admin decisions). The linked `profiles` row is kept in sync so every surface
 * shows the corrected spelling. (A player has no direct RLS write on `players`, so this route is the path.)
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
  const { data } = await sb.from("players").select("full_name").eq("id", playerId).maybeSingle();
  const row = (data as { full_name?: string | null } | null) ?? null;
  return NextResponse.json({ ok: true, full_name: row?.full_name ?? "" });
}

export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  let userId: string, playerId: string;
  try {
    ({ userId, playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { full_name?: string };
  const fullName = String(body.full_name ?? "").trim();
  if (!fullName) return NextResponse.json({ error: "Nafn má ekki vera tómt" }, { status: 400 });
  if (fullName.length > 100) return NextResponse.json({ error: "Nafn er of langt" }, { status: 400 });

  // ONLY full_name — never team_id / status / position. Scoped to the player's own row.
  const { error } = await sb.from("players").update({ full_name: fullName }).eq("id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Keep the linked profile's name in sync.
  await sb.from("profiles").update({ full_name: fullName }).eq("id", userId);

  return NextResponse.json({ ok: true, full_name: fullName });
}
