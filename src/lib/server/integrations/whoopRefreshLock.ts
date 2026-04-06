import "server-only";

const refreshLocks = new Map<string, Promise<void>>();

/**
 * In-process per-athlete lock for WHOOP token refresh.
 * Note: in multi-instance deployments this should be replaced with a distributed lock.
 */
export async function withWhoopRefreshLock<T>(athleteId: string, fn: () => Promise<T>): Promise<T> {
  const existing = refreshLocks.get(athleteId);
  if (existing) await existing;

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  refreshLocks.set(athleteId, gate);

  try {
    return await fn();
  } finally {
    release();
    if (refreshLocks.get(athleteId) === gate) {
      refreshLocks.delete(athleteId);
    }
  }
}

