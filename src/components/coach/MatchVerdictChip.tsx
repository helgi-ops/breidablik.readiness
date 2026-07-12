"use client";

/**
 * One chip for the matchday-load-vs-match-running verdict, used wherever match
 * GPS is shown. Keeps every surface visually consistent and — per the
 * explainability manifesto — shows the plain "why" inline for a flagged row
 * (layer 1: no drill-down needed to learn a number is contaminated).
 */
import type { MatchLoadVerdict } from "@/lib/micropulse/matchMinutes";
import { matchVerdictBadge, type VerdictTone } from "@/lib/micropulse/matchMinutesVerdict";

const TONE: Record<VerdictTone, string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-700",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  bad: "border-red-300 bg-red-50 text-red-700",
  muted: "border-zinc-300 bg-zinc-50 text-zinc-600",
};

export default function MatchVerdictChip({
  verdict,
  lang,
  showReason = "flagged",
  className = "",
}: {
  verdict: MatchLoadVerdict;
  lang: "IS" | "EN";
  /** Show the plain reason: always, never, or only when the row is flagged. */
  showReason?: "always" | "never" | "flagged";
  className?: string;
}) {
  const b = matchVerdictBadge(verdict, lang);
  const reasonVisible = showReason === "always" || (showReason === "flagged" && b.flagged);

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[b.tone]}`}
        title={b.reason}
      >
        {b.label}
      </span>
      {reasonVisible && (
        <span className="max-w-xs text-[11px] leading-snug text-muted-foreground">{b.reason}</span>
      )}
    </span>
  );
}
