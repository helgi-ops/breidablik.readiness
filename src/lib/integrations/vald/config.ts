import "server-only";

import crypto from "node:crypto";
import type { ValdAuthMode, ValdConnectionConfig, ValdRegion } from "./types";

// ── VALD token endpoint ───────────────────────────────────────────────────────
// VALD uses Auth0 at auth.prd.vald.com (confirmed March 2026 via Hub session).
// Override via VALD_TOKEN_URL env var if needed.
export const VALD_TOKEN_URL = process.env.VALD_TOKEN_URL ?? "https://auth.prd.vald.com/oauth/token";

/**
 * Returns the product-specific API base URL for the given region.
 *
 * VALD uses 3 different subdomain conventions across products — the NordBord
 * and ForceFrame values are taken VERBATIM from VALD's own External-API guides
 * (support.vald.com, "A guide to using the External NordBord/ForceFrame API",
 * confirmed 23 Aug 2026):
 *
 *   - ForceDecks: legacy `extforcedecks` (v2019q3 API)
 *   - NordBord:   `externalnordbord`  (e.g. prd-euw-api-externalnordbord…)
 *   - ForceFrame: `externalforceframe` (e.g. prd-euw-api-externalforceframe…)
 *
 * An earlier DevTools probe of the internal HUB guessed `nordbord` / `groinbar`;
 * those are HUB-internal hosts, NOT the documented External API — the External
 * hosts all carry the `external` prefix.
 *
 * @example
 *   getValdProductBaseUrl("euw", "forceframe")
 *   // → "https://prd-euw-api-externalforceframe.valdperformance.com"
 */
export function getValdProductBaseUrl(region: ValdRegion, product: "forcedecks" | "nordbord" | "forceframe"): string {
  const subdomain =
    product === "forcedecks" ? "extforcedecks" :
    product === "forceframe" ? "externalforceframe" :
    "externalnordbord";
  return `https://prd-${region}-api-${subdomain}.valdperformance.com`;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value != null && value !== "") return value;
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value.toLowerCase() === "true";
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const VALD_THRESHOLDS = {
  cmjModerateDropPct: 5,
  cmjSevereDropPct: 10,
  nordbordHighAsymmetryPct: 15,
  nordbordModerateAsymmetryPct: 10,
  forceframeHighAsymmetryPct: 15,
  baselineWindowDays: 42,
  baselineMinTests: 3,
};

export const VALD_RUNTIME = {
  enabled: parseBool(optionalEnv("VALD_ENABLED"), false),
  defaultOrgId: optionalEnv("VALD_DEFAULT_ORG_ID"),
  syncLookbackDays: parseIntEnv("VALD_SYNC_LOOKBACK_DAYS", 14),
  // NordBord/ForceFrame /tests/{id}/metrics enrichment (per-kg force, windowed
  // RFD/impulse). Default OFF: it costs one extra API call per test and, for
  // orgs without athlete bodyweights in VALD, returns all-null values. Flip on
  // (VALD_FETCH_DEVICE_METRICS=true) once those metrics are populated.
  fetchDeviceMetrics: parseBool(optionalEnv("VALD_FETCH_DEVICE_METRICS"), false),
  freshness: {
    cmjDays: parseIntEnv("VALD_FRESHNESS_DAYS_CMJ", 7),
    nordbordDays: parseIntEnv("VALD_FRESHNESS_DAYS_NORDBORD", 14),
    forceframeDays: parseIntEnv("VALD_FRESHNESS_DAYS_FORCEFRAME", 21),
  },
};

export function getDefaultValdConnectionConfig(): ValdConnectionConfig {
  const region = (optionalEnv("VALD_REGION") ?? null) as ValdRegion | null;
  const authMode = (optionalEnv("VALD_API_KEY") ? "api_key" : optionalEnv("VALD_CLIENT_ID") ? "oauth" : "unknown") as ValdAuthMode;
  // Use region-based ForceDecks URL when a region is configured; fall back to the legacy generic base.
  const defaultBase =
    region ? getValdProductBaseUrl(region, "forcedecks") : "https://prd-euw-api-extforcedecks.valdperformance.com";
  return {
    baseUrl: optionalEnv("VALD_BASE_URL") ?? defaultBase,
    authMode,
    clientId: optionalEnv("VALD_CLIENT_ID"),
    clientSecret: optionalEnv("VALD_CLIENT_SECRET"),
    apiKey: optionalEnv("VALD_API_KEY"),
    orgId: optionalEnv("VALD_DEFAULT_ORG_ID"),
    tenantId: optionalEnv("VALD_TENANT_ID"),
    region,
    tokenUrl: optionalEnv("VALD_TOKEN_URL"),
    timeoutMs: 15000,
  };
}

// TODO: Replace with shared project encryption utility if/when one is introduced.
function getEncryptionKey(): Buffer {
  const source = optionalEnv("MICROPULSE_SECRET_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? env("NEXT_PUBLIC_SUPABASE_URL");
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptValdSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptValdSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = Buffer.from(value, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}
