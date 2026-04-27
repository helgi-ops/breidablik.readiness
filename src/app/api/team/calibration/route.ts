/**
 * /api/team/calibration — verdict accuracy stats for a coach's team.
 *
 * Reads vw_decision_calibration_summary (last 30 days, scoped at the
 * view level) and produces a per-color interpretation that's actually
 * useful to a coach:
 *   - GREEN players: of N "send full session" calls, what % stayed
 *     safe (no escalation, no injury within 7 days)? — system safety
 *   - YELLOW players: of N "modify" calls, what % required ongoing
 *     attention? — system specificity
 *   - RED players: of N "rest/recovery" calls, what % showed real
 *     concern (injury, escalation, or persistence)? — system precision
 *
 * The raw "concern_validated_count" from the view is identical for
 * RED/YELLOW/GREEN, but the *interpretation* differs (a recovered RED
 * is success, not failure). This route does the per-color framing.
 *
 * GET /api/team/calibration
 *   → 200 { date, periodDays: 30, perState: { GREEN, YELLOW, RED } }
 *   401/403 on auth/role failures
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type AuthProfile = {
  role: string | null;
  team_id: string | null;
};

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

type SummaryRow = {
  team_id: string;
  predicted_state: "GREEN" | "YELLOW" | "RED";
  total_verdicts: number;
  persistent_count: number;
  escalated_count: number;
  recovered_count: number;
  unknown_count: number;
  injury_count: number;
  concern_validated_count: number;
};

export type CalibrationStateStats = {
  state: "GREEN" | "YELLOW" | "RED";
  /** Number of verdicts of this color in the period (excluding rows
   * with no next-day data — those are reported as `unknownCount`). */
  total: number;
  /** Counts breakdown for transparency / drill-down */
  persistentNextDay: number;
  escalatedNextDay: number;
  recoveredNextDay: number;
  /** Days where we couldn't compute next-day state (e.g. last day
   * in the period, weekends with no entries, OFF days). Excluded
   * from the accuracy calculation so we don't dilute the metric. */
  unknownCount: number;
  injuredWithin7d: number;
  /**
   * Per-state interpretation of "the system was right":
   *   GREEN  → kept the player safe (no escalation, no injury) /
   *            (total - unknown). Higher is better.
   *   YELLOW → ongoing attention warranted (persisted, escalated,
   *            or injured) / (total - unknown). Higher = correctly
   *            spotted players who needed monitoring.
   *   RED    → real concern materialised (persisted, escalated, OR
   *            injured) / (total - unknown). Higher = system caught
   *            real risk. Recovered RED is ambiguous — the recovery
   *            may have been driven by the cautious modification the
   *            coach applied, so we surface this as a separate caveat.
   */
  accuracyPct: number | null;
  /** Coach-facing one-line interpretation in plain language */
  interpretationEN: string;
  interpretationIS: string;
};

export type CalibrationResponse = {
  date: string;
  periodDays: number;
  perState: {
    GREEN: CalibrationStateStats;
    YELLOW: CalibrationStateStats;
    RED: CalibrationStateStats;
  };
  /** Total scoreable verdicts (across all colors, excluding unknowns) */
  totalScoreableVerdicts: number;
  /**
   * Sample-size guard — when total < 30 the metric is too noisy to
   * trust. UI should grey out the percentages and surface "Need more
   * data" instead. Threshold matches conventional minimum n for
   * proportion estimates with ~10% margin of error.
   */
  sampleSizeAdequate: boolean;
};

function computeStats(row: SummaryRow | null, state: "GREEN" | "YELLOW" | "RED"): CalibrationStateStats {
  const total = row?.total_verdicts ?? 0;
  const persistent = row?.persistent_count ?? 0;
  const escalated = row?.escalated_count ?? 0;
  const recovered = row?.recovered_count ?? 0;
  const unknown = row?.unknown_count ?? 0;
  const injured = row?.injury_count ?? 0;
  const scoreable = total - unknown;

  let accuracyPct: number | null = null;
  let interpretationEN = "";
  let interpretationIS = "";

  if (scoreable > 0) {
    if (state === "GREEN") {
      // GREEN safety: stayed-safe / scoreable
      // Stayed-safe = total - escalated - injured (overlap allowed —
      // an injured player is also "not safe" regardless of trajectory)
      const safeCount = scoreable - escalated - injured;
      accuracyPct = Math.max(0, Math.round((100 * safeCount) / scoreable));
      interpretationEN = `${safeCount}/${scoreable} stayed safe — no escalation or injury within 7 days.`;
      interpretationIS = `${safeCount}/${scoreable} héldust öruggir — engin escalation eða meiðsli innan 7 daga.`;
    } else if (state === "YELLOW") {
      // YELLOW specificity: required-attention / scoreable
      const validated = persistent + escalated + injured;
      const validatedClamped = Math.min(validated, scoreable);
      accuracyPct = Math.round((100 * validatedClamped) / scoreable);
      interpretationEN = `${validatedClamped}/${scoreable} required ongoing attention — flag persisted, escalated, or led to injury.`;
      interpretationIS = `${validatedClamped}/${scoreable} þurftu áframhaldandi umsjón — flagg hélt áfram, versnaði, eða leiddi til meiðsla.`;
    } else {
      // RED precision: real-concern / scoreable
      // We include "recovered" only when the recovery had no injury
      // within 7d — a RED followed by a coach-modified recovery and
      // a clean injury window is BOTH a system success AND impossible
      // to disprove. We report two numbers: the strict count
      // (persisted + escalated + injured), and a footnote about
      // recovered cases.
      const validated = persistent + escalated + injured;
      const validatedClamped = Math.min(validated, scoreable);
      accuracyPct = Math.round((100 * validatedClamped) / scoreable);
      interpretationEN = `${validatedClamped}/${scoreable} were followed by injury, escalation, or persistent flag. ${recovered} recovered after coach modification — those are also wins for the system.`;
      interpretationIS = `${validatedClamped}/${scoreable} fylgdust meiðsli, escalation, eða viðvarandi flagg. ${recovered} náðu sér eftir aðgerðir þjálfara — það eru líka árangur fyrir kerfið.`;
    }
  } else {
    interpretationEN = "No scoreable verdicts in the last 30 days.";
    interpretationIS = "Engin metanleg úrskurðir á síðustu 30 dögum.";
  }

  return {
    state,
    total,
    persistentNextDay: persistent,
    escalatedNextDay: escalated,
    recoveredNextDay: recovered,
    unknownCount: unknown,
    injuredWithin7d: injured,
    accuracyPct,
    interpretationEN,
    interpretationIS,
  };
}

const SAMPLE_SIZE_THRESHOLD = 30;

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();

    const { data, error } = await sb
      .from("vw_decision_calibration_summary")
      .select("team_id, predicted_state, total_verdicts, persistent_count, escalated_count, recovered_count, unknown_count, injury_count, concern_validated_count")
      .eq("team_id", teamId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as SummaryRow[];
    const byState = new Map<string, SummaryRow>();
    for (const r of rows) byState.set(r.predicted_state, r);

    const greenStats = computeStats(byState.get("GREEN") ?? null, "GREEN");
    const yellowStats = computeStats(byState.get("YELLOW") ?? null, "YELLOW");
    const redStats = computeStats(byState.get("RED") ?? null, "RED");

    const totalScoreable =
      (greenStats.total - greenStats.unknownCount) +
      (yellowStats.total - yellowStats.unknownCount) +
      (redStats.total - redStats.unknownCount);

    const response: CalibrationResponse = {
      date: new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date()),
      periodDays: 30,
      perState: {
        GREEN: greenStats,
        YELLOW: yellowStats,
        RED: redStats,
      },
      totalScoreableVerdicts: totalScoreable,
      sampleSizeAdequate: totalScoreable >= SAMPLE_SIZE_THRESHOLD,
    };

    return NextResponse.json(response);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: message }, { status: 401 });
    if (message === "Forbidden") return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
