"use client";

/**
 * Form vs State panel — Readiness-Adjusted Tactical Output (differentiator #2).
 * Reads a player's recent tactical output (OBV) against his readiness colour on each match
 * date + context, and tags whether a trend is a genuine form change or a state artifact.
 * Advisory / descriptive — an analysis lens beside readiness, never the daily verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import type { FormRead, FormTier, TaggedMatch, Bi } from "@/lib/micropulse/formVsState";
import { colorClassOf } from "@/lib/micropulse/formVsState";

type L = "EN" | "IS";
const bi = (b: Bi | null | undefined, l: L) => (b ? (l === "IS" ? b.is : b.en) : "");
type ListPlayer = { playerId: string; name: string; position: string | null; matches: number };

const CHIP: Record<FormTier, string> = {
  explained_by_state: "border-blue-300 bg-blue-50 text-blue-700",
  genuine_dip: "border-red-300 bg-red-50 text-red-700",
  overperforming_compromised: "border-emerald-300 bg-emerald-50 text-emerald-700",
  steady: "border-slate-300 bg-slate-50 text-slate-600",
  unknown: "border-slate-300 bg-slate-50 text-slate-500",
};
const READ_DOT: Record<string, string> = { green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-red-500" };
const confWord = (c: string, l: L) => (c === "high" ? (l === "IS" ? "há vissa" : "high confidence") : c === "moderate" ? (l === "IS" ? "miðlungs vissa" : "moderate confidence") : (l === "IS" ? "lág vissa" : "low confidence"));
const levelWord = (lvl: string | null, l: L) => (lvl === "high" ? (l === "IS" ? "topp" : "top") : lvl === "med" ? (l === "IS" ? "mið" : "mid") : lvl === "low" ? (l === "IS" ? "neðri" : "low") : "—");

/** `playerId` (optional) lets a parent drive the selection — used when embedded in Total Player Analysis,
 *  so switching player in the profile updates this panel and its own picker is hidden. Absent → the panel
 *  keeps its own picker (backward-compatible). */
export default function FormVsStatePanel({ standalone = false, playerId }: { standalone?: boolean; playerId?: string }) {
  const [lang] = useLang();
  const L: L = lang === "IS" ? "IS" : "EN";
  const controlled = !!playerId;
  const [players, setPlayers] = React.useState<ListPlayer[]>([]);
  const [sel, setSel] = React.useState<string>("");
  const [read, setRead] = React.useState<FormRead | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [details, setDetails] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  // Parent-controlled selection: follow the profile's current player; skip the own-picker list fetch.
  React.useEffect(() => { if (playerId) setSel(playerId); }, [playerId]);

  React.useEffect(() => { if (controlled) return; (async () => {
    const t = await token(); if (!t) return;
    const r = await fetch("/api/coach/form-vs-state?list=1", { headers: { Authorization: `Bearer ${t}` } }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setPlayers(r.players); if (r.players[0]) setSel(r.players[0].playerId); }
  })(); }, [token, controlled]);

  React.useEffect(() => { if (!sel) { setRead(null); return; } (async () => {
    setLoading(true); setErr(null); setDetails(false);
    try {
      const t = await token(); if (!t) { setErr(L === "IS" ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const r = await fetch(`/api/coach/form-vs-state?playerId=${sel}&lang=${L}`, { headers: { Authorization: `Bearer ${t}` } }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Failed"); setRead(null); return; }
      setRead(r.read as FormRead);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  })(); }, [sel, token, L]);

  const intro = L === "IS"
    ? "aðskilur tvennt sem þjálfarar rugla saman: „hann er í lélegu formi“ vs „hann var líkamlega skertur“. Les tæknilega úttak (OBV) leikmanns í ljósi readiness-litarins og leiksamhengis. Greinandi linsa — aldrei readiness-dómurinn."
    : "separates two things coaches confuse: “he's out of form” vs “he was physically compromised.” Reads a player's tactical output (OBV) against his readiness colour and match context. An analysis lens — never the readiness verdict.";

  const picker = !controlled && players.length > 0 ? (
    <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
      {players.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}{p.position ? ` · ${p.position}` : ""} ({p.matches})</option>)}
    </select>
  ) : null;

  return (
    <div className={`${standalone ? "" : "mt-6"} rounded-2xl border border-slate-200 bg-white p-4`}>
      {standalone ? (
        <div className="flex justify-end">{picker}</div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{L === "IS" ? "Form vs ástand" : "Form vs State"}</h2>
            <PagePurpose en={intro} is={intro} tutorial="form-vs-state" />
          </div>
          {picker}
        </div>
      )}

      {!controlled && players.length === 0 && !loading && <p className="mt-3 text-[13px] text-slate-500">{L === "IS" ? "Engir leikmenn með per-leiks tæknilega úttak (StatsBomb OBV) enn." : "No players with per-match tactical output (StatsBomb OBV) yet."}</p>}
      {err && <p className="mt-3 text-[13px] font-medium text-red-700">{err}</p>}
      {loading && !read && <p className="mt-3 text-sm text-slate-400">…</p>}

      {read && (
        <div className="mt-3 space-y-3">
          {/* Layer 0 — verdict headline */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${CHIP[read.verdict]}`}>{bi(read.headline, L)}</span>
            <span className="text-[11px] text-slate-400">{confWord(read.confidence, L)} · {read.gradedN} {L === "IS" ? "leikir metnir" : "graded matches"}</span>
          </div>

          {/* Layer 1 — 2-3 plain facts */}
          <ul className="space-y-1">
            {read.facts.map((f, i) => <li key={i} className="text-[13px] text-slate-700">• {bi(f, L)}</li>)}
          </ul>

          {/* Layer 1.5 — V2 context-adjusted expected band */}
          {read.expected?.adjusted && read.expected.per90 != null && (() => {
            const e = read.expected!;
            const per90 = e.per90 as number;
            const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
            const drv: string[] = [];
            if (e.drivers.readiness != null) drv.push(`${L === "IS" ? "gulur/rauður" : "amber/red"} ${pct(e.drivers.readiness)}`);
            if (e.drivers.away != null) drv.push(`${L === "IS" ? "úti" : "away"} ${pct(e.drivers.away)}`);
            if (e.drivers.opponent != null) drv.push(`${L === "IS" ? "topp-4" : "top-4"} ${pct(e.drivers.opponent)}`);
            const resTone = e.residualPct == null ? "text-slate-600" : e.residualPct <= -0.15 ? "text-rose-700" : e.residualPct >= 0.10 ? "text-emerald-700" : "text-slate-600";
            return (
              <div className="rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-[12px] text-slate-700">
                <span className="font-semibold">{L === "IS" ? "Vænt (samhengis-leiðrétt)" : "Expected (context-adjusted)"}:</span>{" "}
                {bi(read.primaryMetric.label, L)}/90 ≈ <span className="tabular-nums font-semibold">{per90.toFixed(2)}</span>
                {e.residualPct != null && <> · <span className={resTone}>{L === "IS" ? "afgangur" : "residual"} {pct(e.residualPct)}</span></>}
                {drv.length > 0 && <div className="mt-0.5 text-[11px] text-slate-400">{L === "IS" ? "Drifið af" : "Drivers"}: {drv.join(", ")}</div>}
              </div>
            );
          })()}

          {/* Counterfactual */}
          {read.counterfactual && (
            <p className="rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[12.5px] text-blue-800">
              {read.expected?.adjusted
                ? (L === "IS" ? "Samhengis-leiðrétt" : "Adjusted for context")
                : (L === "IS" ? "Sé aðeins horft á hreina leiki" : "Reading his clean matches only")}: {bi(read.counterfactual, L)}
            </p>
          )}

          {/* Layer 2 — per-match table */}
          <button type="button" onClick={() => setDetails((d) => !d)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
            {details ? (L === "IS" ? "Fela leiki" : "Hide matches") : (L === "IS" ? `Sýna leiki (${read.perMatch.length})` : `Show matches (${read.perMatch.length})`)}
          </button>
          {details && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-2">{L === "IS" ? "Dags" : "Date"}</th>
                    <th className="py-1 pr-2">{L === "IS" ? "Andstæðingur" : "Opponent"}</th>
                    <th className="py-1 pr-2">{L === "IS" ? "H/Ú" : "H/A"}</th>
                    <th className="py-1 pr-2">{L === "IS" ? "Úrslit" : "Res"}</th>
                    <th className="py-1 pr-2">{L === "IS" ? "Stig andst." : "Opp lvl"}</th>
                    <th className="py-1 pr-2 text-right">OBV</th>
                    <th className="py-1 pl-2">Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {read.perMatch.map((m: TaggedMatch) => {
                    const dot = READ_DOT[colorClassOf(m.readinessColor) ?? ""] ?? "bg-slate-200";
                    return (
                      <tr key={m.date} className="border-b border-slate-100">
                        <td className="py-1 pr-2 tabular-nums text-slate-500">{m.date.slice(5)}</td>
                        <td className="py-1 pr-2 text-slate-700">{m.opponent ?? "—"}</td>
                        <td className="py-1 pr-2 text-slate-500">{m.homeAway === "home" ? (L === "IS" ? "H" : "H") : m.homeAway === "away" ? (L === "IS" ? "Ú" : "A") : "—"}</td>
                        <td className="py-1 pr-2 font-semibold text-slate-600">{m.result ?? "—"}</td>
                        <td className="py-1 pr-2 text-slate-500">{levelWord(m.opponentLevel, L)}</td>
                        <td className={`py-1 pr-2 text-right tabular-nums font-semibold ${m.output != null && m.output < 0 ? "text-red-600" : "text-slate-800"}`}>{m.output != null ? m.output.toFixed(2) : "—"}</td>
                        <td className="py-1 pl-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                            {m.readinessImputed && m.readinessColor ? <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase text-amber-700">{L === "IS" ? "~áætl" : "~est"}</span> : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {read.baselinePer90 != null && (
                <p className="mt-1 text-[11px] text-slate-400">{L === "IS" ? `Venja (OBV/90 tímabil): ${read.baselinePer90.toFixed(2)}. Per-leiks mínútur vantar → OBV-heild leiks ≈ per-90 hjá byrjunarliðsmanni.` : `Norm (season OBV/90): ${read.baselinePer90.toFixed(2)}. Per-match minutes absent → a match OBV total ≈ per-90 for a starter.`}</p>
              )}
            </div>
          )}

          <p className="border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
            {L === "IS"
              ? "Ráðgefandi greining á úttaki — hún býr ekki til nýjan dóm, snertir aldrei readiness-litinn né dagsákvörðunina. Reglur reikna merkinguna; áætlað readiness (~áætl) lækkar vissu. Robertson (RAG) · Modric 2019 · örhringrásar-samhengi · Saw o.fl."
              : "Advisory analysis of output — it creates no new verdict and never touches the readiness colour or the daily decision. Rules compute the tag; estimated readiness (~est) lowers confidence. Robertson (RAG) · Modric 2019 · microcycle context · Saw et al."}
          </p>
        </div>
      )}

      {/* Level-2 explainer (OBV glossary + the five verdicts) — behind its own toggle, so it travels with
          the panel wherever it's embedded (Total Player Analysis) without cluttering the primary read. */}
      <FormVsStateExplainer is={L === "IS"} />
    </div>
  );
}

/** Always-available, expandable in-page explainer — what OBV is, what each verdict means, how to read the
 *  table. Layer-2 detail per the explainability rules: behind a toggle. */
function FormVsStateExplainer({ is }: { is: boolean }) {
  const glossary: { term: string; def: string }[] = is
    ? [
        { term: "OBV (On-Ball Value)", def: "StatsBomb-tala fyrir sóknarvirði. Hver aðgerð með boltann (sending, burður, rekstur, skot, varnaraðgerð) fær plús eða mínus eftir því hversu mikið hún breytti líkum liðsins á að skora mínus að fá á sig — út frá því hvar boltinn byrjaði og endaði. Leiks-OBV = summan: ein tala um heildarvirði sem hann bætti við með boltanum. Ríkari en mörk/stoðsendingar því hún metur uppbygginguna líka." },
        { term: "Venja (OBV/90)", def: "Hans eigin tímabils-meðaltal á 90 mínútur — viðmiðið sem hver leikur er borinn saman við. Við berum leikmann saman við sjálfan sig, ekki við aðra." },
        { term: "Readiness-litur", def: "Canonical morgunlitur leikmannsins þann leikdag (grænn / gulur / rauður) úr readiness_entries — nákvæmlega sami litur og daglega yfirlitið sýnir. Gulur/rauður = líkamlega skertur þann dag." },
        { term: "Hreinn vs skertur leikur", def: "Hreinn = grænn OG ekki úti gegn toppliði. Skertur = gulur/rauður EÐA úti gegn toppliði. Lykillinn: dýfa í hreinum leikjum er form; dýfa aðeins í skertum leikjum er ástand + leikjaprógramm." },
        { term: "Stig andstæðings", def: "Úr njósnastöðu í deildinni: topp (sæti 1–4), mið (5–8), neðri (9+). „—“ þýðir að andstæðingurinn er enn ekki njósnaður." },
        { term: "~áætl", def: "Readiness-liturinn þann dag var reiknaður (ekki skráður inn af leikmanni). Lækkar vissu — við eignum ekki dýfu ástandi sem við giskuðum á." },
      ]
    : [
        { term: "OBV (On-Ball Value)", def: "StatsBomb's possession-value number. Each on-ball action (pass, carry, dribble, shot, defensive action) scores plus or minus by how much it changed his team's probability of scoring minus conceding — from where the ball started and ended. Match OBV = the sum: one number for the end-to-end value he added on the ball. Richer than goals/assists because it credits the build-up too." },
        { term: "Norm (OBV/90)", def: "His own season average per 90 minutes — the baseline every match is compared against. We compare a player to himself, not to others." },
        { term: "Readiness colour", def: "The player's canonical morning colour on that match day (green / amber / red) from readiness_entries — the exact colour the Daily Briefing shows. Amber/red = physically compromised that day." },
        { term: "Clean vs compromised match", def: "Clean = green AND not away-to-a-top-side. Compromised = amber/red OR away-to-a-top-side. The crux: a dip on clean matches is form; a dip only on compromised matches is state + the schedule." },
        { term: "Opponent level", def: "From the scouted league position: top (1–4), mid (5–8), low (9+). “—” means the opponent isn't scouted yet." },
        { term: "~est", def: "The readiness colour that day was estimated (not checked in by the player). Lowers confidence — we won't attribute a dip to a state we guessed." },
      ];

  const verdicts: { chip: string; cls: string; def: string }[] = is
    ? [
        { chip: "Skýrist af ástandi", cls: "border-blue-300 bg-blue-50 text-blue-700", def: "Úttakið datt, en dýfan lendir á gulum/rauðum eða úti-gegn-toppi leikjum — í hreinum leikjum heldur hann venju. Þetta er ekki form-viðvörun; talan var bæld af ástandi og leikjaprógrammi." },
        { chip: "Raunveruleg form-dýfa", cls: "border-red-300 bg-red-50 text-red-700", def: "Úttakið datt líka í hreinum leikjum (grænn, heima). Ástand útskýrir það ekki — þetta er raunverulegt form-/kunnáttu-merki sem er þess virði að skoða." },
        { chip: "Yfir-frammistaða þrátt fyrir skert ástand", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Yfir venju þrátt fyrir háa skerts-hlutdeild. Raunverulega frábært — hann skilaði virði þegar líkaminn og leikirnir voru á móti honum." },
        { chip: "Stöðugt", cls: "border-slate-300 bg-slate-50 text-slate-600", def: "Úttak er nálægt venju hans — engin marktæk dýfa eða toppur að skýra." },
        { chip: "Ekki nóg enn", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Færri en 4 metnir leikir (úttak + readiness), eða engin venja enn. Við sýnum merktu söguna en gefum EKKI dóm — heiðarlegra en að giska. Lifnar við eftir því sem fleiri per-leiks gögn eru skráð." },
      ]
    : [
        { chip: "Explained by state", cls: "border-blue-300 bg-blue-50 text-blue-700", def: "Output dipped, but the dip lands on amber/red or away-to-top matches — on clean matches he holds his norm. This is not a form flag; the number was suppressed by state and the schedule." },
        { chip: "Genuine form dip", cls: "border-red-300 bg-red-50 text-red-700", def: "Output dipped on clean matches too (green, home). State does not explain it — this is a real form/skill signal worth a look." },
        { chip: "Over-performing while compromised", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Above his norm despite a high compromised-share. Genuinely excellent — he delivered value when his body and the fixtures were against him." },
        { chip: "Steady", cls: "border-slate-300 bg-slate-50 text-slate-600", def: "Output sits near his norm — no meaningful dip or spike to explain." },
        { chip: "Not enough yet", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Fewer than 4 graded matches (output + readiness), or no norm yet. We show the tagged history but give NO verdict — more honest than guessing. It lights up as more per-match data is entered." },
      ];

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-[13px] font-semibold text-slate-800">
          {is ? "Hvað er ég að skoða? OBV, dómarnir og taflan útskýrð" : "What am I looking at? OBV, the verdicts and the table explained"}
        </span>
        <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
      </summary>
      <div className="space-y-5 border-t border-slate-100 px-4 py-4">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Orðin á síðunni" : "The words on this page"}</h3>
          <dl className="mt-2 space-y-2.5">
            {glossary.map((g) => (
              <div key={g.term}>
                <dt className="text-[13px] font-semibold text-slate-900">{g.term}</dt>
                <dd className="text-[12.5px] leading-relaxed text-slate-600">{g.def}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Dómarnir fimm" : "The five verdicts"}</h3>
          <ul className="mt-2 space-y-2.5">
            {verdicts.map((v) => (
              <li key={v.chip} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className={`inline-block shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${v.cls}`}>{v.chip}</span>
                <span className="text-[12.5px] leading-relaxed text-slate-600">{v.def}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
          {is
            ? "Af hverju bara fáir leikir? OBV kemur úr per-leikmanns StatsBomb-skrám og flestir leikir eru enn aðeins skráðir á liðs-stigi — því sýna flestir leikmenn „ekki nóg enn“ í dag. Þetta lifnar við sjálfkrafa eftir því sem fleiri per-leiks leikmannaskrár eru fluttar inn."
            : "Why only a few matches? OBV comes from per-player StatsBomb files and most matches are still entered only at team level — so most players read “not enough yet” today. This fills in automatically as more per-match player files are ingested."}
        </p>
      </div>
    </details>
  );
}
