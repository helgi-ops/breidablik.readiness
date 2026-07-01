import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}


/**
 * GET /api/coach/teams
 * Returns all teams the authenticated coach belongs to, with team_type.
 */
export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = getAdmin();
    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userRes.user.id;

    // Step 1: Get coach_teams rows
    const { data: ctRows, error: ctErr } = await sb
      .from("coach_teams")
      .select("team_id, is_primary")
      .eq("coach_id", userId);

    if (ctErr) throw new Error(ctErr.message);
    if (!ctRows || ctRows.length === 0) {
      return NextResponse.json({ teams: [], isStaff: false });
    }

    const teamIds = ctRows.map((r) => r.team_id);

    // Step 2: Fetch team details in BATCHES. A single .in() with 100+ ids builds
    // a query URL long enough to be truncated by the gateway, silently dropping
    // ids near the end of the list (a staff coach on 100+ teams lost teams past
    // ~position 50). Small batches keep each URL short.
    const CHUNK = 40;
    const teamRows: Array<{ id: string; name: string | null; sport: string | null; team_type: string | null; gender: string | null }> = [];
    for (let i = 0; i < teamIds.length; i += CHUNK) {
      const { data: batch, error: teamErr } = await sb
        .from("teams")
        .select("id, name, sport, team_type, gender")
        .in("id", teamIds.slice(i, i + CHUNK));
      if (teamErr) throw new Error(teamErr.message);
      if (batch) teamRows.push(...batch);
    }

    // Build lookup
    const teamMap = new Map<string, (typeof teamRows extends (infer T)[] | null ? T : never)>();
    teamRows?.forEach((t) => teamMap.set(t.id, t));

    // Step 3: Check staff
    const { data: staffRow } = await sb
      .from("staff_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    const isStaff = !!staffRow;

    // Step 4: Assemble result, primary first
    const sorted = [...ctRows].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));

    const teams = sorted.map((ct) => {
      const t = teamMap.get(ct.team_id);
      return {
        id: ct.team_id,
        name: t?.name ?? "—",
        sport: t?.sport ?? "football",
        teamType: t?.team_type ?? "club_team",
        gender: t?.gender ?? null,
        isPrimary: ct.is_primary ?? false,
      };
    });

    return NextResponse.json({ teams, isStaff });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
