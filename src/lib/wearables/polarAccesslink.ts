/**
 * src/lib/wearables/polarAccesslink.ts
 *
 * Polar Accesslink (Flow) integration — individual user sleep + HRV.
 * Distinct from Polar Team Pro (src/lib/integrations/polar/) which is the
 * coach-side team training session feed. Same OAuth credentials + portal
 * (https://admin.polaraccesslink.com), but different API base.
 *
 * Docs: https://www.polar.com/accesslink-api/
 *
 * Flow:
 *   1. Player taps "Connect Polar" → we redirect to authorizeUrl()
 *   2. Player logs in to Polar Flow, grants access → Polar redirects back
 *      with ?code=… to our callback
 *   3. exchangeCode() — POST /oauth2/token to get access_token, then
 *      register the user with POST /v3/users (REQUIRED by Polar before
 *      any data calls work)
 *   4. We store providerUserId + accessToken in wearable_connections
 *   5. Nightly cron OR webhook fetches /v3/users/{user_id}/sleep, etc.
 *
 * Polar Accesslink tokens are LONG-LIVED (no refresh token issued).
 * Disconnect via DELETE /v3/users/{user_id}.
 */

import {
  POLAR_AUTH_URL,
  POLAR_TOKEN_URL,
  POLAR_API_BASE,
  getRequiredPolarEnv,
} from "@/lib/integrations/polar/config";
import type {
  WearableProvider,
  WearableConnectionState,
  WearableSleepNight,
  WearableDailySummary,
} from "./types";

// Polar Accesslink registration response shape (subset we care about).
type PolarRegisterResponse = {
  ["polar-user-id"]?: number;
  ["member-id"]?: string;
  ["registration-date"]?: string;
};

type PolarSleepRecord = {
  // /v3/users/sleep returns these fields (see Polar Accesslink docs).
  polar_user?: string;
  date: string; // YYYY-MM-DD (wake-up date)
  sleep_start_time?: string; // ISO
  sleep_end_time?: string; // ISO
  device_id?: string;
  continuity?: number;
  continuity_class?: number;
  sleep_charge?: number; // Polar's nightly sleep score 1-100
  sleep_rating?: number;
  short_interruption_duration?: string; // ISO 8601 duration
  long_interruption_duration?: string;
  sleep_cycles?: number;
  group_duration_score?: number;
  group_solidity_score?: number;
  group_regeneration_score?: number;
  hypnogram?: Record<string, number>; // minute-by-minute stages, optional
  heart_rate_samples?: Record<string, number>; // optional
  // Total duration is given via the start/end timestamps; we compute it.
};

type PolarSleepListResponse = {
  nights?: PolarSleepRecord[];
};

type PolarNightlyRechargeRecord = {
  date: string; // YYYY-MM-DD (recharge applies to)
  heart_rate_avg?: number;
  beat_to_beat_avg?: number; // RR interval avg in ms
  heart_rate_variability_avg?: number; // RMSSD in ms (Polar exposes this)
  breathing_rate_avg?: number;
  nightly_recharge_status?: number; // -3..+3 scale; we leave as raw
  ans_charge?: number;
  ans_charge_status?: number;
};

type PolarNightlyRechargeListResponse = {
  recharges?: PolarNightlyRechargeRecord[];
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Parse ISO 8601 duration ("PT15M30S") to minutes. Returns null if absent. */
function isoDurationToMinutes(raw: string | undefined | null): number | null {
  if (!raw || typeof raw !== "string") return null;
  // Polar uses simple "PT{H}H{M}M{S}S" — no months/days for sleep.
  const m = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!m) return null;
  const hours = parseFloat(m[1] ?? "0");
  const mins = parseFloat(m[2] ?? "0");
  const secs = parseFloat(m[3] ?? "0");
  return Math.round(hours * 60 + mins + secs / 60);
}

function safeMinutesBetween(startIso?: string, endIso?: string): number | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 60_000);
}

async function polarRequest(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const { accessToken, headers, ...rest } = init;
  const url = path.startsWith("http") ? path : `${POLAR_API_BASE}${path}`;
  return fetch(url, {
    ...rest,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Provider implementation
// ─────────────────────────────────────────────────────────────────────────

export const polarAccesslinkProvider: WearableProvider = {
  key: "polar",

  authorizeUrl(state, redirectUri) {
    const env = getRequiredPolarEnv();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.clientId,
      // Accesslink uses "accesslink.read_all" — full read on sleep/recharge/etc.
      scope: "accesslink.read_all",
      redirect_uri: redirectUri,
      state,
    });
    return `${POLAR_AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const env = getRequiredPolarEnv();

    // 1. Exchange code for access token (Polar issues long-lived tokens,
    //    no refresh token).
    const tokenRes = await fetch(POLAR_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64"),
        Accept: "application/json;charset=UTF-8",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }).toString(),
      cache: "no-store",
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      throw new Error(`Polar token exchange failed: ${tokenRes.status} ${text.slice(0, 300)}`);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      token_type?: string;
      expires_in?: number;
      x_user_id?: number; // numeric Polar user id, returned by Accesslink
    };

    const accessToken = tokenJson.access_token;
    const polarUserId = tokenJson.x_user_id;
    if (!accessToken || !polarUserId) {
      throw new Error("Polar token response missing access_token or x_user_id");
    }

    // 2. Register the user with Accesslink (REQUIRED — no data calls work
    //    until this is done). Idempotent: 409 means already registered, OK.
    const registerRes = await polarRequest("/v3/users", {
      method: "POST",
      accessToken,
      body: JSON.stringify({ "member-id": `mp-${polarUserId}` }),
    });
    if (!registerRes.ok && registerRes.status !== 409) {
      const text = await registerRes.text().catch(() => "");
      throw new Error(
        `Polar user registration failed: ${registerRes.status} ${text.slice(0, 300)}`,
      );
    }
    const registerJson = (registerRes.status === 409
      ? null
      : ((await registerRes.json().catch(() => null)) as PolarRegisterResponse | null));

    return {
      providerUserId: String(polarUserId),
      accessToken,
      refreshToken: null,
      expiresAt: null, // Polar tokens are long-lived; no expiry
      scopes: ["accesslink.read_all"],
      deviceLabel: registerJson?.["member-id"] ? "Polar" : "Polar",
    };
  },

  async fetchSleep(state, from, to) {
    // Polar /v3/users/sleep returns the last 28 nights. Caller filters
    // by from/to.
    const res = await polarRequest("/v3/users/sleep", {
      method: "GET",
      accessToken: state.accessToken,
    });
    if (!res.ok) {
      if (res.status === 204) return [];
      const text = await res.text().catch(() => "");
      throw new Error(`Polar sleep fetch failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as PolarSleepListResponse;
    const nights = json.nights ?? [];
    return nights
      .filter((n) => n.date >= from && n.date <= to)
      .map((n): WearableSleepNight => {
        const totalMin = safeMinutesBetween(n.sleep_start_time, n.sleep_end_time);
        const interruptionMin =
          (isoDurationToMinutes(n.short_interruption_duration) ?? 0) +
          (isoDurationToMinutes(n.long_interruption_duration) ?? 0);
        const efficiency =
          totalMin != null && totalMin > 0
            ? Math.max(0, Math.min(100, ((totalMin - interruptionMin) / totalMin) * 100))
            : null;
        return {
          sleepDate: n.date,
          sleepStartAt: n.sleep_start_time ?? null,
          sleepEndAt: n.sleep_end_time ?? null,
          totalSleepMin: totalMin,
          sleepEfficiencyPct: efficiency,
          // Polar Accesslink doesn't expose stage breakdown publicly; null.
          deepSleepMin: null,
          remSleepMin: null,
          lightSleepMin: null,
          wakeMin: interruptionMin > 0 ? interruptionMin : null,
          providerScore: typeof n.sleep_charge === "number" ? n.sleep_charge : null,
          sourceRecordId: `polar:sleep:${n.polar_user ?? state.providerUserId}:${n.date}`,
          raw: n as unknown as Record<string, unknown>,
        };
      });
  },

  async fetchDailySummary(state, from, to) {
    // Polar Nightly Recharge endpoint exposes HRV + resting HR per night.
    const res = await polarRequest("/v3/users/nightly-recharge", {
      method: "GET",
      accessToken: state.accessToken,
    });
    if (!res.ok) {
      if (res.status === 204) return [];
      const text = await res.text().catch(() => "");
      throw new Error(`Polar recharge fetch failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as PolarNightlyRechargeListResponse;
    const recharges = json.recharges ?? [];
    return recharges
      .filter((r) => r.date >= from && r.date <= to)
      .map((r): WearableDailySummary => ({
        measurementDate: r.date,
        restingHrBpm: typeof r.heart_rate_avg === "number" ? Math.round(r.heart_rate_avg) : null,
        hrvRmssdMs: typeof r.heart_rate_variability_avg === "number" ? r.heart_rate_variability_avg : null,
        // ans_charge_status is -3..+3; convert to 0-100 for consistency with
        // other providers (offset + scale → 0=worst, 100=best).
        providerRecoveryScore:
          typeof r.ans_charge_status === "number"
            ? Math.max(0, Math.min(100, ((r.ans_charge_status + 3) / 6) * 100))
            : null,
        sourceRecordId: `polar:recharge:${state.providerUserId}:${r.date}`,
        raw: r as unknown as Record<string, unknown>,
      }));
  },

  async disconnect(state) {
    // DELETE /v3/users/{user-id} — Accesslink deregistration.
    await polarRequest(`/v3/users/${encodeURIComponent(state.providerUserId)}`, {
      method: "DELETE",
      accessToken: state.accessToken,
    });
    // Failures are non-fatal — we still want to mark our own record inactive.
  },
};
