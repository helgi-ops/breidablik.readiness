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
import { batteryMetricMean, BATTERY_CODES, BATTERY_PRIMARY } from "@/lib/integrations/vald/battery";
import { asymmetryStatus, buildRtpCriteria, buildRtpDomains, buildRtpRecommendations, rtpDecision } from "./clearanceCriteria";
import { computeCodExposure, type CodExposureRow } from "./codExposure";
import type { RtpAssessment, RtpBatteryTest, RtpCmj, RtpCod, RtpImtp, RtpInjury, RtpLimbStrengthEntry, RtpLimbStrengthTest, RtpValgus, RtpValgusSeverity } from "./types";

const BATTERY_LABELS: Record<string, string> = {
  SLDJ: "Single-Leg Drop Jump", DJ: "Drop Jump", SLISOSQT: "Single-Leg Isometric Squat",
  ISOSQT: "Isometric Squat", SLJ: "Single-Leg Jump",
};
const BATTERY_SURFACE_TYPES = ["SLDJ", "DJ", "SLISOSQT", "ISOSQT", "SLJ"];

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

  const [playerRes, rtt, piRes, ieRes, cmjRes, weightRes, valgusRes, nbRes, ffRes] = await Promise.all([
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
    sb.from("rtp_valgus_assessments").select("severity, note, assessment_date").eq("player_id", playerId).order("assessment_date", { ascending: false }).limit(1),
    sb.from("vald_nordbord_results")
      .select("test_timestamp, test_type, left_peak_force_n, right_peak_force_n, asymmetry_percent, asymmetry_side, is_valid")
      .eq("microplayer_id", playerId).order("test_timestamp", { ascending: false }).limit(60),
    sb.from("vald_forceframe_results")
      .select("test_timestamp, test_type, body_region, movement_pattern, left_peak_force_n, right_peak_force_n, asymmetry_percent, asymmetry_side, is_valid")
      .eq("microplayer_id", playerId).order("test_timestamp", { ascending: false }).limit(60),
  ]);

  // Coach-assessed dynamic valgus (manual — never computed).
  const valgusRow = (valgusRes.data ?? [])[0] as { severity?: string; note?: string | null; assessment_date?: string } | undefined;
  const valgus: RtpValgus | null = valgusRow
    ? { severity: (valgusRow.severity as RtpValgusSeverity) ?? "none", note: valgusRow.note ?? null, assessedAt: valgusRow.assessment_date ?? null }
    : null;

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

  // ── COD load EXPOSURE (RTP worst-case gate) — recent multidirectional load vs his
  // own season match demand. "Has he been re-loaded with enough cutting/braking?" ────
  const since180 = new Date(Date.parse(today + "T00:00:00Z") - 179 * 86400000).toISOString().slice(0, 10);
  const { data: exposureLoad } = await sb
    .from("player_external_load_daily")
    .select("date, ima_cod_left_high, ima_cod_right_high, decel_b2_3_tot_effs_gen2, session_duration_minutes, total_player_load, player_load_per_minute")
    .eq("player_id", playerId).in("source", ["catapult", "manual"]).gte("date", since180).lte("date", today);
  const codExposureRows: CodExposureRow[] = ((exposureLoad ?? []) as Array<{
    date: string; ima_cod_left_high: number | null; ima_cod_right_high: number | null;
    decel_b2_3_tot_effs_gen2: number | null; session_duration_minutes: number | null;
    total_player_load: number | null; player_load_per_minute: number | null;
  }>).map((r) => {
    const l = num(r.ima_cod_left_high), rr = num(r.ima_cod_right_high);
    return {
      date: r.date,
      imaCodHigh: l === null && rr === null ? null : (l ?? 0) + (rr ?? 0),
      decelEfforts: num(r.decel_b2_3_tot_effs_gen2),
      durationMin: num(r.session_duration_minutes),
      playerLoad: num(r.total_player_load),
      loadPerMin: num(r.player_load_per_minute),
    };
  });
  const codExposure = computeCodExposure(codExposureRows, { today });

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

  // ── Single-leg / reactive battery (SLDJ, DJ, SLISOSQT, …) ───────────────────
  // Read generically from vald_test_metrics. Empty until such tests are synced,
  // so this surface is "ready" the moment the data lands.
  const side = (injury?.bodySide ?? "").toLowerCase();
  const battery: RtpBatteryTest[] = [];
  const { data: batRows } = await sb
    .from("vald_test_metrics")
    .select("raw_test_id, test_type, test_timestamp, metric_code, limb, value")
    .eq("microplayer_id", playerId).in("test_type", BATTERY_SURFACE_TYPES)
    .order("test_timestamp", { ascending: false }).limit(1500);
  if (batRows && batRows.length) {
    const rowsByType = new Map<string, Array<{ raw_test_id: string; test_timestamp: string; metric_code: string; limb: string; value: number | null }>>();
    for (const r of batRows as Array<{ raw_test_id: string; test_type: string; test_timestamp: string; metric_code: string; limb: string; value: number | null }>) {
      const list = rowsByType.get(r.test_type) ?? [];
      list.push(r);
      rowsByType.set(r.test_type, list);
    }
    for (const type of BATTERY_SURFACE_TYPES) {
      const all = rowsByType.get(type);
      if (!all || !all.length) continue;
      const latestId = all[0].raw_test_id; // ordered desc
      const rows = all.filter((r) => r.raw_test_id === latestId);
      const prim = BATTERY_PRIMARY[type];
      const primaryValue = prim ? (batteryMetricMean(rows, prim.codes, "Trial") ?? batteryMetricMean(rows, prim.codes, "Both")) : null;
      const leftV = prim ? batteryMetricMean(rows, prim.codes, "Left") : null;
      const rightV = prim ? batteryMetricMean(rows, prim.codes, "Right") : null;
      const aPct = leftV != null && rightV != null ? asymPct(leftV, rightV) : null;
      let lsi: number | null = null;
      if (leftV != null && rightV != null && leftV > 0 && rightV > 0) {
        if (side === "right") lsi = (rightV / leftV) * 100;
        else if (side === "left") lsi = (leftV / rightV) * 100;
      }
      const stiffL = batteryMetricMean(rows, BATTERY_CODES.activeStiffness, "Left");
      const stiffR = batteryMetricMean(rows, BATTERY_CODES.activeStiffness, "Right");
      const stiffAsym = stiffL != null && stiffR != null ? asymPct(stiffL, stiffR) : null;
      const jhL = batteryMetricMean(rows, BATTERY_CODES.jumpHeight, "Left");
      const jhR = batteryMetricMean(rows, BATTERY_CODES.jumpHeight, "Right");
      const jhAsym = jhL != null && jhR != null ? asymPct(jhL, jhR) : null;
      battery.push({
        testType: type,
        label: BATTERY_LABELS[type] ?? type,
        testDate: rows[0]?.test_timestamp ? rows[0].test_timestamp.slice(0, 10) : null,
        primaryLabel: prim?.label ?? "Primary",
        primaryValue: primaryValue == null ? null : Number(primaryValue.toFixed(2)),
        primaryUnit: prim?.unit ?? "",
        left: leftV == null ? null : Number(leftV.toFixed(2)),
        right: rightV == null ? null : Number(rightV.toFixed(2)),
        asymmetryPct: aPct == null ? null : Number(aPct.toFixed(1)),
        lsiPct: lsi == null ? null : Number(lsi.toFixed(0)),
        stiffnessAsymPct: stiffAsym == null ? null : Number(stiffAsym.toFixed(1)),
        jumpHeightAsymPct: jhAsym == null ? null : Number(jhAsym.toFixed(1)),
      });
    }
  }

  // ── Limb strength: NordBord (hamstring) + ForceFrame (groin/adductor…) ──────
  // These devices report L/R peak force directly. Latest test per test-type; the
  // RTP gate is L/R asymmetry (Bishop 2020) + involved-vs-uninvolved LSI.
  const limbStrength: RtpLimbStrengthTest[] = [];
  // One history entry (a single dated test) from a raw row. Asymmetry recomputed
  // from the raw peak forces (ground truth) — a legacy asymmetry_percent=0 must
  // not mask a real L≠R gap; the stored value is only a fallback when a peak is
  // absent.
  const buildEntry = (row: Record<string, unknown>, withMovement: boolean): RtpLimbStrengthEntry => {
    const leftN = num(row.left_peak_force_n);
    const rightN = num(row.right_peak_force_n);
    const pct = leftN != null && rightN != null ? asymPct(leftN, rightN) : num(row.asymmetry_percent);
    return {
      testDate: row.test_timestamp ? String(row.test_timestamp).slice(0, 10) : null,
      movement: withMovement ? ((row.movement_pattern as string) ?? null) : null,
      leftN: leftN == null ? null : Math.round(leftN),
      rightN: rightN == null ? null : Math.round(rightN),
      asymmetryPct: pct == null ? null : Number(pct.toFixed(1)),
      asymmetrySide: leftN != null && rightN != null ? (leftN <= rightN ? "left" : "right") : ((row.asymmetry_side as string) ?? null),
      status: asymmetryStatus(pct),
    };
  };
  // Assemble one RtpLimbStrengthTest per (device, test type): latest = newest
  // test, history = every test of that type (rows arrive newest-first).
  const assembleGroups = (
    rows: Array<Record<string, unknown>>,
    device: "nordbord" | "forceframe",
    withMovement: boolean,
    labelFor: (type: string, latest: Record<string, unknown>) => { label: string; bodyRegion: string | null },
  ) => {
    const byType = new Map<string, Array<Record<string, unknown>>>();
    for (const r of rows.filter((r) => r.is_valid !== false)) {
      const type = String(r.test_type ?? (device === "nordbord" ? "Nordic" : "Test"));
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(r);
    }
    for (const [type, group] of byType) {
      const history = group.map((g) => buildEntry(g, withMovement));
      const top = history[0];
      let lsi: number | null = null;
      if (top.leftN != null && top.rightN != null && top.leftN > 0 && top.rightN > 0) {
        if (side === "right") lsi = (top.rightN / top.leftN) * 100;
        else if (side === "left") lsi = (top.leftN / top.rightN) * 100;
      }
      const { label, bodyRegion } = labelFor(type, group[0]);
      limbStrength.push({
        device, testType: type, label, bodyRegion,
        testDate: top.testDate, leftN: top.leftN, rightN: top.rightN,
        asymmetryPct: top.asymmetryPct, asymmetrySide: top.asymmetrySide,
        lsiPct: lsi == null ? null : Number(lsi.toFixed(0)), status: top.status, history,
      });
    }
  };
  assembleGroups((nbRes.data ?? []) as Array<Record<string, unknown>>, "nordbord", false, (type) => ({
    label: /nordic/i.test(type) ? "Nordic hamstring" : `${type} (hamstring)`,
    bodyRegion: "Hamstring",
  }));
  assembleGroups((ffRes.data ?? []) as Array<Record<string, unknown>>, "forceframe", true, (type, latest) => {
    const region = (latest.body_region as string) ?? (type.split(/[\s/]/)[0] || null);
    const movement = (latest.movement_pattern as string) ?? type;
    const isGroin = /hip/i.test(type + movement) && /ad|add|groin|adduct/i.test(type + movement);
    return { label: isGroin ? `${type} (groin)` : type, bodyRegion: region };
  });
  // Hamstring first, then groin, then the rest — RTP reading order.
  const groinIdx = (e: RtpLimbStrengthTest) => /groin/i.test(e.label) ? 1 : 2;
  limbStrength.sort((a, b) => (a.device === "nordbord" ? 0 : groinIdx(a)) - (b.device === "nordbord" ? 0 : groinIdx(b)));

  // RTP-relevant asymmetries fed to the clearance criteria.
  const nordicHamstringAsymPct = limbStrength.find((e) => e.device === "nordbord")?.asymmetryPct ?? null;
  const groinAdductorAsymPct = limbStrength.find((e) => /groin/i.test(e.label))?.asymmetryPct ?? null;

  // ── Body mass (from latest CMJ raw payload weight) ──────────────────────────
  const weightPayload = (weightRes.data ?? [])[0] as { payload?: { weight?: unknown } } | undefined;
  const bodyMassKg = num(weightPayload?.payload?.weight);

  // ── Criteria + decision (rules) ─────────────────────────────────────────────
  const sldj = battery.find((b) => b.testType === "SLDJ");
  const slIso = battery.find((b) => b.testType === "SLISOSQT");
  const dj = battery.find((b) => b.testType === "DJ");
  // RTP framing when the player is currently injured / returning; otherwise a
  // plain force-plate assessment (no clearance language).
  const mode: "RTP" | "ASSESSMENT" = rtt.currentlyInjured || (injury?.active ?? false) ? "RTP" : "ASSESSMENT";
  const criteria = buildRtpCriteria({
    cmjJumpHeightCm: cmj?.jumpHeightCm ?? null,
    cmjAsymmetryPct: cmj?.asymmetryPct ?? null,
    codHighAsymPct: cod?.asymPct ?? null,
    imtpRelNkg: imtp?.relPeakForceNkg ?? null,
    imtpAsymPct: imtp?.asymmetryPct ?? null,
    djRsi: dj?.primaryValue ?? null,
    sldjRsiAsymPct: sldj?.asymmetryPct ?? null,
    sldjStiffnessAsymPct: sldj?.stiffnessAsymPct ?? null,
    sldjJumpHeightAsymPct: sldj?.jumpHeightAsymPct ?? null,
    unilateralIsoAsymPct: slIso?.asymmetryPct ?? null,
    nordicHamstringAsymPct,
    groinAdductorAsymPct,
    valgusSeverity: valgus?.severity ?? null,
    // The exposure gate is a clearance concern — only surface it in RTP (returning) mode,
    // and only when there's a real baseline (a healthy player's light fortnight is not a flag).
    codExposure: mode === "RTP" && codExposure.status !== "no_data"
      ? { status: codExposure.status, ratioPct: codExposure.exposureRatio == null ? null : Math.round(codExposure.exposureRatio * 100), recentDays: codExposure.recentDays }
      : null,
  });
  const domains = buildRtpDomains(criteria);
  const evaluable = criteria.filter((c) => c.status !== "NO_DATA");
  const decision = rtpDecision(criteria, rtt.currentlyInjured, mode);
  const recommendations = buildRtpRecommendations(criteria, rtt.currentlyInjured);

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
    mode,
    injury,
    cmj,
    imtp,
    battery,
    limbStrength,
    cod,
    rtt: { variant: rtt.variant, layoffDays: rtt.layoffDays, stage: rtt.rtp?.stage ?? null, currentlyInjured: rtt.currentlyInjured },
    criteria,
    domains,
    criteriaMet: evaluable.filter((c) => c.met).length,
    criteriaTotal: evaluable.length,
    decision,
    valgus,
    recommendations,
    coverage: (() => {
      const present = ["CMJ", ...(imtp ? ["IMTP"] : []), ...battery.map((b) => b.label), ...limbStrength.map((l) => l.label), ...(cod ? ["Change-of-direction (IMA)"] : [])];
      const hasHamstring = limbStrength.some((l) => l.device === "nordbord");
      const hasGroin = limbStrength.some((l) => /groin/i.test(l.label));
      const allPending = [
        ...(imtp ? [] : ["IMTP"]), "Drop Jump", "Single-Leg Drop Jump", "Single-Leg Isometric Squat",
        ...(hasHamstring ? [] : ["Nordic hamstring (NordBord)"]),
        ...(hasGroin ? [] : ["Groin/adductor (ForceFrame)"]),
      ];
      const have = new Set([...(imtp ? ["IMTP"] : []), ...battery.map((b) => b.label)]);
      const pending = allPending.filter((p) => !have.has(p) && !(p === "Drop Jump" && have.has("Drop Jump")));
      return {
        present: [...present, ...(valgus ? ["Dynamic valgus (coach-assessed)"] : [])],
        pending: [...pending, ...(valgus ? [] : ["Dynamic valgus (coach-assessed)"])],
      };
    })(),
  };
}
