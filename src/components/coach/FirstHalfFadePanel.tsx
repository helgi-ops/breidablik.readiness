"use client";

/**
 * FirstHalfFadePanel — "First half vs second half — last match". Per-minute IMA/GPS movement of the
 * single most-recent match's 1st half vs 2nd half, with a fade chip (amber = 2nd-half drop). Reads
 * `firstHalfFade` from /api/coach/team/match-intensity-halves (the same endpoint the season-wide
 * Match Movement fade card uses, different response key). GPS/IMA-based → honest empty state for
 * no-GPS teams. Descriptive conditioning context — never touches the readiness colour or decision.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Lang = "EN" | "IS";
type HalfMetric = { key: string; h1: number | null; h2: number | null; deltaPct: number | null };
type PlayerHalf = { playerId: string; playerName: string; position: string | null; h1Minutes: number; h2Minutes: number; metrics: HalfMetric[] };
type FirstHalfFade = { sessionDate: string | null; nPlayers: number; confidence: "building" | "moderate" | "high"; metrics: HalfMetric[]; players: PlayerHalf[] };

const LABELS: Record<string, { EN: string; IS: string }> = {
  high: { EN: "High-intensity IMA / min", IS: "Háákefðar IMA / mín" },
  total: { EN: "Total IMA / min", IS: "Heildar IMA / mín" },
  hir: { EN: "High-intensity running / min", IS: "Háákefðar hlaup / mín" },
  pl: { EN: "PlayerLoad / min", IS: "PlayerLoad / mín" },
  dist: { EN: "Total distance / min", IS: "Heildarvegalengd / mín" },
  hsr: { EN: "High-speed running / min", IS: "Háhraðahlaup / mín" },
  sprint: { EN: "Sprint distance / min", IS: "Sprett-vegalengd / mín" },
  maxvel: { EN: "Top speed (km/h)", IS: "Hámarkshraði (km/klst)" },
};
const T = {
  EN: { title: "First half vs second half — last match", match: "Match", players: "players", h1: "H1", h2: "H2",
    empty: "No half-by-half movement for the last match yet — needs GPS/IMA session periods named by half.",
    showPlayers: "Per player", hidePlayers: "Hide per player", purpose: "Did the team hold its intensity, or fade after the break? Per-minute movement, first half vs second. Amber = a 2nd-half drop. Conditioning context — it never changes the readiness verdict." },
  IS: { title: "Fyrri vs seinni hálfleikur — síðasti leikur", match: "Leikur", players: "leikmenn", h1: "F", h2: "S",
    empty: "Engin hálfleikja-skipting fyrir síðasta leik enn — þarf GPS/IMA tímabil nefnd eftir hálfleik.",
    showPlayers: "Per leikmaður", hidePlayers: "Fela per leikmann", purpose: "Hélt liðið ákefðinni eða dofnaði eftir hlé? Hreyfing á mínútu, fyrri vs seinni. Gult = fall í seinni hálfleik. Ástands-samhengi — breytir aldrei readiness-dómnum." },
} as const;

const fmt = (v: number | null): string => (v == null ? "–" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));
const signPct = (v: number): string => `${v >= 0 ? "+" : ""}${Math.round(v)}%`;

export default function FirstHalfFadePanel() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [fade, setFade] = React.useState<FirstHalfFade | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [showPlayers, setShowPlayers] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) { setLoaded(true); return; }
      const res = await fetch("/api/coach/team/match-intensity-halves?days=365", { headers: { Authorization: `Bearer ${tok}` } })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setFade((res?.firstHalfFade as FirstHalfFade) ?? null);
      setLoaded(true);
    })();
  }, []);

  const label = (k: string) => (LABELS[k] ? LABELS[k][lang] : k);
  const hasData = fade && fade.sessionDate && fade.metrics.some((m) => m.h1 != null || m.h2 != null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-bold text-slate-900">{t.title}</div>
      <p className="mt-0.5 text-[11px] text-slate-400">{t.purpose}</p>
      {!loaded ? <p className="mt-2 text-sm text-slate-400">…</p> : !hasData ? (
        <p className="mt-2 text-[13px] text-slate-500">{t.empty}</p>
      ) : (
        <>
          <div className="mt-1 text-[11px] text-slate-500">{t.match}: {fade!.sessionDate} · {fade!.nPlayers} {t.players}</div>
          <div className="mt-3 space-y-2">
            {fade!.metrics.filter((m) => m.h1 != null || m.h2 != null).map((m) => {
              const drop = (m.deltaPct ?? 0) < 0;
              return (
                <div key={m.key} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
                  <span className="text-slate-700">{label(m.key)}</span>
                  <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
                    <span className="text-slate-500">{t.h1}</span><span className="font-semibold text-slate-800">{fmt(m.h1)}</span>
                    <span className="text-slate-300">→</span>
                    <span className="text-slate-500">{t.h2}</span><span className="font-semibold text-slate-800">{fmt(m.h2)}</span>
                    {m.deltaPct != null ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${drop ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{signPct(m.deltaPct)}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
          {fade!.players.length > 0 ? (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <button onClick={() => setShowPlayers((v) => !v)} className="text-[12px] font-medium text-[#2740e6] hover:underline">
                {showPlayers ? t.hidePlayers : `${t.showPlayers} (${fade!.players.length})`}
              </button>
              {showPlayers ? (
                <div className="mt-2 space-y-1">
                  {fade!.players.map((p) => {
                    const hi = p.metrics.find((m) => m.key === "high");
                    const drop = (hi?.deltaPct ?? 0) < 0;
                    return (
                      <div key={p.playerId} className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="text-slate-700">{p.playerName}{p.position ? <span className="ml-1 text-[10px] uppercase text-slate-400">{p.position}</span> : null}</span>
                        <span className="flex items-baseline gap-2 tabular-nums">
                          <span className="text-slate-500">{label("high")}</span>
                          <span className="font-semibold text-slate-800">{fmt(hi?.h1 ?? null)}→{fmt(hi?.h2 ?? null)}</span>
                          {hi?.deltaPct != null ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${drop ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{signPct(hi.deltaPct)}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
