import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

export const garminAdapter: IntegrationProviderAdapter = {
  provider: "GARMIN",
  canHandle(payload) {
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("garmin") || text.includes("body_battery") || text.includes("stress_score") || text.includes("sleep_score");
  },
  normalize(raw) {
    const rows = safeArray(raw.payload);
    if (!rows.length) {
      return emptyResult("GARMIN payload had no usable rows.", [
        makeConflict({
          provider: "GARMIN",
          type: "UNSUPPORTED_PAYLOAD",
          severity: "MODERATE",
          summary: "Could not parse GARMIN payload rows.",
          rawReferenceId: raw.id,
        }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];
    const warnings: string[] = [];

    for (const row of rows) {
      const externalAthleteId = asString(row.athlete_id ?? row.user_id ?? row.id);
      const timestamp = asString(row.timestamp ?? row.date ?? row.day);
      if (!timestamp) {
        conflicts.push(
          makeConflict({
            provider: "GARMIN",
            type: "MISSING_TIMESTAMP",
            severity: "LOW",
            summary: "GARMIN row missing timestamp.",
            rawReferenceId: raw.id,
            externalAthleteId,
          }),
        );
      }

      const sleepScore = asNumber(row.sleep_score ?? row.sleep_quality_score);
      const sleepDuration = asNumber(row.sleep_duration ?? row.sleep_seconds);
      const restingHr = asNumber(row.resting_hr ?? row.rhr);
      const bodyBattery = asNumber(row.body_battery ?? row.recovery_score);
      const stressScore = asNumber(row.stress_score ?? row.stress);
      const trainingLoad = asNumber(row.training_load ?? row.load);

      if (sleepScore != null) {
        normalizedMetrics.push(
          metric({
            provider: "GARMIN",
            category: "SLEEP",
            externalAthleteId,
            timestamp,
            metricKey: "sleep_score",
            metricLabel: "Sleep score",
            numericValue: sleepScore,
            unit: "score",
            sourceRef: raw.sourceRef ?? raw.id,
            confidence: 0.82,
          }),
        );
      }
      if (sleepDuration != null) {
        normalizedMetrics.push(
          metric({
            provider: "GARMIN",
            category: "SLEEP",
            externalAthleteId,
            timestamp,
            metricKey: "sleep_duration",
            metricLabel: "Sleep duration",
            numericValue: sleepDuration,
            unit: "sec",
            sourceRef: raw.sourceRef ?? raw.id,
            confidence: 0.8,
          }),
        );
      }
      if (restingHr != null) {
        normalizedMetrics.push(
          metric({
            provider: "GARMIN",
            category: "HEART_RATE",
            externalAthleteId,
            timestamp,
            metricKey: "resting_hr",
            metricLabel: "Resting HR",
            numericValue: restingHr,
            unit: "bpm",
            sourceRef: raw.sourceRef ?? raw.id,
            confidence: 0.82,
          }),
        );
      }
      if (bodyBattery != null) {
        normalizedMetrics.push(
          metric({
            provider: "GARMIN",
            category: "RECOVERY",
            externalAthleteId,
            timestamp,
            metricKey: "recovery_score",
            metricLabel: "Body battery/recovery",
            numericValue: bodyBattery,
            unit: "score",
            sourceRef: raw.sourceRef ?? raw.id,
            confidence: 0.74,
          }),
        );
      }
      if (stressScore != null) {
        normalizedMetrics.push(
          metric({
            provider: "GARMIN",
            category: "WELLNESS",
            externalAthleteId,
            timestamp,
            metricKey: "stress_score",
            metricLabel: "Stress score",
            numericValue: stressScore,
            unit: "score",
            sourceRef: raw.sourceRef ?? raw.id,
            confidence: 0.74,
          }),
        );
      }
      if (trainingLoad != null) {
        normalizedMetrics.push(
          metric({
            provider: "GARMIN",
            category: "LOAD",
            externalAthleteId,
            timestamp,
            metricKey: "session_load",
            metricLabel: "Session load",
            numericValue: trainingLoad,
            unit: "au",
            sourceRef: raw.sourceRef ?? raw.id,
            confidence: 0.72,
          }),
        );
      }

      if (
        sleepScore == null &&
        sleepDuration == null &&
        restingHr == null &&
        bodyBattery == null &&
        stressScore == null &&
        trainingLoad == null
      ) {
        warnings.push("GARMIN row contained no supported v1 metrics.");
      }
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings,
      summary: `GARMIN normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};

