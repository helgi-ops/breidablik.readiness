import type { RealtimeUiUpdate } from "./types";

const lastUpdateAt = new Map<string, number>();

/** Checks if UI update should be throttled to avoid high-frequency rerender churn. */
export function shouldThrottleUiUpdate(update: RealtimeUiUpdate, windowMs = 1000): boolean {
  const key = `${update.target}:${update.targetId ?? "*"}`;
  const now = Date.now();
  const last = lastUpdateAt.get(key);
  lastUpdateAt.set(key, now);
  return last != null && now - last < windowMs;
}

/** Coalesces multiple UI updates into minimal refresh targets. */
export function coalesceRealtimeUiUpdates(updates: RealtimeUiUpdate[]): RealtimeUiUpdate[] {
  const map = new Map<string, RealtimeUiUpdate>();
  for (const update of updates) {
    const key = `${update.target}:${update.targetId ?? "*"}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, update);
      continue;
    }
    if (existing.updateType === "PATCH" && update.updateType === "REFRESH") {
      map.set(key, update);
      continue;
    }
    if (existing.updateType === "PATCH" && update.updateType === "PATCH") {
      map.set(key, {
        ...update,
        patch: { ...(existing.patch ?? {}), ...(update.patch ?? {}) },
        summary: `${existing.summary}; ${update.summary}`,
      });
    }
  }
  return Array.from(map.values());
}

/** Compact textual summary for coalesced update batches. */
export function summarizeCoalescedUpdate(updates: RealtimeUiUpdate[]): string {
  if (!updates.length) return "No live UI updates.";
  const targets = new Set(updates.map((u) => u.target));
  return `${updates.length} update(s) across ${targets.size} target group(s).`;
}

