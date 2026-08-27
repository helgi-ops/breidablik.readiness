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

/** Single-leg hamstring isometric Limb Symmetry Index (involved/uninvolved %),
 *  present only when an injured side is known (an RTP context). */
export function slHamstringLsiFromBattery(battery: RtpBatteryTest[]): number | null {
  const h = battery.find((b) => b.lsiPct != null && /hamstring/i.test(`${b.testType} ${b.label}`) && /iso/i.test(`${b.testType} ${b.label}`));
  return h?.lsiPct ?? null;
}

/** Countermovement rebound jump reactive strength index (bilateral preferred). */
export function cmrjRsiFromBattery(battery: RtpBatteryTest[]): number | null {
  const reb = battery.filter((b) => b.primaryValue != null && /rsi/i.test(b.primaryLabel) && /rebound|cmrj/i.test(`${b.testType} ${b.label}`));
  const bilateral = reb.find((b) => !/single|\bsl/i.test(`${b.testType} ${b.label}`));
  return (bilateral ?? reb[0])?.primaryValue ?? null;
}

/** Isometric belt-squat relative peak force (N/kg) — context, no established norms. */
export function beltSquatRelForceFromBattery(battery: RtpBatteryTest[]): number | null {
  const bs = battery.find((b) => b.relForceNkg != null && /belt.?squat/i.test(`${b.testType} ${b.label}`));
  return bs?.relForceNkg ?? null;
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
        ...(b.relForceNkg != null ? [[is ? "Hlutf. hámarkskraftur" : "Rel. peak force", `${b.relForceNkg.toFixed(1)} N/kg`] as ValdRow] : []),
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

/** The gradable slice of a VALD assessment (everything the benchmark engine reads). */
export type ValdGradable = Pick<ValdSlice, "benchmarkPop" | "cmj" | "imtp" | "battery" | "limbStrength">;

type CompareInput = { label: string; value: string; metric: string; raw: number | null | undefined; tier: "primary" | "secondary" };

/** One localized input row per gradable VALD quality, tiered (IMTP + CMJ core = primary).
 *  Single source shared by the compare table and the training-focus engine. */
export function valdCompareInputs(v: ValdGradable, is: boolean): CompareInput[] {
  const { cmj, imtp, limbStrength, battery } = v;
  const djRsi = djRsiFromBattery(battery);
  const cmrjRsi = cmrjRsiFromBattery(battery);
  const beltSquatRel = beltSquatRelForceFromBattery(battery);
  const hamLsi = slHamstringLsiFromBattery(battery);
  const nb = limbStrength.find((l) => l.device === "nordbord");
  // ForceFrame carries several movements — split groin (Hip AD/AB) from ankle plantar-flexion so
  // each gets its own graded symmetry row rather than being lumped together.
  const ffKey = (l: RtpLimbStrengthTest) => `${l.testType} ${l.bodyRegion ?? ""} ${l.direction ?? ""}`;
  const ffAnkle = limbStrength.find((l) => l.device === "forceframe" && /ankle|plantar/i.test(ffKey(l)));
  const ffGroin = limbStrength.find((l) => l.device === "forceframe" && /hip|groin|adduct|abduct/i.test(ffKey(l)))
    ?? limbStrength.find((l) => l.device === "forceframe" && l !== ffAnkle);
  const nbMean = nb && nb.leftN != null && nb.rightN != null ? (nb.leftN + nb.rightN) / 2 : null;
  return [
    { tier: "primary", label: is ? "IMTP hlutf. hámarkskraftur" : "IMTP rel. peak force", value: imtp?.relPeakForceNkg != null ? `${imtp.relPeakForceNkg.toFixed(1)} N/kg` : "", metric: "imtpRelForceNkg", raw: imtp?.relPeakForceNkg },
    { tier: "primary", label: is ? "IMTP hlutf. kraftur @200ms" : "IMTP rel. force @200ms", value: imtp?.relForce200Nkg != null ? `${imtp.relForce200Nkg.toFixed(1)} N/kg` : "", metric: "imtpRelForce200Nkg", raw: imtp?.relForce200Nkg },
    { tier: "secondary", label: "IMTP force @100ms", value: imtp?.force100N != null ? `${imtp.force100N} N` : "", metric: "imtpForce100N", raw: imtp?.force100N },
    { tier: "secondary", label: "IMTP force @200ms", value: imtp?.force200N != null ? `${imtp.force200N} N` : "", metric: "imtpForce200N", raw: imtp?.force200N },
    { tier: "secondary", label: "IMTP RFD 0-100ms", value: imtp?.rfd100 != null ? `${imtp.rfd100} N/s` : "", metric: "imtpRfd0100Ns", raw: imtp?.rfd100 },
    { tier: "secondary", label: "IMTP RFD 0-200ms", value: imtp?.rfd200 != null ? `${imtp.rfd200} N/s` : "", metric: "imtpRfd0200Ns", raw: imtp?.rfd200 },
    { tier: "secondary", label: is ? "IMTP ósamhverfa" : "IMTP asymmetry", value: imtp?.asymmetryPct != null ? `${imtp.asymmetryPct.toFixed(1)}%` : "", metric: "asymmetry", raw: imtp?.asymmetryPct },
    { tier: "primary", label: is ? "Stökkhæð" : "Jump height", value: cmj?.jumpHeightCm != null ? `${cmj.jumpHeightCm.toFixed(1)} cm` : "", metric: "cmjJumpHeightCm", raw: cmj?.jumpHeightCm },
    { tier: "primary", label: "RSI-modified", value: cmj?.rsiMod != null ? cmj.rsiMod.toFixed(2) : "", metric: "cmjRsiMod", raw: cmj?.rsiMod },
    { tier: "secondary", label: "Drop-jump RSI", value: djRsi != null ? djRsi.toFixed(2) : "", metric: "djRsi", raw: djRsi },
    { tier: "secondary", label: "Rebound-jump RSI", value: cmrjRsi != null ? cmrjRsi.toFixed(2) : "", metric: "cmrjRsi", raw: cmrjRsi },
    { tier: "secondary", label: is ? "Belt-squat rel. force" : "Belt-squat rel. force", value: beltSquatRel != null ? `${beltSquatRel.toFixed(1)} N/kg` : "", metric: "beltSquatRelForceNkg", raw: beltSquatRel },
    { tier: "secondary", label: is ? "SL hamstring iso LSI" : "SL hamstring iso LSI", value: hamLsi != null ? `${Math.round(hamLsi)}%` : "", metric: "lsi", raw: hamLsi },
    { tier: "primary", label: is ? "Hlutf. hámarksafl" : "Rel. peak power", value: cmj?.relPeakPowerWkg != null ? `${cmj.relPeakPowerWkg.toFixed(1)} W/kg` : "", metric: "cmjRelPeakPowerWkg", raw: cmj?.relPeakPowerWkg },
    { tier: "secondary", label: is ? "CMJ ósamhverfa" : "CMJ asymmetry", value: cmj?.asymmetryPct != null ? `${cmj.asymmetryPct.toFixed(1)}%` : "", metric: "asymmetry", raw: cmj?.asymmetryPct },
    { tier: "secondary", label: is ? "Nordic hamstring (meðal/fót)" : "Nordic hamstring (mean/limb)", value: nbMean != null ? `${Math.round(nbMean)} N` : "", metric: "nordbordForceN", raw: nbMean },
    { tier: "secondary", label: is ? "Nári (Hip AD/AB) ósamhverfa" : "Groin (Hip AD/AB) asymmetry", value: ffGroin?.asymmetryPct != null ? `${ffGroin.asymmetryPct.toFixed(1)}%` : "", metric: "groinAsymmetry", raw: ffGroin?.asymmetryPct },
    { tier: "secondary", label: is ? "Ökkla plantar-flexion ósamhverfa" : "Ankle plantar-flexion asymmetry", value: ffAnkle?.asymmetryPct != null ? `${ffAnkle.asymmetryPct.toFixed(1)}%` : "", metric: "anklePlantarAsymmetry", raw: ffAnkle?.asymmetryPct },
  ];
}

/** "How he compares" rows (graded/context bands), mirroring ValdBenchmarkPanel. */
export function buildValdCompare(vald: ValdSlice, is: boolean): { note: string; rows: ValdCompareRow[] } {
  const { benchmarkPop } = vald;
  const pick = (b: { en: string; is: string }) => (is ? b.is : b.en);
  const inputs = valdCompareInputs(vald, is);

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

// ── Training focus (rule-based development recommendation) ────────────────────
// Ranks the player's below/average VALD qualities against the cited population
// benchmarks and pairs each with its cited training lever. IMTP + CMJ core
// metrics are weighted as primary. Rules decide; no AI, no fabricated band.

export type ValdTrainingPriority = {
  quality: string;
  value: string;
  band: "below" | "average";
  bandLabel: string;
  tier: "primary" | "secondary";
  why: string;     // the cited reference this quality is measured against
  lever: string;   // the cited "what to train" method
  cite: string;
  indicative: boolean;
};

export type ValdTrainingPlan = {
  hasData: boolean;
  verdict: string;
  priorities: ValdTrainingPriority[];
  strengths: string[];
};

export function buildValdTrainingPlan(v: ValdGradable, is: boolean): ValdTrainingPlan {
  const pick = (b: { en: string; is: string }) => (is ? b.is : b.en);
  const inputs = valdCompareInputs(v, is);
  const graded = inputs.filter((i) => i.raw != null && Number.isFinite(i.raw));

  const priorities: ValdTrainingPriority[] = [];
  const strengths: string[] = [];
  for (const inp of graded) {
    const read = classifyValdMetric(inp.metric, inp.raw, v.benchmarkPop);
    if (!read) continue;
    if ((read.band === "below" || read.band === "average") && read.improve) {
      priorities.push({
        quality: inp.label, value: inp.value, band: read.band,
        bandLabel: pick(read.bandLabel) + (read.indicative ? (is ? " (leiðb.)" : " (indic.)") : ""),
        tier: inp.tier, why: pick(read.ref), lever: pick(read.improve),
        cite: read.citation, indicative: !!read.indicative,
      });
    } else if (read.band === "elite" || read.band === "good") {
      strengths.push(inp.label);
    }
  }

  // Worst first, then IMTP/CMJ (primary) before the rest, then stable by name.
  const bandRank = (b: string) => (b === "below" ? 0 : 1);
  const tierRank = (t: string) => (t === "primary" ? 0 : 1);
  priorities.sort((a, b) => bandRank(a.band) - bandRank(b.band) || tierRank(a.tier) - tierRank(b.tier) || a.quality.localeCompare(b.quality));

  const top = priorities.slice(0, 2).map((p) => p.quality.toLowerCase());
  const verdict = priorities.length === 0
    ? (graded.length === 0
        ? (is ? "Engin metanleg VALD-gögn enn." : "No gradable VALD data yet.")
        : (is ? "Á réttri leið — á eða yfir viðmiði á öllum metnum eiginleikum." : "On track — at or above the reference on every graded quality."))
    : (is ? `Forgangur að þjálfa: ${top.join(" og ")}.` : `Training priority: ${top.join(" and ")}.`);

  return { hasData: graded.length > 0, verdict, priorities, strengths };
}
