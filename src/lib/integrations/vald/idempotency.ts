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

export function shouldReingestValdPayload(args: {
  previousSourceUpdatedAt?: string | null;
  nextSourceUpdatedAt?: string | null;
  previousPayloadHash?: string | null;
  nextPayloadHash: string;
}): boolean {
  if (!args.previousPayloadHash) return true;
  if (args.previousPayloadHash !== args.nextPayloadHash) return true;
  if (args.previousSourceUpdatedAt && args.nextSourceUpdatedAt && args.previousSourceUpdatedAt !== args.nextSourceUpdatedAt) return true;
  return false;
}
