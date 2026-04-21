import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

type LinkRow = {
  id: string;
  team_id: string;
  token: string;
  target_role: string;
  label: string | null;
  is_active: boolean;
  expires_at: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  sport: string | null;
  gender: string | null;
};

/**
 * GET /api/team-invites/[token] — resolve an invite link (public, no auth)
 * Returns team info so the join page can display it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const sb = getAdmin();
    const { data: link, error } = await sb
      .from("team_invite_links")
      .select("id, team_id, token, target_role, label, is_active, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!link) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const row = link as LinkRow;

    if (!row.is_active) {
      return NextResponse.json({ error: "deactivated", status: "deactivated" }, { status: 410 });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return NextResponse.json({ error: "expired", status: "expired" }, { status: 410 });
    }

    // Fetch team info
    const { data: team } = await sb
      .from("teams")
      .select("id, name, sport, gender")
      .eq("id", row.team_id)
      .maybeSingle();

    const teamRow = team as TeamRow | null;

    return NextResponse.json({
      invite: {
        token: row.token,
        targetRole: row.target_role,
        label: row.label,
      },
      team: teamRow
        ? {
            id: teamRow.id,
            name: teamRow.name,
            sport: teamRow.sport,
            gender: teamRow.gender,
          }
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
