import type { IntegrationProviderDescriptor, IntegrationProviderKey } from "./types";

export const INTEGRATION_PROVIDERS: Record<IntegrationProviderKey, IntegrationProviderDescriptor> = {
  WHOOP: {
    provider: "WHOOP",
    displayName: "WHOOP",
    supportedModes: ["API_PULL", "WEBHOOK_PUSH", "MANUAL_UPLOAD"],
    supportedCategories: ["RECOVERY", "SLEEP", "HEART_RATE", "READINESS"],
    requiresPlayerMapping: true,
    description: "Recovery, sleep, and strain-oriented wearable data.",
  },
  VALD: {
    provider: "VALD",
    displayName: "VALD",
    supportedModes: ["API_PULL", "CSV_IMPORT", "MANUAL_UPLOAD"],
    supportedCategories: ["FORCE", "READINESS"],
    requiresPlayerMapping: true,
    description: "Force diagnostics and asymmetry measures.",
  },
  CATAPULT: {
    provider: "CATAPULT",
    displayName: "Catapult",
    supportedModes: ["API_PULL", "CSV_IMPORT", "WEBHOOK_PUSH"],
    supportedCategories: ["GPS", "LOAD", "SESSION"],
    requiresPlayerMapping: true,
    description: "External load and GPS-derived session metrics.",
  },
  POLAR: {
    provider: "POLAR",
    displayName: "Polar",
    supportedModes: ["API_PULL", "MANUAL_UPLOAD", "CSV_IMPORT"],
    supportedCategories: ["HEART_RATE", "LOAD", "RECOVERY", "SESSION"],
    requiresPlayerMapping: true,
    description: "Heart-rate and training session responses.",
  },
  GARMIN: {
    provider: "GARMIN",
    displayName: "Garmin",
    supportedModes: ["API_PULL", "CSV_IMPORT", "MANUAL_UPLOAD"],
    supportedCategories: ["SLEEP", "HEART_RATE", "LOAD", "RECOVERY"],
    requiresPlayerMapping: true,
    description: "Sleep, HRV proxies, and wearable recovery/load data.",
  },
  GENERIC_CSV: {
    provider: "GENERIC_CSV",
    displayName: "Generic CSV",
    supportedModes: ["CSV_IMPORT", "MANUAL_UPLOAD"],
    supportedCategories: ["CUSTOM", "LOAD", "READINESS", "WELLNESS", "SESSION"],
    requiresPlayerMapping: true,
    description: "Flexible CSV ingestion using canonical MicroPulse keys.",
  },
};

export function getProviderDescriptor(provider: IntegrationProviderKey): IntegrationProviderDescriptor {
  return INTEGRATION_PROVIDERS[provider];
}

export function listProviderDescriptors(): IntegrationProviderDescriptor[] {
  return Object.values(INTEGRATION_PROVIDERS);
}
