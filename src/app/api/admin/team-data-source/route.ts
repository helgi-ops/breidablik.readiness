export const runtime = "nodejs";

/**
 * POST /api/admin/team-data-source — set a team's load-data source (gps_provider) centrally.
 *
 * The admin counterpart to the per-team GpsProviderSettings picker: an admin managing many teams can
 * set each team's data source from one panel without switching team context. Same self-configuring
 * cascade as /api/team/settings — picking the indoor-IMU provider (Titan) also configures the team as
 * indoor in one action (teams.training_mode_default='indoor' + team_settings.indoor_mode=true), so the
 * whole system recognises it immediately.
 *
 * Strictly ADMIN-gated (is_admin flag OR role='ADMIN'); service-role client, scoped to the given team_id.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

const PROVIDERS = ["catapult", "statsport", "wimu", "titan", "none"] as const;
type Provider = (typeof PROVIDERS)[number];

async function requireAdmin(req: NextRequest) {
  const sb = getSupabaseServer();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 as const };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 as const };
  const { data: prof } = await sb.from("profiles").select("role, is_admin").eq("id", userRes.user.id).maybeSingle();
  const p = (prof as { role?: string; is_admin?: boolean } | null) ?? {};
  const isAdmin = p.is_admin === true || String(p.role ?? "").toUpperCase() === "ADMIN";
  if (!isAdmin) return { error: "Admin only", status: 403 as const };
  return { sb, uid: userRes.user.id };
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const body = (await req.json().catch(() => ({}))) as { team_id?: string; gps_provider?: string; catapult_plan_type?: string };
  const teamId = String(body.team_id ?? "").trim();
  const provider = String(body.gps_provider ?? "").toLowerCase() as Provider;
  if (!teamId) return NextResponse.json({ ok: false, error: "team_id required" }, { status: 400 });
  if (!PROVIDERS.includes(provider)) return NextResponse.json({ ok: false, error: "invalid gps_provider" }, { status: 400 });

  const isTitan = provider === "titan";

  // The Catapult product tier maps to teams.catapult_plan_type (the declared-plan knob the
  // get_catapult_data_tier RPC honours): Vector PRO (S7)=premium (all data) · Vector Core Plus=pro ·
  // Vector Core=lite. Only applied for the Catapult provider; ignored otherwise.
  const PLANS = ["lite", "pro", "premium", "unknown"] as const;
  const plan = String(body.catapult_plan_type ?? "").toLowerCase();
  const applyPlan = provider === "catapult" && (PLANS as readonly string[]).includes(plan);

  // teams.gps_provider (+ indoor training mode for the indoor-IMU provider, + Catapult plan tier).
  const teamUpdate: Record<string, unknown> = { gps_provider: provider };
  if (isTitan) teamUpdate.training_mode_default = "indoor";
  if (applyPlan) teamUpdate.catapult_plan_type = plan;
  const { error: teamErr } = await admin.sb.from("teams").update(teamUpdate).eq("id", teamId);
  if (teamErr) return NextResponse.json({ ok: false, error: teamErr.message }, { status: 500 });

  // Legacy indoor_mode flag (read by nav gating + indoor-only features) — kept in sync for Titan.
  if (isTitan) {
    const { error: tsErr } = await admin.sb
      .from("team_settings")
      .upsert({ team_id: teamId, indoor_mode: true, updated_at: new Date().toISOString(), updated_by: admin.uid }, { onConflict: "team_id" });
    if (tsErr) return NextResponse.json({ ok: false, error: tsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, team_id: teamId, gps_provider: provider, indoor: isTitan, catapult_plan_type: applyPlan ? plan : undefined });
}
