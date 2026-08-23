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
import type { PeakShapeTrack } from "@/lib/micropulse/load/peakBenchmark";
import { downloadPlayerProfilePdf, type PlayerProfilePdfPayload } from "@/components/coach/PlayerProfilePdf";

type Lang = "EN" | "IS";
type Strings = (typeof T)["EN"] | (typeof T)["IS"];
type ListItem = { playerId: string; name: string; position: string | null; has: { athlete: boolean; footballer: boolean }; athleteQualities: number };
type Narrative = { profile?: string; footballerRead?: string; athleteRead?: string; crossRead?: string; roleFit?: string } | null;
type DevItem = { axis: "athlete" | "footballer"; key: string; percentile: number | null; lever: { en: string; is: string; cite?: string }; label: { en: string; is: string } };

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
    read: "Coach read", aiLabel: "AI · phrases the numbers, decides nothing",
    roleFit: "Role & fit", improve: "How to improve the weak areas",
    improveNone: "No clear weaknesses flagged — nothing to prioritise.",
    pdf: "Download profile (PDF)", pdfBusy: "Preparing…",
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
    read: "Þjálfara-lestur", aiLabel: "gervigreind · orðar tölurnar, ákveður ekkert",
    roleFit: "Hlutverk og notkun", improve: "Hvernig má bæta veiku svæðin",
    improveNone: "Engin skýr veiku svæði — ekkert að forgangsraða.",
    pdf: "Sækja prófíl (PDF)", pdfBusy: "Undirbý…",
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
/** Split a long axis label into (at most) two balanced lines so it doesn't overflow
 *  the radar horizontally. Short single-word labels stay on one line. */
function wrapLabel(s: string): string[] {
  if (s.length <= 12) return [s];
  const words = s.split(" ");
  if (words.length < 2) return [s];
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length, b = words.slice(i).join(" ").length;
    const diff = Math.abs(a - b);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

function Radar({ points, color, className = "w-full max-w-[260px]" }: { points: Array<{ label: string; pct: number | null }>; color: string; className?: string }) {
  const withPct = points.filter((p) => p.pct != null);
  if (withPct.length < 3) return null; // a radar needs at least a triangle
  const n = withPct.length, cx = 110, cy = 104, r = 78;
  const ang = (i: number) => (-90 + (i * 360) / n) * (Math.PI / 180);
  const at = (i: number, rad: number) => ({ x: cx + rad * Math.cos(ang(i)), y: cy + rad * Math.sin(ang(i)) });
  const poly = withPct.map((p, i) => { const q = at(i, (r * (p.pct ?? 0)) / 100); return `${q.x},${q.y}`; }).join(" ");
  return (
    // Extra horizontal padding + side-aware anchoring so long labels (e.g. "Anaerobic
    // reserve (D′)") sit outside the chart instead of clipping at the edge.
    <svg viewBox="-30 -6 280 220" className={className} role="img">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={withPct.map((_, i) => { const q = at(i, (r * ring) / 100); return `${q.x},${q.y}`; }).join(" ")}
          fill="none" stroke="#e3e1d9" strokeWidth={1} />
      ))}
      {withPct.map((_, i) => { const q = at(i, r); return <line key={i} x1={cx} y1={cy} x2={q.x} y2={q.y} stroke="#e3e1d9" strokeWidth={1} />; })}
      <polygon points={poly} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
      {withPct.map((p, i) => {
        const q = at(i, r + 9);
        const dx = q.x - cx;
        const anchor = Math.abs(dx) < 2 ? "middle" : dx > 0 ? "start" : "end";
        const lines = wrapLabel(p.label);
        return (
          <text key={i} x={q.x} y={q.y} fontSize={7.5} fill="#5b6470" textAnchor={anchor} dominantBaseline="middle">
            {lines.map((ln, k) => (
              <tspan key={k} x={q.x} dy={k === 0 ? (lines.length > 1 ? "-0.45em" : "0") : "1em"}>{ln}</tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

/** The radar plus a click-to-enlarge modal (a bigger copy of the same chart). */
function ZoomableRadar({ points, color, title }: { points: Array<{ label: string; pct: number | null }>; color: string; title: string }) {
  const [open, setOpen] = React.useState(false);
  const enough = points.filter((p) => p.pct != null).length >= 3;
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!enough) return <Radar points={points} color={color} />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Click to enlarge" aria-label="Enlarge radar"
        className="block w-full cursor-zoom-in rounded-lg transition hover:bg-slate-50">
        <Radar points={points} color={color} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="relative w-full max-w-[560px] rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">{title}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100">&times;</button>
            </div>
            <Radar points={points} color={color} className="mx-auto w-full max-w-[520px]" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function Chip({ text, tone }: { text: string; tone: "green" | "amber" }) {
  const bg = tone === "green" ? "#e7f2ec" : "#fbf1e0", fg = tone === "green" ? "#1c7a4a" : "#a86a12";
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: bg, color: fg }}>{text}</span>;
}

/**
 * Movement-style chip — a DESCRIPTIVE style label (linear ↔ multidirectional) from the
 * IMA clock + free-running read, self-contained. It is a style, not a quality/strength,
 * so it sits as its own chip, never on the radar. Renders nothing without enough data.
 */
function MovementStyleChip({ playerId, lang }: { playerId: string; lang: Lang }) {
  const [label, setLabel] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!playerId) { setLabel(null); return; }
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) return;
      const res = await fetch(`/api/coach/load/movement-style?player=${playerId}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json().catch(() => null);
      if (alive) setLabel(j?.ok && j.hasData ? (j.style?.label ?? null) : null);
    })();
    return () => { alive = false; };
  }, [playerId]);
  if (!label || label === "insufficient") return null;
  const is = lang === "IS";
  const map: Record<string, { en: string; is: string; bg: string; fg: string }> = {
    multidirectional: { en: "Multidirectional", is: "Fjölstefnu", bg: "#eaecfb", fg: "#2740e6" },
    linear: { en: "Linear runner", is: "Línulegur hlaupari", bg: "#e7f2ec", fg: "#1c7a4a" },
    balanced: { en: "Balanced style", is: "Jafnvægis-stíll", bg: "#f0eee6", fg: "#6f6d64" },
  };
  const m = map[label];
  if (!m) return null;
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: m.bg, color: m.fg }}
      title={is ? "Hreyfistíll úr IMA-klukku + free-running — lýsandi stíll, ekki gæði (línulegur ≠ verri). Sjá Power Curve Intelligence." : "Movement style from IMA clock + free-running — a descriptive style, not a quality (linear ≠ worse). See Power Curve Intelligence."}>
      {is ? m.is : m.en}
    </span>
  );
}

// ── Panels ───────────────────────────────────────────────────────────────────
function AthletePanel({ athlete, t, lang, playerId }: { athlete: AthleteProfile | null; t: Strings; lang: Lang; playerId: string }) {
  if (!athlete || athlete.coverage.qualitiesWithData === 0) {
    return <div className="text-[13px] text-slate-400">{t.noAxis}</div>;
  }
  const pts = athlete.qualities.map((q) => ({ label: qLabel(q.id, lang), pct: q.value == null ? null : q.positionPercentile }));
  return (
    <div className="space-y-2">
      <ZoomableRadar points={pts} color="#2740e6" title={lang === "IS" ? "Sem íþróttamaður" : "As an athlete"} />
      <div className="flex flex-wrap gap-1.5">
        {athlete.strengths.slice(0, 3).map((q) => <Chip key={q.id} tone="green" text={qLabel(q.id, lang)} />)}
        {athlete.weaknesses.slice(0, 3).map((q) => <Chip key={q.id} tone="amber" text={qLabel(q.id, lang)} />)}
        {/* Descriptive movement STYLE — its own chip, never a radar/quality axis. */}
        <MovementStyleChip playerId={playerId} lang={lang} />
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
      <ZoomableRadar points={pts} color="#7a5cc4" title={isIS ? "Sem fótboltamaður" : "As a footballer"} />
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

function NarrativeBlock({ n, t }: { n: Narrative; t: Strings }) {
  if (!n) return null;
  const paras: Array<{ label?: string; text?: string }> = [
    { text: n.footballerRead }, { text: n.athleteRead }, { text: n.crossRead }, { label: t.roleFit, text: n.roleFit },
  ].filter((p) => (p.text ?? "").trim());
  if (!(n.profile ?? "").trim() && paras.length === 0) return null;
  return (
    <div className="rounded-xl border border-[#eceae2] bg-[#faf9f5] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t.read}</span>
        <span className="rounded-full bg-[#eef0fb] px-2 py-0.5 text-[10px] font-semibold text-[#2740e6]">{t.aiLabel}</span>
      </div>
      {(n.profile ?? "").trim() ? <p className="text-[14px] font-semibold text-slate-900">{n.profile}</p> : null}
      <div className="mt-1.5 space-y-1.5">
        {paras.map((p, i) => (
          <p key={i} className="text-[13px] leading-relaxed text-slate-700">
            {p.label ? <span className="font-semibold text-slate-800">{p.label}: </span> : null}{p.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function ImproveBlock({ items, t, lang }: { items: DevItem[]; t: Strings; lang: Lang }) {
  return (
    <div className="rounded-xl border border-[#f0e2c8] bg-[#fdf8ee] p-3">
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#a86a12" }}>{t.improve}</div>
      {items.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t.improveNone}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li key={`${d.axis}-${d.key}`} className="text-[13px] text-slate-800">
              <span className="font-semibold">{lang === "IS" ? d.label.is : d.label.en}</span>
              {d.percentile != null ? <span className="ml-1 text-[11px] text-slate-500">({d.percentile}{lang === "IS" ? ". percentíl" : "th %ile"})</span> : null}
              <span className="ml-1">— {lang === "IS" ? d.lever.is : d.lever.en}</span>
              {d.lever.cite ? <span className="ml-1 text-[11px] italic text-slate-400">{d.lever.cite}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
type LinkRow = { name: string; passes: number; obv: number };
type PassingLinks = { matches: number; passesTo: LinkRow[]; passesFrom: LinkRow[] };

const linkLast = (n: string) => n.split(" ").slice(-1)[0];
const linkObv = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

function LinkCol({ title, rows }: { title: string; rows: LinkRow[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {rows.length ? (
        <ul className="space-y-0.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-slate-700">{linkLast(r.name)}</span>
              <span className="shrink-0 tabular-nums"><b className="text-slate-800">{r.passes}</b> <span className={`text-[11px] font-medium ${r.obv >= 0 ? "text-emerald-600" : "text-red-500"}`}>{linkObv(r.obv)}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[11px] text-slate-400">—</p>}
    </div>
  );
}

/** Who this player combines with — from StatsBomb OBV passing combinations, aggregated
 *  across ingested matches. Descriptive; adds the "who" behind the season Pass OBV. */
function PassingLinksBlock({ links, is }: { links: PassingLinks | null; is: boolean }) {
  if (!links || (links.passesTo.length === 0 && links.passesFrom.length === 0)) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">🔗 {is ? "Sendinga-tengingar" : "Passing links"}
        <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">· {links.matches} {is ? "leikir" : "matches"}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LinkCol title={is ? "Sendir mest á" : "Passes most to"} rows={links.passesTo} />
        <LinkCol title={is ? "Fær mest frá" : "Receives most from"} rows={links.passesFrom} />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">{is ? "StatsBomb OBV sendingar; sendingar + virði (OBV). Lýsandi." : "StatsBomb OBV combinations; passes + value (OBV). Descriptive."}</p>
    </div>
  );
}

/** Peak-period fall-off SHAPE (total distance, context only — never graded vs Ju Table 2). */
function PeakShapeBlock({ shape, is }: { shape: PeakShapeTrack | null; is: boolean }) {
  if (!shape || !shape.available || shape.read === "na") return null;
  const dot = shape.read === "sustains" ? "#1c7a4a" : shape.read === "steep" ? "#a83e28" : "#de9328";
  const word = shape.read === "sustains" ? { en: "holds well", is: "heldur vel" }
    : shape.read === "steep" ? { en: "steep fall-off", is: "bratt fall" }
    : { en: "moderate fall-off", is: "hóflegt fall" };
  const ret = shape.retain5 ?? shape.retain3;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
        {is ? "Hámarks-lögun" : "Peak-period shape"}
        <span className="font-normal normal-case tracking-normal text-slate-500">— {is ? word.is : word.en}</span>
      </div>
      <p className="mt-1 tabular-nums text-[13px] text-slate-700">
        1-mín {shape.w1?.toFixed(0) ?? "–"} → 3-mín {shape.w3?.toFixed(0) ?? "–"} → 5-mín {shape.w5?.toFixed(0) ?? "–"} m/min
        {ret != null ? <span className="text-slate-500"> · {is ? "heldur" : "keeps"} {ret}% {is ? "yfir" : "over"} {shape.retain5 != null ? "5" : "3"} {is ? "mín" : "min"}</span> : null}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{shape.note[is ? "is" : "en"]}</p>
    </div>
  );
}

export default function TotalPlayerProfile() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [list, setList] = React.useState<ListItem[] | null>(null);
  const [sel, setSel] = React.useState<string>("");
  const [total, setTotal] = React.useState<TotalPlayerAnalysis | null>(null);
  const [narrative, setNarrative] = React.useState<Narrative>(null);
  const [development, setDevelopment] = React.useState<DevItem[]>([]);
  const [passingLinks, setPassingLinks] = React.useState<PassingLinks | null>(null);
  const [peakShape, setPeakShape] = React.useState<PeakShapeTrack | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
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
      setBusy(true); setDetails(false); setNarrative(null); setDevelopment([]); setPassingLinks(null); setPeakShape(null);
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/total-player-analysis?playerId=${encodeURIComponent(sel)}&lang=${lang}&prose=1`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json();
        if (res.ok && j.ok) { setTotal(j.total); setNarrative(j.narrative ?? null); setDevelopment(j.development ?? []); setPassingLinks(j.passingLinks ?? null); setPeakShape(j.peakShape ?? null); }
        else { setTotal(null); }
      } finally { setBusy(false); }
    })();
  }, [sel, lang, token]);

  const selName = list?.find((p) => p.playerId === sel)?.name ?? "";

  const exportPdf = React.useCallback(async () => {
    if (!total) return;
    setPdfBusy(true);
    try {
      const fb = total.footballer && !total.footballer.goalkeeper ? {
        role: total.footballer.role,
        strengths: total.footballer.strengths.slice(0, 4).map((m) => ({ label: m.label, percentile: m.percentile })),
        weaknesses: total.footballer.weaknesses.slice(0, 4).map((m) => ({ label: m.label, percentile: m.percentile })),
      } : null;
      const ath = total.athlete && total.athlete.coverage.qualitiesWithData > 0 ? {
        qualities: total.athlete.qualities.filter((q) => q.value != null).map((q) => ({
          label: lang === "IS" ? QUALITY_BY_ID[q.id].is : QUALITY_BY_ID[q.id].en,
          value: String(q.value), unit: q.unit, percentile: q.positionPercentile, verdict: q.verdict, source: q.source, date: q.date,
        })),
      } : null;
      const payload: PlayerProfilePdfPayload = {
        playerName: selName || total.playerId || "Player",
        position: list?.find((p) => p.playerId === sel)?.position ?? null,
        minutes: total.footballer?.minutes ?? null,
        headline: total.headline ? (lang === "IS" ? total.headline.is : total.headline.en) : null,
        aiGenerated: !!narrative,
        narrative,
        footballer: fb,
        athlete: ath,
        crossLinks: total.crossLinks.map((l) => ({ text: lang === "IS" ? l.is : l.en, evidence: l.evidence.map((e) => (lang === "IS" ? e.is : e.en)).join(" · ") })),
        development: development.map((d) => ({ label: lang === "IS" ? d.label.is : d.label.en, percentile: d.percentile, lever: lang === "IS" ? d.lever.is : d.lever.en, cite: d.lever.cite })),
      };
      await downloadPlayerProfilePdf(payload, lang);
    } finally { setPdfBusy(false); }
  }, [total, narrative, development, lang, selName, sel, list]);

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
            {total ? (
              <button onClick={exportPdf} disabled={pdfBusy}
                className="rounded-lg border border-[#2740e6] px-2.5 py-1 text-[13px] font-semibold text-[#2740e6] hover:bg-[#eef0fb] disabled:opacity-50">
                {pdfBusy ? t.pdfBusy : `↓ ${t.pdf}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {busy && !total ? <p className="mt-3 text-sm text-slate-400">…</p> : null}

      {total ? (
        <div className="mt-3 space-y-3">
          {/* Layer 0 — one-line verdict, first and boldest */}
          {headline ? <p className="text-[15px] font-bold text-slate-900">{headline}</p> : null}
          {!athlete && !total.footballer ? <p className="text-[13px] text-slate-500">{t.noData}</p> : null}

          {/* Written coach read (AI, labelled — only phrases the numbers) */}
          <NarrativeBlock n={narrative} t={t} />

          {/* Layer 1 — two labelled reads, side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#eceae2] p-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#7a5cc4" }}>{t.footballer}</div>
              <FootballerPanel footballer={total.footballer} t={t} lang={lang} />
            </div>
            <div className="rounded-xl border border-[#eceae2] p-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "#2740e6" }}>{t.athlete}</div>
              <AthletePanel athlete={athlete} t={t} lang={lang} playerId={sel} />
            </div>
          </div>

          <CrossLinks links={total.crossLinks} t={t} lang={lang} />

          {/* Peak-period fall-off shape — total distance, context (same read as Match Movement) */}
          <PeakShapeBlock shape={peakShape} is={lang === "IS"} />

          {/* Passing links — who this player combines with (StatsBomb OBV combinations) */}
          <PassingLinksBlock links={passingLinks} is={lang === "IS"} />

          {/* How to improve the weak areas — rule-based levers, cited + overridable */}
          {(athlete || total.footballer) ? <ImproveBlock items={development} t={t} lang={lang} /> : null}

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
