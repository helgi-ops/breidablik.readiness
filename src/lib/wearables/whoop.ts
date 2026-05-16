/**
 * src/lib/wearables/whoop.ts
 *
 * Whoop integration — sleep + recovery + HRV.
 * Docs: https://developer.whoop.com/api/v1
 *
 * OAuth 2.0 (standard authorization-code flow, same pattern as Polar).
 * Whoop's "Recovery" object exposes HRV (rmssd_milli) + resting HR + the
 * native 0-100 recovery score. Their sleep object has stages + score.
 *
 * Tokens: short-lived access_token (1h) + long-lived refresh_token. We
 * persist both and refresh on demand when expires_at is in the past.
 *
 * Registration: https://developer.whoop.com — sign up, create an app,
 * register the redirect URI as <APP_URL>/api/wearables/callback. Whoop
 * REQUIRES production-app review before commercial use is approved
 * (similar to Garmin/Apple). Sandbox works in dev with limited users.
 */

import type {
  WearableProvider,
  WearableConnectionState,
  WearableSleepNight,
  WearableDailySummary,
} from "./types";

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";

// We ask for everything we use — sleep + recovery + profile (for user_id).
// Whoop scopes are space-separated in the authorize URL.
const WHOOP_SCOPES = [
  "read:profile",
  "read:sleep",
  "read:recovery",
  "read:cycles",
] as const;

type WhoopEnv = {
  clientId: string;
  clientSecret: string;
};

function getWhoopEnv(): WhoopEnv {
  return {
    clientId: process.env.WHOOP_CLIENT_ID?.trim() || "",
    clientSecret: process.env.WHOOP_CLIENT_SECRET?.trim() || "",
  };
}

function requireWhoopEnv(): WhoopEnv {
  const env = getWhoopEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error("WHOOP env vars missing: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET");
  }
  return env;
}

type WhoopTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type WhoopUserBasic = {
  user_id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
};

type WhoopSleepRecord = {
  id: number | string;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  start: string; // ISO timestamp
  end: string;
  timezone_offset?: string;
  nap?: boolean;
  score_state?: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_no_data_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
};

type WhoopRecoveryRecord = {
  cycle_id: number;
  sleep_id: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  score_state?: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number; // 0-100
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number; // RMSSD in milliseconds
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
};

type WhoopPaged<T> = {
  records?: T[];
  next_token?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function whoopHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function msToMin(ms: number | undefined): number | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60_000);
}

/** Whoop sleep `end` is the wake-up time (ISO). Extract YYYY-MM-DD in UTC. */
function wakeDateFrom(endIso: string): string {
  return endIso.slice(0, 10);
}

async function whoopGet<T>(path: string, accessToken: string, query: Record<string, string | undefined> = {}): Promise<T> {
  const url = new URL(`${WHOOP_API_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: whoopHeaders(accessToken),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Whoop ${path} failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Page through a Whoop list endpoint. Handles up to ~500 records — plenty
 *  for the 14-day sync window. */
async function whoopGetAll<T>(
  path: string,
  accessToken: string,
  baseQuery: Record<string, string>,
): Promise<T[]> {
  const collected: T[] = [];
  let nextToken: string | undefined = undefined;
  let safety = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: WhoopPaged<T> = await whoopGet<WhoopPaged<T>>(path, accessToken, {
      ...baseQuery,
      ...(nextToken ? { nextToken } : {}),
    });
    if (page.records?.length) collected.push(...page.records);
    nextToken = page.next_token;
    safety += 1;
    if (!nextToken || safety >= 10) break;
  }
  return collected;
}

// ─────────────────────────────────────────────────────────────────────────
// Provider implementation
// ─────────────────────────────────────────────────────────────────────────

export const whoopProvider: WearableProvider = {
  key: "whoop",

  authorizeUrl(state, redirectUri) {
    const env = requireWhoopEnv();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.clientId,
      redirect_uri: redirectUri,
      scope: WHOOP_SCOPES.join(" "),
      state,
    });
    return `${WHOOP_AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri): Promise<WearableConnectionState> {
    const env = requireWhoopEnv();

    const tokenRes = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env.clientId,
        client_secret: env.clientSecret,
      }).toString(),
      cache: "no-store",
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      throw new Error(`Whoop token exchange failed: ${tokenRes.status} ${text.slice(0, 300)}`);
    }

    const tokenJson = (await tokenRes.json()) as WhoopTokenResponse;
    const accessToken = tokenJson.access_token;
    if (!accessToken) throw new Error("Whoop token response missing access_token");

    // Look up the user's whoop user_id so webhooks can route to our profile.
    const profile = await whoopGet<WhoopUserBasic>("/v1/user/profile/basic", accessToken);

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
      : null;

    return {
      providerUserId: String(profile.user_id),
      accessToken,
      refreshToken: tokenJson.refresh_token ?? null,
      expiresAt,
      scopes: tokenJson.scope ? tokenJson.scope.split(/[\s,]+/).filter(Boolean) : [...WHOOP_SCOPES],
      deviceLabel: "Whoop",
    };
  },

  async fetchSleep(state, from, to): Promise<WearableSleepNight[]> {
    // Whoop's sleep endpoint accepts start/end ISO timestamps. Pad by 1 day
    // either side so we catch nights whose wake-up date is at the boundary.
    const startIso = `${from}T00:00:00.000Z`;
    const endIso = `${to}T23:59:59.999Z`;

    const records = await whoopGetAll<WhoopSleepRecord>(
      "/v1/activity/sleep",
      state.accessToken,
      { start: startIso, end: endIso, limit: "25" },
    );

    return records
      .filter((r) => !r.nap && r.score_state === "SCORED")
      .map((r): WearableSleepNight => {
        const stages = r.score?.stage_summary;
        const inBedMs = stages?.total_in_bed_time_milli ?? null;
        const awakeMs = stages?.total_awake_time_milli ?? 0;
        const totalSleepMs = inBedMs != null ? Math.max(0, inBedMs - awakeMs) : null;
        return {
          sleepDate: wakeDateFrom(r.end),
          sleepStartAt: r.start ?? null,
          sleepEndAt: r.end ?? null,
          totalSleepMin: msToMin(totalSleepMs ?? undefined),
          sleepEfficiencyPct: r.score?.sleep_efficiency_percentage ?? null,
          deepSleepMin: msToMin(stages?.total_slow_wave_sleep_time_milli),
          remSleepMin: msToMin(stages?.total_rem_sleep_time_milli),
          lightSleepMin: msToMin(stages?.total_light_sleep_time_milli),
          wakeMin: msToMin(stages?.total_awake_time_milli),
          providerScore: r.score?.sleep_performance_percentage ?? null,
          sourceRecordId: `whoop:sleep:${r.id}`,
          raw: r as unknown as Record<string, unknown>,
        };
      });
  },

  async fetchDailySummary(state, from, to): Promise<WearableDailySummary[]> {
    const startIso = `${from}T00:00:00.000Z`;
    const endIso = `${to}T23:59:59.999Z`;

    const records = await whoopGetAll<WhoopRecoveryRecord>(
      "/v1/recovery",
      state.accessToken,
      { start: startIso, end: endIso, limit: "25" },
    );

    return records
      .filter((r) => r.score_state === "SCORED" && r.score)
      .map((r): WearableDailySummary => {
        // Whoop recovery is keyed to the sleep that ended that morning, so
        // measurementDate = the date the sleep_id refers to (when we don't
        // have that, fall back to created_at slice). Whoop's `created_at`
        // is the wake-up day.
        const measurementDate = (r.created_at ?? "").slice(0, 10) || (r.updated_at ?? "").slice(0, 10);
        return {
          measurementDate,
          restingHrBpm: r.score?.resting_heart_rate ?? null,
          hrvRmssdMs: r.score?.hrv_rmssd_milli ?? null,
          providerRecoveryScore: r.score?.recovery_score ?? null,
          sourceRecordId: `whoop:recovery:${r.cycle_id}`,
          raw: r as unknown as Record<string, unknown>,
        };
      })
      .filter((d) => d.measurementDate && d.measurementDate >= from && d.measurementDate <= to);
  },

  async disconnect(): Promise<void> {
    // Whoop doesn't expose a programmatic revoke endpoint as of v1 — the
    // app simply forgets the tokens. The user can revoke our app via their
    // Whoop account settings if they want to cut all data access. We just
    // mark the row inactive in our DB (handled by the caller).
  },
};
