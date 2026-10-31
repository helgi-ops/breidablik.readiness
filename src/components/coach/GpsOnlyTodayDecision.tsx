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

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type LoadBand = "SUSTAINABLE" | "BUILDING" | "SPIKING" | "UNDER";
type Lang = "EN" | "IS";
type LangText = { EN: string; IS: string };

type LoadDriver = { signal: string; plain: LangText; z?: number; weight: number };
type LoadComponent = { key: string; label: LangText; value: number | null; band: "LOW" | "NORMAL" | "ELEVATED" | "HIGH"; tooltip: LangText };
type SZ = { value: number | null; z: number | null };
type PlayerSignals = {
  decel: SZ; accel: SZ; adRatio: number | null;
  loadProfile: "eccentric" | "concentric" | "balanced" | null;
  ima: { accel: SZ; decel: SZ; total: SZ };
};
// Mirror of IntensityVerdict (src/lib/micropulse/intensityVerdict) — the fields the detail view reads.
type IntensityLite = {
  available: boolean;
  band: string;
  z: number | null;
  confident: boolean;
  baselineDays: number;
  coverage: number;
  headline: LangText | null;
  counterfactual: LangText | null;
};

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
  players: Array<LoadPlayer>;
};

type LoadPlayer = {
  player_id: string;
  name: string;
  verdict: {
    band: LoadBand;
    sentence: LangText;
    drivers: LoadDriver[];
    components?: LoadComponent[];
    confidence?: { level: "high" | "moderate" | "low"; coverage: number; baselineDays: number };
  };
  intensity?: IntensityLite;
  signals?: PlayerSignals;
  figures: { acwr: number | null; bodyLoad: number | null; hsr: number | null; hsrDeltaPct: number | null };
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
  const [openId, setOpenId] = useState<string | null>(null);
  if (!data) return null;
  const players = data.players ?? [];
  const counts = data.team.counts;
  const open = players.find((p) => p.player_id === openId) ?? null;

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
            <button
              key={p.player_id}
              type="button"
              onClick={() => setOpenId(p.player_id)}
              aria-label={L(lang, `Inspect load for ${p.name}`, `Skoða álag fyrir ${p.name}`)}
              className="rounded-2xl border p-4 text-left transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2740e6]"
              style={{ background: style.cardBg, borderColor: style.cardBorder }}
            >
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

              <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{L(lang, "EXTERNAL", "YTRA")}</span>
                  &nbsp;{L(lang, "external load", "ytra álag")}
                </span>
                <span className="font-semibold text-[#2740e6]">{L(lang, "Inspect →", "Skoða →")}</span>
              </div>
            </button>
          );
        })}
      </div>

      {open ? <GpsOnlyLoadDetailModal player={open} lang={lang} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}

/* ─────────────────────── Per-player load detail ─────────────────────── */

const COMPONENT_BAND_STYLE: Record<LoadComponent["band"], { bg: string; fg: string }> = {
  LOW: { bg: "#e6eef7", fg: "#2f6fb0" },
  NORMAL: { bg: "#f1f0ea", fg: "#55585c" },
  ELEVATED: { bg: "#fbefd7", fg: "#8a5a12" },
  HIGH: { bg: "#f7e7e2", fg: "#a83e28" },
};
const COMPONENT_BAND_LABEL: Record<LoadComponent["band"], LangText> = {
  LOW: { EN: "Low", IS: "Lágt" },
  NORMAL: { EN: "Normal", IS: "Venjulegt" },
  ELEVATED: { EN: "Elevated", IS: "Hækkað" },
  HIGH: { EN: "High", IS: "Hátt" },
};

const SPIKE_SD = 2;
function zTone(z: number | null): { bg: string; fg: string; label: LangText } {
  if (z != null && z >= SPIKE_SD) return { bg: "#f7e7e2", fg: "#a83e28", label: { EN: "spiking", IS: "stökk" } };
  if (z != null && z >= 1) return { bg: "#fbefd7", fg: "#8a5a12", label: { EN: "elevated", IS: "hækkað" } };
  return { bg: "#f1f0ea", fg: "#55585c", label: { EN: "normal", IS: "venjulegt" } };
}
function profileLabel(p: PlayerSignals["loadProfile"], lang: Lang): string {
  if (p === "eccentric") return L(lang, "braking-dominant", "hemlunar-drifið");
  if (p === "concentric") return L(lang, "push-dominant", "hröðunar-drifið");
  if (p === "balanced") return L(lang, "balanced", "í jafnvægi");
  return "—";
}
function SignalLine({ label, sz, lang }: { label: string; sz: SZ; lang: Lang }) {
  const tone = zTone(sz.z);
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-semibold tabular-nums text-[#14181c]">{sz.value != null ? Math.round(sz.value).toLocaleString("is-IS") : "—"}</span>
        {sz.z != null ? (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
            z {sz.z > 0 ? "+" : ""}{sz.z} · {tone.label[lang === "IS" ? "IS" : "EN"]}
          </span>
        ) : null}
      </span>
    </div>
  );
}
const anySignal = (...xs: SZ[]) => xs.some((s) => s.value != null);

// One AI "why" per player+band, cached for the page session so reopening a card
// doesn't re-call. The rule engine decides the band; this only explains it.
const AI_CACHE = new Map<string, string>();

function useLoadAiSummary(player: LoadPlayer): { state: "loading" | "ok" | "error"; text: string } {
  const key = `${player.player_id}:${player.verdict.band}`;
  const [res, setRes] = useState<{ state: "loading" | "ok" | "error"; text: string }>(
    () => (AI_CACHE.has(key) ? { state: "ok", text: AI_CACHE.get(key)! } : { state: "loading", text: "" }),
  );
  useEffect(() => {
    if (AI_CACHE.has(key)) { setRes({ state: "ok", text: AI_CACHE.get(key)! }); return; }
    let alive = true;
    setRes({ state: "loading", text: "" });
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { if (alive) setRes({ state: "error", text: "" }); return; }
        const r = await fetch("/api/coach/load-verdict/explain", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: player.name,
            band: player.verdict.band,
            recommendedAction: RECO[player.verdict.band].EN,
            figures: player.figures,
            drivers: (player.verdict.drivers ?? []).map((d) => ({ plain: d.plain.EN, z: d.z })),
            signals: player.signals ?? null,
            intensity: player.intensity
              ? { available: player.intensity.available, band: player.intensity.band, z: player.intensity.z, headline: player.intensity.headline?.EN ?? "" }
              : null,
          }),
        });
        if (!r.ok) { if (alive) setRes({ state: "error", text: "" }); return; }
        const text = String(((await r.json()) as { summary?: string }).summary ?? "").trim();
        if (!text) { if (alive) setRes({ state: "error", text: "" }); return; }
        AI_CACHE.set(key, text);
        if (alive) setRes({ state: "ok", text });
      } catch {
        if (alive) setRes({ state: "error", text: "" });
      }
    })();
    return () => { alive = false; };
    // Refetch only when the player or their band changes (cache miss) — not on
    // every render; `player` is read fresh inside the effect at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return res;
}

export function GpsOnlyLoadDetailModal({ player, lang, onClose }: { player: LoadPlayer; lang: Lang; onClose: () => void }) {
  const ai = useLoadAiSummary(player);
  const [showDetails, setShowDetails] = useState(false);
  const band = player.verdict.band;
  const style = BAND_STYLE[band];
  const T = (t: LangText | undefined | null) => (t ? t[lang === "IS" ? "IS" : "EN"] : "");
  const components = (player.verdict.components ?? []).filter((c) => c.value != null);
  const conf = player.verdict.confidence;
  const intensity = player.intensity;
  const hsr = fmtHsr(player.figures);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-archivo text-xl font-extrabold leading-tight text-[#14181c]">{player.name}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{L(lang, "Load state — not the readiness verdict", "Álagsstaða — ekki heilsustöðu-dómur")}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: style.fg }}>
              {BAND_LABEL[band][lang === "IS" ? "IS" : "EN"]}
            </span>
            <button type="button" onClick={onClose} aria-label={L(lang, "Close", "Loka")} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
          </div>
        </div>

        {/* L0 — the verdict sentence (plain "why", rule-based) */}
        <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ background: style.tileBg, color: style.tileFg }}>
          {player.verdict.sentence[lang === "IS" ? "IS" : "EN"]}
        </div>

        {/* AI summary — reads the variables and explains the rule-decided band in
            plain language, citing the signals shown below. Labelled as AI; the
            engine (not the AI) set the band. */}
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
            <span>✨ {L(lang, "AI summary", "AI samantekt")}</span>
            <span className="font-medium normal-case tracking-normal text-violet-500">· {L(lang, "explains the band, cites your data", "útskýrir bandið, vísar í gögnin")}</span>
          </div>
          {ai.state === "loading" ? (
            <div className="mt-1 text-[13px] text-violet-500">{L(lang, "Reading the signals…", "Les úr merkjunum…")}</div>
          ) : ai.state === "error" ? (
            <div className="mt-1 text-[12.5px] text-slate-400">{L(lang, "AI summary unavailable — the signals below still explain the band.", "AI samantekt ófáanleg — merkin að neðan útskýra bandið.")}</div>
          ) : (
            <div className="mt-1 text-[13.5px] leading-snug text-[#2a2e33]">{ai.text}</div>
          )}
          <div className="mt-1.5 text-[10px] text-violet-400">{L(lang, "AI-written · the rule engine set the band, not the AI", "AI-skrifað · reglukerfið setti bandið, ekki gervigreindin")}</div>
        </div>

        {/* L1 — headline figures + named drivers */}
        <div className="mt-3 flex gap-5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">
            {L(lang, "Body load", "Líkamsálag")}
            <b className="mt-0.5 block font-archivo text-lg normal-case tracking-normal text-[#14181c]">{fmtInt(player.figures.bodyLoad)}</b>
          </div>
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500">
            ACWR
            <b className="mt-0.5 block font-archivo text-lg normal-case tracking-normal text-[#14181c]">{fmtAcwr(player.figures.acwr)}</b>
          </div>
          {hsr ? (
            <div className="text-[10.5px] uppercase tracking-wide text-slate-500">
              HSR
              <b className="mt-0.5 block font-archivo text-lg normal-case tracking-normal text-[#14181c]">{hsr}</b>
            </div>
          ) : null}
        </div>

        {player.verdict.drivers.length ? (
          <ul className="mt-3 space-y-1.5">
            {player.verdict.drivers.slice(0, 4).map((d, i) => (
              <li key={`${d.signal}-${i}`} className="flex items-baseline gap-2 text-[13px] text-[#2a2e33]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: style.dot }} />
                <span>{T(d.plain)}{d.z != null ? <span className="text-slate-400"> · z {d.z > 0 ? "+" : ""}{d.z}</span> : null}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* L2 — details toggle: component tiles + intensity + confidence */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-4 text-xs font-semibold text-[#2740e6] hover:underline"
          aria-expanded={showDetails}
        >
          {showDetails ? L(lang, "Hide details", "Fela nánar") : L(lang, "Show details — S&C", "Sýna nánar — S&C")}
        </button>

        {showDetails ? (
          <div className="mt-3 space-y-4">
            {components.length ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {components.map((c) => {
                  const cs = COMPONENT_BAND_STYLE[c.band];
                  return (
                    <div key={c.key} className="rounded-xl p-3" style={{ background: cs.bg }} title={T(c.tooltip)}>
                      <div className="text-[10px] uppercase tracking-wide" style={{ color: cs.fg }}>{T(c.label)}</div>
                      <div className="mt-0.5 font-archivo text-base font-bold tabular-nums text-[#14181c]">{c.value != null ? Math.round(c.value * 10) / 10 : "—"}</div>
                      <div className="text-[10px] font-semibold" style={{ color: cs.fg }}>{COMPONENT_BAND_LABEL[c.band][lang === "IS" ? "IS" : "EN"]}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Decel intelligence — braking burden + accel:decel balance (McBurnie 2022). */}
            {player.signals && anySignal(player.signals.decel, player.signals.accel) ? (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{L(lang, "Decel intelligence", "Hemlunar-greining")}</div>
                <div className="mt-1.5 space-y-1.5">
                  <SignalLine label={L(lang, "Decelerations", "Hemlanir")} sz={player.signals.decel} lang={lang} />
                  {player.signals.adRatio != null ? (
                    <div className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="text-slate-600">{L(lang, "Accel : decel", "Hröðun : hemlun")}</span>
                      <span className="font-semibold tabular-nums text-[#14181c]">{player.signals.adRatio.toFixed(2)} · {profileLabel(player.signals.loadProfile, lang)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* IMA intelligence — inertial multidirectional efforts GPS speed can't see. */}
            {player.signals && anySignal(player.signals.ima.accel, player.signals.ima.decel, player.signals.ima.total) ? (
              <div>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {L(lang, "IMA intelligence", "IMA-greining")}
                  <span
                    className="cursor-help text-slate-400"
                    title={L(lang,
                      "Inertial movement analysis — multidirectional accel/decel/CoD efforts the GPS speed trace can't see.",
                      "Inertial movement analysis — fjölstefnu hröðun/hemlun/stefnubreytingar sem GPS-hraðinn sér ekki.")}
                  >ⓘ</span>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  <SignalLine label={L(lang, "IMA accel", "IMA hröðun")} sz={player.signals.ima.accel} lang={lang} />
                  <SignalLine label={L(lang, "IMA decel", "IMA hemlun")} sz={player.signals.ima.decel} lang={lang} />
                  <SignalLine label={L(lang, "IMA total", "IMA samtals")} sz={player.signals.ima.total} lang={lang} />
                </div>
              </div>
            ) : null}

            {intensity?.available ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{L(lang, "Work rate vs his usual day", "Ákefð m.v. venjulegan dag")}</div>
                <div className="mt-1 text-[#2a2e33]">
                  {T(intensity.headline) || L(lang, "Within his usual range.", "Innan venju hans.")}
                  {intensity.z != null ? <span className="text-slate-400"> · z {intensity.z > 0 ? "+" : ""}{intensity.z}</span> : null}
                </div>
                {intensity.counterfactual ? <div className="mt-1 text-slate-500">{T(intensity.counterfactual)}</div> : null}
              </div>
            ) : null}

            {conf ? (
              <div className="text-[12px] text-slate-500">
                {CONF_LABEL[conf.level][lang === "IS" ? "IS" : "EN"]}
                {" · "}
                {L(lang, "coverage", "þekja")} {Math.round(conf.coverage * 100)}%
                {" · "}
                {L(lang, "baseline", "grunnlína")} {conf.baselineDays}{L(lang, "d", " d")}
              </div>
            ) : null}

            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
              {L(lang,
                "External-load proxy (Vanrenterghem 2017; Impellizzeri 2020) — describes load, not injury risk or readiness.",
                "Ytra álags-mæling (Vanrenterghem 2017; Impellizzeri 2020) — lýsir álagi, ekki meiðslahættu eða heilsustöðu.")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
