"use client";

/**
 * MatchIntensityPlayerModal
 *
 * Pop-up drill-down for one player's 1st-vs-2nd-half IMA fade. Lets the coach
 * switch between his SEASON typical and any INDIVIDUAL match, and get an AI
 * explanation scoped to whatever is selected. The client sends only the
 * selection (playerId + optional matchDate) to the narrative route — the server
 * re-computes every number, so the AI can only rephrase real figures. Labelled
 * AI; rules decide, AI explains. Conditioning / rotation context (Akenhead 2013;
 * Mohr 2003) — never a readiness verdict or injury prediction.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { PlayerFade, TeamFade, MovementDriver } from "@/lib/micropulse/matchIntensityHalves";

const DRIVER_LABEL: Record<MovementDriver, { en: string; is: string }> = {
  accel: { en: "accelerations", is: "hröðunum" },
  decel: { en: "decelerations", is: "hemlunum" },
  cod: { en: "changes of direction", is: "stefnubreytingum" },
};

function fadeTone(pct: number | null): { dot: string; text: string } {
  if (pct == null) return { dot: "#94a3b8", text: "text-slate-400" };
  if (pct <= -40) return { dot: "#a83e28", text: "text-rose-700" };
  if (pct <= -25) return { dot: "#de9328", text: "text-amber-700" };
  return { dot: "#1c7a4a", text: "text-emerald-700" };
}
function pctStr(p: number | null): string {
  if (p == null) return "–";
  return `${p > 0 ? "+" : ""}${Math.round(p)}%`;
}

function HalfBars({ h1, h2, is }: { h1: number; h2: number; is: boolean }) {
  const max = Math.max(h1, h2, 0.0001);
  const row = (label: string, v: number, color: string) => (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[11px] text-slate-500">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
        <div className="h-full rounded" style={{ width: `${(v / max) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-slate-600">{v.toFixed(2)}</span>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {row(is ? "1.hl" : "1st", h1, "#2740e6")}
      {row(is ? "2.hl" : "2nd", h2, "#7a5cc4")}
    </div>
  );
}

export default function MatchIntensityPlayerModal({
  player,
  team,
  is,
  onClose,
}: {
  player: PlayerFade;
  team: TeamFade | null;
  is: boolean;
  onClose: () => void;
}) {
  // null = season typical (all matches); otherwise a specific match date.
  const [matchDate, setMatchDate] = React.useState<string | null>(null);
  // AI cache keyed by scope, so switching scope shows the right answer and never
  // a stale one. sig = playerId | lang | matchDate("" for season).
  const [ai, setAi] = React.useState<{ sig: string; text: string } | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiErr, setAiErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const focus = matchDate ? player.matches.find((m) => m.sessionDate === matchDate) ?? null : null;
  const sig = `${player.playerId}|${is ? "IS" : "EN"}|${matchDate ?? ""}`;

  const genAi = async () => {
    setAiBusy(true); setAiErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error(is ? "Ekki innskráð(ur)." : "Not signed in.");
      const res = await fetch(`/api/coach/team/match-intensity-halves/narrative`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId: player.playerId, lang: is ? "IS" : "EN", matchDate }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      if (j.text) setAi({ sig, text: j.text as string });
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiBusy(false);
    }
  };

  // The figures for the scope in view (season typical, or the focused match).
  const headlinePct = focus ? focus.pctChangeHigh : player.typicalPctChangeHigh;
  const h1 = focus ? focus.h1HighPerMin : player.meanH1HighPerMin ?? 0;
  const h2 = focus ? focus.h2HighPerMin : player.meanH2HighPerMin ?? 0;
  const driver = focus ? focus.driver : player.driver;
  const vsSquad = team && headlinePct != null ? Math.round(headlinePct - team.pctChangeHigh) : null;
  const vsSquadTxt =
    vsSquad == null ? null
      : vsSquad <= -8 ? (is ? "brattara fall en liðið" : "steeper fade than the squad")
        : vsSquad >= 8 ? (is ? "heldur betur en liðið" : "holds up better than the squad")
          : (is ? "í takt við liðið" : "in line with the squad");

  const tone = fadeTone(headlinePct);

  // Render into a portal on <body> so `position: fixed` is viewport-relative even
  // if an ancestor uses CSS transform (which would otherwise trap the overlay).
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${player.playerName} — ${is ? "leikákefð" : "match intensity"}`}
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {player.playerName}
              {player.position && <span className="ml-1.5 text-xs font-normal text-slate-400">{player.position}</span>}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {is ? "Leikákefð — fyrri vs seinni hálfleikur · á mínútu" : "Match intensity — 1st vs 2nd half · per minute"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            aria-label={is ? "Loka" : "Close"}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Scope selector: season typical + one chip per match */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {is ? "Sýna" : "Show"}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMatchDate(null)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  matchDate == null ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {is ? `Dæmigert (${player.nMatches} leikir)` : `Typical (${player.nMatches} matches)`}
              </button>
              {player.matches.map((m) => (
                <button
                  key={m.sessionDate}
                  type="button"
                  onClick={() => setMatchDate(m.sessionDate)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    matchDate === m.sessionDate ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {m.sessionDate}
                  <span className={fadeTone(m.pctChangeHigh).text}>{pctStr(m.pctChangeHigh)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Headline verdict for the scope in view */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} aria-hidden />
              <span className="text-[13px] text-slate-800">
                {focus
                  ? (is ? `Þessi leikur (${focus.sessionDate}): seinni-hálfleikur háákefð ` : `This match (${focus.sessionDate}): 2nd-half high-intensity `)
                  : (is ? "Dæmigert: seinni-hálfleikur háákefð " : "Typical: 2nd-half high-intensity ")}
                <b className={tone.text}>{pctStr(headlinePct)}</b>
                <span className="ml-1 text-slate-500">({h1.toFixed(2)} → {h2.toFixed(2)} {is ? "á mín" : "per min"})</span>
              </span>
            </div>
            {vsSquadTxt && team && (
              <p className="mt-1 text-[11px] text-slate-500">
                {is ? "Liðið dæmigert " : "Squad typical "}
                <span className={fadeTone(team.pctChangeHigh).text}>{pctStr(team.pctChangeHigh)}</span>
                {" — "}{vsSquadTxt}.
              </p>
            )}
            {driver && (
              <p className="mt-0.5 text-[11px] text-slate-500">
                {is ? `Mest lækkun í ${DRIVER_LABEL[driver].is}.` : `${DRIVER_LABEL[driver].en[0].toUpperCase()}${DRIVER_LABEL[driver].en.slice(1)} dropped most.`}
              </p>
            )}
            {focus == null && player.confidence === "building" && (
              <p className="mt-0.5 text-[11px] italic text-amber-600">
                {is ? "Fá leiki enn — lestu sem stefnu, ekki niðurstöðu." : "Few matches yet — read as a direction, not a conclusion."}
              </p>
            )}
            <div className="mt-2"><HalfBars h1={h1} h2={h2} is={is} /></div>
            {focus && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                <span>{is ? "Heildar-IMA/mín fall" : "Total IMA/min fade"} {pctStr(focus.pctChangeTotal)}</span>
                {focus.h1HirPerMin != null && focus.h2HirPerMin != null && (
                  <span>HIR/min {focus.h1HirPerMin.toFixed(2)}→{focus.h2HirPerMin.toFixed(2)}</span>
                )}
                {focus.h1PlPerMin != null && focus.h2PlPerMin != null && (
                  <span>PL/min {focus.h1PlPerMin.toFixed(1)}→{focus.h2PlPerMin.toFixed(1)}</span>
                )}
              </div>
            )}
          </div>

          {/* AI explanation, scoped to the selection */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
                <span>✨</span>{is ? "AI útskýring" : "AI explanation"}
                <span className="ml-1 text-[10px] font-normal text-indigo-700/70">
                  {focus ? (is ? "· þessi leikur" : "· this match") : (is ? "· yfir tímabilið" : "· across the season")}
                </span>
              </div>
              {(!ai || ai.sig !== sig) && (
                <button
                  type="button"
                  onClick={genAi}
                  disabled={aiBusy}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {aiBusy ? (is ? "Skrifa…" : "Writing…") : (is ? "Útskýra" : "Explain")}
                </button>
              )}
            </div>
            {aiErr && <div className="mt-2 text-xs text-red-600">{aiErr}</div>}
            {ai && ai.sig === sig ? (
              <>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{ai.text}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-indigo-700">AI</span>
                  {is ? "Skrifað úr endurreiknuðum hálfleikja-tölum. AI útskýrir — reglur ráða." : "Written from the re-computed half-by-half numbers. AI explains — rules decide."}
                </div>
              </>
            ) : !aiBusy && !aiErr ? (
              <p className="mt-1 text-xs text-indigo-700/70">
                {focus
                  ? (is ? "Fáðu útskýringu á þessum leik borið saman við hans venju og liðið." : "Get an explanation of this match against his norm and the squad.")
                  : (is ? "Fáðu útskýringu á dæmigerðu falli hans yfir tímabilið." : "Get an explanation of his typical fade across the season.")}
              </p>
            ) : null}
          </div>

          {/* Framing footer */}
          <p className="text-[10px] leading-snug text-slate-400">
            {is
              ? "Háákefðar hreyfing minnkar yfir hálfleiki (Akenhead 2013; Mohr o.fl. 2003). Úthalds-/skiptinga-innsæi — ekki meiðslaspá og hreyfir aldrei readiness-litinn."
              : "High-intensity output declines across match halves (Akenhead 2013; Mohr et al. 2003). A conditioning/rotation insight — not injury prediction, and it never moves the readiness colour."}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
