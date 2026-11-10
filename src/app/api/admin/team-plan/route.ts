export const runtime = "nodejs";

/**
 * POST /api/admin/team-plan { team_id, plan_tier }  — the admin page's plan switch (FREE / PRO / ELITE).
 *
 * Since Nov 2026 this is the real switch: FREE locks a club to the Free base (src/lib/micropulse/product/
 * freeLock.ts, nightly jobs, API 402), PRO/ELITE opens it. So the answer must be true: the route reads the row
 * back and fails unless the team really has the new plan, and every change is logged in team_plan_changes
 * (who, when, from → to). Before this the page wrote straight to the table and said "updated" even when the
 * database had changed nothing. Admin only.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { requireAdminUser } from "@/lib/auth/requireAdmin";

const TIERS = ["FREE", "PRO", "ELITE"] as const;
type Tier = (typeof TIERS)[number];

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const adminId = await requireAdminUser(sb, req);

    const body = (await req.json().catch(() => ({}))) as { team_id?: unknown; plan_tier?: unknown };
    const teamId = typeof body.team_id === "string" ? body.team_id.trim() : "";
    const tier = String(body.plan_tier ?? "").toUpperCase() as Tier;
    if (!teamId) return NextResponse.json({ ok: false, error: "team_id is required" }, { status: 400 });
    if (!TIERS.includes(tier)) return NextResponse.json({ ok: false, error: "plan_tier must be FREE, PRO or ELITE" }, { status: 400 });

    const { data: before, error: readErr } = await sb.from("teams").select("id, plan_tier").eq("id", teamId).maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!before) return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
    const from = String((before as { plan_tier?: string | null }).plan_tier ?? "FREE").toUpperCase();

    const { data: updated, error: updErr } = await sb
      .from("teams").update({ plan_tier: tier }).eq("id", teamId).select("id, plan_tier");
    if (updErr) throw new Error(updErr.message);
    const rows = (updated ?? []) as Array<{ id: string; plan_tier: string | null }>;
    if (rows.length !== 1 || String(rows[0].plan_tier ?? "").toUpperCase() !== tier) {
      return NextResponse.json({ ok: false, error: "The plan was not saved. Nothing changed." }, { status: 500 });
    }

    // The plan is saved; a failed log write must not undo it, but it must not pass silently either.
    let logged = true;
    if (from !== tier) {
      const { error: logErr } = await sb.from("team_plan_changes").insert({
        team_id: teamId, from_tier: from, to_tier: tier, changed_by: adminId,
      });
      if (logErr) {
        logged = false;
        console.error("[admin/team-plan] plan saved but the change log failed", logErr.message);
      }
    }

    return NextResponse.json({ ok: true, team_id: teamId, from, to: tier, logged });
  } catch (err) {
    const auth = authErrorToResponse(err);
    if (auth) return auth;
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
