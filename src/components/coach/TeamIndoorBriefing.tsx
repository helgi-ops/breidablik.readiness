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
import { useLang, type Lang } from "@/lib/lang";

type Action =
  | "FULL"
  | "MODIFIED"
  | "RECOVERY"
  | "NO_DATA"
  | "INJURED"
  | "REHAB"
  | "RTP"
  | "ILL"
  | "RECOVERING_ILL";

export type IndoorBriefingPlayer = {
  player_id: string;
  full_name: string;
  composite_score: number | null;
  composite_band: "light" | "below_average" | "typical" | "heavy" | "spike" | null;
  acwr_value: number | null;
  acwr_flag: "green" | "yellow" | "red" | null;
  mcburnie_flag: "green" | "yellow" | "red" | null;
  sessions_7d: number;
  // Injury / illness fields — override load-based action when set
  injury_status?: "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;
  injury_body_part?: string | null;
  injury_rtp_stage?: number | null;
  injury_estimated_return?: string | null;
};

function isIllnessRecord(bodyPart: string | null | undefined): boolean {
  if (!bodyPart) return false;
  const bp = bodyPart.toLowerCase();
  return bp.includes("illness") || bp.includes("sjúk") || bp.includes("veik") || bp.includes("flu") || bp.includes("cold");
}

const ACTION_COLORS: Record<Action, string> = {
  FULL: "bg-emerald-500 text-white",
  MODIFIED: "bg-amber-500 text-white",
  RECOVERY: "bg-rose-500 text-white",
  NO_DATA: "bg-slate-300 text-slate-700",
  INJURED: "bg-violet-600 text-white",
  REHAB: "bg-violet-600 text-white",
  RTP: "bg-violet-500 text-white",
  ILL: "bg-teal-600 text-white",
  RECOVERING_ILL: "bg-teal-500 text-white",
};

const ACTION_LABELS_BILINGUAL: Record<Action, { EN: string; IS: string }> = {
  FULL: { EN: "Ready", IS: "Tilbúinn" },
  MODIFIED: { EN: "Lighter session", IS: "Léttari æfing" },
  // Renamed from "Rest" — that wording read as a prescription and conflicted
  // with Decision Summary's overall verdict. This badge signals INDOOR LOAD
  // was heavy / acute, not that the player must rest. Decision Summary owns
  // the actual training-or-not call.
  RECOVERY: { EN: "Heavy load", IS: "Mikið álag" },
  NO_DATA: { EN: "No data", IS: "Engin gögn" },
  INJURED: { EN: "Out — injury", IS: "Frá æfingu — meiðsl" },
  REHAB: { EN: "Rehab", IS: "Endurhæfing" },
  RTP: { EN: "Return-to-play", IS: "Return-to-play" },
  ILL: { EN: "Sick", IS: "Veikur" },
  RECOVERING_ILL: { EN: "Recovering", IS: "Að jafna sig" },
};

function actionLabel(action: Action, lang: Lang): string {
  return lang === "IS" ? ACTION_LABELS_BILINGUAL[action].IS : ACTION_LABELS_BILINGUAL[action].EN;
}

const I18N = {
  briefingTitle: { EN: "Indoor briefing — team today", IS: "Indoor briefing — liðið í dag" },
  fullSyfa: { EN: "Open full page", IS: "Opna full síðu" },
  topConcerns: { EN: "Top concerns", IS: "Top concerns" },
  morePlayers: { EN: "more players — see", IS: "fleiri leikmenn — sjá" },
  fullIndoorPage: { EN: "full indoor page", IS: "full indoor síðu" },
  see14d: {
    EN: "📊 View 14-day sparkline + team heatmap + per-day detail →",
    IS: "📊 Skoða 14-day sparkline + team heatmap + per-day detail →",
  },
  ready: { EN: "ready", IS: "tilbúnir" },
  lighter: { EN: "lighter", IS: "léttari" },
  rest: { EN: "rest", IS: "hvíld" },
  injured: { EN: "injured", IS: "meiddir" },
  sick: { EN: "sick", IS: "veikir" },
  // Sentence parts
  allReady: { EN: "All players ready for full program today", IS: "Allir leikmenn tilbúnir í fullt prógram í dag" },
  // "with heavy load" reads as informational, not as a coach prescription.
  // The actual rest-or-train call lives in Decision Summary.
  needsRest: { EN: "with heavy load", IS: "með mikið álag" },
  needsLighter: { EN: "need a lighter session", IS: "þurfa léttari æfingu" },
  inMeidsl: { EN: "in injury/RTP", IS: "í meiðslum/RTP" },
  inSick: { EN: "sick", IS: "veikir" },
  considerLowerIntensity: {
    EN: "consider lowering team intensity",
    IS: "íhuga að lækka heildarintensity team-session",
  },
  watchOut: { EN: "watch them today", IS: "passa þeim í dag" },
} as const;
function tt(key: keyof typeof I18N, lang: Lang): string {
  return lang === "IS" ? I18N[key].IS : I18N[key].EN;
}

const ACTION_ICONS: Record<Action, string> = {
  FULL: "✅",
  MODIFIED: "⚠️",
  RECOVERY: "🛑",
  NO_DATA: "❓",
  INJURED: "🚫",
  REHAB: "🏥",
  RTP: "🩹",
  ILL: "🤒",
  RECOVERING_ILL: "🫧",
};

function injuryStatusToAction(
  status: string | null | undefined,
  bodyPart: string | null | undefined,
): Action | null {
  if (!status || status === "cleared") return null;
  // Illness override — body_part='Illness' (or sjúk/veik/flu/cold) takes precedence
  if (isIllnessRecord(bodyPart)) {
    return status === "injured" ? "ILL" : "RECOVERING_ILL";
  }
  if (status === "injured") return "INJURED";
  if (status === "rehabilitation") return "REHAB";
  if (status === "rtp_training") return "RTP";
  return null;
}

function recommendAction(p: IndoorBriefingPlayer): Action {
  // Injury / illness override — takes precedence over load-based verdict
  const injuryAction = injuryStatusToAction(p.injury_status, p.injury_body_part);
  if (injuryAction) return injuryAction;

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

function buildReason(p: IndoorBriefingPlayer, lang: Lang): string {
  const en = lang === "EN";
  if (isIllnessRecord(p.injury_body_part)) {
    if (p.injury_status === "injured") return en ? "Sick — no training" : "Veikindi — engin æfing";
    return en ? "Recovering from illness" : "Á batavegi eftir veikindi";
  }
  if (p.injury_status === "injured") {
    return p.injury_body_part
      ? `${p.injury_body_part} ${en ? "(acute injury)" : "(acute meiðsl)"}`
      : en ? "Acute injury — no training" : "Acute meiðsl — engin æfing";
  }
  if (p.injury_status === "rehabilitation") {
    return p.injury_body_part
      ? `${p.injury_body_part} — ${en ? "rehab with physio" : "endurhæfing hjá sjúkraþjálfara"}`
      : en ? "Rehab with physio" : "Endurhæfing hjá sjúkraþjálfara";
  }
  if (p.injury_status === "rtp_training") {
    const stage = p.injury_rtp_stage != null ? ` (stage ${p.injury_rtp_stage}/5)` : "";
    return p.injury_body_part
      ? `${p.injury_body_part} — return-to-play${stage}`
      : `Return-to-play${stage}`;
  }
  const parts: string[] = [];
  if (p.composite_band === "spike") parts.push(en ? "trained much harder than usual" : "æfði miklu meira en venjulega");
  else if (p.composite_band === "heavy") parts.push(en ? "heavy session yesterday" : "þung session í gær");
  else if (p.composite_band === "light") parts.push(en ? "almost no training" : "nær engin æfing");
  if (p.acwr_flag === "red" && p.acwr_value != null) {
    if (p.acwr_value > 1.5) parts.push(`${en ? "acute spike" : "acute spike"} (ACWR ${p.acwr_value.toFixed(2)})`);
    else if (p.acwr_value < 0.5) parts.push(`${en ? "undertraining" : "undirvinnsla"} (ACWR ${p.acwr_value.toFixed(2)})`);
  } else if (p.acwr_flag === "yellow" && p.acwr_value != null) {
    parts.push(`ACWR ${p.acwr_value.toFixed(2)}`);
  }
  if (p.mcburnie_flag === "red") parts.push(en ? "decel overload" : "decel overload");
  else if (p.mcburnie_flag === "yellow") parts.push(en ? "decel caution" : "decel caution");
  return parts.join(" + ") || "—";
}

export function TeamIndoorBriefing({ players }: { players: IndoorBriefingPlayer[] }) {
  const [lang] = useLang();
  // Include players with indoor data OR active injury/illness (so injured + sick
  // players surface even when they have no recent indoor session).
  const relevant = players.filter(
    (p) =>
      p.sessions_7d > 0 ||
      (p.injury_status && p.injury_status !== "cleared"),
  );
  if (relevant.length === 0) return null;

  const actionsCount: Record<Action, number> = {
    FULL: 0,
    MODIFIED: 0,
    RECOVERY: 0,
    NO_DATA: 0,
    INJURED: 0,
    REHAB: 0,
    RTP: 0,
    ILL: 0,
    RECOVERING_ILL: 0,
  };
  const concernPlayers: Array<{ name: string; action: Action; reason: string }> = [];

  for (const p of relevant) {
    const action = recommendAction(p);
    actionsCount[action]++;
    // Surface in concerns: any RECOVERY/MODIFIED/injury action
    if (action !== "FULL" && action !== "NO_DATA") {
      concernPlayers.push({ name: p.full_name, action, reason: buildReason(p, lang) });
    }
  }

  const totalInjured = actionsCount.INJURED + actionsCount.REHAB + actionsCount.RTP;
  const totalIll = actionsCount.ILL + actionsCount.RECOVERING_ILL;

  // Team-level synthesis — bilingual EN/IS, injury+illness aware
  let teamAction: Action = "FULL";
  let teamSentence = tt("allReady", lang);
  const sentenceParts: string[] = [];
  if (totalIll > 0) {
    sentenceParts.push(
      lang === "EN"
        ? `${totalIll} ${totalIll === 1 ? "sick" : "sick"}`
        : `${totalIll} ${totalIll === 1 ? "veikur" : "veikir"}`,
    );
    teamAction = "MODIFIED";
  }
  if (totalInjured > 0) {
    sentenceParts.push(`${totalInjured} ${tt("inMeidsl", lang)}`);
    teamAction = "MODIFIED";
  }
  if (actionsCount.RECOVERY >= 1) {
    sentenceParts.push(`${actionsCount.RECOVERY} ${tt("needsRest", lang)}`);
    teamAction = "RECOVERY";
  }
  if (actionsCount.MODIFIED >= 1) {
    sentenceParts.push(`${actionsCount.MODIFIED} ${tt("needsLighter", lang)}`);
    if (teamAction === "FULL") teamAction = "MODIFIED";
  }
  if (sentenceParts.length > 0) {
    const fullCountWord = lang === "EN" ? "ready" : "tilbúnir";
    teamSentence = `${actionsCount.FULL} ${fullCountWord}, ${sentenceParts.join(", ")}`;
  }

  // Sort concerns: illness first (contagion + cardio risk), then injuries, then load
  const actionOrder: Record<Action, number> = {
    ILL: 0,
    RECOVERING_ILL: 1,
    INJURED: 2,
    REHAB: 3,
    RTP: 4,
    RECOVERY: 5,
    MODIFIED: 6,
    FULL: 7,
    NO_DATA: 8,
  };
  concernPlayers.sort((a, b) => {
    const ao = actionOrder[a.action];
    const bo = actionOrder[b.action];
    if (ao !== bo) return ao - bo;
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
            {tt("briefingTitle", lang)}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900">{teamSentence}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
            ✅ {actionsCount.FULL} {tt("ready", lang)}
          </span>
          <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
            ⚠️ {actionsCount.MODIFIED} {tt("lighter", lang)}
          </span>
          <span className="rounded-md bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">
            🛑 {actionsCount.RECOVERY} {tt("rest", lang)}
          </span>
          {totalInjured > 0 && (
            <span className="rounded-md bg-violet-100 px-2 py-0.5 font-semibold text-violet-700">
              🏥 {totalInjured} {tt("injured", lang)}
            </span>
          )}
          {totalIll > 0 && (
            <span className="rounded-md bg-teal-100 px-2 py-0.5 font-semibold text-teal-700">
              🤒 {totalIll} {tt("sick", lang)}
            </span>
          )}
          {/* Prominent button to drill into full Indoor Load page */}
          <Link
            href="/coach/indoor-load"
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            title="Open the Indoor Load Intelligence page with 14-day sparkline + team heatmap + per-day detail"
          >
            {tt("fullSyfa", lang)}
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
            {tt("topConcerns", lang)} ({concernPlayers.length})
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
                    {ACTION_ICONS[c.action]} {actionLabel(c.action, lang)}
                  </span>
                </div>
              </li>
            ))}
            {concernPlayers.length > 6 && (
              <li className="pt-0.5 text-[11px] text-slate-500">
                + {concernPlayers.length - 6} {tt("morePlayers", lang)}{" "}
                <Link href="/coach/indoor-load" className="font-semibold underline hover:text-slate-700">
                  {tt("fullIndoorPage", lang)}
                </Link>
              </li>
            )}
          </ul>
          <div className="mt-3 border-t border-slate-200/60 pt-2 text-center">
            <Link
              href="/coach/indoor-load"
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              {tt("see14d", lang)}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
