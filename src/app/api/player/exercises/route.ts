/**
 * /api/player/exercises
 *
 * GET — the exercise names a PT client can pick from when logging their own
 * session: the global/system library (owner_team_id IS NULL) plus their own
 * team's custom exercises. Names only (EN + IS alias), for a typeahead in the
 * log form. Read-only.
 *
 * Auth: caller must be a player (players.user_id = auth.uid), same guard as
 * /api/player/exercise-sets.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }

async function requirePlayer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: player } = await sb.from("players").select("id, team_id").eq("user_id", userId).maybeSingle();
  if (!player) return { error: "Not a player account", status: 403 } as const;
  const p = player as { id: string; team_id: string };
  return { sb, teamId: p.team_id } as const;
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, teamId } = a;

  const { data, error } = await sb
    .from("exercise_library")
    .select("name, name_is")
    .or(`owner_team_id.is.null,owner_team_id.eq.${teamId}`)
    .order("name", { ascending: true })
    .limit(600);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // De-duplicate by lowercased English name (the canonical value we store).
  const seen = new Set<string>();
  const exercises: Array<{ name: string; name_is: string | null }> = [];
  for (const r of (data ?? []) as Array<{ name: string | null; name_is: string | null }>) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    exercises.push({ name, name_is: (r.name_is ?? "").trim() || null });
  }

  return NextResponse.json({ ok: true, exercises });
}
