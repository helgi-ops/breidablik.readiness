"use client";

/**
 * Movement Signature card — the IMA "clock" fingerprint (12 directions × intensity),
 * MicroPulse's IMA-native analogue of ADI's "Vector Distribution" (Andrew Gray, Pillar 1):
 * where and how much of his multidirectional work a player does, and whether his recent
 * shape has drifted from his own usual fingerprint ("is he still moving like himself?").
 *
 * Reads /api/coach/player/[id]/directional-signature (computeDirectionalSignature over
 * ima_clock_gen2). HONEST: this is the multidirectional DENSITY/DIRECTION proxy — it is
 * NOT mechanical power W/kg or ADI's complete-acceleration vectors (those need the raw
 * 10 Hz stream). Descriptive movement-behaviour signal — never touches readiness.
 * Bilingual EN/IS.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import ShowDetails from "@/components/common/ShowDetails";

type DirDrift = { dir: string; label: string; recent: number; usual: number; z: number | null };
type Signature = {
  confident: boolean; calibrating: boolean; baselineDays: number;
  tvd: number | null; flagged: boolean;
  directions: DirDrift[];
  usualVector: Record<string, number>; recentVector: Record<string, number>;
  headline: string | null;
};
type DirLoad = { dir: string; loadAU: number; share: number; perMin: number | null };
type MechLoad = { perDirection: DirLoad[]; totalAU: number; perMinTotal: number | null; top: DirLoad[]; minutes: number | null };
type PositionRef = { scope: "position" | "role"; code: string; nPlayers: number; shareByDir: Record<string, number>; perMinMedian: number | null };
type Resp = { ok: boolean; hasData: boolean; name: string | null; daysWithClock?: number; signature: Signature | null; mechLoad?: MechLoad | null; positionRef?: PositionRef | null };

const POS_WORD: Record<string, { en: string; is: string }> = {
  GK: { en: "keepers", is: "markverðir" }, DEF: { en: "defenders", is: "varnarmenn" },
  MID: { en: "midfielders", is: "miðjumenn" }, FWD: { en: "forwards", is: "framherjar" },
};

// 12 clock directions → short label (12 = straight forward, clockwise).
const LABEL: Record<string, string> = {
  "12": "F", "1": "FR", "2": "R+", "3": "R", "4": "RB", "5": "BR",
  "6": "B", "7": "BL", "8": "L+", "9": "L", "10": "LF", "11": "FL",
};
const DIRS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

/** Angle (deg, clockwise from top) for a clock direction. 12→0°, 3→90°, 6→180°, 9→270°. */
const angleOf = (d: string) => (Number(d) % 12) * 30;
const pt = (d: string, r: number, cx: number, cy: number) => {
  const a = (angleOf(d) * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
};

/** 12-spoke polar: usual fingerprint (dashed) + recent shape (solid, coloured). */
function SignatureRadar({ usual, recent, flagged }: { usual: Record<string, number>; recent: Record<string, number>; flagged: boolean }) {
  const S = 260, cx = S / 2, cy = S / 2, maxR = 96;
  const peak = Math.max(0.0001, ...DIRS.map((d) => Math.max(usual[d] ?? 0, recent[d] ?? 0)));
  const poly = (v: Record<string, number>) =>
    DIRS.map((d) => { const [x, y] = pt(d, ((v[d] ?? 0) / peak) * maxR, cx, cy); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const recentColor = flagged ? "#de9328" : "#1c7a4a";
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[300px]" role="img" aria-label="movement signature">
      {/* rings */}
      {[0.33, 0.66, 1].map((f) => <circle key={f} cx={cx} cy={cy} r={maxR * f} fill="none" stroke="#e2e8f0" strokeWidth="1" />)}
      {/* spokes + tick labels */}
      {DIRS.map((d) => {
        const [ex, ey] = pt(d, maxR, cx, cy);
        const [lx, ly] = pt(d, maxR + 14, cx, cy);
        const card = d === "12" || d === "3" || d === "6" || d === "9";
        return (
          <g key={d}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#eef2f6" strokeWidth="1" />
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize={card ? 10 : 8} fontWeight={card ? 700 : 400} fill={card ? "#475569" : "#94a3b8"}>{LABEL[d]}</text>
          </g>
        );
      })}
      {/* usual fingerprint */}
      <polygon points={poly(usual)} fill="#a9a493" fillOpacity="0.10" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
      {/* recent shape */}
      <polygon points={poly(recent)} fill={recentColor} fillOpacity={flagged ? 0.12 : 0.07} stroke={recentColor} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function MovementSignatureCard({ players }: { players: Array<{ id: string; name: string }> }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [sel, setSel] = React.useState("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!sel && players.length) setSel(players[0].id); }, [players, sel]);

  React.useEffect(() => {
    if (!sel) { setData(null); return; }
    let alive = true; setLoading(true);
    (async () => {
      try {
        const tok = await token(); if (!tok) return;
        const res = await fetch(`/api/coach/player/${sel}/directional-signature`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
        const j = (await res.json().catch(() => null)) as Resp | null;
        if (alive) setData(j && j.ok ? j : null);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sel, token]);

  const sig = data?.signature ?? null;
  const mech = data?.mechLoad ?? null;
  const posRef = data?.positionRef ?? null;
  // Position comparison: where he loads MORE / LESS than his position peers, and volume vs their median.
  const posCompare = (() => {
    if (!mech || !posRef) return null;
    let over: string | null = null, under: string | null = null, maxD = -Infinity, minD = Infinity;
    for (const d of mech.perDirection) {
      const delta = d.share - (posRef.shareByDir[d.dir] ?? 0);
      if (delta > maxD) { maxD = delta; over = d.dir; }
      if (delta < minD) { minD = delta; under = d.dir; }
    }
    const ratio = mech.perMinTotal != null && posRef.perMinMedian ? mech.perMinTotal / posRef.perMinMedian : null;
    return { over, under, ratio };
  })();
  // Top 2 directions by recent share — the plain-language "where he works".
  const topDirs = sig ? [...sig.directions].sort((a, b) => b.recent - a.recent).slice(0, 2) : [];
  const DIR_WORD: Record<string, { en: string; is: string }> = {
    F: { en: "forward", is: "áfram" }, FR: { en: "forward-right", is: "áfram-hægri" }, "R+": { en: "right-forward", is: "hægri-áfram" },
    R: { en: "right", is: "hægri" }, RB: { en: "right-back", is: "hægri-aftur" }, BR: { en: "back-right", is: "aftur-hægri" },
    B: { en: "backward", is: "afturábak" }, BL: { en: "back-left", is: "aftur-vinstri" }, "L+": { en: "left-back", is: "vinstri-aftur" },
    L: { en: "left", is: "vinstri" }, LF: { en: "left-forward", is: "vinstri-áfram" }, FL: { en: "forward-left", is: "áfram-vinstri" },
  };
  const dirWord = (label: string) => (DIR_WORD[label] ? (is ? DIR_WORD[label].is : DIR_WORD[label].en) : label);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Hreyfi-fingrafar (IMA-klukka)" : "Movement Signature (IMA clock)"}</span>
        <span className="cursor-help rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is
            ? "IMA-native hliðstæða við „Vector Distribution\" Andrew Gray (ADI): hvar og hversu mikið af fjölstefnu-vinnu leikmaðurinn vinnur, yfir 12 klukku-stefnur. Fyllt (strikuð) = hans venjulega lögun; lituð = síðustu vikur. PROXY fyrir stefnu/þéttleika — EKKI mechanical power W/kg né complete-acceleration vigrar (þeir þurfa hrátt 10 Hz)."
            : "MicroPulse's IMA-native take on Andrew Gray's (ADI) \"Vector Distribution\": where and how much multidirectional work a player does, across 12 clock directions. Dashed fill = his usual shape; coloured = his recent weeks. A proxy for direction/density — NOT mechanical power W/kg or complete-acceleration vectors (those need the raw 10 Hz stream)."}>
          {is ? "IMA-proxy ⓘ" : "IMA proxy ⓘ"}
        </span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}

      {!loading && data && !data.hasData ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
          {is ? "Engin IMA-klukku gögn fyrir þennan leikmann enn." : "No IMA clock data for this player yet."}
        </p>
      ) : null}

      {!loading && sig ? (
        <div className="mt-3 space-y-3">
          {/* Verdict line, plain words first. */}
          <p className="text-[13px] leading-snug text-slate-700">
            {sig.flagged && sig.headline
              ? sig.headline
              : (is
                  ? `Hreyfist eins og hann sjálfur. Vinnur mest ${topDirs.map((d) => dirWord(d.label)).join(" og ")}.`
                  : `Moving like himself. Works mostly ${topDirs.map((d) => dirWord(d.label)).join(" and ")}.`)}
          </p>

          <SignatureRadar usual={sig.usualVector} recent={sig.recentVector} flagged={sig.flagged} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t border-dashed border-slate-400" /> {is ? "Venjuleg lögun" : "Usual shape"}</span>
            <span className="flex items-center gap-1"><span className={`inline-block h-0.5 w-4 ${sig.flagged ? "bg-[#de9328]" : "bg-[#1c7a4a]"}`} /> {is ? "Síðustu vikur" : "Recent weeks"}</span>
            <span className="ml-auto">
              {sig.confident ? (is ? "full vissa" : "confident") : sig.calibrating ? (is ? "að kvarða" : "calibrating") : (is ? "lítil vissa" : "low confidence")}
              {" · "}{sig.baselineDays} {is ? "dagar" : "days"}
            </span>
          </div>

          {/* Mechanical load per direction — the intensity-weighted COST view (where he works
              hardest), distinct from the density radar (where he moves most). AU proxy, not W/kg. */}
          {mech && mech.top.length ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-slate-700">{is ? "Vélrænt álag eftir stefnu" : "Mechanical load by direction"}</span>
                <span className="cursor-help rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                  title={is ? "Ákefðar-vegið IMA (high×3 / med×2 / low×1) = kostnaðar-vísir per stefnu (AU). Sýnir hvar mest vélræn vinna fer fram, ekki bara hvar hann hreyfist mest. EKKI W/kg né kJ." : "Intensity-weighted IMA (high×3 / med×2 / low×1) = a per-direction cost index (AU). Shows where the most mechanical work happens, not just where he moves most. NOT W/kg or kJ."}>
                  AU ⓘ
                </span>
              </div>
              <p className="mt-1 text-[12px] text-slate-600">
                {is ? "Mest vélræn vinna: " : "Most mechanical work: "}
                <b>{mech.top.slice(0, 2).map((d) => dirWord(LABEL[d.dir] ?? d.dir)).join(is ? " og " : " and ")}</b>
                {mech.perMinTotal != null ? <span className="text-slate-400">{is ? ` · ${mech.perMinTotal} AU/mín samtals` : ` · ${mech.perMinTotal} AU/min total`}</span> : null}.
              </p>
              {/* Position comparison — how his load profile differs from his position peers. */}
              {posCompare && posCompare.over && posCompare.under ? (() => {
                const label = posRef!.scope === "position" ? posRef!.code : (is ? POS_WORD[posRef!.code]?.is : POS_WORD[posRef!.code]?.en) ?? posRef!.code;
                const vol = posCompare.ratio == null ? null
                  : posCompare.ratio >= 1.1 ? (is ? "meira álag/mín" : "more load/min")
                  : posCompare.ratio <= 0.9 ? (is ? "minna álag/mín" : "less load/min")
                  : (is ? "dæmigert álag/mín" : "typical load/min");
                return (
                  <p className="mt-0.5 text-[12px] text-slate-600">
                    {is ? "M.v. " : "vs "}<b>{label}</b> <span className="text-slate-400">(n={posRef!.nPlayers})</span>{is ? ": meira " : ": more "}
                    <b>{dirWord(LABEL[posCompare.over] ?? posCompare.over)}</b>{is ? ", minna " : ", less "}
                    <b>{dirWord(LABEL[posCompare.under] ?? posCompare.under)}</b>
                    {vol ? <span className="text-slate-400"> · {vol}</span> : null}.
                  </p>
                );
              })() : null}
              {/* All 12 directions, ranked by load; his bar ∝ share, with a tick at the position average. */}
              <div className="mt-2 space-y-1">
                {mech.top.map((d) => {
                  const denom = mech.top[0].share || 1;
                  const gShare = posRef?.shareByDir?.[d.dir];
                  return (
                    <div key={d.dir} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[11px] text-slate-600">{dirWord(LABEL[d.dir] ?? d.dir)}</span>
                      <div className="relative h-2 flex-1 rounded bg-slate-100">
                        <div className="h-2 rounded bg-[#2740e6]" style={{ width: `${Math.max(2, Math.round((d.share / denom) * 100))}%` }} />
                        {gShare != null ? <div className="absolute top-[-2px] h-3 w-0.5 bg-slate-500" style={{ left: `${Math.min(100, Math.round((gShare / denom) * 100))}%` }} title={is ? "meðaltal stöðu" : "position avg"} /> : null}
                      </div>
                      <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                        {d.perMin != null ? `${d.perMin} AU/${is ? "mín" : "min"}` : `${d.loadAU} AU`} · {Math.round(d.share * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              {posRef ? <p className="mt-1 text-[10px] text-slate-400">{is ? "│ = meðaltal stöðu" : "│ = position average"}{mech.perMinTotal != null && posRef.perMinMedian != null ? ` · ${is ? "AU/mín" : "AU/min"} ${mech.perMinTotal} vs ${posRef.perMinMedian}` : ""}</p> : null}
              <p className="mt-1.5 text-[10px] text-slate-400">
                {is
                  ? `Síðustu vikur: ${mech.totalAU} AU${mech.perMinTotal != null ? ` · ${mech.perMinTotal} AU/mín` : ""}${mech.minutes != null ? ` yfir ${Math.round(mech.minutes)} mín` : ""} · ákefðar-vegið IMA, ekki W/kg né kJ.`
                  : `Recent weeks: ${mech.totalAU} AU${mech.perMinTotal != null ? ` · ${mech.perMinTotal} AU/min` : ""}${mech.minutes != null ? ` over ${Math.round(mech.minutes)} min` : ""} · intensity-weighted IMA, not W/kg or kJ.`}
              </p>
            </div>
          ) : null}

          <ShowDetails label={{ EN: "Show the 12 directions", IS: "Sýna stefnurnar 12" }}>
            <table className="w-full text-[12px]">
              <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-medium">{is ? "Stefna" : "Direction"}</th>
                <th className="py-1 text-right font-medium">{is ? "Venjulega" : "Usual"}</th>
                <th className="py-1 text-right font-medium">{is ? "Nýlega" : "Recent"}</th>
              </tr></thead>
              <tbody className="tabular-nums text-slate-700">
                {sig.directions.map((d) => (
                  <tr key={d.dir} className="border-b border-slate-100">
                    <td className="py-1 text-slate-600">{dirWord(LABEL[d.dir] ?? d.dir)}</td>
                    <td className="py-1 text-right">{Math.round((d.usual ?? 0) * 100)}%</td>
                    <td className="py-1 text-right text-slate-500">{Math.round((d.recent ?? 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ShowDetails>

          <p className="text-[11px] text-slate-400">
            {is
              ? "Fjölstefnu-þéttleiki úr IMA (Buchheit 2014) — proxy fyrir Vector Distribution ADI, ekki W/kg. Reglur reikna — ekki AI. Lýsandi — snertir aldrei readiness."
              : "Multidirectional density from IMA (Buchheit 2014) — a proxy for ADI's Vector Distribution, not W/kg. Rules compute — not AI. Descriptive — never touches readiness."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
