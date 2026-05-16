/**
 * src/lib/wearables/registry.ts
 *
 * Single source of truth for which providers exist + how to get an
 * implementation by key. Adding a new provider = add the key to
 * WearableProviderKey, drop the implementation in this file, done.
 */

import type { WearableProvider, WearableProviderKey } from "./types";
import { polarAccesslinkProvider } from "./polarAccesslink";
import { whoopProvider } from "./whoop";

const PROVIDERS: Partial<Record<WearableProviderKey, WearableProvider>> = {
  polar: polarAccesslinkProvider,
  whoop: whoopProvider,
};

export function getWearableProvider(key: WearableProviderKey): WearableProvider {
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Wearable provider not implemented: ${key}`);
  }
  return provider;
}

export function hasWearableProvider(key: WearableProviderKey): boolean {
  return PROVIDERS[key] !== undefined;
}
