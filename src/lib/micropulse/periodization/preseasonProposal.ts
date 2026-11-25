/**
 * "Build pre-season" — the whole pre-season proposal from the system's existing rules and the team's own
 * data, as ONE pure function. The hub's Pre-season tab renders it, the proposal route stores it as a draft
 * the coach edits and accepts. Nothing here is a new rule: it composes
 *
 *   upcomingPreseason → preseasonMeso + sliceByLengths (backwards from the opener)
 *   → preseasonBlockForWeeksOut (gym emphasis per block) → preseasonRamp (week 1 re-entry → build)
 *   → buildCalendarBlock (day types, MD labels, loads) → recommendTestingSchedule.
 *
 * "His choice stands": every setting the coach saved (sessions/week, week-1 ×match, per-KPI week 1, the
 * blocks nearest the opener, any day he set in Week Setup) goes in as-is and is tagged `coach`; the rest is
 * filled by the rule and tagged `rule`, with its reason and citation. A number without a study behind it is
 * labelled a MicroPulse line. What's missing is named in `gaps`, never guessed.
 *
 * Rules decide; nothing here is AI. Descriptive load planning — never the readiness colour.
 */

import { buildCalendarBlock, sliceByLengths, FREE_WEEK, type Bi, type CalType, type CalendarBlock, type MatchUnit, type MatchUnitAbs } from "./index";
import { preseasonMatchExposure, defaultPeakMultiple, type PreseasonWeekTarget, type Confidence } from "./preseasonStart";
import { upcomingPreseason, preseasonMeso, preseasonAnchor, preseasonRamp, preseasonSettingsFrom, type PreseasonSavedRow, type PreseasonSettings, type PreseasonWindow, type PreseasonAnchor, PRESEASON_TAPER_RESEARCH } from "./preseasonWindow";
import { recommendTestingSchedule, type AerobicMode, type TestPlan } from "./testingSchedule";
import { fitWeekToTarget } from "./preseasonDayFit";
import { preseasonBlockForWeeksOut } from "../strengthProgramming/seasonPhaseStrength";
import type { PreseasonEmphasis } from "../strengthProgramming/preseasonEmphasis";

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const isoAdd = (iso: string, d: number) => new Date(ms(iso) + d * DAY).toISOString().slice(0, 10);
const weeksBetween = (a: string, b: string) => Math.max(1, Math.round((ms(b) - ms(a)) / (7 * DAY)));

// Reverse of the focus label Week Setup writes (week_plans.focus, e.g. "MD-5 Mechanical") → the day type.
export function caltypeFromFocus(focus: string): CalType | undefined {
  const f = focus.toLowerCase();
  if (f.includes("mechanical")) return "mechanical";
  if (f.includes("locomotive")) return "locomotive";
  if (f.includes("mixed")) return "mixed";
  if (f.includes("activation")) return "activation";
  if (f.includes("top-up") || f.includes("topup") || f.includes("áfyll")) return "topup";
  return undefined;
}

export type SavedDay = { dayType: string; focus: string | null };
export type CampRegion = { start: string; end: string; loadPct: number; twoADay: boolean };

export type PreseasonProposalInput = {
  phases: Array<{ key: string; start: string; end: string; weeks: number }>;
  today: string;
  nextFirstFixture?: string | null;
  /** The opener is an ESTIMATE (last season's + 1 year) — named as a gap. */
  nextFirstFixtureEstimated?: boolean;
  /** The coach set the pre-season start date himself (season_plans.overrides.nextPreseasonStart). */
  startSetByCoach?: boolean;
  /** The saved row for the season this pre-season opens; null/undefined = nothing saved. */
  saved: PreseasonSavedRow;
  /** Ignore the coach's saved choices and days (the "start from scratch" build). */
  fromScratch?: boolean;
  /** Settings to use instead of the saved row (the hub's live state). Saved flags still come from `saved`. */
  settingsOverride?: Pick<PreseasonSettings, "sessionsPerWeek" | "week1MatchMultiple" | "week1Kpi" | "mesoTail" | "taperPct" | "gamesFrom">;
  matchUnits: MatchUnit[];
  matchLoad: number | null;
  matchSrpe: number | null;
  loadSource: string;
  /** The calendar's absolute match unit (the hub's team unit). */
  unit: MatchUnitAbs;
  fixtures: string[];
  camps?: CampRegion[];
  /** The coach's saved days (week_plans) keyed by ISO date — only those inside the window are read. */
  savedDays?: Record<string, SavedDay>;
  /** Meso cadence (4/5/6 weeks) — the length of the base blocks. */
  cadence: number;
  baseOverloadPct?: number;
  stepPct?: number;
  aerobicMode?: AerobicMode | null;
  hasVald?: boolean;
};

export type ProposalSource = "coach" | "rule";
export type ProposalChoice = {
  key: "start" | "length" | "sessionsPerWeek" | "week1MatchMultiple" | "peak" | "taper" | "gamesFrom" | "week1Kpi" | "blocks" | "days" | "tests";
  label: Bi;
  value: Bi;
  source: ProposalSource;
  reason: Bi;
  /** Short citation(s) behind the rule, resolvable via references/ruleRefs. */
  cite?: string;
  /** The number is MicroPulse's own line, not taken from a study. */
  micropulseLine?: boolean;
};

export type ProposalBlock = { index: number; start: string; end: string; weeks: number; emphasis: PreseasonEmphasis | null; source: ProposalSource };
export type ProposalWeek = {
  weekIndex: number;
  weekStart: string;
  /** The calendar week's load multiple and unload flag (what Week Setup's week_setups row carries). */
  mult: number;
  isDeload: boolean;
  emphasis: PreseasonEmphasis | null;
  target: PreseasonWeekTarget;
  friendlies: string[];
  tests: string[];
  days: Array<{ date: string; type: CalType; md: string; label: Bi; load: number | null; coachSet: boolean }>;
};

export type PreseasonProposal = {
  window: PreseasonWindow & { end: string };
  verdict: Bi;
  facts: Bi[];
  confidence: { level: Confidence; anchor: PreseasonAnchor["anchor"]; coachChoices: number; totalChoices: number; note: Bi };
  choices: ProposalChoice[];
  weeks: ProposalWeek[];
  blocks: ProposalBlock[];
  tests: Array<{ key: string; name: Bi; weeks: number[]; priority: TestPlan["priority"]; cite: string }>;
  gaps: Bi[];
  settings: PreseasonSettings;
  /** Raw engine pieces the hub renders from (not stored with a draft). */
  engine: { ramp: PreseasonWeekTarget[]; cal: CalendarBlock; meso: { lens: number[]; base: number[]; tail: number[] }; blocks: Array<{ start: string; end: string; index: number }>; tests: TestPlan[]; fixtures: string[]; anchor: PreseasonAnchor };
};

const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const dEn = (iso: string) => `${Number(iso.slice(8, 10))} ${MON_EN[Number(iso.slice(5, 7)) - 1]}`;
const dIs = (iso: string) => `${Number(iso.slice(8, 10))}. ${MON_IS[Number(iso.slice(5, 7)) - 1]}`;
const num = (n: number, is: boolean) => (is ? String(n).replace(".", ",") : String(n));

export const EMPHASIS_LABEL: Partial<Record<PreseasonEmphasis, Bi>> = {
  hypertrophy: { en: "tissue base", is: "vefjagrunnur" },
  max_strength: { en: "max strength", is: "hámarksstyrkur" },
  power: { en: "power", is: "afl" },
};

/** Build the pre-season proposal. Returns null when there's no pre-season to plan (no phases yet). */
export function buildPreseasonProposal(input: PreseasonProposalInput): PreseasonProposal | null {
  const up = upcomingPreseason(input.phases, input.today, input.nextFirstFixture);
  if (!up) return null;
  const preStart = up.start, preWeeks = up.weeks;
  const preEndMs = ms(preStart) + preWeeks * 7 * DAY;
  const preEndIso = up.end ?? new Date(preEndMs).toISOString().slice(0, 10);
  const inWindow = (iso: string) => iso >= preStart && ms(iso) < preEndMs;

  // The coach's choices (or none, from scratch). A live override (the hub's state) wins for the numbers.
  const savedSettings = preseasonSettingsFrom(input.fromScratch ? null : input.saved);
  const settings: PreseasonSettings = input.settingsOverride && !input.fromScratch
    ? { ...savedSettings, ...input.settingsOverride }
    : savedSettings;

  // Load: own match unit (else the normative reference) → week-by-week ramp.
  const anchor = preseasonAnchor({ matchUnits: input.matchUnits, matchLoad: input.matchLoad, matchSrpe: input.matchSrpe, loadSource: input.loadSource });
  const ramp = preseasonRamp(anchor, input.matchSrpe, preWeeks, settings);

  // Days: friendlies in the window are match days; the coach's saved days go in as-is.
  const fixtures = (input.fixtures ?? []).filter(inWindow).sort();
  const offDays: string[] = [], onDays: string[] = [], typeOv: Record<string, CalType> = {};
  const coachDays = new Set<string>();
  const fixtureSet = new Set(input.fixtures ?? []);
  if (!input.fromScratch) {
    for (const [iso, sp] of Object.entries(input.savedDays ?? {})) {
      if (!inWindow(iso)) continue;
      if (fixtureSet.has(iso)) continue; // a game in the fixtures wins over a saved training / off day
      if (sp.dayType === "OFF") { offDays.push(iso); coachDays.add(iso); }
      else if (sp.dayType === "TRAIN" || sp.dayType === "RECOVERY") {
        onDays.push(iso); coachDays.add(iso);
        const ct = sp.focus ? caltypeFromFocus(sp.focus) : undefined;
        if (ct) typeOv[iso] = ct;
      }
    }
  }
  const calOpts = (matchDates: string[], allFixtures: string[], noAutoMatch = false, extraOn: string[] = [], extraTy: Record<string, CalType> = {}) => buildCalendarBlock({
    unit: input.unit, startDate: preStart, numWeeks: preWeeks, scopeName: "__team__", phase: { en: "Pre-season", is: "Undirbúningur" },
    baseOverloadPct: input.baseOverloadPct ?? 100, stepPct: input.stepPct ?? 5, matchDates, offDays, onDays: [...onDays, ...extraOn], typeOverrides: { ...extraTy, ...typeOv },
    allFixtures, matchExposure: (wi) => preseasonMatchExposure(wi + 1, preWeeks), camps: input.camps ?? [], noAutoMatch,
  });
  // Games come from the fixtures. From the coach's "weekend games from" date on, a week with no game entered
  // gets the calendar's assumed weekend game; before it (and when no date is set) a week without a game is a
  // training week. The assumed games also label the days (MD-3, MD+1…). The user's rule, 2026-11-25.
  const gamesFrom = settings.gamesFrom;
  const autoCal = calOpts([], input.fixtures ?? []);
  const matchIn = (cal: CalendarBlock) => cal.weeks.flatMap((w) => w.days.map((d, di) => (d.type === "match" ? isoAdd(w.weekStart, di) : null))).filter((d): d is string => d != null);
  const hasFriendly = (weekStart: string) => fixtures.some((d) => d >= weekStart && d < isoAdd(weekStart, 7));
  const assumed = gamesFrom
    ? matchIn(autoCal).filter((d) => d >= gamesFrom && !fixtures.includes(d) && !hasFriendly(isoAdd(preStart, Math.floor((ms(d) - ms(preStart)) / (7 * DAY)) * 7)))
    : [];
  const matchDates = [...fixtures, ...assumed].sort();
  const allFx = Array.from(new Set([...(input.fixtures ?? []), ...matchDates])).sort();
  const cal0 = calOpts(matchDates, allFx, true);
  // A week with no game has nothing to build towards and would plan empty: it gets the calendar's existing
  // no-match week (FREE_WEEK — the build-up week, on the match week's day order), keeping the two days after a
  // game off and every day the coach set. Its days carry no MD label (there is no match day to count from).
  const justPlayed = (iso: string) => [1, 2].some((n) => allFx.includes(isoAdd(iso, -n)));
  const freeWeeks = new Set(cal0.weeks.filter((w) => !w.days.some((d) => d.type === "match")).map((w) => w.weekStart));
  const freeOn: string[] = [], freeTy: Record<string, CalType> = {};
  for (const ws of freeWeeks) FREE_WEEK.forEach((t, i) => {
    const iso = isoAdd(ws, i);
    if (t === "rest" || coachDays.has(iso) || justPlayed(iso) || !inWindow(iso)) return;
    freeOn.push(iso); freeTy[iso] = t;
  });
  const cal1 = freeOn.length ? calOpts(matchDates, allFx, true, freeOn, freeTy) : cal0;
  const rawCal: CalendarBlock = { ...cal1, weeks: cal1.weeks.map((w) => (freeWeeks.has(w.weekStart) ? { ...w, days: w.days.map((d) => ({ ...d, md: "" })) } : w)) };
  // Each week's days sum to the week's planned total, per variable: the friendly counts as it is and the
  // training days share the rest in the calendar's proportions — add a session and the others get lighter.
  // The taper week (last, light) is fitted to the ramp's taper total like any other week.
  const cal: CalendarBlock = { ...rawCal, weeks: rawCal.weeks.map((w, i) => (ramp[i] ? fitWeekToTarget(w, ramp[i], input.unit).week : w)) };

  // Meso blocks, planned backwards: the coach's tail (nearest the opener) is exact, the base absorbs the rest.
  const cadence = Math.max(2, Math.round(input.cadence));
  const autoPre = sliceByLengths(preStart, preEndIso, cadence, {}, 0);
  const autoTail = autoPre.slice(1).map((b) => Math.max(2, weeksBetween(b.start, b.end)));
  const tail = settings.mesoTail ?? autoTail;
  const meso = preseasonMeso(preWeeks, tail, cadence);
  const lensMap: Record<string, number> = {};
  meso.lens.forEach((n, i) => { lensMap[String(i)] = n; });
  const sliced = sliceByLengths(preStart, preEndIso, cadence, lensMap, 0);
  const tailSource: ProposalSource = settings.saved.mesoTail && !input.fromScratch ? "coach" : "rule";
  const blocks: ProposalBlock[] = sliced.map((b, i) => ({
    index: b.index, start: b.start, end: b.end, weeks: weeksBetween(b.start, b.end),
    emphasis: preseasonBlockForWeeksOut(weeksBetween(b.start, preEndIso)),
    source: i >= meso.base.length ? tailSource : "rule",
  }));

  // Testing schedule (VALD / GPS gated add-ons).
  const testPlans = recommendTestingSchedule({ preseasonWeeks: preWeeks, hasGps: input.loadSource === "gps", hasVald: !!input.hasVald, aerobicMode: input.aerobicMode ?? null });

  // Week cards.
  const weeks: ProposalWeek[] = ramp.map((w, i) => {
    const cw = cal.weeks[i];
    const weekStart = cw?.weekStart ?? isoAdd(preStart, i * 7);
    return {
      weekIndex: i + 1, weekStart, mult: cw?.mult ?? 1, isDeload: !!cw?.isDeload,
      emphasis: preseasonBlockForWeeksOut(preWeeks - i),
      target: w,
      friendlies: fixtures.filter((d) => d >= weekStart && d < isoAdd(weekStart, 7)),
      tests: testPlans.filter((tp) => tp.weeks.includes(i + 1)).map((tp) => tp.protocol.key),
      days: (cw?.days ?? []).map((d, di) => {
        const date = isoAdd(weekStart, di);
        return { date, type: d.type, md: d.md, label: d.label, load: d.load, coachSet: coachDays.has(date) };
      }),
    };
  });

  // ─── Provenance: each choice, coach's or the rule's ───
  // The build's top (the week before the taper); the last week itself is the light taper week.
  const peak = (ramp.length ? Math.max(...ramp.map((w) => w.multipleOfMatch ?? 0)) || null : null) ?? defaultPeakMultiple(settings.sessionsPerWeek);
  const taperRow = ramp.find((w) => w.taper) ?? null;
  const coach = (flag: boolean): ProposalSource => (flag && !input.fromScratch ? "coach" : "rule");
  const end = up.end ?? preEndIso;
  const choices: ProposalChoice[] = [
    {
      key: "start", label: { en: "Starts", is: "Hefst" }, value: { en: dEn(preStart), is: dIs(preStart) },
      source: input.startSetByCoach ? "coach" : "rule",
      reason: input.startSetByCoach ? { en: "The date you set.", is: "Dagsetningin sem þú settir." } : { en: "The day the off-season ends.", is: "Daginn sem undirbúningshléi lýkur." },
    },
    {
      key: "length", label: { en: "Length", is: "Lengd" }, value: { en: `${preWeeks} weeks`, is: `${preWeeks} vikur` }, source: "rule",
      reason: up.end
        ? { en: `Runs to the first competitive game, ${dEn(end)}.`, is: `Nær að fyrsta keppnisleik, ${dIs(end)}.` }
        : { en: "No first game entered — the length of last pre-season.", is: "Enginn fyrsti leikur skráður — lengd síðasta undirbúnings." },
    },
    {
      key: "sessionsPerWeek", label: { en: "Sessions a week", is: "Æfingar á viku" }, value: { en: String(settings.sessionsPerWeek), is: String(settings.sessionsPerWeek) },
      source: coach(settings.saved.sessionsPerWeek),
      reason: settings.saved.sessionsPerWeek && !input.fromScratch ? { en: "Your number.", is: "Þín tala." } : { en: "The default for a pre-season week.", is: "Sjálfgefið fyrir undirbúningsviku." },
      micropulseLine: !(settings.saved.sessionsPerWeek && !input.fromScratch),
    },
    {
      key: "week1MatchMultiple", label: { en: "Week 1 load", is: "Álag viku 1" }, value: { en: `${settings.week1MatchMultiple}× a match`, is: `${num(settings.week1MatchMultiple, true)}× leikur` },
      source: coach(settings.saved.week1MatchMultiple),
      reason: { en: "A controlled return after the break: start low, build gradually.", is: "Stýrð endurkoma eftir fríið: byrja lágt og byggja upp jafnt og þétt." },
      cite: "Gabbett 2016", micropulseLine: true,
    },
    {
      key: "peak", label: { en: "Peak load", is: "Mesta álag" }, value: { en: `${peak}× a match`, is: `${num(peak, true)}× leikur` }, source: "rule",
      reason: { en: `The pre-season build for ${settings.sessionsPerWeek} sessions a week; high-speed and braking load rise later than distance.`, is: `Uppbygging undirbúnings fyrir ${settings.sessionsPerWeek} æfingar á viku; hraðahlaup og hemlun hækka seinna en vegalengd.` },
      cite: "Teixeira 2021; Vanrenterghem 2017", micropulseLine: true,
    },
    ...(preWeeks >= 3 ? [{
      key: "taper" as const, label: { en: "Week before the opener", is: "Vikan fyrir fyrsta leik" },
      value: taperRow
        ? { en: `Light: −${settings.taperPct}% (${taperRow.multipleOfMatch}× a match)`, is: `Létt: −${settings.taperPct}% (${num(taperRow.multipleOfMatch ?? 0, true)}× leikur)` }
        : { en: "No light week", is: "Engin létt vika" },
      source: coach(settings.saved.taperPct),
      reason: {
        en: `Research: the best taper cuts volume ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% and keeps intensity. The whole week is cut by one factor, so each variable keeps its own share (sprint < high-speed < distance ≤ accelerations).`,
        is: `Rannsóknir: besta létta vikan sker magn um ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% og heldur ákefð. Öll vikan lækkar um sama hlutfall, svo hver breyta heldur sínu hlutfalli (sprettur < hraðahlaup < vegalengd ≤ hraðanir).`,
      },
      cite: "Bosquet 2007; Mujika & Padilla 2003; Clemente 2019c; Gualtieri 2023", micropulseLine: !(settings.saved.taperPct && !input.fromScratch),
    }] : []),
    {
      key: "gamesFrom", label: { en: "Weekend games from", is: "Leikir um helgar frá" },
      value: gamesFrom ? { en: dEn(gamesFrom), is: dIs(gamesFrom) } : { en: "Not set — entered games only", is: "Ekki stillt — aðeins skráðir leikir" },
      source: coach(settings.saved.gamesFrom),
      reason: gamesFrom
        ? { en: `From ${dEn(gamesFrom)} every week without an entered game gets a weekend game; before it, weeks without a game are training weeks.`, is: `Frá ${dIs(gamesFrom)} fær hver vika án skráðs leiks leik um helgi; fyrir þann dag eru vikur án leiks æfingavikur.` }
        : { en: "Only the games in the fixtures. Set a date to add a weekend game every week from it.", is: "Aðeins leikirnir í leikjaskránni. Settu dagsetningu til að fá leik um hverja helgi frá henni." },
    },
    {
      key: "week1Kpi", label: { en: "Week 1 per variable", is: "Vika 1 á hverja breytu" },
      value: settings.saved.week1Kpi && !input.fromScratch ? { en: `${Object.keys(settings.week1Kpi).length} set by you`, is: `${Object.keys(settings.week1Kpi).length} stillt af þér` } : { en: "From the week 1 load", is: "Út frá álagi viku 1" },
      source: coach(settings.saved.week1Kpi),
      reason: { en: "Distance starts higher than sprinting and braking, which return more carefully.", is: "Vegalengd byrjar hærra en sprettir og hemlun, sem koma varlegar inn." },
      cite: "Jeong 2011; Harper 2022",
    },
    {
      key: "blocks", label: { en: "Blocks", is: "Lotur" },
      value: { en: blocks.map((b) => `${b.weeks} wk ${b.emphasis ? EMPHASIS_LABEL[b.emphasis]?.en ?? "" : ""}`.trim()).join(" → "), is: blocks.map((b) => `${b.weeks} v ${b.emphasis ? EMPHASIS_LABEL[b.emphasis]?.is ?? "" : ""}`.trim()).join(" → ") },
      source: tailSource,
      reason: tailSource === "coach"
        ? { en: "Your blocks nearest the first game; the first block takes the remaining weeks.", is: "Þínar lotur næst fyrsta leik; fyrsta lotan tekur vikurnar sem eftir eru." }
        : { en: `Planned backwards from the first game in ${cadence}-week blocks: tissue base far out, max strength in the middle, power last.`, is: `Skipulagt aftur á bak frá fyrsta leik í ${cadence} vikna lotum: vefjagrunnur fyrst, hámarksstyrkur í miðjunni, afl síðast.` },
      cite: "Issurin 2010",
    },
    {
      key: "days", label: { en: "Days", is: "Dagar" },
      value: coachDays.size ? { en: `${coachDays.size} set by you, the rest filled`, is: `${coachDays.size} stilltir af þér, restin fyllt` } : { en: "All filled by the rules", is: "Allir fylltir eftir reglum" },
      source: coachDays.size ? "coach" : "rule",
      reason: { en: "Friendlies fixed; around them the day types follow the match-day rules (MD+1 recovery, no long run of hard days).", is: "Æfingaleikir fastir; í kringum þá fylgja dagarnir leikdagsreglunum (MD+1 endurheimt, ekki margir erfiðir dagar í röð)." },
    },
    {
      key: "tests", label: { en: "Testing", is: "Mælingar" },
      value: { en: `${testPlans.filter((t) => t.priority === "core").length} core tests`, is: `${testPlans.filter((t) => t.priority === "core").length} grunnmælingar` }, source: "rule",
      reason: testPlans.some((t) => t.weeks.length >= preWeeks && preWeeks > 1)
        ? { en: "Baseline in week 1, re-test at block changes, plus a weekly check.", is: "Grunnmæling í viku 1, endurmæling við lotuskipti og vikuleg mæling." }
        : { en: "Baseline in week 1, re-test at block changes and at the end.", is: "Grunnmæling í viku 1, endurmæling við lotuskipti og í lokin." },
      cite: Array.from(new Set(testPlans.filter((t) => t.priority === "core").map((t) => t.protocol.cite))).join("; "),
    },
  ];

  // ─── Gaps: named, never guessed ───
  const gaps: Bi[] = [];
  if (!anchor.hasOwnKpi) gaps.push({ en: "No match data of your own yet — the loads are reference values for adult football. Set week 1 per variable, or add GPS.", is: "Engin eigin leikgögn enn — álagið eru viðmiðunargildi fyrir fullorðinsfótbolta. Stilltu viku 1 á hverja breytu eða bættu við GPS." });
  if (!up.end) gaps.push({ en: "First competitive game not entered — the length is last pre-season's.", is: "Fyrsti keppnisleikur ekki skráður — lengdin er lengd síðasta undirbúnings." });
  else if (input.nextFirstFixtureEstimated) gaps.push({ en: `First game is an estimate (${dEn(end)}) — enter the real date and the plan re-flows.`, is: `Fyrsti leikur er áætlaður (${dIs(end)}) — skráðu rétta dagsetningu og planið uppfærist.` });
  const assumedMatches = assumed.length;
  if (fixtures.length === 0) gaps.push(assumedMatches
    ? { en: `No friendlies entered — the calendar assumes a weekend game in ${assumedMatches} weeks from ${dEn(gamesFrom!)}. Enter the friendlies and the days re-flow around them.`, is: `Engir æfingaleikir skráðir — dagatalið gerir ráð fyrir leik um helgi í ${assumedMatches} vikum frá ${dIs(gamesFrom!)}. Skráðu æfingaleikina og dagarnir raðast í kringum þá.` }
    : { en: "No games in the pre-season: enter the friendlies, or set \"Weekend games from\".", is: "Engir leikir í undirbúningnum: skráðu æfingaleikina eða stilltu „Leikir um helgar frá“." });

  // ─── The layered read ───
  const w1 = ramp[0]?.multipleOfMatch ?? settings.week1MatchMultiple;
  const verdict: Bi = {
    en: `${preWeeks}-week pre-season, ${dEn(preStart)} → ${dEn(end)}, ${settings.sessionsPerWeek} sessions a week, load from ${w1}× to ${peak}× a match${taperRow ? ", then a light week before the opener" : ""}.`,
    is: `${preWeeks} vikna undirbúningur, ${dIs(preStart)} → ${dIs(end)}, ${settings.sessionsPerWeek} æfingar á viku, álag úr ${num(w1, true)}× í ${num(peak, true)}× leik${taperRow ? ", svo létt vika fyrir fyrsta leik" : ""}.`,
  };
  const testWeeks = Array.from(new Set(testPlans.filter((t) => t.priority === "core" && t.weeks.length < preWeeks).flatMap((t) => t.weeks))).sort((a, b) => a - b);
  const facts: Bi[] = [
    anchor.hasOwnKpi
      ? { en: "Built on your own match load: every week is a multiple of one of your matches.", is: "Byggt á ykkar eigin leikálagi: hver vika er margfeldi af einum leik hjá ykkur." }
      : { en: "No match data yet, so the loads are reference values you adjust.", is: "Engin leikgögn enn, svo álagið eru viðmiðunargildi sem þú lagar." },
    { en: `${blocks.length} blocks: ${choices.find((c) => c.key === "blocks")!.value.en}, ending at the first game.`, is: `${blocks.length} lotur: ${choices.find((c) => c.key === "blocks")!.value.is}, sem enda á fyrsta leik.` },
    { en: `Testing in week${testWeeks.length === 1 ? "" : "s"} ${testWeeks.join(", ")}${fixtures.length ? `; ${fixtures.length} friendl${fixtures.length === 1 ? "y" : "ies"} in the plan` : ""}${assumedMatches ? `; ${assumedMatches} assumed weekend game${assumedMatches === 1 ? "" : "s"}` : ""}.`, is: `Mælingar í viku ${testWeeks.join(", ")}${fixtures.length ? `; ${fixtures.length} æfingaleik${fixtures.length === 1 ? "ur" : "ir"} í planinu` : ""}${assumedMatches ? `; ${assumedMatches} ${assumedMatches === 1 ? "áætlaður helgarleikur" : "áætlaðir helgarleikir"}` : ""}.` },
  ];

  const coachChoices = choices.filter((c) => c.source === "coach").length;
  const level: Confidence = ramp[0]?.confidence ?? "low";
  const confidence = {
    level, anchor: anchor.anchor, coachChoices, totalChoices: choices.length,
    note: level === "high"
      ? { en: "High: built on your own matches.", is: "Há: byggt á ykkar eigin leikjum." }
      : { en: "Low: reference values until you have match data.", is: "Lág: viðmiðunargildi þar til leikgögn eru komin." },
  };

  return {
    window: { start: preStart, weeks: preWeeks, end },
    verdict, facts, confidence, choices, weeks, blocks,
    tests: testPlans.map((tp) => ({ key: tp.protocol.key, name: tp.protocol.name, weeks: tp.weeks, priority: tp.priority, cite: tp.protocol.cite })),
    gaps, settings,
    engine: { ramp, cal, meso, blocks: sliced, tests: testPlans, fixtures, anchor },
  };
}
