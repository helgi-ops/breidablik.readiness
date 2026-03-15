"use client";

import React from "react";
import type { TeamWorkflowSummary as TeamWorkflowSummaryType } from "@/lib/micropulse/sessionWorkflow";

type Props = {
  summary: TeamWorkflowSummaryType;
};

export default function TeamWorkflowSummary({ summary }: Props) {
  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Team Workflow Summary</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        <div className="rounded border bg-gray-50 p-2">Generated: <span className="font-semibold">{summary.generatedCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Saved: <span className="font-semibold">{summary.savedCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">In review: <span className="font-semibold">{summary.inReviewCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Approved: <span className="font-semibold">{summary.approvedCount}</span></div>
        <div className="rounded border bg-gray-50 p-2">Published: <span className="font-semibold">{summary.publishedCount}</span></div>
      </div>
      <div className="mt-2">{summary.summaryText}</div>
      {!!summary.reviewNeededPlayers.length && (
        <div className="mt-1 text-[11px] text-gray-600">Review needed: {summary.reviewNeededPlayers.map((p) => p.playerName || p.playerId || "Unknown").join(", ")}</div>
      )}
      {!!summary.unpublishedApprovedPlayers.length && (
        <div className="mt-1 text-[11px] text-gray-600">Approved not published: {summary.unpublishedApprovedPlayers.map((p) => p.playerName || p.playerId || "Unknown").join(", ")}</div>
      )}
    </div>
  );
}
