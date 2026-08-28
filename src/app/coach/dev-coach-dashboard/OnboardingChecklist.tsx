"use client";

/**
 * OnboardingChecklist
 *
 * Shows a dismissable setup guide at the top of the Today tab when a new club
 * hasn't completed the key onboarding steps. Completion is detected from live
 * data — no extra schema changes needed. Dismissal is stored in localStorage
 * so it doesn't reappear once the coach closes it.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/lang";

// ── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    heading:     "Uppsetning MicroPulse",
    allDone:     "🎉 Allt tilbúið — MicroPulse er virkt fyrir liðið þitt!",
    progress:    (done: number, total: number) => `${done} af ${total} skrefum lokið`,
    closeAll:    "Loka",
    closeTmp:    "Loka tímabundið",
    help:        "Þarftu aðstoð? Bókaðu demo eða hafðu samband við support.",
    steps: {
      team: {
        label: "Klúbbur stofnaður",
        desc:  "MicroPulse reikningur virkt og liðsupplýsingar stilltar.",
      },
      sport: {
        label: "Íþrótt stillt",
        descDone: "Kerfið veit hvaða íþrótt liðið stundast og stilling GPS flipans er rétt.",
        descTodo: "Stilltu íþrótt liðsins í stillingunum svo GPS flipinn sýni réttar mælingar.",
        action: "Fara í stillingar",
      },
      players: {
        label:    (n: number) => `Leikmenn bætt við (${n})`,
        descDone: (n: number) => `${n} leikm${n === 1 ? "aður" : "enn"} skráð${n === 1 ? "ur" : "ir"} á hópinn.`,
        descTodo: "Bættu leikmönnum við áður en kerfið getur skannar. Mælt er með að bæta öllum við í einu.",
        action:   "Fara á leikmannasíðu",
      },
      checkin: {
        label:    "Fyrsta check-in skráð",
        descDone: "Leikmenn eru að skrá inn — kerfið getur byrjað að greina.",
        descTodo: "Leikmenn þurfa að skrá inn í fyrsta sinn til að Z-scores og STEN gildi séu reiknuð.",
      },
      decision: {
        label:    "Fyrsta ákvörðun staðfest",
        descDone: "Þjálfari hefur staðfest FULL / REDUCED / RECOVERY fyrir leikmann.",
        descTodo: "Staðfestu dagsákvörðun fyrir hóp til að byrja á daglegum rekstri.",
      },
      gps: {
        label:    "GPS tengt",
        descDone: "GPS gögn eru komin inn — ACWR og álagsgreining er virk.",
        descTodo: "Samstilltu æfingu til að fá GPS mælingar, ACWR og álagsgreining. Ýttu á 'Samstilla æfingu' hnappinn.",
      },
    },
  },
  EN: {
    heading:     "MicroPulse Setup",
    allDone:     "🎉 All set — MicroPulse is active for your team!",
    progress:    (done: number, total: number) => `${done} of ${total} steps complete`,
    closeAll:    "Close",
    closeTmp:    "Dismiss for now",
    help:        "Need help? Book a demo or contact support.",
    steps: {
      team: {
        label: "Club created",
        desc:  "MicroPulse account active and team details configured.",
      },
      sport: {
        label:    "Sport configured",
        descDone: "The system knows your sport and the GPS tab shows the correct metrics.",
        descTodo: "Set your team's sport in settings so the GPS tab shows the right metrics.",
        action:   "Go to settings",
      },
      players: {
        label:    (n: number) => `Players added (${n})`,
        descDone: (n: number) => `${n} player${n === 1 ? "" : "s"} registered on the squad.`,
        descTodo: "Add players before the system can scan. We recommend adding everyone at once.",
        action:   "Go to players",
      },
      checkin: {
        label:    "First check-in recorded",
        descDone: "Players are checking in — the system can start analysing.",
        descTodo: "Players need to check in for the first time before Z-scores and STEN values are calculated.",
      },
      decision: {
        label:    "First decision confirmed",
        descDone: "Coach has confirmed FULL / REDUCED / RECOVERY for a player.",
        descTodo: "Confirm a daily decision for the squad to start daily operations.",
      },
      gps: {
        label:    "GPS connected",
        descDone: "GPS data is loaded — ACWR and load analysis is active.",
        descTodo: "Sync the training session to get GPS metrics, ACWR, and load analysis. Press the 'Sync Training Session' button.",
      },
    },
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  actionLabel?: string;
  actionHref?: string;
};

type Props = {
  teamId: string | null;
  lang: Lang;
  /** Players currently on the squad */
  playerCount: number;
  /** Whether any player has a readiness check-in today */
  hasCheckIn: boolean;
  /** Whether Catapult GPS data has ever been loaded */
  hasGpsData: boolean;
  /** Whether any coach decision has been saved */
  hasDecision: boolean;
  /** Whether the sport is set on the team */
  hasSport: boolean;
};

// ── Storage key ───────────────────────────────────────────────────────────────

function storageKey(teamId: string) {
  return `micropulse_onboarding_dismissed_${teamId}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingChecklist({
  teamId,
  lang,
  playerCount,
  hasCheckIn,
  hasGpsData,
  hasDecision,
  hasSport,
}: Props) {
  const ct = COPY[lang];

  const [dismissed, setDismissed] = useState(true); // start hidden, check localStorage
  const [mounted, setMounted]     = useState(false);

  useEffect(() => {
    if (!teamId) return;
    const val = localStorage.getItem(storageKey(teamId));
    setDismissed(val === "1");
    setMounted(true);
  }, [teamId]);

  const steps: Step[] = [
    {
      id:    "team",
      label: ct.steps.team.label,
      description: ct.steps.team.desc,
      done:  true,
    },
    {
      id:          "sport",
      label:       ct.steps.sport.label,
      description: hasSport ? ct.steps.sport.descDone : ct.steps.sport.descTodo,
      done:        hasSport,
      actionLabel: ct.steps.sport.action,
      actionHref:  "/coach/settings",
    },
    {
      id:          "players",
      label:       ct.steps.players.label(playerCount),
      description: playerCount >= 1
        ? ct.steps.players.descDone(playerCount)
        : ct.steps.players.descTodo,
      done:        playerCount >= 1,
      actionLabel: ct.steps.players.action,
      actionHref:  "/coach/players",
    },
    {
      id:          "checkin",
      label:       ct.steps.checkin.label,
      description: hasCheckIn ? ct.steps.checkin.descDone : ct.steps.checkin.descTodo,
      done:        hasCheckIn,
    },
    {
      id:          "decision",
      label:       ct.steps.decision.label,
      description: hasDecision ? ct.steps.decision.descDone : ct.steps.decision.descTodo,
      done:        hasDecision,
    },
    {
      id:          "gps",
      label:       ct.steps.gps.label,
      description: hasGpsData ? ct.steps.gps.descDone : ct.steps.gps.descTodo,
      done:        hasGpsData,
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone   = doneCount === steps.length;

  function dismiss() {
    if (teamId) localStorage.setItem(storageKey(teamId), "1");
    setDismissed(true);
  }

  // Don't render until we've checked localStorage (avoids flash)
  if (!mounted || dismissed) return null;

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-700">
            {ct.heading}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {allDone ? ct.allDone : ct.progress(doneCount, steps.length)}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors"
        >
          {allDone ? ct.closeAll : ct.closeTmp}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-indigo-100">
        <div
          className="h-1.5 rounded-full bg-indigo-500 transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="mt-4 space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-start gap-3 rounded-xl px-4 py-3 ${
              step.done ? "bg-white/60" : "bg-white border border-indigo-100"
            }`}
          >
            {/* Checkmark / circle */}
            <div
              className={`mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${
                step.done
                  ? "bg-emerald-500 text-white"
                  : "border-2 border-indigo-300 text-indigo-300"
              }`}
            >
              {step.done ? "✓" : ""}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${step.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                {step.label}
              </div>
              {!step.done && (
                <div className="mt-0.5 text-xs text-slate-500">{step.description}</div>
              )}
            </div>

            {/* Action link */}
            {!step.done && step.actionHref && (
              <Link
                href={step.actionHref}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {step.actionLabel}
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Help footer */}
      {!allDone && (
        <p className="mt-3 text-[11px] text-slate-400">{ct.help}</p>
      )}
    </div>
  );
}
