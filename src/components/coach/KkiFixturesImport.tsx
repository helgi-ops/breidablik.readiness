"use client";

/**
 * KkiFixturesImport — import a team's fixtures (leikjaplan) from a KKÍ.is team-season link. Paste the
 * link → preview the upcoming games (date, opponent, home/away) → confirm → they upsert into
 * match_schedule (the schedule the periodization/week-setup already read). Descriptive import.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Game = { gameId: string; date: string; homeTeam: string; awayTeam: string; finished: boolean };
type Fixture = { date: string; opponent: string; isHome: boolean };

export default function KkiFixturesImport({ onImported }: { onImported?: () => void }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [games, setGames] = React.useState<Game[] | null>(null);
  const [teams, setTeams] = React.useState<string[]>([]);
  const [team, setTeam] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set()); // selected fixture dates
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const todayIso = new Date().toISOString().slice(0, 10);
  // Upcoming fixtures for the chosen team: not finished, today or later, our team is in it.
  const fixtures: Fixture[] = React.useMemo(() => {
    if (!games || !team) return [];
    return games
      .filter((g) => !g.finished && g.date >= todayIso && (g.homeTeam === team || g.awayTeam === team))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => ({ date: g.date, opponent: g.homeTeam === team ? g.awayTeam : g.homeTeam, isHome: g.homeTeam === team }));
  }, [games, team, todayIso]);

  React.useEffect(() => { setPicked(new Set(fixtures.map((f) => f.date))); }, [fixtures]);

  async function preview() {
    setErr(null); setMsg(null); setGames(null); setBusy(true);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/fixtures-kki", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setGames(j.games as Game[]);
      setTeams(j.teams as string[]);
      setTeam(j.suggestedTeam ?? "");
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function commit() {
    const chosen = fixtures.filter((f) => picked.has(f.date));
    if (!chosen.length) { setErr(is ? "Veldu a.m.k. einn leik." : "Pick at least one game."); return; }
    setErr(null); setMsg(null); setBusy(true);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/fixtures-kki", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ commit: true, fixtures: chosen }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setMsg(is ? `${j.imported} leikir fluttir í leikjaplanið.` : `${j.imported} fixtures imported into the schedule.`);
      setGames(null); setUrl("");
      onImported?.();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  const toggle = (d: string) => setPicked((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n; });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[12px] font-semibold text-slate-700">{is ? "Flytja inn leikjaplan úr KKÍ" : "Import fixtures from KKÍ"}</div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={is ? "KKÍ liðs-hlekkur (…Eitt-lid?season_id=…&team_id=…)" : "KKÍ team link (…Eitt-lid?season_id=…&team_id=…)"}
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-[13px]" />
        <button type="button" disabled={busy || !url.trim()} onClick={() => void preview()} className="h-10 rounded-lg border border-[#2740e6] bg-white px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-40">{busy && !games ? "…" : (is ? "Lesa plan" : "Read schedule")}</button>
      </div>
      {err ? <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p> : null}
      {msg ? <p className="mt-2 text-[12px] font-medium text-emerald-700">{msg}</p> : null}
      {!games ? (
        <p className="mt-1.5 text-[11px] text-slate-400">{is ? "Límdu KKÍ „Eitt lið“ hlekkinn (allt tímabilið). Komandi leikir birtast til staðfestingar áður en þeir fara í leikjaplanið." : "Paste the KKÍ \"one team\" link (the whole season). The upcoming games are shown for confirmation before they go into the schedule."}</p>
      ) : (
        <div className="mt-3">
          <label className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-slate-700">{is ? "Þitt lið" : "Your team"}
            <select value={team} onChange={(e) => setTeam(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px] font-medium">
              <option value="">{is ? "Veldu lið…" : "Pick a team…"}</option>
              {teams.map((tn) => <option key={tn} value={tn}>{tn}</option>)}
            </select>
          </label>
          {team && fixtures.length === 0 ? (
            <p className="mt-2 text-[12px] text-slate-500">{is ? "Engir komandi leikir fundust fyrir þetta lið (allir búnir?)." : "No upcoming games found for this team (all finished?)."}</p>
          ) : null}
          {fixtures.length > 0 ? (
            <>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2 font-medium"></th><th className="py-1 pr-2 font-medium">{is ? "Dags" : "Date"}</th>
                    <th className="py-1 pr-2 font-medium">{is ? "Andstæðingur" : "Opponent"}</th><th className="py-1 pr-2 font-medium">{is ? "H/Ú" : "H/A"}</th>
                  </tr></thead>
                  <tbody>
                    {fixtures.map((f) => (
                      <tr key={f.date} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2"><input type="checkbox" checked={picked.has(f.date)} onChange={() => toggle(f.date)} /></td>
                        <td className="py-1.5 pr-2 tabular-nums text-slate-600">{f.date}</td>
                        <td className="py-1.5 pr-2 font-semibold text-slate-900">{f.opponent}</td>
                        <td className="py-1.5 pr-2 text-slate-500">{f.isHome ? (is ? "Heima" : "Home") : (is ? "Úti" : "Away")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" disabled={busy || picked.size === 0} onClick={() => void commit()} className="mt-2 h-10 rounded-lg bg-[#2740e6] px-3 text-[13px] font-semibold text-white hover:bg-[#1e34c0] disabled:opacity-40">
                {busy ? "…" : (is ? `Flytja inn ${picked.size} leiki →` : `Import ${picked.size} fixtures →`)}
              </button>
              <p className="mt-1.5 text-[11px] text-slate-400">{is ? "Upsert í leikjaplanið (match_schedule) — býr til GAME-daga. Snertir ekki liðna leiki. Keppnisleikir (ekki æfingaleikir)." : "Upserts into the schedule (match_schedule) — creates GAME days. Past games untouched. Competitive fixtures (not friendlies)."}</p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
