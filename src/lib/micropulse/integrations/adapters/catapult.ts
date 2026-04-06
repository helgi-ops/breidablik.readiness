import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

export const catapultAdapter: IntegrationProviderAdapter = {
  provider: "CATAPULT",
  canHandle(payload) {
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("catapult") || text.includes("player_load") || text.includes("high_speed_distance");
  },
  normalize(raw) {
    const rows = safeArray(raw.payload);
    if (!rows.length) {
      return emptyResult("CATAPULT payload had no usable rows.", [
        makeConflict({ provider: "CATAPULT", type: "UNSUPPORTED_PAYLOAD", severity: "MODERATE", summary: "Could not parse CATAPULT payload rows.", rawReferenceId: raw.id }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];
    for (const row of rows) {
      const externalAthleteId = asString(row.athlete_id ?? row.player_id ?? row.id);
      const timestamp = asString(row.timestamp ?? row.session_date ?? row.date);
      if (!timestamp) conflicts.push(makeConflict({ provider: "CATAPULT", type: "MISSING_TIMESTAMP", severity: "LOW", summary: "CATAPULT row missing timestamp.", rawReferenceId: raw.id, externalAthleteId }));

      const totalDistance = asNumber(row.total_distance ?? row.distance);
      const highSpeed = asNumber(row.high_speed_distance ?? row.hsd);
      const playerLoad = asNumber(row.player_load ?? row.load);
      const sessionLoad = asNumber(row.session_load ?? row.internal_load);

      if (totalDistance != null) normalizedMetrics.push(metric({ provider: "CATAPULT", category: "GPS", externalAthleteId, timestamp, metricKey: "total_distance", metricLabel: "Total distance", numericValue: totalDistance, unit: "m", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (highSpeed != null) normalizedMetrics.push(metric({ provider: "CATAPULT", category: "GPS", externalAthleteId, timestamp, metricKey: "high_speed_distance", metricLabel: "High speed distance", numericValue: highSpeed, unit: "m", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (playerLoad != null) normalizedMetrics.push(metric({ provider: "CATAPULT", category: "LOAD", externalAthleteId, timestamp, metricKey: "player_load", metricLabel: "Player load", numericValue: playerLoad, unit: "au", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
      if (sessionLoad != null) normalizedMetrics.push(metric({ provider: "CATAPULT", category: "SESSION", externalAthleteId, timestamp, metricKey: "session_load", metricLabel: "Session load", numericValue: sessionLoad, unit: "au", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.85 }));
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings: normalizedMetrics.length ? [] : ["CATAPULT payload parsed but no supported metrics found."],
      summary: `CATAPULT normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};
