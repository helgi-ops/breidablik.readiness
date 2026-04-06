import { asNumber, asString, emptyResult, makeConflict, metric, safeArray, type IntegrationProviderAdapter } from "./base";

export const valdAdapter: IntegrationProviderAdapter = {
  provider: "VALD",
  canHandle(payload) {
    if (!payload || typeof payload !== "object") return false;
    const text = JSON.stringify(payload).toLowerCase();
    return text.includes("vald") || text.includes("asymmetry") || text.includes("jump_height") || text.includes("force_peak");
  },
  normalize(raw) {
    const rows = safeArray(raw.payload);
    if (!rows.length) {
      return emptyResult("VALD payload had no usable rows.", [
        makeConflict({ provider: "VALD", type: "UNSUPPORTED_PAYLOAD", severity: "MODERATE", summary: "Could not parse VALD payload rows.", rawReferenceId: raw.id }),
      ]);
    }

    const normalizedMetrics = [];
    const conflicts = [];
    for (const row of rows) {
      const externalAthleteId = asString(row.athlete_id ?? row.player_id ?? row.id);
      const timestamp = asString(row.timestamp ?? row.test_date ?? row.date);
      if (!timestamp) {
        conflicts.push(makeConflict({ provider: "VALD", type: "MISSING_TIMESTAMP", severity: "LOW", summary: "VALD row missing timestamp.", rawReferenceId: raw.id, externalAthleteId }));
      }
      const jumpHeight = asNumber(row.jump_height ?? row.jump_height_cm);
      const asymmetry = asNumber(row.asymmetry_index ?? row.asymmetry_pct);
      const forcePeak = asNumber(row.force_peak ?? row.peak_force);

      if (jumpHeight != null) normalizedMetrics.push(metric({ provider: "VALD", category: "FORCE", externalAthleteId, timestamp, metricKey: "jump_height", metricLabel: "Jump height", numericValue: jumpHeight, unit: "cm", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (asymmetry != null) normalizedMetrics.push(metric({ provider: "VALD", category: "FORCE", externalAthleteId, timestamp, metricKey: "asymmetry_index", metricLabel: "Asymmetry index", numericValue: asymmetry, unit: "%", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
      if (forcePeak != null) normalizedMetrics.push(metric({ provider: "VALD", category: "FORCE", externalAthleteId, timestamp, metricKey: "force_peak", metricLabel: "Peak force", numericValue: forcePeak, unit: "N", sourceRef: raw.sourceRef ?? raw.id, confidence: 0.9 }));
    }

    return {
      normalizedMetrics,
      conflicts,
      warnings: normalizedMetrics.length ? [] : ["VALD payload parsed but no supported metrics found."],
      summary: `VALD normalized ${normalizedMetrics.length} metrics from ${rows.length} row(s).`,
    };
  },
};
