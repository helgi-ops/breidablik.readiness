/**
 * src/lib/wearables/types.ts
 *
 * Provider-agnostic wearable sync types. New providers (Vital, Apple Health,
 * Garmin, Whoop, Oura) implement WearableProvider — same surface, different
 * underlying API. The rest of the app talks only to these types, never to
 * a specific provider's data shape.
 */

export type WearableProviderKey =
  | "polar"
  | "vital"
  | "apple_health"
  | "garmin"
  | "whoop"
  | "oura";

/** Human-readable provider name for UI badges. */
export const WEARABLE_PROVIDER_LABEL: Record<WearableProviderKey, string> = {
  polar: "Polar",
  vital: "Vital",
  apple_health: "Apple Watch",
  garmin: "Garmin",
  whoop: "Whoop",
  oura: "Oura",
};

/** Which providers are wired up + visible in the connect-wearable UI today.
 *  Others may exist in the type for future-proofing but are gated to admin
 *  / hidden in player UI until their integration ships. */
export const WEARABLE_PROVIDER_AVAILABLE: Record<WearableProviderKey, boolean> = {
  polar: true,
  vital: false,
  apple_health: false,
  garmin: false,
  whoop: true,
  oura: false,
};

/** One night of sleep data, normalised across providers. */
export type WearableSleepNight = {
  /** Date the sleep PERIOD ENDED — i.e. wake-up date in player's timezone. */
  sleepDate: string; // YYYY-MM-DD
  sleepStartAt: string | null; // ISO timestamp
  sleepEndAt: string | null;
  totalSleepMin: number | null;
  sleepEfficiencyPct: number | null; // 0-100
  deepSleepMin: number | null;
  remSleepMin: number | null;
  lightSleepMin: number | null;
  wakeMin: number | null;
  /** Provider's own composite "sleep score" (0-100) — Polar Sleep+ score,
   *  Whoop sleep performance, Oura sleep score. Used as a hint, not as
   *  the readiness verdict. */
  providerScore: number | null;
  sourceRecordId: string;
  raw: Record<string, unknown>;
};

/** One day of daily-summary data (resting HR, HRV, provider's recovery score). */
export type WearableDailySummary = {
  measurementDate: string; // YYYY-MM-DD
  restingHrBpm: number | null;
  hrvRmssdMs: number | null;
  providerRecoveryScore: number | null;
  sourceRecordId: string;
  raw: Record<string, unknown>;
};

/** State stored in wearable_connections after a successful OAuth. */
export type WearableConnectionState = {
  providerUserId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null; // ISO timestamp
  scopes: string[];
  deviceLabel: string | null;
};

/** Standardised provider interface. Each provider implements this so the
 *  rest of the app stays agnostic to which wearable a player connected. */
export interface WearableProvider {
  readonly key: WearableProviderKey;

  /**
   * Return the authorize URL the player gets redirected to to grant access.
   * Caller passes a state string (stored in their session) for CSRF protection.
   */
  authorizeUrl(state: string, redirectUri: string): string;

  /**
   * Exchange an OAuth code for an access token, register the user with the
   * provider if required (Polar needs an explicit POST /v3/users after the
   * code exchange), and return the stable connection state we store.
   */
  exchangeCode(code: string, redirectUri: string): Promise<WearableConnectionState>;

  /**
   * Fetch sleep data for the given date range. Implementations should be
   * idempotent — calling twice for the same date returns the same data,
   * and the caller dedupes on sourceRecordId.
   */
  fetchSleep(
    state: WearableConnectionState,
    from: string, // YYYY-MM-DD
    to: string,   // YYYY-MM-DD
  ): Promise<WearableSleepNight[]>;

  /**
   * Fetch daily summary (resting HR, HRV, recovery score) for the date range.
   * Empty array is fine if the provider doesn't expose any of these.
   */
  fetchDailySummary(
    state: WearableConnectionState,
    from: string,
    to: string,
  ): Promise<WearableDailySummary[]>;

  /** Disconnect the user on the provider side, if the provider supports it
   *  (Polar does via DELETE /v3/users/{user-id}). No-op for providers that
   *  only require revoking the OAuth token client-side. */
  disconnect(state: WearableConnectionState): Promise<void>;
}
