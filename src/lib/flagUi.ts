export type Flag = "GREEN" | "YELLOW" | "RED";

/**
 * Notað EF ekkert coach override er til staðar
 */
export function scoreToFlag(totalScore: number | null | undefined): Flag {
  const s = totalScore ?? 0;
  if (s >= 13) return "GREEN";
  if (s >= 10) return "YELLOW";
  return "RED";
}

/**
 * Þvingar hvað sem kemur (string/null/undefined) niður í valid Flag
 */
export function normalizeFlag(input: unknown): Flag {
  const v = String(input ?? "").toUpperCase();
  if (v === "GREEN" || v === "YELLOW" || v === "RED") return v;
  return "YELLOW";
}

/**
 * ONE SOURCE OF TRUTH fyrir:
 * - liti
 * - labels
 * - generic skilaboð til leikmanna
 */
export function flagUi(flag: Flag) {
  switch (flag) {
    case "GREEN":
      return {
        label: "FULL",
        title: "Full æfing",
        pill: "bg-green-100 text-green-800 border-green-200",
        dot: "bg-green-500",
        panel: "border-green-200",

        // 👇 Generic skilaboð til leikmanns
        playerMessage:
          "Í dag ert þú grænn. Haltu þér í planinu og keyrðu fulla æfingu. Hitaðu vel upp og haltu gæðum í framkvæmd.",

        why:
          "Merki um góða endurheimt og stöðugt álagsþol. Engin þörf á að draga úr álagi í dag.",
      };

    case "YELLOW":
      return {
        label: "MODIFIED",
        title: "Aðlagað álag",
        pill: "bg-yellow-100 text-yellow-800 border-yellow-200",
        dot: "bg-yellow-500",
        panel: "border-yellow-200",

        playerMessage:
          "Í dag ert þú gulur. Æfðu, en aðlagaðu álag. Haltu ákefð í skefjum og forðastu að fara í hámarksálag.",

        why:
          "Merki um væga þreytu eða álag. Markmiðið er að viðhalda gæðum án þess að bæta við óþarfa stressi.",
      };

    case "RED":
      return {
        label: "RECOVERY",
        title: "Recovery",
        pill: "bg-red-100 text-red-800 border-red-200",
        dot: "bg-red-500",
        panel: "border-red-200",

        playerMessage:
          "Í dag ert þú rauður. Recovery dagur. Haltu þig við létta hreyfingu og settu fókus á svefn, næringu og vökvun.",

        why:
          "Merki um skerta endurheimt. Best er að jafna sig í dag til að vera tilbúinn næstu daga.",
      };
  }
}
