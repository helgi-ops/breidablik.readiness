"use client";

/**
 * PlayerBasketballGameReportCard — a basketball player's OWN per-game stats for the season, from the KKÍ
 * box scores (/api/player/basketball-game-report). The "Match" tab's football GPS report is empty for
 * basketball teams, so this is the basketball equivalent. Self-hides for non-basketball teams / no games.
 * Descriptive — never the readiness colour.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Game = {
  date: string; opponent: string; min: string | null; pts: number; reb: number; oreb: number; dreb: number;
  ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number;
  ftm: number; fta: number; pip: number; pm: number | null;
};
type Summary = { games: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; fgPct: number; tpPct: number; ftPct: number; bestPts: number };
type Resp = { ok: boolean; isBasketball?: boolean; games?: Game[]; summary?: Summary | null; error?: string };

const fr = (m: number, a: number) => `${m}-${a}${a > 0 ? ` · ${Math.round((m / a) * 100)}%` : ""}`;
const shortDate = (iso: string, is: boolean) => { try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

export default function PlayerBasketballGameReportCard({ lang }: { lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Resp | null>(null);

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
        <p className="text-xs text-zinc-500">{t(`${s.games} games · basketball box score from KKÍ`, `${s.games} leikir · körfubolta box score frá KKÍ`)}</p>
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
                <td className="px-2 py-1.5"><span className="font-semibold text-zinc-800">{g.opponent}</span> <span className="text-zinc-400">· {shortDate(g.date, is)}</span></td>
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
    </div>
  );
}
