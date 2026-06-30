/**
 * /api/coach/load-plan?date=YYYY-MM-DD
 *
 * GET — forward-looking load PLAN for the authenticated coach's team: the
 * recommended session type (mechanical / locomotive / mixed) and per-KPI
 * targets (total distance, HSR, sprint, accel/decel, Player Load, IMA),
 * anchored to the squad's own match demand and the microcycle (MD) day, with
 * acute:chronic context and a readiness modifier. Powers the pre-session card
 * and the AI summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildLoadPlan, type LoadRow } from "@/lib/micropulse/loadPlan";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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

  // Players on the team.
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const playerIds = (players ?? []).map((p) => String((p as { id: string }).id));
  const nameById = new Map<string, string>();
  for (const p of (players ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(String(p.id), (p.full_name ?? "—").trim());
  if (playerIds.length === 0) return NextResponse.json({ error: "No players" }, { status: 400 });

  // MD context for today.
  let mdDay: string | null = null;
  let dayTypeResolved: string | null = null;
  let focusResolved: string | null = null;
  const daysSincePrev: number | null = null;
  const daysToNext: number | null = null;

  // ── PRIMARY source: the coach's manual Week setup (coach_week_setup) — the
  // SAME source the dashboard's "Planned session load" card reads, so the two
  // never disagree. no_match_intents[weekdayIndex] → MD day, focus, day type.
  try {
    // Monday of the session week (UTC, intents are Mon→Sun).
    const sd = new Date(sessionDate + "T00:00:00Z");
    const dow = sd.getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(sd); monday.setUTCDate(sd.getUTCDate() + mondayOffset);
    const weekStart = monday.toISOString().slice(0, 10);
    const idx = dow === 0 ? 6 : dow - 1; // Mon=0..Sun=6

    const { data: cws } = await sb
      .from("coach_week_setup")
      .select("no_match_intents")
      .eq("team_id", teamId)
      .eq("week_start_date", weekStart)
      .maybeSingle();
    const intents = (cws as { no_match_intents: string[] | null } | null)?.no_match_intents;
    const intent = Array.isArray(intents) && intents.length === 7 ? String(intents[idx] ?? "").toUpperCase() : null;
    if (intent) {
      // Canonical Week-setup mapping (matches the Week setup dropdown labels).
      const MD_OF: Record<string, string> = {
        FORCE: "MD-4", NEURAL_VELOCITY: "MD-3", VELOCITY: "MD-2", POLISH_CALM: "MD-2", ACTIVATION: "MD-1",
      };
      if (intent === "GAME") { dayTypeResolved = "GAME"; mdDay = "MD"; }
      else if (intent === "OFF" || intent === "RECOVERY") { dayTypeResolved = "OFF"; }
      else if (MD_OF[intent]) { mdDay = MD_OF[intent]; focusResolved = intent; }
    }
  } catch { /* fall through to legacy / baseline */ }

  // ── FALLBACK: legacy match-relative day context, only if Week setup gave nothing.
  if (!mdDay && !dayTypeResolved) {
    try {
      const { data: wsIds } = await sb.from("week_setups").select("id").eq("team_id", teamId);
      const ids = (wsIds ?? []).map((w) => (w as { id: string }).id);
      if (ids.length > 0) {
        const { data: ctx } = await sb
          .from("v_training_day_context")
          .select("md_day, week_setup_id")
          .in("week_setup_id", ids)
          .eq("date", sessionDate)
          .limit(1)
          .maybeSingle();
        if (ctx) mdDay = (ctx as { md_day: string | null }).md_day ?? null;
      }
    } catch { /* no MD context — plan falls back gracefully */ }
  }

  // Allow explicit overrides from the caller (e.g. the dashboard passing its
  // already-resolved MD), otherwise use what we resolved above.
  mdDay = url.searchParams.get("mdDay") ?? mdDay;
  const dayType = url.searchParams.get("dayType") ?? dayTypeResolved;
  const focus = url.searchParams.get("focus") ?? focusResolved;

  // GPS over the lookback window (120 days for a robust match reference).
  // NOTE: PostgREST caps a single response at 1000 rows. A full squad over 120
  // days exceeds that, and ordering ascending would silently drop the MOST
  // RECENT dates (exactly the recent-baseline window). So we PAGE through every
  // row with .range() and assemble the complete set.
  const from = addDaysISO(sessionDate, -120);
  const SELECT_COLS = "player_id, date, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_fr_band58_total_distance, ima_accel, ima_decel, jumps, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, high_speed_distance, sprint_distance, accel_decel_efforts";
  const PAGE = 1000;
  const loadRows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error: loadErr } = await sb
      .from("player_external_load_daily")
      .select(SELECT_COLS)
      .in("source", ["catapult", "manual"])
      .in("player_id", playerIds)
      .gte("date", from)
      .lte("date", sessionDate)
      .order("date")
      .range(offset, offset + PAGE - 1);
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!page || page.length === 0) break;
    loadRows.push(...(page as Array<Record<string, unknown>>));
    if (page.length < PAGE) break;
  }

  // Squad readiness check-ins today (canonical v8 view). Drives the modifier
  // AND the "Top attention today" list. Only meaningful for today's date.
  type RdRow = {
    player_id: string; full_name: string | null; final_color: string | null; final_reason: string | null;
    total_score: number | null; fatigue_energy: number | null; sleep_quality: number | null;
    sleep_duration: number | null; stress_mood: number | null; muscle_soreness: number | null;
  };
  let readiness: { green: number; yellow: number; red: number } | null = null;
  let readinessRows: RdRow[] = [];
  if (sessionDate === today) {
    try {
      // NOTE: v_coach_readiness_today_v8 is actually a HISTORICAL view (one row
      // per player per day), so we MUST scope to today's entry_date — otherwise
      // every past check-in is counted.
      const { data: rd } = await sb
        .from("v_coach_readiness_today_v8")
        .select("player_id, full_name, final_color, final_reason, total_score, fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness")
        .eq("team_id", teamId)
        .eq("entry_date", sessionDate);
      // De-dupe to one row per player (latest wins if the view ever returns dupes).
      const seen = new Set<string>();
      readinessRows = ((rd ?? []) as RdRow[]).filter((r) => {
        if (seen.has(r.player_id)) return false;
        seen.add(r.player_id);
        return true;
      });
      if (readinessRows.length > 0) {
        const r = { green: 0, yellow: 0, red: 0 };
        for (const row of readinessRows) {
          const c = String(row.final_color ?? "").toLowerCase();
          if (c === "green") r.green++; else if (c === "yellow") r.yellow++; else if (c === "red") r.red++;
        }
        if (r.green + r.yellow + r.red > 0) readiness = r;
      }
    } catch { /* readiness optional */ }
  }

  // Recent RPE pattern (last 4 weeks, real submissions before today) — lets the
  // engine estimate an expected session-RPE when there is no MD prescription.
  let recentRpe: { avgRpe: number | null; avgDuration: number | null; n: number } | null = null;
  try {
    const rpeFrom = addDaysISO(sessionDate, -28);
    const { data: rpeRows } = await sb
      .from("session_rpe_entries")
      .select("rpe, duration_minutes, is_imputed")
      .eq("team_id", teamId)
      .gte("session_date", rpeFrom)
      .lt("session_date", sessionDate);
    const real = ((rpeRows ?? []) as Array<{ rpe: number | null; duration_minutes: number | null; is_imputed: boolean | null }>)
      .filter((r) => !r.is_imputed && r.rpe != null);
    if (real.length > 0) {
      const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
      const rpes = real.map((r) => Number(r.rpe)).filter((v) => Number.isFinite(v) && v > 0);
      const durs = real.map((r) => Number(r.duration_minutes)).filter((v) => Number.isFinite(v) && v > 0);
      recentRpe = { avgRpe: avg(rpes), avgDuration: avg(durs), n: real.length };
    }
  } catch { /* RPE target is optional */ }

  const plan = buildLoadPlan({
    sessionDate,
    mdDay,
    dayType,
    focus,
    daysSincePrev,
    daysToNext,
    rows: ((loadRows ?? []) as unknown as LoadRow[]),
    nameById,
    readiness,
    recentRpe,
  });

  // ── Top attention today — checked-in players flagged red/yellow, enriched
  // with their load ACWR. The coach's "who do I watch" list before the session.
  const acwrByPid = new Map<string, { acwr: number | null; flag: string }>();
  for (const pp of plan.perPlayer) acwrByPid.set(pp.player_id, { acwr: pp.acwr, flag: pp.flag });
  const SUB_LABEL: Record<string, string> = {
    fatigue_energy: "energy", sleep_quality: "sleep quality",
    sleep_duration: "sleep length", stress_mood: "stress / mood", muscle_soreness: "soreness",
  };
  // The lowest 1-5 markers (only those at/below 3 — 4-5 are fine), worst first.
  const lowMarkers = (r: RdRow): Array<{ label: string; value: number }> => {
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
    ? { ...readiness, checkedIn: readinessRows.length, rosterWithGps: playerIds.length }
    : null;

  return NextResponse.json({ plan: { ...plan, teamName }, readiness: readinessSummary, topAttention });
}
