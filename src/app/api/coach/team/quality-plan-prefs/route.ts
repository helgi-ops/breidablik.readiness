/**
 * /api/coach/team/quality-plan-prefs — the coach's current team's level and exercise swaps for the Programme Library
 * "Speed & power" plans (lota 4, step 3).
 *
 * GET   { ok, prefs: { [quality]: { level, swaps, updatedAt, updatedBy } } } — qualities never saved are left out.
 * POST  { quality, level?, swaps? } → saves that quality (level and/or the full swap set) and returns its row.
 *
 * Coach of the team only (requireCoachAccessForTeam; the team is read on the server, never from the body).
 * Level and swaps are checked against the registry (goalPlan/levels.ts, goalPlan/swaps.ts) before they are saved.
 * Library settings only: player goal plans never read them. FREE-locked teams get 402.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GOAL_QUALITIES, type GoalQuality } from "@/lib/micropulse/goalPlan/types";
import { DEFAULT_LEVEL, isTrainingLevel, type TrainingLevel } from "@/lib/micropulse/goalPlan/levels";
import { validateSwaps, type SwapChoices } from "@/lib/micropulse/goalPlan/swaps";

export const runtime = "nodejs";

type Row = { quality: string; level: string; swaps: unknown; updated_by: string | null; updated_at: string };
type Pref = { level: TrainingLevel; swaps: SwapChoices; updatedAt: string; updatedBy: string | null };

const isQuality = (q: unknown): q is GoalQuality => typeof q === "string" && (GOAL_QUALITIES as string[]).includes(q);

async function names(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await sb.from("profiles").select("id, full_name, display_name").in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null; display_name: string | null }[]).map((p) => [
      p.id,
      (p.full_name || p.display_name || "").trim(),
    ]),
  );
}

async function toPrefs(sb: SupabaseClient, rows: Row[]): Promise<Partial<Record<GoalQuality, Pref>>> {
  const who = await names(sb, [...new Set(rows.map((r) => r.updated_by).filter((x): x is string => !!x))]);
  const out: Partial<Record<GoalQuality, Pref>> = {};
  for (const r of rows) {
    if (!isQuality(r.quality)) continue;
    out[r.quality] = {
      level: isTrainingLevel(r.level) ? r.level : DEFAULT_LEVEL,
      // A slot or option removed from the registry later is dropped, never shown.
      swaps: validateSwaps(r.quality, r.swaps) ?? {},
      updatedAt: r.updated_at,
      updatedBy: r.updated_by ? who.get(r.updated_by) || null : null,
    };
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const { data, error } = await sb
      .from("team_quality_plan_prefs")
      .select("quality, level, swaps, updated_by, updated_at")
      .eq("team_id", teamId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, prefs: await toPrefs(sb, (data ?? []) as Row[]) });
  } catch (e) {
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId, coachUserId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { quality?: unknown; level?: unknown; swaps?: unknown } | null;
    if (!body || !isQuality(body.quality)) return NextResponse.json({ error: "Unknown quality" }, { status: 400 });
    const quality = body.quality;
    if (body.level !== undefined && !isTrainingLevel(body.level)) {
      return NextResponse.json({ error: "Unknown level" }, { status: 400 });
    }
    let swaps: SwapChoices | undefined;
    if (body.swaps !== undefined) {
      const v = validateSwaps(quality, body.swaps);
      if (!v) return NextResponse.json({ error: "Unknown swap" }, { status: 400 });
      swaps = v;
    }
    if (body.level === undefined && swaps === undefined) {
      return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    }

    // Keep the field not sent as it is.
    const { data: cur, error: curErr } = await sb
      .from("team_quality_plan_prefs")
      .select("level, swaps")
      .eq("team_id", teamId)
      .eq("quality", quality)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    const prev = cur as { level: string; swaps: unknown } | null;

    const row = {
      team_id: teamId,
      quality,
      level: (body.level as TrainingLevel | undefined) ?? (prev && isTrainingLevel(prev.level) ? prev.level : DEFAULT_LEVEL),
      swaps: swaps ?? (prev ? validateSwaps(quality, prev.swaps) ?? {} : {}),
      updated_by: coachUserId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb
      .from("team_quality_plan_prefs")
      .upsert(row, { onConflict: "team_id,quality" })
      .select("quality, level, swaps, updated_by, updated_at")
      .eq("team_id", teamId)
      .single();
    if (error) throw new Error(error.message);
    const prefs = await toPrefs(sb, [data as Row]);
    return NextResponse.json({ ok: true, quality, pref: prefs[quality] ?? null });
  } catch (e) {
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
