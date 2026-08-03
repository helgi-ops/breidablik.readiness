import "server-only";

/**
 * Build a Return-to-Play assessment for one player.
 *
 * PHASE 0: fuses the data we already ingest with real numbers —
 *   • CMJ force-plate (vald_forcedecks_results, trial-mean per Claudino)
 *   • Change-of-direction high-intensity L/R asymmetry (Bishop 2020)
 *   • Injury + return-to-training context (buildRttForPlayer, player_injuries)
 * into the shared RtpAssessment shape, with an honest `coverage` banner naming
 * the battery tests still pending ingestion (IMTP / DJ / SLDJ / SLISOSQT).
 *
 * Descriptive/medical only — never touches the readiness verdict/color.
 */

import { buildRttForPlayer } from "@/lib/micropulse/rttForPlayer";
import { aggregateTrialsByTest, type TrialMetricRow } from "@/lib/micropulse/vald/trialAggregate";
import { ageYears as deriveAgeYears } from "@/lib/legal/age";
import { batteryMetricMean, BATTERY_CODES } from "@/lib/integrations/vald/battery";
import { buildPhase0Criteria, rtpDecision } from "./clearanceCriteria";
import type { RtpAssessment, RtpCmj, RtpCod, RtpImtp, RtpInjury } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accept any Supabase client (admin or server)
type Sb = any;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// Bishop 2020 L/R asymmetry thresholds (shared with cod-asymmetry route).
function asymPct(left: number, right: number): number | null {
  const max = Math.max(left, right);
  if (max <= 0) return null;
  return (Math.abs(left - right) / max) * 100;
}
function codFlag(pct: number | null): RtpCod["flag"] {
  if (pct == null) return "no_data";
  if (pct >= 18) return "high";
  if (pct >= 15) return "concern";
  if (pct >= 9) return "watch";
  return "ok";
}

export async function buildRtpAssessment(sb: Sb, playerId: string, teamId: string): Promise<RtpAssessment> {
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const [playerRes, rtt, piRes, ieRes, cmjRes, weightRes] = await Promise.all([
    sb.from("players").select("id, full_name, team_id, position, date_of_birth").eq("id", playerId).maybeSingle(),
    buildRttForPlayer(sb, playerId, teamId, 120),
    sb.from("player_injuries")
      .select("injury_date, injury_type, body_part, severity, status, rtp_stage, estimated_return_date, actual_return_date")
      .eq("player_id", playerId).order("injury_date", { ascending: false }),
    sb.from("injury_events").select("injury_date, injury_type, body_side, is_active").eq("player_id", playerId).order("injury_date", { ascending: false }),
    sb.from("vald_forcedecks_results")
      .select("raw_test_id, test_timestamp, test_type, jump_height_cm, rsi_mod, rsi_mod_source, peak_power_w, relative_peak_power_w_kg, peak_force_n, left_value, right_value, asymmetry_percent, asymmetry_side, is_valid")
      .eq("microplayer_id", playerId).order("test_timestamp", { ascending: false }).limit(60),
    sb.from("vald_raw_tests").select("payload").eq("test_type", "CMJ").order("test_timestamp", { ascending: false }).limit(1),
  ]);

  const player = (playerRes.data ?? {}) as { full_name?: string; position?: string | null; date_of_birth?: string | null };

  // ── Injury (display fields): player_injuries authoritative + body_side from events ──
  const piRows = (piRes.data ?? []) as Array<Record<string, unknown>>;
  const activePi = piRows.find((r) => r.status !== "cleared" && !r.actual_return_date) ?? piRows[0] ?? null;
  const ieRows = (ieRes.data ?? []) as Array<{ injury_date: string; injury_type: string | null; body_side: string | null }>;
  const bodySide = activePi
    ? (ieRows.find((e) => e.injury_date === activePi.injury_date)?.body_side ?? ieRows[0]?.body_side ?? null)
    : (ieRows[0]?.body_side ?? null);

  const injury: RtpInjury | null = activePi
    ? {
        active: activePi.status !== "cleared" && !activePi.actual_return_date,
        injuryDate: (activePi.injury_date as string) ?? null,
        type: (activePi.injury_type as string) ?? null,
        bodyPart: (activePi.body_part as string) ?? null,
        severity: (activePi.severity as string) ?? null,
        bodySide,
        status: (activePi.status as string) ?? null,
        stage: activePi.rtp_stage == null ? null : Number(activePi.rtp_stage),
        estimatedReturn: (activePi.estimated_return_date as string) ?? null,
        layoffDays: rtt.layoffDays,
        weeksPostInjury: rtt.layoffDays == null ? null : Math.round(rtt.layoffDays / 7),
      }
    : null;

  // ── CMJ (latest test, trial mean) ──────────────────────────────────────────
  const cmjRows = ((cmjRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((r) => r.is_valid !== false && (r.test_type == null || /cmj/i.test(String(r.test_type))));
  const trialRows: TrialMetricRow[] = cmjRows.map((r) => ({
    rawTestId: (r.raw_test_id as string) ?? null,
    testTimestamp: (r.test_timestamp as string) ?? "",
    metrics: {
      jumpHeightCm: num(r.jump_height_cm),
      rsiMod: num(r.rsi_mod),
      peakPowerW: num(r.peak_power_w),
      relPeakPowerWkg: num(r.relative_peak_power_w_kg),
      peakForceN: num(r.peak_force_n),
      asymmetryPct: num(r.asymmetry_percent),
    },
  }));
  const METRIC_KEYS = ["jumpHeightCm", "rsiMod", "peakPowerW", "relPeakPowerWkg", "peakForceN", "asymmetryPct"];
  const aggregates = aggregateTrialsByTest(trialRows, METRIC_KEYS);
  const latest = aggregates[0] ?? null;
  const latestRow = latest ? cmjRows.find((r) => (r.raw_test_id as string) === latest.rawTestId) : null;

  // vald_forcedecks_results.rsi_mod is stored ×100 (values ~28–66); display the
  // standard ratio (~0.28–0.66). Heuristic guards a future correctly-scaled row.
  const rsiModRaw = latest?.metrics.rsiMod ?? null;
  const rsiModDisplay = rsiModRaw != null && rsiModRaw > 3 ? rsiModRaw / 100 : rsiModRaw;

  const cmj: RtpCmj | null = latest
    ? {
        testDate: latest.testTimestamp ? latest.testTimestamp.slice(0, 10) : null,
        trialCount: latest.trialCount,
        jumpHeightCm: latest.metrics.jumpHeightCm,
        rsiMod: rsiModDisplay,
        rsiModSource: (latestRow?.rsi_mod_source as string) ?? null,
        peakPowerW: latest.metrics.peakPowerW,
        relPeakPowerWkg: latest.metrics.relPeakPowerWkg,
        peakForceN: latest.metrics.peakForceN,
        asymmetryPct: latest.metrics.asymmetryPct,
        asymmetrySide: (latestRow?.asymmetry_side as string) ?? null,
      }
    : null;

  // ── Change-of-direction high-intensity asymmetry (last 14 days) ─────────────
  const since14 = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  const { data: codLoad } = await sb
    .from("player_external_load_daily")
    .select("ima_cod_left_high, ima_cod_right_high")
    .eq("player_id", playerId).eq("source", "catapult").gte("date", since14).lte("date", today);
  const codTotals = ((codLoad ?? []) as Array<{ ima_cod_left_high: number | null; ima_cod_right_high: number | null }>)
    .reduce((a, r) => {
      const l = Number(r.ima_cod_left_high ?? 0) || 0;
      const rr = Number(r.ima_cod_right_high ?? 0) || 0;
      a.left += l; a.right += rr; if (l + rr > 0) a.sessions += 1; return a;
    }, { left: 0, right: 0, sessions: 0 });
  const codPct = asymPct(codTotals.left, codTotals.right);
  const cod: RtpCod | null = codTotals.sessions > 0
    ? { windowDays: 14, sessions: codTotals.sessions, highLeft: Math.round(codTotals.left), highRight: Math.round(codTotals.right), asymPct: codPct == null ? null : Number(codPct.toFixed(1)), flag: codFlag(codPct) }
    : null;

  // ── IMTP (latest test, trial-mean) from vald_test_metrics ───────────────────
  const { data: imtpRows } = await sb
    .from("vald_test_metrics")
    .select("raw_test_id, test_timestamp, metric_code, limb, value")
    .eq("microplayer_id", playerId).eq("test_type", "IMTP")
    .order("test_timestamp", { ascending: false }).limit(800);
  let imtp: RtpImtp | null = null;
  if (imtpRows && imtpRows.length) {
    const latestImtpId = (imtpRows[0] as { raw_test_id: string }).raw_test_id;
    const rows = (imtpRows as Array<{ raw_test_id: string; test_timestamp: string; metric_code: string; limb: string; value: number | null }>)
      .filter((r) => r.raw_test_id === latestImtpId);
    const trialCount = rows.filter((r) => BATTERY_CODES.imtpPeakForce.includes(r.metric_code) && r.limb === "Trial").length || 1;
    const peakForceN = batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Trial") ?? batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Both");
    const relPeak = batteryMetricMean(rows, BATTERY_CODES.imtpRelForcePeak, "Trial") ?? batteryMetricMean(rows, BATTERY_CODES.imtpRelForcePeak, "Both");
    const leftN = batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Left");
    const rightN = batteryMetricMean(rows, BATTERY_CODES.imtpPeakForce, "Right");
    const aPct = leftN != null && rightN != null ? asymPct(leftN, rightN) : null;
    // LSI = involved / uninvolved × 100 when the injured side is known.
    let lsi: number | null = null;
    const side = (injury?.bodySide ?? "").toLowerCase();
    if (leftN != null && rightN != null && leftN > 0 && rightN > 0) {
      if (side === "right") lsi = (rightN / leftN) * 100;
      else if (side === "left") lsi = (leftN / rightN) * 100;
    }
    imtp = {
      testDate: rows[0]?.test_timestamp ? rows[0].test_timestamp.slice(0, 10) : null,
      trialCount,
      peakForceN: peakForceN == null ? null : Math.round(peakForceN),
      relPeakForceNkg: relPeak == null ? null : Number(relPeak.toFixed(1)),
      leftN: leftN == null ? null : Math.round(leftN),
      rightN: rightN == null ? null : Math.round(rightN),
      asymmetryPct: aPct == null ? null : Number(aPct.toFixed(1)),
      lsiPct: lsi == null ? null : Number(lsi.toFixed(0)),
    };
  }

  // ── Body mass (from latest CMJ raw payload weight) ──────────────────────────
  const weightPayload = (weightRes.data ?? [])[0] as { payload?: { weight?: unknown } } | undefined;
  const bodyMassKg = num(weightPayload?.payload?.weight);

  // ── Criteria + decision (rules) ─────────────────────────────────────────────
  const criteria = buildPhase0Criteria({
    cmjJumpHeightCm: cmj?.jumpHeightCm ?? null,
    cmjAsymmetryPct: cmj?.asymmetryPct ?? null,
    codHighAsymPct: cod?.asymPct ?? null,
    imtpRelNkg: imtp?.relPeakForceNkg ?? null,
    imtpAsymPct: imtp?.asymmetryPct ?? null,
  });
  const evaluable = criteria.filter((c) => c.status !== "NO_DATA");
  const decision = rtpDecision(criteria, rtt.currentlyInjured);

  return {
    player: {
      id: playerId,
      fullName: player.full_name ?? "Player",
      teamId,
      position: player.position ?? null,
      ageYears: deriveAgeYears(player.date_of_birth ?? null),
      bodyMassKg,
    },
    generatedAt: nowIso,
    assessmentDate: today,
    injury,
    cmj,
    imtp,
    cod,
    rtt: { variant: rtt.variant, layoffDays: rtt.layoffDays, stage: rtt.rtp?.stage ?? null, currentlyInjured: rtt.currentlyInjured },
    criteria,
    criteriaMet: evaluable.filter((c) => c.met).length,
    criteriaTotal: evaluable.length,
    decision,
    coverage: {
      present: ["CMJ", ...(imtp ? ["IMTP"] : []), ...(cod ? ["Change-of-direction (IMA)"] : [])],
      pending: [...(imtp ? [] : ["IMTP"]), "Drop Jump", "Single-Leg Drop Jump", "Single-Leg Isometric Squat", "Dynamic valgus (video)"],
    },
  };
}
