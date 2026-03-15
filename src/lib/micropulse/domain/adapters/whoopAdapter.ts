import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
import { buildReadinessWhoopSection } from "@/lib/integrations/shared/monitoringSnapshot";

export function mapWhoopToSnapshotFields(args: {
  snapshot?: NormalizedMonitoringSnapshot | null;
  connected?: boolean | null;
  lastSyncAt?: string | null;
}) {
  const snapshot = args.snapshot ?? null;
  const whoopSection = snapshot ? buildReadinessWhoopSection(snapshot) : null;

  return {
    recovery: {
      recoveryScore: snapshot?.recoveryScore ?? null,
      sleepPerformance: snapshot?.sleepPerformance ?? null,
      sleepDurationMillis: snapshot?.totalSleepMillis ?? null,
      sleepConsistency: snapshot?.sleepConsistency ?? null,
      sleepEfficiency: snapshot?.sleepEfficiency ?? null,
    },
    autonomic: {
      hrv: snapshot?.hrv ?? null,
      restingHr: snapshot?.restingHr ?? null,
      respiratoryRate: snapshot?.respiratoryRate ?? null,
    },
    load: {
      whoopStrain: snapshot?.workoutStrain ?? null,
      loadSourcePriority: snapshot?.workoutStrain != null ? "whoop" : null,
    },
    integrations: {
      whoop: {
        connected: args.connected === true,
        snapshotAvailable: !!snapshot,
        confidence: whoopSection?.confidence ?? null,
        lastSyncAt: args.lastSyncAt ?? null,
      },
    },
    whoopSection,
    rawRefs: {
      whoopSnapshotId: snapshot ? `${snapshot.athleteId}:${snapshot.date}:${snapshot.source}` : null,
    },
  };
}
