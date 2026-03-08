export type PlayerNeuralStatus = "GREEN" | "YELLOW" | "RED";

type FinalAction = "FULL" | "REDUCED" | "RECOVERY";

export function getPlayerNeuralStatus(input: {
  finalAction: FinalAction;
  reasons?: string[];
}): {
  status: PlayerNeuralStatus;
  label: string;
  title: string;
  message: string;
  actionFocus: string;
  summary?: string;
} {
  const reasons = (input.reasons ?? []).map((r) => String(r).toUpperCase());

  const summary = buildSummary(reasons);

  if (input.finalAction === "FULL") {
    return {
      status: "GREEN",
      label: "Graent",
      title: "Taugakerfisstada god",
      message: "Likaminn virist tilbúinn fyrir eðlilegt aefingaalag i dag.",
      actionFocus: "Leggdu aherslu a gaedi, kraft og fokus.",
      summary,
    };
  }

  if (input.finalAction === "REDUCED") {
    return {
      status: "YELLOW",
      label: "Gult",
      title: "Midlungs taugaalag",
      message: "Thad eru merki um ad styra thurfi alagi betur i dag.",
      actionFocus: "Forgangsradadu upphitun, vokva, naeringu og recovery.",
      summary,
    };
  }

  return {
    status: "RED",
    label: "Rautt",
    title: "Aukid taugaalag",
    message: "Merki eru um ad endurheimt og alagsstyring skipti miklu mali i dag.",
    actionFocus: "Fylgdu leidbeiningum teymis og slepptu otharfa aukaalagi.",
    summary,
  };
}

function buildSummary(reasons: string[]): string | undefined {
  if (!reasons.length) return undefined;

  const hasReadiness = reasons.some((r) => r.includes("READINESS") || r.includes("Z_") || r.includes("STEN"));
  const hasLoad = reasons.some((r) => r.includes("LOAD") || r.includes("HSR") || r.includes("ACC") || r.includes("DEC"));
  const hasAccumulation = reasons.some((r) => r.includes("VOLATILITY") || r.includes("LOW_STEN_DAYS") || r.includes("ACCUM"));

  const bits: string[] = [];
  if (hasReadiness) bits.push("Readiness merki hafa ahrif i dag.");
  if (hasLoad) bits.push("Nylegt alag er tekid med i myndina.");
  if (hasAccumulation) bits.push("Uppsafnadth alag yfir fleiri daga skiptir mali.");

  if (!bits.length) return undefined;
  return bits.slice(0, 2).join(" ");
}

