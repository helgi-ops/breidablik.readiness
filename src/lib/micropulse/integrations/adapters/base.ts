import type {
  ImportConflictRecord,
  IntegrationProviderKey,
  NormalizedExternalMetric,
  ProviderAdapterResult,
  RawIntegrationPayload,
} from "../types";

export type AdapterNormalizeContext = {
  knownMetricKeys?: string[];
};

/** Provider adapters translate raw vendor payloads into normalized MicroPulse metric records. */
export interface IntegrationProviderAdapter {
  provider: IntegrationProviderKey;
  canHandle(payload: unknown): boolean;
  normalize(payload: RawIntegrationPayload, context?: AdapterNormalizeContext): ProviderAdapterResult;
}

export function makeConflict(args: Omit<ImportConflictRecord, "id" | "createdAt">): ImportConflictRecord {
  return {
    ...args,
    id: `conflict:${args.provider}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
}

export function safeArray(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) return input.filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const nested = obj.records ?? obj.data ?? obj.items;
    if (Array.isArray(nested)) return nested.filter((i): i is Record<string, unknown> => !!i && typeof i === "object");
  }
  return [];
}

export function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function metric(args: NormalizedExternalMetric): NormalizedExternalMetric {
  return args;
}

export function emptyResult(summary: string, conflicts: ImportConflictRecord[] = []): ProviderAdapterResult {
  return {
    normalizedMetrics: [],
    conflicts,
    warnings: [],
    summary,
  };
}
