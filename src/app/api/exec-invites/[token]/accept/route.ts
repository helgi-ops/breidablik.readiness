/**
 * POST /api/exec-invites/[token]/accept
 *
 * Authed call. Redeems an EXEC (management) team_invite_links token for the
 * current user: sets profiles.role = 'EXEC' and grants the link's team via
 * exec_teams. Idempotent (re-accepting just re-affirms the grant). Same bearer-
 * token model as the player/coach link invites — whoever holds the link the coach
 * generated can join, scoped to that one team.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(name: string) { const v = process.env[name]; if (!v) throw new Error(`Missing env: ${name}`); return v; }

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const userClient = createClient(url, env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: link } = await admin
    .from("team_invite_links")
    .select("id, team_id, target_role, is_active, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
  if (String(link.target_role).toUpperCase() !== "EXEC") return NextResponse.json({ error: "not_an_exec_invite" }, { status: 400 });
  if (link.is_active === false) return NextResponse.json({ error: "invite_inactive" }, { status: 409 });
  if (link.expires_at && new Date(String(link.expires_at)) < new Date()) return NextResponse.json({ error: "invite_expired" }, { status: 409 });

  const prof = await admin.from("profiles").upsert({ id: userId, role: "EXEC" }, { onConflict: "id" });
  if (prof.error) return NextResponse.json({ error: prof.error.message }, { status: 500 });

  const grant = await admin.from("exec_teams").upsert({ exec_id: userId, team_id: link.team_id }, { onConflict: "exec_id,team_id" });
  if (grant.error) return NextResponse.json({ error: grant.error.message }, { status: 500 });

  return NextResponse.json({ success: true, teamId: link.team_id, role: "EXEC" });
}
