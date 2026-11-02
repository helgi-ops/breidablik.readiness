/**
 * /api/trainer/client/[id]/wellness — per-client daily check-in switch.
 *
 *   PATCH { usesWellnessFeatures: true | false | null } → set the override
 *
 * Writes players.uses_wellness_features: true = check-in ON for this client,
 * false = OFF, null = inherit the practice-wide default (team_settings, which
 * for a personal_trainer practice is off). Resolution lives in
 * src/lib/teamMode.ts resolveWellnessForPlayer. This is the only writer of the
 * column from the coach side.
 *
 * Auth: coach/admin/staff with access to the client's team.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

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
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;

  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
    if (!clientRow) return { error: "Client not found", status: 404 } as const;
    const clientTeamId = (clientRow as { team_id?: string | null }).team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb.from("coach_teams").select("team_id")
        .eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb } as const;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { usesWellnessFeatures?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const v = body.usesWellnessFeatures;
  // Tri-state: true / false / null (inherit). Anything else is a bad request.
  if (!(v === true || v === false || v === null)) {
    return NextResponse.json({ error: "usesWellnessFeatures must be true, false, or null" }, { status: 400 });
  }

  const { error } = await a.sb
    .from("players")
    .update({ uses_wellness_features: v })
    .eq("id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, usesWellnessFeatures: v });
}
