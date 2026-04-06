import type { IntegrationProviderDescriptor, IntegrationProviderKey } from "./types";
import { listProviderDescriptors } from "./providers";
import type { IntegrationProviderAdapter } from "./adapters/base";
import { whoopAdapter } from "./adapters/whoop";
import { valdAdapter } from "./adapters/vald";
import { catapultAdapter } from "./adapters/catapult";
import { polarAdapter } from "./adapters/polar";
import { garminAdapter } from "./adapters/garmin";
import { genericCsvAdapter } from "./adapters/genericCsv";

const ADAPTERS: Record<IntegrationProviderKey, IntegrationProviderAdapter> = {
  WHOOP: whoopAdapter,
  VALD: valdAdapter,
  CATAPULT: catapultAdapter,
  POLAR: polarAdapter,
  GARMIN: garminAdapter,
  GENERIC_CSV: genericCsvAdapter,
};

/** Central provider adapter lookup to keep provider-specific logic out of core ingestion flow. */
export function getProviderAdapter(provider: IntegrationProviderKey): IntegrationProviderAdapter {
  return ADAPTERS[provider];
}

/** Returns typed provider metadata for integrations settings and status surfaces. */
export function getAvailableProviderDescriptors(): IntegrationProviderDescriptor[] {
  return listProviderDescriptors();
}

