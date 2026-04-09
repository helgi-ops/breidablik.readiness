export type DevPlayerTab = "today" | "history" | "dashboard" | "risk" | "rpe" | "vald" | "strength" | "chat";

export type DevPlayerRiskViewModel = {
  statusLabel: string;
  tone: "green" | "yellow" | "red" | "gray";
  primaryMessage: string;
  why: string | null;
  recoverySignals: string | null;
  neuralFatigue: string | null;
};

export function normalizeDevPlayerTab(value: string | null | undefined): DevPlayerTab {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "history") return "history";
  if (v === "dashboard") return "dashboard";
  if (v === "risk") return "risk";
  if (v === "rpe") return "rpe";
  if (v === "vald") return "vald";
  if (v === "strength") return "strength";
  if (v === "chat") return "chat";
  return "today";
}

export function buildDevPlayerRiskViewModel(input: {
  playerState: "GREEN" | "YELLOW" | "RED" | "GRAY";
  message: string | null;
  why: string | null;
  mdContext: string | null;
}): DevPlayerRiskViewModel {
  const tone =
    input.playerState === "GREEN"
      ? "green"
      : input.playerState === "YELLOW"
      ? "yellow"
      : input.playerState === "RED"
      ? "red"
      : "gray";

  const statusLabel =
    input.playerState === "GREEN"
      ? "Low current risk"
      : input.playerState === "YELLOW"
      ? "Managed caution"
      : input.playerState === "RED"
      ? "Recovery-focused"
      : "Check-in pending";

  const recoverySignals =
    input.playerState === "RED"
      ? "Recovery bias is active today. Keep load light and controlled."
      : input.playerState === "YELLOW"
      ? "Recovery signals suggest tighter control of volume and intensity."
      : input.playerState === "GREEN"
      ? "Recovery signals are supporting normal training today."
      : "Complete today’s check-in to unlock a clearer recovery view.";

  const neuralFatigue =
    input.playerState === "RED"
      ? "Neural freshness is not supportive of high-cost work today."
      : input.playerState === "YELLOW"
      ? "Neural freshness may need tighter pacing and cleaner execution today."
      : input.playerState === "GREEN"
      ? "Neural freshness appears supportive of today’s session."
      : "Neural status is limited until today’s readiness context is complete.";

  return {
    statusLabel,
    tone,
    primaryMessage:
      input.message ??
      (input.mdContext ? `Status aligned with ${input.mdContext} context today.` : "Status based on today’s readiness context."),
    why: input.why,
    recoverySignals,
    neuralFatigue,
  };
}
