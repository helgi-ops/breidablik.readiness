"use client";

/**
 * Team Indoor Briefing — single-card executive summary that mirrors the briefing
 * shown at the top of /coach/indoor-load on the main coach dashboard.
 *
 * Synthesizes per-player indoor status into:
 *   1. Team status sentence (traffic-light color)
 *   2. Action distribution (Full / Modify / Recovery counts)
 *   3. Top 3-6 concern players with action + reason
 *   4. Drill-in link to /coach/indoor-load
 *
 * Driven entirely by props — no extra data fetching. Re-uses the same
 * playerIndoorStatus map already populated by DevCoachDashboardClient.
 */

import * as React from "react";
import Link from "next/link";

type Action = "FULL" | "MODIFIED" | "RECOVERY" | "NO_DATA";

export type IndoorBriefingPlayer = {
  player_id: string;
  full_name: string;
  composite_score: number | null;
  composite_band: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  acwr_value: number | null;
  acwr_flag: "green" | "yellow" | "red" | null;
  mcburnie_flag: "green" | "yellow" | "red" | null;
  sessions_7d: number;
};

const ACTION_COLORS: Record<Action, string> = {
  FULL: "bg-emerald-500 text-white",
  MODIFIED: "bg-amber-500 text-white",
  RECOVERY: "bg-rose-500 text-white",
  NO_DATA: "bg-slate-300 text-slate-700",
};

const ACTION_LABELS: Record<Action, string> = {
  FULL: "Tilbúinn",
  MODIFIED: "Léttari æfing",
  RECOVERY: "Hvíld",
  NO_DATA: "Engin gögn",
};

const ACTION_ICONS: Record<Action, string> = {
  FULL: "✅",
  MODIFIED: "⚠️",
  RECOVERY: "🛑",
  NO_DATA: "❓",
};

function recommendAction(p: IndoorBriefingPlayer): Action {
  if (p.sessions_7d === 0 || (!p.composite_band && !p.acwr_flag && !p.mcburnie_flag)) {
    return "NO_DATA";
  }
  const compositeFlag: "green" | "yellow" | "red" | null =
    p.composite_band === "spike" ? "red"
      : p.composite_band === "heavy" || p.composite_band === "light" ? "yellow"
      : p.composite_band === "typical" || p.composite_band === "below_average" ? "green"
      : null;
  const flags = [compositeFlag, p.acwr_flag, p.mcburnie_flag].filter(
    (f): f is "green" | "yellow" | "red" => f != null,
  );
  if (flags.length === 0) return "NO_DATA";
  if (flags.includes("red")) return "RECOVERY";
  if (flags.some((f) => f === "yellow")) return "MODIFIED";
  return "FULL";
}

function buildReason(p: IndoorBriefingPlayer): string {
  const parts: string[] = [];
  if (p.composite_band === "spike") parts.push("æfði miklu meira en venjulega");
  else if (p.composite_band === "heavy") parts.push("þung session í gær");
  else if (p.composite_band === "light") parts.push("nær engin æfing");
  if (p.acwr_flag === "red" && p.acwr_value != null) {
    if (p.acwr_value > 1.5) parts.push(`acute spike (ACWR ${p.acwr_value.toFixed(2)})`);
    else if (p.acwr_value < 0.5) parts.push(`undirvinnsla (ACWR ${p.acwr_value.toFixed(2)})`);
  } else if (p.acwr_flag === "yellow" && p.acwr_value != null) {
    parts.push(`ACWR ${p.acwr_value.toFixed(2)}`);
  }
  if (p.mcburnie_flag === "red") parts.push("decel overload");
  else if (p.mcburnie_flag === "yellow") parts.push("decel caution");
  return parts.join(" + ") || "—";
}

export function TeamIndoorBriefing({ players }: { players: IndoorBriefingPlayer[] }) {
  // Skip rendering entirely when no player has indoor data
  const withIndoor = players.filter((p) => p.sessions_7d > 0);
  if (withIndoor.length === 0) return null;

  const actionsCount: Record<Action, number> = {
    FULL: 0,
    MODIFIED: 0,
    RECOVERY: 0,
    NO_DATA: 0,
  };
  const concernPlayers: Array<{ name: string; action: Action; reason: string }> = [];

  for (const p of withIndoor) {
    const action = recommendAction(p);
    actionsCount[action]++;
    if (action === "RECOVERY" || action === "MODIFIED") {
      concernPlayers.push({ name: p.full_name, action, reason: buildReason(p) });
    }
  }

  // Team-level synthesis — plain Icelandic
  let teamAction: Action = "FULL";
  let teamSentence = "Allir leikmenn tilbúnir í fullt prógram í dag";
  if (actionsCount.RECOVERY >= 3) {
    teamAction = "RECOVERY";
    teamSentence = `${actionsCount.RECOVERY} leikmenn þurfa hvíld — íhuga að lækka heildarintensity team-session`;
  } else if (actionsCount.RECOVERY >= 1) {
    teamAction = "MODIFIED";
    teamSentence = `${actionsCount.RECOVERY} leikmenn í hvíld og ${actionsCount.MODIFIED} þurfa léttari æfingu — flest liðið OK`;
  } else if (actionsCount.MODIFIED >= 5) {
    teamAction = "MODIFIED";
    teamSentence = `${actionsCount.MODIFIED} leikmenn þurfa léttari æfingu — íhuga lægra team-volume í dag`;
  } else if (actionsCount.MODIFIED >= 1) {
    teamSentence = `${actionsCount.FULL} leikmenn tilbúnir í fullt, ${actionsCount.MODIFIED} þurfa léttari æfingu`;
  }

  concernPlayers.sort((a, b) => {
    if (a.action !== b.action) return a.action === "RECOVERY" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const bannerBg =
    teamAction === "RECOVERY" ? "border-rose-300 bg-rose-50"
      : teamAction === "MODIFIED" ? "border-amber-300 bg-amber-50"
      : "border-emerald-300 bg-emerald-50";
  const dotBg =
    teamAction === "RECOVERY" ? "bg-rose-500"
      : teamAction === "MODIFIED" ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div className={`rounded-lg border p-4 ${bannerBg}`}>
      {/* Header banner */}
      <div className="flex flex-wrap items-start gap-3">
        <span className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${dotBg}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Indoor briefing — liðið í dag
          </div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{teamSentence}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
            ✅ {actionsCount.FULL} tilbúnir
          </span>
          <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
            ⚠️ {actionsCount.MODIFIED} léttari
          </span>
          <span className="rounded-md bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
            🛑 {actionsCount.RECOVERY} hvíld
          </span>
          {/* Prominent button to drill into full Indoor Load page */}
          <Link
            href="/coach/indoor-load"
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            title="Opna Indoor Load Intelligence síðuna með 14-day sparkline + team heatmap + per-day detail"
          >
            Opna full síðu
            <svg
              className="h-3 w-3"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L10.586 10 7.293 6.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>
      </div>

      {/* Top concerns — only render when there are players to flag */}
      {concernPlayers.length > 0 && (
        <div className="mt-3 border-t border-slate-200/60 pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Top concerns ({concernPlayers.length})
          </div>
          <ul className="space-y-1">
            {concernPlayers.slice(0, 6).map((c) => (
              <li
                key={c.name}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      c.action === "RECOVERY" ? "bg-rose-500" : "bg-amber-500"
                    }`}
                  />
                  <span className="truncate font-medium text-slate-900">{c.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">{c.reason}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-bold ${ACTION_COLORS[c.action]}`}
                  >
                    {ACTION_ICONS[c.action]} {ACTION_LABELS[c.action]}
                  </span>
                </div>
              </li>
            ))}
            {concernPlayers.length > 6 && (
              <li className="pt-0.5 text-[11px] text-slate-500">
                + {concernPlayers.length - 6} fleiri leikmenn — sjá{" "}
                <Link href="/coach/indoor-load" className="font-semibold underline hover:text-slate-700">
                  full indoor síðu
                </Link>
              </li>
            )}
          </ul>
          {/* Bottom drill-in link — encourages exploring trend + heatmap */}
          <div className="mt-3 border-t border-slate-200/60 pt-2 text-center">
            <Link
              href="/coach/indoor-load"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              📊 Skoða 14-day sparkline + team heatmap + per-day detail →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
