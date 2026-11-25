/**
 * "Build macro" — the season's dates as one draft the coach changes, then uses (same base as "Build
 * pre-season": plan_proposals, draft → accept).
 *
 * The dates come from the rules the hub already uses (detectSeasonPhases): pre-season starts 6 weeks before
 * the first competitive game (or where the team's training data starts), the season ends at the last
 * competitive game, the off-season starts the day after, and lasts 10 weeks unless the coach says otherwise
 * (then the next pre-season starts). The coach's saved dates stand; the rule fills the rest. Pure: no I/O.
 *
 * Accept writes the dates the coach set; the rest keep following the rule, so new fixtures still move them. The
 * season end is also written once the season's last game has been played (then it is final) — a fixture list
 * that is still coming in would pin a wrong end. Descriptive planning — never the readiness colour.
 */

type Bi = { en: string; is: string };
export type MacroKey = "preseasonStart" | "seasonEnd" | "offseasonStart" | "nextPreseasonStart";
export type MacroEdits = Partial<Record<MacroKey, string | null>>;
export type MacroSaved = Partial<Record<MacroKey, string | null>> & { offseasonWeeks?: number | null };

export type MacroDate = {
  key: MacroKey | "opener";
  label: Bi;
  value: string | null;
  source: "coach" | "rule" | "fixtures";
  editable: boolean;
  reason: Bi;
};

export type MacroProposal = {
  scope: "macro";
  seasonYear: number;
  verdict: Bi;
  facts: Bi[];
  confidence: { level: "high" | "moderate" | "low"; note: Bi; coachChoices: number; totalChoices: number };
  gaps: Bi[];
  dates: MacroDate[];
  /** What accepting writes to the season row. */
  write: Partial<Record<MacroKey, string>>;
};

export type MacroProposalInput = {
  seasonYear: number;
  today: string;
  /** Phases built with the saved ∪ draft dates (loadPeriodization), the ones the hub shows. */
  phases: Array<{ key: string; start: string; end: string; weeks: number; matches: number }>;
  fixturesEstimated: boolean;
  fixtureCount: number;
  saved: MacroSaved;
  edits: MacroEdits;
  fromScratch: boolean;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
export const macroDateEn = (iso: string) => `${Number(iso.slice(8, 10))} ${MON_EN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const macroDateIs = (iso: string) => `${Number(iso.slice(8, 10))}. ${MON_IS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const KEYS: MacroKey[] = ["preseasonStart", "seasonEnd", "offseasonStart", "nextPreseasonStart"];

/** The coach's dates: saved ∪ draft edits (null = back to the rule). From scratch ignores the saved ones. */
export function mergeMacroDates(saved: MacroSaved, edits: MacroEdits, fromScratch: boolean): Partial<Record<MacroKey, string>> {
  const out: Partial<Record<MacroKey, string>> = {};
  for (const k of KEYS) {
    const e = edits[k];
    const v = e !== undefined ? e : fromScratch ? null : saved[k];
    if (typeof v === "string" && ISO.test(v)) out[k] = v;
  }
  return out;
}

export function buildMacroProposal(input: MacroProposalInput): MacroProposal {
  const mine = mergeMacroDates(input.saved, input.edits, input.fromScratch);
  const pre = input.phases.find((p) => p.key === "preseason");
  const comp = input.phases.find((p) => p.key === "competitive");
  const off = input.phases.find((p) => p.key === "offseason");
  const real = !input.fixturesEstimated && input.fixtureCount > 0;
  const offWeeks = input.saved.offseasonWeeks && input.saved.offseasonWeeks > 0 ? Math.round(input.saved.offseasonWeeks) : 10;

  const seasonEnd = mine.seasonEnd ?? (real ? comp?.end ?? null : null);
  const offStart = mine.offseasonStart ?? off?.start ?? (seasonEnd ? addDays(seasonEnd, 1) : null);
  const nextPre = mine.nextPreseasonStart ?? off?.end ?? (offStart ? addDays(offStart, offWeeks * 7) : null);
  const src = (k: MacroKey): "coach" | "rule" => (mine[k] ? "coach" : "rule");
  const yours: Bi = { en: "Your date.", is: "Þín dagsetning." };

  const dates: MacroDate[] = [
    {
      key: "preseasonStart", label: { en: "Pre-season starts", is: "Undirbúningur hefst" }, value: pre?.start ?? null, source: src("preseasonStart"), editable: true,
      reason: mine.preseasonStart ? yours : { en: "6 weeks before the first game, or where your training data starts.", is: "6 vikum fyrir fyrsta leik, eða þar sem æfingagögnin byrja." },
    },
    {
      key: "opener", label: { en: "First competitive game", is: "Fyrsti keppnisleikur" }, value: comp?.start ?? null, source: "fixtures", editable: false,
      reason: input.fixturesEstimated
        ? { en: "Estimated: last season's opener + 1 year. Enter the fixtures to fix it.", is: "Áætlaður: fyrsti leikur síðasta tímabils + 1 ár. Skráðu leikina til að festa hann." }
        : { en: "From the fixtures (friendlies don't start the season).", is: "Úr leikjaskránni (æfingaleikir hefja ekki tímabilið)." },
    },
    {
      key: "seasonEnd", label: { en: "Season ends", is: "Tímabili lýkur" }, value: seasonEnd, source: src("seasonEnd"), editable: true,
      reason: mine.seasonEnd ? yours : real
        ? (seasonEnd && seasonEnd < input.today
          ? { en: "The last competitive game — played, so it is saved when you use the plan.", is: "Síðasti keppnisleikurinn — búinn, svo hann vistast þegar þú notar planið." }
          : { en: "The last competitive game entered so far. Saved only if you set it — more games may come.", is: "Síðasti keppnisleikurinn sem er skráður. Vistast aðeins ef þú stillir hann — fleiri leikir gætu bæst við." })
        : { en: "Not known until the fixtures are entered.", is: "Ekki vitað fyrr en leikirnir eru skráðir." },
    },
    {
      key: "offseasonStart", label: { en: "Off-season starts", is: "Undirbúningshlé hefst" }, value: offStart, source: src("offseasonStart"), editable: true,
      reason: mine.offseasonStart ? { en: "Your date — the days between the season end and this are a holiday.", is: "Þín dagsetning — dagarnir frá lokum tímabils fram að henni eru frí." } : { en: "The day after the season ends.", is: "Daginn eftir að tímabilinu lýkur." },
    },
    {
      key: "nextPreseasonStart", label: { en: "Next pre-season starts", is: "Næsti undirbúningur hefst" }, value: nextPre, source: src("nextPreseasonStart"), editable: true,
      reason: mine.nextPreseasonStart ? yours : { en: `After a ${offWeeks}-week off-season.`, is: `Eftir ${offWeeks} vikna undirbúningshlé.` },
    },
  ];

  const gaps: Bi[] = [];
  if (!comp) gaps.push({ en: "No fixtures for this season — enter at least the first competitive game.", is: "Engir leikir á þessu tímabili — skráðu a.m.k. fyrsta keppnisleikinn." });
  else if (input.fixturesEstimated) gaps.push({ en: "Only the first game is estimated: the season end can't be proposed until the fixtures are entered.", is: "Aðeins fyrsti leikurinn er áætlaður: ekki er hægt að leggja til lok tímabils fyrr en leikirnir eru skráðir." });
  else if (comp.matches < 3 && !mine.seasonEnd) gaps.push({ en: `Only ${comp.matches} competitive ${comp.matches === 1 ? "game" : "games"} entered — the season end is the last of them until the whole fixture list is in.`, is: `Aðeins ${comp.matches} ${comp.matches === 1 ? "keppnisleikur skráður" : "keppnisleikir skráðir"} — lok tímabils miðast við þann síðasta þar til öll leikjaskráin er komin.` });

  // What accepting writes: the coach's dates; the season end also once the last game has been played.
  const write: Partial<Record<MacroKey, string>> = { ...mine };
  if (!mine.seasonEnd && real && seasonEnd && seasonEnd < input.today) write.seasonEnd = seasonEnd;

  const coachChoices = KEYS.filter((k) => mine[k]).length;
  const d = (iso: string | null, is: boolean) => (iso ? (is ? macroDateIs(iso) : macroDateEn(iso)) : "–");
  // The verdict names the season end only when it means something: set by the coach, or 3+ games entered.
  const showEnd = !!seasonEnd && (!!mine.seasonEnd || (comp?.matches ?? 0) >= 3);
  const verdict: Bi = comp
    ? {
        en: `Season ${input.seasonYear}: pre-season from ${d(pre?.start ?? null, false)}, first game ${d(comp.start, false)}${showEnd ? `, season ends ${d(seasonEnd, false)}, off-season to ${d(nextPre, false)}` : ""}.`,
        is: `Tímabil ${input.seasonYear}: undirbúningur frá ${d(pre?.start ?? null, true)}, fyrsti leikur ${d(comp.start, true)}${showEnd ? `, tímabili lýkur ${d(seasonEnd, true)}, hlé til ${d(nextPre, true)}` : ""}.`,
      }
    : { en: `Season ${input.seasonYear}: no fixtures yet.`, is: `Tímabil ${input.seasonYear}: engir leikir enn.` };
  const facts: Bi[] = [
    { en: "The dates follow the fixtures: the first competitive game starts the season, the last one ends it.", is: "Dagsetningarnar fylgja leikjaskránni: fyrsti keppnisleikurinn hefur tímabilið, sá síðasti lýkur því." },
    comp ? { en: `${comp.matches} competitive games over ${comp.weeks} weeks.`, is: `${comp.matches} keppnisleikir á ${comp.weeks} vikum.` } : { en: "No competitive games entered.", is: "Engir keppnisleikir skráðir." },
    coachChoices
      ? { en: `Your ${coachChoices} saved ${coachChoices === 1 ? "date stays" : "dates stay"}; the rule fills the rest.`, is: `${coachChoices} ${coachChoices === 1 ? "dagsetning þín stendur" : "dagsetningar þínar standa"}; reglan fyllir í restina.` }
      : { en: "No date set by you yet — every date follows the rule.", is: "Engin dagsetning stillt af þér enn — allar fylgja reglunni." },
  ];
  const level: MacroProposal["confidence"]["level"] = !comp ? "low" : input.fixturesEstimated ? "moderate" : "high";
  const note: Bi = level === "high"
    ? { en: "High confidence: built on the entered fixtures.", is: "Mikið traust: byggt á skráðum leikjum." }
    : level === "moderate"
      ? { en: "Moderate confidence: the first game is estimated.", is: "Miðlungs traust: fyrsti leikurinn er áætlaður." }
      : { en: "Low confidence: no fixtures entered.", is: "Lítið traust: engir leikir skráðir." };
  return { scope: "macro", seasonYear: input.seasonYear, verdict, facts, gaps, dates, write, confidence: { level, note, coachChoices, totalChoices: KEYS.length } };
}

/** How many dates on the season row change when the draft is used. */
export function macroAcceptSummary(saved: MacroSaved, write: MacroProposal["write"]): { datesChanged: number } {
  return { datesChanged: KEYS.filter((k) => write[k] != null && write[k] !== saved[k]).length };
}
