export const runtime = "nodejs";
export const maxDuration = 45; // AI extraction

/**
 * POST /api/coach/match-minutes/read-lineup  (multipart: file)
 *
 * Reads a StatsBomb Match Report PDF → the coach's OWN-team matchday lineup: starting XI, subs and
 * unused subs, with minutes (starter → sub-off minute or full; sub → full − on-minute; unused → DNP).
 * Returns a proposal the coach reviews and saves on the Match minutes page — READ-ONLY AI, never
 * writes minutes itself, never touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { extractLineupFromReport, sideToMinutes, type SideLineup } from "@/lib/micropulse/matchMinutes/lineupFromReport";
import { matchByInitialSurname, normalizeName } from "@/lib/micropulse/statsIngestion/nameMatch";

async function getCoachTeam(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI extraction unavailable (no API key configured)." }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No PDF uploaded." }, { status: 400 });

  let extract;
  try { extract = await extractLineupFromReport({ apiKey, buffer: Buffer.from(await file.arrayBuffer()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the report." }, { status: 422 }); }

  // Which side is the coach's own team?
  const { data: team } = await auth.supabase.from("teams").select("name, club_short_name").eq("id", auth.teamId).maybeSingle();
  const ownKeys = [team?.name, (team as { club_short_name?: string } | null)?.club_short_name].filter(Boolean).map((s) => normalizeName(String(s)));
  const sideMatches = (s: SideLineup) => { const k = normalizeName(s.team); return ownKeys.some((o) => o && (k.includes(o) || o.includes(k))); };
  const own = sideMatches(extract.home) ? extract.home : sideMatches(extract.away) ? extract.away : null;
  if (!own) return NextResponse.json({ ok: false, error: `This report is ${extract.home.team} v ${extract.away.team} — neither matches your team (${team?.name ?? "?"}).` }, { status: 400 });
  const opponent = own === extract.home ? extract.away.team : extract.home.team;

  const rows = sideToMinutes(own);

  // Match each extracted player to the roster (active squad).
  const { data: squadRows } = await auth.supabase.from("players").select("id, full_name, is_active").eq("team_id", auth.teamId);
  const squad = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));

  const players = rows.map((r) => {
    const m = matchByInitialSurname(r.name, squad);
    return {
      playerId: m.playerId, rosterName: m.playerId ? squad.find((s) => s.id === m.playerId)?.fullName ?? null : null,
      extractedName: r.name, number: r.number, position: r.position,
      started: r.started, isDnp: r.isDnp, minutes: r.minutes, confidence: m.confidence,
    };
  });

  return NextResponse.json({
    ok: true,
    date: extract.date, opponent,
    counts: { matched: players.filter((p) => p.playerId).length, unmatched: players.filter((p) => !p.playerId).length },
    players,
  });
}
