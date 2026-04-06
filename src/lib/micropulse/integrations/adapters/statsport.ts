import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

export const statsportAdapter: IntegrationProviderAdapter = {
  provider: "STATSPORT",
  canHandle(payload) {
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("statsport") || text.includes("sonra") || text.includes("total_distance");
  },
  normalize(raw) {
    const rows = safeArray(raw.payload);
    if (!rows.length) {
      return emptyResult("STATSPORT payload had no usable rows.", [
        makeConflict({ provider: "STATSPORT", type: "UNSUPPORTED_PAYLOAD", severity: "MODERATE", summary: "Could not parse STATSPORT payload rows.", rawReferenceId: raw.id }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];
    for (const row of rows) {
      const externalAthleteId = asString(row.athlete_id ?? row.player_id ?? row.id);
      const timestamp = asString(row.timestamp ?? row.session_date ?? row.date);
      if (!timestamp) conflicts.push(makeConflict({ provider: "STATSPORT", type: "MISSING_TIMESTAMP", severity: "LOW", summary: "STATSPORT row missing timestamp.", rawReferenceId: raw.id, externalAthleteId }));

      const totalDistance = asNumber(row.total_distance ?? row.distance);
      const highSpeed = asNumber(row.high_speed_running ?? row.hsr ?? row.high_speed_distance);
      const playerLoad = asNumber(row.player_load ?? row.dynamic_stress_load ?? row.load);
      const sprintDistance = asNumber(row.sprint_distance ?? row.high_intensity_distance);
      const maxVelocity = asNumber(row.max_velocity ?? row.max_speed);
      const accelerations = asNumber(row.accelerations ?? row.accel_count);
      const decelerations = asNumber(row.decelerations ?? row.decel_count);
      const avgHr = asNumber(row.avg_heart_rate ?? row.avg_hr);
      const maxHr = asNumber(row.max_heart_rate ?? row.max_hr);

      if (totalDistance != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "GPS", externalAthleteId, timestamp, metricKey: "total_distance", metricLabel: "Total distance", numericValue: totalDistance, unit: "m", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (highSpeed != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "GPS", externalAthleteId, timestamp, metricKey: "high_speed_distance", metricLabel: "High speed running", numericValue: highSpeed, unit: "m", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (sprintDistance != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "GPS", externalAthleteId, timestamp, metricKey: "sprint_distance", metricLabel: "Sprint distance", numericValue: sprintDistance, unit: "m", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (playerLoad != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "LOAD", externalAthleteId, timestamp, metricKey: "player_load", metricLabel: "Player load", numericValue: playerLoad, unit: "au", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (maxVelocity != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "GPS", externalAthleteId, timestamp, metricKey: "max_velocity", metricLabel: "Max velocity", numericValue: maxVelocity, unit: "km/h", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (accelerations != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "GPS", externalAthleteId, timestamp, metricKey: "accelerations", metricLabel: "Accelerations", numericValue: accelerations, unit: "count", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (decelerations != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "GPS", externalAthleteId, timestamp, metricKey: "decelerations", metricLabel: "Decelerations", numericValue: decelerations, unit: "count", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (avgHr != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "HEART_RATE", externalAthleteId, timestamp, metricKey: "avg_heart_rate", metricLabel: "Avg heart rate", numericValue: avgHr, unit: "bpm", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (maxHr != null) normalizedMetrics.push(metric({ provider: "STATSPORT", category: "HEART_RATE", externalAthleteId, timestamp, metricKey: "max_heart_rate", metricLabel: "Max heart rate", numericValue: maxHr, unit: "bpm", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings: normalizedMetrics.length ? [] : ["STATSPORT payload parsed but no supported metrics found."],
      summary: `STATSPORT normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};
