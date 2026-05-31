/**
 * /api/client/hero
 *
 * One round-trip "Am I progressing?" summary for the athlete's Today hero.
 * Everything is derived from data already collected (check-ins, set logs, load)
 * — no new manual input. Each number carries its own provenance + a confidence
 * gate, and the streak is a CONSISTENCY (check-in) streak, not "train every
 * day" (which would fight readiness-driven autoregulation).
 *
 * Shape:
 *   { ok, baseline, days_with_data,
 *     consistency: { checkin_streak, compliance_pct, sessions_this_month },
 *     strength:    { pct|null, top: [{label}], confident },
 *     fitness:     { pct|null, note, confident },
 *     confidence:  { level, reason },
 *     insight:     { text, signals: [] },
 *     focus:       string|null }
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { computeLoadQuadrant } from "@/lib/client/loadQuadrant";
import { canonicalLift } from "@/lib/client/oneRepMax";
import { e1rmFromSet } from "@/lib/client/oneRepMaxFormulas";
import { computePersonalRecords } from "@/lib/client/personalRecords";
import { getClientBreakRanges, dateInRanges } from "@/lib/notifications/clientBreaks";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

function iso(offsetDaysAgo: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - offsetDaysAgo);
  return d.toISOString().slice(0, 10);
}
export async function GET(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: pRow } = await sb.from("players").select("id, full_name").eq("user_id", u.user.id).maybeSingle();
  if (!pRow) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  const player = pRow as { id: string; full_name: string | null };
  const today = new Date().toISOString().slice(0, 10);

  // ── Check-ins (consistency) ───────────────────────────────────────
  const { data: checkRows } = await sb
    .from("readiness_entries")
    .select("entry_date, total_score")
    .eq("player_id", player.id)
    .gte("entry_date", iso(59))
    .order("entry_date", { ascending: false });
  const checks = ((checkRows ?? []) as Array<{ entry_date: string; total_score: number | null }>);
  const checkDates = new Set(checks.map((c) => c.entry_date));

  // Declared vacation days — excluded from streak & compliance (no penalty).
  const breakRanges = await getClientBreakRanges(sb, player.id, iso(59));
  const isVac = (d: string) => dateInRanges(d, breakRanges);

  // Streak = consecutive check-in days walking back from today; a vacation day
  // is neutral (neither counts nor breaks), and today-not-done-yet doesn't break.
  let checkinStreak = 0;
  for (let i = 0; i < 120; i++) {
    const d = iso(i);
    if (isVac(d)) continue;                       // on vacation — skip
    if (checkDates.has(d)) { checkinStreak++; continue; }
    if (i === 0) continue;                         // today still pending
    break;                                         // a real miss — stop
  }
  const checkins28 = checks.filter((c) => c.entry_date >= iso(27)).length;
  let vacDays28 = 0;
  for (let i = 0; i < 28; i++) { if (isVac(iso(i))) vacDays28++; }
  const compliancePct = Math.round((checkins28 / Math.max(1, 28 - vacDays28)) * 100);

  // ── Logged sessions (workouts) ────────────────────────────────────
  const { data: setRows } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps, rpe")
    .eq("player_id", player.id)
    .gte("session_date", iso(59));
  const sets = ((setRows ?? []) as Array<{ session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; rpe: number | null }>);
  const sessionDates = new Set(sets.map((s) => s.session_date));
  const monthStart = today.slice(0, 8) + "01";
  const sessionsThisMonth = new Set(sets.filter((s) => s.session_date >= monthStart).map((s) => s.session_date)).size;
  const workouts28 = new Set(sets.filter((s) => s.session_date >= iso(27)).map((s) => s.session_date)).size;

  // ── Strength % (e1RM: recent 14d best vs prior 15-60d best, per lift) ──
  const recentBest = new Map<string, number>();
  const priorBest = new Map<string, number>();
  for (const s of sets) {
    if (s.weight_kg == null || s.reps == null) continue;
    const lift = canonicalLift(s.exercise_name);
    if (!lift) continue;
    const e = e1rmFromSet(s.weight_kg, s.reps, s.rpe);
    const m = s.session_date >= iso(13) ? recentBest : (s.session_date <= iso(14) ? priorBest : null);
    if (!m) continue;
    if (!m.has(lift) || e > (m.get(lift) ?? 0)) m.set(lift, e);
  }
  const liftPcts: number[] = [];
  const topDeltas: Array<{ label: string; delta: number }> = [];
  for (const [lift, recent] of recentBest) {
    const prior = priorBest.get(lift);
    if (!prior || prior <= 0) continue;
    liftPcts.push((recent - prior) / prior);
    topDeltas.push({ label: lift, delta: recent - prior });
  }
  const strengthPct = liftPcts.length > 0
    ? Math.round((liftPcts.reduce((x, y) => x + y, 0) / liftPcts.length) * 1000) / 10
    : null;
  const top = topDeltas
    .filter((d) => d.delta > 0)
    .sort((x, y) => y.delta - x.delta)
    .slice(0, 2)
    .map((d) => ({ label: `${d.label} +${(Math.round(d.delta / 2.5) * 2.5).toFixed(1)} kg` }));

  // ── Fitness % (chronic load trend) from the load quadrant ─────────
  const q = await computeLoadQuadrant(sb, player.id);
  const fitnessPct = q.older_chronic > 0
    ? Math.round(((q.chronic_daily - q.older_chronic) / q.older_chronic) * 100)
    : null;
  const fitnessConfident = q.confidence !== "low";

  // ── Confidence (tracking confidence: data sufficiency) ────────────
  let level: "HIGH" | "MODERATE" | "LOW" = "LOW";
  if (checkins28 >= 20 && workouts28 >= 8) level = "HIGH";
  else if (checkins28 >= 10 || workouts28 >= 4) level = "MODERATE";
  const reason = `${checkins28} check-ins and ${workouts28} sessions logged in the last 28 days (${compliancePct}% check-in compliance).`;

  // ── Baseline gate + profile confidence (how "warmed up" the data is) ──
  const activeDays = new Set<string>([...checkDates, ...sessionDates].filter((d) => d >= iso(27))).size;
  const baseline = activeDays < 7;
  // Blend three logging dimensions toward "fully personalised" targets so the
  // bar rewards consistent logging across check-ins, sessions and days.
  const profileConfidencePct = Math.round(
    ((Math.min(1, activeDays / 14) + Math.min(1, checkins28 / 14) + Math.min(1, workouts28 / 8)) / 3) * 100,
  );

  // ── Readiness trend (for the insight) ─────────────────────────────
  const recentScores = checks.slice(0, 4).map((c) => c.total_score).filter((x): x is number => x != null);
  let readinessTrend: "up" | "down" | "flat" = "flat";
  if (recentScores.length >= 3) {
    const first = recentScores[recentScores.length - 1];
    const last = recentScores[0];
    if (last - first >= 2) readinessTrend = "up";
    else if (first - last >= 2) readinessTrend = "down";
  }

  // ── Today's focus (active explosive programme) ────────────────────
  const { data: assign } = await sb
    .from("pt_explosive_programme_assignments")
    .select("programme_key, level, current_phase")
    .eq("client_id", player.id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let focus: string | null = null;
  if (assign) {
    const ag = assign as { programme_key: string; level: string; current_phase: number };
    const { data: ph } = await sb
      .from("pt_explosive_programmes")
      .select("programme_name, phase_name, focus")
      .eq("programme_key", ag.programme_key).eq("level", ag.level).eq("phase", ag.current_phase)
      .maybeSingle();
    const p = ph as { programme_name: string | null; phase_name: string | null } | null;
    focus = p?.programme_name ?? p?.phase_name ?? null;
  }

  // ── Most recent personal best (last 7 days) for a celebration ────
  const { recent_prs } = await computePersonalRecords(sb, player.id);
  const freshPr = recent_prs.find((p) => p.date >= iso(6)) ?? null;
  const pr = freshPr
    ? { exercise: freshPr.exercise, e1rm: freshPr.e1rm, delta_kg: freshPr.delta_kg, date: freshPr.date }
    : null;

  // ── Insight (rule-based, explainable, cites the deciding signal) ──
  const signals: string[] = [];
  let text: string;
  if (baseline) {
    text = "Keep logging your check-ins and sessions — personalised insights unlock in a week or two.";
    signals.push(`${activeDays} active days so far`);
  } else if (readinessTrend === "down") {
    text = "Recovery has been trending down — prioritise sleep and keep intensity in check.";
    signals.push("readiness ↓ over recent check-ins");
  } else if (q.acwr != null && q.acwr > 1.3) {
    text = "Training load is climbing fast — stay on top of recovery this week.";
    signals.push(`load ratio ${q.acwr}`);
  } else if (strengthPct != null && strengthPct > 0) {
    text = "Strength is trending up and load is balanced — your progression is on target.";
    signals.push(`strength +${strengthPct}%`);
    if (q.acwr != null) signals.push(`load ratio ${q.acwr}`);
  } else if (compliancePct >= 75) {
    text = "Consistency has been excellent — keep showing up and the gains will follow.";
    signals.push(`${compliancePct}% check-in compliance`);
  } else {
    text = "Steady work. Keep your check-ins and sessions consistent to drive progress.";
    signals.push(`${compliancePct}% check-in compliance`);
  }

  return NextResponse.json({
    ok: true,
    greeting_name: (player.full_name ?? "").split(" ")[0] || null,
    baseline,
    days_with_data: activeDays,
    profile_confidence_pct: profileConfidencePct,
    consistency: { checkin_streak: checkinStreak, compliance_pct: compliancePct, sessions_this_month: sessionsThisMonth },
    strength: { pct: strengthPct, top, confident: strengthPct != null },
    fitness: { pct: fitnessPct, confident: fitnessConfident },
    confidence: { level, reason },
    insight: { text, signals },
    focus,
    pr,
  });
}
