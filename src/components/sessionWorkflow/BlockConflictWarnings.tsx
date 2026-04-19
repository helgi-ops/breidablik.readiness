"use client";

import React, { useState } from "react";
import type {
  BlockConflictResult,
  TeamBlockConflictSummary,
  PlayerBlockConflict,
  BlockConflictAction,
} from "@/lib/micropulse/sessionWorkflow";

// ── Action colors & icons ───────────────────────────────────────────

const ACTION_STYLE: Record<BlockConflictAction, { bg: string; text: string; icon: string }> = {
  skip:            { bg: "bg-red-100",    text: "text-red-800",    icon: "⛔" },
  reduce_half:     { bg: "bg-amber-100",  text: "text-amber-800",  icon: "½" },
  reduce_volume:   { bg: "bg-amber-50",   text: "text-amber-700",  icon: "↓" },
  reduce_contact:  { bg: "bg-orange-100", text: "text-orange-800", icon: "🛡" },
  lower_intensity: { bg: "bg-yellow-50",  text: "text-yellow-800", icon: "⬇" },
};

const ACTION_LABEL_IS: Record<BlockConflictAction, string> = {
  skip: "Sleppa",
  reduce_half: "Helmingur",
  reduce_volume: "Minnka",
  reduce_contact: "Minni snerting",
  lower_intensity: "Lægra álag",
};

const FLAG_DOT: Record<string, string> = {
  RED: "bg-red-500",
  YELLOW: "bg-amber-400",
  GREEN: "bg-emerald-500",
  GRAY: "bg-gray-400",
};

// ── Per-block badge (inline in editor) ──────────────────────────────

export function BlockConflictBadge({ result }: { result: BlockConflictResult }) {
  const [open, setOpen] = useState(false);

  if (result.conflicts.length === 0) return null;

  const badgeBg = result.severity === "danger" ? "bg-red-100 border-red-300" : "bg-amber-50 border-amber-200";
  const badgeText = result.severity === "danger" ? "text-red-700" : "text-amber-700";

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium ${badgeBg} ${badgeText} transition-colors hover:opacity-80`}
      >
        <span>⚠</span>
        <span>
          {result.skipCount > 0 && `${result.skipCount} sleppa`}
          {result.skipCount > 0 && result.reduceCount > 0 && " · "}
          {result.reduceCount > 0 && `${result.reduceCount} minnka`}
        </span>
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          {result.conflicts.map((c, idx) => (
            <PlayerConflictRow key={`${c.playerId}-${idx}`} conflict={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerConflictRow({ conflict }: { conflict: PlayerBlockConflict }) {
  const style = ACTION_STYLE[conflict.action];
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={`inline-block h-2 w-2 rounded-full ${FLAG_DOT[conflict.flag] ?? "bg-gray-400"}`} />
      <span className="font-medium text-gray-900 min-w-[90px]">{conflict.playerName}</span>
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${style.bg} ${style.text}`}>
        {style.icon} {ACTION_LABEL_IS[conflict.action]}
      </span>
      <span className="text-gray-500 truncate">{conflict.reasonIs}</span>
    </div>
  );
}

// ── Team conflict summary panel (for approval) ─────────────────────

export function TeamConflictSummaryPanel({ summary }: { summary: TeamBlockConflictSummary }) {
  const [expanded, setExpanded] = useState(false);

  if (summary.totalConflicts === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
        <div className="flex items-center gap-2">
          <span>✓</span>
          <span className="font-semibold">Engir árekstrar milli leikmannatakmarkana og drilla</span>
        </div>
      </div>
    );
  }

  const borderColor = summary.hasCriticalConflict ? "border-red-300" : "border-amber-200";
  const bgColor = summary.hasCriticalConflict ? "bg-red-50" : "bg-amber-50";
  const textColor = summary.hasCriticalConflict ? "text-red-800" : "text-amber-800";
  const headerIcon = summary.hasCriticalConflict ? "🚨" : "⚠";

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-3 text-xs ${textColor}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <span>{headerIcon}</span>
          <div>
            <span className="font-semibold">
              {summary.totalConflicts} {summary.totalConflicts === 1 ? "árekstri" : "árekstrar"} í {summary.blocksWithConflicts}{" "}
              {summary.blocksWithConflicts === 1 ? "blokk" : "blokkum"}
            </span>
            <span className="ml-2 font-normal opacity-80">
              — {summary.totalPlayersAffected} {summary.totalPlayersAffected === 1 ? "leikmaður" : "leikmenn"} með takmarkanir
            </span>
          </div>
        </div>
        <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {summary.blocks
            .filter((b) => b.conflicts.length > 0)
            .map((block) => (
              <div key={block.blockId} className="rounded-lg border border-gray-200 bg-white p-2">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{block.blockTitle}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{block.blockType}</span>
                  </div>
                  {block.exposureTags.length > 0 && (
                    <div className="flex gap-1">
                      {block.exposureTags.map((tag) => (
                        <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  {block.conflicts.map((c, idx) => (
                    <PlayerConflictRow key={`${c.playerId}-${idx}`} conflict={c} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {summary.hasCriticalConflict && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-300 bg-red-100 p-2 text-red-900">
          <span>🚨</span>
          <span className="font-semibold">Rauðir leikmenn með háálags-blokkir — athugar þarf áður en samþykkt</span>
        </div>
      )}
    </div>
  );
}
