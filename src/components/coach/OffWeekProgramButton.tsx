"use client";

/**
 * "Generate off-week program" — on Week setup, when the week is OFF / a break. Fetches per-player
 * maintenance plans (strength + running, individualised by need), shows a preview with each player's
 * "why", and downloads a per-player PDF or a team pack (the offline artefact for travel). Coach-owned:
 * the coach reviews here before handing it out. Descriptive; never the readiness colour.
 */

import { useState, type FC } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { OffWeekPlayerPlan } from "@/components/coach/OffWeekPlanPdf";

// teamId is resolved server-side from the coach's auth; the prop only gates the mount in Week setup.
export const OffWeekProgramButton: FC<{ teamId?: string }> = () => {
  const [lang] = useLang();
  const t = (en: string, is: string) => (lang === "IS" ? is : en);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [gym, setGym] = useState<"gym" | "bodyweight">("gym");
  const [players, setPlayers] = useState<OffWeekPlayerPlan[]>([]);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setErr(null);
    try {
      const tk = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tk) { setErr(t("Not signed in.", "Ekki innskráð(ur).")); return; }
      const res = await fetch(`/api/coach/team/off-week?days=${days}&gym=${gym}`, { headers: { Authorization: `Bearer ${tk}` } });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setErr(j?.error ?? t("Failed.", "Mistókst.")); return; }
      setPlayers((j.players ?? []) as OffWeekPlayerPlan[]);
    } finally { setLoading(false); }
  };

  const dl = async (subset: OffWeekPlayerPlan[], filename?: string) => {
    const { downloadOffWeekPlanPdf } = await import("@/components/coach/OffWeekPlanPdf");
    await downloadOffWeekPlanPdf(subset, lang, filename);
  };

  const sendToApp = async () => {
    setSending(true); setErr(null); setSentMsg(null);
    try {
      const tk = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tk) { setErr(t("Not signed in.", "Ekki innskráð(ur).")); return; }
      const res = await fetch(`/api/coach/team/off-week`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ days, gym }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { setErr(j?.error ?? t("Send failed.", "Sending mistókst.")); return; }
      setSentMsg(t(`Sent to ${j.sent} players' app.`, `Sent í app ${j.sent} leikmanna.`));
    } finally { setSending(false); }
  };

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); if (players.length === 0) void generate(); }}
        className="rounded-lg border border-[#7a5cc4]/40 bg-[#7a5cc4]/10 px-3 py-2 text-xs font-semibold text-[#7a5cc4] hover:bg-[#7a5cc4]/15">
        {t("Off-week program (strength + running)", "Frí-viku prógramm (styrkur + hlaup)")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="mt-8 w-full max-w-3xl rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{t("Off-week maintenance program", "Frí-viku viðhalds-prógramm")}</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">{t("Maintenance, not building — each player gets what he needs. Self-guided (RPE/time/distance). You review before handing it out.", "Viðhald, ekki uppbygging — hver fær það sem hann þarf. Sjálf-leiðbeint (RPE/tími/vegalengd). Þú yfirferð áður en þú deilir.")}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <label className="text-slate-600">{t("Days", "Dagar")}
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-1 rounded border border-slate-300 px-2 py-1">
                  {[3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                {(["gym", "bodyweight"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGym(g)} className={`px-2.5 py-1 font-semibold ${gym === g ? "bg-[#2740e6] text-white" : "bg-white text-slate-600"}`}>
                    {g === "gym" ? t("Gym", "Ræktin") : t("Bodyweight (travel)", "Líkamsþyngd (ferðalag)")}
                  </button>
                ))}
              </div>
              <button type="button" onClick={generate} disabled={loading} className="rounded bg-slate-900 px-2.5 py-1 font-semibold text-white disabled:opacity-50">{loading ? t("Generating…", "Bý til…") : t("Regenerate", "Endurgera")}</button>
              {players.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => dl(players, "off-week-team-pack.pdf")} className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700">{t("Team pack (PDF)", "Liðs-pakki (PDF)")}</button>
                  <button type="button" onClick={sendToApp} disabled={sending} className="rounded bg-[#1c7a4a] px-2.5 py-1 font-semibold text-white disabled:opacity-50">{sending ? t("Sending…", "Sendi…") : t("Send to players' app", "Senda í app leikmanna")}</button>
                </div>
              )}
            </div>

            {sentMsg && <p className="mt-2 rounded bg-[#1c7a4a]/10 px-2 py-1 text-xs text-[#1c7a4a]">{sentMsg}</p>}
            {err && <p className="mt-2 rounded bg-[#a83e28]/10 px-2 py-1 text-xs text-[#a83e28]">{err}</p>}

            <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
              {players.map((p) => (
                <div key={p.playerId} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{p.name} {p.position && <span className="text-[11px] font-normal text-slate-400">· {p.position}</span>}</span>
                    <button type="button" onClick={() => dl([p])} className="rounded bg-[#2740e6] px-2 py-0.5 text-[11px] font-semibold text-white">PDF</button>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">{lang === "IS" ? p.plan.summary.is : p.plan.summary.en}</p>
                  <ul className="mt-1 space-y-0.5">
                    {p.plan.why.map((w, i) => <li key={i} className="text-[11px] text-[#4a3a7a]">• {lang === "IS" ? w.is : w.en}</li>)}
                  </ul>
                </div>
              ))}
              {!loading && players.length === 0 && !err && <p className="text-xs text-slate-400">{t("No players.", "Engir leikmenn.")}</p>}
            </div>

            <p className="mt-3 text-[10px] text-slate-400">{t("Send to the players' app (they see it in Strength, works offline once opened) or hand out the PDF.", "Sendu í app leikmanna (sést undir Styrk, virkar án nets þegar opnað) eða deildu PDF-inu.")}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default OffWeekProgramButton;
