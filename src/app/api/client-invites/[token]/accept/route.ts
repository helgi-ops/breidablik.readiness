import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/client-invites/[token]/accept
 *
 * Auth'd call. Wraps accept_client_invitation(token) RPC which:
 *   - validates status/expiry
 *   - creates (or reuses) the players row linked to auth.uid()
 *   - marks the invitation as accepted with player_id back-reference
 *
 * After the RPC succeeds we also force-correct profiles.role and the auth
 * user_metadata.role to PLAYER. Without this fix-up a brand new client who
 * signed up through the old /signup form (which hardcoded role:"COACH")
 * would still have the COACH role hanging around and could land on the
 * coach surface by mistake.
 *
 * Mirrors /api/coach-invites/[token]/accept.
 */

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use the caller's JWT so auth.uid() inside the RPC matches the signed-in user.
  const userSb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  // Email-mismatch check up front — accept_client_invitation doesn't enforce
  // it server-side, but allowing user A to redeem user B's invite would
  // create an orphaned player record and let A see B's PT messages.
  const { data: userRes, error: uErr } = await userSb.auth.getUser();
  if (uErr || !userRes?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const userId = userRes.user.id;
  const userEmail = (userRes.user.email ?? "").toLowerCase();

  const admin = getAdmin();
  const { data: invite } = await admin
    .from("client_invitations")
    .select("client_email, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) {
    return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
  }
  const inviteEmail = String((invite as { client_email?: string }).client_email ?? "").toLowerCase();
  if (inviteEmail && userEmail && inviteEmail !== userEmail) {
    return NextResponse.json({ error: "email_mismatch" }, { status: 403 });
  }

  // Call the existing RPC — it creates / reuses players row and marks
  // the invite accepted in one transaction.
  const { data, error } = await userSb.rpc("accept_client_invitation", { p_token: token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const row = (data ?? {}) as { success?: boolean; error?: string; player_id?: string; team_id?: string };
  if (!row.success) {
    const code = row.error ?? "accept_failed";
    let status = 400;
    if (code === "not_authenticated") status = 401;
    else if (code === "invalid_or_expired_invitation") status = 409;
    return NextResponse.json({ error: code }, { status });
  }

  // Force-correct the user's role downstream of signup. The legacy /signup
  // form set role:"COACH" on the auth metadata; profiles.role is sync'd by
  // a trigger from that metadata. Now that the invite has been redeemed
  // we know definitively this is a PT client, so coerce both stores to
  // PLAYER. Idempotent — safe to re-run on subsequent accepts.
  await admin.from("profiles").update({ role: "PLAYER" }).eq("id", userId);
  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...(userRes.user.user_metadata ?? {}), role: "PLAYER" },
    });
  } catch {
    /* Non-fatal — profiles.role is what every downstream check reads. */
  }

  return NextResponse.json({
    success: true,
    teamId: row.team_id ?? null,
    playerId: row.player_id ?? null,
  });
}
