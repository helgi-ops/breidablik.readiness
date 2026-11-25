/**
 * "Build meso" — the competitive season's blocks as one draft the coach changes, then uses.
 *
 * plan_proposals, draft → accept (the base "Build pre-season" used before it was removed 2026-11-25): the blocks come from the engine the hub
 * already uses (`buildMesoBlocks` — fixture-aware block goals, Issurin 2010 / Martín-García 2018), the coach's
 * saved block lengths, goals and light weeks stand, and the rule fills the rest. Pure: no I/O.
 *
 * What a block is in-season (blockGoalFromSeason): games most weeks → Realization (compete, weekly taper);
 * a dense run (≥ 1.5 games a week) → Realization; a stretch of ≥ 14 days without games → a loading block
 * (the next in Accumulation → Transmutation → Realization). In-season no light week is set automatically
 * (Malone 2015; tapers that helped were ~20% cuts — Fessi 2016, Moalla 2021); the coach adds one where wanted.
 *
 * Accept writes only the coach's choices (lengths, goals, light weeks) to the season row; the rule values are
 * not pinned, so a fixture change still re-flows the blocks. Descriptive planning — never the readiness colour.
 */

import { buildMesoBlocks, BLOCK_GOAL_LABEL, type MesoBlock, type RecGoalKey, type WeekLoad } from "./index";

type Bi = { en: string; is: string };
export type ProposalSource = "coach" | "rule";

/** What the coach changed in a meso draft, keyed by block start (ISO Monday). null = back to the rule. */
export type MesoEdits = {
  blockWeeks?: Record<string, number | null>;
  blockGoals?: Record<string, RecGoalKey | null>;
  blockDeload?: Record<string, string | null>;
};
export type MesoMaps = { blockWeeks: Record<string, number>; blockGoals: Record<string, string>; blockDeload: Record<string, string> };

export type MesoProposalBlock = {
  index: number; start: string; end: string; weeks: number; games: number;
  goal: RecGoalKey; goalSource: ProposalSource;
  lengthSource: ProposalSource;
  /** Monday of the light week, or null (none). */
  lightWeek: string | null; lightSource: ProposalSource;
  reason: Bi;
};

export type MesoProposal = {
  scope: "meso";
  seasonYear: number;
  verdict: Bi;
  facts: Bi[];
  confidence: { level: "high" | "moderate" | "low"; note: Bi; coachChoices: number; totalChoices: number };
  gaps: Bi[];
  blocks: MesoProposalBlock[];
  cite: { goals: string; light: string };
};

export type MesoProposalInput = {
  seasonYear: number;
  today: string;
  phases: Array<{ key: string; start: string; end: string }>;
  loadCurve: WeekLoad[];
  cadence: 4 | 5 | 6;
  matchLoad: number | null;
  fixtures: string[];
  fixturesEstimated: boolean;
  breaks: Array<{ start_date: string; end_date: string }>;
  /** The coach's off-season start (the hub passes it as the off-season build start). */
  offseasonBuildStart: string | null;
  saved: { blockWeeks?: Record<string, number> | null; blockGoals?: Record<string, string> | null; blockDeload?: Record<string, string> | null };
  edits: MesoEdits;
  fromScratch: boolean;
};

const GOALS: RecGoalKey[] = ["accum", "transmute", "realize"];
const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const dEn = (iso: string) => `${Number(iso.slice(8, 10))} ${MON_EN[Number(iso.slice(5, 7)) - 1]}`;
const dIs = (iso: string) => `${Number(iso.slice(8, 10))}. ${MON_IS[Number(iso.slice(5, 7)) - 1]}`;
const isGoal = (g: unknown): g is RecGoalKey => typeof g === "string" && (GOALS as string[]).includes(g);

function blocksFor(input: MesoProposalInput, maps: Pick<MesoMaps, "blockWeeks" | "blockDeload">): MesoBlock[] {
  const ph = input.phases;
  if (!ph.length) return [];
  const comp = ph.find((p) => p.key === "competitive")?.start ?? null;
  const off = ph.find((p) => p.key === "offseason")?.start ?? null;
  return buildMesoBlocks(ph[0].start, ph[ph.length - 1].end, input.loadCurve, input.cadence, input.matchLoad, input.fixtures, comp, input.breaks, off, input.offseasonBuildStart, {
    blockWeeks: maps.blockWeeks, deloadByStart: maps.blockDeload, fixturesEstimated: input.fixturesEstimated,
  });
}

/** The blocks a meso draft plans: the competitive season's, from the one running today onward. */
const planned = (blocks: MesoBlock[], today: string) => blocks.filter((b) => b.inSeason && b.end > today && b.end > b.start);

/** Saved maps + the draft's edits. A length edit replaces that block's index key too (index wins in the engine).
 *  From scratch drops the coach's choices for the planned blocks only — pre-season / off-season keys stay. */
export function mergeMesoMaps(input: MesoProposalInput): MesoMaps {
  const s = input.saved;
  const out: MesoMaps = { blockWeeks: { ...(s.blockWeeks ?? {}) }, blockGoals: { ...(s.blockGoals ?? {}) }, blockDeload: { ...(s.blockDeload ?? {}) } };
  const before = blocksFor(input, out);
  const byStart = new Map(before.map((b) => [b.start, b]));
  if (input.fromScratch) {
    for (const b of planned(before, input.today)) {
      delete out.blockWeeks[b.start]; delete out.blockWeeks[String(b.index)];
      delete out.blockGoals[b.start]; delete out.blockDeload[b.start];
    }
  }
  for (const [iso, n] of Object.entries(input.edits.blockWeeks ?? {})) {
    const b = byStart.get(iso); if (b) delete out.blockWeeks[String(b.index)];
    if (n == null) delete out.blockWeeks[iso]; else out.blockWeeks[iso] = Math.max(2, Math.min(8, Math.round(n)));
  }
  for (const [iso, g] of Object.entries(input.edits.blockGoals ?? {})) { if (g == null) delete out.blockGoals[iso]; else if (isGoal(g)) out.blockGoals[iso] = g; }
  for (const [iso, w] of Object.entries(input.edits.blockDeload ?? {})) { if (w == null) delete out.blockDeload[iso]; else out.blockDeload[iso] = w; }
  return out;
}

export function buildMesoProposal(input: MesoProposalInput): { proposal: MesoProposal; maps: MesoMaps } {
  const maps = mergeMesoMaps(input);
  const blocks = planned(blocksFor(input, maps), input.today);
  const fxMs = input.fixtures.map(ms).sort((a, b) => a - b);
  const out: MesoProposalBlock[] = blocks.map((b) => {
    const s = ms(b.start), e = ms(b.end);
    const games = fxMs.filter((m) => m >= s && m < e);
    let gap = games.length ? Math.round((games[0] - s) / DAY) : Math.round((e - s) / DAY);
    for (let k = 1; k < games.length; k++) gap = Math.max(gap, Math.round((games[k] - games[k - 1]) / DAY));
    const coachGoal = maps.blockGoals[b.start];
    const goal: RecGoalKey = isGoal(coachGoal) ? coachGoal : b.goalKey === "deload" ? "accum" : b.goalKey;
    const perWeek = b.weeks > 0 ? games.length / b.weeks : 0;
    const reason: Bi = isGoal(coachGoal)
      ? { en: "Your choice.", is: "Þitt val." }
      : input.fixturesEstimated
        ? { en: "Only the opener is known — compete until the fixtures are in.", is: "Aðeins fyrsti leikur er þekktur — keppni þar til leikjaskráin kemur." }
        : perWeek >= 1.5
          ? { en: `${games.length} games in ${b.weeks} weeks — a dense run: compete and stay fresh.`, is: `${games.length} leikir á ${b.weeks} vikum — þétt: keppa og halda ferskleika.` }
          : gap >= 14
            ? { en: `${gap} days without a game — room to load.`, is: `${gap} dagar án leiks — svigrúm til að hlaða.` }
            : { en: `${games.length} games in ${b.weeks} weeks — compete, with the weekly taper.`, is: `${games.length} leikir á ${b.weeks} vikum — keppa, með léttingu fyrir hvern leik.` };
    return {
      index: b.index, start: b.start, end: b.end, weeks: b.weeks, games: games.length,
      goal, goalSource: isGoal(coachGoal) ? "coach" : "rule",
      lengthSource: maps.blockWeeks[b.start] != null || maps.blockWeeks[String(b.index)] != null ? "coach" : "rule",
      lightWeek: b.deloadWeekStart ?? null, lightSource: maps.blockDeload[b.start] ? "coach" : "rule",
      reason,
    };
  });

  const gaps: Bi[] = [];
  const comp = input.phases.find((p) => p.key === "competitive");
  if (!comp || ms(comp.end) <= ms(comp.start)) gaps.push({ en: "No competitive season to plan yet — enter the season's fixtures (or the season end) under Macro.", is: "Ekkert keppnistímabil að skipuleggja enn — skráðu leiki tímabilsins (eða lok þess) í Makró." });
  else if (!out.length) gaps.push({ en: "The competitive season is over — nothing left to plan this season.", is: "Keppnistímabilinu er lokið — ekkert eftir að skipuleggja á þessu tímabili." });
  if (input.fixturesEstimated) gaps.push({ en: "Only the first game is known: every block reads as Realization until the fixtures are entered.", is: "Aðeins fyrsti leikurinn er þekktur: allar lotur verða Realization þar til leikirnir eru skráðir." });

  const n = out.length;
  const count = (g: RecGoalKey) => out.filter((b) => b.goal === g).length;
  const light = out.filter((b) => b.lightWeek).length;
  const label = (g: RecGoalKey) => BLOCK_GOAL_LABEL[g];
  const verdict: Bi = n
    ? {
        en: `${n} blocks, ${dEn(out[0].start)} → ${dEn(out[n - 1].end)}: ${count("realize")} ${label("realize").en}, ${count("accum") + count("transmute")} loading, ${light} light ${light === 1 ? "week" : "weeks"}.`,
        is: `${n} lotur, ${dIs(out[0].start)} → ${dIs(out[n - 1].end)}: ${count("realize")} ${label("realize").is}, ${count("accum") + count("transmute")} hleðslu, ${light} ${light === 1 ? "létt vika" : "léttar vikur"}.`,
      }
    : { en: "No in-season blocks to plan.", is: "Engar lotur á keppnistímabili að skipuleggja." };
  const coachChoices = out.reduce((s, b) => s + (b.goalSource === "coach" ? 1 : 0) + (b.lengthSource === "coach" ? 1 : 0) + (b.lightSource === "coach" ? 1 : 0), 0);
  const facts: Bi[] = [
    { en: "Games most weeks → compete (Realization); 2+ weeks without a game → a loading block.", is: "Leikir flestar vikur → keppa (Realization); 2+ vikur án leiks → hleðslulota." },
    { en: "No light week is set automatically in-season — the taper before each game already varies the load. Add one where you want it.", is: "Engin létt vika er sett sjálfkrafa á tímabilinu — léttingin fyrir hvern leik breytir álaginu nú þegar. Bættu við þar sem þú vilt." },
    coachChoices
      ? { en: `Your ${coachChoices} saved ${coachChoices === 1 ? "choice stays" : "choices stay"}; the rule fills the rest.`, is: `${coachChoices} ${coachChoices === 1 ? "val þitt stendur" : "val þín standa"}; reglan fyllir í restina.` }
      : { en: "Nothing set by you yet — every block follows the rule.", is: "Ekkert stillt af þér enn — allar lotur fylgja reglunni." },
  ];
  const level: MesoProposal["confidence"]["level"] = !input.fixtures.length ? "low" : input.fixturesEstimated ? "moderate" : "high";
  const note: Bi = level === "high"
    ? { en: "High confidence: built on the entered fixtures.", is: "Mikið traust: byggt á skráðum leikjum." }
    : level === "moderate"
      ? { en: "Moderate confidence: the fixtures are estimated.", is: "Miðlungs traust: leikirnir eru áætlaðir." }
      : { en: "Low confidence: no fixtures entered.", is: "Lítið traust: engir leikir skráðir." };

  return {
    maps,
    proposal: {
      scope: "meso", seasonYear: input.seasonYear, verdict, facts, gaps, blocks: out,
      confidence: { level, note, coachChoices, totalChoices: n * 3 },
      cite: { goals: "Issurin 2010; Martín-García 2018", light: "Malone 2015; Fessi 2016; Moalla 2021" },
    },
  };
}

/** What accepting writes: the merged coach maps, and how many choices differ from what is saved now. */
export function mesoAcceptSummary(saved: MesoProposalInput["saved"], maps: MesoMaps): { lengths: number; goals: number; lightWeeks: number } {
  const diff = (a: Record<string, unknown> | null | undefined, b: Record<string, unknown>) => {
    const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b)]);
    let n = 0; for (const k of keys) if ((a ?? {})[k] !== b[k]) n += 1; return n;
  };
  return { lengths: diff(saved.blockWeeks, maps.blockWeeks), goals: diff(saved.blockGoals, maps.blockGoals), lightWeeks: diff(saved.blockDeload, maps.blockDeload) };
}
