/**
 * Kinexon Deceleration Intelligence — pure, side-effect free.
 *
 * The McBurnie 2022 decel framework on a GPS team runs on Band-3 accel/decel
 * event COUNTS. A real indoor Kinexon config often leaves those count bands empty
 * and instead reports the signal as LOAD and high-intensity EFFORT:
 *   - Decels Load  — total eccentric/braking load (the primary dose)
 *   - Accels Load  — total acceleration load (for the eccentric:concentric balance)
 *   - Exertions (high) — high-intensity effort count
 *   - Mechanical Load — overall mechanical/eccentric load (context)
 *   - Accumulated Acceleration Load — PlayerLoad (volume)
 *
 * So this computes the same McBurnie dimensions on Kinexon's load signals, each
 * read against the player's OWN 28-day baseline (there are no normative basketball
 * benchmarks — Power 2022). Descriptive external load — never a readiness verdict.
 * Deliberately NOT modelled: L/R CoD asymmetry and decel:sprint coupling (the
 * directional-CoD and IMA-Free-Running signals Kinexon doesn't export here).
 */

export type KxDecelFlag = "green" | "yellow" | "red" | "no_data";

/** One session's Kinexon decel signals for a player. */
export interface KinexonDecelDay {
  date: string;
  decelsLoad: number | null;
  accelsLoad: number | null;
  exertionsHigh: number | null;
  mechLoad: number | null;
  playerLoad: number | null;
}

export interface KxDecelDimension {
  key: "eccentric_load" | "ad_balance" | "high_intensity" | "concentration" | "mechanical";
  labelEN: string;
  labelIS: string;
  flag: KxDecelFlag;
  valueText: string;
  coachEN: string;
  coachIS: string;
}

export interface KinexonDecelStatus {
  dims: KxDecelDimension[];
  overall: KxDecelFlag;
  headlineEN: string;
  headlineIS: string;
  baselineDays: number;
  confidence: "low" | "medium" | "high";
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function mean(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function sd(xs: number[], m: number): number | null {
  if (xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function dateMinus(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
const pct = (n: number) => `${Math.round(n)}%`;

interface Snap { mean28: number | null; recent7: number | null; z: number | null; n: number; peakPctOf28: number | null }

function snapshot(rows: KinexonDecelDay[], pick: (d: KinexonDecelDay) => number | null, refDate: string): Snap {
  const acuteStart = dateMinus(refDate, 6);
  const chronicStart = dateMinus(refDate, 27);
  const inWindow = (d: string, start: string) => d >= start && d <= refDate;
  const v28 = rows.filter((r) => inWindow(r.date, chronicStart)).map(pick).filter(isNum);
  const v7 = rows.filter((r) => inWindow(r.date, acuteStart)).map(pick).filter(isNum);
  const m = mean(v28);
  const s = m != null ? sd(v28, m) : null;
  const r7 = mean(v7);
  const z = isNum(s) && s > 0 && isNum(r7) && isNum(m) ? (r7 - m) / s : null;
  const total28 = v28.reduce((a, b) => a + b, 0);
  const peak = v28.length ? Math.max(...v28) : null;
  const peakPctOf28 = isNum(peak) && total28 > 0 ? (peak / total28) * 100 : null;
  return { mean28: m, recent7: r7, z, n: v28.length, peakPctOf28 };
}

function zFlag(z: number | null, dir: "high" | "low"): KxDecelFlag {
  if (z == null) return "no_data";
  const v = dir === "high" ? z : -z;
  if (v >= 1.5) return "red";
  if (v >= 1.0) return "yellow";
  return "green";
}

const rank: Record<KxDecelFlag, number> = { red: 0, yellow: 1, green: 2, no_data: 3 };

export function computeKinexonDecel(rowsIn: KinexonDecelDay[], refDateIn?: string): KinexonDecelStatus {
  const rows = [...(rowsIn ?? [])].filter((r) => typeof r.date === "string").sort((a, b) => (a.date < b.date ? -1 : 1));
  const refDate = refDateIn ?? (rows.length ? rows[rows.length - 1].date : new Date().toISOString().slice(0, 10));

  const decel = snapshot(rows, (d) => d.decelsLoad, refDate);
  const accel = snapshot(rows, (d) => d.accelsLoad, refDate);
  const exer = snapshot(rows, (d) => d.exertionsHigh, refDate);
  const mech = snapshot(rows, (d) => d.mechLoad, refDate);

  // ── 1. Eccentric load (overload) — Decels Load vs own 28d norm ──
  const eccFlag = zFlag(decel.z, "high");
  const eccPctAbove = isNum(decel.z) && isNum(decel.mean28) && isNum(decel.recent7) && decel.mean28 > 0
    ? Math.round(((decel.recent7 - decel.mean28) / decel.mean28) * 100) : null;

  // ── 2. A:D balance — Decels Load : Accels Load drift from the player's own norm ──
  // Under-braking (ratio dropping below his norm) is the McBurnie risk direction.
  const adRatio = isNum(decel.recent7) && isNum(accel.recent7) && accel.recent7 > 0 ? decel.recent7 / accel.recent7 : null;
  const adBase = isNum(decel.mean28) && isNum(accel.mean28) && accel.mean28 > 0 ? decel.mean28 / accel.mean28 : null;
  let adFlag: KxDecelFlag = "no_data";
  if (isNum(adRatio) && isNum(adBase) && adBase > 0) {
    const drift = adRatio / adBase; // <1 = braking down relative to accel vs his norm
    adFlag = drift <= 0.7 ? "red" : drift <= 0.85 ? "yellow" : "green";
  }

  // ── 3. High-intensity braking exposure — Exertions (high) vs own norm ──
  const hiFlag = zFlag(exer.z, "high");

  // ── 4. Exposure concentration — peak-day Decels Load share of 28d total ──
  const conc = decel.peakPctOf28;
  const concFlag: KxDecelFlag = conc == null ? "no_data" : conc >= 30 ? "red" : conc >= 20 ? "yellow" : "green";

  // ── 5. Mechanical load context (no red by itself — informative) ──
  const mechFlag: KxDecelFlag = mech.z == null ? "no_data" : mech.z >= 1.0 ? "yellow" : "green";

  const dims: KxDecelDimension[] = [
    {
      key: "eccentric_load", labelEN: "Eccentric load", labelIS: "Hemlunarálag",
      flag: eccFlag,
      valueText: isNum(decel.recent7) ? `${Math.round(decel.recent7)} /day (28d avg ${isNum(decel.mean28) ? Math.round(decel.mean28) : "—"})` : "no data",
      coachEN: eccFlag === "no_data" ? "no braking-load data" : eccPctAbove != null && eccPctAbove !== 0 ? `braking (Decels Load) is ${eccPctAbove > 0 ? "+" : ""}${eccPctAbove}% vs his 28-day norm` : "braking load is in his normal range",
      coachIS: eccFlag === "no_data" ? "engin hemlunarálagsgögn" : eccPctAbove != null && eccPctAbove !== 0 ? `hemlun (Decels Load) er ${eccPctAbove > 0 ? "+" : ""}${eccPctAbove}% á móti 28-daga viðmiði` : "hemlunarálag er í eðlilegu bili",
    },
    {
      key: "ad_balance", labelEN: "Decel:Accel balance", labelIS: "Hemlun:Hröðun jafnvægi",
      flag: adFlag,
      valueText: isNum(adRatio) ? `${adRatio.toFixed(2)} (his norm ${isNum(adBase) ? adBase.toFixed(2) : "—"})` : "no data",
      coachEN: adFlag === "no_data" ? "not enough accel/decel load to compare" : adFlag === "green" ? "eccentric:concentric balance is near his own norm" : "braking is dropping relative to acceleration vs his own pattern — under-braking risk",
      coachIS: adFlag === "no_data" ? "ekki nóg hröðunar/hemlunarálag til samanburðar" : adFlag === "green" ? "hemlun:hröðun jafnvægi nálægt eigin viðmiði" : "hemlun minnkar á móti hröðun miðað við eigin mynstur — van-hemlun áhætta",
    },
    {
      key: "high_intensity", labelEN: "High-intensity braking", labelIS: "Háákefðar hemlun",
      flag: hiFlag,
      valueText: isNum(exer.recent7) ? `${Math.round(exer.recent7)} high efforts/day` : "no data",
      coachEN: hiFlag === "no_data" ? "no high-intensity effort data" : hiFlag === "green" ? "high-intensity efforts are in his normal range" : "high-intensity efforts are running above his 28-day norm",
      coachIS: hiFlag === "no_data" ? "engin háákefðar-átaksgögn" : hiFlag === "green" ? "háákefðar-átök í eðlilegu bili" : "háákefðar-átök yfir 28-daga viðmiði",
    },
    {
      key: "concentration", labelEN: "Exposure concentration", labelIS: "Álagsþétting",
      flag: concFlag,
      valueText: isNum(conc) ? `${pct(conc)} of 28d from one day` : "no data",
      coachEN: concFlag === "no_data" ? "no braking-load data" : concFlag === "green" ? "braking load is well distributed across sessions" : `${pct(conc as number)} of his 28-day braking load came from a single day — tall-thin pattern`,
      coachIS: concFlag === "no_data" ? "engin hemlunarálagsgögn" : concFlag === "green" ? "hemlunarálag vel dreift á æfingar" : `${pct(conc as number)} af 28-daga hemlunarálagi kom frá einum degi — "hátt-mjótt" mynstur`,
    },
    {
      key: "mechanical", labelEN: "Mechanical load", labelIS: "Vélrænt álag",
      flag: mechFlag,
      valueText: isNum(mech.recent7) ? `${Math.round(mech.recent7)} /day` : "no data",
      coachEN: mechFlag === "no_data" ? "no mechanical-load data" : mechFlag === "green" ? "overall mechanical load is steady" : "overall mechanical load is elevated vs his norm",
      coachIS: mechFlag === "no_data" ? "engin vélræn álagsgögn" : mechFlag === "green" ? "heildar vélrænt álag stöðugt" : "heildar vélrænt álag hækkað á móti viðmiði",
    },
  ];

  const flags = dims.map((d) => d.flag);
  const overall: KxDecelFlag = flags.includes("red") ? "red" : flags.includes("yellow") ? "yellow"
    : flags.some((f) => f !== "no_data") ? "green" : "no_data";

  // Headline = the most concerning dimension's coach phrase.
  const worst = [...dims].sort((a, b) => rank[a.flag] - rank[b.flag])[0];
  const allGreen = overall === "green";
  const headlineEN = overall === "no_data" ? "Not enough Kinexon braking data yet to read deceleration load."
    : allGreen ? "Braking load and eccentric balance are in his normal range."
    : worst.coachEN;
  const headlineIS = overall === "no_data" ? "Ekki næg Kinexon-hemlunargögn til að lesa hemlunarálag enn."
    : allGreen ? "Hemlunarálag og hemlun:hröðun jafnvægi í eðlilegu bili."
    : worst.coachIS;

  const baselineDays = decel.n;
  const confidence: KinexonDecelStatus["confidence"] = baselineDays >= 14 ? "high" : baselineDays >= 7 ? "medium" : "low";

  return { dims, overall, headlineEN, headlineIS, baselineDays, confidence };
}
