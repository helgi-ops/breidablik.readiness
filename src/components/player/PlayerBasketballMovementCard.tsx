"use client";

/**
 * PlayerBasketballMovementCard — the player's OWN indoor movement from Titan IMU (/api/player/
 * basketball-movement): PlayerLoad, load/min, jumps and time-in-intensity per session. Basketball has no
 * GPS, so this is the movement read in place of the football match-movement.
 *   mode="gameday" → the Game tab: sessions on the team's game days (per game).
 *   mode="all"     → the Movement tab: the whole season's sessions + a game-vs-training compare.
 * Self-hides for non-basketball teams / no Titan data. Descriptive — never the readiness colour.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Session = {
  date: string; playerLoad: number | null; loadPerMin: number | null; durationMin: number | null; jumps: number | null; impacts: number | null;
  highMin: number | null; isGameDay: boolean; opponent: string | null;
};
type Summary = { sessions: number; games: number; trainings: number; avgPlayerLoad: number | null; avgLoadPerMin: number | null; avgJumps: number | null; gameAvgPL: number | null; trainAvgPL: number | null; peakPlayerLoad: number | null };
type Resp = { ok: boolean; isBasketball?: boolean; sessions?: Session[]; summary?: Summary | null; error?: string };

const shortDate = (iso: string, is: boolean) => { if (!iso) return ""; try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };
const num = (v: number | null) => (v == null ? "–" : String(v));

export default function PlayerBasketballMovementCard({ lang, mode }: { lang: "IS" | "EN"; mode: "gameday" | "all" }) {
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/player/basketball-movement", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const j = (await res.json()) as Resp;
        if (alive) setData(res.ok ? j : null);
      } catch { if (alive) setData(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="mx-auto max-w-lg px-1 py-6 text-sm text-zinc-500">{t("Loading movement…", "Hleð hreyfingu…")}</div>;
  if (!data || !data.isBasketball) return null; // football teams use the GPS movement card instead
  const all = data.sessions ?? [];
  const s = data.summary;
  const rows = mode === "gameday" ? all.filter((x) => x.isGameDay) : all;

  if (rows.length === 0 || !s) {
    return (
      <div className="mx-auto max-w-lg px-1 py-6 text-sm text-zinc-500">
        {mode === "gameday"
          ? t("No game-day movement yet — it appears when a Titan session lands on a game day.", "Engin hreyfing á leikdegi enn — hún birtist þegar Titan-æfing lendir á leikdegi.")
          : t("No movement data yet — it appears once your Titan sessions are synced.", "Engin hreyfigögn enn — þau birtast þegar Titan-æfingarnar þínar eru samstilltar.")}
      </div>
    );
  }

  const Tile = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-center">
      <div className="text-lg font-bold tabular-nums text-zinc-900">{value}{unit ? <span className="ml-0.5 text-[11px] font-medium text-zinc-400">{unit}</span> : null}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg space-y-4 px-1">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">{mode === "gameday" ? t("Movement — game days", "Hreyfing — leikdagar") : t("Movement — the season", "Hreyfing — tímabilið")}</h2>
        <p className="text-xs text-zinc-500">{mode === "gameday"
          ? t(`${rows.length} game days · Titan indoor IMU`, `${rows.length} leikdagar · Titan innanhúss-IMU`)
          : t(`${s.sessions} sessions (${s.games} games · ${s.trainings} training) · Titan indoor IMU`, `${s.sessions} æfingar (${s.games} leikir · ${s.trainings} æfingar) · Titan innanhúss-IMU`)}</p>
      </div>

      {/* Overview tiles */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t("PlayerLoad", "PlayerLoad")} value={num(mode === "gameday" ? s.gameAvgPL : s.avgPlayerLoad)} />
        <Tile label={t("Load/min", "Álag/mín")} value={num(s.avgLoadPerMin)} />
        <Tile label={t("Jumps", "Stökk")} value={num(s.avgJumps)} />
      </div>
      {mode === "all" && s.gameAvgPL != null && s.trainAvgPL != null && (
        <p className="text-[11px] text-zinc-400">{t(`Game days average ${s.gameAvgPL} PlayerLoad vs ${s.trainAvgPL} in training · season peak ${num(s.peakPlayerLoad)}.`, `Leikdagar að meðaltali ${s.gameAvgPL} PlayerLoad móti ${s.trainAvgPL} á æfingum · hæst ${num(s.peakPlayerLoad)} á tímabilinu.`)}</p>
      )}

      {/* Per-session table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[9px] uppercase tracking-wide text-zinc-400">
            <th className="px-2 py-1.5 font-medium">{mode === "gameday" ? t("Game", "Leikur") : t("Session", "Æfing")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Load", "Álag")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("/min", "/mín")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Min", "Mín")}</th>
            <th className="px-1.5 py-1.5 text-right font-medium">{t("Jumps", "Stökk")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("High", "Ákefð")}</th>
          </tr></thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={`${g.date}-${i}`} className="border-t border-zinc-100">
                <td className="px-2 py-1.5">
                  {g.isGameDay && g.opponent ? <span className="font-semibold text-zinc-800">{g.opponent}</span> : <span className="text-zinc-600">{t("Training", "Æfing")}</span>}
                  <span className="text-zinc-400"> · {shortDate(g.date, is)}</span>
                  {mode === "all" && g.isGameDay && <span className="ml-1.5 rounded border border-zinc-200 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{t("Game", "Leikur")}</span>}
                </td>
                <td className="px-1.5 py-1.5 text-right tabular-nums font-bold text-zinc-900">{num(g.playerLoad)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-zinc-600">{num(g.loadPerMin)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-zinc-500">{num(g.durationMin)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums">{num(g.jumps)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-zinc-600">{g.highMin == null ? "–" : `${g.highMin}m`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-400">{t("Indoor IMU movement from Titan — PlayerLoad, load/min, jumps and time in high intensity. No GPS indoors. Descriptive — never a readiness score.", "Innanhúss-hreyfing frá Titan — PlayerLoad, álag/mín, stökk og tími í hárri ákefð. Enginn GPS innandyra. Lýsandi — aldrei readiness-stig.")}</p>
    </div>
  );
}
