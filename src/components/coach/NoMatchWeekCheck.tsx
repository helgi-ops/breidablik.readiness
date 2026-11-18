"use client";

/**
 * Weekday plan vs the week actually set up (2026-11-18, review item E). Shown under the weekday plan on the strength
 * page (next 4 weeks) and on Week setup (the week shown). When a strength or power day of the plan is a day off in a
 * week without a match, it says so and offers to move that day to the nearest free training day, FOR THAT WEEK ONLY
 * (the weekday plan stays). Rules: noMatchCheck.ts; data + save: /api/coach/team/no-match-week.
 * Individualised modes only (Standard doesn't use the weekday plan): renders nothing otherwise, or when all is fine.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { applySuggestions, checkNoMatchWeeks, movesToShow, suggestionLabel, type PlannedDay } from "@/lib/micropulse/strengthProgramming/noMatchCheck";
import { mondayOfIso, type NoMatchWeek } from "@/lib/micropulse/strengthProgramming/structures";

type Resp = { ok: boolean; mode: string; plan: NoMatchWeek; days: PlannedDay[]; gameDates: string[] };

async function token(): Promise<string | null> {
  return (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
}

export default function NoMatchWeekCheck({
  lang,
  from,
  days,
  plan,
  refreshKey,
  showPlanLink = false,
}: {
  lang: "IS" | "EN";
  /** First date to check (YYYY-MM-DD). */
  from: string;
  /** How many days from `from`. */
  days: number;
  /** The weekday plan being edited (unsaved), when shown next to the editor; else the saved one is used. */
  plan?: NoMatchWeek;
  /** Change it to re-read (e.g. after the week was saved). */
  refreshKey?: string | number;
  /** Week setup: link to where the weekday plan is edited. */
  showPlanLink?: boolean;
}) {
  const is = lang === "IS";
  const t = (en: string, isText: string) => (is ? isText : en);
  const L = (b: { en: string; is: string }) => (is ? b.is : b.en);
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = await token();
        if (!tok) return;
        const res = await fetch(`/api/coach/team/no-match-week?from=${from}&days=${days}`, { headers: { Authorization: `Bearer ${tok}` } });
        if (!res.ok) return;
        const j = (await res.json()) as Resp;
        if (alive && j.ok) setData(j);
      } catch { /* optional */ }
    })();
    return () => { alive = false; };
  }, [from, days, refreshKey, nonce]);

  // The template being edited (if any) + the SAVED one-week moves (saved on their own, never by the page).
  const effective = useMemo<NoMatchWeek | null>(() => {
    if (!data) return null;
    const { weeks: _w, ...tpl } = plan ?? data.plan;
    void _w;
    return { ...tpl, ...(data.plan.weeks ? { weeks: data.plan.weeks } : {}) };
  }, [data, plan]);

  const issues = useMemo(
    () => (data && effective ? checkNoMatchWeeks({ days: data.days, gameDates: data.gameDates, plan: effective }) : []),
    [data, effective],
  );
  const moves = useMemo(() => (effective ? movesToShow(effective, mondayOfIso(from)) : []), [effective, from]);

  if (!data || !effective || data.mode === "standard") return null;
  if (!issues.length && !moves.length) return null;

  const post = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      const tok = await token();
      const res = await fetch("/api/coach/team/no-match-week", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNonce((n) => n + 1);
    } catch {
      setErr(t("Couldn't save. Try again.", "Vistaðist ekki. Reyndu aftur."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 space-y-2" data-testid="no-match-week-check">
      {issues.map((iss) => (
        <div key={iss.weekStart} className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-[12px] leading-snug text-amber-950">
          <div className="font-semibold">{L(iss.headline)}</div>
          {iss.facts.length ? (
            <ul className="mt-1 space-y-0.5 text-[11px] text-amber-900">
              {iss.facts.map((f, i) => <li key={i}>{L(f)}</li>)}
            </ul>
          ) : null}
          {iss.suggestions.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void post(iss.weekStart, { weekStart: iss.weekStart, days: applySuggestions(effective.weeks?.[iss.weekStart], iss.suggestions) })}
                className="rounded-md bg-indigo-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                data-testid={`no-match-move-${iss.weekStart}`}
              >
                {busy === iss.weekStart ? t("Saving…", "Vista…") : t("Move for this week only", "Færa aðeins þessa viku")}
              </button>
              <span className="text-[11px] text-amber-900">{iss.suggestions.map((s) => L(suggestionLabel(s))).join(" · ")}</span>
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-amber-900">{t("No free training day that week to move it to.", "Enginn laus æfingadagur þá viku til að færa á.")}</div>
          )}
        </div>
      ))}
      {moves.map((m) => (
        <div key={m.weekStart} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
          <span>{L(m.line)}</span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void post(`undo-${m.weekStart}`, { weekStart: m.weekStart, clear: true })}
            className="font-semibold text-indigo-700 hover:underline disabled:opacity-50"
          >
            {busy === `undo-${m.weekStart}` ? t("Saving…", "Vista…") : t("Undo", "Afturkalla")}
          </button>
        </div>
      ))}
      <div className="text-[11px] text-slate-500">
        {t(
          "A move changes that week only; the weekday plan for other weeks stays as it is.",
          "Færsla breytir aðeins þeirri viku; vikuplanið fyrir aðrar vikur helst óbreytt.",
        )}
        {showPlanLink ? (
          <>
            {" "}
            <Link href="/coach/strength" className="font-semibold text-indigo-700 underline">
              {t("Weekday plan", "Vikuplan")}
            </Link>
          </>
        ) : null}
      </div>
      {err ? <div className="text-[11px] text-red-700">{err}</div> : null}
    </div>
  );
}
