"use client";

/**
 * KKÍ.is single-match view — paste the kki.is "Leikur" link and read the game straight from the free
 * baskethotel widget feed (the one FIBA LiveStats 403s on). Shows the box score for BOTH teams, the Four
 * Factors (Oliver 2004) and the KKÍ shot-chart image. Descriptive — never the readiness colour.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

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
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{err}</div>}

      {teams.length > 0 && (
        <>
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
