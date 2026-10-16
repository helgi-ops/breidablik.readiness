"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";

type HealthStatus = "ok" | "info" | "amber" | "red";
type Result = {
  id: string;
  label: { en: string; is: string };
  status: HealthStatus;
  detail: { en: string; is: string };
  latest: string | null;
  expected: string;
  href?: string;
};
type TeamHealth = { teamId: string; name: string; worst: string; results: Result[] };
type Resp = { asOf: string | null; teams: TeamHealth[]; redCount: number; amberCount: number; actionableCount: number };

const DOT: Record<HealthStatus, string> = { red: "#a83e28", amber: "#de9328", info: "#6b7280", ok: "#1c7a4a" };
const CHIP: Record<HealthStatus, string> = {
  red: "bg-red-100 text-red-700", amber: "bg-amber-100 text-amber-700",
  info: "bg-slate-100 text-slate-600", ok: "bg-emerald-100 text-emerald-700",
};

export default function SystemHealthPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s.session?.access_token;
        if (!token) { if (alive) { setErr(IS ? "Ekki innskráður" : "Not signed in"); setLoading(false); } return; }
        const res = await fetch("/api/admin/health", { headers: { Authorization: `Bearer ${token}` } });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) { setErr(j.error ?? (IS ? "Villa" : "Error")); setLoading(false); return; }
        setData(j);
        setLoading(false);
      } catch {
        if (alive) { setErr(IS ? "Villa við að sækja gögn" : "Failed to load"); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [IS]);

  const L = (b: { en: string; is: string }) => (IS ? b.is : b.en);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">{IS ? "Kerfisstaða" : "System health"}</h1>
      <PagePurpose
        en="is everything flowing? one glance at every decision pipeline × team — so a silent failure is known the next morning, not three weeks later"
        is="flæðir allt? ein yfirsýn yfir hverja ákvörðunarkeðju × lið — svo þögul bilun uppgötvist næsta morgun, ekki þremur vikum síðar"
      />

      {loading && <p className="mt-4 text-sm text-slate-500">{IS ? "Hleð…" : "Loading…"}</p>}
      {err && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {err === "Admin only" ? (IS ? "Aðeins fyrir stjórnendur." : "Admin only.") : err}
        </div>
      )}

      {data && !err && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 font-medium ${data.redCount ? CHIP.red : CHIP.ok}`}>{data.redCount} {IS ? "rautt" : "red"}</span>
            <span className={`rounded-full px-2 py-1 font-medium ${data.amberCount ? CHIP.amber : CHIP.ok}`}>{data.amberCount} {IS ? "gult" : "amber"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">{data.teams.length} {IS ? "lið" : "teams"}</span>
            {data.asOf && <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-500">{data.asOf}</span>}
          </div>

          {data.actionableCount === 0 && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {IS ? "Allar keðjur flæða." : "Every pipeline is flowing."}
            </div>
          )}

          <div className="mt-4 space-y-4">
            {data.teams.map((t) => (
              <section key={t.teamId} className="rounded-xl border border-slate-200 bg-white">
                <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT[(t.worst as HealthStatus)] ?? DOT.ok }} />
                  <span className="text-sm font-semibold text-slate-800">{t.name}</span>
                </header>
                <ul className="divide-y divide-slate-100">
                  {t.results.map((r) => {
                    const key = `${t.teamId}:${r.id}`;
                    const isOpen = !!open[key];
                    return (
                      <li key={r.id} className="px-4 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[r.status] }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13px] font-medium text-slate-800">{L(r.label)}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CHIP[r.status]}`}>{r.status}</span>
                              {r.href && (r.status === "red" || r.status === "amber") && (
                                <Link href={r.href} className="text-[11px] font-medium text-[#2740e6] hover:underline">{IS ? "skoða →" : "open →"}</Link>
                              )}
                            </div>
                            {/* Layered read: the plain "why" is always visible; the raw provenance is behind a toggle. */}
                            <p className="mt-0.5 text-[12px] text-slate-600">{L(r.detail)}</p>
                            <button onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} className="mt-0.5 text-[10px] text-slate-400 hover:text-slate-600">
                              {isOpen ? (IS ? "fela" : "hide") : (IS ? "sýna gögn" : "show details")}
                            </button>
                            {isOpen && (
                              <div className="mt-1 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-500">
                                <div>{IS ? "nýjast" : "latest"}: <span className="tabular-nums">{r.latest ?? "—"}</span></div>
                                <div>{IS ? "vænst" : "expected"}: {r.expected}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
