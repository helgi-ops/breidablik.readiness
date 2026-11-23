"use client";

/**
 * One-tap reason for a coach override (contradiction 18, coach's call 2026-11-23): a row of chips, "Other" opens a
 * short text box. The parent saves only when `isReasonReady(value)` is true; the server checks the same rule
 * (parseCoachReason in coachReasons.ts).
 */

import { reasonChoices, type ReasonKind } from "@/lib/micropulse/strengthProgramming/coachReasons";

export type ReasonValue = { code: string | null; note: string };

export const EMPTY_REASON: ReasonValue = { code: null, note: "" };

export const isReasonReady = (v: ReasonValue) => !!v.code && (v.code !== "other" || v.note.trim().length > 0);

export const reasonBody = (v: ReasonValue) => ({ reasonCode: v.code, reasonNote: v.note.trim() || undefined });

export default function CoachReasonPicker({
  kind, lang, value, onChange, label,
}: {
  kind: ReasonKind;
  lang: "IS" | "EN";
  value: ReasonValue;
  onChange: (v: ReasonValue) => void;
  label?: string;
}) {
  const is = lang === "IS";
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-700">{label ?? (is ? "Ástæða (einn smellur)" : "Reason (one tap)")}</p>
      <div className="flex flex-wrap gap-1.5">
        {reasonChoices(kind).map((c) => {
          const on = value.code === c.code;
          return (
            <button
              key={c.code}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ code: c.code, note: c.code === "other" ? value.note : "" })}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {is ? c.label.is : c.label.en}
            </button>
          );
        })}
      </div>
      {value.code === "other" && (
        <input
          type="text"
          value={value.note}
          maxLength={200}
          autoFocus
          onChange={(e) => onChange({ code: "other", note: e.target.value })}
          placeholder={is ? "Nokkur orð" : "A few words"}
          className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
        />
      )}
    </div>
  );
}
