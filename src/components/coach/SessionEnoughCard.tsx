"use client";

/**
 * SessionEnoughCard — "Did we do enough?" after a training session (Vector Pro football).
 * Layered read: (0) verdict → (1) 2–3 plain facts + confidence + counterfactual + five bars →
 * (2) per-player / week-so-far / method behind "Show details". Rules decide (sessionEnough engine);
 * descriptive only — never the readiness colour.
 */

import ShowDetails from "@/components/common/ShowDetails";
import { useLang } from "@/lib/lang";
import type { PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import {
  ENOUGH_LABEL, ENOUGH_TECH, ENOUGH_VARS,
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
  partial_session: { en: "shortened session", is: "styttri æfing" }, no_data: { en: "no data", is: "engin gögn" },
};
const PLAYER_TINT: Record<PlayerVerdict, string> = {
  enough: "bg-emerald-100 text-emerald-800", partly: "bg-amber-100 text-amber-800", short: "bg-rose-100 text-rose-800",
  partial_session: "bg-slate-100 text-slate-600", no_data: "bg-slate-100 text-slate-500",
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
  const judged = enough.players.filter((p) => p.verdict !== "partial_session" && p.verdict !== "no_data");
  const shown = [...enough.players].sort((a, b) => {
    const rank: Record<PlayerVerdict, number> = { short: 0, partly: 1, enough: 2, partial_session: 3, no_data: 4 };
    return rank[a.verdict] - rank[b.verdict] || a.name.localeCompare(b.name);
  });

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {enough.mdLabel && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{enough.mdLabel}</span>}
        {enough.matchPct != null && (
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

      {/* Five bars — % of the day's target (marker = target) */}
      <div className="mt-3 space-y-1.5">
        {enough.team.map((t) => {
          const pct = v ? t.pctOfTarget : t.pctOfMatch;
          const w = pct == null ? 0 : Math.min(100, (pct / 150) * 100);
          return (
            <div key={t.key} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate text-slate-700" title={ENOUGH_TECH[t.key]}>{L(ENOUGH_LABEL[t.key])}</span>
              <div className="relative h-2.5 rounded-full bg-slate-100">
                <div className={`absolute inset-y-0 left-0 rounded-full ${v ? BAR[t.status] : "bg-slate-400"}`} style={{ width: `${w}%` }} />
                {v && <div className="absolute inset-y-[-2px] w-px bg-slate-700" style={{ left: `${(100 / 150) * 100}%` }} title={L({ en: "The day's target", is: "Markmið dagsins" })} />}
              </div>
              <span className="w-[8.5rem] text-right tabular-nums text-slate-600">
                {pct == null ? "—" : v
                  ? <>{pct}% <span className="text-slate-400">{L({ en: "of target", is: "af markmiði" })}</span></>
                  : <>{pct}% <span className="text-slate-400">{L({ en: "of a match", is: "af leik" })}</span></>}
              </span>
            </div>
          );
        })}
      </div>

      {/* (2) Behind the numbers */}
      <ShowDetails label={{ EN: "Show details — per player, week so far, how it's calculated", IS: "Sýna nánar — hver leikmaður, vikan, útreikningur" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200 text-left">
                <th className="py-1 pr-2 font-semibold">{L({ en: "Movement", is: "Hreyfing" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Session", is: "Æfing" })}</th>
                <th className="py-1 pr-2 text-right font-semibold">{L({ en: "Day target", is: "Markmið dags" })}</th>
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
                      <td key={k} className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                        <span className={CELL[c.status]}>{fmt(c.actual)}</span>
                        <span className="text-[10px] text-slate-400"> / {fmt(c.dayTarget ?? c.matchRef)}</span>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-2 py-1"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PLAYER_TINT[p.verdict]}`}>{L(PLAYER_WORD[p.verdict])}</span></td>
                  <td className="whitespace-nowrap px-2 py-1 text-slate-500">
                    {p.refSource === "own"
                      ? L({ en: `own · ${p.refMatches} matches`, is: `eigin · ${p.refMatches} leikir` })
                      : L({ en: "team (too few own matches)", is: "liðið (of fáir eigin leikir)" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-400">{L({ en: "Each cell: session / the day's target for that player. Colour: green ≥85% of target, amber 60–84%, red <60%.", is: "Hver reitur: æfing / markmið dagsins fyrir leikmanninn. Litur: grænn ≥85% af markmiði, gulur 60–84%, rauður <60%." })}</p>
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
            en: "Each player's match reference is the median of the player's own near-full matches (≥80 min, last ~11 weeks; the team's when there are fewer than 3). The day's target is that match value × the share of a match this MD-day should deliver — the share tapers per movement type (fast running drops more on light days, fast strides less). Enough = at least 85% of the target. Partial sessions (<60% of the squad's duration) are shown but not judged. Running hotter than the day is a note, not a fail.",
            is: "Leikviðmið hvers leikmanns er miðgildi hans eigin næstum-heilu leikja (≥80 mín, síðustu ~11 vikur; liðsins ef hann á færri en 3). Markmið dagsins er það leikgildi × hlutfallið af leik sem þessi MD-dagur á að gefa — hlutfallið er mismunandi eftir hreyfiþætti (hraðhlaup minnkar meira á léttum dögum, hröð skref minna). Nóg = a.m.k. 85% af markmiði. Styttri æfingar (<60% af lengd hópsins) eru sýndar en ekki metnar. Meira en dagurinn kallar á er athugasemd, ekki fall.",
          })}</p>
          <p className="mt-1.5 text-slate-500">{L({ en: "Sources: ", is: "Heimildir: " })}{enough.citations.join(" · ")}</p>
        </div>
      </ShowDetails>
    </div>
  );
}
