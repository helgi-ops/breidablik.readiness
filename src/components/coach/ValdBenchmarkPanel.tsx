"use client";

/**
 * "How he compares" — population reference bands + how-to-improve, shared by the
 * coach VALD Assessment page and the player app's VALD tab. Takes primitive
 * metric values (not RtpAssessment) so any surface can render it. Cited context,
 * never a verdict; bilingual EN/IS. Descriptive only.
 */

import * as React from "react";
import { useLang } from "@/lib/lang";
import { classifyValdMetric, benchmarkPopulationNote, type BenchBand, type Bi, type PopKey } from "@/lib/micropulse/vald/benchmarks";

const BAND_STYLE: Record<BenchBand, string> = {
  elite: "bg-[#e7ecfb] text-[#2740e6]",
  good: "bg-[#e6f2ec] text-[#1c7a4a]",
  average: "bg-[#fbf0dc] text-[#a86f14]",
  below: "bg-[#f6e2dc] text-[#a83e28]",
  context: "bg-zinc-100 text-zinc-500",
  na: "bg-zinc-100 text-zinc-400",
};

export type ValdBenchmarkPanelProps = {
  pop: PopKey;
  imtpRelForceNkg?: number | null;
  imtpAsymPct?: number | null;
  cmjJumpHeightCm?: number | null;
  cmjRsiMod?: number | null;
  cmjRelPeakPowerWkg?: number | null;
  cmjAsymPct?: number | null;
  /** Nordic hamstring mean force per limb (N). */
  nordbordMeanN?: number | null;
  /** Groin (Hip AD/AB) asymmetry %. */
  groinAsymPct?: number | null;
  className?: string;
};

export default function ValdBenchmarkPanel(props: ValdBenchmarkPanelProps) {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const t = (b: Bi) => (isEN ? b.en : b.is);
  const pop = props.pop;

  type Row = { key: string; label: Bi; value: string; read: ReturnType<typeof classifyValdMetric> };
  const n = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : null);
  const raw: (Row | null)[] = [
    n(props.imtpRelForceNkg) != null ? { key: "imtpRel", label: { en: "IMTP rel. peak force", is: "IMTP hlutf. hámarkskraftur" }, value: `${props.imtpRelForceNkg!.toFixed(1)} N/kg`, read: classifyValdMetric("imtpRelForceNkg", props.imtpRelForceNkg, pop) } : null,
    n(props.imtpAsymPct) != null ? { key: "imtpAsym", label: { en: "IMTP limb asymmetry", is: "IMTP ósamhverfa" }, value: `${props.imtpAsymPct!.toFixed(1)}%`, read: classifyValdMetric("asymmetry", props.imtpAsymPct, pop) } : null,
    n(props.cmjJumpHeightCm) != null ? { key: "cmjJumpHeightCm", label: { en: "Jump height", is: "Stökkhæð" }, value: `${props.cmjJumpHeightCm!.toFixed(1)} cm`, read: classifyValdMetric("cmjJumpHeightCm", props.cmjJumpHeightCm, pop) } : null,
    n(props.cmjRsiMod) != null ? { key: "cmjRsiMod", label: { en: "RSI-modified", is: "RSI-modified" }, value: props.cmjRsiMod!.toFixed(2), read: classifyValdMetric("cmjRsiMod", props.cmjRsiMod, pop) } : null,
    n(props.cmjRelPeakPowerWkg) != null ? { key: "cmjRelPeakPowerWkg", label: { en: "Rel. peak power", is: "Hlutfallslegt hámarksafl" }, value: `${props.cmjRelPeakPowerWkg!.toFixed(1)} W/kg`, read: classifyValdMetric("cmjRelPeakPowerWkg", props.cmjRelPeakPowerWkg, pop) } : null,
    n(props.cmjAsymPct) != null ? { key: "cmjAsym", label: { en: "CMJ limb asymmetry", is: "CMJ ósamhverfa" }, value: `${props.cmjAsymPct!.toFixed(1)}%`, read: classifyValdMetric("asymmetry", props.cmjAsymPct, pop) } : null,
    n(props.nordbordMeanN) != null ? { key: "nbForce", label: { en: "Nordic hamstring (mean/limb)", is: "Nordic hamstring (meðal/fót)" }, value: `${Math.round(props.nordbordMeanN!)} N`, read: classifyValdMetric("nordbordForceN", props.nordbordMeanN, pop) } : null,
    n(props.groinAsymPct) != null ? { key: "ffAsym", label: { en: "Groin (Hip AD/AB) asymmetry", is: "Nári (Hip AD/AB) ósamhverfa" }, value: `${props.groinAsymPct!.toFixed(1)}%`, read: classifyValdMetric("groinAsymmetry", props.groinAsymPct, pop) } : null,
  ];
  const rows = raw.filter((r): r is Row => r != null);
  if (rows.length === 0) return null;

  const tips: Bi[] = [];
  const seen = new Set<string>();
  for (const r of rows) { const imp = r.read?.improve; if (imp && !seen.has(imp.en)) { seen.add(imp.en); tips.push(imp); } }

  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white p-4 ${props.className ?? ""}`}>
      <div className="text-sm font-semibold text-zinc-900">{isEN ? "How you compare" : "Hvernig þú stendur"}</div>
      <p className="mt-0.5 text-[12px] text-zinc-500">{t(benchmarkPopulationNote(pop))}</p>

      <div className="mt-3 divide-y divide-zinc-100">
        {rows.map((r) => {
          const read = r.read;
          return (
            <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
              <span className="min-w-[9rem] text-zinc-500">{t(r.label)}</span>
              <span className="font-semibold text-zinc-900 tabular-nums">{r.value}</span>
              {read ? (
                <>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BAND_STYLE[read.band]}`}>
                    {t(read.bandLabel)}{read.indicative ? (isEN ? " (indic.)" : " (leiðb.)") : ""}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-400">{t(read.ref)} · {read.citation}</span>
                </>
              ) : (
                <span className="ml-auto text-[11px] text-zinc-300">{isEN ? "no band for this population" : "ekkert band fyrir þetta þýði"}</span>
              )}
            </div>
          );
        })}
      </div>

      {tips.length > 0 ? (
        <div className="mt-3 rounded-xl bg-zinc-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{isEN ? "To improve" : "Til að bæta"}</div>
          <ul className="mt-1.5 space-y-1 text-[12px] text-zinc-700">
            {tips.map((tip, i) => <li key={i}>• {t(tip)}</li>)}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-zinc-500">{isEN ? "At or above the reference on every graded quality." : "Á eða yfir viðmiði á öllum metnum eiginleikum."}</p>
      )}

      <p className="mt-2 text-[11px] text-zinc-400">
        {isEN
          ? "Population reference (cited) — context vs your peers, not a pass/fail. Your own baseline still leads."
          : "Hóp-viðmið (tilvitnað) — samhengi vs jafningja, ekki staðið/fallið. Þín eigin grunnlína ræður áfram."}
      </p>
    </div>
  );
}
