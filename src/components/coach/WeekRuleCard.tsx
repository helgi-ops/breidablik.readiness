"use client";

/**
 * The in-season week rule on a coach surface (brief §5): never three training days in a row.
 * Layered read: the one-line verdict → 2–3 plain facts (the run, the nearest fix) → the rule and its source behind
 * "Show details". Advice only: "Use the fix" (when the surface can edit the week) and "Keep the plan" with a reason
 * (logged, `/api/coach/week-rules`). Never blocks, never touches the readiness colour.
 */

import { useState } from "react";
import { authFetch } from "@/lib/client/authFetch";
import { THREE_IN_A_ROW_EVIDENCE, type ThreeInARowCheck } from "@/lib/micropulse/weekSetup/weekRules";

type Lang = "EN" | "IS";
export type WeekRuleKeep = { reason: string | null; at: string };

export default function WeekRuleCard({ check, kept, lang, teamId, weekStart, canKeep, onUseFix, onKept, note }: {
  check: ThreeInARowCheck | null;
  kept: WeekRuleKeep | null;
  lang: Lang;
  teamId: string | null;
  weekStart: string;
  /** The saved week is what the check shows, so a keep can be logged for it. */
  canKeep: boolean;
  onUseFix?: () => void;
  onKept?: (kept: WeekRuleKeep | null) => void;
  /** A line under the facts (e.g. "Apply the week to keep it"). */
  note?: string | null;
}) {
  const is = lang === "IS";
  const [open, setOpen] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!check || !check.applies || check.ok || !check.headline) return null;
  const tx = (b: { en: string; is: string }) => (is ? b.is : b.en);

  async function keep() {
    if (!teamId) return;
    setBusy(true); setErr(null);
    try {
      const res = await authFetch("/api/coach/week-rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, week_start: weekStart, reason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j?.error ?? (is ? "Tókst ekki að vista." : "Could not save.")); return; }
      onKept?.((j?.kept ?? null) as WeekRuleKeep | null);
      setKeeping(false); setReason("");
    } finally { setBusy(false); }
  }

  const warn = { borderColor: "rgba(222,147,40,0.45)", background: "rgba(222,147,40,0.08)", color: "#7a5210" };
  const quiet = { borderColor: "#dcd8cc", background: "#faf9f4", color: "#3a3f45" };
  return (
    <div className="rounded-[10px] border px-3 py-2.5" style={kept ? quiet : warn} data-rule={check.ruleId}>
      <div className="text-[13px] font-semibold">
        {tx(check.headline)}
        {kept && <span className="ml-1 font-normal">{is ? "— þú heldur planinu." : "— you kept the plan."}</span>}
      </div>
      <ul className="mt-1 grid gap-0.5 text-[13px] leading-relaxed">
        {check.facts.map((f, i) => <li key={i}>{tx(f)}</li>)}
        {kept && <li>{is ? "Ástæða" : "Reason"}: {kept.reason ?? "—"}</li>}
      </ul>
      {note && !kept && <p className="mt-1 text-[12px]">{note}</p>}
      {!kept && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onUseFix && check.fix && check.fix.off.length > 0 && (
            <button type="button" onClick={onUseFix}
              className="h-8 rounded-[9px] px-3 text-[12px] font-semibold text-white" style={{ background: "#2740e6" }}>
              {is ? "Nota lagfæringu" : "Use the fix"}
            </button>
          )}
          {canKeep && teamId && !keeping && (
            <button type="button" onClick={() => setKeeping(true)}
              className="h-8 rounded-[9px] border border-[#dcd8cc] bg-white px-3 text-[12px] font-semibold text-[#14181c]">
              {is ? "Halda planinu" : "Keep the plan"}
            </button>
          )}
        </div>
      )}
      {keeping && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
            placeholder={is ? "Ástæða (t.d. bikarvika, æfingaferð)" : "Reason (e.g. cup week, training camp)"}
            className="h-8 min-w-0 flex-[1_1_220px] rounded-[9px] border border-[#dcd8cc] bg-white px-2.5 text-[13px] text-[#14181c]" />
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={keep}
            className="h-8 rounded-[9px] px-3 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "#2740e6" }}>
            {is ? "Vista" : "Save"}
          </button>
          <button type="button" onClick={() => { setKeeping(false); setErr(null); }} className="h-8 px-2 text-[12px] font-semibold">
            {is ? "Hætta við" : "Cancel"}
          </button>
        </div>
      )}
      {err && <p className="mt-1 text-[12px] text-[#a83e28]">{err}</p>}
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[12px] font-semibold underline">
        {open ? (is ? "Fela nánar" : "Hide details") : (is ? "Sýna nánar" : "Show details")}
      </button>
      {open && (
        <div className="mt-1 text-[12px] leading-relaxed">
          <div>{is ? "Regla" : "Rule"}: <code>{check.ruleId}</code></div>
          <div>{is ? "Heimild" : "Source"}: {THREE_IN_A_ROW_EVIDENCE}</div>
          {check.adaptation && <div>{is ? check.adaptation.actionIS : check.adaptation.actionEN}</div>}
        </div>
      )}
    </div>
  );
}
