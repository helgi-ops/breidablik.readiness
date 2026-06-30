"use client";

export const dynamic = "force-dynamic";

/**
 * Post-match recovery board — for one match, every player who played and their
 * canonical readiness colour across MD+1 → MD+N, so the coach sees who rebounded
 * by MD+2 (Nédélec 2012) and who is lagging. Visual, print-friendly.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { formatMatchLabel } from "@/lib/micropulse/matchLabel";
import VerdictBanner, { type VerdictTone, type ConfidenceLevel, type VerdictDriver } from "@/components/coach/VerdictBanner";
import RecoveryWatchBanner from "@/components/coach/RecoveryWatchBanner";

type Color = "green" | "yellow" | "red" | null;
type Offset = { key: string; date: string };
type LoadTier = "high" | "mid" | "low" | null;
type Cmj = { jhPct: number | null; rsiPct: number | null };
type Player = {
  id: string; name: string; position: string | null; minutes: number;
  colors: Record<string, Color>; cmj: Record<string, Cmj | null>; reboundedByMd2: boolean; lagging: boolean; md2: Color;
  load: { decel: number; score: number | null; tier: LoadTier } | null;
  heavyEcho: boolean; notPostMatch: boolean;
};
type Counts = { green: number; yellow: number; red: number; none: number };
type Resp = {
  match: { date: string; opponent: string | null; competition: string | null; is_home: boolean | null; days_ago: number } | null;
  matches: Array<{ date: string; opponent: string | null; is_home: boolean | null }>;
  offsets: Offset[];
  players: Player[];
  summary: { played: number; by_offset: Record<string, Counts>; rebounded_by_md2: number; with_md2: number; lagging: number; cmj_tested: number } | null;
};

const CELL: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", none: "bg-slate-200",
};
const BAR: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", none: "bg-slate-200",
};
const TIER: Record<string, string> = {
  high: "bg-orange-100 text-orange-700", mid: "bg-slate-100 text-slate-600", low: "bg-slate-50 text-slate-400",
};

export default function PostMatchRecoveryPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [matchDate, setMatchDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const token = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const load = useCallback(async (md: string) => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const qs = md ? `?match_date=${md}` : "";
      const res = await fetch(`/api/coach/post-match-recovery${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp);
      if (!md && json.match) setMatchDate(json.match.date);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);
  useEffect(() => { void load(matchDate); }, [load, matchDate]);

  const t = {
    title: IS ? "Endurheimt eftir leik" : "Post-match recovery",
    intro: IS ? "Endurheimt leikmanna eftir leik — hver náði sér fyrir MD+2." : "Player recovery after a match — who rebounded by MD+2.",
    match: IS ? "Leikur" : "Match",
    rebounded: IS ? "náðu sér fyrir MD+2" : "rebounded by MD+2",
    lagging: IS ? "hanga flaggaðir á MD+2" : "still flagged at MD+2",
    curve: IS ? "Endurheimtarkúrfa liðsins" : "Squad recovery curve",
    player: IS ? "Leikmaður" : "Player", min: IS ? "Mín" : "Min",
    load: IS ? "IMA-álag" : "IMA load",
    loadHint: IS ? "Decel-vegið vélrænt álag úr leiknum (z vs liðið) — McBurnie 2022" : "Decel-weighted mechanical match load (z vs squad) — McBurnie 2022",
    heavyEcho: IS ? "þungt bergmál" : "heavy echo",
    notPM: IS ? "ekki post-match?" : "not post-match?",
    home: "H", away: IS ? "Ú" : "A",
    none: IS ? "engin skráning" : "no check-in",
    legend: IS ? "Grænn / Gulur / Rauður = canonical readiness þann dag" : "Green / Yellow / Red = canonical readiness that day",
    note: IS
      ? "Eftir leik er taugavöðva- og upplifuð þreyta þyngst á MD+1 og á að ná sér fyrir MD+2/MD+3 (Nédélec 2012). IMA-álagið er skammturinn — háákefðar hemlanir spá best fyrir um vöðvaskemmd (McBurnie 2022). Hátt IMA-álag + enn flaggaður á MD+2 = raunverulegt þungt bergmál; lágt álag + flaggaður = líklega annað en post-match."
      : "Post-match neuromuscular + perceived fatigue is heaviest at MD+1 and should rebound by MD+2/MD+3 (Nédélec 2012). IMA load is the \"dose\": high-intensity decelerations best predict muscle damage (McBurnie 2022). High IMA load + still flagged at MD+2 = a genuine heavy echo; low load + flagged = likely something other than post-match.",
    print: "PDF",
    noData: IS ? "Engin leikgögn." : "No match data.",
    cmjHave: IS ? "objektíf CMJ-mæling skráð á endurheimtardögum" : "objective CMJ measurements logged on recovery days",
    cmjNone: IS
      ? "Engin CMJ-mæling á MD+1–MD+N. Litur er upplifunar-proxy; CMJ (stökkhæð / RSI-mod vs baseline) er objektíva taugavöðva-mælingin (Nédélec 2012). Bættu ~30 sek ForceDecks-stökki á MD+1 við til að kveikja á þessu laginu."
      : "No CMJ logged on MD+1–MD+N. Colour is a perceptual proxy; CMJ (jump height / RSI-mod vs baseline) is the objective neuromuscular marker (Nédélec 2012). Add a ~30 s ForceDecks jump on MD+1 to light up this layer.",
  };

  const match = data?.match;
  const offsets = data?.offsets ?? [];
  const players = data?.players ?? [];
  const summary = data?.summary;

  // ── Deterministic verdict (rules, no LLM) — the one-sentence read the coach
  // sees BEFORE the controls. Computed from the recovery summary already fetched.
  const verdict = (() => {
    if (!match || !summary || players.length === 0) return null;

    const rebounded = summary.rebounded_by_md2;
    const withMd2 = summary.with_md2;
    const lagging = players.filter((p) => p.lagging);
    const laggingNames = lagging.map((p) => p.name);

    // tone: everyone (with a MD+2 read) rebounded → good; a meaningful share
    // still flagged → watch, large share → concern.
    const laggingShare = withMd2 > 0 ? lagging.length / withMd2 : 0;
    const tone: VerdictTone =
      lagging.length === 0 ? "good" : laggingShare >= 0.34 ? "concern" : "watch";

    // sentence — plain language only: "two days after the match", no IMA/CMJ/MD+2.
    const namesEN = laggingNames.join(", ");
    const namesIS = laggingNames.join(", ");
    let sentenceEN: string;
    let sentenceIS: string;
    if (lagging.length === 0) {
      sentenceEN = `All ${withMd2} of ${withMd2} players with a read had fully rebounded by two days after the match.`;
      sentenceIS = `Allir ${withMd2} af ${withMd2} leikmönnum með skráningu höfðu náð sér að fullu tveimur dögum eftir leik.`;
    } else {
      sentenceEN =
        `${rebounded} of ${withMd2} players had fully rebounded by two days after the match; ` +
        `${lagging.length} ${lagging.length === 1 ? "is" : "are"} still carrying match fatigue — ${namesEN}.`;
      sentenceIS =
        `${rebounded} af ${withMd2} leikmönnum höfðu náð sér að fullu tveimur dögum eftir leik; ` +
        `${lagging.length} ${lagging.length === 1 ? "ber" : "bera"} enn þreytu úr leiknum — ${namesIS}.`;
    }

    // confidence — reuse coverage already computed (players with a MD+2 read,
    // and how many have an objective jump measurement). Thin → low.
    const cmjTested = summary.cmj_tested;
    const md2Coverage = summary.played > 0 ? withMd2 / summary.played : 0;
    const level: ConfidenceLevel =
      withMd2 === 0 ? "low" : cmjTested > 0 && md2Coverage >= 0.7 ? "high" : md2Coverage >= 0.5 ? "moderate" : "low";
    const noteEN =
      `${withMd2}/${summary.played} with a two-day read` +
      (cmjTested > 0 ? `, ${cmjTested} with an objective jump test` : `, no objective jump test logged`);
    const noteIS =
      `${withMd2}/${summary.played} með tveggja-daga skráningu` +
      (cmjTested > 0 ? `, ${cmjTested} með objektífa stökkmælingu` : `, engin objektíf stökkmæling skráð`);

    // drivers — the still-flagged players, with the mechanical-load / jump detail
    // and the paper citations in each tooltip.
    const drivers: VerdictDriver[] = lagging.map((p) => {
      const md2Cmj = p.cmj?.["MD+2"] ?? null;
      const cmjVal = md2Cmj ? (md2Cmj.rsiPct ?? md2Cmj.jhPct) : null;
      const tipEN =
        (p.load
          ? `Match mechanical load ${p.load.decel} braking events (${p.load.tier ?? "mid"})`
          : `No match mechanical-load data`) +
        (cmjVal != null ? ` · jump ${fmtPct(cmjVal)} vs baseline` : ``) +
        ` · McBurnie 2022 · Nédélec 2012`;
      const tipIS =
        (p.load
          ? `Vélrænt leikálag ${p.load.decel} hemlanir (${p.load.tier ?? "mid"})`
          : `Engin vélræn leikálagsgögn`) +
        (cmjVal != null ? ` · stökk ${fmtPct(cmjVal)} vs grunnlína` : ``) +
        ` · McBurnie 2022 · Nédélec 2012`;
      return {
        label: p.name,
        detail: p.heavyEcho
          ? { EN: "heavy echo", IS: "þungt bergmál" }
          : p.notPostMatch
            ? { EN: "likely not post-match", IS: "líklega ekki úr leik" }
            : { EN: "still flagged", IS: "enn flaggaður" },
        tip: { EN: tipEN, IS: tipIS },
        tone: p.heavyEcho ? "concern" : ("watch" as VerdictTone),
      };
    });

    return {
      tone,
      sentence: { EN: sentenceEN, IS: sentenceIS },
      subtitle: {
        EN: "Recovery after a match — fatigue peaks the day after and should clear within two to three days (Nédélec 2012).",
        IS: "Endurheimt eftir leik — þreyta er mest daginn eftir og á að hverfa á tveimur til þremur dögum (Nédélec 2012).",
      },
      confidence: { level, note: { EN: noteEN, IS: noteIS } },
      drivers,
    };
  })();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <style>{`@media print {@page{size:A4 portrait;margin:12mm} body *{visibility:hidden} #pmr,#pmr *{visibility:visible} #pmr{position:absolute;left:0;top:0;width:100%} .pmr-noprint{display:none!important} .pmr-sec{break-inside:avoid}}`}</style>

      {/* Explainability-first verdict — the plain-language read the coach sees
          BEFORE the date selector / controls (docs/explainability-first.md).
          Gated identically to the results: a match selected + players loaded. */}
      {verdict && (
        <div className="mb-4">
          <VerdictBanner
            lang={lang}
            kicker={t.title}
            tone={verdict.tone}
            sentence={verdict.sentence}
            subtitle={verdict.subtitle}
            confidence={verdict.confidence}
            drivers={verdict.drivers}
          />
        </div>
      )}

      {/* Recovery watch — day-aware open watches (recoveryWatch lib). Self-fetches
          the team's most recent match; self-hides when nothing needs attention. */}
      <div className="pmr-noprint mb-4">
        <RecoveryWatchBanner lang={lang === "EN" ? "EN" : "IS"} />
      </div>

      <div className="pmr-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-base font-bold text-slate-900">{t.title}</div>
            <PagePurpose
              en="see who needs recovery after the match and who is ready"
              is="sjá hverjir þurfa endurheimt eftir leik og hverjir eru tilbúnir"
            />
            <div className="text-xs text-slate-500">{t.intro}</div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{t.match}</label>
              <select value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {(data?.matches ?? []).map((m) => (
                  <option key={m.date} value={m.date}>{m.date} · {formatMatchLabel(m.opponent, m.is_home, { home: t.home, away: t.away })}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => window.print()} disabled={!match || players.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">🖨 {t.print}</button>
          </div>
        </div>
      </div>

      {err && <div className="pmr-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <div className="pmr-noprint mb-4 text-sm text-slate-500">…</div>}

      {match && players.length > 0 && summary && (
        <div id="pmr" className="space-y-5">
          {/* Header */}
          <div className="pmr-sec flex items-end justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{formatMatchLabel(match.opponent, match.is_home, { home: t.home, away: t.away })}</div>
              <div className="text-xs text-slate-500">{match.date} · {match.days_ago} {IS ? "dögum síðan" : "days ago"} · {summary.played} {IS ? "léku" : "played"}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-emerald-600">{summary.rebounded_by_md2}<span className="text-sm font-normal text-slate-400">/{summary.with_md2}</span></div>
              <div className="text-[11px] text-slate-500">{t.rebounded}</div>
            </div>
          </div>

          {/* Recovery curve — colour counts per offset day */}
          <div className="pmr-sec rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{t.curve}</div>
            <div className="space-y-1.5">
              {offsets.map((o) => {
                const c = summary.by_offset[o.key];
                const total = c.green + c.yellow + c.red + c.none || 1;
                return (
                  <div key={o.key} className="flex items-center gap-2">
                    <div className="w-12 shrink-0 text-[11px] font-medium tabular-nums text-slate-600">{o.key}</div>
                    <div className="flex h-5 flex-1 overflow-hidden rounded">
                      {(["red", "yellow", "green", "none"] as const).map((k) => c[k] > 0 ? (
                        <div key={k} className={`${BAR[k]} flex items-center justify-center text-[10px] font-semibold ${k === "yellow" || k === "none" ? "text-slate-700" : "text-white"}`}
                          style={{ width: `${(c[k] / total) * 100}%` }} title={`${c[k]} ${k}`}>{c[k] > 0 ? c[k] : ""}</div>
                      ) : null)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10px] text-slate-400">{t.legend}</div>
          </div>

          {/* Player grid */}
          <div className="pmr-sec rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t.player}</div>
              {summary.lagging > 0 && <div className="text-[11px] font-medium text-red-600">{summary.lagging} {t.lagging}</div>}
            </div>
            <p className="mb-2 text-[11px] leading-snug text-slate-500">
              {IS
                ? "Litaði punkturinn = readiness-dómur dagsins (huglæg líðan — svefn/harðsperrur/orka — vs hans eigin norm). Prósentan undir = CMJ, objektíf taugavöðva-mæling vs grunnlína. Þau MEGA stangast á: leikmaður getur skráð sig grænan en samt verið með stökk niðri — huglæg líðan jafnar sig á undan taugavöðvakerfinu (Gathercole 2015). Misræmið er merkið. Smelltu á nafn fyrir útskýringu."
                : "The coloured dot = that day's readiness verdict (subjective wellness — sleep/soreness/energy — vs his own norm). The % below it = CMJ, an objective neuromuscular test vs baseline. They CAN disagree: a player can self-report green yet have a depressed jump — subjective feel recovers before the neuromuscular system does (Gathercole 2015). The gap is the signal. Click a name for the explanation."}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-1 py-1 text-left font-medium">{t.player}</th>
                    <th className="px-1 py-1 text-right font-medium">{t.min}</th>
                    <th className="px-1 py-1 text-center font-medium" title={t.loadHint}>{t.load}</th>
                    {offsets.map((o) => <th key={o.key} className="px-1 py-1 text-center font-medium">{o.key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const md2cmj = p.cmj?.["MD+2"] ?? null;
                    const md2CmjVal = md2cmj && (md2cmj.rsiPct != null || md2cmj.jhPct != null) ? ((md2cmj.rsiPct ?? md2cmj.jhPct) as number) : null;
                    const cmjDown = md2CmjVal != null && md2CmjVal <= -5;
                    // False green: subjective colour says recovered but the objective jump is
                    // down — the dangerous case a rushing coach would miss. Flag it loudly.
                    const falseGreen = cmjDown && p.md2 === "green";
                    return (
                    <Fragment key={p.id}>
                    <tr className={`border-t border-slate-100 ${falseGreen ? "bg-amber-100/70" : p.lagging ? "bg-red-50/40" : cmjDown ? "bg-amber-50/50" : ""}`}>
                      <td className="px-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                          className="text-left font-medium text-slate-800 hover:text-indigo-700"
                          aria-expanded={expandedId === p.id}
                          title={IS ? "Sjá útskýringu" : "See explanation"}
                        >
                          <span className={`mr-1 inline-block text-[9px] text-slate-400 transition-transform ${expandedId === p.id ? "rotate-90" : ""}`}>▸</span>
                          {p.name}
                        </button>
                        {p.heavyEcho
                          ? <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-semibold text-red-700" title={t.lagging}>⚠ {t.heavyEcho}</span>
                          : p.notPostMatch
                            ? <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700">{t.notPM}</span>
                            : p.lagging ? <span className="ml-1 text-red-500" title={t.lagging}>⚠</span> : null}
                        {/* CMJ-down badge — loud for the false-green case so it can't be
                            missed at a glance; amber (confirming) when the colour already flags. */}
                        {cmjDown ? (
                          <span
                            className={`ml-1 rounded px-1 py-0.5 text-[9px] font-bold ${falseGreen ? "bg-red-600 text-white" : "bg-amber-100 text-amber-800"}`}
                            title={IS
                              ? `Objektíf CMJ ${fmtPct(md2CmjVal)} vs grunnlína${falseGreen ? " — þrátt fyrir grænan lit (huglæg líðan missti þreytuna)" : ""}`
                              : `Objective CMJ ${fmtPct(md2CmjVal)} vs baseline${falseGreen ? " — despite the green colour (subjective wellness missed the fatigue)" : ""}`}
                          >
                            ⚠ {IS ? "Stökk" : "Jump"} {fmtPct(md2CmjVal)}
                          </span>
                        ) : null}
                        <span className="ml-1 text-[10px] text-slate-400">{p.position}</span>
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-slate-500">{p.minutes}</td>
                      <td className="px-1 py-1.5 text-center">
                        {p.load
                          ? <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${TIER[p.load.tier ?? "mid"]}`} title={`decel ${p.load.decel} · z ${p.load.score}`}>{p.load.decel}</span>
                          : <span className="text-[10px] text-slate-300">—</span>}
                      </td>
                      {offsets.map((o) => {
                        const c = p.colors[o.key] ?? "none";
                        const cmj = p.cmj?.[o.key] ?? null;
                        const pctVal = cmj ? (cmj.rsiPct ?? cmj.jhPct) : null;
                        const pDown = pctVal != null && pctVal <= -5;
                        const ringGreen = o.key === "MD+2" && falseGreen;
                        return (
                          <td key={o.key} className="px-1 py-1.5">
                            <div className="mx-auto flex flex-col items-center justify-center gap-0.5">
                              <span className={`inline-block h-4 w-4 rounded-full ${CELL[c]} ${ringGreen ? "ring-2 ring-red-500 ring-offset-1" : ""}`}
                                title={ringGreen ? (IS ? "Grænt — en CMJ er niðri, sjá viðvörun við nafn" : "Green — but CMJ is down, see the warning by the name") : (c === "none" ? t.none : `${o.key}: ${c}`)} />
                              {cmj && pctVal != null ? (
                                <span className={`tabular-nums ${pDown ? "text-[11px] font-bold" : "text-[9px] font-semibold"} ${cmjTone(pctVal)}`}
                                  title={`CMJ vs baseline — ${cmj.jhPct != null ? `hæð ${fmtPct(cmj.jhPct)}` : ""}${cmj.rsiPct != null ? ` · RSI ${fmtPct(cmj.rsiPct)}` : ""}`}>
                                  {pDown ? "⚠ " : ""}{fmtPct(pctVal)}
                                </span>
                              ) : cmj ? (
                                // Tested on this day, but no usable baseline yet → say so
                                // rather than render a cryptic "·" (distinct from not-tested).
                                <span className="text-[8px] font-medium text-slate-400"
                                  title={IS ? "Stökk var tekið, en engin grunnlína (þarf ≥3 gild CMJ-próf síðustu 42 daga FYRIR leik)" : "Jumped, but no baseline yet (needs ≥3 valid CMJ tests in the 42 days BEFORE the match)"}>
                                  {IS ? "engin grunnl." : "no base"}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    {expandedId === p.id && (
                      <tr className="border-t border-slate-100 bg-slate-50/70">
                        <td colSpan={3 + offsets.length} className="px-3 py-2 text-[11px] leading-relaxed text-slate-700">
                          {playerExplanation(p, IS)}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Objective neuromuscular layer status (CMJ) */}
          <div className={`pmr-sec rounded-lg border p-3 text-[12px] leading-relaxed ${summary.cmj_tested > 0 ? "border-emerald-100 bg-emerald-50/40 text-slate-700" : "border-amber-100 bg-amber-50/50 text-slate-700"}`}>
            <span className="font-semibold">CMJ {summary.cmj_tested > 0 ? "✓" : "⚠"} </span>
            {summary.cmj_tested > 0 ? `${summary.cmj_tested} ${t.cmjHave}` : t.cmjNone}
          </div>

          {/* Detailed CMJ explainability — builds coach/athlete trust. Plain
              one-line verdict always visible; the science behind it is one click
              away (explainability-first: rules/measurement decide, this explains). */}
          <details className="pmr-sec group rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-700">
            <summary className="cursor-pointer list-none font-semibold text-slate-800 marker:content-none">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
              {IS ? "Hvernig á að lesa CMJ-prófið — og af hverju má treysta því" : "How to read the CMJ test — and why you can trust it"}
            </summary>
            <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
              <p><span className="font-semibold text-slate-800">{IS ? "Hvað það mælir. " : "What it measures. "}</span>
                {IS
                  ? "Counter-movement jump (CMJ) á kraftplötu (ForceDecks): leikmaður dýfir sér og stekkur hámark. Platan mælir kraftinn sem fæturnir framleiða — objektíf mæling á taugavöðva-getu sem upplifuð líðan getur falið. Leikmaður getur sagst „fínn“ en samt verið með skerta sprengikraft. Gull-staðall á vettvangi (Claudino 2017, Gathercole 2015)."
                  : "Counter-movement jump (CMJ) on a force plate (ForceDecks): the player dips and jumps maximally; the plate measures the force the legs produce — an objective read on neuromuscular capacity that subjective wellness can hide. A player can report \"fine\" yet have blunted explosive output. The field gold-standard (Claudino 2017, Gathercole 2015)."}</p>
              <p><span className="font-semibold text-slate-800">{IS ? "Af hverju MD+2 (frí á MD+1). " : "Why MD+2 (rest on MD+1). "}</span>
                {IS
                  ? "Taugavöðva-þreyta er mest daginn eftir leik (MD+1) og á að hreinsast á MD+2–MD+3 (Nédélec 2012). Þar sem MD+1 var frídagur spyr MD+2-prófið beint: náðu fæturnir sér eftir hvíldardag? Ef stökkið er enn niðri þá er það raunverulegt merki um að hann er ekki búinn að jafna sig — ekki bara harðsperrur leikdagsins."
                  : "Neuromuscular fatigue peaks the day after a match (MD+1) and should clear by MD+2–MD+3 (Nédélec 2012). Because MD+1 was a rest day, the MD+2 test asks directly: did the legs rebound after a day off? If the jump is still down, that's a genuine \"not recovered\" signal — not just match-day soreness."}</p>
              <p><span className="font-semibold text-slate-800">{IS ? "Borið saman við HANS eigin grunnlínu. " : "Compared to HIS own baseline. "}</span>
                {IS
                  ? "Prósentan er vs miðgildi hans eigin CMJ síðustu 42 daga (≥3 gildar mælingar fyrir leik) — persónuleg norm, ekki liðsmeðaltal. „−6%“ þýðir niður vs hans venja, ekki vs aðra. Þannig er stór en stöðugur stökkvari ekki refsað og lítill en þreyttur ekki falinn."
                  : "The % is vs the median of his own CMJ over the last 42 days (≥3 valid pre-match tests) — a personal norm, not a squad average. \"−6%\" means down vs HIS usual, not vs others. So a big but consistent jumper isn't penalised and a smaller but fatigued one isn't hidden."}</p>
              <p><span className="font-semibold text-slate-800">{IS ? "Tvær tölur: hæð og RSI-mod. " : "Two numbers: height and RSI-mod. "}</span>
                {IS
                  ? "Stökkhæð er aðal-útkoman. RSI-mod (hæð ÷ snertitími) er næmari á þreytu og dettur FYRR — þreyttur leikmaður heldur hæðinni með því að eyða lengri tíma á jörðinni, svo RSI-mod afhjúpar þreytuna áður en hæðin gerir það (Gathercole 2015). Horfðu á RSI-mod fyrst."
                  : "Jump height is the headline output. RSI-mod (height ÷ contraction time) is more fatigue-sensitive and drops EARLIER — a tired player preserves height by spending longer on the ground, so RSI-mod exposes fatigue before height does (Gathercole 2015). Watch RSI-mod first."}</p>
              <p><span className="font-semibold text-slate-800">{IS ? "Hvernig á að lesa prósentuna. " : "How to read the %. "}</span>
                <span className="text-emerald-700 font-medium">{IS ? "innan ±5% = endurheimt (grænt)" : "within ±5% = recovered (green)"}</span>{" · "}
                <span className="text-amber-700 font-medium">{IS ? "−5% til −10% = fylgjast með (gult)" : "−5% to −10% = monitor (amber)"}</span>{" · "}
                <span className="text-red-700 font-medium">{IS ? "≤ −10% = skýr taugavöðva-þreyta (rautt)" : "≤ −10% = clear neuromuscular fatigue (red)"}</span>{". "}
                {IS ? "Rautt → minnka/breyta plani; grænt → fullt plan í lagi." : "Red → reduce/modify the plan; green → full session OK."}</p>
              <p><span className="font-semibold text-slate-800">{IS ? "Hvenær það birtist EKKI (heiðarleiki). " : "When it stays \"—\" (honesty). "}</span>
                {IS
                  ? "Aðeins gildar mælingar (is_valid) teljast, og grunnlínan þarf ≥3 próf — annars sýnum við „—“ frekar en að giska. Aðeins hreint CMJ er notað (ekki Abalakov-armsveifla né IMTP), því blöndun myndi skekkja samanburðinn."
                  : "Only valid tests (is_valid) count, and the baseline needs ≥3 tests — otherwise we show \"—\" rather than guess. Only clean CMJ is used (not Abalakov arm-swing or IMTP), because mixing test types would bias the comparison."}</p>
              <p className="text-[11px] text-slate-500">
                {IS
                  ? "Mælingin ákveður — þetta er talna-samanburður við hans eigin sögu, ekki skoðun. Þú getur brugðist við henni eða hnekkt. Heimildir: Nédélec 2012 (endurheimtartímalína), Gathercole 2015 (RSI-mod næmni), Claudino 2017 (CMJ-vöktun), McBurnie 2022 (vélrænn skammtur)."
                  : "The measurement decides — this is a number vs his own history, not an opinion. You can act on it or override it. Sources: Nédélec 2012 (recovery timeline), Gathercole 2015 (RSI-mod sensitivity), Claudino 2017 (CMJ monitoring), McBurnie 2022 (mechanical dose)."}</p>
            </div>
          </details>

          <div className="pmr-sec rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-[12px] leading-relaxed text-slate-700">
            {t.note}
          </div>
          <div className="border-t border-slate-200 pt-2 text-[9px] text-slate-400">
            MicroPulse · {IS ? "Litur = canonical readiness (readiness_entries.color) · IMA-álag = decel-vegið z vs liðið" : "Colour = canonical readiness (readiness_entries.color) · IMA load = decel-weighted z vs squad"} · Nédélec 2012 · McBurnie 2022 · Gathercole 2015
          </div>
        </div>
      )}
      {match && players.length === 0 && !loading && (
        <div className="pmr-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{t.noData}</div>
      )}
    </div>
  );
}

function fmtPct(v: number | null): string {
  if (v == null) return "·";
  return `${v > 0 ? "+" : ""}${v}%`;
}
function cmjTone(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v <= -10) return "text-red-600";
  if (v <= -5) return "text-amber-600";
  return "text-emerald-600";
}

function colorWord(c: string, IS: boolean): string {
  if (c === "green") return IS ? "grænn" : "green";
  if (c === "yellow") return IS ? "gulur" : "yellow";
  if (c === "red") return IS ? "rauður" : "red";
  return IS ? "engin gögn" : "no data";
}

// Per-player plain-language "why": synthesises the match dose, the MD+1→MD+2
// trajectory, the objective CMJ read, and the resulting interpretation + action.
// Deterministic from the row's own fields — the data decides, this narrates.
function playerExplanation(p: Player, IS: boolean): string {
  const parts: string[] = [];
  const tier = p.load?.tier ?? null;
  const tierWord = tier === "high" ? (IS ? "hátt" : "high") : tier === "low" ? (IS ? "lágt" : "low") : (IS ? "miðlungs" : "moderate");
  parts.push(tier
    ? (IS
        ? `Spilaði ${p.minutes} mín með ${tierWord} vélrænt álag í leik (decel-vegið vs liðið — háákefðar hemlanir spá best fyrir um vöðvaskemmd, McBurnie 2022).`
        : `Played ${p.minutes} min with ${tierWord} mechanical match load (decel-weighted vs the squad — high-intensity decelerations best predict muscle damage, McBurnie 2022).`)
    : (IS ? `Spilaði ${p.minutes} mín.` : `Played ${p.minutes} min.`));

  const md1 = p.colors["MD+1"] ?? "none";
  parts.push(IS
    ? `Daginn eftir (MD+1) var hann ${colorWord(md1, true)}; á MD+2 er hann ${colorWord(p.md2 ?? "none", true)}.`
    : `The day after (MD+1) he was ${colorWord(md1, false)}; by MD+2 he's ${colorWord(p.md2 ?? "none", false)}.`);

  const cmj = p.cmj?.["MD+2"] ?? null;
  const cmjVal = cmj && (cmj.rsiPct != null || cmj.jhPct != null) ? (cmj.rsiPct ?? cmj.jhPct) as number : null;
  const cmjDown = cmjVal != null && cmjVal <= -5;
  if (cmjVal != null) {
    const metric = cmj!.rsiPct != null ? "RSI-mod" : (IS ? "stökkhæð" : "jump height");
    parts.push(IS
      ? `Objektíf CMJ-mæling (${metric}) er ${fmtPct(cmjVal)} vs hans grunnlína — ${cmjDown ? "raunveruleg taugavöðva-þreyta sem upplifuð líðan getur falið" : "innan eðlilegra marka"} (Gathercole 2015).`
      : `Objective CMJ (${metric}) is ${fmtPct(cmjVal)} vs his baseline — ${cmjDown ? "genuine neuromuscular fatigue that subjective wellness can miss" : "within normal range"} (Gathercole 2015).`);
  } else if (cmj) {
    // Tested on the recovery day but no usable personal baseline → honest gap.
    parts.push(IS
      ? `Hann TÓK CMJ-stökk á MD+2, en það er engin grunnlína til að bera það við (þarf ≥3 gild próf síðustu 42 daga FYRIR leik — hans síðasta var of gamalt). Prósentan birtist um leið og hann hefur prófað reglulega.`
      : `He DID jump (CMJ) on MD+2, but there's no baseline to compare it against (needs ≥3 valid tests in the 42 days BEFORE the match — his last one was too old). The % appears once he's tested regularly.`);
  }

  if (p.heavyEcho) {
    parts.push(IS
      ? `Hátt álag + enn flaggaður á MD+2 = raunverulegt þungt bergmál eftir leik. Léttu planið eða lengdu endurheimt.`
      : `High load + still flagged at MD+2 = a genuine heavy post-match echo. Ease his plan or extend recovery.`);
  } else if (p.notPostMatch) {
    parts.push(IS
      ? `Lágt álag en samt flaggaður = líklega EKKI post-match. Skoðaðu svefn, veikindi eða annað álag.`
      : `Low load but still flagged = likely NOT post-match. Check sleep, illness or other stressors.`);
  } else if (p.reboundedByMd2 && cmjDown) {
    // False green: subjective colour recovered, but the objective jump is down —
    // the case where CMJ earns its keep.
    parts.push(IS
      ? `Liturinn segir endurheimt, EN stökkið er niðri ${fmtPct(cmjVal)} — objektíva prófið greip þreytu sem líðanin missti. Treystu CMJ: íhugaðu að létta þrátt fyrir græna litinn.`
      : `The colour says recovered, BUT the jump is down ${fmtPct(cmjVal)} — the objective test caught fatigue the wellness score missed. Trust the CMJ: consider easing despite the green.`);
  } else if (p.reboundedByMd2) {
    parts.push(IS
      ? `Náði sér á áætlun fyrir MD+2 (Nédélec 2012)${cmjVal != null ? ", og stökkið staðfestir það" : ""} — fullt plan í lagi.`
      : `Recovered on schedule by MD+2 (Nédélec 2012)${cmjVal != null ? ", and the jump confirms it" : ""} — a full session is fine.`);
  } else if (p.lagging) {
    parts.push(IS
      ? `Enn flaggaður á MD+2 með miðlungs álag${cmjDown ? " — og stökkið staðfestir þreytuna" : ""}. Fylgstu með áður en þú hleður á hann.`
      : `Still flagged at MD+2 with moderate load${cmjDown ? " — and the jump confirms the fatigue" : ""}. Monitor before loading him.`);
  }
  return parts.join(" ");
}
