import "server-only";

import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type { ProviderAuthMode, ProviderConnectionLifecycleStatus, ProviderCredentialRecord } from "./types";
import { loadProviderCredentialMetadata, saveProviderCredentialMetadata, validateCredentialMetadata } from "./credentials";

export type ProviderConnectionStart = {
  provider: IntegrationProviderKey;
  authMode: ProviderAuthMode;
  status: ProviderConnectionLifecycleStatus;
  redirectUrl?: string | null;
  summary: string;
};

/** Builds deterministic connection start metadata for provider auth handoff. */
export function buildProviderConnectionStart(args: {
  provider: IntegrationProviderKey;
  authMode: ProviderAuthMode;
  organizationId?: string | null;
  teamId?: string | null;
  callbackPath?: string | null;
}): ProviderConnectionStart {
  const callbackPath = args.callbackPath ?? `/api/integrations-live/connections/callback`;
  const redirectUrl = args.authMode === "OAUTH" ? `${callbackPath}?provider=${args.provider}` : null;
  saveProviderCredentialMetadata({
    provider: args.provider,
    organizationId: args.organizationId ?? null,
    teamId: args.teamId ?? null,
    authMode: args.authMode,
    status: "AUTH_PENDING",
    credentialSummary: `${args.authMode} pending`,
    enabled: true,
    hasRefreshToken: false,
    hasWebhookSecret: false,
  });
  return {
    provider: args.provider,
    authMode: args.authMode,
    status: "AUTH_PENDING",
    redirectUrl,
    summary: `${args.provider} connection started in ${args.authMode} mode.`,
  };
}

/** Builds callback result metadata after provider auth/callback completion. */
export function buildProviderAuthCallbackResult(args: {
  provider: IntegrationProviderKey;
  success: boolean;
  statusMessage?: string | null;
  expiresAt?: string | null;
  hasRefreshToken?: boolean;
}): ProviderCredentialRecord {
  const existing = loadProviderCredentialMetadata(args.provider)[0];
  return saveProviderCredentialMetadata({
    id: existing?.id,
    provider: args.provider,
    organizationId: existing?.organizationId ?? null,
    teamId: existing?.teamId ?? null,
    authMode: existing?.authMode ?? "OAUTH",
    status: args.success ? "CONNECTED" : "ERROR",
    credentialSummary: args.statusMessage ?? (args.success ? "Connected via callback." : "Auth callback failed."),
    hasRefreshToken: args.hasRefreshToken ?? existing?.hasRefreshToken ?? false,
    hasWebhookSecret: existing?.hasWebhookSecret ?? false,
    expiresAt: args.expiresAt ?? existing?.expiresAt ?? null,
    enabled: true,
    lastValidatedAt: new Date().toISOString(),
  });
}

/** Validates a provider connection lifecycle based on credential metadata validity. */
export function validateProviderConnection(provider: IntegrationProviderKey): { valid: boolean; status: ProviderConnectionLifecycleStatus; summary: string } {
  const record = loadProviderCredentialMetadata(provider)[0];
  if (!record) return { valid: false, status: "NOT_CONNECTED", summary: "No credential metadata found." };
  const validation = validateCredentialMetadata(record);
  return {
    valid: validation.valid,
    status: validation.valid ? "CONNECTED" : record.status === "EXPIRED" ? "EXPIRED" : "ERROR",
    summary: validation.reason,
  };
}

/** Disables provider connection metadata without deleting historical sync records. */
export function disconnectProviderConnection(provider: IntegrationProviderKey, reason?: string | null): ProviderCredentialRecord | null {
  const existing = loadProviderCredentialMetadata(provider)[0];
  if (!existing) return null;
  return saveProviderCredentialMetadata({
    ...existing,
    status: "DISABLED",
    enabled: false,
    credentialSummary: reason ? `Disconnected: ${reason}` : "Disconnected by staff action.",
  });
}

