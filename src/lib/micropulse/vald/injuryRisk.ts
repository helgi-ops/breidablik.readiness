import "server-only";

import { getValdDailySnapshot } from "./snapshot";
import type { ValdInjuryRiskSignals } from "./types";

export async function getValdInjuryRiskSignals(teamId: string, microplayerId: string, date: string): Promise<ValdInjuryRiskSignals> {
  const snapshot = await getValdDailySnapshot(teamId, microplayerId, date);
  if (!snapshot) {
    return {
      hamstringRiskFlag: false,
      groinRiskFlag: false,
      neuromuscularRiskFlag: false,
      reasons: ["No recent VALD data available; confidence reduced."],
    };
  }

  const hamstringRiskFlag = snapshot.hamstringFlag === "red" || snapshot.hamstringFlag === "yellow";
  const groinRiskFlag = snapshot.groinFlag === "red" || snapshot.groinFlag === "yellow";
  const neuromuscularRiskFlag = snapshot.neuromuscularFlag === "red";
  const reasons: string[] = [];

  const cmjMessage = typeof snapshot.explanation?.cmj === "object" ? String((snapshot.explanation.cmj as Record<string, unknown>).message ?? "") : "";
  const nordMessage = typeof snapshot.explanation?.nordbord === "object" ? String((snapshot.explanation.nordbord as Record<string, unknown>).message ?? "") : "";
  const ffMessage = typeof snapshot.explanation?.forceframe === "object" ? String((snapshot.explanation.forceframe as Record<string, unknown>).message ?? "") : "";
  if (neuromuscularRiskFlag && cmjMessage) reasons.push(cmjMessage);
  if (hamstringRiskFlag && nordMessage) reasons.push(nordMessage);
  if (groinRiskFlag && ffMessage) reasons.push(ffMessage);

  return { hamstringRiskFlag, groinRiskFlag, neuromuscularRiskFlag, reasons };
}
