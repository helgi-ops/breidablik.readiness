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
import type { PopKey } from "@/lib/micropulse/vald/benchmarks";
import type { RtpCmj, RtpImtp, RtpBatteryTest, RtpLimbStrengthTest } from "@/lib/micropulse/rtp/types";

export type ValdSlice = {
  benchmarkPop: PopKey;
  cmj: RtpCmj | null;
  imtp: RtpImtp | null;
  battery: RtpBatteryTest[];
  limbStrength: RtpLimbStrengthTest[];
  coverage: { present: string[]; pending: string[] };
};

type Row = [string, string];

function MetricCard({ title, sub, rows }: { title: string; sub?: string; rows: Row[] }) {
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
  if (!vald || (!vald.cmj && !vald.imtp && vald.limbStrength.length === 0 && vald.battery.length === 0)) return null;

  const { cmj, imtp, limbStrength, battery, benchmarkPop } = vald;
  const nb = limbStrength.find((l) => l.device === "nordbord");
  const ff = limbStrength.find((l) => l.device === "forceframe");
  const nbMean = nb && nb.leftN != null && nb.rightN != null ? (nb.leftN + nb.rightN) / 2 : null;
  const nn = (v: number | null | undefined) => (v == null ? "—" : v);

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
        nordbordMeanN={nbMean}
        groinAsymPct={ff?.asymmetryPct ?? null}
      />

      {/* Layer 2 — every raw VALD number behind a toggle. */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline">
        {open ? (is ? "Fela VALD-tölur" : "Hide VALD numbers") : (is ? "Sýna VALD-tölur" : "Show VALD numbers")}
      </button>

      {open ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {imtp ? (
            <MetricCard title={is ? "Ísómetrískt mið-læris tog (IMTP)" : "Isometric Mid-Thigh Pull"} sub={imtp.testDate ?? undefined} rows={[
              [is ? "Hámarkskraftur" : "Peak force", imtp.peakForceN == null ? "—" : `${imtp.peakForceN} N`],
              [is ? "Hlutf. hámarkskraftur" : "Rel. peak force", imtp.relPeakForceNkg == null ? "—" : `${imtp.relPeakForceNkg.toFixed(1)} N/kg`],
              [is ? "Nettó hámarkskraftur" : "Net peak force", imtp.netPeakForceN == null ? "—" : `${imtp.netPeakForceN} N`],
              ["Force @100ms", imtp.force100N == null ? "—" : `${imtp.force100N} N`],
              ["Force @200ms", imtp.force200N == null ? "—" : `${imtp.force200N} N`],
              [is ? "Hlutf. kraftur @200ms" : "Rel. force @200ms", imtp.relForce200Nkg == null ? "—" : `${imtp.relForce200Nkg.toFixed(1)} N/kg`],
              ["RFD 0-100ms", imtp.rfd100 == null ? "—" : `${imtp.rfd100} N/s`],
              ["RFD 0-200ms", imtp.rfd200 == null ? "—" : `${imtp.rfd200} N/s`],
              ["Impulse @200ms", imtp.impulse200 == null ? "—" : `${imtp.impulse200} N·s`],
              [is ? "Vinstri / Hægri" : "Left / Right", `${nn(imtp.leftN)} / ${nn(imtp.rightN)} N`],
              [is ? "Ósamhverfa" : "Asymmetry", imtp.asymmetryPct == null ? "—" : `${imtp.asymmetryPct.toFixed(1)}%`],
              [is ? "Tilraunir (meðal)" : "Trials (mean)", `${imtp.trialCount}`],
            ]} />
          ) : null}
          {cmj ? (
            <MetricCard title={is ? "Stökk með mótstökki (CMJ)" : "Countermovement Jump"} sub={cmj.testDate ?? undefined} rows={[
              [is ? "Stökkhæð" : "Jump height", cmj.jumpHeightCm == null ? "—" : `${cmj.jumpHeightCm.toFixed(1)} cm`],
              ["RSI-modified", cmj.rsiMod == null ? "—" : cmj.rsiMod.toFixed(2)],
              [is ? "Hámarksafl" : "Peak power", cmj.peakPowerW == null ? "—" : `${Math.round(cmj.peakPowerW)} W`],
              [is ? "Hlutf. hámarksafl" : "Rel. peak power", cmj.relPeakPowerWkg == null ? "—" : `${cmj.relPeakPowerWkg.toFixed(1)} W/kg`],
              [is ? "Samdráttartími" : "Contraction time", cmj.contractionTimeMs == null ? "—" : `${Math.round(cmj.contractionTimeMs)} ms`],
              [is ? "Sammiðja hámarkshraði" : "Concentric peak velocity", cmj.concentricPeakVelocityMS == null ? "—" : `${cmj.concentricPeakVelocityMS.toFixed(2)} m/s`],
              [is ? "Sammiðja RFD" : "Concentric RFD", cmj.concentricRfdNS == null ? "—" : `${Math.round(cmj.concentricRfdNS)} N/s`],
              [is ? "Ósamhverfa" : "Limb asymmetry", cmj.asymmetryPct == null ? "—" : `${cmj.asymmetryPct.toFixed(1)}%${cmj.asymmetrySide ? ` (${cmj.asymmetrySide})` : ""}`],
              [is ? "Tilraunir (meðal)" : "Trials (mean)", `${cmj.trialCount}`],
            ]} />
          ) : null}
          {battery.map((b) => (
            <MetricCard key={b.testType} title={b.label} sub={b.testDate ?? undefined} rows={[
              [b.primaryLabel, b.primaryValue == null ? "—" : `${b.primaryValue}${b.primaryUnit ? " " + b.primaryUnit : ""}`],
              [is ? "Vinstri / Hægri" : "Left / Right", `${nn(b.left)} / ${nn(b.right)}`],
              [is ? "Ósamhverfa" : "Asymmetry", b.asymmetryPct == null ? "—" : `${b.asymmetryPct.toFixed(1)}%`],
              ...(b.stiffnessAsymPct != null ? [[is ? "Stífni ósamhverfa" : "Stiffness asym", `${b.stiffnessAsymPct.toFixed(1)}%`] as Row] : []),
            ]} />
          ))}
          {limbStrength.map((l) => (
            <MetricCard key={`${l.device}-${l.testType}`} title={l.label} sub={l.testDate ?? undefined} rows={[
              [is ? "Vinstri / Hægri" : "Left / Right", `${nn(l.leftN)} / ${nn(l.rightN)} N`],
              [is ? "Ósamhverfa" : "Asymmetry", l.asymmetryPct == null ? "—" : `${l.asymmetryPct.toFixed(1)}%${l.asymmetrySide ? ` (${l.asymmetrySide})` : ""}`],
              [is ? "Staða" : "Status", l.status],
            ]} />
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
