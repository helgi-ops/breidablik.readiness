import "server-only";

import { getValdDailySnapshot } from "./snapshot";
import type { ValdInjuryRiskSignals } from "./types";

export async function getValdInjuryRiskSignals(teamId: string, microplayerId: string, date: string): Promise<ValdInjuryRiskSignals> {
  const snapshot = await getValdDailySnapshot(teamId, microplayerId, date);
  if (!snapshot) {
    return {
      neuromuscularRiskFlag: false,
      reasons: ["No recent VALD data available; confidence reduced."],
    };
  }

  const neuromuscularRiskFlag = snapshot.neuromuscularFlag === "red";
  const reasons: string[] = [];

  const cmjMessage = typeof snapshot.explanation?.cmj === "object" ? String((snapshot.explanation.cmj as Record<string, unknown>).message ?? "") : "";
  if (neuromuscularRiskFlag && cmjMessage) reasons.push(cmjMessage);
  // NordBord / ForceFrame left/right gaps are not injury-risk reasons: a gap alone did not raise
  // hamstring (Opar 2015) or groin (Vigneswaran 2025) injury risk. They stay on the VALD panel.

  return { neuromuscularRiskFlag, reasons };
}
