type LoadInput = {
  id?: string | null;
  sessionRpeLoad?: number | null;
  acuteLoad?: number | null;
  chronicLoad?: number | null;
  acwr?: number | null;
  gpsLoad?: number | null;
  zScore?: number | null;
  deltaZ?: number | null;
  volatility5d?: number | null;
  volatility7d?: number | null;
};

export function mapLoadToSnapshotFields(args: {
  load?: LoadInput | null;
  whoopStrain?: number | null;
}) {
  const load = args.load ?? null;
  const hasGps = typeof load?.gpsLoad === "number" && Number.isFinite(load.gpsLoad);
  const hasRpe = typeof load?.sessionRpeLoad === "number" && Number.isFinite(load.sessionRpeLoad);
  const hasWhoop = typeof args.whoopStrain === "number" && Number.isFinite(args.whoopStrain);

  const loadSourcePriority = hasGps ? "gps" : hasRpe ? "rpe" : hasWhoop ? "whoop" : "unknown";

  return {
    load: {
      sessionRpeLoad: load?.sessionRpeLoad ?? null,
      acuteLoad: load?.acuteLoad ?? null,
      chronicLoad: load?.chronicLoad ?? null,
      acwr: load?.acwr ?? null,
      gpsLoad: load?.gpsLoad ?? null,
      whoopStrain: hasGps || hasRpe ? null : args.whoopStrain ?? null,
      loadSourcePriority,
    },
    stability: {
      zScore: load?.zScore ?? null,
      deltaZ: load?.deltaZ ?? null,
      volatility5d: load?.volatility5d ?? null,
      volatility7d: load?.volatility7d ?? null,
    },
    rawRefs: {
      loadRecordId: load?.id ?? null,
    },
  };
}
