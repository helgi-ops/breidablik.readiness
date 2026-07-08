/**
 * /api/coach/load-plan?date=YYYY-MM-DD
 *
 * GET — forward-looking load PLAN for the authenticated coach's team: the
 * recommended session type (mechanical / locomotive / mixed) and per-KPI
 * targets (total distance, HSR, sprint, accel/decel, Player Load, IMA),
 * anchored to the squad's own match demand and the microcycle (MD) day, with
 * acute:chronic context and a readiness modifier. Powers the pre-session card
 * and the AI summary.
 *
 * The plan assembly lives in buildLoadPlanForTeam (shared with the player-facing
 * "today's expected load" card so the two never disagree); this route layers the
 * coach-only "top attention today" list + readiness summary on top.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildLoadPlanForTeam, type ReadinessRow } from "@/lib/micropulse/loadPlan/forTeam";

export const runtime = "nodejs";

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = url.searchParams.get("date");
  const sessionDate = dateParam && isIso(dateParam) ? dateParam : today;

  // Team display name (for the report header / sendable PDF).
  let teamName: string | null = null;
  try {
    const { data: team } = await sb.from("teams").select("name").eq("id", teamId).maybeSingle();
    teamName = (team as { name: string | null } | null)?.name ?? null;
  } catch { /* name is cosmetic */ }

  // Assemble the plan (shared source with the player card). Caller overrides let
  // the dashboard pass its already-resolved MD via query params.
  let built;
  try {
    built = await buildLoadPlanForTeam(sb, teamId, sessionDate, {
      mdDay: url.searchParams.get("mdDay"),
      dayType: url.searchParams.get("dayType"),
      focus: url.searchParams.get("focus"),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Load plan failed" }, { status: 500 });
  }
  if (!built) return NextResponse.json({ error: "No players" }, { status: 400 });
  const { plan, readinessRows, readiness } = built;

  // ── Top attention today — checked-in players flagged red/yellow, enriched
  // with their load ACWR. The coach's "who do I watch" list before the session.
  const acwrByPid = new Map<string, { acwr: number | null; flag: string }>();
  for (const pp of plan.perPlayer) acwrByPid.set(pp.player_id, { acwr: pp.acwr, flag: pp.flag });
  const SUB_LABEL: Record<string, string> = {
    fatigue_energy: "energy", sleep_quality: "sleep quality",
    sleep_duration: "sleep length", stress_mood: "stress / mood", muscle_soreness: "soreness",
  };
  // The lowest 1-5 markers (only those at/below 3 — 4-5 are fine), worst first.
  const lowMarkers = (r: ReadinessRow): Array<{ label: string; value: number }> => {
    const subs: Array<[string, number | null]> = [
      ["fatigue_energy", r.fatigue_energy], ["sleep_quality", r.sleep_quality],
      ["sleep_duration", r.sleep_duration], ["stress_mood", r.stress_mood], ["muscle_soreness", r.muscle_soreness],
    ];
    return (subs.filter(([, v]) => typeof v === "number") as Array<[string, number]>)
      .filter(([, v]) => v <= 3)
      .sort((a, b) => a[1] - b[1])
      .map(([k, v]) => ({ label: SUB_LABEL[k] ?? k, value: v }));
  };
  // Parse the canonical diagnostic string into clean, plain-language signals.
  // (We never surface `final_reason` raw — we translate it.)
  const parseReason = (s: string | null) => {
    const t = s ?? "";
    const num = (re: RegExp): number | null => { const m = t.match(re); return m ? Number(m[1]) : null; };
    return {
      immature: /immature baseline/i.test(t),
      n: num(/n=(\d+)/),
      z: num(/z=(-?[\d.]+)/),
      sten: num(/sten=(\d+)/),
      mean: num(/mean=([\d.]+)/),
      abs: (t.match(/abs=(\w+)/)?.[1] ?? null),
      dev: (t.match(/dev=(\w+)/)?.[1] ?? null),
    };
  };
  const colorRank = (c: string | null) => (String(c).toLowerCase() === "red" ? 0 : String(c).toLowerCase() === "yellow" ? 1 : 2);
  const topAttention = readinessRows
    .filter((r) => { const c = String(r.final_color ?? "").toLowerCase(); return c === "red" || c === "yellow"; })
    .map((r) => {
      const ld = acwrByPid.get(r.player_id);
      const c = String(r.final_color ?? "").toLowerCase();
      const colorWord = c === "red" ? "Red" : "Yellow";
      const pr = parseReason(r.final_reason);
      const markers = lowMarkers(r);

      // Build coach-readable "why" lines (drivers) — translated, never raw.
      const drivers: string[] = [];
      // 1) Primary signal: personal-norm dip vs immature baseline.
      if (pr.immature) {
        drivers.push(`Flagged early — personal baseline still forming${pr.n != null ? ` (${pr.n} check-ins so far)` : ""}; treat as provisional.`);
      } else if (pr.mean != null && r.total_score != null) {
        const sev = pr.z != null && pr.z <= -1.5 ? "well below" : pr.z != null && pr.z <= -0.75 ? "below" : "slightly below";
        drivers.push(`Today's check-in ${r.total_score}/25 is ${sev} his own recent average (~${Math.round(pr.mean)}/25)${pr.sten != null ? `, readiness ${pr.sten}/10` : ""}.`);
      } else if (r.total_score != null) {
        drivers.push(`Today's check-in ${r.total_score}/25.`);
      }
      // 2) If absolute markers are fine but the flag is a personal drop, say so.
      if (!pr.immature && pr.abs && pr.dev && pr.abs.toUpperCase() === "GREEN" && pr.dev.toUpperCase() !== "GREEN") {
        drivers.push("Absolute markers are healthy — the flag is the drop from his usual, not a low score.");
      }
      // 3) Specific low markers.
      if (markers.length) drivers.push(`Lowest markers: ${markers.slice(0, 3).map((m) => `${m.label} ${m.value}/5`).join(", ")}.`);
      // 4) Load context.
      if (ld?.acwr != null && ld.acwr >= 1.3) drivers.push(`Training load already high (ACWR ${ld.acwr.toFixed(2)}) — fatigue may be cumulative.`);

      // One-line summary (chip / fallback).
      const summaryBits = [markers.length ? `${markers[0].label} ${markers[0].value}/5` : (pr.immature ? "early baseline" : "below his usual")];
      if (ld?.acwr != null && ld.acwr >= 1.3) summaryBits.push(`load high (ACWR ${ld.acwr.toFixed(2)})`);
      const reason = `${colorWord} readiness — ${summaryBits.join(" · ")}`;

      return {
        player_id: r.player_id,
        name: (r.full_name ?? "—").trim(),
        color: c,
        score: r.total_score,
        acwr: ld?.acwr ?? null,
        reason,
        drivers,
      };
    })
    .sort((a, b) => colorRank(a.color) - colorRank(b.color) || (a.score ?? 99) - (b.score ?? 99));

  const readinessSummary = readiness
    ? { ...readiness, checkedIn: readinessRows.length, rosterWithGps: plan.coverage.totalPlayers }
    : null;

  return NextResponse.json({ plan: { ...plan, teamName }, readiness: readinessSummary, topAttention });
}
