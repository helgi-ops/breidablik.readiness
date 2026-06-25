"use client";

/**
 * Club status — the EXEC (management/GM) read-only dashboard.
 * Explainability-first: a one-sentence club verdict on top, then plain-language
 * tiles (availability today, adherence, trend) per team and rolled up across the
 * club. Aggregates only — no individual health data (enforced by the endpoint).
 * Works the same on Lite and Pro; confidence (coverage) is shown where relevant.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Avail = { cleared: number; managed: number; unavailable: number; total: number };
type Bi = { EN: string; IS: string };
type Trend = { weekStart: string; total: number; clearedPct: number | null };
type Conf = { level: "high" | "moderate" | "low"; coverage: number };
type TeamTile = {
  teamId: string; name: string; gender: string | null; teamType: string | null;
  availability: Avail; adherence: { withRead: number; squad: number; pct: number | null };
  confidence: Conf; verdict: Bi; trend: Trend[];
};
type Resp = {
  date: string;
  club: { name: string | null; teamCount: number };
  rollup: { availability: Avail; adherence: { withRead: number; squad: number; pct: number | null }; confidence: Conf; verdict: Bi; trend: Trend[] };
  teams: TeamTile[];
};

const CONF_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  moderate: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
};

function AvailChips({ a, is }: { a: Avail; is: boolean }) {
  const item = (label: string, n: number, tone: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <span className="tabular-nums">{n}</span> {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {item(is ? "klárir" : "cleared", a.cleared, "bg-emerald-50 text-emerald-700")}
      {item(is ? "í stýringu" : "managed", a.managed, "bg-amber-50 text-amber-700")}
      {item(is ? "ófáanleg" : "unavailable", a.unavailable, "bg-red-50 text-red-700")}
    </div>
  );
}

function TrendBars({ trend, is }: { trend: Trend[]; is: boolean }) {
  const pts = trend.filter((t) => t.clearedPct != null).slice(-8);
  if (pts.length < 2) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {is ? "Mönnun (klárir %) síðustu vikur" : "Availability (cleared %) recent weeks"}
      </div>
      <div className="flex items-end gap-1" style={{ height: 36 }}>
        {pts.map((t) => {
          const pct = t.clearedPct ?? 0;
          const tone = pct >= 80 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
          return (
            <div key={t.weekStart} className="flex-1" title={`${t.weekStart}: ${pct}%`}>
              <div className={`rounded-sm ${tone}`} style={{ height: Math.max(3, (pct / 100) * 36) }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ExecClubStatusPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setErr(is ? "Innskráning vantar." : "Not signed in."); return; }
      const res = await fetch("/api/exec/club-overview", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Failed"); setData(null); return; }
      setData(j as Resp); setErr(null);
    } catch { setErr("Failed"); }
    finally { setLoading(false); }
  }, [is]);
  useEffect(() => { void load(); }, [load]);

  const tx = (o: Bi) => (is ? o.IS : o.EN);
  const confChip = (c: Conf) => (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CONF_TONE[c.level]}`}
      title={is ? `Þekja ${Math.round(c.coverage * 100)}% af leikmönnum með lestur` : `${Math.round(c.coverage * 100)}% of players have a reading`}>
      {c.level}
    </span>
  );
  const adhLabel = (pct: number | null, withRead: number, squad: number) =>
    pct == null ? (is ? "engin gögn" : "no data")
      : `${pct}% ${is ? "með lestur" : "with a reading"} (${withRead}/${squad})`;

  if (loading) return <div className="text-sm text-slate-500">…</div>;
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{is ? "Staða félagsins" : "Club status"}</h1>
        <p className="text-xs text-slate-500">
          {is ? "Samantekt aðeins — engin einstaklings heilsugögn. " : "Aggregates only — no individual health data. "}
          {data.club.teamCount} {is ? "lið" : data.club.teamCount === 1 ? "team" : "teams"} · {data.date}
        </p>
      </div>

      {/* Club roll-up hero */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {is ? "Félagið í heild" : "Club roll-up"}
          </div>
          {confChip(data.rollup.confidence)}
        </div>
        <p className="mt-1 text-base font-semibold text-slate-900">{tx(data.rollup.verdict)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <AvailChips a={data.rollup.availability} is={is} />
          <span className="text-xs text-slate-500">{adhLabel(data.rollup.adherence.pct, data.rollup.adherence.withRead, data.rollup.adherence.squad)}</span>
        </div>
        <div className="mt-4 max-w-md"><TrendBars trend={data.rollup.trend} is={is} /></div>
      </div>

      {/* Per-team breakdown */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {is ? "Eftir liði" : "By team"}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.teams.map((t) => (
            <div key={t.teamId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800">{t.name}</span>
                  {t.gender ? <span className="ml-1.5 text-[10px] uppercase text-slate-400">{t.gender}</span> : null}
                </div>
                {confChip(t.confidence)}
              </div>
              <p className="mt-1 text-[13px] text-slate-700">{tx(t.verdict)}</p>
              <div className="mt-3"><AvailChips a={t.availability} is={is} /></div>
              <div className="mt-2 text-[11px] text-slate-500">{adhLabel(t.adherence.pct, t.adherence.withRead, t.adherence.squad)}</div>
              <div className="mt-3"><TrendBars trend={t.trend} is={is} /></div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] leading-snug text-slate-400">
        {is
          ? "Lestur byggður á kanónísku readiness-litunum (sömu og þjálfarar sjá). Aðeins talningar og hlutföll — engin svefn-, eymsla- eða meiðsla-gögn per leikmann. Virkar eins á Lite og Pro."
          : "Built on the canonical readiness colours (the same ones coaches see). Counts and percentages only — no per-player sleep, soreness, or injury data. Works the same on Lite and Pro."}
      </p>
    </div>
  );
}
