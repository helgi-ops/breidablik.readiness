"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";

type Row = {
  path: string;
  total: number;
  last_7d: number;
  last_30d: number;
  distinct_users: number;
  last_used: string | null;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function UsageAnalyticsPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) { if (alive) { setErr(IS ? "Ekki innskráður" : "Not signed in"); setLoading(false); } return; }
        const res = await fetch("/api/coach/usage-analytics", { headers: { Authorization: `Bearer ${token}` } });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) { setErr(j.error ?? (IS ? "Villa" : "Error")); setLoading(false); return; }
        setRows(j.rows ?? []);
        setLoading(false);
      } catch {
        if (alive) { setErr(IS ? "Villa við að sækja gögn" : "Failed to load"); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [IS]);

  const totalViews = useMemo(() => (rows ?? []).reduce((s, r) => s + Number(r.total), 0), [rows]);

  const status = (r: Row): { key: "active" | "fading" | "dead"; label: string; cls: string } => {
    if (Number(r.last_7d) > 0) return { key: "active", label: IS ? "Virk" : "Active", cls: "bg-emerald-100 text-emerald-700" };
    if (Number(r.last_30d) > 0) return { key: "fading", label: IS ? "Dofnar" : "Fading", cls: "bg-amber-100 text-amber-700" };
    return { key: "dead", label: IS ? "Dautt" : "Dead", cls: "bg-red-100 text-red-700" };
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">{IS ? "Notkunar-greining" : "Usage analytics"}</h1>
      <PagePurpose
        en="see which coach surfaces are actually used — so cut/keep decisions are data-driven, not guesses"
        is="sjá hvaða þjálfara-yfirborð eru raunverulega notuð — svo cut/keep ákvarðanir séu gagna-drifnar, ekki ágiskanir"
      />

      {loading && <p className="mt-4 text-sm text-slate-500">{IS ? "Hleð…" : "Loading…"}</p>}
      {err && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {err === "Admin only" ? (IS ? "Aðeins fyrir stjórnendur." : "Admin only.") : err}
        </div>
      )}

      {rows && !err && (
        <>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span><strong className="text-slate-900">{rows.length}</strong> {IS ? "yfirborð" : "surfaces"}</span>
            <span><strong className="text-slate-900">{totalViews.toLocaleString()}</strong> {IS ? "heildar-flettingar" : "total views"}</span>
            <span className="text-red-600">{rows.filter((r) => status(r).key === "dead").length} {IS ? "dauð (0 á 30d)" : "dead (0 in 30d)"}</span>
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {IS ? "Engin notkunar-gögn enn — þau byrja að safnast við næstu heimsóknir." : "No usage data yet — it starts collecting on the next visits."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{IS ? "Yfirborð" : "Surface"}</th>
                    <th className="px-3 py-2 text-right">7d</th>
                    <th className="px-3 py-2 text-right">30d</th>
                    <th className="px-3 py-2 text-right">{IS ? "Alls" : "Total"}</th>
                    <th className="px-3 py-2 text-right">{IS ? "Notendur" : "Users"}</th>
                    <th className="px-3 py-2 text-right">{IS ? "Síðast" : "Last used"}</th>
                    <th className="px-3 py-2">{IS ? "Staða" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = status(r);
                    const ds = daysSince(r.last_used);
                    return (
                      <tr key={r.path} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-[12px] text-slate-800">{r.path}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(r.last_7d).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(r.last_30d).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{Number(r.total).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(r.distinct_users).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {ds == null ? "—" : ds === 0 ? (IS ? "í dag" : "today") : `${ds}${IS ? "d síðan" : "d ago"}`}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-400">
            {IS
              ? "Paths eru normaliseruð (leikmanns-ids fjarlægð). Aðeins page_view atburðir. „Dautt“ = engin notkun síðustu 30 daga — mögulegur cut-frambjóðandi."
              : "Paths are normalised (player ids stripped). page_view events only. “Dead” = no use in the last 30 days — a possible cut candidate."}
          </p>
        </>
      )}
    </div>
  );
}
