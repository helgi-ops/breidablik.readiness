/**
 * Shared, pure builders for the VALD Assessment summary — the raw metric groups
 * and the "How he compares" rows — so the Total Player Analysis on-screen block
 * and its PDF render exactly the same numbers/labels. Bilingual; no React, no IO.
 * PERFORMANCE ONLY: no injury/LSI, no clearance — asymmetry is a robustness read.
 */

import { classifyValdMetric, benchmarkPopulationNote, type PopKey } from "./benchmarks";
import type { RtpCmj, RtpImtp, RtpBatteryTest, RtpLimbStrengthTest } from "@/lib/micropulse/rtp/types";

export type ValdSlice = {
  benchmarkPop: PopKey;
  cmj: RtpCmj | null;
  imtp: RtpImtp | null;
  battery: RtpBatteryTest[];
  limbStrength: RtpLimbStrengthTest[];
  coverage: { present: string[]; pending: string[] };
};

export type ValdRow = [string, string];
export type ValdMetricGroup = { title: string; date: string | null; rows: ValdRow[] };
export type ValdCompareRow = { label: string; value: string; band: string; bandLabel: string; ref: string; indicative: boolean };

export function valdHasData(vald: ValdSlice | null | undefined): vald is ValdSlice {
  return !!vald && (!!vald.cmj || !!vald.imtp || vald.limbStrength.length > 0 || vald.battery.length > 0);
}

/** Drop-jump reactive strength index from the battery (DJ preferred over SL-DJ). */
export function djRsiFromBattery(battery: RtpBatteryTest[]): number | null {
  const drops = battery.filter((b) => b.primaryValue != null && /rsi/i.test(b.primaryLabel) && /drop/i.test(`${b.testType} ${b.label}`));
  const bilateral = drops.find((b) => !/single|\bsl/i.test(`${b.testType} ${b.label}`));
  return (bilateral ?? drops[0])?.primaryValue ?? null;
}

const nn = (v: number | null | undefined) => (v == null ? "—" : v);

/** Raw metric groups — CMJ, IMTP, single-leg/reactive battery, NordBord/ForceFrame. */
export function buildValdGroups(vald: ValdSlice, is: boolean): ValdMetricGroup[] {
  const { cmj, imtp, battery, limbStrength } = vald;
  const groups: ValdMetricGroup[] = [];

  if (imtp) {
    groups.push({
      title: is ? "Ísómetrískt mið-læris tog (IMTP)" : "Isometric Mid-Thigh Pull",
      date: imtp.testDate,
      rows: [
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
      ],
    });
  }
  if (cmj) {
    groups.push({
      title: is ? "Stökk með mótstökki (CMJ)" : "Countermovement Jump",
      date: cmj.testDate,
      rows: [
        [is ? "Stökkhæð" : "Jump height", cmj.jumpHeightCm == null ? "—" : `${cmj.jumpHeightCm.toFixed(1)} cm`],
        ["RSI-modified", cmj.rsiMod == null ? "—" : cmj.rsiMod.toFixed(2)],
        [is ? "Hámarksafl" : "Peak power", cmj.peakPowerW == null ? "—" : `${Math.round(cmj.peakPowerW)} W`],
        [is ? "Hlutf. hámarksafl" : "Rel. peak power", cmj.relPeakPowerWkg == null ? "—" : `${cmj.relPeakPowerWkg.toFixed(1)} W/kg`],
        [is ? "Samdráttartími" : "Contraction time", cmj.contractionTimeMs == null ? "—" : `${Math.round(cmj.contractionTimeMs)} ms`],
        [is ? "Sammiðja hámarkshraði" : "Concentric peak velocity", cmj.concentricPeakVelocityMS == null ? "—" : `${cmj.concentricPeakVelocityMS.toFixed(2)} m/s`],
        [is ? "Sammiðja RFD" : "Concentric RFD", cmj.concentricRfdNS == null ? "—" : `${Math.round(cmj.concentricRfdNS)} N/s`],
        [is ? "Ósamhverfa" : "Limb asymmetry", cmj.asymmetryPct == null ? "—" : `${cmj.asymmetryPct.toFixed(1)}%${cmj.asymmetrySide ? ` (${cmj.asymmetrySide})` : ""}`],
        [is ? "Tilraunir (meðal)" : "Trials (mean)", `${cmj.trialCount}`],
      ],
    });
  }
  for (const b of battery) {
    groups.push({
      title: b.label,
      date: b.testDate,
      rows: [
        [b.primaryLabel, b.primaryValue == null ? "—" : `${b.primaryValue}${b.primaryUnit ? " " + b.primaryUnit : ""}`],
        [is ? "Vinstri / Hægri" : "Left / Right", `${nn(b.left)} / ${nn(b.right)}`],
        [is ? "Ósamhverfa" : "Asymmetry", b.asymmetryPct == null ? "—" : `${b.asymmetryPct.toFixed(1)}%`],
        ...(b.stiffnessAsymPct != null ? [[is ? "Stífni ósamhverfa" : "Stiffness asym", `${b.stiffnessAsymPct.toFixed(1)}%`] as ValdRow] : []),
      ],
    });
  }
  for (const l of limbStrength) {
    groups.push({
      title: l.label,
      date: l.testDate,
      rows: [
        [is ? "Vinstri / Hægri (hámark)" : "Left / Right (peak)", `${nn(l.leftN)} / ${nn(l.rightN)} N`],
        ...(l.avgLeftN != null || l.avgRightN != null ? [[is ? "Vinstri / Hægri (meðal)" : "Left / Right (avg)", `${nn(l.avgLeftN)} / ${nn(l.avgRightN)} N`] as ValdRow] : []),
        ...(l.maxRfdLeftNS != null || l.maxRfdRightNS != null ? [["Max RFD (L / R)", `${l.maxRfdLeftNS != null ? Math.round(l.maxRfdLeftNS) : "—"} / ${l.maxRfdRightNS != null ? Math.round(l.maxRfdRightNS) : "—"} N/s`] as ValdRow] : []),
        [is ? "Ósamhverfa" : "Asymmetry", l.asymmetryPct == null ? "—" : `${l.asymmetryPct.toFixed(1)}%${l.asymmetrySide ? ` (${l.asymmetrySide})` : ""}`],
        [is ? "Staða" : "Status", l.status],
      ],
    });
  }
  return groups;
}

/** "How he compares" rows (graded/context bands), mirroring ValdBenchmarkPanel. */
export function buildValdCompare(vald: ValdSlice, is: boolean): { note: string; rows: ValdCompareRow[] } {
  const { cmj, imtp, limbStrength, battery, benchmarkPop } = vald;
  const djRsi = djRsiFromBattery(battery);
  const nb = limbStrength.find((l) => l.device === "nordbord");
  const ff = limbStrength.find((l) => l.device === "forceframe");
  const nbMean = nb && nb.leftN != null && nb.rightN != null ? (nb.leftN + nb.rightN) / 2 : null;
  const pick = (b: { en: string; is: string }) => (is ? b.is : b.en);

  type In = { label: string; value: string; metric: string; raw: number | null | undefined };
  const inputs: In[] = [
    { label: is ? "IMTP hlutf. hámarkskraftur" : "IMTP rel. peak force", value: imtp?.relPeakForceNkg != null ? `${imtp.relPeakForceNkg.toFixed(1)} N/kg` : "", metric: "imtpRelForceNkg", raw: imtp?.relPeakForceNkg },
    { label: is ? "IMTP hlutf. kraftur @200ms" : "IMTP rel. force @200ms", value: imtp?.relForce200Nkg != null ? `${imtp.relForce200Nkg.toFixed(1)} N/kg` : "", metric: "imtpRelForce200Nkg", raw: imtp?.relForce200Nkg },
    { label: "IMTP force @100ms", value: imtp?.force100N != null ? `${imtp.force100N} N` : "", metric: "imtpForce100N", raw: imtp?.force100N },
    { label: "IMTP force @200ms", value: imtp?.force200N != null ? `${imtp.force200N} N` : "", metric: "imtpForce200N", raw: imtp?.force200N },
    { label: "IMTP RFD 0-100ms", value: imtp?.rfd100 != null ? `${imtp.rfd100} N/s` : "", metric: "imtpRfd0100Ns", raw: imtp?.rfd100 },
    { label: "IMTP RFD 0-200ms", value: imtp?.rfd200 != null ? `${imtp.rfd200} N/s` : "", metric: "imtpRfd0200Ns", raw: imtp?.rfd200 },
    { label: is ? "IMTP ósamhverfa" : "IMTP asymmetry", value: imtp?.asymmetryPct != null ? `${imtp.asymmetryPct.toFixed(1)}%` : "", metric: "asymmetry", raw: imtp?.asymmetryPct },
    { label: is ? "Stökkhæð" : "Jump height", value: cmj?.jumpHeightCm != null ? `${cmj.jumpHeightCm.toFixed(1)} cm` : "", metric: "cmjJumpHeightCm", raw: cmj?.jumpHeightCm },
    { label: "RSI-modified", value: cmj?.rsiMod != null ? cmj.rsiMod.toFixed(2) : "", metric: "cmjRsiMod", raw: cmj?.rsiMod },
    { label: "Drop-jump RSI", value: djRsi != null ? djRsi.toFixed(2) : "", metric: "djRsi", raw: djRsi },
    { label: is ? "Hlutf. hámarksafl" : "Rel. peak power", value: cmj?.relPeakPowerWkg != null ? `${cmj.relPeakPowerWkg.toFixed(1)} W/kg` : "", metric: "cmjRelPeakPowerWkg", raw: cmj?.relPeakPowerWkg },
    { label: is ? "CMJ ósamhverfa" : "CMJ asymmetry", value: cmj?.asymmetryPct != null ? `${cmj.asymmetryPct.toFixed(1)}%` : "", metric: "asymmetry", raw: cmj?.asymmetryPct },
    { label: is ? "Nordic hamstring (meðal/fót)" : "Nordic hamstring (mean/limb)", value: nbMean != null ? `${Math.round(nbMean)} N` : "", metric: "nordbordForceN", raw: nbMean },
    { label: is ? "Nári (Hip AD/AB) ósamhverfa" : "Groin (Hip AD/AB) asymmetry", value: ff?.asymmetryPct != null ? `${ff.asymmetryPct.toFixed(1)}%` : "", metric: "groinAsymmetry", raw: ff?.asymmetryPct },
  ];

  const rows: ValdCompareRow[] = [];
  for (const inp of inputs) {
    if (inp.raw == null || !Number.isFinite(inp.raw)) continue;
    const read = classifyValdMetric(inp.metric, inp.raw, benchmarkPop);
    if (!read) continue; // no band for this population -> skip in the PDF
    rows.push({
      label: inp.label,
      value: inp.value,
      band: read.band,
      bandLabel: pick(read.bandLabel) + (read.indicative ? (is ? " (leiðb.)" : " (indic.)") : ""),
      ref: `${pick(read.ref)} · ${read.citation}`,
      indicative: !!read.indicative,
    });
  }
  return { note: pick(benchmarkPopulationNote(benchmarkPop)), rows };
}
