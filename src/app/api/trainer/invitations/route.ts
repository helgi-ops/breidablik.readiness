import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function requireCoach(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdmin();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const userId = userRes.user.id;

  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userId)
    .maybeSingle();

  const role = String((prof as { role?: string })?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");

  // Accept team_id from query string (frontend sends it when switching teams)
  const url = new URL(req.url);
  const requestedTeamId = url.searchParams.get("team_id");
  const profileTeamId = (prof as { team_id?: string })?.team_id;
  const effectiveTeamId = requestedTeamId || profileTeamId;
  if (!effectiveTeamId) throw new Error("No team context");

  // Verify the coach has access to this team via coach_teams
  if (requestedTeamId && requestedTeamId !== profileTeamId) {
    const { data: access } = await sb
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", requestedTeamId)
      .maybeSingle();
    if (!access) throw new Error("Forbidden: no access to this team");
  }

  return { userId, teamId: effectiveTeamId };
}

/* ── GET: list invitations ─────────────────────────── */

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = getAdmin();

    const { data, error } = await sb
      .from("client_invitations")
      .select("id, client_email, client_name, status, token, expires_at, accepted_at, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ invitations: data ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/* ── POST: create invitation ───────────────────────── */

export async function POST(req: Request) {
  try {
    const { userId, teamId } = await requireCoach(req);
    const sb = getAdmin();
    const body = await req.json();

    const { clientEmail, clientName, notes } = body as {
      clientEmail: string;
      clientName?: string;
      notes?: string;
    };

    if (!clientEmail || !clientEmail.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    // Check for existing pending invitation
    const { data: existing } = await sb
      .from("client_invitations")
      .select("id")
      .eq("team_id", teamId)
      .eq("client_email", clientEmail.toLowerCase().trim())
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Pending invitation already exists for this email" }, { status: 409 });
    }

    const { data: invite, error } = await sb
      .from("client_invitations")
      .insert({
        team_id: teamId,
        invited_by: userId,
        client_email: clientEmail.toLowerCase().trim(),
        client_name: clientName?.trim() || null,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Build invite URL. We point at /invite/client/[token] (NOT the legacy
    // /signup?invite=… path which routes through the coach signup form and
    // would create the new account with role=COACH — that's exactly how
    // Aníta Rut ended up as a coach on 2026-05-14). The dedicated page
    // handles signup + accept inline and writes role=PLAYER throughout.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.micropulse.is";
    const signupUrl = `${baseUrl}/invite/client/${invite.token}`;

    return NextResponse.json({
      invitation: invite,
      signupUrl,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/* ── DELETE: revoke invitation ─────────────────────── */

export async function DELETE(req: Request) {
  try {
    const { userId, teamId } = await requireCoach(req);
    const sb = getAdmin();
    const url = new URL(req.url);
    const inviteId = url.searchParams.get("id");

    if (!inviteId) {
      return NextResponse.json({ error: "Invitation id required" }, { status: 400 });
    }

    const { error } = await sb
      .from("client_invitations")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("team_id", teamId)
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
