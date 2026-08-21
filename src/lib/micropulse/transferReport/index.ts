/**
 * Player Transfer Dossier — pure assembler.
 *
 * A departing player's performance picture for a receiving club: VALD (force
 * plates), VBT (GymAware), GPS, IMA, Games + worst-case-scenario match demands,
 * and pitch/gym fitness tests over a 3–4 month window. The API loads the raw
 * data (all from tables that already exist); THIS module is IO-free — it takes
 * clean, pre-normalised rows and produces uniform, bilingual, layered sections
 * (headline -> plain facts -> a compact metric table) plus a confidence per
 * section.
 *
 * Descriptive only. It never reads or writes the readiness colour, the load
 * target, or the daily decision — it is an export of what the player already is,
 * not a verdict about him.
 */

import type { AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { DIRECTIONS, DIRECTION_LABEL } from "@/lib/micropulse/directionalSignature";

// ── Shared shapes ────────────────────────────────────────────────────────────
export type Bi = { en: string; is: string };
export type Confidence = "high" | "moderate" | "low" | "none";
export type SectionId = "gps" | "gps-game" | "wcs" | "ima" | "ima-game" | "ima-clock" | "vald" | "vbt" | "games" | "fitness" | "athlete";

/** One clock direction ("1".."12") with its hard-movement count. */
export type ClockPoint = { dir: string; label: string; value: number; sharePct: number };

export type DossierTable = { caption?: Bi; columns: Bi[]; rows: string[][] };
export type DossierSection = {
  id: SectionId;
  title: Bi;
  /** one plain-language line — the ~5s read */
  headline: Bi | null;
  /** 2–4 supporting facts — the ~15s read */
  facts: Bi[];
  /** raw-number tables behind a "show details" toggle (0..n; each captioned) */
  tables: DossierTable[];
  confidence: Confidence;
  present: boolean;
  /** PDF only: start this section on a fresh page (ignored on-screen). */
  pdfBreakBefore?: boolean;
};

// ── Inputs (the API maps DB rows into these; the engine stays pure) ──────────
export type DossierIdentity = {
  name: string;
  position: string | null;
  sport: string | null;
  dob: string | null;
  heightCm: number | null;
  massKg: number | null;
};

/** One effective session (already deduped, match-classified by the API). */
export type LoadDaily = {
  date: string;
  isMatch: boolean;
  durationMin: number | null;
  totalDistance: number | null; // m
  highSpeedDistance: number | null; // m
  sprintDistance: number | null; // m
  maxVelocity: number | null; // km/h
  playerLoad: number | null; // AU
  playerLoadPerMin: number | null; // AU/min
  metabolicPowerPeak: number | null; // W/kg
  accel: number | null; // count
  decel: number | null; // count
  cod: number | null; // count
  accelEfforts: number | null; // high-intensity accel efforts
  decelEfforts: number | null; // high-intensity decel efforts
  strideCount: number | null; // running strides (all bands)
  // IMA Free Running — high-velocity stride bands (counts)
  strideB5: number | null;
  strideB6: number | null;
  strideB7: number | null;
  strideB8: number | null;
  // IMA clock — high-intensity directional events per clock direction ("1".."12")
  clock: Record<string, number> | null;
};

export type ValdCmjTest = {
  date: string;
  /** individual trial jump heights (the "three jumps" per test session). */
  jumps: number[];
  meanJumpCm: number | null;
  rsiMod: number | null;
  relPeakPowerWkg: number | null;
  asymmetryPct: number | null;
};

export type ValdInput = {
  cmj: {
    testDate: string | null; jumpHeightCm: number | null; rsiMod: number | null;
    relPeakPowerWkg: number | null; peakForceN: number | null; asymmetryPct: number | null;
  } | null;
  imtp: {
    testDate: string | null; peakForceN: number | null; relPeakForceNkg: number | null; asymmetryPct: number | null;
  } | null;
  /** in-window CMJ jump-height series, oldest→newest, for the development trend. */
  cmjTrend: Array<{ date: string; jumpHeightCm: number }>;
  /** full CMJ test history — every test, every trial (newest first). */
  tests: ValdCmjTest[];
};

export type VbtSet = {
  date: string; exercise: string | null; loadKg: number | null;
  meanVelocity: number | null; peakVelocity: number | null; meanPower: number | null; peakPower: number | null;
};

export type MatchRow = {
  date: string; opponent: string | null; minutes: number | null;
  goals: number | null; assists: number | null; xg: number | null;
};

export type FitnessRow = {
  date: string; type: string; value: number | null; unit: string | null; masKmh: number | null; vo2maxEst: number | null;
};

export type PeakPeriodRow = { date: string; metric: string; windowMin: number; value: number; unit: string | null };

export type RawDossierInput = {
  identity: DossierIdentity;
  windowDays: number;
  start: string; // ISO date (inclusive)
  end: string; // ISO date (inclusive) — "as of"
  load: LoadDaily[];
  vald: ValdInput | null;
  vbt: VbtSet[];
  matches: MatchRow[];
  fitness: FitnessRow[];
  peakPeriods: PeakPeriodRow[];
  athlete: AthleteProfile | null;
};

export type TransferDossier = {
  identity: DossierIdentity & { ageYears: number | null };
  window: { days: number; start: string; end: string; sessions: number; matches: number };
  sections: DossierSection[];
  /** 12-direction IMA clock (hard-movement direction), for the clock-radar visual. */
  imaClock: ClockPoint[] | null;
  overallConfidence: Confidence;
  citations: string[];
  generatedNote: Bi;
};

// ── Provenance ───────────────────────────────────────────────────────────────
export const CITATIONS = [
  "di Prampero et al. 2015 / Osgnach et al. 2010 — metabolic power & energy cost of football running",
  "Gabbett 2016 — training-load monitoring (descriptive volumes, not an injury threshold)",
  "Buchheit & Simpson 2017 — GPS/high-speed running monitoring in team sport",
  "VALD ForceDecks — countermovement jump & isometric mid-thigh pull standards",
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nums = (rows: LoadDaily[], sel: (r: LoadDaily) => number | null): number[] =>
  rows.map(sel).filter(isNum);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number | null => (xs.length ? sum(xs) / xs.length : null);
const maxOf = (xs: number[]): number | null => (xs.length ? Math.max(...xs) : null);

const r0 = (v: number | null | undefined): string => (isNum(v) ? String(Math.round(v)) : "–");
const r1 = (v: number | null | undefined): string => (isNum(v) ? v.toFixed(1) : "–");
const r2 = (v: number | null | undefined): string => (isNum(v) ? v.toFixed(2) : "–");
const km = (metres: number | null | undefined): string => (isNum(metres) ? (metres / 1000).toFixed(2) : "–");

/** confidence from a session/sample count. */
function conf(count: number, high = 20, moderate = 8): Confidence {
  if (count <= 0) return "none";
  if (count >= high) return "high";
  if (count >= moderate) return "moderate";
  return "low";
}

function ageFrom(dob: string | null, asOf: string): number | null {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00Z").getTime();
  const a = new Date(asOf + "T00:00:00Z").getTime();
  if (!Number.isFinite(b) || !Number.isFinite(a) || a < b) return null;
  return Math.floor((a - b) / (365.25 * 86_400_000));
}

/** Monday (ISO week start) of a date, as an ISO date string. */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0 = Sun … 6 = Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}

const shortOpp = (o: string | null): string => (o ? o.replace(/\s*\([^)]*\)\s*$/, "").split(" ")[0].slice(0, 10) : "—");

/** Group a player's sessions by ISO week (most recent first, capped). */
function byWeek(rows: LoadDaily[], cap = 18): Array<[string, LoadDaily[]]> {
  const m = new Map<string, LoadDaily[]>();
  for (const r of rows) {
    const wk = mondayOf(r.date);
    const arr = m.get(wk) ?? [];
    arr.push(r);
    m.set(wk, arr);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, cap);
}

// ── Sections ─────────────────────────────────────────────────────────────────
function gpsSessionSection(load: LoadDaily[]): DossierSection {
  const present = load.length > 0;
  const matchRows = load.filter((r) => r.isMatch);
  const distAll = nums(load, (r) => r.totalDistance);
  const totalKm = sum(distAll) / 1000;
  const perSession = mean(distAll);
  const matchAvg = mean(nums(matchRows, (r) => r.totalDistance));
  const distPeak = maxOf(distAll);
  const topSpeed = maxOf(nums(load, (r) => r.maxVelocity));
  const hsrTotal = sum(nums(load, (r) => r.highSpeedDistance));
  const plPerMin = mean(nums(load, (r) => r.playerLoadPerMin));

  const weekly: DossierTable = {
    caption: { en: "Weekly breakdown", is: "Vikuleg sundurliðun" },
    columns: [{ en: "Week", is: "Vika" }, { en: "Sess", is: "Lotur" }, { en: "Dist (km)", is: "Vegal." }, { en: "HSR (m)", is: "HSR" }, { en: "Sprint (m)", is: "Sprettur" }, { en: "Top km/h", is: "Hám. km/klst" }, { en: "PL", is: "PL" }],
    rows: byWeek(load).map(([wk, rs]) => [wk, String(rs.length), km(sum(nums(rs, (r) => r.totalDistance))), r0(sum(nums(rs, (r) => r.highSpeedDistance))), r0(sum(nums(rs, (r) => r.sprintDistance))), r1(maxOf(nums(rs, (r) => r.maxVelocity))), r0(sum(nums(rs, (r) => r.playerLoad)))]),
  };

  return {
    id: "gps",
    title: { en: "GPS load (engine) — Sessions", is: "GPS-álag (vél) — æfingar" },
    headline: present
      ? { en: `Covered ${totalKm.toFixed(0)} km across ${load.length} sessions${isNum(topSpeed) ? `, topping out at ${topSpeed.toFixed(1)} km/h` : ""}.`, is: `Hljóp ${totalKm.toFixed(0)} km yfir ${load.length} lotur${isNum(topSpeed) ? `, með hámarkshraða ${topSpeed.toFixed(1)} km/klst` : ""}.` }
      : null,
    facts: present
      ? [
          { en: `Averages ${km(perSession)} km per session and ${km(matchAvg)} km in matches (peak ${km(distPeak)} km).`, is: `Að meðaltali ${km(perSession)} km á lotu og ${km(matchAvg)} km í leikjum (toppur ${km(distPeak)} km).` },
          { en: `High-speed running ${r0(hsrTotal)} m total; PlayerLoad ${r1(plPerMin)} AU/min. Per-match GPS on the next page.`, is: `Háhraðahlaup ${r0(hsrTotal)} m alls; PlayerLoad ${r1(plPerMin)} AU/mín. GPS per leik á næstu síðu.` },
        ]
      : [{ en: "No GPS sessions in the window.", is: "Engar GPS-lotur á tímabilinu." }],
    tables: present ? [weekly] : [],
    confidence: conf(load.length),
    present,
    pdfBreakBefore: true,
  };
}

function gpsGameSection(load: LoadDaily[], matches: MatchRow[]): DossierSection {
  const matchRows = load.filter((r) => r.isMatch);
  const present = matchRows.length > 0;
  const oppByDate = new Map(matches.map((m) => [m.date, m]));
  const matchAvg = mean(nums(matchRows, (r) => r.totalDistance));
  const hsrMatch = mean(nums(matchRows, (r) => r.highSpeedDistance));
  const topMatch = maxOf(nums(matchRows, (r) => r.maxVelocity));

  const perMatch: DossierTable = {
    caption: { en: "Every match (GPS)", is: "Allir leikir (GPS)" },
    columns: [{ en: "Date", is: "Dags." }, { en: "Opp", is: "Andst." }, { en: "Dist (km)", is: "Vegal." }, { en: "HSR (m)", is: "HSR" }, { en: "Sprint (m)", is: "Sprettur" }, { en: "Top km/h", is: "Hám." }, { en: "PL", is: "PL" }],
    rows: [...matchRows].sort((a, b) => b.date.localeCompare(a.date)).map((r) => [r.date, shortOpp(oppByDate.get(r.date)?.opponent ?? null), km(r.totalDistance), r0(r.highSpeedDistance), r0(r.sprintDistance), r1(r.maxVelocity), r0(r.playerLoad)]),
  };

  return {
    id: "gps-game",
    title: { en: "GPS load (engine) — Games", is: "GPS-álag (vél) — leikir" },
    headline: present
      ? { en: `${matchRows.length} matches with GPS — ${km(matchAvg)} km average, top speed ${r1(topMatch)} km/h.`, is: `${matchRows.length} leikir með GPS — ${km(matchAvg)} km að meðaltali, hámarkshraði ${r1(topMatch)} km/klst.` }
      : null,
    facts: present
      ? [{ en: `High-speed running averages ${r0(hsrMatch)} m per match.`, is: `Háhraðahlaup að meðaltali ${r0(hsrMatch)} m á leik.` }]
      : [{ en: "No match GPS in the window.", is: "Engin leik-GPS á tímabilinu." }],
    tables: present ? [perMatch] : [],
    confidence: conf(matchRows.length, 12, 4),
    present,
    pdfBreakBefore: true,
  };
}

function wcsSection(load: LoadDaily[], peaks: PeakPeriodRow[]): DossierSection {
  const matches = load.filter((r) => r.isMatch);
  const bestPeak = (winMin: number): number | null => {
    const rows = peaks.filter((p) => p.windowMin === winMin && (p.metric === "distance" || p.metric === "total_distance"));
    return rows.length ? Math.max(...rows.map((p) => p.value)) : null;
  };
  const p1 = bestPeak(1), p3 = bestPeak(3), p5 = bestPeak(5);
  const hasPeriod = isNum(p1) || isNum(p3) || isNum(p5);

  const metPeak = maxOf(nums(matches, (r) => r.metabolicPowerPeak));
  const matchTop = maxOf(nums(matches, (r) => r.maxVelocity));
  // most-demanding match by intensity (PlayerLoad/min), with its date + distance
  const demand = matches
    .filter((r) => isNum(r.playerLoadPerMin))
    .sort((a, b) => (b.playerLoadPerMin as number) - (a.playerLoadPerMin as number))[0] ?? null;

  const present = hasPeriod || matches.length > 0;

  const table: DossierTable | null = hasPeriod
    ? {
        columns: [
          { en: "Window", is: "Gluggi" },
          { en: "Peak distance (m)", is: "Hám. vegalengd (m)" },
          { en: "Rate (m/min)", is: "Hraði (m/mín)" },
        ],
        rows: [
          ["1 min", r0(p1), isNum(p1) ? r0(p1) : "–"],
          ["3 min", r0(p3), isNum(p3) ? r0(p3 / 3) : "–"],
          ["5 min", r0(p5), isNum(p5) ? r0(p5 / 5) : "–"],
        ],
      }
    : null;

  return {
    id: "wcs",
    title: { en: "Worst-case match demands", is: "Kröfuharðustu leikkaflar" },
    headline: present
      ? demand
        ? {
            en: `Most demanding match: ${km(demand.totalDistance)} km on ${demand.date} at ${r1(demand.playerLoadPerMin)} AU/min.`,
            is: `Kröfuharðasti leikur: ${km(demand.totalDistance)} km ${demand.date} á ${r1(demand.playerLoadPerMin)} AU/mín.`,
          }
        : { en: "Peak in-game running windows below.", is: "Hámarks hlaupagluggar í leik hér að neðan." }
      : null,
    facts: present
      ? [
          hasPeriod
            ? { en: `Peak 1-min ${r0(p1)} m, 5-min ${r0(p5)} m (true rolling peak period).`, is: `Hámark 1-mín ${r0(p1)} m, 5-mín ${r0(p5)} m (raunverulegt rúllandi hámark).` }
            : { en: "No per-interval peak-period export — WCS is estimated from match session peaks.", is: "Engin per-glugga peak-period gögn — WCS metið út frá leik-toppum." },
          { en: `Peak metabolic power in a match ${r1(metPeak)} W/kg; top match speed ${r1(matchTop)} km/h.`, is: `Hámarks efnaskiptaafl í leik ${r1(metPeak)} W/kg; hámarks leikhraði ${r1(matchTop)} km/klst.` },
        ]
      : [{ en: "No match data in the window.", is: "Engin leikgögn á tímabilinu." }],
    tables: table ? [table] : [],
    confidence: hasPeriod ? conf(peaks.length, 10, 3) : matches.length > 0 ? "low" : "none",
    present,
  };
}

function imaSessionSection(load: LoadDaily[]): DossierSection {
  const hasIma = load.length > 0 && (nums(load, (r) => r.accel).length > 0 || nums(load, (r) => r.cod).length > 0 || nums(load, (r) => r.strideB6).length > 0);
  const accelTot = sum(nums(load, (r) => r.accel));
  const decelTot = sum(nums(load, (r) => r.decel));
  const codTot = sum(nums(load, (r) => r.cod));
  const frTot = sum(nums(load, (r) => r.strideB5)) + sum(nums(load, (r) => r.strideB6)) + sum(nums(load, (r) => r.strideB7)) + sum(nums(load, (r) => r.strideB8));

  const weekly: DossierTable = {
    caption: { en: "Weekly breakdown", is: "Vikuleg sundurliðun" },
    columns: [{ en: "Week", is: "Vika" }, { en: "Sess", is: "Lotur" }, { en: "Acc", is: "Hröð." }, { en: "Dec", is: "Heml." }, { en: "CoD", is: "Stef." }, { en: "Stride B6", is: "Skref B6" }, { en: "B7", is: "B7" }, { en: "B8", is: "B8" }],
    rows: byWeek(load).map(([wk, rs]) => [wk, String(rs.length), r0(sum(nums(rs, (r) => r.accel))), r0(sum(nums(rs, (r) => r.decel))), r0(sum(nums(rs, (r) => r.cod))), r0(sum(nums(rs, (r) => r.strideB6))), r0(sum(nums(rs, (r) => r.strideB7))), r0(sum(nums(rs, (r) => r.strideB8)))]),
  };

  return {
    id: "ima",
    title: { en: "IMA — Free Running & clock (driver) — Sessions", is: "IMA — Free Running og klukka (drif) — æfingar" },
    headline: hasIma
      ? { en: `${r0(accelTot)} accelerations, ${r0(decelTot)} decelerations, ${r0(codTot)} change-of-direction — how he moves, not how far.`, is: `${r0(accelTot)} hröðanir, ${r0(decelTot)} hemlanir, ${r0(codTot)} stefnubreytingar — hvernig hann hreyfir sig, ekki hversu langt.` }
      : null,
    facts: hasIma
      ? [{ en: `High-velocity Free Running strides (bands 5-8): ${r0(frTot)}. Per-match IMA and the directional clock on the following pages.`, is: `Háhraða Free Running skref (bönd 5-8): ${r0(frTot)}. IMA per leik og stefnu-klukkan á næstu síðum.` }]
      : [{ en: "No IMA (inertial) data in the window.", is: "Engin IMA-gögn á tímabilinu." }],
    tables: hasIma ? [weekly] : [],
    confidence: conf(load.length),
    present: hasIma,
    pdfBreakBefore: true,
  };
}

/** Aggregate the 12-direction IMA clock (high-intensity events) across the window. */
function computeClock(load: LoadDaily[]): ClockPoint[] {
  const totals: Record<string, number> = {};
  let any = 0;
  for (const r of load) {
    if (!r.clock) continue;
    for (const d of DIRECTIONS) {
      const v = Number(r.clock[d]) || 0;
      totals[d] = (totals[d] ?? 0) + v;
      any += v;
    }
  }
  if (any <= 0) return [];
  return DIRECTIONS.map((d) => ({ dir: d, label: DIRECTION_LABEL[d] ?? d, value: totals[d] ?? 0, sharePct: Math.round(((totals[d] ?? 0) / any) * 100) }));
}

function imaClockSection(clock: ClockPoint[]): DossierSection {
  const present = clock.length > 0 && clock.some((c) => c.value > 0);
  const ranked = [...clock].sort((a, b) => b.value - a.value);
  const dom = ranked[0] ?? null;
  const total = clock.reduce((a, c) => a + c.value, 0);

  return {
    id: "ima-clock",
    title: { en: "IMA clock — direction of hard movements", is: "IMA-klukka — stefna snarpra hreyfinga" },
    headline: present && dom
      ? { en: `${r0(total)} hard directional movements — most often ${dom.label} (${dom.sharePct}%).`, is: `${r0(total)} snarpar stefnu-hreyfingar — oftast ${dom.label} (${dom.sharePct}%).` }
      : null,
    facts: present
      ? [{ en: "The clock reads like a compass: 12 o'clock is straight ahead, 3 is right, 6 is backward, 9 is left. It shows which way he drives, cuts and brakes.", is: "Klukkan les eins og áttaviti: 12 er beint áfram, 3 til hægri, 6 aftur á bak, 9 til vinstri. Hún sýnir í hvaða átt hann sækir, sker og hemlar." }]
      : [{ en: "Directional IMA clock not available in the feed.", is: "Stefnu-IMA-klukka ekki til í gögnunum." }],
    tables: present
      ? [{
          caption: { en: "By direction", is: "Eftir stefnu" },
          columns: [{ en: "Direction", is: "Stefna" }, { en: "Events", is: "Atvik" }, { en: "Share", is: "Hlutfall" }],
          rows: ranked.filter((c) => c.value > 0).map((c) => [c.label, r0(c.value), `${c.sharePct}%`]),
        }]
      : [],
    confidence: present ? conf(clock.length, 12, 6) : "none",
    present,
    pdfBreakBefore: true,
  };
}

function imaGameSection(load: LoadDaily[], matches: MatchRow[]): DossierSection {
  const matchRows = load.filter((r) => r.isMatch);
  const hasIma = matchRows.length > 0 && (nums(matchRows, (r) => r.accel).length > 0 || nums(matchRows, (r) => r.cod).length > 0);
  const oppByDate = new Map(matches.map((m) => [m.date, m]));
  const accelMatch = mean(nums(matchRows, (r) => r.accel));
  const decelMatch = mean(nums(matchRows, (r) => r.decel));

  const perMatch: DossierTable = {
    caption: { en: "Every match (IMA)", is: "Allir leikir (IMA)" },
    columns: [{ en: "Date", is: "Dags." }, { en: "Opp", is: "Andst." }, { en: "Acc", is: "Hröð." }, { en: "Dec", is: "Heml." }, { en: "CoD", is: "Stef." }, { en: "Stride B6-8", is: "Skref B6-8" }],
    rows: [...matchRows].sort((a, b) => b.date.localeCompare(a.date)).map((r) => [r.date, shortOpp(oppByDate.get(r.date)?.opponent ?? null), r0(r.accel), r0(r.decel), r0(r.cod), r0((r.strideB6 ?? 0) + (r.strideB7 ?? 0) + (r.strideB8 ?? 0))]),
  };

  return {
    id: "ima-game",
    title: { en: "IMA — Free Running & clock (driver) — Games", is: "IMA — Free Running og klukka (drif) — leikir" },
    headline: hasIma
      ? { en: `Per match: ~${r0(accelMatch)} accelerations, ~${r0(decelMatch)} decelerations.`, is: `Á leik: ~${r0(accelMatch)} hröðanir, ~${r0(decelMatch)} hemlanir.` }
      : null,
    facts: hasIma
      ? [{ en: "Accel / decel / change-of-direction and high-velocity strides per match.", is: "Hröðun / hemlun / stefnubreytingar og háhraðaskref á hvern leik." }]
      : [{ en: "No match IMA in the window.", is: "Engin leik-IMA á tímabilinu." }],
    tables: hasIma ? [perMatch] : [],
    confidence: conf(matchRows.length, 12, 4),
    present: hasIma,
    pdfBreakBefore: true,
  };
}

function valdSection(vald: ValdInput | null): DossierSection {
  const cmj = vald?.cmj ?? null;
  const imtp = vald?.imtp ?? null;
  const tests = vald?.tests ?? [];
  const present = !!(cmj || imtp);
  const trend = vald?.cmjTrend ?? [];
  let trendFact: Bi | null = null;
  if (trend.length >= 2) {
    const first = trend[0].jumpHeightCm, last = trend[trend.length - 1].jumpHeightCm;
    const delta = last - first;
    const dir = delta > 0.5 ? { en: "up", is: "upp" } : delta < -0.5 ? { en: "down", is: "niður" } : { en: "flat", is: "óbreytt" };
    trendFact = {
      en: `CMJ jump height ${dir.en} ${Math.abs(delta).toFixed(1)} cm across ${trend.length} tests in the window.`,
      is: `CMJ-stökkhæð ${dir.is} ${Math.abs(delta).toFixed(1)} cm yfir ${trend.length} próf á tímabilinu.`,
    };
  }

  const facts: Bi[] = [];
  if (cmj) facts.push({
    en: `CMJ ${r1(cmj.jumpHeightCm)} cm${isNum(cmj.rsiMod) ? `, RSImod ${r1(cmj.rsiMod)}` : ""}${isNum(cmj.relPeakPowerWkg) ? `, ${r1(cmj.relPeakPowerWkg)} W/kg` : ""}${isNum(cmj.asymmetryPct) ? `, ${r1(cmj.asymmetryPct)}% asymmetry` : ""}.`,
    is: `CMJ ${r1(cmj.jumpHeightCm)} cm${isNum(cmj.rsiMod) ? `, RSImod ${r1(cmj.rsiMod)}` : ""}${isNum(cmj.relPeakPowerWkg) ? `, ${r1(cmj.relPeakPowerWkg)} W/kg` : ""}${isNum(cmj.asymmetryPct) ? `, ${r1(cmj.asymmetryPct)}% ósamhverfa` : ""}.`,
  });
  if (cmj) facts.push({
    en: "The CMJ is tracked as a neuromuscular-fatigue monitor: a drop in jump height or RSImod against his own baseline signals accumulated fatigue, not a loss of ability.",
    is: "CMJ er notað til að fylgjast með taugavöðva-þreytu: lækkun í stökkhæð eða RSImod miðað við hans eigin grunnlínu gefur til kynna uppsafnaða þreytu, ekki getuleysi.",
  });
  if (imtp) facts.push({
    en: `IMTP peak force ${r0(imtp.peakForceN)} N${isNum(imtp.relPeakForceNkg) ? ` (${r1(imtp.relPeakForceNkg)} N/kg)` : ""}${isNum(imtp.asymmetryPct) ? `, ${r1(imtp.asymmetryPct)}% asymmetry` : ""}.`,
    is: `IMTP hámarkskraftur ${r0(imtp.peakForceN)} N${isNum(imtp.relPeakForceNkg) ? ` (${r1(imtp.relPeakForceNkg)} N/kg)` : ""}${isNum(imtp.asymmetryPct) ? `, ${r1(imtp.asymmetryPct)}% ósamhverfa` : ""}.`,
  });
  if (trendFact) facts.push(trendFact);
  if (!present) facts.push({ en: "No force-plate (VALD) tests on record.", is: "Engin kraftplötu-próf (VALD) skráð." });

  return {
    id: "vald",
    title: { en: "Force plates (VALD)", is: "Kraftplötur (VALD)" },
    headline: present && cmj
      ? { en: `Countermovement jump ${r1(cmj.jumpHeightCm)} cm${cmj.testDate ? ` (${cmj.testDate})` : ""}.`, is: `Uppstökk (CMJ) ${r1(cmj.jumpHeightCm)} cm${cmj.testDate ? ` (${cmj.testDate})` : ""}.` }
      : null,
    facts,
    tables: present
      ? [
          {
            caption: { en: "Latest — summary", is: "Nýjast — samantekt" },
            columns: [{ en: "Test", is: "Próf" }, { en: "Metric", is: "Breyta" }, { en: "Value", is: "Gildi" }],
            rows: [
              ...(cmj ? [["CMJ", "Jump height (cm)", r1(cmj.jumpHeightCm)], ["CMJ", "RSImod", r1(cmj.rsiMod)], ["CMJ", "Rel. peak power (W/kg)", r1(cmj.relPeakPowerWkg)], ["CMJ", "Asymmetry (%)", r1(cmj.asymmetryPct)]] : []),
              ...(imtp ? [["IMTP", "Peak force (N)", r0(imtp.peakForceN)], ["IMTP", "Rel. peak force (N/kg)", r1(imtp.relPeakForceNkg)], ["IMTP", "Asymmetry (%)", r1(imtp.asymmetryPct)]] : []),
            ],
          },
          // Full CMJ test history — every test session with its three jumps.
          ...(tests.length
            ? [{
                caption: { en: "CMJ test history — every test, all three jumps", is: "CMJ prófasaga — hvert próf, öll þrjú stökkin" },
                columns: [{ en: "Date", is: "Dags." }, { en: "Jump 1 (cm)", is: "Stökk 1" }, { en: "Jump 2 (cm)", is: "Stökk 2" }, { en: "Jump 3 (cm)", is: "Stökk 3" }, { en: "Mean (cm)", is: "Meðal" }, { en: "RSImod", is: "RSImod" }, { en: "W/kg", is: "W/kg" }, { en: "Asym %", is: "Ósamh. %" }],
                rows: tests.map((t) => [t.date, r2(t.jumps[0] ?? null), r2(t.jumps[1] ?? null), r2(t.jumps[2] ?? null), r2(t.meanJumpCm), r2(t.rsiMod), r2(t.relPeakPowerWkg), r2(t.asymmetryPct)]),
              }]
            : []),
        ]
      : [],
    confidence: present ? (cmj && imtp ? "high" : "moderate") : "none",
    present,
    pdfBreakBefore: true,
  };
}

function vbtSection(sets: VbtSet[]): DossierSection {
  const present = sets.length > 0;
  const byEx = new Map<string, VbtSet[]>();
  for (const s of sets) {
    const key = (s.exercise ?? "").trim() || "—";
    const arr = byEx.get(key) ?? [];
    arr.push(s);
    byEx.set(key, arr);
  }
  const top = [...byEx.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  const rows = top.map(([ex, ss]) => {
    const mv = maxOf(ss.map((s) => s.meanVelocity).filter(isNum));
    const pp = maxOf(ss.map((s) => s.peakPower).filter(isNum));
    const load = maxOf(ss.map((s) => s.loadKg).filter(isNum));
    return [ex, r2(load), r2(mv), r2(pp), String(ss.length)];
  });
  const lead = top[0] ? top[0][0] : null;

  return {
    id: "vbt",
    title: { en: "Velocity-based training (GymAware)", is: "Hraðamiðuð þjálfun (GymAware)" },
    headline: present && lead ? { en: `Gym power tracked across ${sets.length} sets, led by ${lead}.`, is: `Afl í ræktinni mælt yfir ${sets.length} sett, mest í ${lead}.` } : null,
    facts: present
      ? [{ en: `Main lifts: ${top.map(([e]) => e).join(", ")}. Full GymAware record (not limited to the window).`, is: `Helstu lyftur: ${top.map(([e]) => e).join(", ")}. Öll GymAware-mæling (ekki bundin við tímabilið).` }]
      : [{ en: "No VBT (GymAware) sets on record.", is: "Engin VBT (GymAware) sett skráð." }],
    tables: present
      ? [{
          columns: [{ en: "Lift", is: "Lyfta" }, { en: "Top load (kg)", is: "Hám. þyngd (kg)" }, { en: "Best mean vel. (m/s)", is: "Besti með.hraði (m/s)" }, { en: "Peak power (W)", is: "Hám. afl (W)" }, { en: "Sets", is: "Sett" }],
          rows,
        }]
      : [],
    confidence: conf(sets.length, 15, 5),
    present,
  };
}

function gamesSection(matches: MatchRow[]): DossierSection {
  const present = matches.length > 0;
  const mins = matches.map((m) => m.minutes).filter(isNum);
  const totalMin = sum(mins);
  const starts = matches.filter((m) => isNum(m.minutes) && (m.minutes as number) >= 60).length;
  const goals = sum(matches.map((m) => m.goals).filter(isNum));
  const assists = sum(matches.map((m) => m.assists).filter(isNum));
  const xg = sum(matches.map((m) => m.xg).filter(isNum));

  return {
    id: "games",
    title: { en: "Games (minutes & output)", is: "Leikir (mínútur og afköst)" },
    headline: present
      ? { en: `${matches.length} matches, ${r0(totalMin)} minutes (${starts} starts)${goals || assists ? ` · ${r0(goals)}G ${r0(assists)}A` : ""}.`, is: `${matches.length} leikir, ${r0(totalMin)} mínútur (${starts} byrjunarliðs)${goals || assists ? ` · ${r0(goals)}M ${r0(assists)}S` : ""}.` }
      : null,
    facts: present
      ? [
          { en: `Averaged ${r0(mean(mins))} minutes per appearance.`, is: `Að meðaltali ${r0(mean(mins))} mínútur í leik.` },
          ...(goals || assists ? [{ en: `${r0(goals)} goals, ${r0(assists)} assists${xg ? `, ${r1(xg)} xG` : ""}. Per-match GPS/IMA are in the GPS and IMA sections.`, is: `${r0(goals)} mörk, ${r0(assists)} stoðsendingar${xg ? `, ${r1(xg)} xG` : ""}. GPS/IMA per leik eru í GPS- og IMA-köflunum.` }] : [{ en: "Per-match GPS/IMA are in the GPS and IMA sections.", is: "GPS/IMA per leik eru í GPS- og IMA-köflunum." }]),
        ]
      : [{ en: "No match appearances in the window.", is: "Engir leikir á tímabilinu." }],
    tables: present
      ? [{
          columns: [{ en: "Date", is: "Dags." }, { en: "Opponent", is: "Andstæðingur" }, { en: "Min", is: "Mín" }, { en: "G", is: "M" }, { en: "A", is: "S" }],
          rows: [...matches].sort((a, b) => b.date.localeCompare(a.date)).map((m) => [m.date, m.opponent ?? "—", r0(m.minutes), r0(m.goals), r0(m.assists)]),
        }]
      : [],
    confidence: conf(matches.length, 12, 4),
    present,
    pdfBreakBefore: true,
  };
}

function fitnessSection(rows: FitnessRow[]): DossierSection {
  const present = rows.length > 0;
  // latest per test type
  const latest = new Map<string, FitnessRow>();
  for (const r of rows) {
    const cur = latest.get(r.type);
    if (!cur || r.date > cur.date) latest.set(r.type, r);
  }
  const list = [...latest.values()].sort((a, b) => b.date.localeCompare(a.date));
  const mas = list.find((r) => isNum(r.masKmh));

  return {
    id: "fitness",
    title: { en: "Fitness tests (pitch & gym)", is: "Þolpróf (völlur & rækt)" },
    headline: present
      ? mas
        ? { en: `Maximal aerobic speed ${r1(mas.masKmh)} km/h${isNum(mas.vo2maxEst) ? ` (~${r0(mas.vo2maxEst)} ml/kg/min VO2max est.)` : ""}.`, is: `Hámarks loftháður hraði ${r1(mas.masKmh)} km/klst${isNum(mas.vo2maxEst) ? ` (~${r0(mas.vo2maxEst)} ml/kg/mín VO2max mat)` : ""}.` }
        : { en: `${list.length} fitness test${list.length === 1 ? "" : "s"} on record.`, is: `${list.length} þolpróf skráð.` }
      : null,
    facts: present
      ? [{ en: `Most recent: ${list.slice(0, 3).map((r) => r.type).join(", ")}.`, is: `Nýjast: ${list.slice(0, 3).map((r) => r.type).join(", ")}.` }]
      : [{ en: "No pitch or gym fitness tests on record.", is: "Engin þolpróf skráð." }],
    tables: present
      ? [{
          columns: [{ en: "Date", is: "Dags." }, { en: "Test", is: "Próf" }, { en: "Result", is: "Niðurstaða" }],
          rows: list.slice(0, 10).map((r) => [r.date, r.type, isNum(r.value) ? `${r1(r.value)}${r.unit ? ` ${r.unit}` : ""}` : (isNum(r.masKmh) ? `${r1(r.masKmh)} km/h` : "–")]),
        }]
      : [],
    confidence: conf(list.length, 4, 2),
    present,
  };
}

function athleteSection(profile: AthleteProfile | null): DossierSection {
  const present = !!profile && profile.coverage.qualitiesWithData > 0;
  const strengths = profile?.strengths ?? [];
  const weaknesses = profile?.weaknesses ?? [];
  const pctl = (v: number | null) => (isNum(v) ? `${Math.round(v)}th` : "–");
  const nameOf = (id: string) => id.replace(/_/g, " ");

  return {
    id: "athlete",
    title: { en: "Athlete profile (position percentile)", is: "Íþróttaprófíll (stöðu-percentíl)" },
    headline: present
      ? {
          en: strengths.length
            ? `Stands out for ${strengths.slice(0, 2).map((s) => nameOf(s.id)).join(" & ")} within his position group.`
            : "Balanced physical profile within his position group.",
          is: strengths.length
            ? `Sker sig úr í ${strengths.slice(0, 2).map((s) => nameOf(s.id)).join(" og ")} innan stöðuhóps.`
            : "Jafn líkamlegur prófíll innan stöðuhóps.",
        }
      : null,
    facts: present
      ? [
          strengths.length
            ? { en: `Strengths: ${strengths.slice(0, 3).map((s) => `${nameOf(s.id)} (${pctl(s.positionPercentile)})`).join(", ")}.`, is: `Styrkleikar: ${strengths.slice(0, 3).map((s) => `${nameOf(s.id)} (${pctl(s.positionPercentile)})`).join(", ")}.` }
            : { en: "No standout strengths vs his position peers.", is: "Engir afgerandi styrkleikar m.v. stöðufélaga." },
          weaknesses.length
            ? { en: `Development areas: ${weaknesses.slice(0, 3).map((w) => nameOf(w.id)).join(", ")}.`, is: `Þróunar-svið: ${weaknesses.slice(0, 3).map((w) => nameOf(w.id)).join(", ")}.` }
            : { en: "No clear weaknesses vs his position peers.", is: "Engir skýrir veikleikar m.v. stöðufélaga." },
        ]
      : [{ en: "Not enough data to rank his qualities against peers.", is: "Ekki næg gögn til að raða gæðum m.v. félaga." }],
    tables: present
      ? [{
          columns: [{ en: "Quality", is: "Gæði" }, { en: "Percentile", is: "Percentíl" }, { en: "Read", is: "Lestur" }],
          rows: (profile?.qualities ?? []).filter((q) => q.value != null).sort((a, b) => (b.positionPercentile ?? 0) - (a.positionPercentile ?? 0)).map((q) => [nameOf(q.id), pctl(q.positionPercentile), q.verdict]),
        }]
      : [],
    confidence: present ? (profile!.coverage.ratio >= 0.6 ? "high" : profile!.coverage.ratio >= 0.35 ? "moderate" : "low") : "none",
    present,
  };
}

// ── Overall confidence ───────────────────────────────────────────────────────
const RANK: Record<Confidence, number> = { none: 0, low: 1, moderate: 2, high: 3 };
const backRank: Confidence[] = ["none", "low", "moderate", "high"];
function overall(sections: DossierSection[]): Confidence {
  const present = sections.filter((s) => s.present);
  if (!present.length) return "none";
  const avg = present.reduce((a, s) => a + RANK[s.confidence], 0) / present.length;
  return backRank[Math.round(avg)];
}

// ── Entry point ──────────────────────────────────────────────────────────────
export function buildTransferDossier(input: RawDossierInput): TransferDossier {
  const load = [...input.load].sort((a, b) => a.date.localeCompare(b.date));
  const imaClock = computeClock(load);
  const sections: DossierSection[] = [
    athleteSection(input.athlete),
    gpsSessionSection(load),
    gpsGameSection(load, input.matches),
    imaSessionSection(load),
    imaGameSection(load, input.matches),
    imaClockSection(imaClock),
    gamesSection(input.matches),
    wcsSection(load, input.peakPeriods),
    valdSection(input.vald),
    vbtSection(input.vbt),
    fitnessSection(input.fitness),
  ];

  return {
    identity: { ...input.identity, ageYears: ageFrom(input.identity.dob, input.end) },
    window: {
      days: input.windowDays,
      start: input.start,
      end: input.end,
      sessions: load.length,
      matches: load.filter((r) => r.isMatch).length,
    },
    sections,
    imaClock: imaClock.length ? imaClock : null,
    overallConfidence: overall(sections),
    citations: CITATIONS,
    generatedNote: {
      en: "Descriptive performance export — it reflects what the player did in the window and never encodes a readiness verdict or availability decision.",
      is: "Lýsandi frammistöðu-útflutningur — sýnir hvað leikmaðurinn gerði á tímabilinu og felur aldrei í sér readiness-dóm eða ákvörðun um leikhæfi.",
    },
  };
}
