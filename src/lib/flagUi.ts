export type Flag = "GREEN" | "YELLOW" | "RED";

export function scoreToFlag(totalScore: number | null | undefined): Flag {
  const s = totalScore ?? 0;
  if (s >= 13) return "GREEN";
  if (s >= 10) return "YELLOW";
  return "RED";
}

export function normalizeFlag(input: any): Flag {
  const v = String(input ?? "").toUpperCase();
  if (v === "GREEN" || v === "YELLOW" || v === "RED") return v;
  return "YELLOW";
}

export function flagUi(flag: Flag) {
  switch (flag) {
    case "GREEN":
      return {
        label: "FULL",
        title: "Full æfing",
        pill: "bg-green-100 text-green-800 border-green-200",
        dot: "bg-green-500",
        panel: "border-green-200",
        hint: "Tilbúinn í fulla æfingu.",
      };
    case "YELLOW":
      return {
        label: "MODIFIED",
        title: "Aðlagað álag",
        pill: "bg-yellow-100 text-yellow-800 border-yellow-200",
        dot: "bg-yellow-500",
        panel: "border-yellow-200",
        hint: "Aðlagaðu álag/umfang í dag.",
      };
    case "RED":
      return {
        label: "RECOVERY",
        title: "Recovery",
        pill: "bg-red-100 text-red-800 border-red-200",
        dot: "bg-red-500",
        panel: "border-red-200",
        hint: "Fókus á endurheimt og gæði svefns.",
      };
  }
}
