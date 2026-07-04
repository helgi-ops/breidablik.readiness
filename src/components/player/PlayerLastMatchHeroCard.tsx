"use client";

/**
 * PlayerLastMatchHeroCard — one compact, celebratory "Your last match" card for
 * the player Home (the `today` tab). Hero = top speed from his most recent GPS
 * match, one plain sentence, an optional season-best pill, and a "See full
 * report →" that switches to the existing `gamereport` tab. Deep detail lives
 * there — this is the glance in the layered read (progressive disclosure).
 *
 * Self-scoped: reuses /api/player/game-report (player_id from auth, his own data
 * only). Hides itself entirely when he has no GPS match — never an empty state.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ShareMatchButton from "./ShareMatchButton";
import type { ShareStats } from "@/lib/micropulse/shareCard/pickHeroStat";

type Raw = { top_speed_kmh?: number; total_distance?: number; sprint?: number };
type Match = { date: string; opponent: string | null; is_home?: boolean | null; minutes: number; has_gps: boolean; raw?: Raw | null };
type ClubInfo = { name: string; themeColor: string | null; logoUrl: string | null };
type Report = { summary: { best_top_speed_kmh: number }; matches: Match[]; club?: ClubInfo; player?: { full_name?: string } };

const clampSpeed = (v: number | undefined) => (typeof v === "number" && v > 0 && v <= 45 ? v : 0);
const toStats = (m: Match): ShareStats => ({ topSpeed: clampSpeed(m.raw?.top_speed_kmh), distance: m.raw?.total_distance ?? 0, sprints: m.raw?.sprint ?? 0 });

const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

export default function PlayerLastMatchHeroCard({ lang = "IS", onSeeReport }: { lang?: "IS" | "EN"; onSeeReport: () => void }) {
  const isIS = lang === "IS";
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/player/game-report`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        if (!alive) return;
        if (res.ok) setReport(await res.json());
      } catch {
        /* silent — the card simply hides itself if data can't load */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading || !report) return null;

  // Most recent match that actually carries a GPS top speed. Skipping matches
  // without GPS (indoor / no vests) means we never render a blank/000 hero.
  const last = [...report.matches]
    .filter((m) => m.has_gps && m.raw && (m.raw.top_speed_kmh ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return null; // no GPS match this season → hide, no empty state

  const top = last.raw!.top_speed_kmh ?? 0;
  const distKm = (last.raw!.total_distance ?? 0) / 1000;
  const best = report.summary.best_top_speed_kmh ?? 0;
  // Season-best when this match's peak ties the season max (rounded to 0.1 km/h).
  const isSeasonBest = top > 0 && Math.round(top * 10) >= Math.round(best * 10);

  const allMatches = report.matches.filter((m) => m.has_gps && m.raw).map(toStats);
  const club = report.club ?? { name: "", themeColor: null, logoUrl: null };

  const vs = last.opponent ? (isIS ? ` gegn ${last.opponent}` : ` against ${last.opponent}`) : "";
  const homeAway = last.is_home == null ? "" : last.is_home ? (isIS ? " (heima)" : " (home)") : (isIS ? " (úti)" : " (away)");
  const sentence = distKm > 0
    ? (isIS ? `Þú hljópst ${f1(distKm)} km og náðir ${f1(top)} km/h${vs}${homeAway}.` : `You covered ${f1(distKm)} km and hit ${f1(top)} km/h${vs}${homeAway}.`)
    : (isIS ? `Þú náðir ${f1(top)} km/h${vs}${homeAway}.` : `You hit ${f1(top)} km/h${vs}${homeAway}.`);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{isIS ? "Síðasti leikur" : "Your last match"}</div>
        {isSeasonBest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            ⚡ {isIS ? "Árstíðar-best" : "Season best"}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tracking-tight text-zinc-900 tabular-nums">{f1(top)}</span>
        <span className="text-base font-semibold text-zinc-500">km/h</span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{sentence}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSeeReport}
          className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-800"
        >
          {isIS ? "Sjá heildarskýrslu" : "See full report"} →
        </button>
        <ShareMatchButton
          lang={isIS ? "IS" : "EN"}
          club={club}
          playerName={report.player?.full_name ?? ""}
          match={{ date: last.date, opponent: last.opponent, ...toStats(last) }}
          allMatches={allMatches}
        />
      </div>
    </div>
  );
}
