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

// Mirror week-setup/apply's load scale so week_plans stays consistent with the Week Setup grid (1–9).
function computePlannedLoad(systemKey: string, dayType: string, intensityTarget: number): number {
  if (dayType === "OFF") return 1;
  if (dayType === "RECOVERY") return Math.max(2, Math.min(4, intensityTarget - 3));
  if (dayType === "GAME") return 9;
  switch (systemKey) {
    case "RECOVERY": return 3;
    case "POWER": return Math.max(6, Math.min(8, intensityTarget));
    case "STRENGTH": return Math.max(7, Math.min(9, intensityTarget + 1));
    default: return Math.max(5, Math.min(8, intensityTarget));
  }
}

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
  const body = await req.json().catch(() => ({})) as { seasonYear?: number; name?: string; overrides?: Record<string, unknown>; blocks?: Array<Record<string, unknown>>; addFriendly?: string; opponent?: string; applyWeekSetup?: Array<{ week_start: string; system_key: string; intensity_target: number; notes?: string | null; days: Array<{ day_index: number; day_date: string; day_type: string; focus?: string | null; day_intent?: string | null }> }> };

  // Write the coach's block skeleton back into Week Setup (week_setups + week_plans) — the same tables the
  // Week Setup grid reads, so the two stay in sync. Matches → GAME, rest → OFF, sessions → TRAIN; the
  // day-type name (Locomotive/Mechanical…) rides in `focus` and the MD tag in `day_intent`.
  if (Array.isArray(body.applyWeekSetup)) {
    for (const wk of body.applyWeekSetup) {
      if (!wk?.week_start || !wk?.system_key || wk.intensity_target == null) continue;
      const { error: sErr } = await ctx.sb.from("week_setups").upsert({ team_id: ctx.teamId, week_start: wk.week_start, system_key: wk.system_key, intensity_target: wk.intensity_target, notes: wk.notes ?? null }, { onConflict: "team_id,week_start" });
      if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 });
      const rows = (wk.days ?? []).filter((d) => d?.day_date && Number.isFinite(d.day_index)).map((d) => ({
        team_id: ctx.teamId, week_start: wk.week_start, day_date: d.day_date, day_index: d.day_index,
        day_type: (d.day_type || "TRAIN").toUpperCase(), focus: d.focus ?? null,
        planned_load: computePlannedLoad(wk.system_key, (d.day_type || "TRAIN").toUpperCase(), wk.intensity_target),
        system_key: wk.system_key, notes: null, day_intent: d.day_intent ?? null,
      }));
      if (rows.length) { const { error: pErr } = await ctx.sb.from("week_plans").upsert(rows, { onConflict: "team_id,day_date" }); if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 }); }
    }
    return NextResponse.json({ ok: true, appliedWeeks: body.applyWeekSetup.length });
  }

  // ── THE SINGLE FIXTURE WRITE PATH ──────────────────────────────────────────────────────────────
  // match_schedule is the ONE source of truth for matches. Every planner surface (Meso calendar,
  // Week Setup, the friendly input) writes matches through here so the surfaces stay in lockstep.
  // upsert: add/move/retag a match (onConflict team_id,match_date). delete: remove it — BLOCKED when
  // downstream data (recorded minutes / match stats) references the fixture, unless `force` is set.
  const fx = (body as { fixture?: unknown }).fixture;
  if (fx && typeof fx === "object") {
    const f = fx as { op?: string; date?: string; opponent?: string | null; isHome?: boolean | null; competition?: string | null; kickoff?: string | null; force?: boolean };
    if (!f.date || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return NextResponse.json({ ok: false, error: "bad fixture date" }, { status: 400 });
    if (f.op === "delete") {
      // Guardrail — a fixture referenced by recorded minutes/stats is NOT deleted silently.
      const [{ count: minCount }, { count: statCount }] = await Promise.all([
        ctx.sb.from("match_player_minutes").select("player_id", { count: "exact", head: true }).eq("team_id", ctx.teamId).eq("match_date", f.date),
        ctx.sb.from("player_match_stats").select("player_id", { count: "exact", head: true }).eq("team_id", ctx.teamId).eq("match_date", f.date),
      ]);
      const refs = { minutes: minCount ?? 0, stats: statCount ?? 0, total: (minCount ?? 0) + (statCount ?? 0) };
      if (refs.total > 0 && !f.force) return NextResponse.json({ ok: false, blocked: true, refs, error: "fixture has recorded data" }, { status: 409 });
      const { error } = await ctx.sb.from("match_schedule").delete().eq("team_id", ctx.teamId).eq("match_date", f.date);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deletedFixture: f.date, refs });
    }
    // upsert (add / move / retag). NON-CLOBBERING: only fields the caller sends are changed; the rest keep
    // their existing values (so a Week Setup save that omits opponent won't wipe a fixture's opponent). A
    // brand-new row defaults to a Friendly — planners add friendlies; league fixtures come from Fixtures.
    const has = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
    const { data: existing } = await ctx.sb.from("match_schedule").select("opponent, competition, is_home, kickoff_time").eq("team_id", ctx.teamId).eq("match_date", f.date).maybeSingle();
    const ex = existing as { opponent?: string | null; competition?: string | null; is_home?: boolean | null; kickoff_time?: string | null } | null;
    const payload: Record<string, unknown> = { team_id: ctx.teamId, match_date: f.date };
    payload.opponent = has(f.opponent) ? f.opponent!.trim() : (ex?.opponent ?? "Friendly");
    payload.competition = has(f.competition) ? f.competition!.trim() : (ex?.competition ?? "Friendly");
    payload.is_home = f.isHome != null ? !!f.isHome : (ex?.is_home ?? true);
    if (has(f.kickoff)) payload.kickoff_time = f.kickoff!.trim(); else if (ex?.kickoff_time != null) payload.kickoff_time = ex.kickoff_time;
    const { error } = await ctx.sb.from("match_schedule").upsert(payload, { onConflict: "team_id,match_date" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, fixture: f.date, created: !ex });
  }

  // Legacy alias — the pre-season "add friendly" input routes through the same match_schedule write.
  if (typeof body.addFriendly === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.addFriendly)) {
    const { error } = await ctx.sb.from("match_schedule").upsert({ team_id: ctx.teamId, match_date: body.addFriendly, competition: "Friendly", opponent: body.opponent ?? "Friendly", is_home: true }, { onConflict: "team_id,match_date" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, addedFriendly: body.addFriendly });
  }

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
