import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";

const PROVIDERS: IntegrationProviderKey[] = ["WHOOP", "VALD", "CATAPULT", "POLAR", "GARMIN", "GENERIC_CSV"];

export function parseProvider(value: unknown): IntegrationProviderKey | null {
  const upper = String(value ?? "").toUpperCase() as IntegrationProviderKey;
  return PROVIDERS.includes(upper) ? upper : null;
}

export function asJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return {};
}

