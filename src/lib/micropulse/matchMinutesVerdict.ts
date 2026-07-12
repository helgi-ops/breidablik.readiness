/**
 * Presentation mapping for a MatchLoadVerdict — one source so every surface
 * (the MD+1 minutes page, game report, match movement, player cards) labels a
 * contaminated match row the same way. Rules decide (classifyMatchLoad); this
 * only chooses how to SAY the verdict, in both languages.
 *
 * Layer-1 of the explainability read: the chip is the ~5s glance, `reason` is
 * the plain "why" that must be visible without opening a drill-down.
 */
import type { MatchLoadVerdict } from "./matchMinutes";

export type VerdictTone = "ok" | "warn" | "bad" | "muted";

export interface VerdictBadge {
  tone: VerdictTone;
  /** Short chip label. */
  label: string;
  /** Plain-language "why", already language-selected. */
  reason: string;
  /**
   * TRUE when this row's numbers should NOT be read as match running — the
   * caller should show the reason inline, not just on hover.
   */
  flagged: boolean;
}

const LABELS: Record<
  "ok" | "unknown" | "unused" | "contaminated" | "impossible",
  { en: string; is: string; tone: VerdictTone }
> = {
  ok:           { en: "Match verified",     is: "Leikur staðfestur",  tone: "ok" },
  unknown:      { en: "Enter minutes",      is: "Skráðu mínútur",     tone: "muted" },
  unused:       { en: "Unused · warm-up",   is: "Ónotað · upphitun",  tone: "muted" },
  contaminated: { en: "Warm-up in numbers", is: "Upphitun í tölum",   tone: "warn" },
  impossible:   { en: "Check — impossible", is: "Athuga — ómögulegt", tone: "bad" },
};

/** Map a verdict to a chip + plain reason for the given language. */
export function matchVerdictBadge(verdict: MatchLoadVerdict, lang: "IS" | "EN"): VerdictBadge {
  const reason = lang === "IS" ? verdict.reasonIs : verdict.reason;

  // Impossible arithmetic dominates any context — the minutes or GPS are wrong.
  const key = verdict.implausible
    ? "impossible"
    : verdict.context === "unknown"
    ? "unknown"
    : verdict.context === "unused"
    ? "unused"
    : verdict.context === "bench_contaminated"
    ? "contaminated"
    : "ok";

  const l = LABELS[key];
  return {
    tone: l.tone,
    label: lang === "IS" ? l.is : l.en,
    reason,
    // A clean, usable match row needs no inline "why"; everything else does.
    flagged: !verdict.usableAsMatchBenchmark,
  };
}
