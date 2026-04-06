import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

export const whoopAdapter: IntegrationProviderAdapter = {
  provider: "WHOOP",
  canHandle(payload) {
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("whoop") || text.includes("recovery_score") || text.includes("strain");
  },
  normalize(raw) {
    const rows = safeArray(raw.payload);
    if (!rows.length) {
      return emptyResult("WHOOP payload had no usable rows.", [
        makeConflict({
          provider: "WHOOP",
          type: "UNSUPPORTED_PAYLOAD",
          severity: "MODERATE",
          summary: "Could not parse WHOOP payload rows.",
          rawReferenceId: raw.id,
        }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];

    for (const row of rows) {
      const externalAthleteId = asString(row.athlete_id ?? row.user_id ?? row.id);
      const timestamp = asString(row.timestamp ?? row.date ?? row.day);
      if (!timestamp) {
        conflicts.push(
          makeConflict({
            provider: "WHOOP",
            type: "MISSING_TIMESTAMP",
            severity: "LOW",
            summary: "WHOOP row missing timestamp.",
            rawReferenceId: raw.id,
            externalAthleteId,
          }),
        );
      }

      const recoveryScore = asNumber(row.recovery_score ?? row.recovery);
      const sleepDuration = asNumber(row.sleep_duration ?? row.sleep_seconds);
      const strainScore = asNumber(row.strain_score ?? row.strain);
      const hrv = asNumber(row.hrv ?? row.hrv_ms);
      const restingHr = asNumber(row.resting_hr ?? row.rhr);

      if (recoveryScore != null)
        normalizedMetrics.push(metric({ provider: "WHOOP", category: "RECOVERY", externalAthleteId, timestamp, metricKey: "recovery_score", metricLabel: "Recovery score", numericValue: recoveryScore, unit: "score", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (sleepDuration != null)
        normalizedMetrics.push(metric({ provider: "WHOOP", category: "SLEEP", externalAthleteId, timestamp, metricKey: "sleep_duration", metricLabel: "Sleep duration", numericValue: sleepDuration, unit: "sec", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (strainScore != null)
        normalizedMetrics.push(metric({ provider: "WHOOP", category: "LOAD", externalAthleteId, timestamp, metricKey: "strain_score", metricLabel: "Strain score", numericValue: strainScore, unit: "score", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (hrv != null)
        normalizedMetrics.push(metric({ provider: "WHOOP", category: "HEART_RATE", externalAthleteId, timestamp, metricKey: "hrv", metricLabel: "HRV", numericValue: hrv, unit: "ms", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.8 }));
      if (restingHr != null)
        normalizedMetrics.push(metric({ provider: "WHOOP", category: "HEART_RATE", externalAthleteId, timestamp, metricKey: "resting_hr", metricLabel: "Resting HR", numericValue: restingHr, unit: "bpm", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.8 }));
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings: normalizedMetrics.length ? [] : ["WHOOP payload parsed but no supported metrics found."],
      summary: `WHOOP normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};
