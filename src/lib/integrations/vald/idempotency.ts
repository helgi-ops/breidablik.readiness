import crypto from "node:crypto";

export function hashPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

export function buildValdIngestionKey(args: {
  provider?: string | null;
  valdTestId: string;
  valdAthleteId: string;
  testTimestamp: string;
  payloadHash: string;
}): string {
  return [
    args.provider ?? "vald",
    args.valdTestId,
    args.valdAthleteId,
    args.testTimestamp,
    args.payloadHash,
  ].join(":");
}

// Compare as instants: Postgres hands back "2026-04-28T13:49:01.754454+00:00" for
// VALD's "2026-04-28T13:49:01.7544544Z", so the strings never match.
function isSameInstant(a: string, b: string): boolean {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return a === b;
  return aMs === bMs;
}

export function shouldReingestValdPayload(args: {
  previousSourceUpdatedAt?: string | null;
  nextSourceUpdatedAt?: string | null;
  previousPayloadHash?: string | null;
  nextPayloadHash: string;
}): boolean {
  if (!args.previousPayloadHash) return true;
  if (args.previousPayloadHash !== args.nextPayloadHash) return true;
  if (args.previousSourceUpdatedAt && args.nextSourceUpdatedAt && !isSameInstant(args.previousSourceUpdatedAt, args.nextSourceUpdatedAt)) return true;
  return false;
}
