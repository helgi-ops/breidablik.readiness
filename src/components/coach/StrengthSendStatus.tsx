"use client";

/**
 * What the 09:00 automatic strength send did today (2026-11-18, review item C), shown under the send-mode picker
 * on /coach/strength. Reads GET /api/coach/team/strength-send-log (table `strength_send_log`).
 *
 * Layered read: one line (sent · injured · failed · time) → the players to act on (failed) in plain words →
 * "Show details": every skipped player with the reason, and the last 7 days. Descriptive only: never the colour.
 * Renders nothing when auto-send is off and nothing was logged this week.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { SendLogSummary } from "@/lib/micropulse/strengthProgramming/sendLog";

type Resp = { ok: boolean; autoSend: boolean; today: string; days: SendLogSummary[]; names: Record<string, string> };

/** Iceland is on UTC: the stored time's HH:MM is the local time. */
const hhmm = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(11, 16) : null);

export default function StrengthSendStatus({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const t = (en: string, isText: string) => (is ? isText : en);
  const L = (b: { en: string; is: string }) => (is ? b.is : b.en);
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const token = (await sb.auth.getSession()).data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/coach/team/strength-send-log", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const j = (await res.json()) as Resp;
        if (alive && j.ok) setData(j);
      } catch { /* the status line is optional */ }
    })();
    return () => { alive = false; };
  }, []);

  if (!data) return null;
  const today = data.days[0];
  const anyLogged = data.days.some((d) => d.state !== "missing");
  if (!data.autoSend && !anyLogged) return null;

  const nowUtc = new Date().toISOString().slice(11, 16);
  const name = (id: string) => data.names[id] || t("A player", "Leikmaður");
  const failedPeople = today.people.filter((p) => p.status === "failed");
  const skippedPeople = today.people.filter((p) => p.status === "skipped");

  let line: string;
  let tone: "ok" | "warn" | "wait";
  if (today.state === "missing") {
    if (!data.autoSend) { line = t("Automatic send is off today.", "Sjálfvirk sending er ekki á í dag."); tone = "wait"; }
    else if (nowUtc < "09:15") { line = t("Today's sessions go out automatically at 09:00.", "Æfingar dagsins fara sjálfkrafa út kl. 09:00."); tone = "wait"; }
    else { line = t("Today's automatic send hasn't run. Send today's sessions by hand.", "Sjálfvirka sendingin hefur ekki farið í dag. Sendu æfingar dagsins handvirkt."); tone = "warn"; }
  } else {
    const at = hhmm(today.ranAt);
    line = `${L(today.line)}${today.state === "ran" && at ? ` · ${at}` : ""}`;
    tone = today.needsAction ? "warn" : "ok";
  }

  const box = tone === "warn"
    ? "border-amber-300 bg-amber-50 text-amber-950"
    : tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-slate-50 text-slate-700";
  const history = data.days.slice(1).filter((d) => d.state !== "missing");

  return (
    <div className={`w-full rounded-md border p-2 text-[11px] leading-snug ${box}`} data-testid="strength-send-status">
      <div className="font-semibold">
        <span className="mr-1 font-normal opacity-80">{t("Automatic send today:", "Sjálfvirk sending í dag:")}</span>
        {line}
      </div>
      {failedPeople.length ? (
        <div className="mt-1">
          {t("Not saved, send by hand: ", "Vistaðist ekki, sendu handvirkt: ")}
          <span className="font-semibold">{failedPeople.map((p) => name(p.playerId)).join(", ")}</span>
        </div>
      ) : null}
      {today.rebuilt ? (
        <div className="mt-1 opacity-80">
          {t(
            "Sessions sent before a player's check-in follow it once they check in (yellow = fewer sets, red = warm-up and mobility only).",
            "Æfingar sem fóru út fyrir innskráningu lagast að henni þegar leikmaður skráir sig inn (gul = færri sett, rauð = upphitun og liðleiki eingöngu).",
          )}
        </div>
      ) : null}
      {skippedPeople.length || history.length ? (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 font-medium text-indigo-700 hover:underline" aria-expanded={open}>
          {open ? t("Hide details", "Fela nánar") : t("Show details", "Sýna nánar")}
        </button>
      ) : null}
      {open ? (
        <div className="mt-1 space-y-2 text-slate-700">
          {skippedPeople.length ? (
            <ul className="space-y-0.5">
              {skippedPeople.map((p) => (
                <li key={p.playerId}>
                  <span className="font-semibold text-slate-800">{name(p.playerId)}</span>: {L(p.reason)}
                </li>
              ))}
            </ul>
          ) : null}
          {history.length ? (
            <div>
              <div className="font-semibold text-slate-800">{t("Earlier this week", "Fyrr í vikunni")}</div>
              <ul className="space-y-0.5">
                {history.map((d) => (
                  <li key={d.date}>
                    <span className="tabular-nums text-slate-500">{d.date.slice(5)}</span> · {L(d.line)}
                    {d.people.some((p) => p.status === "failed")
                      ? ` (${d.people.filter((p) => p.status === "failed").map((p) => name(p.playerId)).join(", ")})`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
