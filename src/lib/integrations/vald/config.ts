import "server-only";

import crypto from "node:crypto";
import type { ValdAuthMode, ValdConnectionConfig } from "./types";

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
  freshness: {
    cmjDays: parseIntEnv("VALD_FRESHNESS_DAYS_CMJ", 7),
    nordbordDays: parseIntEnv("VALD_FRESHNESS_DAYS_NORDBORD", 14),
    forceframeDays: parseIntEnv("VALD_FRESHNESS_DAYS_FORCEFRAME", 21),
  },
};

export function getDefaultValdConnectionConfig(): ValdConnectionConfig {
  const authMode = (optionalEnv("VALD_API_KEY") ? "api_key" : optionalEnv("VALD_CLIENT_ID") ? "oauth" : "unknown") as ValdAuthMode;
  return {
    baseUrl: optionalEnv("VALD_BASE_URL") ?? "https://api.valdperformance.com",
    authMode,
    clientId: optionalEnv("VALD_CLIENT_ID"),
    clientSecret: optionalEnv("VALD_CLIENT_SECRET"),
    apiKey: optionalEnv("VALD_API_KEY"),
    orgId: optionalEnv("VALD_DEFAULT_ORG_ID"),
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
