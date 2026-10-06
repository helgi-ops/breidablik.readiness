"use client";

/**
 * Player working loads — the athlete's own working 1RM per main lift, derived from logged sets
 * (blended with any tested 1RM; floor = tested, +10% cap → "retest due"), and the working kg at
 * common percentages. This is the "real kg" payoff of the non-VBT loop, shown to the player (not
 * just the coach). Hidden for VBT teams (bar velocity is their objective load) and until a lift has
 * a working 1RM. Descriptive — never the readiness colour; the coach still approves load changes.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { WorkingEntry } from "@/lib/client/workingOneRm";

const REF_PCTS = [0.7, 0.8, 0.9];
/** Working kg at a %1RM, rounded to the nearest 2.5 kg (smallest plate jump). */
const kgAt = (oneRm: number, pct: number) => Math.round((oneRm * pct) / 2.5) * 2.5;

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const SOURCE_STYLE: Record<WorkingEntry["source"], string> = {
  tested: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  auto: "bg-[#2740e6]/10 text-[#2740e6] ring-[#2740e6]/20",
  logged: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function PlayerWorkingLoadsCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [working, setWorking] = React.useState<Record<string, WorkingEntry> | null>(null);
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) return;
      const res = await fetch("/api/player/strength-log?days=90", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!alive || !j?.ok) return;
      if (j.hasVbt) { setHidden(true); return; }
      setWorking((j.working ?? {}) as Record<string, WorkingEntry>);
    })();
    return () => { alive = false; };
  }, []);

  if (hidden || !working) return null;
  const lifts = Object.entries(working);
  if (lifts.length === 0) return null;

  const sourceLabel = (s: WorkingEntry["source"]) =>
    s === "tested" ? (is ? "prófað" : "tested") : s === "auto" ? (is ? "sjálfvirkt" : "auto") : (is ? "skráð" : "logged");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Vinnuþyngdir þínar" : "Your working loads"}</div>
      <div className="mt-2 divide-y divide-slate-100">
        {lifts.map(([lift, w]) => (
          <div key={lift} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-[110px] text-[13px] font-semibold text-slate-900">{titleCase(lift)}</span>
            <span className="text-[13px] tabular-nums text-slate-700">
              <b>{w.one_rm}</b> kg <span className="text-[11px] text-slate-400">1RM</span>
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${SOURCE_STYLE[w.source]}`}>{sourceLabel(w.source)}</span>
            {w.needs_retest && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#de9328] ring-1 ring-[#de9328]/30" title={is ? "Skráð þyngd fór yfir prófað 1RM — tími á endurpróf." : "Logged load exceeded the tested 1RM — time to retest."}>
                {is ? "endurpróf" : "retest due"}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 text-[11px] tabular-nums text-slate-500">
              {REF_PCTS.map((p) => (
                <span key={p}>{Math.round(p * 100)}% <b className="text-slate-700">{kgAt(w.one_rm, p)}</b></span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        {is
          ? "Metið 1RM úr skráðum settum (þyngd × endurt. × RPE), gólf = prófað 1RM. Lýsandi — þjálfari samþykkir álagsbreytingar; hefur ekki áhrif á readiness."
          : "Estimated 1RM from your logged sets (weight × reps × RPE), floored at your tested 1RM. Descriptive — your coach approves load changes; no effect on readiness."}
      </p>
    </div>
  );
}
