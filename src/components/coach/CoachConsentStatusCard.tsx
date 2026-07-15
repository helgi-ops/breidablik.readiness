"use client";

/**
 * CoachConsentStatusCard — the coach's view of privacy-consent status, so the
 * soft on-open player prompt has a follow-up loop: see who still hasn't given
 * data-processing consent (and which confirmed minors only have a self-grant,
 * not a guardian's) and nudge them in person. Reads /api/coach/consent-status.
 * Self-fetching + self-hiding; no roster prop needed.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Row = {
  playerId: string;
  fullName: string | null;
  isMinor: boolean;
  hasConsent: boolean;
  relationship: string | null;
  needsGuardian: boolean;
};
type Payload = {
  players: Row[];
  summary: { total: number; consented: number; outstanding: number; needsGuardian: number };
};

export default function CoachConsentStatusCard() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const [data, setData] = useState<Payload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/coach/consent-status", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && alive) setData((await res.json()) as Payload);
      } catch { /* soft */ } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!loaded || !data || data.summary.total === 0) return null;

  const { summary, players } = data;
  const outstanding = players.filter((p) => !p.hasConsent);
  const guardianNeeded = players.filter((p) => p.needsGuardian);
  const allGood = summary.outstanding === 0 && summary.needsGuardian === 0;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {isIS ? "Persónuvernd — samþykki" : "Privacy — consent"}
          </div>
          <div className="mt-0.5 text-sm text-slate-700">
            {isIS
              ? `${summary.consented} af ${summary.total} leikmönnum hafa samþykkt gagnavinnslu.`
              : `${summary.consented} of ${summary.total} players have consented to data processing.`}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            allGood ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {allGood ? (isIS ? "Allt í lagi" : "All set") : `${summary.outstanding + summary.needsGuardian} ${isIS ? "eftir" : "to do"}`}
        </span>
      </div>

      {!allGood && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline"
          >
            {open ? (isIS ? "Fela lista ▲" : "Hide list ▲") : (isIS ? "Sjá hverjir eiga eftir ▼" : "See who's outstanding ▼")}
          </button>
          {open && (
            <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
              {outstanding.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {isIS ? "Hafa ekki samþykkt" : "Not yet consented"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {outstanding.map((p) => (
                      <span key={p.playerId} className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] text-slate-700">
                        {p.fullName ?? "—"}{p.isMinor ? (isIS ? " · ólögráða" : " · minor") : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {guardianNeeded.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                    {isIS ? "Ólögráða — vantar samþykki forráðamanns" : "Minors — needs guardian consent"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {guardianNeeded.map((p) => (
                      <span key={p.playerId} className="rounded-full bg-amber-50 px-2 py-0.5 text-[12px] text-amber-800">
                        {p.fullName ?? "—"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[11px] leading-snug text-slate-400">
                {isIS
                  ? "Leikmenn eru beðnir um samþykki þegar þeir opna appið. Þú getur minnt þá á það — eða opnað „Friðhelgi“ með þeim."
                  : "Players are asked to consent when they open the app. You can remind them — or open “Privacy” with them."}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
