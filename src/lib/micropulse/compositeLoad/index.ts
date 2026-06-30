/**
 * Composite Load Concern
 *
 * Merges internal load (RPE-based ACWR) and external load
 * (GPS/Catapult neuromuscular burden score) into a single
 * concern level for the decision engine.
 *
 * Rationale:
 *   - Internal load (RPE × duration) measures perceived effort and
 *     accumulated training stress over time. ACWR > 1.3 signals
 *     meaningful spike risk.
 *   - External load (GPS) measures mechanical/neuromuscular demand:
 *     high-speed running, decelerations, sprint exposure. The
 *     neuromuscularBurdenScore (0–1) from signals.ts captures this.
 *   - Neither signal alone is sufficient. High GPS burden with low RPE
 *     (e.g. technical session with lots of sprinting) and vice versa
 *     both carry risk. Combining them produces a more complete picture.
 *
 * Weights: 55% internal (RPE ACWR) · 45% external (GPS burden).
 * If only one signal is available, apply a 0.80 confidence discount
 * on the available signal rather than defaulting to "none".
 *
 * Output → concern level used by buildAthleteDecision → loadAction:
 *   "none"     → loadAction stays "normal"
 *   "low"      → loadAction → "monitor"
 *   "moderate" → loadAction → "reduce"
 *   "high"     → loadAction → "cap"
 */

export type LoadConcernLevel = "none" | "low" | "moderate" | "high";

export type RpeAcwrInput = {
  /** 7-day acute load (sum of session_load in last 7 days) */
  acute7: number;
  /** 28-day chronic load (sum / 4) */
  chronic28: number;
  /** acute / chronic ratio; null if chronic28 === 0 */
  acwr: number | null;
  /** number of real (non-imputed) RPE sessions in last 28 days */
  sessionCount: number;
};

/**
 * Map RPE ACWR to a 0–1 internal load score.
 *
 * ACWR zones (Gabbett 2016, Hulin et al. 2014):
 *   < 0.80  → undertrain / deload  → 0.10 (mild concern, monotony risk)
 *   0.80–1.30 → optimal            → 0.00
 *   1.30–1.50 → caution             → 0.50
 *   > 1.50  → high risk             → 1.00
 *
 * null → not computable (no chronic baseline) → null (signal excluded)
 */
function rpeAcwrToScore(acwr: number | null): number | null {
  if (acwr == null) return null;
  if (acwr < 0.8) return 0.10;
  if (acwr <= 1.3) return 0.00;
  if (acwr <= 1.5) return 0.50;
  return 1.00;
}

/**
 * Convert a continuous composite score (0–1) to a concern level.
 *
 * Thresholds are intentionally conservative — we prefer "monitor"
 * over false "none" when signal quality is limited.
 */
function scoreToConcernLevel(score: number): LoadConcernLevel {
  if (score < 0.15) return "none";
  if (score < 0.40) return "low";
  if (score < 0.68) return "moderate";
  return "high";
}

export type CompositeLoadInput = {
  /**
   * RPE-based acute:chronic workload ratio (from session_rpe_entries).
   * Null if fewer than 5 RPE sessions exist in the last 28 days.
   */
  rpeAcwr: RpeAcwrInput | null;
  /**
   * GPS-derived neuromuscular burden score (0–1) from signals.ts.
   * Null if GPS data quality is "insufficient".
   */
  neuromuscularBurdenScore: number | null;
  /**
   * Categorical GPS load state — used as a sanity check / tie-breaker.
   */
  externalLoadState: "normal" | "elevated" | "high" | "unknown";
  /**
   * Residual MLI (3-day weighted accumulation of Mechanical Load Index).
   * Bands: <70 NORMAL, 70-109 ELEVATED, 110-134 CAUTION, ≥135 HIGH.
   * Used as a safety net — if residual is CAUTION or HIGH,
   * composite concern is bumped to at least "moderate".
   */
  residualMli?: number | null;
  /**
   * Metabolic Load Score (0–100, z-score based).
   * Measures aerobic/metabolic demand — distinct from mechanical GPS burden.
   * When available, enters as a third dimension in composite scoring.
   */
  metabolicLoadScore?: number | null;
  /**
   * Metabolic confidence — only trust score when "medium" or "high".
   */
  metabolicConfidence?: "low" | "medium" | "high" | null;

  // ── Deceleration-specific inputs (McBurnie et al. 2022) ──────────

  /**
   * Standalone decel burden score (0–1) from signals.ts.
   * Isolates high-intensity braking load as independent KPI.
   */
  decelBurdenScore?: number | null;
  /**
   * Residual Decel Index — 3-day weighted accumulation.
   * Same pattern as Residual MLI but decel-specific.
   * Bands: <60 NORMAL, 60-99 ELEVATED, 100-134 CAUTION, ≥135 HIGH.
   */
  residualDecel?: number | null;
  /**
   * Accel:decel ratio from high-intensity efforts.
   * < 0.7 eccentric-dominant, > 1.3 concentric-dominant.
   */
  accelDecelRatio?: number | null;

  // ── HID% fatigue trend (Harper et al. 2019) ──────────────────────

  /**
   * True when HID% declined ≥20% vs 7-day avg with stable total distance.
   * Signals neuromuscular fatigue — athlete can't reach high speeds.
   */
  hidFatigueFlag?: boolean;
  /** Relative HID% decline (0–1 scale). Null when trend unavailable. */
  hidDeclinePct?: number | null;
};

export type CompositeLoadResult = {
  concernLevel: LoadConcernLevel;
  /** 0–1 composite score before thresholding */
  compositeScore: number;
  /** Which signals contributed */
  sources: Array<"rpe_acwr" | "gps_burden" | "residual_mli" | "metabolic" | "decel_burden" | "residual_decel" | "hid_fatigue">;
  /** Human-readable summary for logging */
  summary: string;
  /**
   * Coach-facing explanation lines describing WHY concern was raised.
   * Empty when concernLevel === "none".
   */
  escalationReasons: string[];
  /**
   * Composite fatigue type when both MLI and Metabolic are available.
   * null when insufficient data.
   */
  fatigueType?: "global_fatigue" | "mechanical_fatigue" | "metabolic_fatigue" | "normal" | null;
};

/**
 * Convert Metabolic Load Score (0–100) to a 0–1 concern score.
 *
 * Metabolic bands (z-score normalized):
 *   < 35  → low     → 0.00 (no concern)
 *   35–54 → moderate → 0.10 (minimal)
 *   55–74 → high    → 0.45 (moderate concern)
 *   ≥ 75  → very_high → 0.85 (high concern)
 */
function metabolicToScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score < 35) return 0.00;
  if (score < 55) return 0.10;
  if (score < 75) return 0.45;
  return 0.85;
}

/**
 * Residual MLI band classification.
 *   < 70  → NORMAL
 *   70–109 → ELEVATED
 *   110–134 → CAUTION
 *   ≥ 135 → HIGH
 */
function residualMliBand(residual: number | null | undefined): "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH" | null {
  if (residual == null || !Number.isFinite(residual)) return null;
  if (residual < 70) return "NORMAL";
  if (residual < 110) return "ELEVATED";
  if (residual < 135) return "CAUTION";
  return "HIGH";
}

export function computeCompositeLoadConcern(input: CompositeLoadInput): CompositeLoadResult {
  const internalScore = rpeAcwrToScore(input.rpeAcwr?.acwr ?? null);
  const externalScore =
    input.neuromuscularBurdenScore != null &&
    input.externalLoadState !== "unknown" &&
    Number.isFinite(input.neuromuscularBurdenScore)
      ? input.neuromuscularBurdenScore
      : null;

  // Metabolic score — only use when confidence is medium or high
  const metabolicConfOk = input.metabolicConfidence === "medium" || input.metabolicConfidence === "high";
  const metabolicScore = metabolicConfOk ? metabolicToScore(input.metabolicLoadScore) : null;

  const sources: CompositeLoadResult["sources"] = [];
  if (internalScore != null) sources.push("rpe_acwr");
  if (externalScore != null) sources.push("gps_burden");
  if (metabolicScore != null) sources.push("metabolic");

  // Neither signal available
  if (internalScore == null && externalScore == null && metabolicScore == null) {
    return { concernLevel: "none", compositeScore: 0, sources, summary: "No load data available.", escalationReasons: [], fatigueType: null };
  }

  // ── Build composite score with dynamic weighting ──
  //
  // When all three signals are present:
  //   40% RPE ACWR · 35% NBS (GPS) · 25% Metabolic
  //
  // When only RPE + GPS:
  //   55% RPE · 45% GPS  (original weights preserved)
  //
  // When only one or two signals: normalize available weights
  // and apply 0.80 confidence discount if only one signal.
  let compositeScore: number;

  if (internalScore != null && externalScore != null && metabolicScore != null) {
    // All three signals → new tri-dimensional weights
    compositeScore = internalScore * 0.40 + externalScore * 0.35 + metabolicScore * 0.25;
  } else if (internalScore != null && externalScore != null) {
    // Original two-signal mode: 55% internal, 45% external
    compositeScore = internalScore * 0.55 + externalScore * 0.45;
  } else if (internalScore != null && metabolicScore != null) {
    // RPE + Metabolic (no GPS)
    compositeScore = (internalScore * 0.60 + metabolicScore * 0.40) * 0.85;
  } else if (externalScore != null && metabolicScore != null) {
    // GPS + Metabolic (no RPE)
    compositeScore = (externalScore * 0.55 + metabolicScore * 0.45) * 0.85;
  } else if (internalScore != null) {
    compositeScore = internalScore * 0.80;
  } else if (externalScore != null) {
    compositeScore = externalScore * 0.80;
  } else {
    // Only metabolic — lowest confidence
    compositeScore = (metabolicScore as number) * 0.70;
  }

  // Tie-breaker: if GPS says "high" but composite is "low", bump to "moderate"
  if (
    input.externalLoadState === "high" &&
    compositeScore < 0.40
  ) {
    compositeScore = Math.max(compositeScore, 0.40);
  }

  // ── Residual MLI safety net ──
  // If accumulated mechanical load (3-day weighted) is in CAUTION or HIGH,
  // ensure concern level is at least "moderate" regardless of daily signals.
  // This catches multi-day accumulation that single-day metrics miss.
  const resBand = residualMliBand(input.residualMli);
  if (resBand === "HIGH") {
    compositeScore = Math.max(compositeScore, 0.68); // → "high"
    if (!sources.includes("residual_mli")) sources.push("residual_mli");
  } else if (resBand === "CAUTION") {
    compositeScore = Math.max(compositeScore, 0.40); // → "moderate"
    if (!sources.includes("residual_mli")) sources.push("residual_mli");
  }

  // ── Residual Decel safety net (mirrors Residual MLI pattern) ──
  // If accumulated eccentric decel load over 3 days is in CAUTION or HIGH,
  // ensure concern level is at least "moderate". This catches the
  // "mechanical fatigue failure" phenomenon (McBurnie et al. 2022).
  const residualDecelVal = input.residualDecel;
  let residualDecelBandLabel: "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH" | null = null;
  if (residualDecelVal != null && Number.isFinite(residualDecelVal)) {
    if (residualDecelVal >= 135) residualDecelBandLabel = "HIGH";
    else if (residualDecelVal >= 100) residualDecelBandLabel = "CAUTION";
    else if (residualDecelVal >= 60) residualDecelBandLabel = "ELEVATED";
    else residualDecelBandLabel = "NORMAL";

    if (residualDecelBandLabel === "HIGH") {
      compositeScore = Math.max(compositeScore, 0.68); // → "high"
      if (!sources.includes("residual_decel")) sources.push("residual_decel");
    } else if (residualDecelBandLabel === "CAUTION") {
      compositeScore = Math.max(compositeScore, 0.40); // → "moderate"
      if (!sources.includes("residual_decel")) sources.push("residual_decel");
    }
  }

  // ── Decel burden escalation ──
  // If today's decel burden is elevated/high, push into sources
  const decelBurdenVal = input.decelBurdenScore;
  if (decelBurdenVal != null && decelBurdenVal >= 0.45) {
    if (!sources.includes("decel_burden")) sources.push("decel_burden");
  }

  const concernLevel = scoreToConcernLevel(compositeScore);

  // ── Coach-facing escalation reasons ──
  const escalationReasons: string[] = [];
  if (concernLevel !== "none") {
    if (internalScore != null && internalScore >= 0.50) {
      const acwrVal = input.rpeAcwr?.acwr;
      escalationReasons.push(
        acwrVal != null && acwrVal > 1.5
          ? `ACWR is ${acwrVal.toFixed(2)} — a large, fast load spike (Gabbett 2016; a spike-size signal, not an injury predictor).`
          : `ACWR is ${acwrVal?.toFixed(2) ?? "n/a"} — above the familiar range.`
      );
    }
    if (externalScore != null && externalScore >= 0.34) {
      escalationReasons.push("GPS neuromuscular burden is elevated above baseline.");
    }
    if (metabolicScore != null && metabolicScore >= 0.45) {
      escalationReasons.push(
        `Metabolic load is ${input.metabolicLoadScore?.toFixed(0) ?? "?"} — high energy-system demand.`
      );
    }
    if (resBand === "HIGH") {
      escalationReasons.push(
        `Residual MLI is ${input.residualMli?.toFixed(0) ?? "?"} (HIGH) — accumulated mechanical stress over 3 days.`
      );
    } else if (resBand === "CAUTION") {
      escalationReasons.push(
        `Residual MLI is ${input.residualMli?.toFixed(0) ?? "?"} (CAUTION) — multi-day mechanical load building up.`
      );
    }
    // Decel-specific escalation reasons
    if (decelBurdenVal != null && decelBurdenVal >= 0.70) {
      escalationReasons.push(
        "Decel burden is HIGH — eccentric braking load significantly above baseline. Avoid COD-heavy drills."
      );
    } else if (decelBurdenVal != null && decelBurdenVal >= 0.45) {
      escalationReasons.push(
        "Decel burden is elevated — high-intensity braking actions above normal. Monitor ACL / quadriceps / patellar tendon load (peak quad activation 161% MVC during decel — McBurnie 2022)."
      );
    }
    if (residualDecelBandLabel === "HIGH") {
      escalationReasons.push(
        `Residual Decel is ${residualDecelVal?.toFixed(0) ?? "?"} (HIGH) — 3-day accumulated deceleration stress. Recovery priority.`
      );
    } else if (residualDecelBandLabel === "CAUTION") {
      escalationReasons.push(
        `Residual Decel is ${residualDecelVal?.toFixed(0) ?? "?"} (CAUTION) — deceleration load accumulating over multiple days.`
      );
    }
    if (input.accelDecelRatio != null && input.accelDecelRatio < 0.7) {
      escalationReasons.push(
        `Accel:Decel ratio ${input.accelDecelRatio.toFixed(2)} — eccentric-dominant session. Elevated ACL + quadriceps + patellar tendon strain risk (decel mid-eccentric foot strike → quad 161% MVC + hamstring −87% co-activation per McBurnie 2022).`
      );
    }
    // HID% fatigue trend (Harper et al. 2019)
    if (input.hidFatigueFlag === true) {
      const declinePctStr = input.hidDeclinePct != null ? `${(input.hidDeclinePct * 100).toFixed(0)}%` : "?";
      escalationReasons.push(
        `HID% declined ${declinePctStr} vs 7-day avg — neuromuscular fatigue signal. Athlete covers distance but at lower intensity.`
      );
      if (!sources.includes("hid_fatigue")) sources.push("hid_fatigue");
    }
  }

  // ── Fatigue type classification ──
  const mliRaw = input.metabolicLoadScore;
  const nbsHigh = externalScore != null && externalScore >= 0.34;
  const metaHigh = mliRaw != null && mliRaw >= 65;
  // For fatigue type we check if mechanical (GPS) is high — proxy for MLI
  let fatigueType: CompositeLoadResult["fatigueType"] = null;
  if (nbsHigh && metaHigh) {
    fatigueType = "global_fatigue";
    if (!escalationReasons.some((r) => r.includes("Global"))) {
      escalationReasons.push("Global fatigue — both mechanical and metabolic systems under high stress.");
    }
  } else if (nbsHigh && !metaHigh) {
    fatigueType = "mechanical_fatigue";
  } else if (!nbsHigh && metaHigh) {
    fatigueType = "metabolic_fatigue";
  } else {
    fatigueType = "normal";
  }

  const acwrStr = input.rpeAcwr?.acwr != null ? input.rpeAcwr.acwr.toFixed(2) : "n/a";
  const gpsStr = externalScore != null ? externalScore.toFixed(2) : "n/a";
  const metStr = metabolicScore != null ? `${input.metabolicLoadScore?.toFixed(0)}(${metabolicScore.toFixed(2)})` : "n/a";
  const resStr = input.residualMli != null ? `${input.residualMli.toFixed(0)}[${resBand}]` : "n/a";
  const decelStr = decelBurdenVal != null ? decelBurdenVal.toFixed(2) : "n/a";
  const resDecelStr = residualDecelVal != null ? `${residualDecelVal.toFixed(0)}[${residualDecelBandLabel}]` : "n/a";
  const adRatioStr = input.accelDecelRatio != null ? input.accelDecelRatio.toFixed(2) : "n/a";
  const hidFatigueStr = input.hidFatigueFlag ? `YES(${((input.hidDeclinePct ?? 0) * 100).toFixed(0)}%)` : "no";
  const summary =
    `composite=${compositeScore.toFixed(2)} (rpe_acwr=${acwrStr}, gps_burden=${gpsStr}, metabolic=${metStr}, residual_mli=${resStr}, decel_burden=${decelStr}, residual_decel=${resDecelStr}, ad_ratio=${adRatioStr}, hid_fatigue=${hidFatigueStr}) → ${concernLevel}`;

  return { concernLevel, compositeScore, sources, summary, escalationReasons, fatigueType };
}

/**
 * Compute RPE ACWR from raw session load rows.
 * Accepts an array of { session_date, session_load, is_imputed }
 * rows for a single player, sorted oldest-first.
 *
 * Returns null if fewer than MIN_SESSIONS real sessions exist
 * (to avoid noisy ACWR from sparse data).
 */
const MIN_SESSIONS_FOR_ACWR = 5;

export function computeRpeAcwrFromRows(
  rows: Array<{ session_date: string; session_load: number | null; is_imputed?: boolean | null }>,
  referenceDate: string
): RpeAcwrInput | null {
  const refMs = new Date(`${referenceDate}T00:00:00Z`).getTime();

  function daysBefore(days: number): string {
    const d = new Date(refMs);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  const cutoff7  = daysBefore(6);   // last 7 days inclusive
  const cutoff28 = daysBefore(27);  // last 28 days inclusive

  const inWindow = rows.filter(
    (r) => r.session_date >= cutoff28 && r.session_date <= referenceDate
  );

  const realCount = inWindow.filter((r) => !r.is_imputed).length;
  if (realCount < MIN_SESSIONS_FOR_ACWR) return null;

  const acute7 = inWindow
    .filter((r) => r.session_date >= cutoff7)
    .reduce((s, r) => s + (Number(r.session_load ?? 0)), 0);

  const total28 = inWindow
    .reduce((s, r) => s + (Number(r.session_load ?? 0)), 0);

  const chronic28 = total28 / 4;
  const acwr = chronic28 > 0 ? Math.round((acute7 / chronic28) * 100) / 100 : null;

  return { acute7, chronic28, acwr, sessionCount: realCount };
}
