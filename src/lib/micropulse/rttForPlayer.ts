import "server-only";

/**
 * Shared return-to-training computation for ONE player — used by the per-player
 * route (full page) and the team summary endpoint (post-training report). It
 * assembles injury windows, match dates, sessions, variant and layoff exactly
 * as the page does, then runs the pure engine. Keeping it in one place means the
 * report and the page can never drift.
 */

import { computeReturnToTraining, injuryRiskProfile, type RttSession, type RttResult } from "./returnToTraining";
import { ageYears as deriveAgeYears } from "@/lib/legal/age";
import { oneRowPerDate } from "./load/oneRowPerDate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accept any Supabase client (admin or server)
type Sb = any;

export type RttWin = { start: string; end: string; type: string; source: "injury_events" | "player_injuries"; isActive: boolean };

export type RttForPlayer = {
  sessions: RttSession[];
  windows: RttWin[];
  currentlyInjured: boolean;
  rtp: { status: string; stage: number } | null;
  headInjury: boolean;
  injuryDiscrepancy: boolean;
  injuryProfile: ReturnType<typeof injuryRiskProfile>;
  rttStartDate: string | null;
  savedOverrides: unknown;
  variant: "ima" | "gps";
  layoffDays: number | null;
  result: RttResult;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const clampSpeed = (v: unknown) => { const n = num(v); return n > 0 && n <= 45 ? n : 0; };
const inWindow = (d: string, w: RttWin) => d >= w.start && d <= w.end;

export async function buildRttForPlayer(sb: Sb, playerId: string, teamId: string, windowDays: number): Promise<RttForPlayer> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(0, 10);

  // ── Injury windows (union of both tables) ──────────────────────────────
  const [ieRes, piRes, playerRes] = await Promise.all([
    sb.from("injury_events").select("injury_date, injury_type, body_side, return_date, is_active").eq("player_id", playerId),
    sb.from("player_injuries").select("injury_date, injury_type, status, rtp_stage, estimated_return_date, actual_return_date").eq("player_id", playerId),
    // DOB only, for the age factor. Never logged; only the derived age is used.
    sb.from("players").select("date_of_birth").eq("id", playerId).maybeSingle(),
  ]);
  const windows: RttWin[] = [];
  // player_injuries (the RTP workflow) is AUTHORITATIVE — active = status !== "cleared".
  // A passed estimated return date does NOT close an injury. injury_events.is_active
  // can be stale, so it only marks "active" for players with no RTP record.
  const hasPi = (piRes.data ?? []).length > 0;
  for (const r of (ieRes.data ?? []) as Array<{ injury_date: string; injury_type: string | null; body_side: string | null; return_date: string | null; is_active: boolean | null }>) {
    if (!r.injury_date) continue;
    const ieOpen = r.is_active !== false && (!r.return_date || r.return_date >= now);
    windows.push({ start: r.injury_date, end: ieOpen ? now : (r.return_date ?? now), type: r.injury_type ?? "injury", source: "injury_events", isActive: !hasPi && ieOpen });
  }
  for (const r of (piRes.data ?? []) as Array<{ injury_date: string; injury_type: string | null; status: string | null; actual_return_date: string | null; estimated_return_date: string | null }>) {
    if (!r.injury_date) continue;
    const open = r.status !== "cleared" && !r.actual_return_date;
    const end = open ? now : (r.actual_return_date ?? r.estimated_return_date ?? now);
    windows.push({ start: r.injury_date, end, type: r.injury_type ?? "injury", source: "player_injuries", isActive: open });
  }
  const currentlyInjured = windows.some((w) => w.isActive);

  const activePi = ((piRes.data ?? []) as Array<{ injury_date: string; status: string | null; rtp_stage: number | null; actual_return_date: string | null }>)
    .filter((r) => r.status !== "cleared" && !r.actual_return_date)
    .sort((a, b) => (b.injury_date ?? "").localeCompare(a.injury_date ?? ""))[0];
  const rtp = activePi ? { status: activePi.status ?? "injured", stage: Number(activePi.rtp_stage ?? 0) } : null;

  const headInjury = windows.some((w) => /concuss|head|hia|heilahrist|höfu|hofu|hnakk/i.test(w.type) && (w.isActive || w.end >= since));
  const typesByStart = new Map<string, Set<string>>();
  for (const w of windows) { const s = typesByStart.get(w.start) ?? new Set(); s.add(w.type.toLowerCase()); typesByStart.set(w.start, s); }
  const injuryDiscrepancy = [...typesByStart.values()].some((s) => s.size > 1);

  // ── Match dates ─────────────────────────────────────────────────────────
  const [schedRes, minRes] = await Promise.all([
    sb.from("match_schedule").select("match_date, opponent").eq("team_id", teamId),
    sb.from("match_player_minutes").select("match_date").eq("player_id", playerId),
  ]);
  const matchDates = new Set<string>();
  for (const s of (schedRes.data ?? []) as Array<{ match_date: string; opponent: string | null }>) if ((s.opponent ?? "").trim() !== "") matchDates.add(s.match_date);
  for (const m of (minRes.data ?? []) as Array<{ match_date: string }>) matchDates.add(m.match_date);

  // ── Sessions ──────────────────────────────────────────────────────────────
  const { data: load } = await sb
    .from("player_external_load_daily")
    .select("date, source, total_player_load, total_distance, high_speed_distance, sprint_distance, velocity_band6_total_distance, ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, ima_accel, ima_decel, ima_band3_decel_count, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, accel_decel_efforts, max_velocity, raw_payload_json")
    /* stride bands: band 6 = sub-maximal high cadence, bands 7+8 = top velocity */
    .eq("player_id", playerId).in("source", ["catapult", "manual"]).gte("date", since).order("date");

  // One row per date: a coach's MANUAL GPS entry (forgot / broken pod) overrides
  // the catapult reading for the same day, so RTT reflects the correction instead
  // of the bogus pod value. Without this, manually-entered numbers were dropped
  // (the query used to read source='catapult' only).
  const dedupLoad = oneRowPerDate(
    (load ?? []) as Array<Record<string, unknown> & { date: string; source?: string | null }>,
  );

  const sessions: RttSession[] = dedupLoad.map((r) => {
    const date = String(r.date);
    // L/R totals (all bands) — only used for the CoD asymmetry ratio, where a
    // stable left-vs-right balance wants the full event count.
    const codLeft = num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low);
    const codRight = num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
    // The RTT change-of-direction QUALITY is the LAST, most re-injury-prone gate,
    // so it must count only HIGH-INTENSITY cuts — the high + medium bands. The low
    // band is gentle direction drift that even a jogging session logs in the
    // thousands (e.g. a rehab jog: high 0, medium 1, low ~2300), which would
    // otherwise make a player who has only jogged look "done" with CoD. High+medium
    // is the cutting load that actually re-loads a groin/knee/ankle.
    const cod =
      num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) +
      num(r.ima_cod_right_high) + num(r.ima_cod_right_medium);
    return {
      date,
      injured: windows.some((w) => inWindow(date, w)),
      isMatch: matchDates.has(date),
      estimated: !!(r.raw_payload_json as { estimated?: boolean } | null)?.estimated,
      load: num(r.total_player_load),
      distance: num(r.total_distance),
      hsr: num(r.high_speed_distance),
      sprint: num(r.sprint_distance) || num(r.velocity_band6_total_distance),
      // High-cadence running from IMA Free Running (IMU stride-rate), split so
      // TOP VELOCITY gets its own graded ramp. Stride COUNT (not distance) —
      // band-level distance is only populated on a minority of rows, count is the
      // robust signal. Indoor-capable, so both stay valid on GPS-less rehab
      // sessions (not gated by gpsValid). band 6 = sub-maximal; bands 7+8 = top.
      stride: num(r.ima_fr_band6_stride_count),
      strideTop: num(r.ima_fr_band7_stride_count) + num(r.ima_fr_band8_stride_count),
      accel: num(r.ima_accel),
      decel: num(r.ima_decel),
      decelHigh: num(r.ima_band3_decel_count),
      cod,
      codLeft,
      codRight,
      efforts: num(r.accel_decel_efforts),
      topSpeed: clampSpeed(r.max_velocity),
      // A pod that logged PlayerLoad but got no GPS lock (indoor/gym) reads ~0 m.
      // Mark it so the ramp ignores its bogus distance/HSR/sprint (~1 m) — the
      // PlayerLoad/IMA still count. 50 m = well below any real running session.
      gpsValid: num(r.total_distance) >= 50,
    };
  });

  const realSess = sessions.filter((s) => !s.estimated);
  const imaCount = realSess.filter((s) => s.accel > 0 || s.decel > 0 || s.decelHigh > 0 || s.cod > 0 || s.stride > 0 || s.strideTop > 0).length;
  const effortsCount = realSess.filter((s) => s.efforts > 0).length;
  const variant: "ima" | "gps" = imaCount > 0 && imaCount >= effortsCount ? "ima" : effortsCount > 0 ? "gps" : "ima";

  const { data: saved } = await sb.from("rtt_plans").select("rtt_start_date, weeks, overrides").eq("player_id", playerId).maybeSingle();
  const rttStartDate = (saved as { rtt_start_date?: string | null } | null)?.rtt_start_date ?? null;
  const savedOverrides = (saved as { overrides?: unknown } | null)?.overrides ?? [];

  const activeWins = windows.filter((w) => w.isActive);
  const activeTypes = activeWins.map((w) => w.type);
  const recentWin = [...windows].sort((a, b) => b.start.localeCompare(a.start))[0];
  const profile = injuryRiskProfile(activeTypes.length ? activeTypes : recentWin ? [recentWin.type] : []);

  const governing = activeWins.sort((a, b) => a.start.localeCompare(b.start))[0] ?? recentWin;
  const layoffEnd = rttStartDate ?? (governing && !currentlyInjured ? governing.end : now);
  const layoffDays = governing ? Math.max(0, Math.round((Date.parse(layoffEnd) - Date.parse(governing.start)) / 86400000)) : null;

  // ── Gabbett 2020 tolerance factors ─────────────────────────────────────────
  // Facts are gathered here (they need the DB); the RULE that turns them into a
  // ramp rate lives in the pure engine, so it stays one transparent, testable place.
  const ieRows = (ieRes.data ?? []) as Array<{ injury_date: string; injury_type: string | null; body_side: string | null }>;
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const injuriesLast12Months = ieRows.filter((r) => r.injury_date && r.injury_date >= yearAgo).length;

  // A prior injury to the SAME region as the one he's returning from — matched by
  // the engine's own type→category map, so there is no second mapping to drift.
  const priorSameRegion = (() => {
    if (profile.category === "general" || profile.category === "head") return null;
    const priors = ieRows
      .filter((r) => r.injury_date && r.injury_date !== governing?.start) // not the current one
      .filter((r) => injuryRiskProfile([r.injury_type ?? ""]).category === profile.category)
      .sort((a, b) => b.injury_date.localeCompare(a.injury_date));
    const p = priors[0];
    if (!p) return null;
    const side = p.body_side && p.body_side !== "na" ? `${p.body_side} ` : "";
    return { when: p.injury_date, label: `${side}${profile.category}` };
  })();

  const ageYears = deriveAgeYears(
    (playerRes.data as { date_of_birth?: string | null } | null)?.date_of_birth ?? null,
  ); // null = DOB unknown → not a factor; the gap is reported by data-quality

  const result = computeReturnToTraining({
    sessions, refDate: now, rttStartDate, currentlyInjured, layoffDays, headInjury,
    riskQualities: profile.riskQualities, variant,
    caution: { priorSameRegion, injuriesLast12Months, ageYears },
  });

  // Fold IMA-only risk qualities into "efforts" on the GPS variant so the UI
  // references qualities that exist in the plan.
  const IMA_ONLY = new Set(["accel", "decel", "decelHigh", "cod"]);
  const riskForVariant = variant === "gps"
    ? Array.from(new Set(profile.riskQualities.map((q) => (IMA_ONLY.has(q) ? "efforts" : q)))).filter((q) => result.qualityOrder.includes(q as never))
    : profile.riskQualities;

  return {
    sessions, windows, currentlyInjured, rtp, headInjury, injuryDiscrepancy,
    injuryProfile: { ...profile, riskQualities: riskForVariant as typeof profile.riskQualities },
    rttStartDate, savedOverrides, variant, layoffDays, result,
  };
}

/** How many TRAINING sessions the coach has planned for THIS calendar week
 *  (Mon–Sun), read from Week setup (v_week_plan_grid). Excludes OFF / RECOVERY
 *  / GAME (and unstructured "Other") days. null when this week isn't structured
 *  — callers then fall back to an estimate. Shared by the coach + player RTT
 *  endpoints so both derive "today" the same way. */
export async function plannedSessionsThisWeek(sb: Sb, teamId: string): Promise<number | null> {
  const now = new Date();
  const dow = now.getUTCDay(); // 0 Sun … 6 Sat
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((dow + 6) % 7));
  const mondayIso = monday.toISOString().slice(0, 10);

  const { data: ws } = await sb
    .from("coach_week_setup")
    .select("id")
    .eq("team_id", teamId)
    .eq("week_start_date", mondayIso)
    .maybeSingle();
  const wsId = (ws as { id?: string } | null)?.id;
  if (!wsId) return null;

  const { data: grid } = await sb
    .from("v_week_plan_grid")
    .select("day_type_final, dose_final")
    .eq("week_setup_id", wsId);
  if (!Array.isArray(grid)) return null;

  const OFFISH = new Set(["OFF", "REST", "RECOVERY", "GAME"]);
  let n = 0;
  for (const r of grid as Array<{ day_type_final?: string | null; dose_final?: string | null }>) {
    const dt = String(r.day_type_final ?? "").trim().toUpperCase();
    const dose = String(r.dose_final ?? "").trim().toUpperCase();
    if (OFFISH.has(dt)) continue;
    if (dt === "TRAIN") { n++; continue; }
    if (!dt && dose && !OFFISH.has(dose)) { n++; continue; }
  }
  return n > 0 ? n : null;
}
