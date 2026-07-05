"use client";

/**
 * PlayerMatchMovementCard — the player's own "how I move" profile (IMA driver),
 * the companion to his game report. Self-scoped (/api/player/match-movement —
 * player_id from auth). Deliberately player-friendly: a squad-percentile radar,
 * plain-language labels, and a positive "your standout" read. No jargon, no
 * load/injury language — just how he moves vs his squad.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { ProfileRadar, CompareRadar, ChartZoom, type RadarMetric } from "@/components/coach/PlayerGameReportCharts";
import { fmtDim, type DimensionKey, type MovementFingerprint, type MovementVariant } from "@/lib/micropulse/matchMovement/types";

type Resp = {
  variant?: MovementVariant;
  matches: Array<{ date: string; minutes: number; fingerprint: MovementFingerprint }>;
  average: MovementFingerprint | null;
  percentiles: Record<DimensionKey, number>;
  squadMedian: MovementFingerprint;
  matchCount: number;
};

type PlayerLabel = { en: string; is: string; quality?: boolean; infoEN: string; infoIS: string };

// Player-friendly labels (no S&C jargon) for each movement dimension. `info` is
// a plain one-liner explaining what the axis tells the PLAYER — most players
// don't know IMA, so it never uses the term.
const PLAYER_LABELS: Record<DimensionKey, PlayerLabel> = {
  totalPerMin:     { en: "Work rate",   is: "Vinnumagn",   quality: true,
    infoEN: "How much total movement you pack into each minute — starts, stops, turns and runs combined. Higher = a busier, more active game.",
    infoIS: "Hversu mikla hreyfingu þú kemur fyrir á hverri mínútu — spretti, stopp, snúninga og hlaup samanlagt. Hærra = virkari leikur." },
  accelDecelRatio: { en: "Explosive",   is: "Sprengikraftur", quality: true,
    infoEN: "Whether you speed up more than you slow down. Higher = more explosive, front-foot bursts; lower = more braking and stopping.",
    infoIS: "Hvort þú hraðar meira en þú hemlar. Hærra = meiri sprengikraftur og sóknar-hreyfing; lægra = meiri hemlun og stopp." },
  codPerMin:       { en: "Agility",     is: "Lipurð",      quality: true,
    infoEN: "How often you change direction — cuts, turns and twists. Higher = a more agile, twisty game.",
    infoIS: "Hversu oft þú skiptir um stefnu — beygjur og snúninga. Hærra = liprari, meira snúnings-leikur." },
  codLeftPct:      { en: "L / R balance", is: "V / H jafnvægi",
    infoEN: "Whether you turn more to your left or your right. Around 50% is even both ways — handy for spotting a one-sided habit.",
    infoIS: "Hvort þú snýrð meira til vinstri eða hægri. Um 50% er jafnt á báða vegu — gott til að sjá ef þú ert einhliða." },
  hiCadencePerMin: { en: "Sprinting",   is: "Sprettur",    quality: true,
    infoEN: "How much fast, sprint-type running you do per minute. Higher = more high-speed running in your game.",
    infoIS: "Hversu mikið hratt sprett-hlaup þú tekur á mínútu. Hærra = meira hraðahlaup í leiknum þínum." },
};
const RADAR_ORDER: DimensionKey[] = ["totalPerMin", "accelDecelRatio", "codPerMin", "hiCadencePerMin", "codLeftPct"];

// GPS variant (Core/Lite) — no IMA, so player-friendly labels for the GPS
// movement signals. Still plain, no jargon.
const GPS_PLAYER_LABELS: Record<DimensionKey, PlayerLabel> = {
  workPerMin:    { en: "Work rate",   is: "Vinnumagn",   quality: true,
    infoEN: "How hard you worked each minute overall. Higher = a busier, more demanding game.",
    infoIS: "Hversu mikið þú lagðir á þig á hverri mínútu. Hærra = annasamari, kröfuharðari leikur." },
  effortsPerMin: { en: "Agility efforts", is: "Átök",    quality: true,
    infoEN: "How many sharp accelerations and stops you made per minute — your stop-start, change-of-pace work. Higher = a more agile, busy game.",
    infoIS: "Hversu margar snöggar hröðunir og stopp þú tókst á mínútu — stopp-og-fara vinnan þín. Hærra = liprari, annasamari leikur." },
  hsrPerMin:     { en: "High-speed running", is: "Háhraðahlaup", quality: true,
    infoEN: "How much fast running you did per minute. Higher = more high-speed running in your game.",
    infoIS: "Hversu mikið hratt hlaup þú tókst á mínútu. Hærra = meira háhraðahlaup í leiknum þínum." },
  sprintPerMin:  { en: "Sprinting",   is: "Sprettur",    quality: true,
    infoEN: "How much all-out sprint running you did per minute. Higher = more top-speed running.",
    infoIS: "Hversu mikið hámarkshraða sprett-hlaup þú tókst á mínútu. Hærra = meira hámarkshraða hlaup." },
  topSpeed:      { en: "Top speed",   is: "Hæsti hraði", quality: true,
    infoEN: "The fastest speed you reached in the match (km/h).",
    infoIS: "Hæsti hraði sem þú náðir í leiknum (km/klst)." },
};
const GPS_RADAR_ORDER: DimensionKey[] = ["workPerMin", "effortsPerMin", "hsrPerMin", "sprintPerMin", "topSpeed"];

export default function PlayerMatchMovementCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selA, setSelA] = useState<string>("");        // a match date
  const [selB, setSelB] = useState<string>("usual");   // a match date or "usual"
  const [openInfo, setOpenInfo] = useState<DimensionKey | null>(null); // which axis explainer is open
  const [ai, setAi] = useState<{ sig: string; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) { if (alive) setLoading(false); return; }
        const res = await fetch("/api/player/match-movement", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!alive) return;
        if (res.ok) setData(await res.json());
        setLoading(false);
      } catch { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const radar: RadarMetric[] = useMemo(() => {
    if (!data) return [];
    const order = data.variant === "gps" ? GPS_RADAR_ORDER : RADAR_ORDER;
    const labels = data.variant === "gps" ? GPS_PLAYER_LABELS : PLAYER_LABELS;
    return order.map((k) => ({
      label: is ? labels[k].is : labels[k].en,
      percentile: data.percentiles[k] ?? 50,
      valueLabel: fmtDim(k, data.average?.[k] ?? null),
    }));
  }, [data, is]);

  if (loading) return null;
  if (!data || data.matchCount === 0) return null;

  // Variant-aware labels/order (IMA driver on Pro, GPS movement on Lite).
  const isGps = data.variant === "gps";
  const ORDER = isGps ? GPS_RADAR_ORDER : RADAR_ORDER;
  const LABELS = isGps ? GPS_PLAYER_LABELS : PLAYER_LABELS;

  // Positive standout — the "quality" dimension he ranks highest on.
  const standout = ORDER
    .filter((k) => LABELS[k].quality && data.percentiles[k] != null)
    .sort((a, b) => (data.percentiles[b] ?? 0) - (data.percentiles[a] ?? 0))[0];
  const standoutPct = standout ? data.percentiles[standout] : 0;

  // Player picks the two things to compare — a match vs another match, or a
  // match vs his own usual. Defaults: last match vs usual.
  const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" });
  const effA = selA || data.matches[0]?.date || "";
  const effB = selB || "usual";
  const fpFor = (sel: string): MovementFingerprint | null =>
    sel === "usual" ? data.average : (data.matches.find((m) => m.date === sel)?.fingerprint ?? null);
  const labelFor = (sel: string): string => (sel === "usual" ? (is ? "Venjan þín" : "Your usual") : dateLabel(sel));
  const fpA = fpFor(effA);
  const fpB = fpFor(effB);
  const compareAxes = ORDER.map((k) => (is ? LABELS[k].is : LABELS[k].en));
  const compareSeries = fpA && fpB && effA !== effB
    ? [
        { label: labelFor(effA), values: ORDER.map((k) => fpA[k]), color: "#4f46e5" },
        { label: labelFor(effB), values: ORDER.map((k) => fpB[k]), color: "#a9a493" },
      ]
    : [];

  // AI explanation — self-scoped; the server re-computes the numbers from just
  // the picked comparison. Tag with a signature so a stale narrative never shows
  // after the player changes the pickers.
  const aiSig = `${effA}|${effB}`;
  const genAi = async () => {
    setAiBusy(true); setAiErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch("/api/player/match-movement/narrative", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ lang: is ? "IS" : "EN", selA: effA, selB: effB }),
      });
      const j = await res.json();
      if (!res.ok) { setAiErr(j.error ?? "Failed"); return; }
      setAi({ sig: aiSig, text: j.narrative as string });
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">{is ? "Hreyfing" : "Movement"}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{is ? "Hvernig þú hreyfir þig" : "How you move"}</div>
      <p className="mt-0.5 text-xs text-slate-500">
        {is ? `Miðað við liðið · byggt á ${data.matchCount} leikjum` : `Compared to your squad · based on ${data.matchCount} matches`}
      </p>

      {standout && standoutPct >= 60 && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-slate-800">
          <span className="font-semibold">{is ? "Þinn styrkur: " : "Your standout: "}</span>
          {is ? LABELS[standout].is : LABELS[standout].en}
          {" — "}
          {is ? `þú ert í efstu ${100 - standoutPct}% liðsins.` : `you're in the top ${100 - standoutPct}% of the squad.`}
        </div>
      )}

      <div className="mt-3">
        <ChartZoom title={is ? "Hvernig þú hreyfir þig" : "How you move"} large={<ProfileRadar metrics={radar} maxHeight={520} />}>
          <ProfileRadar metrics={radar} maxHeight={280} />
        </ChartZoom>
      </div>

      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        {is
          ? "Toppar út = yfir liðs-miðgildi, inn = undir. Þetta lýsir hreyfi-stíl þínum — ekki gott/slæmt."
          : "Spikes out = above the squad median, dips in = below. This describes your movement style — not good/bad."}
      </p>

      {/* What each axis means — tap the (i) for a plain explanation (touch-friendly). */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Hvað þýðir hvað?" : "What does each mean?"}</div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
          {ORDER.map((k) => {
            const active = openInfo === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setOpenInfo(active ? null : k)}
                aria-expanded={active}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
              >
                {is ? LABELS[k].is : LABELS[k].en}
                <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-500"}`}>i</span>
              </button>
            );
          })}
        </div>
        {openInfo && (
          <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs leading-snug text-slate-700">
            <span className="font-semibold">{is ? LABELS[openInfo].is : LABELS[openInfo].en}</span>
            {" — "}
            {is ? LABELS[openInfo].infoIS : LABELS[openInfo].infoEN}
          </div>
        )}
      </div>

      {data.matches.length >= 1 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Berðu saman leiki" : "Compare matches"}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <select value={effA} onChange={(e) => setSelA(e.target.value)} className="h-8 rounded-md border border-slate-300 bg-white px-2">
              {data.matches.map((m) => <option key={m.date} value={m.date}>{dateLabel(m.date)} · {m.minutes}′</option>)}
            </select>
            <span className="text-slate-400">{is ? "vs" : "vs"}</span>
            <select value={effB} onChange={(e) => setSelB(e.target.value)} className="h-8 rounded-md border border-slate-300 bg-white px-2">
              <option value="usual">{is ? "Venjan þín" : "Your usual"}</option>
              {data.matches.map((m) => <option key={m.date} value={m.date}>{dateLabel(m.date)}</option>)}
            </select>
          </div>
          {compareSeries.length === 2 ? (
            <>
              <div className="mt-2">
                <ChartZoom title={is ? "Berðu saman leiki" : "Compare matches"} large={<CompareRadar axes={compareAxes} series={compareSeries} maxHeight={520} />}>
                  <CompareRadar axes={compareAxes} series={compareSeries} maxHeight={260} />
                </ChartZoom>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px]">
                {compareSeries.map((s) => (
                  <span key={s.label} className="inline-flex items-center gap-1 text-slate-600">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />{s.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">{is ? "Veldu tvennt ólíkt til að bera saman." : "Pick two different things to compare."}</p>
          )}

          {/* AI explanation — plain, written to you from your own numbers. */}
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
                <span>✨</span>{is ? "AI útskýring" : "AI explanation"}
              </div>
              {(!ai || ai.sig !== aiSig) && (
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
            {ai && ai.sig === aiSig ? (
              <>
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{ai.text}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-indigo-700">AI</span>
                  {is ? "Skrifað úr þínum eigin tölum. AI útskýrir — reglur ráða." : "Written from your own numbers. AI explains — the numbers decide."}
                </div>
              </>
            ) : !aiBusy && !aiErr ? (
              <p className="mt-1 text-xs text-indigo-700/70">
                {is ? "Fáðu útskýringu á venjulegu máli á hvernig þú hreyfðir þig." : "Get a plain-language explanation of how you moved."}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
