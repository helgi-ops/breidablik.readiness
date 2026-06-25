"use client";

/**
 * Club status — the EXEC (management/GM) read-only dashboard.
 * Explainability-first: a one-sentence verdict on top (coverage-honest — it leads
 * with the data gap when too few players have a reading, so "strong" never shows
 * on thin coverage), then plain-language tiles per team and rolled up across the
 * club. With a single team there's no redundant roll-up. Aggregates only — no
 * individual health data (enforced by the endpoint). Works on Lite + Pro.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Avail = { cleared: number; managed: number; unavailable: number; total: number };
type Bi = { EN: string; IS: string };
type Trend = { weekStart: string; total: number; clearedPct: number | null };
type Conf = { level: "high" | "moderate" | "low"; coverage: number };
type Adherence = { withRead: number; squad: number; pct: number | null };
type Load = { band: "building" | "sustained" | "easing" | "na"; ratio: number | null; label: Bi; briefing: Bi };
type Tile = { availability: Avail; adherence: Adherence; confidence: Conf; verdict: Bi; briefing: Bi; watch: Bi; load: Load; trend: Trend[] };
type TeamTile = Tile & { teamId: string; name: string; gender: string | null; teamType: string | null };
type Resp = {
  date: string;
  club: { name: string | null; teamCount: number };
  rollup: Tile;
  teams: TeamTile[];
};

const CONF_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  moderate: "bg-amber-100 text-amber-700",
  low: "bg-slate-200 text-slate-600",
};
const LOAD_TONE: Record<string, string> = {
  building: "bg-amber-100 text-amber-700",
  sustained: "bg-emerald-100 text-emerald-700",
  easing: "bg-sky-100 text-sky-700",
  na: "bg-slate-100 text-slate-500",
};
const CONF_LABEL: Record<string, Bi> = {
  high: { EN: "high confidence", IS: "mikil vissa" },
  moderate: { EN: "some confidence", IS: "nokkur vissa" },
  low: { EN: "low confidence", IS: "lítil vissa" },
};

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

  if (loading) return <div className="text-sm text-slate-500">…</div>;
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>;
  if (!data) return null;

  const single = data.teams.length === 1 ? data.teams[0] : null;

  // ── tiny presentational helpers (in-component so they capture `is`/`tx`) ──
  const ConfChip = ({ c }: { c: Conf }) => (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONF_TONE[c.level]}`}
      title={is ? `${Math.round(c.coverage * 100)}% leikmanna með lestur í dag` : `${Math.round(c.coverage * 100)}% of players have a reading today`}>
      {tx(CONF_LABEL[c.level])}
    </span>
  );

  const AvailRow = ({ a }: { a: Avail }) => {
    const chip = (n: number, label: string, tone: string) => (
      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${tone}`}>
        <span className="tabular-nums">{n}</span><span className="font-medium">{label}</span>
      </span>
    );
    return (
      <div className="flex flex-wrap gap-2">
        {chip(a.cleared, is ? "klárir" : "cleared", "bg-emerald-50 text-emerald-700")}
        {chip(a.managed, is ? "í stýringu" : "managed", "bg-amber-50 text-amber-700")}
        {chip(a.unavailable, is ? "ófáanleg" : "unavailable", "bg-red-50 text-red-700")}
      </div>
    );
  };

  const Adherence = ({ adh }: { adh: Adherence }) => {
    const pct = adh.pct ?? 0;
    const tone = pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400";
    return (
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600">{is ? "Aðsókn í dag" : "Adherence today"}</span>
          <span className="tabular-nums text-slate-500">
            {adh.withRead}/{adh.squad} {is ? "með lestur" : "with a reading"} · {adh.pct ?? 0}%
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
    );
  };

  const TrendBars = ({ trend }: { trend: Trend[] }) => {
    const pts = trend.filter((t) => t.clearedPct != null).slice(-8);
    if (pts.length < 2) return null;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {is ? "Mönnun eftir vikum (klárir %)" : "Availability by week (cleared %)"}
          </span>
          <span className="flex items-center gap-2 text-[9px] text-slate-400">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-400" />≥80</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />60–79</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-400" />&lt;60</span>
          </span>
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
  };

  const StatusCard = ({ title, gender, tile, hero }: { title: string; gender?: string | null; tile: Tile; hero?: boolean }) => {
    const watch = tx(tile.watch);
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${hero ? "p-5" : "p-4"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={`font-semibold text-slate-900 ${hero ? "text-base" : ""}`}>{title}</span>
            {gender ? <span className="ml-1.5 text-[10px] uppercase text-slate-400">{gender}</span> : null}
          </div>
          <ConfChip c={tile.confidence} />
        </div>

        {/* WORDS lead — verdict headline, then the plain-language briefing + what to watch. */}
        <p className={`mt-1.5 font-bold text-slate-900 ${hero ? "text-lg" : "text-[15px]"}`}>{tx(tile.verdict)}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{tx(tile.briefing)}</p>
        {watch ? (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /></svg>
            <span><span className="font-semibold">{is ? "Fylgjast með: " : "Watch: "}</span>{watch}</span>
          </div>
        ) : null}

        {/* Training load — second narrative dimension. */}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Æfingaálag" : "Training load"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${LOAD_TONE[tile.load.band]}`}>{tx(tile.load.label)}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{tx(tile.load.briefing)}</p>
        </div>

        {/* Supporting numbers — the detail behind the words. */}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Tölurnar á bak við" : "The numbers behind it"}</div>
          <AvailRow a={tile.availability} />
          <div className="mt-3"><Adherence adh={tile.adherence} /></div>
          <div className="mt-4 max-w-md"><TrendBars trend={tile.trend} /></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{is ? "Staða félagsins" : "Club status"}</h1>
        <p className="text-xs text-slate-500">
          {is ? "Samantekt aðeins — engin einstaklings heilsugögn. " : "Aggregates only — no individual health data. "}
          {data.club.teamCount} {is ? (data.club.teamCount === 1 ? "lið" : "lið") : data.club.teamCount === 1 ? "team" : "teams"} · {data.date}
        </p>
      </div>

      {single ? (
        // One team → no redundant roll-up, just the team's card.
        <StatusCard hero title={single.name} gender={single.gender} tile={single} />
      ) : (
        <>
          <StatusCard hero title={is ? "Félagið í heild" : "Club roll-up"} tile={data.rollup} />
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Eftir liði" : "By team"}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.teams.map((t) => <StatusCard key={t.teamId} title={t.name} gender={t.gender} tile={t} />)}
            </div>
          </div>
        </>
      )}

      <p className="text-[10px] leading-snug text-slate-400">
        {is
          ? "„Aðsókn“ = hlutfall leikmanna með lestur í dag (wellness á Pro, GPS á Lite) — sýnir hve mikið kerfið er notað. „Klárir/í stýringu/ófáanleg“ byggir á kanónísku readiness-litunum (þeim sömu og þjálfarar sjá). Aðeins talningar — engin svefn-, eymsla- eða meiðsla-gögn per leikmann."
          : "“Adherence” = share of players with a reading today (wellness on Pro, GPS on Lite) — shows how much the system is being used. “Cleared/managed/unavailable” uses the canonical readiness colours (the same ones coaches see). Counts only — no per-player sleep, soreness, or injury data."}
      </p>
    </div>
  );
}
