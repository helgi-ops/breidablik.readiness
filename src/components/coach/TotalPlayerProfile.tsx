"use client";

/**
 * Total Player Profile — the hub at the top of Player Season Analysis.
 *
 * Two SEPARATE labelled reads (never a blended score): the player AS A FOOTBALLER
 * (per-90 percentiles) and AS AN ATHLETE (GPS/VALD/VBT position-percentiles), each
 * with its own radar + strengths/weaknesses, plus the footballer↔athlete cross-link
 * flags. Explainability-first: a one-line verdict → 2-3 facts → "Show details" table.
 * Every number carries source + date + confidence; the profile links out to the
 * detailed modules (it is a hub, it does not rebuild them). PERFORMANCE ONLY — nothing
 * here touches the readiness colour, load, or the medical/injury view.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { QUALITY_BY_ID, type AthleteProfile, type QualityRead } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { PlayerAnalysis } from "@/lib/micropulse/playerAnalysis";
import type { TotalPlayerAnalysis, CrossLink } from "@/lib/micropulse/playerAnalysis/totalPlayerAnalysis";

type Lang = "EN" | "IS";
type Strings = (typeof T)["EN"] | (typeof T)["IS"];
type ListItem = { playerId: string; name: string; position: string | null; has: { athlete: boolean; footballer: boolean }; athleteQualities: number };

const T = {
  EN: {
    heading: "Total profile", pick: "Player", none: "No players on the roster yet.",
    footballer: "As a footballer", athlete: "As an athlete", crossLinks: "Reading across the two",
    strengths: "Strengths", development: "Development areas", noAxis: "Not linked yet",
    showDetails: "Show details", hideDetails: "Hide details",
    quality: "Quality", value: "Value", pctl: "%ile", source: "Source", date: "Date", conf: "Confidence", trend: "Trend",
    coverage: "Data", of: "of", qualities: "qualities", sources: "Sources",
    fbNote: "Full footballer breakdown is below.", athleteNote: "Physical qualities ranked within position (squad fallback).",
    drill: "Open detail", forcePlates: "Force plates", vbt: "VBT / strength", movement: "Match movement",
    aiTag: "Rules compute the percentiles; wording is descriptive.",
    perf: "Performance read — never the readiness colour or a medical/injury judgement.",
    benchSquad: "vs squad", benchPos: "vs position",
    confHigh: "high", confMod: "moderate", confLow: "low",
    noData: "No profile data for this player yet.",
  },
  IS: {
    heading: "Heildarprófíll", pick: "Leikmaður", none: "Engir leikmenn í hópnum enn.",
    footballer: "Sem fótboltamaður", athlete: "Sem íþróttamaður", crossLinks: "Lesið þvert á ásana",
    strengths: "Styrkleikar", development: "Þróunar-svæði", noAxis: "Ekki tengt enn",
    showDetails: "Sýna nánar", hideDetails: "Fela nánar",
    quality: "Eiginleiki", value: "Gildi", pctl: "percentíl", source: "Heimild", date: "Dags", conf: "Vissa", trend: "Þróun",
    coverage: "Gögn", of: "af", qualities: "eiginleikum", sources: "Heimildir",
    fbNote: "Full fótbolta-sundurliðun er neðar.", athleteNote: "Líkamlegir eiginleikar raðað innan stöðu (liðið til vara).",
    drill: "Opna nánar", forcePlates: "Kraftplötur", vbt: "VBT / styrkur", movement: "Leik-hreyfing",
    aiTag: "Reglur reikna percentílin; orðalag er lýsandi.",
    perf: "Frammistöðu-lestur — aldrei readiness-liturinn eða læknisfræðilegt/meiðsla-mat.",
    benchSquad: "vs lið", benchPos: "vs staða",
    confHigh: "mikil", confMod: "meðal", confLow: "lítil",
    noData: "Engin prófílgögn fyrir þennan leikmann enn.",
  },
} as const;

const pctColor = (p: number | null): string => (p == null ? "#c7cdd6" : p >= 70 ? "#1c7a4a" : p <= 30 ? "#a83e28" : "#2740e6");
const confDot = (c: string): string => (c === "high" ? "#1c7a4a" : c === "moderate" ? "#de9328" : "#c7cdd6");
const trendGlyph = (t: QualityRead["trend"]): string => (t === "rising" ? "↗" : t === "falling" ? "↘" : t === "stable" ? "→" : "");

function qLabel(id: QualityRead["id"], lang: Lang): string {
  const q = QUALITY_BY_ID[id];
  return lang === "IS" ? q.is : q.en;
}

// ── Radar ────────────────────────────────────────────────────────────────────
function Radar({ points, color }: { points: Array<{ label: string; pct: number | null }>; color: string }) {
  const withPct = points.filter((p) => p.pct != null);
  if (withPct.length < 3) return null; // a radar needs at least a triangle
  const n = withPct.length, cx = 110, cy = 104, r = 78;
  const ang = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const at = (i: number, rad: number) => ({ x: cx + rad * Math.cos(ang(i)), y: cy + rad * Math.sin(ang(i)) });
  const poly = withPct.map((p, i) => { const q = at(i, (r * (p.pct ?? 0)) / 100); return `${q.x},${q.y}`; }).join(" ");
  return (
    <svg viewBox="0 0 220 208" className="w-full max-w-[240px]" role="img">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={withPct.map((_, i) => { const q = at(i, (r * ring) / 100); return `${q.x},${q.y}`; }).join(" ")}
          fill="none" stroke="#e3e1d9" strokeWidth={1} />
      ))}
      {withPct.map((_, i) => { const q = at(i, r); return <line key={i} x1={cx} y1={cy} x2={q.x} y2={q.y} stroke="#e3e1d9" strokeWidth={1} />; })}
      <polygon points={poly} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
      {withPct.map((p, i) => { const q = at(i, r + 8); return (
        <text key={i} x={q.x} y={q.y} fontSize={7.5} fill="#5b6470" textAnchor="middle" dominantBaseline="middle">{p.label}</text>
      ); })}
    </svg>
  );
}

function Chip({ text, tone }: { text: string; tone: "green" | "amber" }) {
  const bg = tone === "green" ? "#e7f2ec" : "#fbf1e0", fg = tone === "green" ? "#1c7a4a" : "#a86a12";
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: bg, color: fg }}>{text}</span>;
}

// ── Panels ───────────────────────────────────────────────────────────────────
function AthletePanel({ athlete, t, lang }: { athlete: AthleteProfile | null; t: Strings; lang: Lang }) {
  if (!athlete || athlete.coverage.qualitiesWithData === 0) {
    return <div className="text-[13px] text-slate-400">{t.noAxis}</div>;
  }
  const pts = athlete.qualities.map((q) => ({ label: qLabel(q.id, lang), pct: q.value == null ? null : q.positionPercentile }));
  return (
    <div className="space-y-2">
      <Radar points={pts} color="#2740e6" />
      <div className="flex flex-wrap gap-1.5">
        {athlete.strengths.slice(0, 3).map((q) => <Chip key={q.id} tone="green" text={qLabel(q.id, lang)} />)}
        {athlete.weaknesses.slice(0, 3).map((q) => <Chip key={q.id} tone="amber" text={qLabel(q.id, lang)} />)}
      </div>
      <p className="text-[11px] text-slate-500">{t.athleteNote}</p>
    </div>
  );
}

function FootballerPanel({ footballer, t, lang }: { footballer: PlayerAnalysis | null; t: Strings; lang: Lang }) {
  if (!footballer || footballer.goalkeeper || footballer.metrics.length === 0) {
    return <div className="text-[13px] text-slate-400">{t.noAxis}</div>;
  }
  const cats = ["attacking", "possession", "defending"] as const;
  const catLabel: Record<string, { en: string; is: string }> = {
    attacking: { en: "Attacking", is: "Sókn" }, possession: { en: "Possession", is: "Boltameðferð" }, defending: { en: "Defending", is: "Vörn" },
  };
  const isIS = lang === "IS";
  const pts = cats.map((c) => ({ label: isIS ? catLabel[c].is : catLabel[c].en, pct: footballer.byCategory[c] }));
  return (
    <div className="space-y-2">
      <Radar points={pts} color="#7a5cc4" />
      <div className="flex flex-wrap gap-1.5">
        {footballer.strengths.slice(0, 3).map((m) => <Chip key={m.key} tone="green" text={m.label} />)}
        {footballer.weaknesses.slice(0, 3).map((m) => <Chip key={m.key} tone="amber" text={m.label} />)}
      </div>
      <p className="text-[11px] text-slate-500">{t.fbNote}</p>
    </div>
  );
}

function CrossLinks({ links, t, lang }: { links: CrossLink[]; t: Strings; lang: Lang }) {
  if (!links.length) return null;
  const isIS = lang === "IS";
  return (
    <div className="rounded-xl border border-[#e3e1d9] bg-[#faf9f5] p-3">
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">⚡ {t.crossLinks}</div>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.id} className="text-[13px] text-slate-800">
            <span className="font-medium">{isIS ? l.is : l.en}</span>
            <span className="ml-1 text-slate-500">— {l.evidence.map((e) => (isIS ? e.is : e.en)).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AthleteDetails({ athlete, t, lang }: { athlete: AthleteProfile; t: Strings; lang: Lang }) {
  const rows = athlete.qualities.filter((q) => q.value != null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1 pr-3 font-semibold">{t.quality}</th>
            <th className="py-1 pr-3 font-semibold">{t.value}</th>
            <th className="py-1 pr-3 font-semibold">{t.pctl}</th>
            <th className="py-1 pr-3 font-semibold">{t.source}</th>
            <th className="py-1 pr-3 font-semibold">{t.date}</th>
            <th className="py-1 pr-3 font-semibold">{t.conf}</th>
            <th className="py-1 pr-1 font-semibold">{t.trend}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id} className="border-t border-[#eceae2]">
              <td className="py-1 pr-3 font-medium text-slate-800">{qLabel(q.id, lang)}</td>
              <td className="py-1 pr-3 tabular-nums text-slate-700">{q.value}{q.unit ? ` ${q.unit}` : ""}</td>
              <td className="py-1 pr-3">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-8 rounded-full" style={{ background: `linear-gradient(90deg, ${pctColor(q.positionPercentile)} ${q.positionPercentile ?? 0}%, #eceae2 ${q.positionPercentile ?? 0}%)` }} />
                  <span className="tabular-nums text-slate-700">{q.positionPercentile ?? "—"}</span>
                  <span className="text-[10px] text-slate-400">{q.benchmark === "position" ? t.benchPos : t.benchSquad}</span>
                </span>
              </td>
              <td className="py-1 pr-3 text-slate-600">{q.source ?? "—"}</td>
              <td className="py-1 pr-3 text-slate-500">{q.date ?? "—"}</td>
              <td className="py-1 pr-3">
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: confDot(q.confidence) }} />
                  {q.confidence === "high" ? t.confHigh : q.confidence === "moderate" ? t.confMod : t.confLow}
                </span>
              </td>
              <td className="py-1 pr-1 text-slate-600">{trendGlyph(q.trend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TotalPlayerProfile() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [list, setList] = React.useState<ListItem[] | null>(null);
  const [sel, setSel] = React.useState<string>("");
  const [total, setTotal] = React.useState<TotalPlayerAnalysis | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [details, setDetails] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  React.useEffect(() => {
    (async () => {
      const tok = await token(); if (!tok) return;
      const res = await fetch("/api/coach/total-player-analysis?list=1", { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (j.ok) { setList(j.players ?? []); if (j.players?.[0]) setSel(j.players[0].playerId); }
    })();
  }, [token]);

  React.useEffect(() => {
    if (!sel) return;
    (async () => {
      setBusy(true); setDetails(false);
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/total-player-analysis?playerId=${encodeURIComponent(sel)}&lang=${lang}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json();
        setTotal(res.ok && j.ok ? j.total : null);
      } finally { setBusy(false); }
    })();
  }, [sel, lang, token]);

  if (list && list.length === 0) return null; // no roster → nothing to show

  const athlete = total?.athlete ?? null;
  const headline = total?.headline ? (lang === "IS" ? total.headline.is : total.headline.en) : null;

  return (
    <section className="rounded-2xl border border-[#e3e1d9] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{t.heading}</h2>
        {list && list.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.pick}</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
              {list.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}{p.position ? ` · ${p.position}` : ""}{!p.has.footballer && !p.has.athlete ? " · —" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {busy && !total ? <p className="mt-3 text-sm text-slate-400">…</p> : null}

      {total ? (
        <div className="mt-3 space-y-3">
          {/* Layer 0 — one-line verdict, first and boldest */}
          {headline ? <p className="text-[15px] font-bold text-slate-900">{headline}</p> : null}
          {!athlete && !total.footballer ? <p className="text-[13px] text-slate-500">{t.noData}</p> : null}

          {/* Layer 1 — two labelled reads, side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#eceae2] p-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#7a5cc4" }}>{t.footballer}</div>
              <FootballerPanel footballer={total.footballer} t={t} lang={lang} />
            </div>
            <div className="rounded-xl border border-[#eceae2] p-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#2740e6" }}>{t.athlete}</div>
              <AthletePanel athlete={athlete} t={t} lang={lang} />
            </div>
          </div>

          <CrossLinks links={total.crossLinks} t={t} lang={lang} />

          {/* Coverage + drill-downs */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {athlete ? <span>{t.coverage}: {athlete.coverage.qualitiesWithData} {t.of} {athlete.coverage.totalQualities} {t.qualities}</span> : null}
            {total.coverage.sources.length ? <span>· {t.sources}: {total.coverage.sources.join(", ")}</span> : null}
            <span className="text-slate-400">· {t.perf}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px]">
            <Link href="/coach/rtp" className="rounded-lg border border-slate-200 px-2 py-1 font-medium text-[#2740e6] hover:bg-slate-50">{t.forcePlates} →</Link>
            <Link href="/coach/lv-profile" className="rounded-lg border border-slate-200 px-2 py-1 font-medium text-[#2740e6] hover:bg-slate-50">{t.vbt} →</Link>
            <Link href="/coach/match-movement" className="rounded-lg border border-slate-200 px-2 py-1 font-medium text-[#2740e6] hover:bg-slate-50">{t.movement} →</Link>
          </div>

          {/* Layer 2 — details behind a toggle */}
          {athlete && athlete.coverage.qualitiesWithData > 0 ? (
            <div>
              <button onClick={() => setDetails((v) => !v)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
                {details ? t.hideDetails : t.showDetails}
              </button>
              {details ? (
                <div className="mt-2 rounded-xl border border-[#eceae2] p-3">
                  <AthleteDetails athlete={athlete} t={t} lang={lang} />
                  <p className="mt-2 text-[11px] text-slate-400">{t.aiTag}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
