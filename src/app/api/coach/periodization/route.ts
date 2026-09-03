/**
 * GET  /api/coach/periodization?year=YYYY  → the generated season plan (macro phases + meso blocks
 *      from the team's own fixtures/load, + per-player individualisation + data-readiness gaps).
 * POST /api/coach/periodization              → persist the coach's edited plan (season_plans + blocks).
 *
 * Read-heavy; the weekly (micro) layer stays in the existing week grid / microcycle programme — this
 * hub links to it, never duplicates it. Descriptive planning — never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadPeriodization } from "@/lib/micropulse/periodization/loader";

export const runtime = "nodejs";

async function authCoachTeam(req: Request): Promise<{ sb: ReturnType<typeof getSupabaseAdmin>; teamId: string; userId: string }> {
  const sb = getSupabaseAdmin();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const userId = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) throw new Error("No team context");
  return { sb, teamId, userId };
}

const errStatus = (m: string) => (/forbidden/i.test(m) ? 403 : /team/i.test(m) ? 400 : 401);

export async function GET(req: Request) {
  let ctx; try { ctx = await authCoachTeam(req); } catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ ok: false, error: m }, { status: errStatus(m) }); }
  const sp = new URL(req.url).searchParams;
  const year = Number(sp.get("year")) || undefined;
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  // Coach's saved window (season_plans.overrides) is the default; a query param overrides it live.
  const { data: saved } = await ctx.sb.from("season_plans").select("overrides").eq("team_id", ctx.teamId).eq("season_year", year ?? new Date().getUTCFullYear()).maybeSingle();
  const ov = (saved as { overrides?: { preseasonStart?: string; seasonEnd?: string } } | null)?.overrides ?? {};
  const plan = await loadPeriodization(ctx.sb, {
    teamId: ctx.teamId, seasonYear: year,
    preseasonStart: iso(sp.get("preStart")) ?? iso(ov.preseasonStart ?? null),
    seasonEnd: iso(sp.get("seasonEnd")) ?? iso(ov.seasonEnd ?? null),
  });
  return NextResponse.json({ ok: true, plan });
}

export async function POST(req: Request) {
  let ctx; try { ctx = await authCoachTeam(req); } catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ ok: false, error: m }, { status: errStatus(m) }); }
  const body = await req.json().catch(() => ({})) as { seasonYear?: number; name?: string; overrides?: Record<string, unknown>; blocks?: Array<Record<string, unknown>> };
  const seasonYear = Number(body.seasonYear) || new Date().getUTCFullYear();

  const { data: planRow, error: upErr } = await ctx.sb.from("season_plans")
    .upsert({ team_id: ctx.teamId, season_year: seasonYear, name: body.name ?? null, overrides: body.overrides ?? {}, created_by: ctx.userId, updated_at: new Date().toISOString() }, { onConflict: "team_id,season_year" })
    .select("id").maybeSingle();
  if (upErr || !planRow) return NextResponse.json({ ok: false, error: upErr?.message ?? "save failed" }, { status: 400 });
  const planId = (planRow as { id: string }).id;

  if (Array.isArray(body.blocks)) {
    await ctx.sb.from("season_plan_blocks").delete().eq("season_plan_id", planId);
    const rows = body.blocks.map((b, i) => ({
      season_plan_id: planId, team_id: ctx.teamId, block_index: Number(b.block_index ?? i),
      phase: (b.phase as string) ?? null, goal: (b.goal as string) ?? null,
      start_date: (b.start_date as string) ?? null, end_date: (b.end_date as string) ?? null,
      is_deload: !!b.is_deload, targets: (b.targets as Record<string, unknown>) ?? {},
    }));
    if (rows.length) { const { error: bErr } = await ctx.sb.from("season_plan_blocks").insert(rows); if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 400 }); }
  }
  return NextResponse.json({ ok: true, planId });
}
