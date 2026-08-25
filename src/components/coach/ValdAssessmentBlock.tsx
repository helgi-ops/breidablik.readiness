"use client";

/**
 * VALD Assessment block for the Total Player Analysis hub.
 *
 * Pulls ALL the VALD Assessment measurements (CMJ / IMTP / NordBord / ForceFrame)
 * plus the population "How he compares" panel into the season-profile hub, so a
 * coach sees the physical-test picture in one place. Layered read: the compare
 * panel first, then every raw number behind a "Show VALD numbers" toggle, then a
 * link out to the full VALD Assessment. PERFORMANCE ONLY — no clearance/decision,
 * no injury/LSI; asymmetry is a robustness quality here, never an injury flag.
 */

import * as React from "react";
import Link from "next/link";
import ValdBenchmarkPanel from "@/components/coach/ValdBenchmarkPanel";
import { buildValdGroups, valdHasData, djRsiFromBattery, type ValdSlice, type ValdRow } from "@/lib/micropulse/vald/valdSummary";

export type { ValdSlice };

function MetricCard({ title, sub, rows }: { title: string; sub?: string; rows: ValdRow[] }) {
  return (
    <div className="rounded-xl border border-[#eceae2] bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        {sub ? <div className="text-[11px] text-slate-400">{sub}</div> : null}
      </div>
      <div className="mt-1.5 divide-y divide-[#f1efe8]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-1 text-[12.5px]">
            <span className="text-slate-500">{k}</span>
            <span className="font-semibold tabular-nums text-slate-800">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ValdAssessmentBlock({ vald, playerId, is }: { vald: ValdSlice | null; playerId: string; is: boolean }) {
  const [open, setOpen] = React.useState(false);
  if (!valdHasData(vald)) return null;

  const { cmj, imtp, limbStrength, benchmarkPop } = vald;
  const nb = limbStrength.find((l) => l.device === "nordbord");
  const ff = limbStrength.find((l) => l.device === "forceframe");
  const nbMean = nb && nb.leftN != null && nb.rightN != null ? (nb.leftN + nb.rightN) / 2 : null;
  const groups = buildValdGroups(vald, is);

  return (
    <div className="rounded-xl border border-[#e3e1d9] bg-[#faf9f5] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">🏋️ {is ? "VALD-mat" : "VALD Assessment"}</div>
        <Link href={`/coach/rtp/${playerId}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-medium text-[#2740e6] hover:bg-slate-50">
          {is ? "Opna VALD-mat" : "Open VALD Assessment"} →
        </Link>
      </div>

      {/* Layer 0/1 — the population "how he compares" read (cited, never a verdict). */}
      <ValdBenchmarkPanel
        pop={benchmarkPop}
        imtpRelForceNkg={imtp?.relPeakForceNkg}
        imtpRelForce200Nkg={imtp?.relForce200Nkg}
        imtpForce100N={imtp?.force100N}
        imtpForce200N={imtp?.force200N}
        imtpRfd0100Ns={imtp?.rfd100}
        imtpRfd0200Ns={imtp?.rfd200}
        imtpAsymPct={imtp?.asymmetryPct}
        cmjJumpHeightCm={cmj?.jumpHeightCm}
        cmjRsiMod={cmj?.rsiMod}
        cmjRelPeakPowerWkg={cmj?.relPeakPowerWkg}
        cmjAsymPct={cmj?.asymmetryPct}
        djRsi={djRsiFromBattery(vald.battery)}
        nordbordMeanN={nbMean}
        groinAsymPct={ff?.asymmetryPct ?? null}
      />

      {/* Layer 2 — every raw VALD number behind a toggle. */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline">
        {open ? (is ? "Fela VALD-tölur" : "Hide VALD numbers") : (is ? "Sýna VALD-tölur" : "Show VALD numbers")}
      </button>

      {open ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <MetricCard key={g.title} title={g.title} sub={g.date ?? undefined} rows={g.rows} />
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        {is
          ? "VALD kraftplötu-/tog-mælingar — sömu tölur og á VALD-mati. Frammistöðu-lestur, snertir aldrei readiness eða meiðsla-mat."
          : "VALD force-plate / pull measurements — the same numbers as the VALD Assessment. A performance read; never touches readiness or the injury view."}
        {vald.coverage.pending.length ? ` · ${is ? "bíður" : "pending"}: ${vald.coverage.pending.join(", ")}` : ""}
      </p>
    </div>
  );
}
