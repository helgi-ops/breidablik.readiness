import type { CatapultExternalLoadSignals, ExternalLoadExplanation } from "./types";

function pushLine(
  list: ExternalLoadExplanation[],
  when: boolean,
  code: string,
  severity: ExternalLoadExplanation["severity"],
  message: string
) {
  if (when) list.push({ code, severity, message });
}

export function buildExternalLoadExplanations(signals: CatapultExternalLoadSignals): ExternalLoadExplanation[] {
  const items: ExternalLoadExplanation[] = [];

  if (signals.dataQuality === "insufficient") {
    items.push({
      code: "catapult_data_insufficient",
      severity: "info",
      message: "External load data insufficient for a stable Catapult baseline.",
    });
    return items;
  }

  pushLine(items, signals.externalLoadState === "normal", "catapult_load_normal", "info", "External load within expected recent range.");
  pushLine(items, (signals.playerLoadSpike ?? 0) >= 1.3, "catapult_player_load_spike", (signals.playerLoadSpike ?? 0) >= 1.5 ? "high" : "moderate", "PlayerLoad elevated versus 28-day baseline.");
  pushLine(items, (signals.hirSpike ?? 0) >= 1.3, "catapult_hir_spike", (signals.hirSpike ?? 0) >= 1.6 ? "high" : "moderate", "High-intensity running load elevated versus recent norm.");
  pushLine(items, (signals.decelSpike ?? 0) >= 1.3, "catapult_decel_spike", (signals.decelSpike ?? 0) >= 1.6 ? "high" : "moderate", "Deceleration burden above recent norm.");
  pushLine(items, (signals.accelSpike ?? 0) >= 1.3, "catapult_accel_spike", (signals.accelSpike ?? 0) >= 1.6 ? "high" : "moderate", "Acceleration load above recent norm.");
  pushLine(items, (signals.maxVelocityExposureRatio ?? 0) >= 1.05, "catapult_max_velocity", (signals.maxVelocityExposureRatio ?? 0) >= 1.12 ? "high" : "moderate", "Top-speed exposure higher than typical.");
  pushLine(items, (signals.band6ExposureRatio ?? 0) >= 1.25, "catapult_band6_exposure", (signals.band6ExposureRatio ?? 0) >= 1.5 ? "high" : "moderate", "Sprint exposure higher than typical.");

  return items.slice(0, 4);
}
