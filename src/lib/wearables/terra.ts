/**
 * src/lib/wearables/terra.ts
 *
 * Terra (tryterra.co) — a wearables AGGREGATOR. One integration → Whoop, Garmin,
 * Apple Health, Oura, Polar… See docs/tasks/terra-integration-brief.md.
 *
 * Phase 1 ships WHOOP only (the widget filters `providers:"WHOOP"`); more Sources
 * flip on with zero code change (widen/remove the filter + dashboard toggle).
 *
 * Terra does NOT use the framework's synchronous OAuth `authorizeUrl` — it needs a
 * backend widget-session call, and auth confirmation arrives via WEBHOOK, not an
 * OAuth code exchange. So `authorizeUrl`/`exchangeCode` throw; the connect route
 * special-cases Terra (Option 1) and the webhook creates the connection row.
 *
 * Boundary: everything here feeds the recovery/sleep SIDE signals only. It never
 * writes the readiness colour.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  WearableConnectionState,
  WearableDailySummary,
  WearableProvider,
  WearableSleepNight,
} from "./types";

const TERRA_API = "https://api.tryterra.co/v2";

/** Phase 1 shows only Whoop in the widget. Widen later (dashboard + this string). */
export const TERRA_PHASE1_PROVIDERS = "WHOOP";

type TerraCreds = { devId: string; apiKey: string };

function terraCreds(): TerraCreds {
  const devId = process.env.TERRA_DEV_ID ?? "";
  const apiKey = process.env.TERRA_API_KEY ?? "";
  if (!devId || !apiKey) {
    throw new Error("Terra is not configured (set TERRA_DEV_ID and TERRA_API_KEY).");
  }
  return { devId, apiKey };
}

function terraHeaders(): Record<string, string> {
  const { devId, apiKey } = terraCreds();
  return { "dev-id": devId, "x-api-key": apiKey, "Content-Type": "application/json" };
}

/* ── Connect: widget session ─────────────────────────────────────────────── */

/**
 * POST /auth/generateWidgetSession → a widget URL to redirect the player to.
 * `referenceId` is our stable id for the player (profiles.id) so the `auth`
 * webhook can map the Terra user back to the right connection.
 */
export async function generateTerraWidgetSession(opts: {
  referenceId: string;
  successUrl: string;
  failureUrl: string;
  providers?: string; // default Phase-1 WHOOP
}): Promise<{ url: string; sessionId: string | null }> {
  const res = await fetch(`${TERRA_API}/auth/generateWidgetSession`, {
    method: "POST",
    headers: terraHeaders(),
    body: JSON.stringify({
      reference_id: opts.referenceId,
      providers: opts.providers ?? TERRA_PHASE1_PROVIDERS,
      auth_success_redirect_url: opts.successUrl,
      auth_failure_redirect_url: opts.failureUrl,
      language: "en",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; session_id?: string; message?: string; status?: string };
  if (!res.ok || !json.url) {
    throw new Error(`Terra widget session failed: ${json.message || res.status}`);
  }
  return { url: json.url, sessionId: json.session_id ?? null };
}

/* ── Webhook signature verification ──────────────────────────────────────── */

/**
 * Verify Terra's `terra-signature: t=<unix>,v1=<hex>` header. The signed payload
 * is `${t}.${rawBody}`, HMAC-SHA256 with the signing secret (Stripe-style).
 * Pure + timing-safe; returns false on any malformed/absent input.
 */
export function verifyTerraSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return i === -1 ? [kv.trim(), ""] : [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(v1, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ── Payload mappers (webhook + REST share these) ────────────────────────── */

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const secToMin = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n / 60);
};
const dateOf = (iso: unknown): string | null => {
  if (typeof iso !== "string" || !iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? (iso.length >= 10 ? iso.slice(0, 10) : null) : d.toISOString().slice(0, 10);
};
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Map one Terra `sleep` data object → WearableSleepNight (null-safe). */
export function mapTerraSleepObject(o: Record<string, unknown>): WearableSleepNight | null {
  const meta = asObj(o.metadata);
  const start = typeof meta.start_time === "string" ? meta.start_time : null;
  const end = typeof meta.end_time === "string" ? meta.end_time : null;
  // Sleep is dated by WAKE-UP (period end) in the player's timezone.
  const sleepDate = dateOf(end) ?? dateOf(start);
  if (!sleepDate) return null;

  const durations = asObj(o.sleep_durations_data);
  const asleep = asObj(durations.asleep);
  const awake = asObj(durations.awake);
  const other = asObj(durations.other);

  let efficiency = num(durations.sleep_efficiency);
  if (efficiency != null && efficiency <= 1) efficiency = efficiency * 100; // fraction → %

  const scores = asObj(o.scores);
  const enrich = asObj(o.data_enrichment);
  const providerScore = num(scores.sleep) ?? num(enrich.sleep_score) ?? null;

  const summaryId = typeof meta.summary_id === "string" ? meta.summary_id : null;

  return {
    sleepDate,
    sleepStartAt: start,
    sleepEndAt: end,
    totalSleepMin: secToMin(asleep.duration_asleep_state_seconds),
    sleepEfficiencyPct: efficiency,
    deepSleepMin: secToMin(asleep.duration_deep_sleep_state_seconds),
    remSleepMin: secToMin(asleep.duration_REM_sleep_state_seconds),
    lightSleepMin: secToMin(asleep.duration_light_sleep_state_seconds),
    wakeMin: secToMin(awake.duration_awake_state_seconds ?? other.duration_awake_state_seconds),
    providerScore,
    sourceRecordId: `terra:sleep:${summaryId ?? start ?? sleepDate}`,
    raw: o,
  };
}

/** Map one Terra `daily` data object → WearableDailySummary (null-safe). */
export function mapTerraDailyObject(o: Record<string, unknown>): WearableDailySummary | null {
  const meta = asObj(o.metadata);
  const measurementDate = dateOf(meta.start_time) ?? dateOf(meta.end_time);
  if (!measurementDate) return null;

  const hr = asObj(o.heart_rate_data);
  const hrSummary = asObj(hr.summary);
  const scores = asObj(o.scores);
  const enrich = asObj(o.data_enrichment);
  const summaryId = typeof meta.summary_id === "string" ? meta.summary_id : null;

  return {
    measurementDate,
    restingHrBpm: num(hrSummary.resting_hr_bpm),
    hrvRmssdMs: num(hrSummary.avg_hrv_rmssd) ?? num(hrSummary.user_hrv_rmssd),
    providerRecoveryScore: num(scores.recovery) ?? num(enrich.recovery_score) ?? null,
    sourceRecordId: `terra:daily:${summaryId ?? measurementDate}`,
    raw: o,
  };
}

/** Map a Terra payload/REST `data` array of the given type. */
export function mapTerraSleep(data: unknown): WearableSleepNight[] {
  if (!Array.isArray(data)) return [];
  return data.map((o) => mapTerraSleepObject(asObj(o))).filter((x): x is WearableSleepNight => x !== null);
}
export function mapTerraDaily(data: unknown): WearableDailySummary[] {
  if (!Array.isArray(data)) return [];
  return data.map((o) => mapTerraDailyObject(asObj(o))).filter((x): x is WearableDailySummary => x !== null);
}

/* ── REST backfill (mirrors the other providers' fetch methods) ──────────── */

async function terraGet(path: string, userId: string, from: string, to: string): Promise<unknown[]> {
  const url = `${TERRA_API}/${path}?user_id=${encodeURIComponent(userId)}&start_date=${from}&end_date=${to}&to_webhook=false`;
  const res = await fetch(url, { headers: terraHeaders() });
  if (!res.ok) throw new Error(`Terra GET ${path}: ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { data?: unknown[] };
  return Array.isArray(json.data) ? json.data : [];
}

/* ── Provider impl ───────────────────────────────────────────────────────── */

export const terraProvider: WearableProvider = {
  key: "terra",

  // Terra uses the widget session (see generateTerraWidgetSession + the connect
  // route's Option-1 special case), not a synchronous OAuth authorize URL.
  authorizeUrl(): string {
    throw new Error("Terra uses the widget session flow — call generateTerraWidgetSession via /api/wearables/connect.");
  },

  // Terra confirms auth via the `auth` webhook (which stores the Terra user_id on
  // wearable_connections), not an OAuth code exchange.
  async exchangeCode(): Promise<WearableConnectionState> {
    throw new Error("Terra auth arrives via webhook, not an OAuth code exchange.");
  },

  async fetchSleep(state, from, to): Promise<WearableSleepNight[]> {
    if (!state.providerUserId) return [];
    return mapTerraSleep(await terraGet("sleep", state.providerUserId, from, to));
  },

  async fetchDailySummary(state, from, to): Promise<WearableDailySummary[]> {
    if (!state.providerUserId) return [];
    return mapTerraDaily(await terraGet("daily", state.providerUserId, from, to));
  },

  async disconnect(state): Promise<void> {
    // Best-effort deauthenticate on Terra's side; never throw (soft disconnect).
    if (!state.providerUserId) return;
    try {
      await fetch(`${TERRA_API}/auth/deauthenticateUser?user_id=${encodeURIComponent(state.providerUserId)}`, {
        method: "DELETE",
        headers: terraHeaders(),
      });
    } catch {
      /* ignore — the connection is marked inactive locally regardless */
    }
  },
};
