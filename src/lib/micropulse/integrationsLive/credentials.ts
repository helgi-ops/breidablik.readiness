import "server-only";

import type { IntegrationProviderKey } from "@/lib/micropulse/integrations";
import type { ProviderCredentialRecord } from "./types";
import { loadProviderCredentialMetadata as loadCredentialRecords, saveProviderCredentialMetadata as saveCredentialRecord } from "./persistence";

/** Saves server-side provider credential metadata; secrets remain in secure secret stores outside UI payloads. */
export function saveProviderCredentialMetadata(
  record: Omit<ProviderCredentialRecord, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string | null; updatedAt?: string | null },
): ProviderCredentialRecord {
  const now = new Date().toISOString();
  return saveCredentialRecord({
    ...record,
    id: record.id ?? `cred:${record.provider.toLowerCase()}:${Date.now()}`,
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  });
}

/** Loads metadata-only credential records for provider lifecycle and health surfaces. */
export function loadProviderCredentialMetadata(provider?: IntegrationProviderKey): ProviderCredentialRecord[] {
  return loadCredentialRecords(provider);
}

/** Validates credential metadata state without exposing raw secret material. */
export function validateCredentialMetadata(record: ProviderCredentialRecord): { valid: boolean; reason: string } {
  if (!record.enabled) return { valid: false, reason: "Credential is disabled." };
  if (record.status === "ERROR") return { valid: false, reason: "Credential is in error state." };
  if (record.status === "EXPIRED") return { valid: false, reason: "Credential has expired." };
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) return { valid: false, reason: "Credential expired by timestamp." };
  if (!record.credentialSummary) return { valid: false, reason: "Missing credential summary metadata." };
  return { valid: true, reason: "Credential metadata valid." };
}

/** Builds safe UI-facing credential state text while keeping secret values server-only. */
export function summarizeCredentialState(record: ProviderCredentialRecord): string {
  const expiry = record.expiresAt ? ` Expires ${record.expiresAt}.` : "";
  return `${record.provider} ${record.status.toLowerCase().replaceAll("_", " ")}.${expiry}`;
}
