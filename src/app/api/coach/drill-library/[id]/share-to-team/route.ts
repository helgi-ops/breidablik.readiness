export const runtime = "nodejs";

/**
 * POST /api/coach/drill-library/[id]/share-to-team
 *
 * Body: { team_id: string }
 *
 * Clones a coach-owned drill (owned by the caller) into a team-owned
 * snapshot. Uses the share_drill_with_team(p_drill_id, p_team_id) RPC
 * which enforces:
 *   - caller must be a coach on the target team (coach_teams)
 *   - source drill must be owner_type='coach' AND owner_coach_id=caller
 * The new row has parent_template_id pointing at the coach master.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, {
    auth: { persistSession: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Vantar auðkenningu" },
      { status: 401 },
    );

  // Verify the user token first with the service-role client.
  const serviceClient = getSupabase();
  const { data: userRes, error: uErr } = await serviceClient.auth.getUser(token);
  if (uErr || !userRes?.user)
    return NextResponse.json({ ok: false, error: "Ógilt token" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const teamId = String(body?.team_id ?? "").trim();
  if (!teamId)
    return NextResponse.json(
      { ok: false, error: "team_id vantar" },
      { status: 400 },
    );

  // Call the RPC with the user's JWT so auth.uid() inside the function
  // resolves to the caller, not the service role.
  const userClient = getSupabase(token);
  const { data, error } = await userClient.rpc("share_drill_with_team", {
    p_drill_id: id,
    p_team_id: teamId,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("not_authorized_for_team")) {
      return NextResponse.json(
        { ok: false, error: "Þú ert ekki þjálfari þessa liðs" },
        { status: 403 },
      );
    }
    if (msg.includes("source_not_found_or_not_owned")) {
      return NextResponse.json(
        { ok: false, error: "Þú átt ekki þessa drillu í Mitt Library" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, new_drill_id: data });
}
