"use client";

/**
 * GpsOnlyTodayDecision — the load-based Today surface for GPS Intelligence Only
 * teams (team_settings.uses_wellness_features = false).
 *
 * For GPS-only teams there is no daily check-in, so the readiness hero
 * (READY / MODIFIED / RECOVERY) and the readiness Decision Summary have nothing
 * to read and render empty. This replaces them with an *álag (load)* equivalent
 * sourced entirely from the existing /api/coach/load-verdict engine
 * (loadVerdict + externalLoad/signals) — a team load verdict + per-player Load
 * Summary cards.
 *
 * GUARDRAILS (CLAUDE.md):
 *  - DESCRIPTIVE, never the readiness verdict. The load bands
 *    (SUSTAINABLE / BUILDING / SPIKING / UNDER) are a separate, labelled signal
 *    and use their OWN colours — distinct from the green/amber/red readiness
 *    traffic light. This never reads readiness_entries.color /
 *    v_coach_readiness_today_v8, and makes no injury/tissue-load claim
 *    (external-load proxy only — Vanrenterghem 2017; Impellizzeri 2020).
 *  - Confidence is always shown (manifesto principle #4) and degrades honestly
 *    when signal coverage / baseline maturity is low.
 *  - Reuse, don't rebuild: all numbers come from the load-verdict route. This is
 *    a presentational layer only — no new engine, no NBS/MLI weight change.
 *
 * Two presentational exports, fed one fetch lifted into the dashboard so the
 * hero and the summary agree and the route is hit once:
 *   <GpsOnlyLoadHero>    — replaces <TodayCommandCenter> when isGpsOnly
 *   <GpsOnlyLoadSummary> — replaces <DecisionSummaryCard> when isGpsOnly
 */

export type LoadBand = "SUSTAINABLE" | "BUILDING" | "SPIKING" | "UNDER";
type Lang = "EN" | "IS";
type LangText = { EN: string; IS: string };

type LoadDriver = { signal: string; plain: LangText; z?: number; weight: number };

export type LoadVerdictResponse = {
  date: string;
  team: {
    band: LoadBand;
    sentence: LangText;
    counts: Record<LoadBand, number>;
    confidence: {
      level: "high" | "moderate" | "low";
      coverage: number;
      baselineDays: number;
      dimensionsCovered?: number;
      dimensionsTotal?: number;
    };
  };
  players: Array<{
    player_id: string;
    name: string;
    verdict: { band: LoadBand; sentence: LangText; drivers: LoadDriver[] };
    figures: { acwr: number | null; bodyLoad: number | null; hsr: number | null; hsrDeltaPct: number | null };
  }>;
};

const L = (lang: Lang, en: string, is: string) => (lang === "IS" ? is : en);

const BAND_LABEL: Record<LoadBand, LangText> = {
  SUSTAINABLE: { EN: "Sustainable", IS: "Sjálfbært" },
  BUILDING: { EN: "Building", IS: "Að byggjast upp" },
  SPIKING: { EN: "Spiking", IS: "Að rjúka upp" },
  UNDER: { EN: "Under-loaded", IS: "Undir-hlaðið" },
};

// Load-state colours — deliberately NOT the readiness traffic-light palette.
// SUSTAINABLE green / BUILDING amber / SPIKING red / UNDER slate-blue.
const BAND_STYLE: Record<LoadBand, { fg: string; tileBg: string; tileFg: string; cardBg: string; cardBorder: string; dot: string }> = {
  SUSTAINABLE: { fg: "#1c7a4a", tileBg: "#e8f3ec", tileFg: "#1c7a4a", cardBg: "#ffffff", cardBorder: "#ece9e1", dot: "#1c7a4a" },
  BUILDING: { fg: "#de9328", tileBg: "#fbefd7", tileFg: "#8a5a12", cardBg: "#fdf6e8", cardBorder: "#f0e2c0", dot: "#de9328" },
  SPIKING: { fg: "#a83e28", tileBg: "#f7e7e2", tileFg: "#a83e28", cardBg: "#fcf0ec", cardBorder: "#f0d9d1", dot: "#a83e28" },
  UNDER: { fg: "#2f6fb0", tileBg: "#e6eef7", tileFg: "#2f6fb0", cardBg: "#eef4fa", cardBorder: "#d7e4f0", dot: "#2f6fb0" },
};

const TREND: Record<LoadBand, LangText> = {
  SPIKING: { EN: "↑↑ Sharp rise vs norm", IS: "↑↑ Snöggt stökk yfir venju" },
  BUILDING: { EN: "↑ Climbing steadily", IS: "↑ Hækkar jafnt og þétt" },
  SUSTAINABLE: { EN: "→ Within normal range", IS: "→ Innan venju" },
  UNDER: { EN: "↓ Below his norm", IS: "↓ Undir venju" },
};

const RECO: Record<LoadBand, LangText> = {
  SPIKING: { EN: "Cap volume, hold velocity", IS: "Lækka magn, halda hraða" },
  BUILDING: { EN: "Monitor — within sustainable", IS: "Fylgjast með — innan sjálfbærs" },
  SUSTAINABLE: { EN: "Clear for full session", IS: "Klár í fulla æfingu" },
  UNDER: { EN: "Progress load gradually", IS: "Auka álag smám saman" },
};

const CONF_LABEL: Record<"high" | "moderate" | "low", LangText> = {
  high: { EN: "High confidence", IS: "Mikið öryggi" },
  moderate: { EN: "Medium confidence", IS: "Miðlungs öryggi" },
  low: { EN: "Low confidence", IS: "Lítið öryggi" },
};

const BAND_ORDER: LoadBand[] = ["SUSTAINABLE", "BUILDING", "SPIKING", "UNDER"];

function fmtInt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("is-IS");
}
function fmtAcwr(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
function fmtHsr(f: LoadVerdictResponse["players"][number]["figures"]): string | null {
  if (f.hsrDeltaPct != null && Number.isFinite(f.hsrDeltaPct)) {
    return `${f.hsrDeltaPct > 0 ? "+" : ""}${f.hsrDeltaPct}%`;
  }
  if (f.hsr != null && Number.isFinite(f.hsr)) return `${Math.round(f.hsr)} m`;
  return null;
}

function confidenceLine(conf: LoadVerdictResponse["team"]["confidence"], lang: Lang): string {
  const level = CONF_LABEL[conf.level][lang === "IS" ? "IS" : "EN"];
  const dims = conf.dimensionsCovered != null && conf.dimensionsTotal != null
    ? ` · ${conf.dimensionsCovered}/${conf.dimensionsTotal} ${L(lang, "signals", "merki")}`
    : "";
  return `${level}${dims} · ${L(lang, "from external load, no check-in", "úr ytra álagi, ekkert check-in")}`;
}

/* ─────────────────────────── Hero ─────────────────────────── */

export function GpsOnlyLoadHero({ data, lang }: { data: LoadVerdictResponse | null; lang: Lang }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        {L(lang, "Reading external load…", "Les ytra álag…")}
      </div>
    );
  }

  const band = data.team.band;
  const style = BAND_STYLE[band];
  const counts = data.team.counts;
  const total = BAND_ORDER.reduce((s, b) => s + (counts[b] ?? 0), 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-extrabold tracking-wide" style={{ color: style.fg }}>
          {L(lang, "LOAD", "ÁLAG")} {BAND_LABEL[band][lang === "IS" ? "IS" : "EN"].toUpperCase()}
        </span>
        <span className="text-xs text-slate-500">{confidenceLine(data.team.confidence, lang)}</span>
        <span className="ml-auto inline-flex items-center rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500">
          {L(lang, "Load state — not the readiness verdict", "Álagsstaða — ekki heilsustöðu-dómur")}
        </span>
      </div>

      <h2 className="mt-3 font-archivo text-2xl font-extrabold leading-tight text-[#14181c]">
        {data.team.sentence[lang === "IS" ? "IS" : "EN"]}
      </h2>

      <div className="mt-3 rounded-xl bg-[#eef0fb] px-4 py-3">
        <div className="text-[11px] font-extrabold tracking-wide text-[#2740e6]">✦ {L(lang, "SUMMARY", "SAMANTEKT")}</div>
        <div className="mt-1 text-sm text-[#2a2e33]">
          {BAND_ORDER.map((b) => `${counts[b] ?? 0} ${BAND_LABEL[b][lang === "IS" ? "IS" : "EN"].toLowerCase()}`).join(" · ")}
          {total > 0 ? "" : ` — ${L(lang, "no external-load readings yet", "engar ytri álagsmælingar enn")}`}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BAND_ORDER.map((b) => {
          const s = BAND_STYLE[b];
          return (
            <div key={b} className="rounded-xl p-4 text-center" style={{ background: s.tileBg }}>
              <div className="font-archivo text-3xl font-extrabold tabular-nums" style={{ color: s.tileFg }}>{counts[b] ?? 0}</div>
              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: s.tileFg }}>
                {BAND_LABEL[b][lang === "IS" ? "IS" : "EN"]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── Per-player summary ─────────────────────── */

export function GpsOnlyLoadSummary({ data, lang }: { data: LoadVerdictResponse | null; lang: Lang }) {
  if (!data) return null;
  const players = data.players ?? [];
  const counts = data.team.counts;

  if (!players.length) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        {L(lang, "No external-load readings yet for this squad — load states appear once GPS/external data syncs.",
            "Engar ytri álagsmælingar enn fyrir hópinn — álagsstöður birtast þegar GPS/ytri gögn samstillast.")}
      </div>
    );
  }

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-archivo text-lg font-extrabold tracking-wide text-[#14181c]">{L(lang, "LOAD SUMMARY", "ÁLAGS-SAMANTEKT")}</h3>
        <div className="ml-auto flex flex-wrap gap-2">
          {BAND_ORDER.map((b) => (
            (counts[b] ?? 0) > 0 ? (
              <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700">
                <span className="h-2 w-2 rounded-full" style={{ background: BAND_STYLE[b].dot }} />
                {counts[b]} {BAND_LABEL[b][lang === "IS" ? "IS" : "EN"].toLowerCase()}
              </span>
            ) : null
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-[13px] text-slate-500">
        {L(lang, "Per-player load state today — from external data, no check-in required. A labelled load signal, not the readiness verdict.",
            "Álagsstaða hvers leikmanns í dag — úr ytri gögnum, ekkert check-in. Merkt álagsmerki, ekki heilsustöðu-dómur.")}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {players.map((p) => {
          const band = p.verdict.band;
          const style = BAND_STYLE[band];
          const driver = p.verdict.drivers?.[0]?.plain?.[lang === "IS" ? "IS" : "EN"] ?? L(lang, "stable load", "stöðugt álag");
          const acwr = fmtAcwr(p.figures.acwr);
          const driverLine = `ACWR ${acwr} · ${driver}`;
          const hsr = fmtHsr(p.figures);
          return (
            <div key={p.player_id} className="rounded-2xl border p-4" style={{ background: style.cardBg, borderColor: style.cardBorder }}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-archivo text-[15px] font-bold leading-tight text-[#14181c]">{p.name}</div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: style.fg }}>
                  {BAND_LABEL[band][lang === "IS" ? "IS" : "EN"]}
                </span>
              </div>

              <div className="mt-2 inline-block rounded-md px-2 py-1 text-[11px] font-bold" style={{ background: style.tileBg, color: style.tileFg }}>
                {TREND[band][lang === "IS" ? "IS" : "EN"]}
              </div>

              <div className="mt-2.5 rounded-lg px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: style.tileBg, color: style.tileFg }}>
                <b className="block">→ {RECO[band][lang === "IS" ? "IS" : "EN"]}</b>
                {driverLine}
              </div>

              <div className="mt-2.5 flex gap-4 border-t border-black/5 pt-2.5">
                <div className="text-[10.5px] uppercase tracking-wide text-slate-500">
                  {L(lang, "Body load", "Líkamsálag")}
                  <b className="mt-0.5 block font-archivo text-[15px] normal-case tracking-normal text-[#14181c]">{fmtInt(p.figures.bodyLoad)}</b>
                </div>
                <div className="text-[10.5px] uppercase tracking-wide text-slate-500">
                  ACWR
                  <b className="mt-0.5 block font-archivo text-[15px] normal-case tracking-normal text-[#14181c]">{acwr}</b>
                </div>
                {hsr ? (
                  <div className="text-[10.5px] uppercase tracking-wide text-slate-500">
                    HSR
                    <b className="mt-0.5 block font-archivo text-[15px] normal-case tracking-normal text-[#14181c]">{hsr}</b>
                  </div>
                ) : null}
              </div>

              <div className="mt-2.5 text-[10.5px] text-slate-400">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{L(lang, "EXTERNAL", "YTRA")}</span>
                &nbsp;{L(lang, "external load", "ytra álag")}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
