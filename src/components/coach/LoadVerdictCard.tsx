"use client";

/**
 * LoadVerdictCard — the explainability layer on top of Load Intelligence
 * (spec: docs/load-intelligence-explainability.md, step 3).
 *
 * One plain-language team verdict + confidence + glanceable signal tiles +
 * named per-player exceptions. Deterministic (rules decide; this only renders
 * the `loadVerdict` synthesis from /api/coach/load-verdict). The five dense
 * S&C cards stay below, behind "Show S&C details". Jargon → tooltips.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

type Lang2 = { EN: string; IS: string };
type Driver = { signal: string; plain: Lang2; z?: number };
type Band = "SUSTAINABLE" | "BUILDING" | "SPIKING" | "UNDER";
type Verdict = { band: Band; sentence: Lang2; drivers: Driver[]; confidence: { level: string; coverage: number; baselineDays: number } };
type Resp = {
  date: string;
  team: {
    band: Band; sentence: Lang2; counts: Record<Band, number>;
    confidence: { level: string; coverage: number; baselineDays: number; dimensionsCovered?: number; dimensionsTotal?: number };
    intensity?: { evaluated: number; hot: number; coverage: number; confidence: string; names: string[]; sentence: Lang2 };
  };
  exceptions: Array<{ player_id: string; name: string; verdict: Verdict }>;
  players: Array<{ player_id: string; name: string; verdict: Verdict }>;
};

const BAND_TONE: Record<Band, string> = {
  SUSTAINABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  BUILDING: "bg-amber-100 text-amber-800 border-amber-200",
  SPIKING: "bg-red-100 text-red-800 border-red-200",
  UNDER: "bg-sky-100 text-sky-800 border-sky-200",
};
const BAND_LABEL: Record<Band, Lang2> = {
  SUSTAINABLE: { EN: "Sustainable", IS: "Sjálfbært" },
  BUILDING: { EN: "Building", IS: "Að byggjast upp" },
  SPIKING: { EN: "Spiking", IS: "Að rjúka upp" },
  UNDER: { EN: "Under-loaded", IS: "Undir-hlaðið" },
};

export default function LoadVerdictCard({ date, lang, variant = "full" }: { date: string; lang: "EN" | "IS"; variant?: "full" | "strip" }) {
  const IS = lang === "IS";
  const [data, setData] = React.useState<Resp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/coach/load-verdict?date=${date}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) { setErr(json.error ?? "Failed"); return; }
        setData(json as Resp);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Network error"); }
    })();
    return () => { alive = false; };
  }, [date]);

  if (err || !data) return null; // silent — the S&C cards below still render
  const t = data.team;
  const tx = (l: Lang2) => (IS ? l.IS : l.EN);

  // ── Compact strip (dashboard): one-line load read, links to full page ──
  // Mirrors DailyBriefingCard's readiness verdict with the load axis next to it.
  if (variant === "strip") {
    const need = data.exceptions.length;
    return (
      <a
        href="/coach/load-intelligence"
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        title={IS ? "Reglur ákveða — ekki AI · smelltu fyrir Álagsgreiningu" : "Rules decide — not AI · open Load Intelligence"}
      >
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BAND_TONE[t.band]}`}>{tx(BAND_LABEL[t.band])}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{tx(t.sentence)}</span>
        {need > 0 && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {need} {IS ? "athygli" : "to watch"}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-slate-400" title={IS ? "Þekja merkja + grunnlínu-þroski" : "Signal coverage + baseline maturity"}>
          {t.confidence.level}
        </span>
        <span className="shrink-0 text-[11px] font-medium text-indigo-600">{IS ? "Álag →" : "Load →"}</span>
      </a>
    );
  }

  // Glanceable signal tiles: how many players are elevated on each component.
  const elevated = (sig: string) => data.players.filter((p) => p.verdict.drivers.some((d) => d.signal === sig)).length;
  const tiles = [
    { key: "braking", label: { EN: "Braking load", IS: "Hemlunarálag" }, n: elevated("braking"), tip: { EN: "High-intensity deceleration burden (McBurnie 2022) vs each player's norm.", IS: "Háákefðar-hemlunarálag (McBurnie 2022) m.v. eigin venju." } },
    { key: "hsr", label: { EN: "High-speed running", IS: "Háhraðahlaup" }, n: elevated("hsr"), tip: { EN: "High-speed running spikes vs the player's norm.", IS: "Háhraðahlaups-stökk m.v. venju." } },
    { key: "acwr_spike", label: { EN: "Acute load spike", IS: "Bráðaálags-stökk" }, n: elevated("acwr_spike"), tip: { EN: "Acute:chronic load ratio above 1.5 — a large, fast jump in load. Flags the SIZE of the spike, not injury risk (ACWR is not a validated injury predictor — Impellizzeri 2020); the concern is whether the jump is into unfamiliar territory.", IS: "Bráða:krónísk álagshlutfall yfir 1.5 — stórt, hratt stökk í álagi. Sýnir STÆRÐ stökksins, ekki meiðsla-áhættu (ACWR er ekki staðfest meiðsla-spá — Impellizzeri 2020); áhyggjuefnið er hvort stökkið sé inn á óþekkt svæði." } },
    { key: "monotony", label: { EN: "Monotony", IS: "Einhæfni" }, n: elevated("monotony"), tip: { EN: "Foster training monotony — day-to-day sameness of load.", IS: "Foster einhæfni — hversu eins álagið er dag frá degi." } },
  ];

  // Plain-language reason the confidence is what it is — so a coach reads the
  // verdict for what it is worth, not more. A thin baseline is the biggest
  // caveat (the whole verdict compares "this week" to very little history), so
  // it wins; otherwise a low level means missing signals for the data tier.
  const bd = t.confidence.baselineDays;
  const plainConfidence: Lang2 | null =
    bd <= 3
      ? {
          EN: `Read this as a direction, not a conclusion — there ${bd === 1 ? "is" : "are"} only ${bd} day${bd === 1 ? "" : "s"} of load history to compare this week against so far. It firms up as the week banks more sessions.`,
          IS: `Lestu þetta sem stefnu, ekki niðurstöðu — það ${bd === 1 ? "er" : "eru"} aðeins ${bd} dag${bd === 1 ? "ur" : "ar"} af álagssögu til að bera vikuna saman við enn sem komið er. Það styrkist eftir því sem vikan safnar fleiri æfingum.`,
        }
      : (t.confidence.level ?? "").toLowerCase() === "low"
        ? {
            EN: "Lower confidence — some load signals aren't in this squad's data tier, so the verdict leans on the ones that are.",
            IS: "Minni vissa — sum álagsmerki eru ekki í gagna-þrepi þessa liðs, svo dómurinn hallast á þau sem eru til staðar.",
          }
        : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* One-sentence verdict */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BAND_TONE[t.band]}`}>{tx(BAND_LABEL[t.band])}</span>
        <span className="text-[11px] text-slate-400" title={IS ? "Reglur ákveða — ekki AI" : "Rules decide — not AI"}>{IS ? "Álagsdómur" : "Load verdict"}</span>
        <CoachTutorialButton
          slug="load-verdict"
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
        />
      </div>
      <p className="mt-1.5 text-[15px] font-medium leading-snug text-slate-900">{tx(t.sentence)}</p>

      {/* Confidence — never hidden (principle #4). Capability-driven:
          dimensionsCovered/5 + baseline maturity (lower tiers cover fewer). */}
      <div className="mt-1 text-[11px] text-slate-500" title={IS ? "Víddir sem gögn liðsins styðja + grunnlínu-þroski" : "Interpretation dimensions the club's data supports + baseline maturity"}>
        {IS ? "Vissa" : "Confidence"}: {t.confidence.level}
        {t.confidence.dimensionsCovered != null
          ? ` · ${t.confidence.dimensionsCovered}/${t.confidence.dimensionsTotal ?? 5} ${IS ? "víddir" : "dimensions"}`
          : ` · ${Math.round(t.confidence.coverage * 6)}/6 ${IS ? "merki" : "signals"}`}
        {" "}· {t.confidence.baselineDays}-{IS ? "daga grunnlína" : "day baseline"}
      </div>

      {/* Plain-language caveat when confidence is materially limited — the honest
          "how much to trust this" line, in words a non-S&C coach reads directly. */}
      {plainConfidence && (
        <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-snug text-slate-600">
          {tx(plainConfidence)}
        </p>
      )}

      {/* Intensity dimension (Task B) — work rate vs each player's OWN usual day.
          A distinct labelled load signal, never the readiness colour. Jargon
          (PL/min, HML) lives in the tooltip; confidence degrades with coverage. */}
      {t.intensity && t.intensity.evaluated > 0 && (
        <div
          className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2"
          title={IS
            ? "Ákefð = Player Load á mínútu (vinnuhraði), studd af háorku-hlaupi (HML) og háhraðahlaupi — borið saman við venjulegan dag hvers leikmanns. Reglur ákveða, ekki AI; breytir ekki readiness-litnum."
            : "Work rate = Player Load per minute, corroborated by high-metabolic (HML) and high-speed running — vs each player's own usual day. Rules decide, not AI; does not change the readiness colour."}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">{IS ? "Ákefð (vinnuhraði)" : "Work rate"}</span>
            <span className="text-[10px] text-slate-500">
              {IS ? "vissa" : "confidence"}: {t.intensity.confidence} · {Math.round(t.intensity.coverage * 3)}/3 {IS ? "merki" : "signals"}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-800">{tx(t.intensity.sentence)}</p>
        </div>
      )}

      {/* Glanceable component tiles */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className={`rounded-lg border p-2 ${tile.n > 0 ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"}`} title={tx(tile.tip)}>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{tx(tile.label)}</div>
            <div className={`text-lg font-bold tabular-nums ${tile.n > 0 ? "text-slate-900" : "text-slate-300"}`}>{tile.n}<span className="ml-1 text-[10px] font-normal text-slate-400">{IS ? "leikm." : "players"}</span></div>
          </div>
        ))}
      </div>

      {/* Named exceptions */}
      {data.exceptions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{IS ? "Þarfnast athygli" : "Need attention"}</div>
          <div className="flex flex-wrap gap-1.5">
            {data.exceptions.map((e) => (
              <span key={e.player_id} className={`rounded border px-2 py-0.5 text-[11px] ${BAND_TONE[e.verdict.band]}`}
                title={e.verdict.drivers.map((d) => `${tx(d.plain)}${d.z != null ? ` (z ${d.z})` : ""}`).join(" · ")}>
                {e.name.split(" ")[0]} · {tx(BAND_LABEL[e.verdict.band])}{e.verdict.drivers[0] ? ` — ${tx(e.verdict.drivers[0].plain)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-player drill-down */}
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
        {open ? (IS ? "Fela leikmenn ▲" : "Hide players ▲") : (IS ? `Sýna alla leikmenn (${data.players.length}) ▼` : `Show all players (${data.players.length}) ▼`)}
      </button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {data.players.map((p) => (
            <div key={p.player_id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-slate-800">{p.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-500">{p.verdict.drivers.slice(0, 2).map((d) => tx(d.plain)).join(", ") || "—"}</span>
                <span className={`rounded px-1.5 py-0.5 font-semibold ${BAND_TONE[p.verdict.band]}`}>{tx(BAND_LABEL[p.verdict.band])}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
