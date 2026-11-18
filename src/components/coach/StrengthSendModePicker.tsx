"use client";

/**
 * The three strength send modes (2026-11-17), on the coach's strength send page:
 *   Standard (Custom Programme) · Individualised (data + screen) · Individualised + goals.
 *
 * The mode chosen here is used for this send; "Set as team default" saves it as the team's mode
 * (`teams.strength_send_mode`), which is also what auto-send uses and the ONE switch for player choices: on
 * "Individualised + goals" every player can choose a goal and exercises unless the coach takes them out (Goal
 * requests page). Rules: `src/lib/micropulse/strengthProgramming/sendMode.ts`.
 */

import Link from "next/link";
import { SEND_MODES, SEND_MODE_TEXT, type SendMode } from "@/lib/micropulse/strengthProgramming/sendMode";
import StrengthSendStatus from "./StrengthSendStatus";

export default function StrengthSendModePicker({
  lang,
  mode,
  teamMode,
  onMode,
  onSaveDefault,
  saving,
  saved,
}: {
  lang: "IS" | "EN";
  /** The mode chosen for this send. */
  mode: SendMode;
  /** The team's saved mode (null = not loaded yet). */
  teamMode: SendMode | null;
  onMode: (m: SendMode) => void;
  onSaveDefault: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const is = lang === "IS";
  const t = (en: string, isText: string) => (is ? isText : en);
  const L = (b: { en: string; is: string }) => (is ? b.is : b.en);
  const goalsSaved = teamMode === "individualised_goals";

  return (
    <>
      <span className="text-sm font-semibold text-slate-800">{t("Session mode:", "Æfingahamur:")}</span>
      {/* Phone: one mode per row, full width; wider: one segmented row. */}
      <div className="flex w-full flex-col overflow-hidden rounded-lg border border-slate-300 shadow-sm sm:inline-flex sm:w-auto sm:flex-row" role="group" aria-label={t("Session mode", "Æfingahamur")}>
        {SEND_MODES.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            aria-pressed={mode === m}
            data-testid={`send-mode-${m}`}
            className={`px-3 py-2 text-left text-sm font-semibold transition sm:px-4 sm:text-center ${i > 0 ? "border-t border-slate-300 sm:border-l sm:border-t-0" : ""} ${mode === m ? "bg-indigo-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {L(SEND_MODE_TEXT[m].label)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSaveDefault}
        disabled={saving || mode === teamMode}
        className="text-[11px] font-medium text-indigo-700 hover:underline disabled:opacity-50"
      >
        {saved ? t("✓ Saved as team default", "✓ Vistað sem sjálfgefið") : mode === teamMode ? t("Team default", "Sjálfgefið fyrir liðið") : t("Set as team default", "Gera að sjálfgefnu")}
      </button>
      {/* What each mode does — all shown so the choice is clear before clicking; the active one is emphasised. */}
      <div className="w-full space-y-1 text-[11px] leading-snug">
        {SEND_MODES.map((m) => (
          <div key={m} className={mode === m ? "text-slate-700" : "text-slate-500"}>
            <span className="font-semibold text-slate-800">{L(SEND_MODE_TEXT[m].label)}:</span> {L(SEND_MODE_TEXT[m].line)}
          </div>
        ))}
      </div>
      {mode === "individualised_goals" ? (
        <div className="w-full rounded-md border border-indigo-200 bg-indigo-50 p-2 text-[11px] text-indigo-950" data-testid="send-mode-goals-status">
          {goalsSaved
            ? t("On for the team: players choose their goal and exercises in their app. ", "Kveikt fyrir liðið: leikmenn velja markmið og æfingar í appinu sínu. ")
            : t("Players can't choose yet: set this as the team default to open it for them. This send uses the goals players already have. ", "Leikmenn geta ekki valið enn: gerðu þetta að sjálfgefnu til að opna fyrir þá. Þessi sending notar markmiðin sem leikmenn eru þegar með. ")}
          <Link href="/coach/goal-requests" className="font-semibold text-indigo-700 underline">
            {t("Who takes part", "Hverjir taka þátt")}
          </Link>
        </div>
      ) : null}
      {/* What the 09:00 automatic send did today (send log, 2026-11-18). */}
      <StrengthSendStatus lang={lang} />
    </>
  );
}
