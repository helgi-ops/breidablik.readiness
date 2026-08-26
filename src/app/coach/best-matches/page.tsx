"use client";

export const dynamic = "force-dynamic";

/**
 * Best Matches — a season-highlights report: the team's best games, what we did well in each, and
 * who was in the team. Layered read per match: scoreline + result (glance) → "what we did well"
 * (plain why) → the matchday lineup, with a details toggle for the ranking components. Reads
 * /api/coach/best-matches. Descriptive football context — never touches the readiness colour. EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { downloadBestMatchesPdf } from "@/components/coach/BestMatchesPdf";

type Bi = { en: string; is: string };
type Strength = { key: string; label: Bi };
type LineupPlayer = { name: string; position: string | null; line: string | null; minutes: number | null; starter: boolean | null };
type Match = {
  matchDate: string; opponent: string | null; isHome: boolean | null;
  goals: number; goalsAgainst: number; outcome: "win" | "draw" | "loss";
  xg: number | null; xgAgainst: number | null; obv: number | null;
  score: number; components: { points: number; goalDiff: number; xgDiff: number };
  strengths: Strength[]; lineup: LineupPlayer[]; lineupCount: number; startersKnown: boolean; lineupSource?: "minutes" | "stats";
  detail?: Record<string, number | null> | null;
};
type Resp = { ok: boolean; hasData?: boolean; count?: number; totalMatches?: number; matches?: Match[]; error?: string };

const OUTCOME: Record<Match["outcome"], { bg: string; en: string; is: string }> = {
  win: { bg: "#1c7a4a", en: "Win", is: "Sigur" },
  draw: { bg: "#de9328", en: "Draw", is: "Jafntefli" },
  loss: { bg: "#a83e28", en: "Loss", is: "Tap" },
};
const LINE_LABEL: Record<string, Bi> = { GK: { en: "GK", is: "Markv." }, DEF: { en: "Defence", is: "Vörn" }, MID: { en: "Midfield", is: "Miðja" }, FWD: { en: "Attack", is: "Sókn" }, other: { en: "Other", is: "Aðrir" } };
const LINE_SEQ = ["GK", "DEF", "MID", "FWD", "other"];

function fmtDate(d: string, is: boolean): string {
  const [y, m, day] = d.split("-").map(Number);
  const mon = (is
    ? ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ág", "sep", "okt", "nóv", "des"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])[(m || 1) - 1];
  return is ? `${day}. ${mon} ${y}` : `${day} ${mon} ${y}`;
}

export default function BestMatchesPage() {
  const [lang] = useLang();
  const is: boolean = lang === "IS";
  const L = <T,>(o: { en: T; is: T }) => (is ? o.is : o.en);

  const [top, setTop] = React.useState("10");
  const [lens, setLens] = React.useState<"overall" | "attack" | "defense">("overall");
  const [data, setData] = React.useState<Resp | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "empty" | "error">("loading");
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [aiState, setAiState] = React.useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ai, setAi] = React.useState<{ overall: string; notes: Record<string, string> } | null>(null);
  const [aiErr, setAiErr] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  async function generateAi() {
    setAiState("loading"); setAiErr(null);
    const t = await token(); if (!t) { setAiState("error"); setAiErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
    try {
      const res = await fetch(`/api/coach/best-matches/ai-summary`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ top, lens, lang }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { setAiState("error"); setAiErr(j.error ?? "Error"); return; }
      const notes: Record<string, string> = {};
      for (const p of (j.perMatch ?? []) as Array<{ date?: string; note?: string }>) if (p?.date) notes[p.date] = p.note ?? "";
      setAi({ overall: j.overall ?? "", notes }); setAiState("ready");
    } catch (e) { setAiState("error"); setAiErr(e instanceof Error ? e.message : "Error"); }
  }

  React.useEffect(() => {
    let live = true;
    (async () => {
      setState("loading"); setErr(null);
      setAi(null); setAiState("idle"); setAiErr(null); // a new window/lens invalidates the old summary
      const t = await token(); if (!t) { setState("error"); setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      try {
        const res = await fetch(`/api/coach/best-matches?top=${top}&lens=${lens}`, { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
        const j = (await res.json()) as Resp;
        if (!live) return;
        if (!res.ok || !j.ok) { setState("error"); setErr(j.error ?? "Error"); return; }
        setData(j); setState(j.hasData ? "ready" : "empty");
      } catch (e) { if (live) { setState("error"); setErr(e instanceof Error ? e.message : "Error"); } }
    })();
    return () => { live = false; };
  }, [top, lens, token, is]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="font-[family-name:var(--font-archivo,inherit)] text-2xl font-bold text-[#14181c]">{is ? "Bestu leikir" : "Best Match Analysis"}</h1>
      <PagePurpose en="see the team's best games of the season — what we did well in each, and who was in the team." is="sjá bestu leiki tímabilsins — hvað við gerðum vel í hverjum, og hverjir voru í liðinu." />

      <div className="mt-4 inline-flex overflow-hidden rounded-xl border border-slate-200">
        {([["overall", is ? "Heildar" : "Overall"], ["attack", is ? "Sóknarleikir" : "Attacking"], ["defense", is ? "Varnarleikir" : "Defensive"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setLens(k)} className={`px-4 py-1.5 text-[13px] font-semibold ${lens === k ? "bg-[#2740e6] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{lbl}</button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-slate-500">
        {lens === "attack" ? (is ? "Raðað eftir sóknarafköstum — mörk, skapaðar færur (xG), framfærsla." : "Ranked by attacking output — goals, chances created (xG), progression.")
          : lens === "defense" ? (is ? "Raðað eftir varnarafköstum — fá mörk/xG á okkur, hreinir skildir." : "Ranked by defensive output — few goals/xG conceded, clean sheets.")
          : (is ? "Raðað eftir heildarúrslitum — sigur > jafntefli > tap, svo markamunur, svo xG." : "Ranked overall — result first, then goal margin, then xG.")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Sýna" : "Show"}</span>
        {(["10", "15", "all"] as const).map((v) => (
          <button key={v} onClick={() => setTop(v)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${top === v ? "bg-[#2740e6] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {v === "all" ? (is ? "Allir" : "All") : (is ? `Bestu ${v}` : `Top ${v}`)}
          </button>
        ))}
        {data?.totalMatches ? <span className="text-[11px] text-slate-400">{is ? `af ${data.totalMatches} leikjum` : `of ${data.totalMatches} matches`}</span> : null}
        {state === "ready" && data?.matches?.length ? (
          <button
            onClick={() => void downloadBestMatchesPdf({
              lens,
              matches: data.matches!.map((m) => ({
                matchDate: m.matchDate, opponent: m.opponent, isHome: m.isHome,
                goals: m.goals, goalsAgainst: m.goalsAgainst, outcome: m.outcome,
                strengths: m.strengths.map((x) => ({ label: x.label })),
                lineup: m.lineup.map((p) => ({ name: p.name, line: p.line, starter: p.starter, minutes: p.minutes })),
                startersKnown: m.startersKnown, lineupCount: m.lineupCount, detail: m.detail ?? null,
              })),
              ai: aiState === "ready" ? ai : null,
            }, is ? "IS" : "EN")}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            {is ? "⬇ Sækja PDF" : "⬇ Download PDF"}
          </button>
        ) : null}
      </div>

      {state === "loading" ? <p className="mt-6 text-sm text-slate-400">…</p> : null}
      {state === "error" ? <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      {state === "empty" ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-[13px] leading-relaxed text-slate-600">
          {is ? "Engar liðs-tölur enn. Hladdu StatsBomb liðs-„Match Stats“ (eða heilu tímabils-skránni) inn á Single Match / Season Match Analysis — þá birtast leikirnir hér." : "No team match numbers yet. Upload the StatsBomb team “Match Stats” (or the whole-season file) on Single / Season Match Analysis — matches will appear here."}
        </div>
      ) : null}

      {state === "ready" && data?.matches ? (
        <div className="mt-5 space-y-3">
          {/* AI summary — on-demand (one call → whole-set summary + per-match notes) */}
          {aiState === "ready" && ai ? (
            <div className="rounded-2xl border border-[#2740e6]/20 bg-[#2740e6]/[0.03] p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#2740e6]">
                ✨ {is ? "AI samantekt" : "AI summary"}<span className="font-normal normal-case text-slate-400">· {is ? "byggt á tölunum" : "built on the numbers"}</span>
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-700">{ai.overall}</p>
              <button onClick={generateAi} className="mt-2 text-[11px] font-medium text-[#2740e6] hover:underline">{is ? "Uppfæra" : "Regenerate"}</button>
            </div>
          ) : (
            <div>
              <button onClick={generateAi} disabled={aiState === "loading"} className="inline-flex items-center gap-1.5 rounded-lg border border-[#2740e6]/30 bg-[#2740e6]/[0.04] px-3 py-1.5 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/[0.08] disabled:opacity-50">
                {aiState === "loading" ? (is ? "✨ Skrifa samantekt…" : "✨ Writing summary…") : (is ? "✨ Fá AI samantekt" : "✨ Get AI summary")}
              </button>
              {aiErr ? <p className="mt-1 text-[12px] text-red-700">{aiErr}</p> : <p className="mt-1 text-[11px] text-slate-400">{is ? "AI orðar tölurnar (reglur raða) — heildar-samantekt + nóta á hvern leik, merkt AI." : "AI phrases the numbers (rules rank) — a whole-set summary + a note per match, labelled AI."}</p>}
            </div>
          )}
          {data.matches.map((m, i) => {
            const oc = OUTCOME[m.outcome];
            const groupByLine = (ps: LineupPlayer[]) => LINE_SEQ.map((ln) => ({ ln, players: ps.filter((p) => (p.line ?? "other") === ln) })).filter((g) => g.players.length > 0);
            const starters = m.lineup.filter((p) => p.starter === true);
            const bench = m.lineup.filter((p) => p.starter !== true); // subs + anyone without minutes
            const starterGroups = groupByLine(m.startersKnown ? starters : m.lineup);
            const isOpen = !!open[m.matchDate];
            return (
              <div key={m.matchDate} className="rounded-2xl border border-slate-200 bg-white p-4">
                {/* (0) Glance: rank + scoreline + result */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#14181c] text-[12px] font-bold text-white">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-[family-name:var(--font-archivo,inherit)] text-base font-bold text-[#14181c]">
                        {m.goals}–{m.goalsAgainst} {is ? "gegn" : "vs"} {m.opponent ?? "?"}
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: oc.bg }}>{L(oc)}</span>
                      <span className="text-[12px] text-slate-400">{fmtDate(m.matchDate, is)} · {m.isHome == null ? "" : m.isHome ? (is ? "heima" : "home") : (is ? "úti" : "away")}</span>
                    </div>

                    {/* (1) What we did well */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.strengths.map((s) => (
                        <span key={s.key} className="rounded-full bg-[#2740e6]/[0.08] px-2.5 py-1 text-[12px] font-medium text-[#2740e6]">{L(s.label)}</span>
                      ))}
                    </div>
                    {ai?.notes[m.matchDate] ? (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">
                        <span className="mr-1 rounded bg-[#2740e6]/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#2740e6]">AI</span>
                        {ai.notes[m.matchDate]}
                      </p>
                    ) : null}

                    {/* (1) Who was in the team — starting XI (55+ min) where minutes exist */}
                    <div className="mt-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {m.lineupCount === 0 ? (is ? "Liðið" : "The team")
                          : m.startersKnown ? (is ? `Byrjunarlið (${starters.length})` : `Starting XI (${starters.length})`)
                          : (is ? `Í liðinu (${m.lineupCount})` : `The team (${m.lineupCount})`)}
                        {m.startersKnown && m.lineupSource === "minutes" ? <span className="ml-1.5 font-normal normal-case text-slate-300">· {is ? "úr Leikmínútum" : "from Match minutes"}</span> : null}
                      </div>
                      {m.lineupCount === 0 ? (
                        <p className="mt-0.5 text-[12px] text-slate-400">{is ? "Leikmanna-gögn ekki flutt inn fyrir þennan leik." : "No per-player data imported for this match."}</p>
                      ) : (
                        <>
                          <div className="mt-1 space-y-0.5">
                            {starterGroups.map((g) => (
                              <div key={g.ln} className="flex gap-2 text-[13px]">
                                <span className="w-16 shrink-0 text-[11px] font-semibold text-slate-400">{L(LINE_LABEL[g.ln])}</span>
                                <span className="text-slate-700">{g.players.map((p) => p.name).join(", ")}</span>
                              </div>
                            ))}
                          </div>
                          {m.startersKnown && bench.length > 0 ? (
                            <div className="mt-1 flex gap-2 text-[13px]">
                              <span className="w-16 shrink-0 text-[11px] font-semibold text-slate-400">{is ? "Inn á" : "Subs"}</span>
                              <span className="text-slate-600">{bench.map((p) => `${p.name}${p.minutes != null ? ` (${Math.round(p.minutes)}′)` : ""}`).join(", ")}</span>
                            </div>
                          ) : null}
                          {!m.startersKnown ? (
                            <p className="mt-1 text-[11px] text-slate-400">{is ? "Skráðu leikinn í Leikmínútur (Match minutes) til að fá byrjunarlið (55+ mín) og hverjir komu inn á." : "Enter this game in Match minutes to get the starting XI (55+ min) and who came off the bench."}</p>
                          ) : null}
                        </>
                      )}
                    </div>

                    {/* (2) Details */}
                    <button onClick={() => setOpen((o) => ({ ...o, [m.matchDate]: !o[m.matchDate] }))} className="mt-2 text-[12px] font-medium text-[#2740e6] hover:underline">
                      {isOpen ? (is ? "Fela tölur" : "Hide numbers") : (is ? "Sýna tölur (xG, OBV, röðun)" : "Show numbers (xG, OBV, ranking)")}
                    </button>
                    {isOpen ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
                        <span>xG <b className="text-slate-700">{m.xg?.toFixed(2) ?? "–"}</b>–{m.xgAgainst?.toFixed(2) ?? "–"}</span>
                        <span>OBV <b className="text-slate-700">{m.obv?.toFixed(2) ?? "–"}</b></span>
                        <span>{is ? "markamunur" : "goal diff"} <b className="text-slate-700">{m.components.goalDiff > 0 ? "+" : ""}{m.components.goalDiff}</b></span>
                        <span>{is ? "xG munur" : "xG diff"} <b className="text-slate-700">{m.components.xgDiff > 0 ? "+" : ""}{m.components.xgDiff.toFixed(2)}</b></span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {is
              ? "„Hvað við gerðum vel“ er lesið úr liðs-tölunum m.v. okkar eigin tímabils-meðaltal; í sóknar-/varnar-sýn birtast viðeigandi styrkleikar fyrst. Lýsandi — snertir aldrei readiness-litinn."
              : "“What we did well” is read from the team numbers vs our own season average; the attacking/defensive view surfaces the matching strengths first. Descriptive — never touches the readiness colour."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
