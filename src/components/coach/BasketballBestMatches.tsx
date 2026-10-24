"use client";

/**
 * BasketballBestMatches — the team's best games of the current season, ranked by scoring margin, from the
 * stored KKÍ box scores (/api/coach/basketball-best-matches). The basketball counterpart to the football
 * Best Match Analysis. Descriptive — never the readiness colour. Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Game = {
  gameId: string; date: string | null; opponent: string; competition: string | null;
  ownPts: number; oppPts: number; margin: number | null; result: "W" | "L" | "T" | null;
  efgPct: number | null; fgPct: number | null; tpPct: number | null; ftPct: number | null;
  reb: number; ast: number; stl: number; tov: number; tpm: number;
  topScorer: { name: string; pts: number } | null;
};
type Resp = { ok: boolean; hasData?: boolean; season?: string | null; games?: Game[]; record?: { wins: number; losses: number; avgMargin: number | null } | null; error?: string };

const compLabel = (c: string | null): string => {
  switch ((c ?? "").toLowerCase()) {
    case "urvalsdeild-kvenna": case "urvalsdeild-karla": return "Úrvalsdeild";
    case "bonus-deild-karla": case "bonus-deild-kvenna": return "Bónus deild";
    case "1deild-kvenna": case "1deild-karla": return "1. deild";
    default: return c ?? "";
  }
};
const fmtDate = (iso: string | null, is: boolean) => { if (!iso) return ""; try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

export default function BasketballBestMatches() {
  const [lang] = useLang();
  const is = lang === "IS";
  const t = (en: string, isl: string) => (is ? isl : en);
  const [data, setData] = React.useState<Resp | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "empty" | "error">("loading");
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
        if (!token) { if (live) { setErr(t("Not signed in.", "Ekki innskráð(ur).")); setState("error"); } return; }
        const res = await fetch("/api/coach/basketball-best-matches", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = (await res.json()) as Resp;
        if (!live) return;
        if (!res.ok || !j.ok) { setErr(j.error ?? t("Load failed.", "Hleðsla mistókst.")); setState("error"); return; }
        setData(j); setState(j.hasData ? "ready" : "empty");
      } catch (e) { if (live) { setErr(e instanceof Error ? e.message : t("Network error", "Netvilla")); setState("error"); } }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [is]);

  if (state === "loading") return <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-[13px] text-slate-500">{t("Loading…", "Hleð…")}</div>;
  if (state === "error") return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{err}</div>;
  if (state === "empty") return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-[13px] text-slate-600">
      {t("No basketball games saved for the current season yet. Save games on Single Match Analysis → KKÍ.is.", "Engir körfubolta-leikir vistaðir fyrir yfirstandandi tímabil enn. Vistaðu leiki á Single Match Analysis → KKÍ.is.")}
    </div>
  );

  const games = data?.games ?? [];
  const rec = data?.record;
  const chip = (g: Game) => g.result === "W" ? "bg-[#1c7a4a]" : g.result === "L" ? "bg-[#a83e28]" : "bg-slate-400";

  return (
    <div className="space-y-4">
      {rec && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[13px] font-semibold text-slate-800">{t("Season", "Tímabil")} {data?.season ?? ""}</span>
          <span className="text-[13px] tabular-nums text-slate-600">{rec.wins}{t("W", "S")} – {rec.losses}{t("L", "T")}</span>
          {rec.avgMargin != null && <span className="text-[12px] text-slate-500">{t("avg margin", "meðalmunur")} <span className={`font-semibold tabular-nums ${rec.avgMargin >= 0 ? "text-[#1c7a4a]" : "text-[#a83e28]"}`}>{rec.avgMargin > 0 ? "+" : ""}{rec.avgMargin}</span></span>}
          <span className="text-[12px] text-slate-400">· {t("ranked by margin, best first", "raðað eftir mun, bestu efst")}</span>
        </div>
      )}

      <div className="space-y-2.5">
        {games.map((g, i) => (
          <div key={g.gameId || i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-5 text-[12px] font-bold tabular-nums text-slate-400">{i + 1}</span>
              <span className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1.5 text-[11px] font-bold text-white ${chip(g)}`}>{g.result ?? "–"}</span>
              <span className="text-[15px] font-bold tabular-nums text-slate-900">{g.ownPts}<span className="text-slate-400">–</span>{g.oppPts}</span>
              <span className="text-[13px] font-semibold text-slate-700">{t("vs", "gegn")} {g.opponent}</span>
              {g.margin != null && <span className={`text-[12px] font-semibold tabular-nums ${g.margin >= 0 ? "text-[#1c7a4a]" : "text-[#a83e28]"}`}>{g.margin > 0 ? "+" : ""}{g.margin}</span>}
              <span className="ml-auto text-[11px] text-slate-400">{fmtDate(g.date, is)}{g.competition ? ` · ${compLabel(g.competition)}` : ""}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
              {g.efgPct != null && <span>eFG% <b className="tabular-nums text-slate-800">{g.efgPct}%</b></span>}
              {g.fgPct != null && <span>FG% <b className="tabular-nums text-slate-800">{g.fgPct}%</b></span>}
              {g.tpPct != null && <span>3P% <b className="tabular-nums text-slate-800">{g.tpPct}%</b> ({g.tpm})</span>}
              <span>{t("Reb", "Frák")} <b className="tabular-nums text-slate-800">{g.reb}</b></span>
              <span>{t("Ast", "Stoð")} <b className="tabular-nums text-slate-800">{g.ast}</b></span>
              <span>{t("TO", "Tap")} <b className="tabular-nums text-slate-800">{g.tov}</b></span>
              {g.topScorer && <span className="text-slate-500">· {t("top", "efstur")}: <b className="text-slate-800">{g.topScorer.name}</b> {g.topScorer.pts}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">{t("Own games this season from KKÍ box scores, ranked by scoring margin. Descriptive — never the readiness colour.", "Eigin leikir tímabilsins úr KKÍ box-skorum, raðað eftir stigamun. Lýsandi — aldrei readiness-liturinn.")}</p>
    </div>
  );
}
