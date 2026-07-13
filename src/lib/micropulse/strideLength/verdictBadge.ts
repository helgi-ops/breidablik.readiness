/**
 * strideLength/verdictBadge — the ONE place the stride verdict's short label,
 * tone and dot colour are decided, so every surface (player recap, post-match
 * game report, coach Stride Intelligence, the match-day team view) reads the
 * same word for the same verdict. Pure; mirrors the `matchVerdictBadge` pattern.
 *
 * The engine only flags at 2.5 SD, so a `shortened` verdict is already a real,
 * meaningful drop — it earns the red (clay) tone, not amber.
 */

import type { StrideVerdict } from "@/lib/micropulse/strideLength";

export type StrideTone = "bad" | "good" | "info" | "muted";

export interface StrideBadge {
  tone: StrideTone;
  /** Traffic-light dot / accent hex (design tokens). */
  dot: string;
  /** Short verdict label in the requested language (layer-0 headline). */
  label: string;
  /** True for the verdicts a coach should actually look at. */
  flagged: boolean;
}

const DOT: Record<StrideTone, string> = {
  bad: "#a83e28", // clay / red
  good: "#1c7a4a", // grass / green
  info: "#2740e6", // cobalt
  muted: "#8a8a82", // muted ink
};

export function strideVerdictBadge(
  v: { verdict: StrideVerdict; deltaPct: number | null },
  lang: "IS" | "EN",
): StrideBadge {
  const is = lang === "IS";
  const d = v.deltaPct != null ? Math.abs(Math.round(v.deltaPct * 10) / 10) : null;

  switch (v.verdict) {
    case "shortened":
      return {
        tone: "bad",
        dot: DOT.bad,
        flagged: true,
        label: is
          ? d != null ? `${d}% styttri skref` : "Styttri skref en venjulega"
          : d != null ? `${d}% shorter strides` : "Shorter strides than usual",
      };
    case "lengthened":
      return {
        tone: "info",
        dot: DOT.info,
        flagged: false,
        label: is
          ? d != null ? `${d}% lengri skref` : "Lengri skref en venjulega"
          : d != null ? `${d}% longer strides` : "Longer strides than usual",
      };
    case "normal":
      return {
        tone: "good",
        dot: DOT.good,
        flagged: false,
        label: is ? "Eðlileg skreflengd" : "Normal stride length",
      };
    default: // unmeasurable
      return {
        tone: "muted",
        dot: DOT.muted,
        flagged: false,
        label: is ? "Ekki mælanlegt í dag" : "Not measurable today",
      };
  }
}
