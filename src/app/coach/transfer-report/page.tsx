"use client";

export const dynamic = "force-dynamic";

/**
 * /coach/transfer-report — the departing-player performance dossier.
 *
 * A coach picks a player and a window (default 120 days) and gets a layered
 * on-screen read — VALD, VBT, GPS, IMA, Games + worst-case match demands, and
 * fitness tests — plus a Breiðablik-branded PDF and an optional labelled AI
 * summary for the receiving club. The coach downloads and shares it themselves;
 * the app transmits nothing. Descriptive — it never touches the readiness colour,
 * the load target, or the daily decision. Includes inactive players on purpose
 * (a sold player is often already set inactive).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { downloadTransferReportPdf, type TransferRadar, type TransferTrends } from "@/components/coach/TransferReportPdf";
import { ProfileRadar, MatchTrendBars, type RadarMetric, type TrendBar } from "@/components/coach/PlayerGameReportCharts";
import type { TransferDossier, DossierSection, Confidence, ClockPoint } from "@/lib/micropulse/transferReport";
import type { TransferAiSummary } from "@/lib/micropulse/transferReport/ai";
import { DIRECTIONS } from "@/lib/micropulse/directionalSignature";

// Engine (GPS volume) + Driver (IMA movement) radar axes — mirrors Player Game Report.
type Bench = { percentile: number; player: number | null };
const n0 = (v: number | null | undefined) => (v == null ? "–" : Math.round(v).toLocaleString());
const f1 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(1));
const ENGINE_CFG: Array<{ key: string; label: string; fmt: (v: number | null | undefined) => string }> = [
  { key: "total_distance", label: "Dist", fmt: n0 }, { key: "hsr", label: "HSR", fmt: n0 }, { key: "sprint", label: "Sprint", fmt: n0 },
  { key: "top_speed_kmh", label: "Speed", fmt: f1 }, { key: "hml", label: "HML", fmt: n0 }, { key: "efforts", label: "Efforts", fmt: f1 },
  { key: "accel", label: "Acc", fmt: f1 }, { key: "decel", label: "Dec", fmt: f1 },
];
const DRIVER_CFG: Array<{ key: string; label: string; fmt: (v: number | null | undefined) => string }> = [
  { key: "ima_acc", label: "Acc", fmt: f1 }, { key: "ima_dec", label: "Dec", fmt: f1 }, { key: "cod", label: "CoD", fmt: f1 }, { key: "jumps", label: "Jumps", fmt: f1 },
  { key: "ima_hir5", label: "B5", fmt: n0 }, { key: "ima_hir6", label: "B6", fmt: n0 }, { key: "ima_hir7", label: "B7", fmt: n0 }, { key: "ima_hir8", label: "B8", fmt: n0 },
];
function buildRadar(cfg: typeof ENGINE_CFG, benchmarks: Record<string, Bench | undefined>, avail: Set<string> | null): RadarMetric[] {
  return cfg.filter((c) => !avail || avail.has(c.key)).map((c) => {
    const b = benchmarks[c.key];
    return b ? { label: c.label, percentile: b.percentile, valueLabel: c.fmt(b.player) } : null;
  }).filter((x): x is RadarMetric => x != null);
}

type Player = { id: string; full_name: string; position: string | null; is_active: boolean };
const WINDOWS = [90, 120, 180] as const;

const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-[#eaf3ec] text-[#145233] border-[#b0d6bd]",
  moderate: "bg-[#eef0fb] text-[#2740e6] border-[#c9d0f7]",
  low: "bg-[#faf1de] text-[#7c5210] border-[#e9c983]",
  none: "bg-slate-100 text-slate-500 border-slate-200",
};
const confLabel = (c: Confidence, is: boolean): string =>
  is ? { high: "Mikil vissa", moderate: "Miðlungs", low: "Takmörkuð gögn", none: "Engin gögn" }[c]
     : { high: "High confidence", moderate: "Moderate", low: "Limited data", none: "No data" }[c];

/** IMA clock — 12-direction polar chart (12 o'clock = straight ahead). */
function ClockRadar({ points, is }: { points: ClockPoint[]; is: boolean }) {
  const W = 300, H = 280, cx = W / 2, cy = H / 2, R = 90;
  const max = Math.max(1, ...points.map((p) => p.value));
  const at = (dir: string, frac: number) => {
    const th = ((Number(dir) % 12) * 30) * (Math.PI / 180);
    const r = frac * R;
    return [cx + r * Math.sin(th), cy - r * Math.cos(th)] as const;
  };
  const atRad = (dir: string, radius: number) => {
    const th = ((Number(dir) % 12) * 30) * (Math.PI / 180);
    return [cx + radius * Math.sin(th), cy - radius * Math.cos(th)] as const;
  };
  const ordered = [...points].sort((a, b) => (Number(a.dir) % 12) - (Number(b.dir) % 12));
  const poly = ordered.map((p) => at(p.dir, p.value / max).join(",")).join(" ");
  const dom = [...points].sort((a, b) => b.value - a.value)[0];
  const card = is ? { f: "Áfram", r: "Hægri", b: "Aftur", l: "Vinstri" } : { f: "Forward", r: "Right", b: "Back", l: "Left" };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[300px]">
      {[0.25, 0.5, 0.75, 1].map((f, i) => <circle key={i} cx={cx} cy={cy} r={f * R} fill="none" stroke="#e5e1d6" strokeWidth={0.6} />)}
      {DIRECTIONS.map((d) => { const [x, y] = at(d, 1); return <line key={d} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e1d6" strokeWidth={0.5} />; })}
      <polygon points={poly} fill="#2740e6" fillOpacity={0.16} stroke="#2740e6" strokeWidth={1.4} />
      {ordered.map((p, i) => { const [x, y] = at(p.dir, p.value / max); return <circle key={i} cx={x} cy={y} r={dom && p.dir === dom.dir ? 3.2 : 1.8} fill={dom && p.dir === dom.dir ? "#2740e6" : "#8ea2ea"} />; })}
      {DIRECTIONS.map((d) => { const [x, y] = atRad(d, R + 11); return <text key={d} x={x} y={y + 3} fontSize={8.5} fill="#8b8676" textAnchor="middle">{d}</text>; })}
      <text x={cx} y={cy - R - 26} fontSize={9.5} fill="#14181c" textAnchor="middle">{card.f}</text>
      <text x={cx + R + 26} y={cy + 3} fontSize={9.5} fill="#14181c" textAnchor="start">{card.r}</text>
      <text x={cx} y={cy + R + 30} fontSize={9.5} fill="#14181c" textAnchor="middle">{card.b}</text>
      <text x={cx - R - 26} y={cy + 3} fontSize={9.5} fill="#14181c" textAnchor="end">{card.l}</text>
    </svg>
  );
}

function SectionCard({ sec, is, clock }: { sec: DossierSection; is: boolean; clock?: ClockPoint[] | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`rounded-xl border bg-white p-4 ${sec.present ? "border-slate-200" : "border-slate-100 opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-bold text-slate-900">{is ? sec.title.is : sec.title.en}</h3>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONF_STYLE[sec.confidence]}`}>{confLabel(sec.confidence, is)}</span>
      </div>
      {sec.headline ? <p className="mt-1.5 text-[13.5px] font-semibold text-slate-800">{is ? sec.headline.is : sec.headline.en}</p> : null}
      <ul className="mt-1.5 space-y-1">
        {sec.facts.map((f, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-slate-600"><span className="text-[#2740e6]">·</span><span>{is ? f.is : f.en}</span></li>
        ))}
      </ul>
      {clock && clock.length ? <div className="mt-2 flex justify-center"><ClockRadar points={clock} is={is} /></div> : null}
      {sec.tables.some((t) => t.rows.length) ? (
        <div className="mt-2">
          <button onClick={() => setOpen((o) => !o)} className="text-[12px] font-semibold text-[#2740e6] hover:underline">
            {open ? (is ? "Fela tölur" : "Hide details") : (is ? "Sýna tölur" : "Show details")}
          </button>
          {open ? (
            <div className="mt-2 space-y-3">
              {sec.tables.filter((t) => t.rows.length).map((tbl, ti) => (
                <div key={ti}>
                  {tbl.caption ? <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? tbl.caption.is : tbl.caption.en}</div> : null}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          {tbl.columns.map((c, i) => (
                            <th key={i} className={`py-1 font-semibold ${i === 0 ? "text-left pr-3" : "text-right px-2"}`}>{is ? c.is : c.en}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tbl.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-slate-100">
                            {row.map((cell, ci) => (
                              <td key={ci} className={`py-1 tabular-nums ${ci === 0 ? "text-left pr-3 text-slate-700" : "text-right px-2 text-slate-600"}`}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function TransferReportPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [players, setPlayers] = React.useState<Player[] | null>(null);
  const [sel, setSel] = React.useState<string>("");
  const [days, setDays] = React.useState<number>(120);
  const [dossier, setDossier] = React.useState<TransferDossier | null>(null);
  const [consentOk, setConsentOk] = React.useState<boolean | null>(null);
  const [ai, setAi] = React.useState<TransferAiSummary | null>(null);
  const [radar, setRadar] = React.useState<TransferRadar>(null);
  const [trends, setTrends] = React.useState<TransferTrends>(null);
  const [editBody, setEditBody] = React.useState(false);
  const [hIn, setHIn] = React.useState("");
  const [wIn, setWIn] = React.useState("");
  const [bodyBusy, setBodyBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  // Roster — includes inactive players (a sold player is often already inactive).
  React.useEffect(() => {
    (async () => {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const teamId = prof?.team_id as string | null;
      if (!teamId) { setErr(is ? "Ekkert lið." : "No team."); return; }
      const { data } = await sb.from("players").select("id, full_name, position, is_active").eq("team_id", teamId).order("full_name");
      const list = (data ?? []) as Player[];
      setPlayers(list);
      if (list[0]) setSel(list[0].id);
    })();
  }, [is]);

  const load = React.useCallback(async () => {
    if (!sel) return;
    setBusy(true); setErr(null); setAi(null);
    try {
      const tok = await token(); if (!tok) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch(`/api/coach/transfer-report/${sel}?days=${days}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); setDossier(null); return; }
      setDossier(j.dossier as TransferDossier);
      setConsentOk(typeof j.consentOk === "boolean" ? j.consentOk : null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }, [sel, days, token, is]);

  React.useEffect(() => { if (sel) void load(); }, [sel, days, load]);

  // Engine/Driver radars + per-match trend bars — reuse the Player Game Report data.
  React.useEffect(() => {
    if (!sel) { setRadar(null); setTrends(null); return; }
    let live = true;
    (async () => {
      const tok = await token(); if (!tok) return;
      const yr = new Date().getFullYear();
      const res = await fetch(`/api/coach/player-game-report?player_id=${sel}&season=${yr}`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.ok ? r.json() : null).catch(() => null);
      if (!live) return;
      const bench = (res?.benchmarks ?? null) as Record<string, Bench | undefined> | null;
      if (bench) {
        const avail = res?.availableKeys ? new Set<string>(res.availableKeys) : null;
        const engine = buildRadar(ENGINE_CFG, bench, avail);
        const driver = buildRadar(DRIVER_CFG, bench, avail);
        setRadar(engine.length >= 3 || driver.length >= 3 ? { engine, driver } : null);
      } else setRadar(null);
      // Per-match trend bars (per-90), mirroring Player Game Report.
      const matches = (res?.matches ?? []) as Array<{ opponent: string | null; date: string; has_gps: boolean; p90: Record<string, number | null> | null }>;
      const avg = (res?.summary?.per90_avg ?? null) as Record<string, number | null> | null;
      const gps = matches.filter((m) => m.has_gps);
      if (gps.length && avg) {
        const shortOpp = (m: { opponent: string | null; date: string }) => (m.opponent ?? m.date.slice(5)).replace(/\s*\([^)]*\)\s*$/, "").split(" ")[0].slice(0, 7);
        const series = (key: string): TrendBar[] => gps.map((m) => ({ label: shortOpp(m), value: Number(m.p90?.[key]) || 0 }));
        setTrends({
          distance: { bars: series("total_distance"), avg: avg.total_distance ?? null },
          hsr: { bars: series("hsr"), avg: avg.hsr ?? null },
          sprint: { bars: series("sprint"), avg: avg.sprint ?? null },
        });
      } else setTrends(null);
    })();
    return () => { live = false; };
  }, [sel, token]);

  const saveBody = React.useCallback(async () => {
    if (!sel) return;
    const massKg = Number(wIn), heightCm = Number(hIn);
    if (!Number.isFinite(massKg) || massKg <= 20 || massKg >= 200) { setErr(is ? "Sláðu inn þyngd 20–200 kg." : "Enter weight 20–200 kg."); return; }
    setBodyBusy(true); setErr(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/player/${sel}/body-mass`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ massKg, heightCm: Number.isFinite(heightCm) && heightCm > 100 && heightCm < 230 ? heightCm : undefined }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Error"); return; }
      setEditBody(false); setHIn(""); setWIn(""); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBodyBusy(false); }
  }, [sel, wIn, hIn, token, is, load]);

  const genAi = React.useCallback(async () => {
    if (!sel) return;
    setAiBusy(true); setErr(null);
    try {
      const tok = await token(); if (!tok) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch(`/api/coach/transfer-report/${sel}`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ ai: true, days, lang: is ? "IS" : "EN" }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error ?? "Error"); return; }
      setAi(j.ai as TransferAiSummary);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setAiBusy(false); }
  }, [sel, days, token, is]);

  const downloadPdf = React.useCallback(async () => {
    if (!dossier) return;
    setPdfBusy(true);
    try { await downloadTransferReportPdf(dossier, ai, radar, trends, is ? "IS" : "EN"); } finally { setPdfBusy(false); }
  }, [dossier, ai, radar, trends, is]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Félagaskipta-skýrsla" : "Player Transfer Report"}</h1>
      <PagePurpose
        en="A departing player's full performance picture for the receiving club — GPS load and worst-case match demands, IMA, force plates (VALD), VBT, games and fitness tests over the last months — with a Breiðablik-branded PDF and an optional AI summary. Descriptive; it never encodes a readiness or availability decision."
        is="Heildarmynd af frammistöðu leikmanns sem er að fara — GPS-álag og kröfuharðustu leikkaflar, IMA, kraftplötur (VALD), VBT, leikir og þolpróf síðustu mánuði — með Breiðabliks-merktri PDF og valfrjálsri AI-samantekt. Lýsandi; felur aldrei í sér readiness- eða leikhæfis-ákvörðun."
      />

      <details className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">{is ? "Hvað er í skýrslunni og hvernig deili ég henni?" : "What's in the report, and how do I share it?"}</summary>
        <div className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-slate-600">
          <p>{is ? "Skýrslan safnar saman öllum frammistöðugögnum leikmannsins yfir valið tímabil: GPS (vegalengd, háhraðahlaup, sprettir, hámarkshraði, PlayerLoad), kröfuharðustu leikkafla (WCS), IMA (hröðun/hemlun/stefnubreytingar), VALD kraftplötur, VBT úr ræktinni, leiki og þolpróf, auk stöðu-percentíla." : "The report gathers all of the player's performance data over the chosen window: GPS (distance, high-speed running, sprints, top speed, PlayerLoad), worst-case match demands (WCS), IMA (accel/decel/change-of-direction), VALD force plates, gym VBT, games and fitness tests, plus position percentiles."}</p>
          <p>{is ? "Hver kafli sýnir vissu-merki (hversu mikil gögn liggja að baki). „Sýna tölur“ opnar hráar töflur." : "Each section shows a confidence chip (how much data backs it). \"Show details\" opens the raw tables."}</p>
          <p>{is ? "Þú hleður niður PDF (með Breiðabliks-lógói) og sendir hana sjálf/ur — kerfið sendir ekkert út. Deildu aðeins með samþykki leikmanns sem hluta af félagaskiptum." : "You download the PDF (with the Breiðablik logo) and send it yourself — the app transmits nothing. Only share it with the player's consent, as part of the transfer."}</p>
        </div>
      </details>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <span className="text-[13px] font-semibold text-slate-800">{is ? "Leikmaður" : "Player"}</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {(players ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}{p.is_active ? "" : is ? " (óvirkur)" : " (inactive)"}{p.position ? ` · ${p.position}` : ""}</option>
          ))}
        </select>
        <span className="ml-2 text-[13px] font-semibold text-slate-800">{is ? "Tímabil" : "Window"}</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px]">
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)} className={`rounded-md px-2.5 py-1 font-medium ${days === w ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{w}{is ? "d" : "d"}</button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => void genAi()} disabled={aiBusy || !dossier} className="rounded-lg border border-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-50">
            {aiBusy ? (is ? "Skrifa…" : "Writing…") : ai ? (is ? "Endurgera AI" : "Regenerate AI") : (is ? "AI-samantekt" : "AI summary")}
          </button>
          <button onClick={() => void downloadPdf()} disabled={pdfBusy || !dossier} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {pdfBusy ? "…" : (is ? "Sækja PDF" : "Download PDF")}
          </button>
        </div>
      </div>

      {err ? <p className="mt-3 text-[13px] font-medium text-red-700">{err}</p> : null}
      {consentOk === false ? (
        <p className="mt-3 rounded-lg border border-[#e9c983] bg-[#faf1de] px-3 py-2 text-[12px] text-[#7c5210]">
          {is ? "Athugið: ekkert virkt gagnavinnslu-samþykki fannst fyrir þennan leikmann. Gakktu úr skugga um samþykki áður en þú deilir gögnunum með öðru félagi." : "Note: no active data-processing consent found for this player. Confirm consent before sharing this data with another club."}
        </p>
      ) : null}

      {busy && !dossier ? <p className="mt-6 text-[13px] text-slate-500">{is ? "Sæki gögn…" : "Loading…"}</p> : null}

      {dossier ? (
        <div className="mt-4 space-y-3">
          {/* Header line */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <span className="text-[15px] font-bold text-slate-900">{dossier.identity.name}</span>
            <span className="text-[12px] text-slate-500">
              {[dossier.identity.position, dossier.identity.ageYears != null ? `${dossier.identity.ageYears}${is ? " ára" : " yrs"}` : null, dossier.identity.heightCm != null ? `${Math.round(dossier.identity.heightCm)} cm` : null, dossier.identity.massKg != null ? `${Math.round(dossier.identity.massKg)} kg` : null].filter(Boolean).join(" · ")}
            </span>
            <span className="ml-auto text-[12px] text-slate-500">{dossier.window.sessions} {is ? "lotur" : "sessions"} · {dossier.window.matches} {is ? "leikir" : "matches"} · {dossier.window.days}{is ? "d" : "d"}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONF_STYLE[dossier.overallConfidence]}`}>{confLabel(dossier.overallConfidence, is)}</span>
            <button onClick={() => { setEditBody((v) => !v); setHIn(dossier.identity.heightCm != null ? String(Math.round(dossier.identity.heightCm)) : ""); setWIn(dossier.identity.massKg != null ? String(Math.round(dossier.identity.massKg)) : ""); }} className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
              {dossier.identity.heightCm == null || dossier.identity.massKg == null ? (is ? "+ Hæð / þyngd" : "+ Height / weight") : (is ? "Breyta hæð/þyngd" : "Edit height/weight")}
            </button>
          </div>

          {editBody ? (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#c9d0f7] bg-[#eef0fb]/50 p-3">
              <label className="text-[12px] text-slate-700">{is ? "Hæð (cm)" : "Height (cm)"}
                <input value={hIn} onChange={(e) => setHIn(e.target.value)} inputMode="numeric" className="ml-2 w-20 rounded border border-slate-300 px-2 py-1 text-sm" placeholder="183" />
              </label>
              <label className="text-[12px] text-slate-700">{is ? "Þyngd (kg)" : "Weight (kg)"}
                <input value={wIn} onChange={(e) => setWIn(e.target.value)} inputMode="numeric" className="ml-2 w-20 rounded border border-slate-300 px-2 py-1 text-sm" placeholder="66" />
              </label>
              <button onClick={() => void saveBody()} disabled={bodyBusy} className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{bodyBusy ? "…" : (is ? "Vista" : "Save")}</button>
              <button onClick={() => setEditBody(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-600">{is ? "Hætta við" : "Cancel"}</button>
              <span className="text-[11px] text-slate-500">{is ? "Vistast sem þjálfaramæling (player_body_metrics)." : "Saved as a coach measurement (player_body_metrics)."}</span>
            </div>
          ) : null}

          {ai ? (
            <div className="rounded-xl border border-[#c9d0f7] bg-[#eef0fb] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-bold text-[#2740e6]">{is ? "AI-samantekt" : "AI summary"}</span>
                <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">{is ? "AI · les tölur, ákveður ekkert" : "AI · reads the numbers, decides nothing"}</span>
              </div>
              {ai.headline ? <p className="mt-2 text-[15px] font-bold text-slate-900">{ai.headline}</p> : null}
              {ai.summary ? <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{ai.summary}</p> : null}
              {ai.physicalProfile ? <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{ai.physicalProfile}</p> : null}
              {ai.gameProfile ? <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{ai.gameProfile}</p> : null}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {ai.strengths?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-[#145233]">{is ? "Styrkleikar" : "Strengths"}</div><ul className="mt-0.5 space-y-0.5">{ai.strengths.map((x, i) => <li key={i} className="text-[12.5px] text-slate-700">· {x}</li>)}</ul></div> : null}
                {ai.watchPoints?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-[#7c5210]">{is ? "Athuga" : "Watch points"}</div><ul className="mt-0.5 space-y-0.5">{ai.watchPoints.map((x, i) => <li key={i} className="text-[12.5px] text-slate-700">· {x}</li>)}</ul></div> : null}
              </div>
            </div>
          ) : null}

          {radar && (radar.engine.length >= 3 || radar.driver.length >= 3) ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{is ? "Líkamlegur prófíll vs hópur" : "Physical profile vs squad"}</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">{is ? "Vél = magn (GPS); Drif = hvernig hann hreyfir sig (IMA). Ásar = percentíl innan hóps." : "Engine = how much (GPS); Driver = how he moves (IMA). Axes are squad percentiles."}</p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                {radar.engine.length >= 3 ? (
                  <div className="rounded-lg border border-slate-100 bg-[#f4f7f2] p-2">
                    <div className="mb-1 flex items-center gap-1.5"><span className="rounded bg-[#1c7a4a]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1c7a4a]">Engine</span><span className="text-[12px] font-semibold text-slate-700">{is ? "GPS vs hópur" : "GPS vs squad"}</span></div>
                    <ProfileRadar metrics={radar.engine} />
                  </div>
                ) : null}
                {radar.driver.length >= 3 ? (
                  <div className="rounded-lg border border-slate-100 bg-[#eef0fb] p-2">
                    <div className="mb-1 flex items-center gap-1.5"><span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2740e6]">Driver</span><span className="text-[12px] font-semibold text-slate-700">{is ? "IMA vs hópur" : "IMA vs squad"}</span></div>
                    <ProfileRadar metrics={radar.driver} />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {trends && (trends.distance.bars.length || trends.hsr.bars.length) ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-[14px] font-bold text-slate-900">{is ? "Leik-fyrir-leik þróun (per 90)" : "Match-by-match trend (per 90)"}</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">{is ? "Hver súla = einn leikur; brotalínan = tímabils-meðaltal." : "Each bar is one match; the dashed line is the season average."}</p>
              <div className="mt-2 grid gap-4 sm:grid-cols-3">
                <MatchTrendBars title={is ? "Vegalengd" : "Distance"} unit="m" bars={trends.distance.bars} avg={trends.distance.avg} color="#1c7a4a" />
                <MatchTrendBars title="HSR" unit="m" bars={trends.hsr.bars} avg={trends.hsr.avg} color="#2740e6" />
                <MatchTrendBars title={is ? "Sprettur" : "Sprint"} unit="m" bars={trends.sprint.bars} avg={trends.sprint.avg} color="#de9328" />
              </div>
            </div>
          ) : null}

          {dossier.sections.map((sec) => <SectionCard key={sec.id} sec={sec} is={is} clock={sec.id === "ima-clock" ? dossier.imaClock : null} />)}

          <p className="text-[11px] text-slate-400">{is ? dossier.generatedNote.is : dossier.generatedNote.en}</p>
        </div>
      ) : null}
    </div>
  );
}
