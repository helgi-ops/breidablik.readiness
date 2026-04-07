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

  const { data: prof } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();

  const role = String((prof as { role?: string })?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!(prof as { team_id?: string })?.team_id) throw new Error("No team context");

  return { userId: userRes.user.id, teamId: (prof as { team_id: string }).team_id };
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

    // Build signup URL with token
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.micropulse.is";
    const signupUrl = `${baseUrl}/signup?invite=${invite.token}&team_id=${teamId}`;

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
