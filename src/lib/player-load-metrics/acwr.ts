import type { AcwrBand } from "@/lib/player-load-metrics/types";

export function getAcwrBand(acwr: number | null): AcwrBand {
  if (acwr == null || !Number.isFinite(acwr)) return "INSUFFICIENT_DATA";
  if (acwr < 0.8) return "LOW";
  if (acwr <= 1.3) return "SAFE";
  if (acwr <= 1.5) return "CAUTION";
  return "RISK";
}

// NOTE(neural-fatigue): Acute/chronic load trend and ACWR bands will become
// features for Neural Fatigue Model and readiness context. Not wired into
// production day decisions yet.

