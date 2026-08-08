"use client";

/**
 * Match Intensity — 1st vs 2nd half (IMA fade across the match).
 *
 * How a player's high-intensity movement fades from the first half to the
 * second, per minute (unequal halves/subs/stoppage confound raw totals), from
 * the per-period rows already in `player_drill_load`. A conditioning / rotation
 * CONTEXT signal (Akenhead 2013; Mohr 2003) — NOT a readiness verdict and NOT
 * injury prediction; it never touches the readiness colour or the daily
 * decision. Layered read: verdict → plain why → confidence → per-match detail.
 *
 * Player-linked: the default (Player) view follows the player selected in the
 * Match Movement comparison above and reads him against the squad's typical
 * fade (personal-norm). The Team view keeps the squad scan — every player's
 * fade, sorted biggest-drop-first — for rotation/substitution planning.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";
import MatchIntensityPlayerModal from "@/components/coach/MatchIntensityPlayerModal";
import type {
  PlayerFade,
  TeamFade,
  MovementDriver,
} from "@/lib/micropulse/matchIntensityHalves";


const DRIVER_LABEL: Record<MovementDriver, { en: string; is: string }> = {
  accel: { en: "accelerations", is: "hröðunum" },
  decel: { en: "decelerations", is: "hemlunum" },
  cod: { en: "changes of direction", is: "stefnubreytingum" },
};

// Descriptive severity colour for a fade %, by magnitude of the drop. This is a
// context read, not a verdict — the colour just aids scanning.
function fadeTone(pct: number | null): { dot: string; text: string } {
  if (pct == null) return { dot: "#94a3b8", text: "text-slate-400" };
  if (pct <= -40) return { dot: "#a83e28", text: "text-rose-700" };
  if (pct <= -25) return { dot: "#de9328", text: "text-amber-700" };
  return { dot: "#1c7a4a", text: "text-emerald-700" };
}

function pctStr(p: number | null, is: boolean): string {
  if (p == null) return "–";
  const sign = p > 0 ? "+" : "";
  return `${sign}${Math.round(p)}%${is ? "" : ""}`;
}

// Two small bars comparing h1 vs h2 per-minute for one metric.
function HalfBars({ h1, h2, is }: { h1: number; h2: number; is: boolean }) {
  const max = Math.max(h1, h2, 0.0001);
  const row = (label: string, v: number, color: string) => (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[10px] text-slate-500">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded bg-slate-100">
        <div className="h-full rounded" style={{ width: `${(v / max) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-600">{v.toFixed(2)}</span>
    </div>
  );
  return (
    <div className="space-y-1">
      {row(is ? "1.hl" : "H1", h1, "#2740e6")}
      {row(is ? "2.hl" : "H2", h2, "#7a5cc4")}
    </div>
  );
}

// One player card (verdict → why → confidence → open drill-down). Reused in the
// single-player focus view and the squad grid. Module-level (NOT nested in the
// parent) so it never remounts on every parent render. The per-match detail and
// the AI explanation live in the modal opened via onOpen.
function PlayerCard({
  p,
  is,
  team,
  onOpen,
}: {
  p: PlayerFade;
  is: boolean;
  team: TeamFade | null;
  onOpen: (p: PlayerFade) => void;
}) {
  const tone = fadeTone(p.typicalPctChangeHigh);
  const vsSquad =
    team && p.typicalPctChangeHigh != null ? Math.round(p.typicalPctChangeHigh - team.pctChangeHigh) : null;
  const vsSquadTxt =
    vsSquad == null
      ? null
      : vsSquad <= -8
        ? (is ? "brattara fall en liðið" : "steeper fade than the squad")
        : vsSquad >= 8
          ? (is ? "heldur betur en liðið" : "holds up better than the squad")
          : (is ? "í takt við liðið" : "in line with the squad");
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} aria-hidden />
          <span className="text-sm font-medium text-slate-900">{p.playerName}</span>
          {p.position && <span className="text-[11px] text-slate-400">{p.position}</span>}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          {p.confidence === "building"
            ? (is ? `í byggingu · ${p.nMatches}` : `building · ${p.nMatches}`)
            : `${is ? "byggt á" : "based on"} ${p.nMatches}`}
        </span>
      </div>

      {/* Verdict — the fade, one line */}
      <p className="mt-1.5 text-[13px] leading-snug text-slate-800">
        {is ? "Seinni-hálfleikur háákefð " : "2nd-half high-intensity "}
        <b className={tone.text}>{pctStr(p.typicalPctChangeHigh, is)}</b>
        {p.latestPctChangeHigh != null && p.nMatches > 1 && (
          <span className="text-slate-500">
            {" "}({is ? "nýjast" : "latest"} {pctStr(p.latestPctChangeHigh, is)})
          </span>
        )}
      </p>

      {/* Personal-norm: his fade vs the squad's */}
      {vsSquadTxt && team && (
        <p className="mt-0.5 text-[11px] text-slate-500">
          {is ? "Liðið dæmigert " : "Squad typical "}
          <span className={fadeTone(team.pctChangeHigh).text}>{pctStr(team.pctChangeHigh, is)}</span>
          {" — "}{vsSquadTxt}.
        </p>
      )}

      {/* Plain why */}
      {p.driver && (
        <p className="mt-0.5 text-[11px] text-slate-500">
          {is
            ? `Mest lækkun í ${DRIVER_LABEL[p.driver].is}.`
            : `${DRIVER_LABEL[p.driver].en[0].toUpperCase()}${DRIVER_LABEL[p.driver].en.slice(1)} dropped most.`}
        </p>
      )}
      {p.confidence === "building" && (
        <p className="mt-0.5 text-[11px] italic text-amber-600">
          {is ? "Fá leiki enn — lestu sem stefnu, ekki niðurstöðu." : "Few matches yet — read as a direction, not a conclusion."}
        </p>
      )}

      {/* Open the drill-down: individual matches + AI explanation, in a pop-up */}
      <button
        type="button"
        onClick={() => onOpen(p)}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
      >
        <span aria-hidden>✨</span>
        {is ? "Leikir & AI útskýring" : "Matches & AI explanation"}
      </button>
    </div>
  );
}

export default function MatchIntensityHalvesCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [team, setTeam] = React.useState<TeamFade | null>(null);
  const [players, setPlayers] = React.useState<PlayerFade[]>([]);
  const [days, setDays] = React.useState<number>(180);
  // The player whose drill-down modal (individual matches + AI explanation) is open.
  const [modalPlayer, setModalPlayer] = React.useState<PlayerFade | null>(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { if (alive) setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
        const res = await fetch(`/api/coach/team/match-intensity-halves?days=180`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { if (alive) setErr(json.error ?? "Error"); return; }
        if (alive) {
          setTeam(json.team ?? null);
          setPlayers((json.players ?? []) as PlayerFade[]);
          setDays(json.days ?? 180);
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [is]);

  const qualifying = players.filter((p) => p.nMatches > 0);
  const noHalfData = !loading && !err && players.length === 0;

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            {is ? "Leikákefð — fyrri vs seinni hálfleikur" : "Match intensity — 1st vs 2nd half"}
          </h2>
          <p className="mt-0.5 max-w-2xl text-[11px] text-slate-500">
            {is
              ? "Hversu mikið háákefðar hreyfing dettur niður í seinni hálfleik, á mínútu (ekki hráar heildir). Samhengi um úthald/skiptingar — ekki readiness-dómur eða meiðslaspá."
              : "How much high-intensity movement drops in the second half, per minute (not raw totals). A conditioning/rotation context read — not a readiness verdict or injury prediction."}
          </p>
        </div>
        <CoachTutorialButton slug="match-intensity" label={{ en: "How to read", is: "Hvernig á að lesa" }} />
      </div>

      {loading && <div className="py-6 text-center text-sm text-slate-500">…</div>}
      {err && !loading && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{err}</div>
      )}

      {/* No half-period data anywhere → labelled, never zero */}
      {noHalfData && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <span aria-hidden>ℹ️</span>
          <span>
            {is
              ? "Engir hálfleikja-kaflar á síðustu mánuðum — þessi lestur birtist þegar leikur er tekinn upp með „Fyrri/Seinni hálfleikur“ (eða 1st/2nd half) köflum í Catapult."
              : "No match-half periods in the recent window — this read appears once a match is recorded with 1st/2nd-half periods (or Fyrri/Seinni hálfleikur) in Catapult."}
          </span>
        </div>
      )}

      {/* Squad summary — the context line both views read against */}
      {!loading && !err && team && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[13px] text-slate-800">
              <b>
                {is ? "Liðið: seinni-hálfleikur háákefð " : "Squad: 2nd-half high-intensity "}
                <span className={fadeTone(team.pctChangeHigh).text}>{pctStr(team.pctChangeHigh, is)}</span>
              </b>
              <span className="ml-1 text-slate-500">
                ({team.h1HighPerMin.toFixed(2)} → {team.h2HighPerMin.toFixed(2)} {is ? "á mín" : "per min"})
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {is ? "byggt á" : "based on"} {team.nMatches} {is ? "hálfleikja-pörum" : "match halves"} · {team.nPlayers} {is ? "leikmenn" : "players"}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {is ? "Heildar-IMA á mín " : "Total IMA per min "}
            {team.h1TotalPerMin.toFixed(2)} → {team.h2TotalPerMin.toFixed(2)} ({pctStr(team.pctChangeTotal, is)})
          </div>
        </div>
      )}

      {/* SQUAD VIEW — average signature + every player sorted by fade */}
      {!loading && !err && team && (
        <>
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              {is ? "Háákefð IMA á mín — hópmeðaltal" : "High-intensity IMA per min — squad average"}
            </div>
            <div className="mt-1"><HalfBars h1={team.h1HighPerMin} h2={team.h2HighPerMin} is={is} /></div>
            <div className="mt-2 text-[11px] text-slate-500">
              {is
                ? "Dæmigerða úthalds-undirskrift liðsins yfir hálfleiki. Kortin hér að neðan sýna hverjir detta mest."
                : "The squad's typical endurance signature across halves. The cards below show who fades hardest."}
            </div>
          </div>

          {qualifying.length > 0 && (
            <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {qualifying.map((p) => (
                <PlayerCard key={p.playerId} p={p} is={is} team={team} onOpen={setModalPlayer} />
              ))}
            </div>
          )}

          {/* One-half-only players (no delta) — shown as "–", never fabricated. */}
          {players.some((p) => p.nMatches === 0) && (
            <ShowDetails
              className="mt-3"
              label={{ EN: "Players with no full-match delta yet", IS: "Leikmenn án fulls leikja-mismunar enn" }}
            >
              <div className="flex flex-wrap gap-2">
                {players.filter((p) => p.nMatches === 0).map((p) => (
                  <span key={p.playerId} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                    {p.playerName} <span className="text-slate-400">–</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                {is
                  ? "Þarf báða hálfleiki (≥20 mín hvorn) í sama leik. Skiptingar sem spiluðu einn hálfleik hafa engan mismun."
                  : "Needs both halves (≥20 min each) in the same match. Subs who played one half have no delta."}
              </p>
            </ShowDetails>
          )}
        </>
      )}

      {/* Citation / framing footer */}
      {!loading && !err && (team || noHalfData) && (
        <p className="mt-3 text-[10px] leading-snug text-slate-400">
          {is
            ? "Háákefðar hreyfing minnkar yfir hálfleiki (Akenhead 2013; Mohr o.fl. 2003). Þetta er úthalds-/skiptinga-innsæi — ekki meiðslaspá og hreyfir aldrei readiness-litinn."
            : "High-intensity output declines across match halves (Akenhead 2013; Mohr et al. 2003). A conditioning/rotation insight — not injury prediction, and it never moves the readiness colour."}
          {days ? <span className="ml-1">· {is ? "gluggi" : "window"} {days}d</span> : null}
        </p>
      )}

      {/* Drill-down pop-up: individual matches + scoped AI explanation */}
      {modalPlayer && (
        <MatchIntensityPlayerModal
          player={modalPlayer}
          team={team}
          is={is}
          onClose={() => setModalPlayer(null)}
        />
      )}
    </div>
  );
}
