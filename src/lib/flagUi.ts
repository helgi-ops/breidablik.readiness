import type { Lang } from "@/lib/lang";

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
export function flagUi(flag: Flag, lang: Lang = "IS") {
  const isEN = lang === "EN";
  switch (flag) {
    case "GREEN":
      return {
        label: "FULL",
        title: isEN ? "Full session — go at intensity" : "Full æfing — sæktu í þig",
        pill: "bg-green-100 text-green-800 border-green-200",
        dot: "bg-green-500",
        panel: "border-green-200",

        // 👇 Generic skilaboð til leikmanns (fallback when no team/DB message)
        playerMessage: isEN
          ? "Readiness is green across the board. Follow the plan, warm up well, and put quality first."
          : "Reiðuskori er grænt á öllum sviðum. Fylgdu planinu, hitaðu vel upp og settu gæði í forgang.",

        why: isEN
          ? "Signs of good recovery and steady training load. No need to reduce intensity today."
          : "Merki um góða endurheimt og stöðugt álagsþol. Engin þörf á að draga úr álagi í dag.",
      };

    case "YELLOW":
      return {
        label: "MODIFIED",
        title: isEN ? "Lighter day" : "Léttari dagur",
        pill: "bg-yellow-100 text-yellow-800 border-yellow-200",
        dot: "bg-yellow-500",
        panel: "border-yellow-200",

        playerMessage: isEN
          ? "You are yellow today. Train, but adjust the load. Keep intensity in check and avoid going to maximum effort."
          : "Í dag ert þú gulur. Æfðu, en aðlagaðu álag. Haltu ákefð í skefjum og forðastu að fara í hámarksálag.",

        why: isEN
          ? "Signs of mild fatigue or accumulated load. The goal is to maintain quality without adding unnecessary stress."
          : "Merki um væga þreytu eða álag. Markmiðið er að viðhalda gæðum án þess að bæta við óþarfa stressi.",
      };

    case "RED":
      return {
        label: "RECOVERY",
        title: isEN ? "Recovery day" : "Recovery dagur",
        pill: "bg-red-100 text-red-800 border-red-200",
        dot: "bg-red-500",
        panel: "border-red-200",

        playerMessage: isEN
          ? "You are red today. Recovery day. Stick to light movement and focus on sleep, nutrition, and hydration."
          : "Í dag ert þú rauður. Recovery dagur. Haltu þig við létta hreyfingu og settu fókus á svefn, næringu og vökvun.",

        why: isEN
          ? "Signs of reduced recovery capacity. Best to let the body recover today to be ready for upcoming sessions."
          : "Merki um skerta endurheimt. Best er að jafna sig í dag til að vera tilbúinn næstu daga.",
      };
  }
}
