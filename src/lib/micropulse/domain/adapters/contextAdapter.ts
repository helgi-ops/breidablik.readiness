type ContextInput = {
  travel?: boolean | null;
  matchCongestion?: boolean | null;
  minutesPlayedLastMatch?: number | null;
  rehab?: boolean | null;
  returnToPlay?: boolean | null;
  weekSetupLabel?: string | null;
  expectedSessionType?: string | null;
};

export function mapContextToSnapshotFields(input?: ContextInput | null) {
  return {
    context: {
      travel: input?.travel ?? null,
      matchCongestion: input?.matchCongestion ?? null,
      minutesPlayedLastMatch: input?.minutesPlayedLastMatch ?? null,
      rehab: input?.rehab ?? null,
      returnToPlay: input?.returnToPlay ?? null,
      weekSetupLabel: input?.weekSetupLabel ?? null,
      expectedSessionType: input?.expectedSessionType ?? null,
    },
  };
}
