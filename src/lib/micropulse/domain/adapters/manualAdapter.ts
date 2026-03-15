type ManualInput = {
  id?: string | null;
  totalScore?: number | null;
  soreness?: number | null;
  stress?: number | null;
  mood?: number | null;
  sleepQuality?: number | null;
  motivation?: number | null;
  completed?: boolean | null;
};

export function mapManualToSnapshotFields(input?: ManualInput | null) {
  const hasManual = !!input && (input.completed === true || typeof input.totalScore === "number");
  return {
    subjective: {
      soreness: input?.soreness ?? null,
      stress: input?.stress ?? null,
      mood: input?.mood ?? null,
      sleepQuality: input?.sleepQuality ?? null,
      motivation: input?.motivation ?? null,
      checkInCompleted: hasManual,
    },
    rawRefs: {
      manualCheckInId: input?.id ?? null,
    },
  };
}
