"use client";

/**
 * PlayerBasketballGameReportCard — a basketball player's OWN per-game stats for the season, from the KKÍ
 * box scores (/api/player/basketball-game-report). The "Match" tab's football GPS report is empty for
 * basketball teams, so this is the basketball equivalent. Self-hides for non-basketball teams / no games.
 * Descriptive — never the readiness colour.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { labelFor, type GroupedStat } from "@/lib/micropulse/basketballStats/instatStatGroups";

type Game = {
  date: string | null; opponent: string; comp: string | null; compLabel: string; min: string | null;
  pts: number; reb: number; oreb: number; dreb: number;
  ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number;
  ftm: number; fta: number; pip: number; pm: number | null;
};
type CompSplit = { label: string; games: number; ppg: number };
type MA = { m: number; a: number };
type Shooting = { two: MA; three: MA; ft: MA };
type Summary = { games: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number; fgPct: number; tpPct: number; ftPct: number; bestPts: number; shooting: Shooting; byComp: CompSplit[] };
type Resp = { ok: boolean; isBasketball?: boolean; season?: string | null; games?: Game[]; summary?: Summary | null; allStats?: GroupedStat[] | null; error?: string };

const fr = (m: number, a: number) => `${m}-${a}${a > 0 ? ` · ${Math.round((m / a) * 100)}%` : ""}`;
const shortDate = (iso: string | null, is: boolean) => { if (!iso) return ""; try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

export default function PlayerBasketballGameReportCard({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Resp | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  async function fetchAi(sum: Summary, allStats: GroupedStat[] | null | undefined) {
    setAiBusy(true); setAiErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const facts = {
        season: data?.season ?? null,
        games: sum.games, ppg: sum.ppg, rpg: sum.rpg, apg: sum.apg, spg: sum.spg, bpg: sum.bpg, topg: sum.topg,
        fgPct: sum.fgPct, tpPct: sum.tpPct, ftPct: sum.ftPct, bestPts: sum.bestPts, shooting: sum.shooting,
        detail: allStats ? allStats.map((g) => ({ group: is ? g.title.is : g.title.en, rows: g.rows.slice(0, 10) })) : null,
      };
      const res = await fetch("/api/player/basketball-ai-summary", {
        method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "content-type": "application/json" },
        body: JSON.stringify({ facts, lang }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setAiErr(j.error ?? "Error"); return; }
      setAi(String(j.summary ?? ""));
    } catch (e) { setAiErr(e instanceof Error ? e.message : "Error"); } finally { setAiBusy(false); }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/player/basketball-game-report", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const j = (await res.json()) as Resp;
        if (alive) setData(res.ok ? j : null);
      } catch { if (alive) setData(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="mx-auto max-w-lg px-1 py-6 text-sm text-zinc-500">{t("Loading game report…", "Hleð leikjaskýrslu…")}</div>;
  if (!data || !data.isBasketball) return null; // football teams use the GPS report instead
  const games = data.games ?? [];
  const s = data.summary;
  if (games.length === 0 || !s) {
    return <div className="mx-auto max-w-lg px-1 py-6 text-sm text-zinc-500">{t("No game stats yet — they appear once your games are pulled from KKÍ.", "Engin leikjatölfræði enn — hún birtist þegar leikir þínir eru sóttir af KKÍ.")}</div>;
  }

  const tiles: Array<{ label: string; value: string }> = [
    { label: t("PPG", "Stig/leik"), value: String(s.ppg) },
    { label: t("RPG", "Frák/leik"), value: String(s.rpg) },
    { label: t("APG", "Stoð/leik"), value: String(s.apg) },
    { label: t("FG%", "Skot%"), value: `${s.fgPct}%` },
    { label: t("3P%", "3ja%"), value: `${s.tpPct}%` },
    { label: t("FT%", "Víti%"), value: `${s.ftPct}%` },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">{t("Your season — by game", "Tímabilið þitt — eftir leikjum")}</h2>
        <p className="text-xs text-zinc-500">{data.season ? `${data.season} · ` : ""}{t(`${s.games} games · basketball box score from KKÍ`, `${s.games} leikir · körfubolta box score frá KKÍ`)}</p>
      </div>

      {/* Season averages */}
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-center">
            <div className="text-lg font-bold tabular-nums text-zinc-900">{x.value}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{x.label}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-zinc-400">{t(`Season best: ${s.bestPts} pts · ${s.spg} steals & ${s.bpg} blocks per game.`, `Flest stig í leik: ${s.bestPts} · ${s.spg} stolnir & ${s.bpg} varin per leik.`)}</p>

      {/* Shooting splits — makes/attempts per game by shot type */}
      <div className="grid grid-cols-3 gap-2">
        {([
          [t("2PT per game", "2ja/leik"), s.shooting.two],
          [t("3PT per game", "3ja/leik"), s.shooting.three],
          [t("FT per game", "Víti/leik"), s.shooting.ft],
        ] as const).map(([label, v]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-center">
            <div className="text-[15px] font-bold tabular-nums text-zinc-900">{v.m}<span className="text-zinc-400">/</span>{v.a}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {/* AI season read — player-facing, labelled; what's working + one thing to work on, from the numbers. */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">AI</span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{t("reads your stats — not a score", "les tölurnar þínar — ekki einkunn")}</span>
          <button type="button" onClick={() => void fetchAi(s, data.allStats)} disabled={aiBusy}
            className="ml-auto rounded-lg border border-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
            {aiBusy ? t("Writing…", "Skrifa…") : ai ? t("↻ Again", "↻ Aftur") : t("✨ My season", "✨ Tímabilið mitt")}
          </button>
        </div>
        {aiErr ? <p className="mt-2 text-[12px] font-medium text-red-700">{aiErr}</p> : null}
        {ai ? (
          <div className="mt-2 space-y-2">
            {ai.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-zinc-700">
                {para.split(/\*\*(.+?)\*\*/).map((seg, j) => (j % 2 === 1 ? <strong key={j} className="font-semibold text-zinc-900">{seg}</strong> : seg))}
              </p>
            ))}
          </div>
        ) : !aiBusy ? (
          <p className="mt-2 text-[12px] text-zinc-500">{t("Get a short read of your season — what's working and one thing to work on.", "Fáðu stutta yfirferð á tímabilinu þínu — hvað gengur vel og eitt sem má bæta.")}</p>
        ) : null}
      </div>

      {/* Competition split — only when the player spans more than one team/competition (e.g. main + reserve). */}
      {s.byComp.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.byComp.map((c) => (
            <span key={c.label} className="inline-flex items-baseline gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px]">
              <span className="font-semibold text-zinc-700">{c.label}</span>
              <span className="text-zinc-400">·</span>
              <span className="tabular-nums text-zinc-500">{t(`${c.games} games`, `${c.games} leikir`)}</span>
              <span className="tabular-nums font-semibold text-zinc-800">{c.ppg} {t("ppg", "stig/l")}</span>
            </span>
          ))}
        </div>
      )}

      {/* Per-game table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[9px] uppercase tracking-wide text-zinc-400">
            <th className="px-2 py-1.5 font-medium">{t("Game", "Leikur")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Min", "Mín")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Pts", "Stig")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Reb", "Frák")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Ast", "Stoð")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">FG</th>
            <th className="px-1.5 py-1.5 text-right font-medium">3P</th>
            <th className="px-2 py-1.5 text-right font-medium">FT</th>
          </tr></thead>
          <tbody>
            {games.map((g, i) => (
              <tr key={`${g.date}-${i}`} className="border-t border-zinc-100">
                <td className="px-2 py-1.5">
                  <span className="font-semibold text-zinc-800">{g.opponent}</span>
                  {g.date && <span className="text-zinc-400"> · {shortDate(g.date, is)}</span>}
                  {s.byComp.length > 0 && <span className="ml-1.5 rounded border border-zinc-200 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{g.compLabel}</span>}
                </td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-zinc-500">{g.min ?? "–"}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums font-bold text-zinc-900">{g.pts}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums">{g.reb}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums">{g.ast}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-zinc-600">{fr(g.fgm, g.fga)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-zinc-600">{fr(g.tpm, g.tpa)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{fr(g.ftm, g.fta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-400">{t("Your own box score per game, from KKÍ (baskethotel). For motivation + self-review — never a readiness score.", "Þitt eigið box score per leik, frá KKÍ (baskethotel). Til hvatningar + sjálfsyfirferðar — aldrei readiness-stig.")}</p>

      {/* Show all stats — the player's OWN full InStat variable set (season per-game averages),
          grouped. Parity with the football players' "Show all stats". Only when InStat data exists. */}
      {data.allStats && data.allStats.length ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <button type="button" onClick={() => setShowAll((v) => !v)} className="flex w-full items-center gap-2 text-[13px] font-semibold text-zinc-900">
            <span className="text-zinc-400">{showAll ? "▾" : "▸"}</span>{t("Show all my stats (InStat)", "Sýna allar mínar tölur (InStat)")}
            <span className="text-[11px] font-normal text-zinc-400">· {t("season per-game averages", "meðaltöl á leik")}</span>
          </button>
          {showAll && (
            <div className="mt-2 space-y-2.5">
              {data.allStats.map((grp) => (
                <div key={grp.group}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{is ? grp.title.is : grp.title.en}</div>
                  <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    {grp.rows.map((r) => (
                      <div key={r.key} className="flex items-baseline justify-between gap-2 border-b border-zinc-50 py-0.5 text-[11.5px]">
                        <span className="truncate text-zinc-500">{labelFor(r.key, is ? "IS" : "EN")}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-zinc-800">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
