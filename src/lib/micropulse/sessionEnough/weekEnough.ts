/**
 * "Did we do enough?" for a whole week (Micro) and a whole block (Meso) — the week's training against the
 * Periodization Hub's own plan for it.
 *
 *   planned = the Meso calendar's day numbers (CalDay: the team match × the day-type share × the block's ramp,
 *             the coach's − / + per variable, the light week, camps, moved days), summed over the training days;
 *   done    = the squad median of each session (players with a full session — the same filters as the session
 *             card), summed over the same days. Raw value against raw value, so the calendar's match reference
 *             (the team's average match) is never mixed with a player's own match.
 *
 * Judged: accelerations, braking, changes of direction, high-speed running (the session card's movement types).
 * Player Load and distance are shown, not judged. Thresholds are the session card's (statusOf: 85–115% = on plan;
 * verdictOf): no new number. Running over the plan is a note, never a fail. A planned session without data is left
 * out (and named) — missing data is never a 0. On a top-up day (MD+1) the players who started the last match
 * recover, so the median of the others is compared, as on the session card.
 *
 * Pure, deterministic, IO-free. Rules decide; no AI. Descriptive — NEVER the readiness colour.
 * Plan standard: Stevens 2017, Martín-García 2018 (via CAL_SHARE_IMA / CAL_SHARE_HI); thresholds PMC6747517.
 */

import { statusOf, type PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { ENOUGH_LABEL, ENOUGH_UNIT, verdictOf, type TeamVerdict } from "./index";

type Bi = { en: string; is: string };

export const WEEK_JUDGED = ["imaAccel", "imaDecel", "imaCod", "hsr"] as const;
export const WEEK_SHOWN = ["load", "dist"] as const;
export type WeekKey = (typeof WEEK_JUDGED)[number] | (typeof WEEK_SHOWN)[number];
export const WEEK_KEYS: readonly WeekKey[] = [...WEEK_JUDGED, ...WEEK_SHOWN];
const isJudged = (k: WeekKey) => (WEEK_JUDGED as readonly string[]).includes(k);

export const WEEK_LABEL: Record<WeekKey, Bi> = {
  imaAccel: ENOUGH_LABEL.imaAccel, imaDecel: ENOUGH_LABEL.imaDecel, imaCod: ENOUGH_LABEL.imaCod, hsr: ENOUGH_LABEL.hsr,
  load: { en: "Overall load (Player Load)", is: "Heildarálag (Player Load)" },
  dist: { en: "Distance", is: "Vegalengd" },
};
const WEEK_UNIT: Record<WeekKey, Bi> = {
  imaAccel: ENOUGH_UNIT.imaAccel, imaDecel: ENOUGH_UNIT.imaDecel, imaCod: ENOUGH_UNIT.imaCod, hsr: ENOUGH_UNIT.hsr,
  load: { en: "Player Load", is: "Player Load" }, dist: { en: "m", is: "m" },
};

/** Fewer players than this on a day = individual work, not a team session. */
export const MIN_SESSION_PLAYERS = 3;

export const WEEK_ENOUGH_CITATIONS = [
  "Stevens et al. 2017 — training load relative to match load per MD-day (the calendar's day shares)",
  "Martín-García et al. 2018 — load across the microcycle",
  "Training:match ratios — PMC6747517 (85% = enough)",
];

/** One calendar day as the plan has it (CalDay-compatible: only the fields read here). */
export type PlanDay = {
  type: string; md?: string;
  accel?: number | null; decel?: number | null; cod?: number | null; hsr: number | null; load: number | null; dist: number | null;
};
export type PlanWeek = { weekStart: string; isLight?: boolean; isDeload?: boolean; days: PlanDay[] };

/** One day's squad medians (from the range loader). */
export type ActualDay = {
  date: string;
  isMatch: boolean;
  /** Players with a full session that day. */
  players: number;
  med: Partial<Record<WeekKey, number | null>>;
  /** Of those, players who did not start the last match (< 60 min) — judged on a top-up day. */
  nonStarters: number;
  medNonStarter: Partial<Record<WeekKey, number | null>>;
};

export function plannedOf(d: PlanDay, k: WeekKey): number | null {
  switch (k) {
    case "imaAccel": return d.accel ?? null;
    case "imaDecel": return d.decel ?? null;
    case "imaCod": return d.cod ?? null;
    case "hsr": return d.hsr;
    case "load": return d.load;
    case "dist": return d.dist;
  }
}

export type DayRole = "counted" | "extra" | "no_data" | "topup_few" | "upcoming" | "off" | "match";
const FRIENDLY: Bi = { en: "Friendly", is: "Æfingaleikur" };
export type WeekDayRow = {
  date: string; type: string; role: DayRole; players: number;
  /** Mean % of plan over the judged movement types with data (null when not counted). */
  pct: number | null;
  byKey: Record<WeekKey, { planned: number | null; actual: number | null; counted: boolean }>;
  /** High-speed running had no GPS reading on a counted day (indoors) — left out for that day. */
  noGps: boolean;
};
export type WeekVarRow = { key: WeekKey; judged: boolean; planned: number | null; actual: number | null; pct: number | null; status: PvaStatus };
export type WeekEnoughState = "ok" | "no_plan" | "not_started" | "no_data";
export type WeekEnough = {
  state: WeekEnoughState;
  weekStart: string;
  inProgress: boolean;
  verdict: TeamVerdict | null;
  headline: Bi;
  facts: Bi[];
  counterfactual: Bi | null;
  overNote: Bi | null;
  vars: WeekVarRow[];
  days: WeekDayRow[];
  sessions: { planned: number; elapsed: number; withData: number; extra: number };
  /** Pre-season: the friendlies are in the week's total (planned = the plan's share of a match). */
  friendlies: boolean;
  confidence: { level: "high" | "moderate" | "low"; note: Bi };
};

export const DOW: Bi[] = [
  { en: "Mon", is: "Mán" }, { en: "Tue", is: "Þri" }, { en: "Wed", is: "Mið" }, { en: "Thu", is: "Fim" }, { en: "Fri", is: "Fös" }, { en: "Sat", is: "Lau" }, { en: "Sun", is: "Sun" },
];
export const DAY_TYPE_NAME: Record<string, Bi> = {
  mechanical: { en: "Mechanical", is: "Mekanískt" }, locomotive: { en: "Locomotive", is: "Hlaup" }, mixed: { en: "Mixed", is: "Blandað" },
  activation: { en: "Activation", is: "Virkjun" }, topup: { en: "Top-up", is: "Áfylling" }, match: { en: "Match", is: "Leikur" }, rest: { en: "Off", is: "Frí" },
};
export const VERDICT_FROM: Record<"enough" | "partly" | "short", TeamVerdict> = { enough: "yes", partly: "mostly", short: "no" };

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isShort = (s: PvaStatus) => s === "under" || s === "well_under";
const isOver = (s: PvaStatus) => s === "over" || s === "well_over";
const isSession = (t: string) => t !== "match" && t !== "rest";

export function listBi(items: Bi[], lang: "en" | "is"): string {
  const names = items.map((b) => b[lang]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${lang === "en" ? "and" : "og"} ${names[names.length - 1]}`;
}
const lower = (b: Bi): Bi => ({ en: b.en.toLowerCase(), is: b.is.toLowerCase() });

function emptyByKey(): WeekDayRow["byKey"] {
  return Object.fromEntries(WEEK_KEYS.map((k) => [k, { planned: null, actual: null, counted: false }])) as WeekDayRow["byKey"];
}

/** Day-type name for the text; a friendly when the week counts them. */
export function dayTypeName(type: string, friendlies: boolean): Bi {
  return friendlies && type === "match" ? FRIENDLY : DAY_TYPE_NAME[type] ?? { en: type, is: type };
}

/** The week's training against its plan. `today` (ISO): days before it count; today counts once it has data.
 *  `friendlies` (pre-season): the plan's week total includes the friendly (the pre-season plan fits the training days
 *  around it), so a friendly is compared like a session — planned = the plan's match-day numbers (a share of a match:
 *  partial minutes), done = the squad median that day. The league opener (`friendlies.opener`) is never one. */
export function buildWeekEnough(input: { week: PlanWeek; actual: ActualDay[]; today: string; friendlies?: { opener: string | null } | null }): WeekEnough {
  const { week, today } = input;
  const fr = input.friendlies ?? null;
  const isFriendly = (t: string, date: string) => !!fr && t === "match" && date !== fr.opener;
  const sess = (t: string, date: string) => isSession(t) || isFriendly(t, date);
  const byDate = new Map(input.actual.map((a) => [a.date, a]));
  const days: WeekDayRow[] = [];
  const sums: Record<WeekKey, { p: number; a: number; n: number }> = Object.fromEntries(WEEK_KEYS.map((k) => [k, { p: 0, a: 0, n: 0 }])) as Record<WeekKey, { p: number; a: number; n: number }>;
  let planned = 0, elapsed = 0, withData = 0, extra = 0, upcoming = 0;

  week.days.slice(0, 7).forEach((pd, i) => {
    const date = addDays(week.weekStart, i);
    const a = byDate.get(date) ?? null;
    const isS = sess(pd.type, date);
    // In the pre-season a game day is data too (a friendly); otherwise a match day is never a session.
    const has = !!a && (!a.isMatch || !!fr) && a.players >= MIN_SESSION_PLAYERS;
    const row: WeekDayRow = { date, type: pd.type, role: "off", players: a?.players ?? 0, pct: null, byKey: emptyByKey(), noGps: false };
    for (const k of WEEK_KEYS) row.byKey[k].planned = isS ? plannedOf(pd, k) : null;
    const done = date < today || (date === today && has);

    if ((pd.type === "match" && !isS) || (a?.isMatch && (!fr || date === fr.opener))) { row.role = "match"; days.push(row); return; }
    if (isS) {
      planned++;
      if (!done) { row.role = "upcoming"; upcoming++; days.push(row); return; }
      elapsed++;
      if (!has) { row.role = "no_data"; days.push(row); return; }
    } else if (!has || !done) { row.role = "off"; days.push(row); return; }

    // Top-up: the players who started the last match recover, so the others are compared.
    const topup = pd.type === "topup";
    if (topup && a!.nonStarters < MIN_SESSION_PLAYERS) { row.role = "topup_few"; withData++; days.push(row); return; }
    const med = topup ? a!.medNonStarter : a!.med;
    row.role = isS ? "counted" : "extra";
    if (row.role === "counted") withData++; else extra++;
    const pcts: number[] = [];
    for (const k of WEEK_KEYS) {
      const p = row.role === "extra" ? 0 : plannedOf(pd, k);
      const v = med[k] ?? null;
      row.byKey[k].actual = v;
      if (row.role === "extra") row.byKey[k].planned = 0;
      if (v == null) { if (k === "hsr" && p != null) row.noGps = true; continue; }
      if (p == null) continue;
      row.byKey[k].counted = true;
      sums[k].p += p; sums[k].a += v; sums[k].n++;
      if (isJudged(k) && p > 0) pcts.push((v / p) * 100);
    }
    row.pct = pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null;
    days.push(row);
  });

  const vars: WeekVarRow[] = WEEK_KEYS.map((k) => {
    const s = sums[k];
    const p = s.n ? s.p : null, act = s.n ? s.a : null;
    const { pct, status } = statusOf(p, act);
    return { key: k, judged: isJudged(k), planned: p == null ? null : Math.round(p), actual: act == null ? null : Math.round(act), pct, status };
  });
  const inProgress = upcoming > 0;
  const sessions = { planned, elapsed, withData, extra };
  const friendlyDays = days.map((d, i) => (isFriendly(d.type, d.date) ? i : -1)).filter((i) => i >= 0);
  const base = { weekStart: week.weekStart, inProgress, vars, days, sessions, friendlies: !!fr, counterfactual: null, overNote: null };

  if (planned === 0 && extra === 0) return { ...base, state: "no_plan", verdict: null, facts: [], headline: { en: "No training planned this week.", is: "Engin æfing skipulögð í vikunni." }, confidence: { level: "low", note: { en: "Nothing to compare.", is: "Ekkert til að bera saman." } } };
  if (elapsed === 0 && extra === 0) return { ...base, state: "not_started", verdict: null, facts: [], headline: { en: `Not started yet: ${planned} sessions planned.`, is: `Ekki byrjuð: ${planned} æfingar skipulagðar.` }, confidence: { level: "low", note: { en: "No session has happened yet.", is: "Engin æfing búin enn." } } };

  const judged = vars.filter((v) => v.judged && v.status !== "na");
  const raw = verdictOf(judged.map((v) => v.status), 1);
  if (!raw) {
    return { ...base, state: "no_data", verdict: null, facts: [], headline: { en: `No session data yet for the ${elapsed} planned session${elapsed === 1 ? "" : "s"} so far.`, is: `Engin gögn enn úr þeim ${elapsed} æfingum sem eru búnar.` }, confidence: { level: "low", note: { en: "Upload the Catapult sessions to get the week's read.", is: "Hladdu inn æfingunum úr Catapult til að fá mat vikunnar." } } };
  }
  const verdict = VERDICT_FROM[raw];
  const shortV = judged.filter((v) => isShort(v.status)).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  const overV = judged.filter((v) => isOver(v.status));
  const shortList = (lang: "en" | "is") => listBi(shortV.map((v) => lower(WEEK_LABEL[v.key])), lang);
  const soFar = inProgress;

  const headline: Bi = verdict === "yes"
    ? (soFar ? { en: `So far yes: on plan after ${withData + extra} of ${planned} sessions.`, is: `Já hingað til: á plani eftir ${withData + extra} af ${planned} æfingum.` }
      : { en: "Yes: the week hit its plan.", is: "Já: vikan náði planinu." })
    : verdict === "mostly"
      ? { en: `Mostly${soFar ? ", so far" : ""}: short on ${shortList("en")}.`, is: `Að mestu${soFar ? " hingað til" : ""}: vantar upp á ${shortList("is")}.` }
      : { en: `No${soFar ? ", not so far" : ""}: short on ${shortList("en")}.`, is: `Nei${soFar ? ", ekki hingað til" : ""}: vantar upp á ${shortList("is")}.` };

  const facts: Bi[] = [];
  // 1 — which movement types, by how much.
  if (shortV.length) {
    facts.push({
      en: `Under plan: ${shortV.map((v) => `${WEEK_LABEL[v.key].en.toLowerCase()} ${v.pct}%`).join(", ")}${judged.length > shortV.length ? `; the other ${judged.length - shortV.length} on plan or above` : ""}.`,
      is: `Undir plani: ${shortV.map((v) => `${WEEK_LABEL[v.key].is.toLowerCase()} ${v.pct}%`).join(", ")}${judged.length > shortV.length ? `; hinir ${judged.length - shortV.length} á plani eða yfir` : ""}.`,
    });
  } else {
    facts.push({ en: `All ${judged.length} movement types at 85% of plan or more.`, is: `Allir ${judged.length} hreyfiþættirnir í 85% af plani eða meira.` });
  }
  // 2 — the day that pulled the week down (so a total can't hide a day that fell away).
  const low = days.filter((d) => d.role === "counted" && d.pct != null && d.pct < 85).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];
  if (low) {
    const i = days.indexOf(low);
    const tn = dayTypeName(low.type, !!fr);
    facts.push({ en: `${DOW[i].en} (${tn.en}) was furthest under: ${low.pct}% of its plan.`, is: `${DOW[i].is} (${tn.is}) var lengst undir: ${low.pct}% af sínu plani.` });
  }
  // 3 — coverage: what is in the total and what is not.
  const nameDays = (role: DayRole) => days.map((d, i) => (d.role === role ? DOW[i] : null)).filter((x): x is Bi => x != null);
  const noData = nameDays("no_data"), extraDays = nameDays("extra"), few = nameDays("topup_few");
  const gpsDays = days.map((d, i) => (d.noGps ? DOW[i] : null)).filter((x): x is Bi => x != null);
  const parts: Bi[] = [{ en: `${withData} of ${elapsed} planned sessions with data`, is: `${withData} af ${elapsed} skipulögðum æfingum með gögn` }];
  const frCounted = friendlyDays.filter((i) => days[i].role === "counted").map((i) => DOW[i]);
  if (frCounted.length) parts.push({ en: `the friendly on ${listBi(frCounted, "en")} is in the total (planned as part of a match)`, is: `æfingaleikurinn ${listBi(frCounted, "is")} er í heildinni (planaður sem hluti af leik)` });
  if (noData.length) parts.push({ en: `no data from ${listBi(noData, "en")}, left out`, is: `engin gögn frá ${listBi(noData, "is")}, ekki talið` });
  if (few.length) parts.push({ en: `${listBi(few, "en")} top-up not judged (too few non-starters)`, is: `áfylling ${listBi(few, "is")} ekki metin (of fáir sem byrjuðu ekki)` });
  if (extraDays.length) parts.push({ en: `extra session on ${listBi(extraDays, "en")} (planned off), counted`, is: `aukaæfing ${listBi(extraDays, "is")} (planað frí), talin með` });
  if (gpsDays.length) parts.push({ en: `high-speed running not measured on ${listBi(gpsDays, "en")} (no GPS)`, is: `háhraðahlaup ekki mælt ${listBi(gpsDays, "is")} (ekkert GPS)` });
  facts.push({ en: `${parts.map((p) => p.en).join("; ")}.`, is: `${parts.map((p) => p.is).join("; ")}.` });

  let counterfactual: Bi | null = null;
  const cf = shortV[0];
  if (cf && cf.planned != null && cf.actual != null) {
    const need = Math.max(1, Math.ceil(cf.planned * 0.85 - cf.actual));
    const flip = shortV.length === 1 && verdict === "mostly";
    counterfactual = {
      en: `~${need.toLocaleString("en-US")} more ${WEEK_UNIT[cf.key].en} for a typical player across the week would have brought ${WEEK_LABEL[cf.key].en.toLowerCase()} to plan${flip ? ", and made this a yes" : ""}.`,
      is: `~${need.toLocaleString("en-US")} ${WEEK_UNIT[cf.key].is} í viðbót hjá dæmigerðum leikmanni yfir vikuna hefðu náð planinu í ${WEEK_LABEL[cf.key].is.toLowerCase()}${flip ? ", og gert þetta að jái" : ""}.`,
    };
  }
  const overNote: Bi | null = overV.length
    ? { en: `Above plan: ${overV.map((v) => `${WEEK_LABEL[v.key].en.toLowerCase()} ${v.pct}%`).join(", ")}. A note, not a fail.`, is: `Yfir plani: ${overV.map((v) => `${WEEK_LABEL[v.key].is.toLowerCase()} ${v.pct}%`).join(", ")}. Athugasemd, ekki fall.` }
    : null;

  const ratio = elapsed ? withData / elapsed : 1;
  const level: "high" | "moderate" | "low" = ratio >= 1 && withData + extra >= 2 && !gpsDays.length && judged.length >= 3 ? "high" : ratio >= 0.66 && judged.length >= 2 ? "moderate" : "low";
  const confidence = {
    level,
    note: {
      en: `${withData} of ${elapsed} planned sessions with data · ${judged.length} of ${WEEK_JUDGED.length} movement types measured · squad medians of full sessions.`,
      is: `${withData} af ${elapsed} skipulögðum æfingum með gögn · ${judged.length} af ${WEEK_JUDGED.length} hreyfiþáttum mældir · miðgildi hópsins á fullum æfingum.`,
    },
  };
  return { ...base, state: "ok", verdict, headline, facts: facts.slice(0, 3), counterfactual, overNote, confidence };
}

export type BlockEnough = {
  verdict: TeamVerdict | null;
  line: Bi;
  finished: number;
  hit: number;
  weeks: Array<{ weekNo: number; weekStart: string; verdict: TeamVerdict | null; inProgress: boolean }>;
  /** The block's totals per variable (every counted day of every week). */
  vars: WeekVarRow[];
};

/** The block from its weeks: how many finished weeks hit the plan, the first one that didn't, and the totals. Null
 *  when no week has a verdict yet. */
export function buildBlockEnough(weeks: Array<{ weekNo: number; enough: WeekEnough }>): BlockEnough | null {
  const rated = weeks.filter((w) => w.enough.state === "ok" && w.enough.verdict);
  if (!rated.length) return null;
  const finished = rated.filter((w) => !w.enough.inProgress);
  const hit = finished.filter((w) => w.enough.verdict === "yes").length;
  const firstShort = finished.find((w) => w.enough.verdict !== "yes");
  const current = rated.find((w) => w.enough.inProgress) ?? null;

  const sums: Record<WeekKey, { p: number; a: number; n: number }> = Object.fromEntries(WEEK_KEYS.map((k) => [k, { p: 0, a: 0, n: 0 }])) as Record<WeekKey, { p: number; a: number; n: number }>;
  for (const w of rated) for (const v of w.enough.vars) if (v.planned != null && v.actual != null) { sums[v.key].p += v.planned; sums[v.key].a += v.actual; sums[v.key].n++; }
  const vars: WeekVarRow[] = WEEK_KEYS.map((k) => {
    const s = sums[k]; const p = s.n ? s.p : null, a = s.n ? s.a : null;
    const { pct, status } = statusOf(p, a);
    return { key: k, judged: isJudged(k), planned: p, actual: a, pct, status };
  });
  const raw = verdictOf(vars.filter((v) => v.judged).map((v) => v.status), 1);

  const word = (v: TeamVerdict | null): Bi => (v === "yes" ? { en: "on plan", is: "á plani" } : v === "mostly" ? { en: "mostly on plan", is: "að mestu á plani" } : { en: "short of plan", is: "undir plani" });
  const shortOf = (w: { enough: WeekEnough }) => w.enough.vars.filter((v) => v.judged && isShort(v.status)).map((v) => lower(WEEK_LABEL[v.key]));
  let line: Bi;
  if (finished.length) {
    const fs = firstShort ? shortOf(firstShort) : [];
    line = {
      en: `${hit} of ${finished.length} finished week${finished.length === 1 ? "" : "s"} hit the plan${firstShort && fs.length ? `; week ${firstShort.weekNo} was short on ${listBi(fs, "en")}` : ""}${current ? `; week ${current.weekNo} so far ${word(current.enough.verdict).en}` : ""}.`,
      is: `${hit} af ${finished.length} liðnum vikum náðu planinu${firstShort && fs.length ? `; vika ${firstShort.weekNo}: vantaði upp á ${listBi(fs, "is")}` : ""}${current ? `; vika ${current.weekNo} hingað til ${word(current.enough.verdict).is}` : ""}.`,
    };
  } else {
    line = { en: `Week ${current!.weekNo} so far ${word(current!.enough.verdict).en}.`, is: `Vika ${current!.weekNo} hingað til ${word(current!.enough.verdict).is}.` };
  }
  return {
    verdict: raw ? VERDICT_FROM[raw] : null, line, finished: finished.length, hit,
    weeks: weeks.map((w) => ({ weekNo: w.weekNo, weekStart: w.enough.weekStart, verdict: w.enough.state === "ok" ? w.enough.verdict : null, inProgress: w.enough.inProgress })),
    vars,
  };
}
