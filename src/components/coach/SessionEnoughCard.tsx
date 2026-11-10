"use client";

/**
 * SessionEnoughCard — "Did we do enough?" after a training session (Vector Pro football).
 * Layered read: (0) verdict → (1) 2–3 plain facts + confidence + counterfactual + six bars →
 * (2) per-player / week-so-far / method behind "Show details". Rules decide (sessionEnough engine);
 * descriptive only — never the readiness colour.
 */

import ShowDetails from "@/components/common/ShowDetails";
import { useLang } from "@/lib/lang";
import type { PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import {
  ENOUGH_LABEL, ENOUGH_TECH, ENOUGH_VARS, DAY_TYPE_LABEL, isContextOnly,
  type SessionEnough, type PlayerVerdict, type TeamVerdict,
} from "@/lib/micropulse/sessionEnough";

type Bi = { en: string; is: string };

const VERDICT_TONE: Record<TeamVerdict, string> = {
  yes: "border-emerald-500 bg-emerald-50 text-emerald-900",
  mostly: "border-amber-400 bg-amber-50 text-amber-900",
  no: "border-rose-500 bg-rose-50 text-rose-900",
};
const VERDICT_WORD: Record<TeamVerdict, Bi> = {
  yes: { en: "Enough", is: "Nóg" }, mostly: { en: "Mostly", is: "Að mestu" }, no: { en: "Not enough", is: "Ekki nóg" },
};
const BAR: Record<PvaStatus, string> = {
  on: "bg-emerald-500", over: "bg-emerald-500", well_over: "bg-amber-400",
  under: "bg-amber-400", well_under: "bg-rose-500", na: "bg-slate-300",
};
const CELL: Record<PvaStatus, string> = {
  on: "text-emerald-700", over: "text-emerald-700", well_over: "text-amber-700",
  under: "text-amber-700", well_under: "text-rose-700", na: "text-slate-400",
};
const PLAYER_WORD: Record<PlayerVerdict, Bi> = {
  enough: { en: "enough", is: "nóg" }, partly: { en: "partly", is: "að hluta" }, short: { en: "short", is: "vantaði" },
  partial_session: { en: "shortened session", is: "styttri æfing" }, recovery: { en: "recovering", is: "í endurheimt" }, no_data: { en: "no data", is: "engin gögn" },
};
const PLAYER_TINT: Record<PlayerVerdict, string> = {
  enough: "bg-emerald-100 text-emerald-800", partly: "bg-amber-100 text-amber-800", short: "bg-rose-100 text-rose-800",
  partial_session: "bg-slate-100 text-slate-600", recovery: "bg-sky-100 text-sky-800", no_data: "bg-slate-100 text-slate-500",
};
const CONF: Record<"high" | "moderate" | "low", { word: Bi; tone: string }> = {
  high: { word: { en: "high", is: "há" }, tone: "border-emerald-200 bg-emerald-100 text-emerald-800" },
  moderate: { word: { en: "moderate", is: "miðlungs" }, tone: "border-amber-200 bg-amber-100 text-amber-800" },
  low: { word: { en: "low", is: "lág" }, tone: "border-slate-200 bg-slate-100 text-slate-600" },
};

const fmt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

export default function SessionEnoughCard({ enough }: { enough: SessionEnough | null }) {
  const [lang] = useLang();
  const IS = lang === "IS";
  const L = (b: Bi) => (IS ? b.is : b.en);
  if (!enough || enough.state === "not_available") return null;

  const title = L({ en: "Did we do enough?", is: "Gerðum við nóg?" });
  const sub = L({
    en: "This session's movement vs what a match demands, scaled to the day.",
    is: "Hreyfing æfingarinnar miðað við kröfur leiks, kvarðað að deginum.",
  });

  if (enough.state !== "ok" && enough.state !== "no_md") {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{L(enough.headline)}</p>
      </div>
    );
  }

  const v = enough.verdict;
  const conf = CONF[enough.confidence.level];
  const judged = enough.players.filter((p) => p.verdict !== "partial_session" && p.verdict !== "recovery" && p.verdict !== "no_data");
  const shown = [...enough.players].sort((a, b) => {
    const rank: Record<PlayerVerdict, number> = { short: 0, partly: 1, enough: 2, recovery: 3, partial_session: 4, no_data: 5 };
    return rank[a.verdict] - rank[b.verdict] || a.name.localeCompare(b.name);
  });

  const stdTarget = enough.team.find((t) => t.focus && t.basis === "day_type");
  // Long runs, shown not judged: "6 per player, 1 at match pace" (squad medians).
  const lrN = enough.team.find((t) => t.key === "longRuns")?.actual ?? null;
  const lrMp = enough.team.find((t) => t.key === "longRunsMp")?.actual ?? null;
  const longRunLine = lrN == null ? null : lrMp == null
    ? { en: `Long runs: ${lrN} per player, pace unknown (no GPS). Shown, not judged.`, is: `Löng hlaup: ${lrN} á leikmann, hraði óþekktur (ekkert GPS). Sýnt, ekki metið.` }
    : { en: `Long runs: ${lrN} per player, ${lrMp} at match pace. Shown, not judged: in training most long runs are jogs.`, is: `Löng hlaup: ${lrN} á leikmann, ${lrMp} á leikhraða. Sýnt, ekki metið: á æfingu eru flest löng hlaup skokk.` };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {enough.mdLabel && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{enough.mdLabel}</span>}
        {enough.dayType && <span className="rounded-md bg-[#2740e6]/10 px-2 py-0.5 text-xs font-semibold text-[#2740e6]" title={L({ en: "The planned day-type decides which movement types are judged, and how much of a match is expected in accelerations, braking and changes of direction.", is: "Skipulögð dagsgerð ræður hvaða hreyfiþættir eru metnir og hve mikils af leik er vænst í hröðun, hemlun og stefnubreytingum." })}>{L(DAY_TYPE_LABEL[enough.dayType])}</span>}
        {stdTarget?.targetPct != null ? (
          <span className="text-xs text-slate-400" title={L({ en: "The same standard the Meso calendar plans from (Stevens 2017, Martín-García 2018).", is: "Sami staðall og Meso-dagatalið notar (Stevens 2017, Martín-García 2018)." })}>
            {stdTarget.key === "hsr" || stdTarget.key === "sprint"
              ? L({ en: `about ${stdTarget.targetPct}% of a match in high-speed running and sprinting`, is: `um ${stdTarget.targetPct}% af leik í háhraðahlaupi og sprettum` })
              : L({ en: `about ${stdTarget.targetPct}% of a match in accelerations, braking, changes of direction`, is: `um ${stdTarget.targetPct}% af leik í hröðun, hemlun, stefnubreytingum` })}
          </span>
        ) : enough.matchPct != null && (
          <span className="text-xs text-slate-400" title={L({ en: "How big a session this MD-day should be, as a share of a match (Buchheit 2024).", is: "Hve stór æfing þessi MD-dagur á að vera, sem hlutfall af leik (Buchheit 2024)." })}>
            {L({ en: `day ≈ ${enough.matchPct}% of a match`, is: `dagur ≈ ${enough.matchPct}% af leik` })}
          </span>
        )}
        {enough.sessionDate && <span className="ml-auto text-xs text-slate-400">{enough.sessionDate}</span>}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>

      {/* (0) Verdict */}
      <div className={`mt-3 rounded-lg border-l-4 px-3 py-2 ${v ? VERDICT_TONE[v] : "border-slate-300 bg-slate-50 text-slate-800"}`}>
        {v && <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{L(VERDICT_WORD[v])}</div>}
        <div className="text-[15px] font-semibold leading-snug">{L(enough.headline)}</div>
      </div>

      {enough.focusNote && <p className="mt-2 text-[12.5px] font-medium text-slate-600">{L(enough.focusNote)}</p>}

      {/* (1) The plain why */}
      {enough.facts.length > 0 && (
        <ul className="mt-2.5 space-y-1 text-sm text-slate-700">
          {enough.facts.map((f, i) => <li key={i} className="flex gap-2"><span className="text-slate-300">•</span><span>{L(f)}</span></li>)}
        </ul>
      )}
      {enough.counterfactual && <p className="mt-2 text-[13px] text-slate-600"><span className="font-medium text-slate-800">{L({ en: "What would have flipped it: ", is: "Hvað hefði snúið því: " })}</span>{L(enough.counterfactual)}</p>}
      {enough.overNote && <p className="mt-1.5 text-[12px] text-amber-800">{L(enough.overNote)}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${conf.tone}`} title={L(enough.confidence.note)}>
          {L({ en: "Confidence", is: "Vissa" })}: {L(conf.word)}
        </span>
        <span className="text-[11px] text-slate-400">{L(enough.confidence.note)}</span>
      </div>

      {/* Bars for the judged movement types — % of the day's target (marker = target). Long runs are info only
          (in training most are jogs): one plain line under the bars, the numbers in the details below. */}
      <div className="mt-3 space-y-1.5">
        {enough.team.filter((t) => !isContextOnly(t.key)).map((t) => {
          const judgedVar = !!v && t.focus;
          const pct = judgedVar ? t.pctOfTarget : t.pctOfMatch;
          const w = pct == null ? 0 : Math.min(100, (pct / 150) * 100);
          return (
            <div key={t.key} className={`grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2 text-xs ${v && !t.focus ? "opacity-60" : ""}`}>
              <span className="truncate text-slate-700" title={ENOUGH_TECH[t.key]}>{L(ENOUGH_LABEL[t.key])}</span>
              <div className="relative h-2.5 rounded-full bg-slate-100">
                <div className={`absolute inset-y-0 left-0 rounded-full ${judgedVar ? BAR[t.status] : "bg-slate-400"}`} style={{ width: `${w}%` }} />
                {judgedVar && <div className="absolute inset-y-[-2px] w-px bg-slate-700" style={{ left: `${(100 / 150) * 100}%` }} title={L({ en: "The day's target", is: "Markmið dagsins" })} />}
              </div>
              <span className="w-[8.5rem] text-right tabular-nums text-slate-600">
                {pct == null ? "—" : judgedVar
                  ? <>{pct}% <span className="text-slate-400">{L({ en: "of target", is: "af markmiði" })}</span></>
                  : <>{pct}% <span className="text-slate-400">{v ? L({ en: "of a match · not today's focus", is: "af leik · ekki áhersla dagsins" }) : L({ en: "of a match", is: "af leik" })}</span></>}
              </span>
            </div>
          );
        })}
      </div>

      {longRunLine && <p className="mt-2 text-[12px] text-slate-500" title={L({ en: "Long run = 18 s or more without stopping (IMA Free Running). Match pace = 11 km/h or faster, the slowest tenth of the team's own match long runs.", is: "Langt hlaup = 18 sek eða lengur án þess að stoppa (IMA Free Running). Leikhraði = 11 km/klst eða hraðar, hægasti tíundi hluti langra hlaupa liðsins í leikjum." })}>{L(longRunLine)}</p>}

      {/* (2) Behind the numbers */}
      <ShowDetails label={{ EN: "Show details — per player, week so far, how it's calculated", IS: "Sýna nánar — hver leikmaður, vikan, útreikningur" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200 text-left">
                <th className="py-1 pr-2 font-semibold">{L({ en: "Movement", is: "Hreyfing" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Session", is: "Æfing" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Day target", is: "Markmið dags" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Target % of a match", is: "Markmið % af leik" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Match", is: "Leikur" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "% of a match", is: "% af leik" })}</th>
              </tr>
            </thead>
            <tbody>
              {enough.team.map((t) => (
                <tr key={t.key} className="border-b border-slate-100">
                  <td className="py-1 pr-2 text-slate-800" title={ENOUGH_TECH[t.key]}>{L(ENOUGH_LABEL[t.key])}</td>
                  <td className="py-1 pr-2 text-right font-semibold tabular-nums text-slate-900">{fmt(t.actual)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{fmt(t.dayTarget)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{t.targetPct == null ? "—" : `${t.targetPct}%`}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{fmt(t.matchRef)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{t.pctOfMatch == null ? "—" : `${t.pctOfMatch}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-400">{L({ en: "Squad medians of players with a full session.", is: "Miðgildi leikmanna með fulla æfingu." })}</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="mb-1 text-xs font-semibold text-slate-700">{L({ en: `Per player (${judged.length} judged)`, is: `Hver leikmaður (${judged.length} metnir)` })}</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1 text-left">{L({ en: "Player", is: "Leikmaður" })}</th>
                {ENOUGH_VARS.map((k) => <th key={k} className="px-2 py-1 text-right" title={ENOUGH_TECH[k]}>{L(ENOUGH_LABEL[k])}</th>)}
                <th className="px-2 py-1 text-left">{L({ en: "Verdict", is: "Mat" })}</th>
                <th className="px-2 py-1 text-left">{L({ en: "Match reference", is: "Leikviðmið" })}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.playerId} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-2 py-1 font-medium text-slate-800">{p.name}</td>
                  {ENOUGH_VARS.map((k) => {
                    const c = p.byVar[k];
                    return (
                      <td key={k} className={`whitespace-nowrap px-2 py-1 text-right tabular-nums ${c.focus ? "" : "opacity-50"}`}>
                        <span className={c.focus && !p.recovering ? CELL[c.status] : "text-slate-500"}>{fmt(c.actual)}</span>
                        <span className="text-[10px] text-slate-400"> / {fmt(c.dayTarget ?? c.matchRef)}</span>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-2 py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PLAYER_TINT[p.verdict]}`}>{L(PLAYER_WORD[p.verdict])}</span></td>
                  <td className="whitespace-nowrap px-2 py-1 text-slate-500">
                    {p.refSource === "own"
                      ? L({ en: `own · ${p.refMatches} matches`, is: `eigin · ${p.refMatches} leikir` })
                      : L({ en: "team (too few own matches)", is: "liðið (of fáir eigin leikir)" })}
                    {p.lastMatchMinutes != null && enough.dayType === "topup" ? ` · ${p.lastMatchMinutes}′` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-400">{L({ en: "Each cell: session / the day's target for that player. Colour: green ≥85% of target, amber 60–84%, red <60%. Faded columns are not judged today. Long runs (count, at match pace, distance, strides) are never judged: in training most long runs are jogs.", is: "Hver reitur: æfing / markmið dagsins fyrir leikmanninn. Litur: grænn ≥85% af markmiði, gulur 60–84%, rauður <60%. Daufir dálkar eru ekki metnir í dag. Löng hlaup (fjöldi, á leikhraða, vegalengd, skref) eru aldrei metin: á æfingu eru flest löng hlaup skokk." })}</p>
        </div>

        {enough.week && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-slate-700">{L({ en: `Week so far — ${enough.week.sessions} sessions since the match`, is: `Vikan hingað til — ${enough.week.sessions} æfingar frá leik` })}</div>
            <table className="w-full text-xs">
              <tbody>
                {enough.week.vars.map((w) => (
                  <tr key={w.key} className="border-t border-slate-100">
                    <td className="py-1 pr-2 text-slate-800">{L(ENOUGH_LABEL[w.key])}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-slate-700">{w.timesMatch == null ? "—" : `${w.timesMatch}×`} <span className="text-slate-400">{L({ en: "a match", is: "leikur" })}</span></td>
                    <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{L({ en: "planned by now", is: "áætlað núna" })} {w.targetTimesMatch}×</td>
                    <td className={`py-1 pr-2 text-right font-semibold tabular-nums ${CELL[w.status]}`}>{w.pctOfTarget == null ? "—" : `${w.pctOfTarget}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
          <div className="mb-1 font-semibold text-slate-700">{L({ en: "How this is calculated", is: "Hvernig þetta er reiknað" })}</div>
          <p>{L({
            en: "Each player's match reference is the median of the player's own near-full matches (≥80 min, last ~11 weeks; the team's when there are fewer than 3). The planned day-type sets WHAT is judged: Mechanical = accelerations, braking, changes of direction; Locomotive = the number of long runs (continuous runs of 18 s or more); Mixed / Activation = accelerations, braking, changes of direction and the number of long runs; Top-up (MD+1) = starters (60+ min) recover, the rest are judged. The day-type also sets the target for accelerations, braking and changes of direction, the same standard the Meso calendar plans from: Mechanical 80% of a match, Mixed 60%, Top-up 55%, Locomotive 50%, Activation 38%. These come from studies of elite teams (Stevens 2017, Martín-García 2018), which describe what those teams do rather than prove what is best; no study measures IMA change of direction directly, so it follows the same share. Long runs are sized by the MD-day, as is everything when no day-type is planned. The count comes from the inertial sensor and exists indoors. Distance and strides in long runs are shown but never judged: Catapult's top Free Running band now runs to 1000 s, so a warm-up jog of several minutes counts as a long run; that barely changes the count but added about a third to training-day distance and strides (matches under 1%). Enough = at least 85% of the target, roughly the low end of the published range. Partial sessions (<60% of the squad's duration) are shown but not judged. Running hotter than the day is a note, not a fail.",
            is: "Leikviðmið hvers leikmanns er miðgildi hans eigin næstum-heilu leikja (≥80 mín, síðustu ~11 vikur; liðsins ef þeir eru færri en 3). Skipulögð dagsgerð ræður HVAÐ er metið: Mechanical = hröðun, hemlun, stefnubreytingar; Locomotive = fjöldi langra hlaupa (samfelld hlaup í 18 sek eða lengur); Mixed / Virkjun = hröðun, hemlun, stefnubreytingar og fjöldi langra hlaupa; Uppbót (MD+1) = byrjunarlið (60+ mín) í endurheimt, hinir metnir. Dagsgerðin ræður líka markmiðinu í hröðun, hemlun og stefnubreytingum, sami staðall og Meso-dagatalið notar: Mechanical 80% af leik, Mixed 60%, Uppbót 55%, Locomotive 50%, Virkjun 38%. Tölurnar koma úr rannsóknum á úrvalsliðum (Stevens 2017, Martín-García 2018) sem lýsa því hvað þau gera en sanna ekki hvað er best; engin rannsókn mælir IMA-stefnubreytingar beint, svo þær fylgja sama hlutfalli. MD-dagurinn ræður stærð markmiðs í löngum hlaupum, og í öllu þegar engin dagsgerð er skipulögð. Fjöldinn kemur úr hreyfiskynjaranum og mælist innanhúss. Vegalengd og skref í löngum hlaupum eru sýnd en aldrei metin: efsta Free Running bandið hjá Catapult nær nú upp í 1000 sek, svo upphitunarskokk í nokkrar mínútur telst langt hlaup; það breytir fjöldanum varla en bætti um þriðjungi við vegalengd og skref á æfingadögum (leikir undir 1%). Nóg = a.m.k. 85% af markmiði, um það bil neðri mörk birta bilsins. Styttri æfingar (<60% af lengd hópsins) eru sýndar en ekki metnar. Meira en dagurinn kallar á er athugasemd, ekki fall.",
          })}</p>
          <p className="mt-1.5 text-slate-500">{L({ en: "Sources: ", is: "Heimildir: " })}{enough.citations.join(" · ")}</p>
        </div>
      </ShowDetails>
    </div>
  );
}
