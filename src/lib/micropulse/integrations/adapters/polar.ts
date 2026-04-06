import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

export const polarAdapter: IntegrationProviderAdapter = {
  provider: "POLAR",
  canHandle(payload) {
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("polar") || text.includes("training_load") || text.includes("heart_rate");
  },
  normalize(raw) {
    const rows = safeArray(raw.payload);
    if (!rows.length) {
      return emptyResult("POLAR payload had no usable rows.", [
        makeConflict({ provider: "POLAR", type: "UNSUPPORTED_PAYLOAD", severity: "MODERATE", summary: "Could not parse POLAR payload rows.", rawReferenceId: raw.id }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];
    for (const row of rows) {
      const externalAthleteId = asString(row.athlete_id ?? row.user_id ?? row.id);
      const timestamp = asString(row.timestamp ?? row.date ?? row.day);
      if (!timestamp) conflicts.push(makeConflict({ provider: "POLAR", type: "MISSING_TIMESTAMP", severity: "LOW", summary: "POLAR row missing timestamp.", rawReferenceId: raw.id, externalAthleteId }));

      const trainingLoad = asNumber(row.training_load ?? row.session_load);
      const avgHr = asNumber(row.avg_hr ?? row.heart_rate_avg);
      const sleepScore = asNumber(row.sleep_score);
      const readinessProxy = asNumber(row.readiness_proxy ?? row.recovery_status);

      if (trainingLoad != null) normalizedMetrics.push(metric({ provider: "POLAR", category: "LOAD", externalAthleteId, timestamp, metricKey: "session_load", metricLabel: "Session load", numericValue: trainingLoad, unit: "au", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (avgHr != null) normalizedMetrics.push(metric({ provider: "POLAR", category: "HEART_RATE", externalAthleteId, timestamp, metricKey: "avg_hr", metricLabel: "Average HR", numericValue: avgHr, unit: "bpm", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (sleepScore != null) normalizedMetrics.push(metric({ provider: "POLAR", category: "SLEEP", externalAthleteId, timestamp, metricKey: "sleep_score", metricLabel: "Sleep score", numericValue: sleepScore, unit: "score", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.75 }));
      if (readinessProxy != null) normalizedMetrics.push(metric({ provider: "POLAR", category: "READINESS", externalAthleteId, timestamp, metricKey: "readiness_proxy", metricLabel: "Readiness proxy", numericValue: readinessProxy, unit: "score", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.7 }));
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings: normalizedMetrics.length ? [] : ["POLAR payload parsed but no supported metrics found."],
      summary: `POLAR normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};
