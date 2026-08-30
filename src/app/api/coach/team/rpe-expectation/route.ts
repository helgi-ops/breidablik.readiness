/**
 * GET /api/coach/team/rpe-expectation?date=YYYY-MM-DD
 *
 * Yesterday's sRPE (CR10) per player + yesterday's MD-day, so the Decision Summary
 * can flag whether the session's intensity landed where the coach intended for that
 * MD-day (conditioned on match minutes, resolved client-side from the same source
 * that feeds `_yesterday_match_minutes`). The status/verdict itself is computed by
 * the pure `evaluateRpeExpectation` engine — this route only supplies the raw inputs.
 *
 * DESCRIPTIVE planning-feedback only — never reads or writes the readiness colour.
 *
 * Response: { ok, sessionDate, mdDay, byPlayer: { [playerId]: number } }  // number = sRPE
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ ok: true, sessionDate: null, mdDay: null, byPlayer: {} });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const todayIso = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const yd = new Date(`${todayIso}T00:00:00Z`);
  yd.setUTCDate(yd.getUTCDate() - 1);
  const yesterday = yd.toISOString().slice(0, 10);

  // MD-day for yesterday. PRIMARY: v_training_day_context (respects the coach's
  // Week setup; has MD+1/MD+2). FALLBACK: derive from match_schedule timing, which
  // is ground truth and far more widely populated than the (sparse) day-context view.
  let mdDay: string | null = null;
  try {
    const { data: wsIds } = await supabase.from("week_setups").select("id").eq("team_id", teamId);
    const ids = (wsIds ?? []).map((w) => (w as { id: string }).id);
    if (ids.length > 0) {
      const { data: ctx } = await supabase
        .from("v_training_day_context").select("md_day")
        .in("week_setup_id", ids).eq("date", yesterday).limit(1).maybeSingle();
      const md = (ctx as { md_day: string | null } | null)?.md_day ?? null;
      if (md && md !== "OTHER") mdDay = md;
    }
  } catch { /* fall through to match-derived */ }

  if (!mdDay) {
    // Match-derived: a match 1-2 days BEFORE yesterday → MD+1/MD+2 (recovery window,
    // where the top-up flag lives); else the NEXT match 1-4 days AFTER → MD-1..MD-4;
    // yesterday itself a match → MD.
    const dayMs = 86_400_000;
    const yMs = Date.parse(`${yesterday}T00:00:00Z`);
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const { data: matches } = await supabase
      .from("match_schedule").select("match_date")
      .eq("team_id", teamId).gte("match_date", iso(yMs - 3 * dayMs)).lte("match_date", iso(yMs + 4 * dayMs));
    let best: string | null = null; let bestRank = 99;
    for (const m of (matches ?? []) as Array<{ match_date: string | null }>) {
      if (!m.match_date) continue;
      const delta = Math.round((Date.parse(`${m.match_date}T00:00:00Z`) - yMs) / dayMs);
      let tag: string | null = null; let rank = 99;
      if (delta === 0) { tag = "MD"; rank = 0; }
      else if (delta === -1) { tag = "MD+1"; rank = 1; }
      else if (delta === -2) { tag = "MD+2"; rank = 2; }
      else if (delta >= 1 && delta <= 4) { tag = `MD-${delta}`; rank = 3 + delta; } // prefer post-match tags
      if (tag && rank < bestRank) { best = tag; bestRank = rank; }
    }
    mdDay = best;
  }

  // Yesterday's sRPE per player (CR10) — REAL submissions only. The nightly
  // rpe-autofill cron fills forgotten check-ins with the team average
  // (source='auto_fill') or a 10-day median (source='imputed'); those are not the
  // player's own effort, so this planning-feedback flag must ignore them (a
  // forgotten RPE reads as "not logged", never a fabricated over/under/top-up).
  const IMPUTED_SOURCES = new Set(["auto_fill", "imputed"]);
  const byPlayer: Record<string, number> = {};
  const { data: rpeRows } = await supabase
    .from("session_rpe_entries").select("player_id, rpe, source")
    .eq("team_id", teamId).eq("session_date", yesterday);
  for (const r of (rpeRows ?? []) as Array<{ player_id: string; rpe: number | null; source: string | null }>) {
    if (r.rpe == null) continue;
    if (r.source && IMPUTED_SOURCES.has(r.source)) continue; // skip auto-filled / imputed
    const pid = String(r.player_id);
    byPlayer[pid] = byPlayer[pid] == null ? r.rpe : Math.max(byPlayer[pid], r.rpe);
  }

  return NextResponse.json({ ok: true, sessionDate: yesterday, mdDay, byPlayer });
}
