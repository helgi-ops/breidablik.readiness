import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { VALD_RUNTIME, VALD_THRESHOLDS } from "@/lib/integrations/vald/config";
import type { ValdDailySnapshot, ValdFlag, ValdFreshnessStatus } from "./types";
import { aggregateTrialsByTest, metricSeries, type TrialMetricRow } from "./trialAggregate";
import { classifyPhaseChange, worstRealChange, type PhaseMetricKey } from "./phaseChange";
import { ftCtRatio, normalizedRfd } from "./cmjDerived";

// CMJ metric key → results column. Trial-averaged per test (Claudino 2017) and,
// for the phase set, CV-gated before it may flag (Gathercole 2015).
const CMJ_METRIC_COLUMNS: Record<string, string> = {
  jumpHeight: "jump_height_cm",
  rsiMod: "rsi_mod",
  timeToTakeoff: "time_to_takeoff_ms",
  peakForce: "peak_force_n",
  concentricImpulse: "concentric_impulse_n_s",
  eccentricDuration: "eccentric_duration_ms",
  concentricDuration: "concentric_duration_ms",
  peakPower: "peak_power_w",
  // Raw sources for the derived item-4 metrics (rfd_n_s populated when VALD sends
  // it; flight_time_ms superseding the jump-height-derived flight time). Nullable
  // → honest empty state until a sync populates them, never treated as zero.
  rfdRaw: "rfd_n_s",
  flightTime: "flight_time_ms",
};
// The phase metrics surfaced with the CV gate (jump height + RSI keep their own
// existing read/flag; they are trial-averaged here but not part of the phase set).
const CMJ_PHASE_KEYS: PhaseMetricKey[] = [
  "timeToTakeoff",
  "peakForce",
  "concentricImpulse",
  "eccentricDuration",
  "concentricDuration",
  "peakPower",
];
const finiteVals = (vals: Array<number | null>): number[] => vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function freshness(latestAt: string | null | undefined, targetDate: string, maxDays: number): ValdFreshnessStatus {
  if (!latestAt) return "missing";
  const latest = new Date(latestAt);
  const target = new Date(`${targetDate}T23:59:59.999Z`);
  const deltaDays = Math.floor((target.getTime() - latest.getTime()) / 86400000);
  return deltaDays <= maxDays ? "fresh" : "stale";
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentDrop(latest: number | null, baseline: number | null): number | null {
  if (latest == null || baseline == null || baseline <= 0) return null;
  return ((latest - baseline) / baseline) * 100;
}

function scoreFromDrop(dropPct: number | null, moderate: number, severe: number): { score: number | null; flag: ValdFlag } {
  if (dropPct == null) return { score: null, flag: null };
  if (dropPct <= -severe) return { score: 0.25, flag: "red" };
  if (dropPct <= -moderate) return { score: 0.55, flag: "yellow" };
  return { score: 0.85, flag: "green" };
}

function scoreAsymmetry(asymmetry: number | null, moderate: number, severe: number): { score: number | null; flag: ValdFlag } {
  if (asymmetry == null) return { score: null, flag: null };
  if (asymmetry >= severe) return { score: 0.25, flag: "red" };
  if (asymmetry >= moderate) return { score: 0.55, flag: "yellow" };
  return { score: 0.85, flag: "green" };
}

export async function buildValdDailySnapshot(teamId: string, microplayerId: string, snapshotDate: string, client?: SupabaseClient): Promise<ValdDailySnapshot> {
  const sb = client ?? getSupabaseServer();
  const baselineStart = new Date(`${snapshotDate}T00:00:00.000Z`);
  baselineStart.setUTCDate(baselineStart.getUTCDate() - VALD_THRESHOLDS.baselineWindowDays);
  const baselineDate = baselineStart.toISOString();
  const snapshotEnd = `${snapshotDate}T23:59:59.999Z`;

  const cmjColumns = ["raw_test_id", "test_timestamp", "rsi_mod_source", ...Object.values(CMJ_METRIC_COLUMNS)].join(", ");
  const [cmjRes, nordRes, ffRes] = await Promise.all([
    // ALL CMJ trials in the baseline window (not the best 10) — we average the
    // trials of each test (Claudino 2017) rather than reading a single trial.
    // CMJ family only: other ForceDecks tests (IMTP/DJ/SLDJ…) also land in this
    // table with null CMJ metrics, so filter them out or they pollute the baseline.
    sb.from("vald_forcedecks_results").select(cmjColumns).eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).or("test_type.is.null,test_type.ilike.%cmj%").gte("test_timestamp", baselineDate).lte("test_timestamp", snapshotEnd).order("test_timestamp", { ascending: false }),
    sb.from("vald_nordbord_results").select("*").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).lte("test_timestamp", snapshotEnd).order("test_timestamp", { ascending: false }).limit(10),
    sb.from("vald_forceframe_results").select("*").eq("team_id", teamId).eq("microplayer_id", microplayerId).eq("is_valid", true).lte("test_timestamp", snapshotEnd).order("test_timestamp", { ascending: false }).limit(10),
  ]);

  // Dynamic column list defeats the typed-client inference; cast through unknown.
  const cmjRows = (cmjRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const latestNord = (nordRes.data ?? [])[0] as Record<string, unknown> | undefined;
  const latestForce = (ffRes.data ?? [])[0] as Record<string, unknown> | undefined;

  // ── Trial averaging (Claudino 2017): one aggregate per TEST = the mean of its
  // valid trials. The latest test is compared against the median of the PRIOR
  // tests' means (excluded from its own baseline). ─────────────────────────────
  const cmjTrialRows: TrialMetricRow[] = cmjRows.map((row) => ({
    rawTestId: (row.raw_test_id as string | null) ?? null,
    testTimestamp: String(row.test_timestamp ?? ""),
    metrics: Object.fromEntries(
      Object.entries(CMJ_METRIC_COLUMNS).map(([metric, col]) => [metric, toNumber(row[col])]),
    ),
  }));
  const cmjAggregates = aggregateTrialsByTest(cmjTrialRows, Object.keys(CMJ_METRIC_COLUMNS));
  const latestCmjAgg = cmjAggregates[0] ?? null;
  const priorCmjAggs = cmjAggregates.slice(1);
  const latestCmj = cmjRows[0] as Record<string, unknown> | undefined; // newest trial — freshness + rsi source only
  const latestCmjTrialCount = latestCmjAgg?.trialCount ?? 0;

  const cmjBaselineValues = metricSeries(priorCmjAggs, "jumpHeight");
  const cmjBaseline = cmjBaselineValues.length >= VALD_THRESHOLDS.baselineMinTests ? median(cmjBaselineValues) : null;
  const latestCmjValue = latestCmjAgg?.metrics.jumpHeight ?? null;
  const cmjDrop = percentDrop(latestCmjValue, cmjBaseline);
  const cmjScored = scoreFromDrop(cmjDrop, VALD_THRESHOLDS.cmjModerateDropPct, VALD_THRESHOLDS.cmjSevereDropPct);

  // RSI-modified — surfaced ALONGSIDE jump height (never replacing it, never
  // touching the flag/score above). Jump height "lies" after fatigue while
  // RSI-mod falls; a personal-norm read makes that visible. null (not zero)
  // when VALD isn't sending it yet. Now the trial mean, like jump height.
  // Marques & Buchheit 2026; Gathercole 2015.
  const cmjRsiBaselineValues = metricSeries(priorCmjAggs, "rsiMod");
  const cmjRsiBaseline = cmjRsiBaselineValues.length >= VALD_THRESHOLDS.baselineMinTests ? median(cmjRsiBaselineValues) : null;
  const latestRsiMod = latestCmjAgg?.metrics.rsiMod ?? null;
  const cmjRsiDrop = percentDrop(latestRsiMod, cmjRsiBaseline);

  // ── CV-gated phase metrics (Gathercole 2015 Table 2). Each phase metric may
  // only flag a change that exceeds its OWN measurement noise (literature CV,
  // widened by the player's own CV, never narrowed), so a noisy metric like RFD
  // needs a far bigger move than jump height to mean anything. ──────────────────
  const cmjPhaseResultsBase = CMJ_PHASE_KEYS.map((metric) =>
    classifyPhaseChange({
      metric,
      latest: latestCmjAgg?.metrics[metric] ?? null,
      baselineValues: metricSeries(priorCmjAggs, metric),
    }),
  );

  // ── Derived item-4 metrics, CV-gated like any other phase metric ──────────────
  // FT:CT (Edwards 2018, PRIMARY explosive-quality metric — RSI-mod is secondary):
  // flight time from the measured jump height (or a measured flight time when
  // present) over contraction time. Mean-of-repeats basis (Edwards/Claudino): both
  // components are the test's trial mean, so the ratio is too.
  const ftCtOf = (agg: (typeof cmjAggregates)[number] | null | undefined) =>
    agg ? ftCtRatio({ flightTimeMs: agg.metrics.flightTime, jumpHeightCm: agg.metrics.jumpHeight, contractionTimeMs: agg.metrics.timeToTakeoff }) : null;
  const ftCtResult = classifyPhaseChange({
    metric: "ftCtRatio",
    latest: ftCtOf(latestCmjAgg),
    baselineValues: finiteVals(priorCmjAggs.map(ftCtOf)),
  });

  // Early-phase RFD normalised to peak force (D'Emanuele 2021; Maffiuletti).
  // rfd_n_s is null until VALD's RFD keys are captured by a sync → this stays
  // `insufficient` (honest empty state), never a fabricated zero.
  const rfdNormOf = (agg: (typeof cmjAggregates)[number] | null | undefined) =>
    agg ? normalizedRfd(agg.metrics.rfdRaw, agg.metrics.peakForce) : null;
  const rfdEarlyResult = classifyPhaseChange({
    metric: "rfdEarly",
    latest: rfdNormOf(latestCmjAgg),
    baselineValues: finiteVals(priorCmjAggs.map(rfdNormOf)),
  });

  const cmjPhaseResults = [...cmjPhaseResultsBase, ftCtResult, rfdEarlyResult];
  const cmjPhaseWorst = worstRealChange(cmjPhaseResults);
  const cmjPhaseHasData = cmjPhaseResults.some((r) => r.status !== "insufficient");

  const latestNordAsym = toNumber(latestNord?.asymmetry_percent);
  const nordScored = scoreAsymmetry(
    latestNordAsym,
    VALD_THRESHOLDS.nordbordModerateAsymmetryPct,
    VALD_THRESHOLDS.nordbordHighAsymmetryPct
  );

  const latestForceAsym = toNumber(latestForce?.asymmetry_percent);
  const ffScored = scoreAsymmetry(
    latestForceAsym,
    VALD_THRESHOLDS.nordbordModerateAsymmetryPct,
    VALD_THRESHOLDS.forceframeHighAsymmetryPct
  );

  const cmjFreshnessStatus = freshness((latestCmj?.test_timestamp as string | null) ?? null, snapshotDate, VALD_RUNTIME.freshness.cmjDays);
  const nordbordFreshnessStatus = freshness((latestNord?.test_timestamp as string | null) ?? null, snapshotDate, VALD_RUNTIME.freshness.nordbordDays);
  const forceframeFreshnessStatus = freshness((latestForce?.test_timestamp as string | null) ?? null, snapshotDate, VALD_RUNTIME.freshness.forceframeDays);

  const overallValdStatus: ValdFlag =
    [cmjScored.flag, nordScored.flag, ffScored.flag].includes("red")
      ? "red"
      : [cmjScored.flag, nordScored.flag, ffScored.flag].includes("yellow")
      ? "yellow"
      : [cmjScored.flag, nordScored.flag, ffScored.flag].includes("green")
      ? "green"
      : null;

  const explanation = {
    cmj: {
      baseline: cmjBaseline,
      latest: latestCmjValue,
      delta_percent: cmjDrop,
      // Trials averaged into this test's value (Claudino 2017). Higher = steadier.
      trial_count: latestCmjTrialCount,
      message:
        cmjDrop == null
          ? "No stable CMJ baseline available."
          : cmjDrop <= -VALD_THRESHOLDS.cmjSevereDropPct
          ? "Latest CMJ is meaningfully below recent baseline."
          : cmjDrop <= -VALD_THRESHOLDS.cmjModerateDropPct
          ? "Latest CMJ is moderately below recent baseline."
          : "CMJ output is within expected recent range.",
      // Surfaced beside jump height; does not drive the flag. null = VALD not
      // sending RSI-modified yet (the honest empty state), not "athlete fine".
      rsi_mod: {
        baseline: cmjRsiBaseline,
        latest: latestRsiMod,
        delta_percent: cmjRsiDrop,
        source: (latestCmj?.rsi_mod_source as string | null) ?? null,
        available: latestRsiMod != null,
        // Demoted to SECONDARY (item 4): FT:CT is now the primary explosive-quality
        // read. Edwards 2018 found drop-jump RSI insensitive to fatigue in team-
        // sport athletes; RSI-modified is kept for continuity, not deleted.
        role: "secondary" as const,
        role_note: {
          en: "Secondary metric — FT:CT (flight:contraction) is the primary explosive-quality read; RSI-modified may be less fatigue-sensitive in team-sport athletes (Edwards 2018).",
          is: "Aukamælikvarði — FT:CT (flug:samdráttur) er aðal-sprengikrafts lesturinn; RSI-modified getur verið ónæmara fyrir þreytu hjá hópíþróttafólki (Edwards 2018).",
        },
        message:
          latestRsiMod == null
            ? "RSI-modified not available: VALD is not sending it yet."
            : cmjRsiDrop == null
            ? "RSI-modified present, but no stable baseline yet."
            : cmjRsiDrop <= -VALD_THRESHOLDS.cmjSevereDropPct
            ? "RSI-modified is meaningfully below recent baseline — force produced slower even if jump height held."
            : cmjRsiDrop <= -VALD_THRESHOLDS.cmjModerateDropPct
            ? "RSI-modified is moderately below recent baseline."
            : "RSI-modified is within expected recent range.",
      },
      // CV-gated phase metrics — HOW the jump was produced. Each metric only
      // flags a move beyond its own measurement noise (Gathercole 2015 Table 2),
      // so a noisy metric can't masquerade as fatigue. `available` false = the
      // phase columns aren't populated yet (VALD result set thin) — the honest
      // empty state, same as RSI, NOT "athlete fine". Marques & Buchheit 2026.
      phase: {
        available: cmjPhaseHasData,
        trial_count: latestCmjTrialCount,
        // The fatigue read compares the MEAN of the session's valid trials, not the
        // best jump (Edwards 2018; Claudino 2017) — the best jump stays for RTP/
        // performance display. Item 4.
        mean_of_repeats: true,
        mean_of_repeats_note: {
          en: "Fatigue comparison uses the mean of this session's trials (not the best jump) — Edwards 2018; Claudino 2017.",
          is: "Þreytusamanburður notar meðaltal prófanna í þessari lotu (ekki besta stökkið) — Edwards 2018; Claudino 2017.",
        },
        worst_real: cmjPhaseWorst
          ? {
              metric: cmjPhaseWorst.metric,
              label: cmjPhaseWorst.label,
              delta_percent: cmjPhaseWorst.deltaPct,
              threshold_percent: cmjPhaseWorst.thresholdPct,
              cv_percent: cmjPhaseWorst.effectiveCvPct,
              citation: cmjPhaseWorst.citation,
            }
          : null,
        message_en: cmjPhaseWorst
          ? cmjPhaseWorst.label.en
          : cmjPhaseHasData
          ? "CMJ phase metrics are within normal limits (no change beyond measurement noise)."
          : "Phase metrics not available yet: VALD isn't returning them in the synced result set.",
        message_is: cmjPhaseWorst
          ? cmjPhaseWorst.label.is
          : cmjPhaseHasData
          ? "CMJ hreyfifasar eru innan eðlilegra marka (engin breyting umfram mæliskekkju)."
          : "Fasamælingar ekki tiltækar enn: VALD skilar þeim ekki í samstilltu niðurstöðunum.",
        metrics: cmjPhaseResults.map((r) => ({
          metric: r.metric,
          status: r.status,
          delta_percent: r.deltaPct,
          worse: r.worse,
          baseline: r.baseline,
          latest: r.latest,
          test_count: r.testCount,
          literature_cv_percent: r.literatureCvPct,
          effective_cv_percent: r.effectiveCvPct,
          threshold_percent: r.thresholdPct,
          label: r.label,
        })),
        citation: "Gathercole et al. 2015; Marques & Buchheit 2026; Claudino et al. 2017; Edwards 2018 (FT:CT, mean-of-repeats); D'Emanuele 2021 (early RFD)",
      },
    },
    nordbord: {
      asymmetry_percent: latestNordAsym,
      message:
        latestNordAsym == null
          ? "No recent NordBord asymmetry value available."
          : latestNordAsym >= VALD_THRESHOLDS.nordbordHighAsymmetryPct
          ? "Hamstring asymmetry is elevated versus recent normal range."
          : latestNordAsym >= VALD_THRESHOLDS.nordbordModerateAsymmetryPct
          ? "Hamstring asymmetry is mildly elevated."
          : "Hamstring profile is within expected recent range.",
    },
    forceframe: {
      asymmetry_percent: latestForceAsym,
      message:
        latestForceAsym == null
          ? "No recent ForceFrame asymmetry value available."
          : latestForceAsym >= VALD_THRESHOLDS.forceframeHighAsymmetryPct
          ? "ForceFrame groin profile indicates possible adductor readiness concern."
          : "ForceFrame profile is within expected recent range.",
    },
  };

  const snapshot: ValdDailySnapshot = {
    teamId,
    microplayerId,
    snapshotDate,
    latestCmjAt: (latestCmj?.test_timestamp as string | null) ?? null,
    latestNordbordAt: (latestNord?.test_timestamp as string | null) ?? null,
    latestForceframeAt: (latestForce?.test_timestamp as string | null) ?? null,
    cmjFreshnessStatus,
    nordbordFreshnessStatus,
    forceframeFreshnessStatus,
    cmjScore: cmjScored.score,
    nordbordScore: nordScored.score,
    forceframeScore: ffScored.score,
    neuromuscularFlag: cmjScored.flag,
    hamstringFlag: nordScored.flag,
    groinFlag: ffScored.flag,
    overallValdStatus,
    explanation,
  };

  await sb.from("vald_daily_player_snapshot").upsert({
    team_id: teamId,
    microplayer_id: microplayerId,
    snapshot_date: snapshotDate,
    latest_cmj_at: snapshot.latestCmjAt ?? null,
    latest_nordbord_at: snapshot.latestNordbordAt ?? null,
    latest_forceframe_at: snapshot.latestForceframeAt ?? null,
    cmj_freshness_status: cmjFreshnessStatus,
    nordbord_freshness_status: nordbordFreshnessStatus,
    forceframe_freshness_status: forceframeFreshnessStatus,
    cmj_score: snapshot.cmjScore ?? null,
    nordbord_score: snapshot.nordbordScore ?? null,
    forceframe_score: snapshot.forceframeScore ?? null,
    neuromuscular_flag: snapshot.neuromuscularFlag,
    hamstring_flag: snapshot.hamstringFlag,
    groin_flag: snapshot.groinFlag,
    overall_vald_status: snapshot.overallValdStatus,
    explanation,
  }, { onConflict: "team_id,microplayer_id,snapshot_date" });

  return snapshot;
}

export async function getValdDailySnapshot(teamId: string, microplayerId: string, snapshotDate: string): Promise<ValdDailySnapshot | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("vald_daily_player_snapshot")
    .select("*")
    .eq("team_id", teamId)
    .eq("microplayer_id", microplayerId)
    .eq("snapshot_date", snapshotDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    teamId,
    microplayerId,
    snapshotDate,
    latestCmjAt: (data as Record<string, unknown>).latest_cmj_at as string | null,
    latestNordbordAt: (data as Record<string, unknown>).latest_nordbord_at as string | null,
    latestForceframeAt: (data as Record<string, unknown>).latest_forceframe_at as string | null,
    cmjFreshnessStatus: ((data as Record<string, unknown>).cmj_freshness_status as ValdFreshnessStatus | null) ?? "missing",
    nordbordFreshnessStatus: ((data as Record<string, unknown>).nordbord_freshness_status as ValdFreshnessStatus | null) ?? "missing",
    forceframeFreshnessStatus: ((data as Record<string, unknown>).forceframe_freshness_status as ValdFreshnessStatus | null) ?? "missing",
    cmjScore: toNumber((data as Record<string, unknown>).cmj_score),
    nordbordScore: toNumber((data as Record<string, unknown>).nordbord_score),
    forceframeScore: toNumber((data as Record<string, unknown>).forceframe_score),
    neuromuscularFlag: ((data as Record<string, unknown>).neuromuscular_flag as ValdFlag) ?? null,
    hamstringFlag: ((data as Record<string, unknown>).hamstring_flag as ValdFlag) ?? null,
    groinFlag: ((data as Record<string, unknown>).groin_flag as ValdFlag) ?? null,
    overallValdStatus: ((data as Record<string, unknown>).overall_vald_status as ValdFlag) ?? null,
    explanation: ((data as Record<string, unknown>).explanation as Record<string, unknown>) ?? {},
  };
}
