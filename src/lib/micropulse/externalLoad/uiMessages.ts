import type { CatapultExternalLoadSignals, CatapultReadinessModifier, ExternalLoadState } from "./types";

function uniq(lines: string[]): string[] {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

export function buildCatapultWhyLines(args: {
  signals?: CatapultExternalLoadSignals | null;
  modifier?: CatapultReadinessModifier | null;
}): string[] {
  const signals = args.signals;
  const modifier = args.modifier;
  if (!signals || !modifier) return [];

  const available = uniq(modifier.explanations.map((item) => item.message));
  const lines: string[] = [];

  if (signals.externalLoadState === "unknown") {
    if (available.includes("External load data insufficient for a stable Catapult baseline.")) {
      lines.push("External load data insufficient for a stable baseline.");
    }
    return lines.slice(0, 1);
  }

  if (signals.externalLoadState === "normal") {
    if (available.includes("External load within expected recent range.")) {
      lines.push("External load within expected recent range.");
    } else if ((signals.playerLoadSpike ?? 0) >= 1.1 || (signals.hirSpike ?? 0) >= 1.1) {
      lines.push("External load slightly above recent norm.");
    }
    return lines.slice(0, 1);
  }

  if ((signals.decelSpike ?? 0) >= 1.3) lines.push("Deceleration burden above recent norm.");
  else if ((signals.hirSpike ?? 0) >= 1.3) lines.push("High-intensity running load elevated versus recent norm.");
  else if ((signals.playerLoadSpike ?? 0) >= 1.3) lines.push("PlayerLoad elevated versus recent baseline.");
  else if ((signals.accelSpike ?? 0) >= 1.3) lines.push("Acceleration load above recent norm.");

  if ((signals.band6ExposureRatio ?? 0) >= 1.25 && (signals.hirSpike ?? 0) < 1.3) {
    lines.push("Sprint exposure higher than typical.");
  } else if ((signals.maxVelocityExposureRatio ?? 0) >= 1.05) {
    lines.push("Top-speed exposure higher than typical.");
  }

  if (!lines.length) {
    lines.push(...available);
  }

  return uniq(lines).slice(0, 2);
}

export function buildCatapultActionHint(args: {
  externalLoadState?: ExternalLoadState | null;
  signals?: CatapultExternalLoadSignals | null;
  athleteState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;
}): string | null {
  const state = args.externalLoadState ?? "unknown";
  const signals = args.signals;
  const athleteState = args.athleteState ?? null;

  if (state === "unknown") {
    return athleteState === "GREEN" || athleteState === "YELLOW"
      ? "Use normal coaching judgement; external load baseline is limited."
      : null;
  }

  if (state === "normal") {
    return athleteState === "GREEN" ? "Proceed as planned." : null;
  }

  if (state === "elevated") {
    if ((signals?.decelSpike ?? 0) >= 1.3) return "Manage deceleration and braking load.";
    if ((signals?.hirSpike ?? 0) >= 1.3 || (signals?.band6ExposureRatio ?? 0) >= 1.25) return "Reduce high-speed volume if possible.";
    return athleteState === "GREEN" ? "Monitor high-speed and braking load." : "Consider a modified load today.";
  }

  if ((signals?.decelSpike ?? 0) >= 1.3) return "Reduce high-speed and eccentric stress.";
  if ((signals?.hirSpike ?? 0) >= 1.3 || (signals?.band6ExposureRatio ?? 0) >= 1.25) return "Reduce high-speed and braking demands.";
  return athleteState === "RED" ? "Favor recovery emphasis today." : "Favor a lower-cost session today.";
}

export function buildCatapultConfidenceHint(args: {
  signals?: CatapultExternalLoadSignals | null;
  readinessConfidence: "low" | "medium" | "high";
}): string | null {
  const signals = args.signals;
  if (!signals) return null;
  if (signals.dataQuality === "good") return "Confidence supported by recent external load history.";
  if (signals.dataQuality === "partial") return "Confidence moderate; external load history is partial.";
  if (args.readinessConfidence !== "low") return "Confidence based primarily on wellness inputs today.";
  return null;
}

export function mergeWhyLines(args: {
  baseLines: string[];
  catapultLines?: string[] | null;
  maxLines?: number;
}): string[] {
  const base = uniq(args.baseLines);
  const catapult = uniq(args.catapultLines ?? []);
  const merged: string[] = [];

  for (const line of base) {
    if (merged.length >= (args.maxLines ?? 3)) break;
    merged.push(line);
  }

  for (const line of catapult) {
    if (merged.length >= (args.maxLines ?? 3)) break;
    const lower = line.toLowerCase();
    const redundant = merged.some((existing) => {
      const existingLower = existing.toLowerCase();
      return (
        (lower.includes("external load") && existingLower.includes("load")) ||
        (lower.includes("high-intensity running") && existingLower.includes("high-intensity running")) ||
        (lower.includes("sprint exposure") && existingLower.includes("high-intensity running")) ||
        (lower.includes("deceleration burden") && existingLower.includes("deceleration")) ||
        (lower.includes("acceleration load") && existingLower.includes("acceleration"))
      );
    });
    if (!redundant) merged.push(line);
  }

  return merged.slice(0, args.maxLines ?? 3);
}

export function mergeActionLines(args: {
  baseLines: string[];
  catapultHint?: string | null;
  maxLines?: number;
}): string[] {
  const base = uniq(args.baseLines);
  const hint = args.catapultHint?.trim() ? args.catapultHint.trim() : null;
  if (!hint) return base.slice(0, args.maxLines ?? 3);

  const merged = [...base];
  const duplicate = merged.some((line) => {
    const lower = line.toLowerCase();
    const hintLower = hint.toLowerCase();
    return (
      (hintLower.includes("high-speed") && lower.includes("high-speed")) ||
      (hintLower.includes("recovery") && lower.includes("recovery")) ||
      (hintLower.includes("modified load") && lower.includes("modify")) ||
      (hintLower.includes("deceleration") && lower.includes("braking")) ||
      lower === hintLower
    );
  });
  if (!duplicate) merged.push(hint);
  return uniq(merged).slice(0, args.maxLines ?? 3);
}
