/**
 * /api/trainer/client/[id]/load-quadrant
 *
 * Fitness × Fatigue quadrant for one of the trainer's clients. Same computation
 * as the client-facing endpoint (lib/client/loadQuadrant); only the auth model
 * differs — the caller must be a coach/admin/staff with access to the client's
 * team (ADMIN can read any client, Helgi pilot mode).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { computeLoadQuadrant } from "@/lib/client/loadQuadrant";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function requireTrainerForClient(req: Request, clientId: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;

  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Forbidden", status: 403 } as const;
  }

  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
    if (!clientRow) return { error: "Client not found", status: 404 } as const;
    const clientTeamId = (clientRow as { team_id?: string | null }).team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;

    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb
        .from("coach_teams")
        .select("team_id")
        .eq("coach_id", userId)
        .eq("team_id", clientTeamId)
        .maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }

  return { sb } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const quadrant = await computeLoadQuadrant(a.sb, clientId);
  return NextResponse.json({ ok: true, quadrant });
}
