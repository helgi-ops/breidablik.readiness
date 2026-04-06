export type SnapshotSourceFreshness = "fresh" | "stale" | "missing";

export interface SnapshotSourceStatus {
  manual: {
    available: boolean;
    freshness: SnapshotSourceFreshness;
  };
  whoop: {
    available: boolean;
    freshness: SnapshotSourceFreshness;
  };
  load: {
    available: boolean;
    freshness: SnapshotSourceFreshness;
  };
  neuromuscular: {
    available: boolean;
    freshness: SnapshotSourceFreshness;
  };
  context: {
    available: boolean;
    freshness: SnapshotSourceFreshness;
  };
}

function dateOnly(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return raw ? raw.slice(0, 10) : null;
}

export function computeSourceFreshness(args: {
  available: boolean;
  sourceDate?: string | null;
  targetDate?: string | null;
}): SnapshotSourceFreshness {
  if (!args.available) return "missing";
  const sourceDate = dateOnly(args.sourceDate);
  const targetDate = dateOnly(args.targetDate);
  if (!sourceDate || !targetDate) return "stale";
  return sourceDate === targetDate ? "fresh" : "stale";
}

export function buildSnapshotSourceStatus(args: {
  targetDate: string;
  manual?: { available: boolean; sourceDate?: string | null };
  whoop?: { available: boolean; sourceDate?: string | null };
  load?: { available: boolean; sourceDate?: string | null };
  neuromuscular?: { available: boolean; sourceDate?: string | null };
  context?: { available: boolean; sourceDate?: string | null };
}): SnapshotSourceStatus {
  return {
    manual: {
      available: args.manual?.available === true,
      freshness: computeSourceFreshness({
        available: args.manual?.available === true,
        sourceDate: args.manual?.sourceDate,
        targetDate: args.targetDate,
      }),
    },
    whoop: {
      available: args.whoop?.available === true,
      freshness: computeSourceFreshness({
        available: args.whoop?.available === true,
        sourceDate: args.whoop?.sourceDate,
        targetDate: args.targetDate,
      }),
    },
    load: {
      available: args.load?.available === true,
      freshness: computeSourceFreshness({
        available: args.load?.available === true,
        sourceDate: args.load?.sourceDate,
        targetDate: args.targetDate,
      }),
    },
    neuromuscular: {
      available: args.neuromuscular?.available === true,
      freshness: computeSourceFreshness({
        available: args.neuromuscular?.available === true,
        sourceDate: args.neuromuscular?.sourceDate,
        targetDate: args.targetDate,
      }),
    },
    context: {
      available: args.context?.available === true,
      freshness: computeSourceFreshness({
        available: args.context?.available === true,
        sourceDate: args.context?.sourceDate,
        targetDate: args.targetDate,
      }),
    },
  };
}
