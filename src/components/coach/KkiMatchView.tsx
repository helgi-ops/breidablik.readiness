"use client";

/**
 * KKÍ.is single-match view — paste the kki.is "Leikur" link and read the game straight from the free
 * baskethotel widget feed (the one FIBA LiveStats 403s on). Shows the box score for BOTH teams, the Four
 * Factors (Oliver 2004) and the KKÍ shot-chart image. Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { currentBasketballSeasonLabel } from "@/lib/micropulse/basketballStats/season";

type P = {
  name: string; ref: string | null; min: string | null; pts: number;
  fgM: number; fgA: number; threeM: number; threeA: number; ftM: number; ftA: number;
  oreb: number; dreb: number; reb: number; ast: number; fouls: number; to: number; stl: number; blk: number;
  eff: number | null; pm: number | null;
};
type FF = { efg: number; tovPct: number; orebPct: number; ftRate: number; tp3: number };
type Team = { name: string; players: P[]; totals: Record<string, number>; factors: FF | null };
type Quarters = { a: number[]; b: number[] };
type Adv = { label: string; a: string; b: string };
type Leader = { labelEn: string; labelIs: string; name: string; team: string; value: number };
type Resp = { ok: boolean; gameId?: string; seasonId?: string; teams?: Team[]; quarters?: Quarters | null; advanced?: Adv[]; leaders?: Leader[]; error?: string };

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fr = (m: number, a: number) => `${m}-${a}${a > 0 ? ` · ${Math.round((m / a) * 100)}%` : ""}`;

// Competition presets for persisting games. A reserve / lower-division side (whose players are on the main
// roster) is stored under the SAME team but tagged with its own code, so players who play both see all
// their games in one report while the league reads stay competition-scoped.
const COMP_OPTS: Array<{ code: string; en: string; is: string }> = [
  { code: "bonus-deild-kvenna", en: "Bónus deild (women, main)", is: "Bónus deild kvenna (aðallið)" },
  { code: "1deild-kvenna", en: "1. deild (women, reserve)", is: "1. deild kvenna (varalið)" },
  { code: "bonus-deild-karla", en: "Bónus deild (men, main)", is: "Bónus deild karla (aðallið)" },
  { code: "1deild-karla", en: "1. deild (men, reserve)", is: "1. deild karla (varalið)" },
];

export default function KkiMatchView({ defaultUrl }: { defaultUrl?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [url, setUrl] = React.useState(defaultUrl ?? "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Resp | null>(null);
  const [img, setImg] = React.useState<string | null>(null);
  const tok = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  // Persisting games (so they reach the player Match report + league reads).
  const [comp, setComp] = React.useState(COMP_OPTS[0].code);
  const [season, setSeason] = React.useState(currentBasketballSeasonLabel());
  const [ownName, setOwnName] = React.useState("");          // "" = auto-detect by roster overlap
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  // Bulk schedule pull.
  const [schedOpen, setSchedOpen] = React.useState(false);
  const [schedSeason, setSchedSeason] = React.useState("");
  const [schedStage, setSchedStage] = React.useState("");
  const [schedTeam, setSchedTeam] = React.useState("");
  const [schedBusy, setSchedBusy] = React.useState(false);
  const [schedMsg, setSchedMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const fetchGame = React.useCallback(async () => {
    const link = url.trim();
    if (!link) return;
    setBusy(true); setErr(null); setData(null); setImg((u) => { if (u) URL.revokeObjectURL(u); return null; });
    try {
      const token = await tok();
      if (!token) { setErr(t("Not signed in.", "Ekki innskráð(ur).")); return; }
      const res = await fetch(`/api/coach/basketball-kki?url=${encodeURIComponent(link)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const j = (await res.json()) as Resp;
      if (!res.ok || !j.ok) { setErr(j.error ?? t("Fetch failed.", "Sókn mistókst.")); return; }
      setData(j);
      // Shot-chart image (auth route → fetch as a blob, since <img> can't send the token).
      if (j.gameId && j.seasonId) {
        try {
          const ir = await fetch(`/api/coach/player-stats/shot-chart?gameId=${j.gameId}&seasonId=${j.seasonId}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (ir.ok) setImg(URL.createObjectURL(await ir.blob()));
        } catch { /* image is a bonus — the box still shows */ }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Network error", "Netvilla"));
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tok, is]);

  React.useEffect(() => () => { if (img) URL.revokeObjectURL(img); }, [img]);
  React.useEffect(() => { setSaveMsg(null); setOwnName(""); }, [data?.gameId]);

  const saveGame = React.useCallback(async () => {
    if (!data?.gameId || !data?.seasonId) return;
    setSaveBusy(true); setSaveMsg(null);
    try {
      const token = await tok();
      if (!token) { setSaveMsg({ ok: false, text: t("Not signed in.", "Ekki innskráð(ur).") }); return; }
      const res = await fetch("/api/coach/basketball-kki", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ save: true, gameId: data.gameId, seasonId: data.seasonId, competitionCode: comp, season: season.trim() || undefined, ownTeamName: ownName || undefined }),
      });
      const j = (await res.json()) as { ok: boolean; own?: string; opp?: string; error?: string };
      setSaveMsg(res.ok && j.ok
        ? { ok: true, text: t(`Saved — ${j.own} vs ${j.opp}. It will show in those players' Match reports.`, `Vistað — ${j.own} vs ${j.opp}. Birtist í leikjaskýrslu þeirra leikmanna.`) }
        : { ok: false, text: j.error ?? t("Save failed.", "Vistun mistókst.") });
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : t("Network error", "Netvilla") });
    } finally { setSaveBusy(false); }
  }, [data?.gameId, data?.seasonId, comp, season, ownName, tok, is]); // eslint-disable-line react-hooks/exhaustive-deps

  const pullSchedule = React.useCallback(async () => {
    const seasonId = schedSeason.trim();
    if (!/^\d+$/.test(seasonId)) { setSchedMsg({ ok: false, text: t("Enter a numeric season_id.", "Sláðu inn tölulegt season_id.") }); return; }
    setSchedBusy(true); setSchedMsg(null);
    try {
      const token = await tok();
      if (!token) { setSchedMsg({ ok: false, text: t("Not signed in.", "Ekki innskráð(ur).") }); return; }
      const res = await fetch("/api/coach/basketball-kki", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ pullSchedule: true, seasonId, stageId: schedStage.trim() || undefined, competitionCode: comp, season: season.trim() || undefined, teamName: schedTeam.trim() || undefined }),
      });
      const j = (await res.json()) as { ok: boolean; found?: number; imported?: number; failed?: number; error?: string };
      setSchedMsg(res.ok && j.ok
        ? { ok: true, text: t(`Imported ${j.imported}/${j.found} games (${j.failed} failed). They now appear in players' Match reports.`, `Sótti ${j.imported}/${j.found} leiki (${j.failed} mistókust). Birtast nú í leikjaskýrslum leikmanna.`) }
        : { ok: false, text: j.error ?? t("Schedule pull failed.", "Mótsókn mistókst.") });
    } catch (e) {
      setSchedMsg({ ok: false, text: e instanceof Error ? e.message : t("Network error", "Netvilla") });
    } finally { setSchedBusy(false); }
  }, [schedSeason, schedStage, schedTeam, comp, season, tok, is]); // eslint-disable-line react-hooks/exhaustive-deps

  const teams = data?.teams ?? [];
  const quarters = data?.quarters ?? null;
  const advanced = data?.advanced ?? [];
  const leaders = data?.leaders ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void fetchGame(); }}
          placeholder="https://kki.is/…/Leikur?…&game_id=…"
          className="h-10 min-w-[320px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[13px]" />
        <button type="button" onClick={() => void fetchGame()} disabled={busy}
          className="h-10 rounded-lg bg-[#2740e6] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
          {busy ? t("Fetching…", "Sæki…") : t("Fetch", "Sækja")}
        </button>
      </div>
      <p className="text-[12px] text-slate-500">{t("Paste the kki.is match link (…/Leikur?…game_id=…). We read the public KKÍ feed — box score, Four Factors and the shot chart for both teams.", "Límdu kki.is leikhlekkinn (…/Leikur?…game_id=…). Við lesum opna KKÍ-fóðrið — box score, Four Factors og skotakort beggja liða.")}</p>

      {/* Persist games into the season so they reach the player Match report. A reserve / lower-division
          side (players on the main roster) is stored under the same team, tagged with its own competition. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] font-semibold text-slate-700">{t("Competition", "Mót / deild")}</label>
          <select value={comp} onChange={(e) => setComp(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]">
            {COMP_OPTS.map((o) => <option key={o.code} value={o.code}>{is ? o.is : o.en}</option>)}
          </select>
          <label className="text-[12px] font-semibold text-slate-700">{t("Season", "Tímabil")}</label>
          <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2026-27"
            className="h-9 w-24 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]" />
          <button type="button" onClick={() => setSchedOpen((v) => !v)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[12.5px] font-medium text-slate-700">
            {schedOpen ? t("Hide season import", "Fela mótsinnflutning") : t("Import a whole season →", "Flytja inn heilt tímabil →")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">{t("Pick the competition, then save a single game below — or import a whole season (e.g. the reserve team's 1. deild) in one go.", "Veldu deildina, vistaðu svo stakan leik hér fyrir neðan — eða flyttu inn heilt tímabil (t.d. 1. deild varaliðsins) í einu.")}</p>

        {schedOpen && (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">season_id</div>
                <input value={schedSeason} onChange={(e) => setSchedSeason(e.target.value)} placeholder="t.d. 300471"
                  className="h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">stage_id {t("(opt.)", "(valkv.)")}</div>
                <input value={schedStage} onChange={(e) => setSchedStage(e.target.value)} placeholder={t("regular", "deildarkeppni")}
                  className="h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{t("Team in schedule", "Lið í leikjaskrá")}</div>
                <input value={schedTeam} onChange={(e) => setSchedTeam(e.target.value)} placeholder={t("defaults to your team", "sjálfgefið þitt lið")}
                  className="h-9 w-44 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]" />
              </div>
              <button type="button" onClick={() => void pullSchedule()} disabled={schedBusy}
                className="h-9 rounded-lg bg-[#2740e6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">
                {schedBusy ? t("Importing…", "Flyt inn…") : t("Import season", "Flytja inn tímabil")}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">{t("The season_id is in the kki.is standings/schedule URL (season_id=…). We pull the schedule, find your team's finished games and store each box score under the competition above.", "season_id er í kki.is töflu-/leikjaskrár-hlekknum (season_id=…). Við sækjum leikjaskrána, finnum kláraða leiki liðsins og vistum hvert box score undir deildinni hér að ofan.")}</p>
            {schedMsg && <div className={`mt-1.5 rounded-lg px-3 py-2 text-[12.5px] ${schedMsg.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-700"}`}>{schedMsg.text}</div>}
          </div>
        )}
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

      {teams.length > 0 && (
        <>
          {/* SAVE this game into the season (so it reaches the players' Match reports). */}
          <section className="rounded-xl border border-[#2740e6]/30 bg-[#2740e6]/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-slate-800">{t("Save this game", "Vista þennan leik")}</span>
              <span className="text-[12px] text-slate-500">{t("as", "sem")}</span>
              <span className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] font-medium text-slate-700">{is ? COMP_OPTS.find((o) => o.code === comp)?.is : COMP_OPTS.find((o) => o.code === comp)?.en}</span>
              {teams.length === 2 && (
                <>
                  <span className="text-[12px] text-slate-500">· {t("our team:", "okkar lið:")}</span>
                  <select value={ownName} onChange={(e) => setOwnName(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[12.5px]">
                    <option value="">{t("auto (by roster)", "sjálfvirkt (eftir leikmönnum)")}</option>
                    {teams.map((tm) => <option key={tm.name} value={tm.name}>{tm.name}</option>)}
                  </select>
                </>
              )}
              <button type="button" onClick={() => void saveGame()} disabled={saveBusy}
                className="h-9 rounded-lg bg-[#2740e6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">
                {saveBusy ? t("Saving…", "Vista…") : t("Save game", "Vista leik")}
              </button>
            </div>
            {saveMsg && <div className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] ${saveMsg.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-700"}`}>{saveMsg.text}</div>}
          </section>

          {/* QUARTER-BY-QUARTER line score */}
          {quarters && quarters.a.length > 0 && teams.length === 2 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{t("By quarter", "Eftir leikhlutum")}</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2 font-medium">{t("Team", "Lið")}</th>
                    {quarters.a.map((_, i) => <th key={i} className="py-1 px-2 text-right font-medium">{t(`Q${i + 1}`, `${i + 1}.`)}</th>)}
                    <th className="py-1 pl-2 text-right font-medium">{t("Final", "Loka")}</th>
                  </tr></thead>
                  <tbody>
                    {([[teams[0].name, quarters.a], [teams[1].name, quarters.b]] as const).map(([name, qs]) => (
                      <tr key={name} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 font-semibold text-slate-800">{name}</td>
                        {qs.map((v, i) => <td key={i} className="py-1.5 px-2 text-right tabular-nums text-slate-700">{v}</td>)}
                        <td className="py-1.5 pl-2 text-right tabular-nums font-bold">{qs.reduce((s, v) => s + v, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* STAT LEADERS */}
          {leaders.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{t("Leaders", "Leiðtogar")}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {leaders.map((l) => (
                  <div key={l.labelEn} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{is ? l.labelIs : l.labelEn}</div>
                    <div className="text-[12.5px]"><span className="font-bold tabular-nums text-slate-900">{l.value}</span> <span className="font-semibold text-slate-800">{l.name}</span> <span className="text-slate-400">· {l.team}</span></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FOUR FACTORS — both teams side by side */}
          {teams.length === 2 && teams.every((tm) => tm.factors) && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{t("Four Factors", "Fjórir þættir")}</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2 font-medium">{t("Factor", "Þáttur")}</th>
                    {teams.map((tm) => <th key={tm.name} className="py-1 px-2 text-right font-medium">{tm.name}</th>)}
                  </tr></thead>
                  <tbody>
                    {([
                      ["efg", t("eFG%", "eFG%"), true],
                      ["tp3", t("3-point %", "3ja stiga %"), true],
                      ["tovPct", t("Turnover %", "Tapaðir %"), false],
                      ["orebPct", t("Off. rebound %", "Sóknarfráköst %"), true],
                      ["ftRate", t("FT rate (FTM/FGA)", "Vítasókn (FTM/FGA)"), true],
                    ] as const).map(([k, label, hib]) => {
                      const vals = teams.map((tm) => (tm.factors as FF)[k]);
                      const best = hib ? Math.max(...vals) : Math.min(...vals);
                      return (
                        <tr key={k} className="border-t border-slate-100">
                          <td className="py-1.5 pr-2 text-slate-600">{label}</td>
                          {teams.map((tm, i) => (
                            <td key={tm.name} className={`py-1.5 px-2 text-right tabular-nums ${vals[i] === best ? "font-bold text-[#1c7a4a]" : "text-slate-800"}`}>{pct(vals[i])}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">{t("Oliver 2004 · green = the better team on that factor. Descriptive — never the readiness colour.", "Oliver 2004 · grænt = betra liðið í þeim þætti. Lýsandi — aldrei readiness-liturinn.")}</p>
            </section>
          )}

          {/* BOX SCORE per team */}
          {teams.map((tm) => (
            <section key={tm.name} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[14px] font-bold text-slate-900">{tm.name}</h3>
                <span className="text-[13px] font-bold tabular-nums text-slate-700">{tm.totals.pts} {t("pts", "stig")}</span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2 font-medium">{t("Player", "Leikmaður")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("Min", "Mín")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("Pts", "Stig")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">FG</th>
                    <th className="py-1 px-1.5 text-right font-medium">3P</th>
                    <th className="py-1 px-1.5 text-right font-medium">FT</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("Reb", "Frák")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("Ast", "Stoð")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("Stl", "Stol")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("Blk", "Varin")}</th>
                    <th className="py-1 px-1.5 text-right font-medium">{t("TO", "Tap")}</th>
                    <th className="py-1 pl-1.5 text-right font-medium">PF</th>
                  </tr></thead>
                  <tbody>
                    {tm.players.map((p) => (
                      <tr key={`${p.ref ?? p.name}`} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-medium text-slate-800">{p.name}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums text-slate-500">{p.min ?? "–"}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums font-semibold">{p.pts}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums text-slate-600">{fr(p.fgM, p.fgA)}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums text-slate-600">{fr(p.threeM, p.threeA)}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums text-slate-600">{fr(p.ftM, p.ftA)}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums">{p.reb}<span className="text-slate-400"> ({p.oreb}/{p.dreb})</span></td>
                        <td className="py-1 px-1.5 text-right tabular-nums">{p.ast}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums">{p.stl}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums">{p.blk}</td>
                        <td className="py-1 px-1.5 text-right tabular-nums">{p.to}</td>
                        <td className="py-1 pl-1.5 text-right tabular-nums text-slate-500">{p.fouls}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 font-semibold">
                      <td className="py-1 pr-2">{t("Team", "Lið")}</td>
                      <td />
                      <td className="py-1 px-1.5 text-right tabular-nums">{tm.totals.pts}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{fr(tm.totals.fgM, tm.totals.fgA)}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{fr(tm.totals.threeM, tm.totals.threeA)}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{fr(tm.totals.ftM, tm.totals.ftA)}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{tm.totals.reb}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{tm.totals.ast}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{tm.totals.stl}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{tm.totals.blk}</td>
                      <td className="py-1 px-1.5 text-right tabular-nums">{tm.totals.to}</td>
                      <td className="py-1 pl-1.5 text-right tabular-nums">{tm.totals.fouls}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {/* ADVANCED STATS — KKÍ team comparison (Ítarleg tölfræði) */}
          {advanced.length > 0 && teams.length === 2 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{t("Advanced stats", "Ítarleg tölfræði")}</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2 font-medium">{t("Stat", "Þáttur")}</th>
                    <th className="py-1 px-2 text-right font-medium">{teams[0].name}</th>
                    <th className="py-1 pl-2 text-right font-medium">{teams[1].name}</th>
                  </tr></thead>
                  <tbody>
                    {advanced.map((r) => (
                      <tr key={r.label} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-600">{r.label}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-slate-800">{r.a}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums text-slate-800">{r.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">{t("From KKÍ (baskethotel) — Ítarleg tölfræði. Descriptive — never the readiness colour.", "Úr KKÍ (baskethotel) — Ítarleg tölfræði. Lýsandi — aldrei readiness-liturinn.")}</p>
            </section>
          )}

          {/* SHOT CHART image (KKÍ render) */}
          {img && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{t("Shot chart (both teams)", "Skotakort (bæði lið)")}</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={t("KKÍ shot chart", "KKÍ skotakort")} className="mt-2 max-w-full rounded-lg border border-slate-100" />
              <p className="mt-1 text-[10px] text-slate-400">{t("Rendered by KKÍ (baskethotel). Descriptive — never the readiness colour.", "Teiknað af KKÍ (baskethotel). Lýsandi — aldrei readiness-liturinn.")}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
