/**
 * /api/client/today
 *
 * One-shot composer for the PT-client home screen. Returns:
 *   - prescribed: today's workout (from Explosive Power assignment OR
 *                 player-override custom_template OR null)
 *   - readinessToday: whether the client has logged readiness today
 *   - bodyweightToday: latest weight + delta vs 7-day prior
 *   - trainer: name + team for the header
 *
 * Single round trip so /client/today renders fast on mobile.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as admin } from "@/lib/supabaseServer";
import {
  computeFosterMonotonyStrain,
  computeHeavyLiftingExposure,
  forecastPR,
} from "@/lib/trainer/loadIntelligence";
import { resolveProgrammeSlot } from "@/lib/trainer/programmeSchedule";
import { isSeasonPhase, SEASON_PHASE_SPEC, type SeasonPhase } from "@/lib/client/seasonPhase";
import { computeGameTaper } from "@/lib/client/gameTaper";
import { buildOneRmMap, canonicalLift, isStale, type LvTest } from "@/lib/client/oneRepMax";
import { computeWorkingOneRm, workingTargetKg, type SetLogRow } from "@/lib/client/workingOneRm";
import { e1rmFromSet } from "@/lib/client/oneRepMaxFormulas";
import { zoneFromColor, computeReadinessAdjustment, scaleSets, scaleLoadKg, DEFAULT_PT_BAND, type ReadinessBand } from "@/lib/client/readinessAdjust";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }

async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: p } = await sb
    .from("players")
    .select("id, team_id, full_name")
    .eq("user_id", u.user.id)
    .maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  return { sb, player: p as { id: string; team_id: string; full_name: string } } as const;
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, player } = a;
  const today = new Date().toISOString().slice(0, 10);

  // ── Trainer / team header ─────────────────────────────────────────
  const { data: team } = await sb
    .from("teams")
    .select("id, name, team_type, club_short_name")
    .eq("id", player.team_id)
    .maybeSingle();

  // ── Next upcoming game → pre-game taper (trainer-entered) ─────────
  const { data: nextGameRow } = await sb
    .from("pt_client_games")
    .select("game_date, label")
    .eq("player_id", player.id)
    .gte("game_date", today)
    .order("game_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  const taper = computeGameTaper(
    (nextGameRow as { game_date?: string } | null)?.game_date ?? null,
    today,
  );

  // ── Latest strength tests → 1RM map (closed loop: test → prescribe) ──
  const { data: lvRows } = await sb
    .from("lv_profile_tests")
    .select("exercise_label, est_one_rm, test_date")
    .eq("client_id", player.id)
    .order("test_date", { ascending: false })
    .limit(100);
  const oneRmMap = buildOneRmMap((lvRows ?? []) as LvTest[]);
  // Auto-progression: recent set logs feed the working 1RM (raises target loads
  // when corroborated logged e1RM beats the tested anchor, within guardrails).
  const since28 = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const { data: setLogRows } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps, rpe")
    .eq("player_id", player.id)
    .gte("session_date", since28);
  const workingMap = computeWorkingOneRm((lvRows ?? []) as LvTest[], (setLogRows ?? []) as SetLogRow[]);

  // ── Active Explosive Power assignment (admin-managed library) ─────
  // Resolve which phase + which weekday block applies TODAY, based on the
  // assignment start_date. The assignment's stored current_phase is
  // authoritative if a trainer manually advances them, but if a client
  // just started on the 1st and today is the 1st of week 4, we surface
  // phase 2 automatically.
  const { data: epAssign } = await sb
    .from("pt_explosive_programme_assignments")
    .select("id, level, current_phase, programme_key, start_date, status, season_phase, sessions_per_week")
    .eq("client_id", player.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let explosive: {
    level: string;
    /** Programme display name (e.g. "Pulling Derivative Power"). Surfaced
     *  prominently on the client UI so they always recognise their plan,
     *  even on rest days when phase_name alone is too cryptic. */
    programme_name: string | null;
    phase: number;
    phase_name: string;
    weeks_label: string;
    week_in_phase: number | null;
    weekday_label: string | null;
    /** ISO weekday 1=Mon..7=Sun — locale-neutral; the client localises it. */
    weekday_index: number | null;
    rest_day: boolean;
    next_session_label: string | null;
    /** When kind=session: only the block scheduled for today. When rest:
     *  preview of the NEXT scheduled session (1 block) so client can see
     *  what's coming. UI label distinguishes session-today vs preview. */
    blocks: unknown[];
    /** Session moves (pt_session_reschedules): moved_from = this session was
     *  moved IN from that day; moved_to = today's natural session was moved
     *  AWAY to that day (today then reads as a rest day). */
    moved_from?: string | null;
    moved_to?: string | null;
    /** Programme length so the client UI can render "Week 4 / 8" correctly
     *  for 8-week starter templates vs 12-week Explosive Power. */
    weeks_per_phase?: number;
    total_phases?: number;
    /** Season block the trainer assigned this for, and the plain-language note
     *  explaining the volume/intensity adjustment applied. */
    season_phase?: string | null;
    season_note?: string | null;
    /** Pre-game taper (trainer-entered game dates). Client localises the text. */
    is_match_day?: boolean;
    days_to_game?: number | null;
    /** Closed loop: lifts whose strength test is stale (retest) or missing. */
    retest_due?: string[];
    needs_test?: string[];
    /** Readiness-driven adjustment actually applied to today's numbers. */
    readiness?: {
      applied: boolean;
      zone: "green" | "yellow" | "red";
      volume_pct: number;
      intensity_pct: number;
      action: "normal" | "deload" | "recovery" | "skip";
      source: "plan" | "default";
    } | null;
  } | null = null;

  // Readiness band for the active individual plan (real config). Null for the
  // explosive/starter path, which falls back to DEFAULT_PT_BAND.
  let planBand: ReadinessBand | null = null;

  if (epAssign) {
    const ep = epAssign as {
      level: string; current_phase: number;
      programme_key: string; start_date: string;
      season_phase: SeasonPhase | null;
      sessions_per_week: number | null;
    };

    // Pull all phases at once so we don't need to hit the DB again on phase
    // boundaries when start_date implies a different phase from current_phase.
    // programme_name is fetched here so the client UI can show "Pulling
    // Derivative Power" rather than just "Phase 1 — Hinge technique base"
    // (the latter is meaningless without programme context, and looks like
    // no programme is assigned at all on rest days).
    const { data: allPhases } = await sb
      .from("pt_explosive_programmes")
      .select("phase, phase_name, weeks_label, blocks, weeks_per_phase, programme_name")
      .eq("programme_key", ep.programme_key)
      .eq("level", ep.level)
      .order("phase", { ascending: true });

    const phaseRows = ((allPhases ?? []) as Array<{
      phase: number; phase_name: string; weeks_label: string; blocks: unknown[];
      weeks_per_phase: number | null;
      programme_name: string | null;
    }>);

    if (phaseRows.length > 0) {
      // First derive the date-implied slot (which phase + which block today).
      // Fall back to using whichever phase's blocks come closest.
      const firstPhaseBlocks = phaseRows[0]?.blocks ?? [];
      const nativeBlocks = Array.isArray(firstPhaseBlocks) ? firstPhaseBlocks.length : 0;
      // Per-client weekly-frequency override: run the SAME programme at the
      // chosen sessions/week by cycling/truncating its blocks across the week
      // (null = the programme's native frequency). E.g. a 2-block PUSH/PULL
      // programme at 4×/week → PUSH/PULL/PUSH/PULL on Mon/Tue/Thu/Fri.
      const effectiveFreq = ep.sessions_per_week && ep.sessions_per_week > 0
        ? Math.min(6, ep.sessions_per_week)
        : nativeBlocks;
      const cycleToFreq = <T,>(arr: T[]): T[] =>
        nativeBlocks === 0 ? [] : Array.from({ length: effectiveFreq }, (_, i) => arr[i % nativeBlocks]);
      const blockNamesGuess = cycleToFreq(
        Array.isArray(firstPhaseBlocks)
          ? (firstPhaseBlocks as Array<{ name?: string | null }>).map((b) => b?.name ?? null)
          : [],
      );

      const weeksPerPhase = phaseRows[0]?.weeks_per_phase ?? 3;
      const totalPhases = phaseRows.length;

      const slot = resolveProgrammeSlot({
        programmeKey: ep.programme_key,
        startDate: ep.start_date,
        today,
        nBlocks: effectiveFreq,
        blockNames: blockNamesGuess,
        weeksPerPhase,
        totalPhases,
      });

      // Pick which phase row to use. Prefer the date-implied phase; if the
      // client hasn't started yet or has already finished, fall back to
      // current_phase as stored on the assignment.
      const phaseToShow = (slot.kind === "session" || slot.kind === "rest")
        ? slot.phase
        : ep.current_phase;
      const phaseRow = phaseRows.find((p) => p.phase === phaseToShow) ?? phaseRows[0];
      const rawBlocks = Array.isArray(phaseRow.blocks) ? phaseRow.blocks : [];
      // Cycle this phase's blocks to the effective weekly frequency so
      // blocks[slot.blockIndex] (and the rest-day preview) line up with the
      // override schedule above.
      const blocks = rawBlocks.length === 0
        ? []
        : Array.from({ length: effectiveFreq }, (_, i) => rawBlocks[i % rawBlocks.length]);

      const WEEKDAY_IS = ["Mánudagur","Þriðjudagur","Miðvikudagur","Fimmtudagur","Föstudagur","Laugardagur","Sunnudagur"];
      const programmeName = phaseRow.programme_name ?? null;

      // Combined volume modifier (explainable): season phase (in-season trims
      // for freshness, off-season builds) × pre-game taper (ease down toward a
      // game). Applied to each exercise's set count. Match day suppresses gym
      // blocks entirely (handled below).
      const phase = isSeasonPhase(ep.season_phase) ? ep.season_phase : null;
      const phaseNote = phase ? SEASON_PHASE_SPEC[phase].note.EN : null;
      const seasonMult = phase ? SEASON_PHASE_SPEC[phase].volume : 1;
      const volMult = seasonMult * taper.volume;
      const applyPhase = (block: unknown): unknown => {
        if (volMult === 1 || !block || typeof block !== "object") return block;
        const b = block as { name?: string; rows?: Array<Record<string, unknown>> };
        if (!Array.isArray(b.rows)) return block;
        return {
          ...b,
          rows: b.rows.map((r) => ({
            ...r,
            sets: typeof r.sets === "number" ? Math.max(1, Math.round(r.sets * volMult)) : r.sets,
          })),
        };
      };

      const common = {
        weeks_per_phase: weeksPerPhase,
        total_phases: totalPhases,
        programme_name: programmeName,
        season_phase: phase,
        season_note: phaseNote,
        is_match_day: taper.is_match_day,
        days_to_game: taper.days_to_game,
      };
      if (slot.kind === "session") {
        explosive = {
          level: ep.level,
          phase: slot.phase,
          phase_name: phaseRow.phase_name,
          weeks_label: phaseRow.weeks_label,
          week_in_phase: slot.weekInPhase,
          weekday_label: WEEKDAY_IS[slot.weekdayIso - 1] ?? null,
          weekday_index: slot.weekdayIso,
          rest_day: false,
          next_session_label: null,
          blocks: [blocks[slot.blockIndex]].filter(Boolean).map(applyPhase),
          ...common,
        };
      } else if (slot.kind === "rest") {
        // On rest day, surface the NEXT session's exercises as a preview.
        // Without this, the client sees "Hvíldardagur — Hvíldu vel í dag"
        // and no programme detail, which feels like nothing was assigned.
        // Preview = first block (same logic for both 2-day and 3-day
        // starter programmes since fallback schedule starts with block 0
        // on Monday). Client UI labels this as "Næsta æfing — preview".
        const previewBlock = Array.isArray(blocks) && blocks.length > 0 ? blocks[0] : null;
        explosive = {
          level: ep.level,
          phase: slot.phase,
          phase_name: phaseRow.phase_name,
          weeks_label: phaseRow.weeks_label,
          week_in_phase: slot.weekInPhase,
          weekday_label: WEEKDAY_IS[slot.weekdayIso - 1] ?? null,
          weekday_index: slot.weekdayIso,
          rest_day: true,
          next_session_label: slot.nextSessionLabel,
          blocks: previewBlock ? [applyPhase(previewBlock)] : [],
          ...common,
        };
      } else {
        // not_started or completed — surface the assignment but no blocks.
        explosive = {
          level: ep.level,
          phase: ep.current_phase,
          phase_name: phaseRow.phase_name,
          weeks_label: phaseRow.weeks_label,
          week_in_phase: null,
          weekday_label: null,
          weekday_index: null,
          rest_day: true,
          next_session_label: null,
          blocks: [],
          ...common,
        };
      }

      // Match day overrides everything: no gym session, freshness priority.
      if (explosive && taper.is_match_day) {
        explosive.rest_day = true;
        explosive.blocks = [];
        explosive.next_session_label = null;
      }

      // Closed loop + auto-progression: target weights come from the WORKING
      // 1RM (tested anchor, auto-raised by corroborated logged performance
      // within guardrails). Collect retest (outgrew the test, or the test is
      // stale) and needs-test (a %1RM lift with no working number yet).
      if (explosive && Array.isArray(explosive.blocks)) {
        const retest = new Set<string>();
        const needsTest = new Set<string>();
        explosive.blocks = explosive.blocks.map((blk) => {
          if (!blk || typeof blk !== "object") return blk;
          const b = blk as { name?: string; rows?: Array<Record<string, unknown>> };
          if (!Array.isArray(b.rows)) return blk;
          return {
            ...b,
            rows: b.rows.map((r) => {
              const ex = String(r.exercise ?? "");
              const pct = typeof r.pct1rm === "number" ? r.pct1rm : null;
              const wt = workingTargetKg(ex, pct, workingMap);
              if (wt) {
                if (wt.needs_retest) retest.add(ex);
                // Stale tested anchor (old test, no recent push) also nudges.
                const canon = canonicalLift(ex);
                const tEntry = canon ? oneRmMap.get(canon) : undefined;
                if (tEntry && isStale(tEntry.testDate, today)) retest.add(ex);
                return { ...r, target_kg: wt.kg, target_auto: wt.source === "auto" };
              }
              if (pct != null && canonicalLift(ex)) needsTest.add(ex);
              return r;
            }),
          };
        });
        explosive.retest_due = Array.from(retest);
        explosive.needs_test = Array.from(needsTest);
      }
    }
  }

  // ── Individual training plan (trainer "Assign plan" flow) ─────────
  // The PT trainer dashboard assigns a saved template via /api/trainer/plans,
  // which writes to individual_training_plans → _sessions → _prescriptions.
  // The client home screen historically only read Explosive Power + custom
  // templates, so assigned plans never surfaced. Bridge: if no Explosive
  // Power assignment populated `explosive`, resolve TODAY's session from the
  // active individual plan and map it into the same shape the UI renders.
  if (!explosive) {
    const { data: planRow } = await sb
      .from("individual_training_plans")
      .select("id, plan_name, start_date, end_date, readiness_enabled, deload_volume_pct, deload_intensity_pct, readiness_yellow_action, readiness_red_action")
      .eq("player_id", player.id)
      .eq("status", "active")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planRow) {
      const plan = planRow as { id: string; plan_name: string; start_date: string; end_date: string };
      // Readiness band comes from the plan's own config (real columns).
      const pr = planRow as {
        readiness_enabled?: boolean | null; deload_volume_pct?: number | null; deload_intensity_pct?: number | null;
        readiness_yellow_action?: string | null; readiness_red_action?: string | null;
      };
      planBand = {
        enabled: pr.readiness_enabled !== false,
        deloadVolumePct: pr.deload_volume_pct ?? 70,
        deloadIntensityPct: pr.deload_intensity_pct ?? 85,
        yellowAction: (pr.readiness_yellow_action as ReadinessBand["yellowAction"]) ?? "deload",
        redAction: (pr.readiness_red_action as ReadinessBand["redAction"]) ?? "recovery",
      };
      // Week number since start (1-based) and ISO weekday (Mon=1 … Sun=7).
      const msPerDay = 86_400_000;
      const startMs = new Date(plan.start_date + "T00:00:00Z").getTime();
      const todayMs = new Date(today + "T00:00:00Z").getTime();
      const dayOffset = Math.max(0, Math.floor((todayMs - startMs) / msPerDay));
      const weekNumber = Math.floor(dayOffset / 7) + 1;
      const isoWeekday = ((new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

      // Total weeks in the plan → drives the "Week X / N" progress bar.
      const endMs = new Date(plan.end_date + "T00:00:00Z").getTime();
      const totalWeeks = Math.max(weekNumber, Math.ceil((endMs - startMs) / msPerDay / 7));

      // Natural session for today (week + weekday).
      const { data: naturalSessionRow } = await sb
        .from("individual_training_sessions")
        .select("id, session_name")
        .eq("plan_id", plan.id)
        .eq("week_number", weekNumber)
        .eq("day_of_week", isoWeekday)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();

      // Honour client/coach session moves (pt_session_reschedules): a session
      // moved TO today overrides the natural one; the natural session moved
      // AWAY leaves today free (reads as a rest day, with a "moved to" note).
      let sessionRow = (naturalSessionRow as { id: string; session_name: string } | null) ?? null;
      let movedFrom: string | null = null;
      let movedTo: string | null = null;
      const { data: reschedRows } = await sb
        .from("pt_session_reschedules")
        .select("session_id, from_date, to_date")
        .eq("player_id", player.id)
        .eq("plan_id", plan.id)
        .or(`from_date.eq.${today},to_date.eq.${today}`);
      const resched = (reschedRows ?? []) as Array<{ session_id: string; from_date: string; to_date: string }>;
      const movedIn = resched.find((r) => r.to_date === today) ?? null;
      const movedAway = resched.find((r) => r.from_date === today) ?? null;
      if (movedIn) {
        const { data: mr } = await sb
          .from("individual_training_sessions")
          .select("id, session_name")
          .eq("id", movedIn.session_id)
          .maybeSingle();
        sessionRow = (mr as { id: string; session_name: string } | null) ?? null;
        movedFrom = movedIn.from_date;
      } else if (movedAway) {
        sessionRow = null;
        movedTo = movedAway.to_date;
      }

      const WEEKDAY_IS = ["Mánudagur","Þriðjudagur","Miðvikudagur","Fimmtudagur","Föstudagur","Laugardagur","Sunnudagur"];

      let rows: Array<Record<string, unknown>> = [];
      if (sessionRow) {
        const session = sessionRow as { id: string; session_name: string };
        const { data: rxRows } = await sb
          .from("individual_training_prescriptions")
          .select("exercise_id, sort_order, sets, reps, load_type, load_value, rest_seconds, rpe_target, notes, group_label, method")
          .eq("session_id", session.id)
          .order("sort_order", { ascending: true });
        const rx = ((rxRows ?? []) as Array<{
          exercise_id: string | null; sets: number | null; reps: string | null;
          load_type: string | null; load_value: number | null; rest_seconds: number | null;
          rpe_target: number | null; group_label: string | null; method: string | null;
        }>);

        // Resolve exercise names in one round trip.
        const exIds = Array.from(new Set(rx.map((r) => r.exercise_id).filter(Boolean))) as string[];
        const nameById = new Map<string, string>();
        const descById = new Map<string, { en: string | null; is: string | null; video: string | null }>();
        if (exIds.length > 0) {
          const { data: exRows } = await sb
            .from("exercise_library")
            .select("id, name, description, description_is, video_url")
            .in("id", exIds);
          ((exRows ?? []) as Array<{ id: string; name: string; description: string | null; description_is: string | null; video_url: string | null }>).forEach((e) => {
            nameById.set(e.id, e.name);
            descById.set(e.id, { en: e.description, is: e.description_is, video: e.video_url });
          });
        }

        rows = rx.map((r, i) => {
          const d = r.exercise_id ? descById.get(r.exercise_id) : undefined;
          return {
            num: String(i + 1),
            exercise: (r.exercise_id && nameById.get(r.exercise_id)) || "Exercise",
            reps: r.reps ?? "",
            sets: r.sets ?? 0,
            method: r.load_type ?? undefined,
            // Grouping: authored group label + session method drive the
            // superset/triset/giant/contrast badge on the client surface.
            group: r.group_label ?? null,
            group_method: r.method ?? null,
            set_rest: r.rest_seconds != null ? `${r.rest_seconds} sec` : undefined,
            description: d?.en ?? null,
            description_is: d?.is ?? null,
            video_url: d?.video ?? null,
          };
        });
      }

      explosive = {
        level: "",
        programme_name: plan.plan_name,
        phase: weekNumber,
        phase_name: sessionRow ? (sessionRow as { session_name: string }).session_name : "Hvíldardagur",
        weeks_label: `Week ${weekNumber}`,
        week_in_phase: 1,
        weekday_label: WEEKDAY_IS[isoWeekday - 1] ?? null,
        weekday_index: isoWeekday,
        rest_day: !sessionRow,
        next_session_label: null,
        moved_from: movedFrom,
        moved_to: movedTo,
        weeks_per_phase: 1,
        total_phases: totalWeeks,
        blocks: sessionRow
          ? [{ name: (sessionRow as { session_name: string }).session_name, rows }]
          : [],
      };
    }
  }

  // ── Custom template player-override active for today ──────────────
  const { data: overrideRow } = await sb
    .from("custom_template_sets")
    .select("table_name, md_days, set_name")
    .eq("player_id", player.id)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Today's readiness (was the daily check-in done?) ──────────────
  const { data: readinessToday } = await sb
    .from("readiness_entries")
    .select("id, total_score, color, fatigue_energy, sleep_quality, muscle_soreness")
    .eq("player_id", player.id)
    .eq("entry_date", today)
    .maybeSingle();

  // ── Readiness-adapted today: scale the session to how the athlete feels ──
  // Honest contract: only apply (and only claim "−X%") when the band genuinely
  // scales the numbers. Green / no check-in / rest / match days are untouched.
  if (explosive && Array.isArray(explosive.blocks) && explosive.blocks.length > 0 && !explosive.rest_day && !explosive.is_match_day) {
    const zone = zoneFromColor((readinessToday as { color?: string | null } | null)?.color ?? null);
    if (zone) {
      const band = planBand ?? DEFAULT_PT_BAND;
      const adj = computeReadinessAdjustment(zone, band);
      if (adj.applied) {
        explosive.blocks = explosive.blocks.map((blk) => {
          const b = blk as { name?: string; rows?: Array<Record<string, unknown>> };
          if (!Array.isArray(b.rows)) return blk;
          return {
            ...b,
            rows: b.rows.map((r) => {
              const out: Record<string, unknown> = { ...r };
              if (typeof r.sets === "number") out.sets = scaleSets(r.sets, adj.volumePct);
              if (typeof r.target_kg === "number") out.target_kg = scaleLoadKg(r.target_kg, adj.intensityPct);
              return out;
            }),
          };
        });
      }
      explosive.readiness = {
        applied: adj.applied,
        zone: adj.zone,
        volume_pct: adj.volumePct,
        intensity_pct: adj.intensityPct,
        action: adj.action,
        source: planBand ? "plan" : "default",
      };
    }
  }

  // ── Latest bodyweight + 7-day prior for delta ─────────────────────
  const { data: bwData } = await sb
    .from("client_body_weight_logs")
    .select("log_date, weight_kg")
    .eq("player_id", player.id)
    .order("log_date", { ascending: false })
    .limit(10);
  const bw = ((bwData ?? []) as Array<{ log_date: string; weight_kg: number }>);
  const latestBw = bw[0] ?? null;
  // Find the closest entry to 7 days ago for a stable "weekly delta"
  let priorBw: { log_date: string; weight_kg: number } | null = null;
  if (latestBw) {
    const target = new Date(latestBw.log_date); target.setDate(target.getDate() - 7);
    const targetIso = target.toISOString().slice(0, 10);
    priorBw = bw.slice(1).reduce<{ log_date: string; weight_kg: number } | null>((best, r) => {
      const d1 = Math.abs(new Date(r.log_date).getTime() - new Date(targetIso).getTime());
      const d2 = best ? Math.abs(new Date(best.log_date).getTime() - new Date(targetIso).getTime()) : Infinity;
      return d1 < d2 ? r : best;
    }, null);
  }

  // ── Smart insights (Foster + heavy-lifting exposure + top-PR forecast)
  // These three are MicroPulse PT's main differentiators vs generic apps.
  // All three are pure functions; we just feed them the right slice of
  // already-fetched data so this endpoint stays one-round-trip.
  const since7 = new Date(); since7.setDate(since7.getDate() - 7);
  const since60 = new Date(); since60.setDate(since60.getDate() - 60);

  // Session loads for Foster (sRPE × duration in arbitrary units)
  const { data: rpeData } = await sb
    .from("session_rpe_entries")
    .select("session_date, session_load")
    .eq("player_id", player.id)
    .gte("session_date", since7.toISOString().slice(0, 10));
  const sessionLoads = ((rpeData ?? []) as Array<{ session_date: string; session_load: number | null }>)
    .filter((r) => r.session_load != null && Number.isFinite(r.session_load))
    .map((r) => ({ date: r.session_date, load: Number(r.session_load) }));
  const foster = computeFosterMonotonyStrain(sessionLoads, 7);

  // Heavy-lifting exposure: sets ≥80% 1RM in last 7 days
  const { data: setData } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, weight_kg, reps, exercise_name")
    .eq("player_id", player.id)
    .gte("session_date", since7.toISOString().slice(0, 10));
  const sets = ((setData ?? []) as Array<{
    session_date: string; weight_kg: number | null; reps: number | null; exercise_name: string;
  }>).filter((s) => s.weight_kg != null && s.reps != null);
  const exposure = computeHeavyLiftingExposure(
    sets.map((s) => ({ date: s.session_date, weight_kg: Number(s.weight_kg), reps: Number(s.reps) })),
    7,
  );

  // PR forecast — pick the exercise with the most logged sessions in the
  // last 60 days, fit linear regression on top-set Epley e1RM.
  const { data: setData60 } = await sb
    .from("pt_exercise_set_logs")
    .select("exercise_name, session_date, weight_kg, reps, rpe")
    .eq("player_id", player.id)
    .gte("session_date", since60.toISOString().slice(0, 10));
  const sets60 = ((setData60 ?? []) as Array<{
    exercise_name: string; session_date: string; weight_kg: number | null; reps: number | null; rpe: number | null;
  }>).filter((s) => s.weight_kg != null && s.reps != null);
  // Group: exercise → date → max e1RM (top set per session)
  const byExercise = new Map<string, Map<string, number>>();
  for (const s of sets60) {
    if (!byExercise.has(s.exercise_name)) byExercise.set(s.exercise_name, new Map());
    const dayMap = byExercise.get(s.exercise_name)!;
    const e = e1rmFromSet(s.weight_kg, s.reps, s.rpe);
    if (!dayMap.has(s.session_date) || e > dayMap.get(s.session_date)!) dayMap.set(s.session_date, e);
  }
  let topExerciseName: string | null = null;
  let topExerciseSessions = 0;
  for (const [name, dayMap] of byExercise) {
    if (dayMap.size > topExerciseSessions) {
      topExerciseSessions = dayMap.size;
      topExerciseName = name;
    }
  }
  let prForecast: { exercise_name: string; forecast: ReturnType<typeof forecastPR> } | null = null;
  if (topExerciseName) {
    const points = Array.from(byExercise.get(topExerciseName)!.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, e1rm]) => ({ date, e1rm: Number(e1rm.toFixed(2)) }));
    const fc = forecastPR(points);
    if (fc) prForecast = { exercise_name: topExerciseName, forecast: fc };
  }

  return NextResponse.json({
    ok: true,
    player: { id: player.id, full_name: player.full_name },
    team: team
      ? { id: (team as { id: string }).id, name: (team as { name: string }).name,
          type: (team as { team_type: string }).team_type,
          short: (team as { club_short_name: string | null }).club_short_name }
      : null,
    explosive,
    customOverride: overrideRow ?? null,
    readinessToday: readinessToday ?? null,
    // Has the athlete logged any set today? Drives the "you have a session
    // today" nudge (hidden once they've started logging).
    session_logged_today: ((setLogRows ?? []) as Array<{ session_date: string }>).some((r) => r.session_date === today),
    bodyweight: latestBw
      ? {
          latest: latestBw,
          prior: priorBw,
          delta_kg: priorBw ? Number((latestBw.weight_kg - priorBw.weight_kg).toFixed(2)) : null,
        }
      : null,
    intelligence: {
      foster,
      exposure,
      pr_forecast: prForecast,
    },
  });
}
