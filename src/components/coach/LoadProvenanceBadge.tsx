/**
 * LoadProvenanceBadge — a small muted marker shown next to a load number that is
 * NOT a plain device reading: estimated (pod-forgot fill), away (camp), or stale
 * (carried forward). Mirrors the readiness EstimatedMarker, but in a deliberately
 * MUTED SLATE style — never green/amber/red — because this is provenance, not a
 * verdict, and must never be mistaken for a readiness colour. `measured` renders
 * nothing (silence = measured).
 */

import * as React from "react";
import { loadProvenanceCopy, type LoadTier, type Lang } from "@/lib/micropulse/load/provenance";

const GLYPH: Record<Exclude<LoadTier, "measured">, string> = {
  estimated: "~",
  away: "✈",
  stale: "⏱",
};

export default function LoadProvenanceBadge({
  tier,
  lang = "EN",
  size = "sm",
  ctx,
}: {
  tier: LoadTier;
  lang?: Lang;
  size?: "sm" | "md";
  ctx?: { event?: string | null; ageDays?: number | null; estimatedDays?: number; awayDays?: number; totalDays?: number };
}) {
  if (tier === "measured") return null;
  const { label, tip } = loadProvenanceCopy(tier, lang, ctx);
  const pad = size === "md" ? "px-1.5 py-0.5 text-[11px]" : "px-1 py-0.5 text-[10px]";
  return (
    <span
      title={tip}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border border-dashed border-slate-300 bg-slate-50 font-medium text-slate-600 ${pad}`}
    >
      {GLYPH[tier]} {label}
    </span>
  );
}
