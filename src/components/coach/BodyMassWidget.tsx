"use client";

/**
 * Body-mass widget — record/read a player's bodyweight (#5 anthropometry input), plus an optional
 * BODY-COMPOSITION section (skinfold/circumference → %fat, Jackson-Pollock/Navy).
 *
 * Wellbeing rules (non-negotiable): body-comp is an INDIVIDUAL-TREND monitor, never a verdict — no
 * ideal %, no target line, no red/amber judgement, no ranking. The estimate error (±3–5 %) is shown
 * every time, and a method/tester CHANGE between measurements is flagged (else the trend is noise).
 * Neutral clinical language. Descriptive — never touches readiness.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { BodyMassResolved } from "@/lib/micropulse/load/bodyMass";

type BodyCompRow = { measuredOn: string; bodyFatPct: number; method: string | null; sumSkinfoldsMm: number | null; leanKg: number | null; massKg: number | null; sex: string | null };
type Resp = { ok: boolean; resolved?: BodyMassResolved; valdWeight?: number | null; bodyComp?: BodyCompRow[]; consistency?: { methodChanged: boolean; testerChanged: boolean } | null };

const BF_BAND = 4; // ±% shown with every estimate (typical skinfold error 3–5%)
const SITES_JP3_M = ["chest", "abdomen", "thigh"] as const;
const SITES_JP3_F = ["triceps", "suprailiac", "thigh"] as const;
const SITES_JP7 = ["chest", "midaxillary", "triceps", "subscapular", "abdomen", "suprailiac", "thigh"] as const;
const SITE_LABEL: Record<string, { en: string; is: string }> = {
  chest: { en: "Chest", is: "Brjóst" }, abdomen: { en: "Abdomen", is: "Kviður" }, thigh: { en: "Thigh", is: "Læri" },
  triceps: { en: "Triceps", is: "Þríhöfði" }, suprailiac: { en: "Suprailiac", is: "Mjaðmakambur" },
  subscapular: { en: "Subscapular", is: "Herðablað" }, midaxillary: { en: "Midaxillary", is: "Miðöxl" },
  neck: { en: "Neck", is: "Háls" }, waist: { en: "Waist", is: "Mitti" }, hip: { en: "Hip", is: "Mjaðmir" },
};

function Sparkline({ vals }: { vals: number[] }) {
  if (vals.length < 2) return null;
  const W = 120, H = 28, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-[120px]" role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke="#64748b" strokeWidth={1.4} />
      {vals.map((v, i) => <circle key={i} cx={(i / (vals.length - 1)) * W} cy={H - 2 - ((v - min) / span) * (H - 4)} r={1.6} fill="#475569" />)}
    </svg>
  );
}

export default function BodyMassWidget({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = React.useState<Resp | null>(null);
  const [entry, setEntry] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  // Body-composition entry state.
  const [showBc, setShowBc] = React.useState(false);
  const [method, setMethod] = React.useState<"jp3" | "jp7" | "navy">("jp3");
  const [sex, setSex] = React.useState<"M" | "F">("M");
  const [age, setAge] = React.useState("");
  const [sf, setSf] = React.useState<Record<string, string>>({});
  const [girth, setGirth] = React.useState<Record<string, string>>({});
  const [bcBusy, setBcBusy] = React.useState(false);
  const [bcMsg, setBcMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  const load = React.useCallback(async () => {
    const tok = await token(); if (!tok || !playerId) return;
    const res = await fetch(`/api/coach/player/${playerId}/body-mass`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    setData(j && j.ok ? j : null);
  }, [playerId, token]);
  React.useEffect(() => { setMsg(null); setEntry(""); setBcMsg(null); void load(); }, [load]);

  async function save() {
    const massKg = Number(entry);
    if (!Number.isFinite(massKg) || massKg <= 20 || massKg >= 200) { setMsg(is ? "Sláðu inn 20–200 kg." : "Enter 20–200 kg."); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/player/${playerId}/body-mass`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ massKg }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Error"); return; }
      setEntry(""); await load();
    } finally { setBusy(false); }
  }

  const activeSites = method === "jp7" ? SITES_JP7 : method === "jp3" ? (sex === "M" ? SITES_JP3_M : SITES_JP3_F) : [];
  const navyGirths = method === "navy" ? (sex === "M" ? ["neck", "waist"] : ["neck", "waist", "hip"]) : [];

  async function saveBc() {
    setBcBusy(true); setBcMsg(null);
    try {
      const tok = await token(); if (!tok) return;
      const skinfolds: Record<string, number> = {};
      for (const s of activeSites) { const v = Number(sf[s]); if (Number.isFinite(v)) skinfolds[s] = v; }
      const girths: Record<string, number> = {};
      for (const g of navyGirths) { const v = Number(girth[g]); if (Number.isFinite(v)) girths[g] = v; }
      const payload: Record<string, unknown> = { method, sex, ageYears: Number(age) };
      if (method === "navy") { payload.girths = girths; if (girth.height) payload.heightCm = Number(girth.height); }
      else payload.skinfolds = skinfolds;
      const res = await fetch(`/api/coach/player/${playerId}/body-mass`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setBcMsg(j.error ?? "Error"); return; }
      setSf({}); setGirth({}); setShowBc(false); await load();
    } finally { setBcBusy(false); }
  }

  const r = data?.resolved;
  const bc = data?.bodyComp ?? [];
  const latest = bc[0] ?? null;
  const prev = bc[1] ?? null;
  const cons = data?.consistency ?? null;
  const methodLabel = (m: string | null) => (m === "jp7" ? "JP-7" : m === "jp3" ? "JP-3" : m === "navy" ? (is ? "Ummál" : "Navy") : m ?? "");
  // Trend vs the previous session — only meaningful when the method is unchanged.
  const delta = latest && prev ? Math.round((latest.bodyFatPct - prev.bodyFatPct) * 10) / 10 : null;
  const days = latest && prev ? Math.round((Date.parse(latest.measuredOn) - Date.parse(prev.measuredOn)) / 86400000) : null;

  return (
    <div className="space-y-3">
      {/* ── Body mass ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-800">{is ? "Líkamsþyngd" : "Body mass"}</span>
          {r?.massKg != null ? (
            <>
              <span className="font-[Archivo,sans-serif] text-lg font-bold tabular-nums text-slate-900">{r.massKg} kg</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.source === "coach" ? "bg-emerald-100 text-emerald-700" : r.source === "vald" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                {r.source === "coach" ? (is ? "skráð" : "recorded") : r.source === "vald" ? "VALD" : r.source}
              </span>
              {r.measuredOn ? <span className="text-[11px] text-slate-400">{r.measuredOn}</span> : null}
            </>
          ) : (
            <span className="text-[12px] text-slate-500">{is ? "Engin þyngd skráð" : "No mass on file"}</span>
          )}
        </div>
        {r?.note ? <p className="mt-0.5 text-[11px] text-slate-400">{r.note}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" placeholder="kg"
            className="w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
          <button onClick={() => void save()} disabled={busy || !entry} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
            {busy ? "…" : (is ? "Skrá þyngd" : "Record mass")}
          </button>
          {msg ? <span className="text-[11px] font-medium text-red-700">{msg}</span> : null}
        </div>
      </div>

      {/* ── Body composition (estimate) ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-slate-800">{is ? "Líkamssamsetning (mat)" : "Body composition (estimate)"}</span>
          <button onClick={() => setShowBc((v) => !v)} className="text-[11px] font-semibold text-[#2740e6]">
            {showBc ? (is ? "Loka" : "Close") : (is ? "+ Skrá mælingu" : "+ Record measurement")}
          </button>
        </div>

        {/* (0/1) trend + latest read */}
        {latest ? (
          <div className="mt-1.5">
            {delta != null && !cons?.methodChanged ? (
              <p className="text-[13px] text-slate-700">
                {is ? "Þróun" : "Trend"}: <b className={delta < 0 ? "text-slate-900" : "text-slate-900"}>{delta > 0 ? "+" : ""}{delta}%</b>{" "}
                {is ? "frá síðustu mælingu" : "vs last measurement"}{days != null ? ` (${days} ${is ? "dagar" : "days"})` : ""} · {methodLabel(latest.method)}
              </p>
            ) : null}
            <p className="mt-0.5 text-[15px] font-bold text-slate-900">
              {latest.bodyFatPct}% <span className="text-[12px] font-normal text-slate-400">± {BF_BAND} · {is ? "mat" : "estimate"}</span>
            </p>
            <p className="text-[12px] text-slate-500">
              {latest.leanKg != null ? <>{is ? "Fitufrír massi" : "Lean mass"} {latest.leanKg} kg · </> : null}
              {methodLabel(latest.method)} · {latest.measuredOn}{latest.sumSkinfoldsMm != null ? ` · Σ ${latest.sumSkinfoldsMm} mm` : ""}
            </p>
            {bc.length >= 2 ? <div className="mt-1"><Sparkline vals={[...bc].reverse().map((x) => x.bodyFatPct)} /></div> : null}
            {cons?.methodChanged ? <p className="mt-1 text-[11px] font-medium text-amber-700">⚠ {is ? "Aðferð breyttist milli mælinga — þróun ekki samanburðarhæf." : "Method changed between measurements — trend not comparable."}</p> : null}
            {cons?.testerChanged ? <p className="mt-0.5 text-[11px] font-medium text-amber-700">⚠ {is ? "Annar mælandi — hafðu sama mælanda fyrir samanburð." : "Different tester — keep the same tester for a comparable trend."}</p> : null}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-slate-500">{is ? "Engin líkamssamsetningar-mæling skráð." : "No body-composition measurement on file."}</p>
        )}

        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {is
            ? "Húðfellinga-/ummáls-MAT (Jackson-Pollock/Siri) — ±3–5 %, ekki rannsóknarstofumæling. Lesið sem einstaklings-þróun; sami mælandi og sömu staðir skipta öllu. Ekkert kjörhlutfall, ekkert markmið."
            : "Skinfold/circumference ESTIMATE (Jackson-Pollock/Siri) — ±3–5 %, not a lab measure. Read as an individual trend; same tester and same sites are what matter. No ideal %, no target."}
        </p>

        {/* entry form */}
        {showBc ? (
          <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
            <div className="flex flex-wrap gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value as "jp3" | "jp7" | "navy")} className="rounded border border-slate-300 px-2 py-1 text-[12px]">
                <option value="jp3">JP-3</option><option value="jp7">JP-7</option><option value="navy">{is ? "Ummál (Navy)" : "Navy (girth)"}</option>
              </select>
              <select value={sex} onChange={(e) => setSex(e.target.value as "M" | "F")} className="rounded border border-slate-300 px-2 py-1 text-[12px]">
                <option value="M">{is ? "Karl" : "Male"}</option><option value="F">{is ? "Kona" : "Female"}</option>
              </select>
              <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="decimal" placeholder={is ? "aldur" : "age"} className="w-16 rounded border border-slate-300 px-2 py-1 text-[12px] tabular-nums" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeSites.map((s) => (
                <label key={s} className="flex flex-col text-[10px] text-slate-500">
                  {SITE_LABEL[s]?.[is ? "is" : "en"] ?? s} <span className="text-slate-300">(mm)</span>
                  <input value={sf[s] ?? ""} onChange={(e) => setSf((p) => ({ ...p, [s]: e.target.value }))} inputMode="decimal" className="mt-0.5 w-16 rounded border border-slate-300 px-1.5 py-1 text-[12px] tabular-nums" />
                </label>
              ))}
              {navyGirths.map((g) => (
                <label key={g} className="flex flex-col text-[10px] text-slate-500">
                  {SITE_LABEL[g]?.[is ? "is" : "en"] ?? g} <span className="text-slate-300">(cm)</span>
                  <input value={girth[g] ?? ""} onChange={(e) => setGirth((p) => ({ ...p, [g]: e.target.value }))} inputMode="decimal" className="mt-0.5 w-16 rounded border border-slate-300 px-1.5 py-1 text-[12px] tabular-nums" />
                </label>
              ))}
              {method === "navy" ? (
                <label className="flex flex-col text-[10px] text-slate-500">
                  {is ? "Hæð" : "Height"} <span className="text-slate-300">(cm)</span>
                  <input value={girth.height ?? ""} onChange={(e) => setGirth((p) => ({ ...p, height: e.target.value }))} inputMode="decimal" className="mt-0.5 w-16 rounded border border-slate-300 px-1.5 py-1 text-[12px] tabular-nums" />
                </label>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => void saveBc()} disabled={bcBusy} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
                {bcBusy ? "…" : (is ? "Reikna og skrá" : "Compute & save")}
              </button>
              {bcMsg ? <span className="text-[11px] font-medium text-red-700">{bcMsg}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
