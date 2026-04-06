import type { ImportConflictRecord, IntegrationProviderKey, PlayerMappingRecord } from "./types";

export type InternalPlayerCandidate = {
  id: string;
  name?: string | null;
  teamId?: string | null;
};

export type PlayerMappingCandidate = {
  mapping: PlayerMappingRecord;
  reason: string;
};

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function safeId(): string {
  return `map:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function makeConflict(
  provider: IntegrationProviderKey,
  summary: string,
  details?: Record<string, unknown>,
): ImportConflictRecord {
  return {
    id: `conflict:${provider}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    provider,
    type: "DUPLICATE_MAPPING",
    severity: "HIGH",
    summary,
    details,
    createdAt: new Date().toISOString(),
  };
}

/** Builds a deterministic mapping candidate from external identity and known internal players. */
export function buildPlayerMappingCandidate(args: {
  provider: IntegrationProviderKey;
  externalAthleteId?: string | null;
  externalAthleteName?: string | null;
  internalPlayers: InternalPlayerCandidate[];
  existingMappings?: PlayerMappingRecord[];
}): PlayerMappingCandidate {
  const { provider, externalAthleteId, externalAthleteName, internalPlayers, existingMappings = [] } = args;
  const now = new Date().toISOString();
  const extId = String(externalAthleteId ?? "").trim();
  const extName = normalizeName(externalAthleteName);

  const existing = existingMappings.find(
    (record) => record.provider === provider && record.status === "MAPPED" && (record.externalAthleteId ?? "") === extId && extId,
  );
  if (existing) {
    return {
      mapping: { ...existing, confidence: Math.max(0.95, existing.confidence), updatedAt: now },
      reason: "Matched existing external athlete mapping by externalAthleteId.",
    };
  }

  const directNameMatch = internalPlayers.find((player) => normalizeName(player.name) === extName && extName);
  if (directNameMatch) {
    return {
      mapping: {
        id: safeId(),
        provider,
        internalPlayerId: directNameMatch.id,
        internalPlayerName: directNameMatch.name ?? null,
        externalAthleteId: extId || null,
        externalAthleteName: externalAthleteName ?? null,
        confidence: 0.82,
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      },
      reason: "Potential name-based mapping found; pending confirmation.",
    };
  }

  return {
    mapping: {
      id: safeId(),
      provider,
      internalPlayerId: "",
      internalPlayerName: null,
      externalAthleteId: extId || null,
      externalAthleteName: externalAthleteName ?? null,
      confidence: 0.2,
      status: "UNMATCHED",
      createdAt: now,
      updatedAt: now,
    },
    reason: "No safe candidate found; mapping left unmatched.",
  };
}

/** Resolves a single external athlete identity to a mapping record with conservative confidence rules. */
export function resolvePlayerMapping(args: {
  provider: IntegrationProviderKey;
  externalAthleteId?: string | null;
  externalAthleteName?: string | null;
  existingMappings?: PlayerMappingRecord[];
  internalPlayers: InternalPlayerCandidate[];
}): {
  mapping: PlayerMappingRecord | null;
  confidence: number;
  status: PlayerMappingRecord["status"];
} {
  const { mapping } = buildPlayerMappingCandidate(args);
  if (!mapping.internalPlayerId) {
    return {
      mapping: null,
      confidence: mapping.confidence,
      status: mapping.status,
    };
  }

  const promotedStatus = mapping.confidence >= 0.9 ? "MAPPED" : mapping.status;
  return {
    mapping: {
      ...mapping,
      status: promotedStatus,
    },
    confidence: mapping.confidence,
    status: promotedStatus,
  };
}

/** Detects duplicate external->internal mapping conflicts to prevent unsafe auto-linking. */
export function detectDuplicateMappings(records: PlayerMappingRecord[]): ImportConflictRecord[] {
  const byProviderExternal = new Map<string, PlayerMappingRecord[]>();
  for (const record of records) {
    const externalId = String(record.externalAthleteId ?? "").trim();
    if (!externalId) continue;
    const key = `${record.provider}::${externalId}`;
    const group = byProviderExternal.get(key) ?? [];
    group.push(record);
    byProviderExternal.set(key, group);
  }

  const conflicts: ImportConflictRecord[] = [];
  for (const [key, group] of byProviderExternal.entries()) {
    const uniqueInternal = new Set(group.map((item) => item.internalPlayerId));
    if (uniqueInternal.size <= 1) continue;
    conflicts.push(
      makeConflict(
        group[0].provider,
        `Duplicate mapping conflict for ${key}: one external athlete maps to multiple internal players.`,
        {
          records: group.map((item) => ({
            id: item.id,
            internalPlayerId: item.internalPlayerId,
            internalPlayerName: item.internalPlayerName,
            confidence: item.confidence,
            status: item.status,
          })),
        },
      ),
    );
  }
  return conflicts;
}

/** Coach-friendly summary text for mapping state distribution. */
export function summarizePlayerMapping(records: PlayerMappingRecord[]): string {
  const mapped = records.filter((record) => record.status === "MAPPED").length;
  const pending = records.filter((record) => record.status === "PENDING").length;
  const unmatched = records.filter((record) => record.status === "UNMATCHED").length;
  const conflicts = records.filter((record) => record.status === "CONFLICT").length;
  return `${mapped} mapped, ${pending} pending, ${unmatched} unmatched, ${conflicts} conflicts.`;
}

