/**
 * execBriefing — plain-language management (EXEC/GM) narrative from aggregate club
 * signals. Deterministic (rules, not AI), jargon-free, bilingual. Extracted from
 * the /api/exec/club-overview route so the coverage-honest behaviour is unit-tested
 * and can't silently regress to claiming "strong" off a 2-of-23 sample.
 *
 * Inputs are AGGREGATES only (counts, means, ratios) — never individual health.
 */

export type Bi = { EN: string; IS: string };
export type Avail = { cleared: number; managed: number; unavailable: number; total: number };
export type Adherence = { withRead: number; squad: number; pct: number | null };
export type ConfidenceLevel = "high" | "moderate" | "low";

/** Below this share of the squad with a reading, we won't claim a squad-wide verdict. */
export const COVERAGE_GATE = 0.5;

export function confidenceFor(withRead: number, squad: number): { level: ConfidenceLevel; coverage: number } {
  const coverage = squad > 0 ? Math.round((withRead / squad) * 100) / 100 : 0;
  const level: ConfidenceLevel = coverage >= 0.8 ? "high" : coverage >= 0.5 ? "moderate" : "low";
  return { level, coverage };
}

/** One-sentence availability verdict — coverage-gated so "strong" never shows on thin data. */
export function availabilityVerdict(a: Avail, adh: Adherence): Bi {
  const { withRead, squad, pct } = adh;
  if (withRead === 0) {
    return { EN: "No readings in yet today — check-ins still coming.", IS: "Engir lestrar komnir í dag — innskráningar enn að berast." };
  }
  const coverage = squad > 0 ? withRead / squad : 1;
  if (coverage < COVERAGE_GATE) {
    return {
      EN: `Only ${withRead} of ${squad} players have a reading today (${pct}%) — too few to judge availability yet.`,
      IS: `Aðeins ${withRead} af ${squad} leikmönnum með lestur í dag (${pct}%) — of fáir til að meta mönnun.`,
    };
  }
  const clearedPct = a.total ? a.cleared / a.total : 0;
  const wordEN = clearedPct >= 0.8 ? "strong" : clearedPct >= 0.6 ? "solid" : clearedPct >= 0.4 ? "mixed" : "stretched";
  const wordIS = clearedPct >= 0.8 ? "sterk" : clearedPct >= 0.6 ? "góð" : clearedPct >= 0.4 ? "blönduð" : "tæp";
  const flagged = a.managed + a.unavailable;
  const tailEN = flagged === 0 ? "all assessed players cleared" : `${a.managed} managed${a.unavailable ? `, ${a.unavailable} unavailable` : ""}`;
  const tailIS = flagged === 0 ? "allir metnir klárir" : `${a.managed} í stýringu${a.unavailable ? `, ${a.unavailable} ófáanleg` : ""}`;
  return {
    EN: `Squad availability ${wordEN}; ${tailEN}. ${pct}% checked in.`,
    IS: `Mönnun liðs ${wordIS}; ${tailIS}. ${pct}% innskráð.`,
  };
}

/** Plain-language trend phrase from the weekly cleared% series (or null if too short). */
export function trendPhrase(trend: Array<{ clearedPct: number | null }>): Bi | null {
  const pts = trend.map((t) => t.clearedPct).filter((x): x is number => x != null);
  if (pts.length < 3) return null;
  const recent = pts.slice(-2);
  const prior = pts.slice(-4, -2);
  if (!prior.length) return null;
  const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
  const pa = prior.reduce((a, b) => a + b, 0) / prior.length;
  const lvl = Math.round(ra), d = ra - pa;
  if (d > 8) return { EN: `improved to about ${lvl}% cleared recently`, IS: `batnað í um ${lvl}% klára nýlega` };
  if (d < -8) return { EN: `slipped to about ${lvl}% cleared recently`, IS: `lækkað í um ${lvl}% klára nýlega` };
  return { EN: `held steady around ${lvl}% cleared`, IS: `haldist stöðug í um ${lvl}% klárum` };
}

/** A short GM briefing (what it means) + a single "watch" line (what to keep an eye on). */
export function buildBriefing(a: Avail, adh: Adherence, trend: Array<{ clearedPct: number | null }>): { briefing: Bi; watch: Bi } {
  const { withRead, squad, pct } = adh;
  const tw = trendPhrase(trend);
  const flagged = a.managed + a.unavailable;

  if (withRead === 0) {
    return {
      briefing: { EN: "No players have a reading yet today. Check-ins and GPS uploads usually arrive through the day, so this will fill in.", IS: "Enginn leikmaður er með lestur enn í dag. Innskráningar og GPS berast yfirleitt yfir daginn, svo þetta fyllist inn." },
      watch: { EN: "", IS: "" },
    };
  }

  const coverage = squad > 0 ? withRead / squad : 1;
  if (coverage < COVERAGE_GATE) {
    return {
      briefing: {
        EN: `Only ${withRead} of ${squad} players have checked in or produced data today, so this is a small sample — not a squad-wide picture. Of those, ${a.cleared} ${a.cleared === 1 ? "is" : "are"} cleared${flagged ? ` and ${flagged} flagged` : ""}. The first thing to move is participation: until more of the squad is logging data, the availability picture${tw ? " and its trend" : ""} can't be relied on.`,
        IS: `Aðeins ${withRead} af ${squad} leikmönnum hafa skráð sig eða skilað gögnum í dag, svo þetta er lítið úrtak — ekki heildarmynd. Af þeim ${a.cleared === 1 ? "er" : "eru"} ${a.cleared} klár${a.cleared === 1 ? "" : "ir"}${flagged ? ` og ${flagged} flögguð` : ""}. Fyrsta skrefið er þátttaka: þar til fleiri skrá gögn er ekki hægt að treysta mönnunar-myndinni${tw ? " eða þróun hennar" : ""}.`,
      },
      watch: {
        EN: `Watch adherence — at ${pct}% today, the system isn't being used enough to give a reliable read. Worth raising with the staff.`,
        IS: `Fylgstu með aðsókn — í ${pct}% í dag er kerfið ekki nógu mikið notað til að gefa áreiðanlega mynd. Vert að ræða við þjálfarateymið.`,
      },
    };
  }

  const sampleEN = coverage >= 0.8 ? "a full picture of the squad" : "a fair sample of the squad";
  const sampleIS = coverage >= 0.8 ? "heildarmynd af hópnum" : "sæmilegt úrtak af hópnum";
  return {
    briefing: {
      EN: `${withRead} of ${squad} players have a reading today (${pct}%), ${sampleEN}. ${a.cleared} ${a.cleared === 1 ? "is" : "are"} cleared${flagged ? `, with ${flagged} being managed by the staff` : " — nobody flagged"}.${tw ? ` Over recent weeks availability has ${tw.EN}.` : ""}`,
      IS: `${withRead} af ${squad} leikmönnum eru með lestur í dag (${pct}%), ${sampleIS}. ${a.cleared} ${a.cleared === 1 ? "er" : "eru"} klár${a.cleared === 1 ? "" : "ir"}${flagged ? `, og ${flagged} í stýringu hjá þjálfurum` : " — enginn flaggaður"}.${tw ? ` Síðustu vikur hefur mönnun ${tw.IS}.` : ""}`,
    },
    watch: flagged > 0
      ? { EN: `The ${flagged} flagged player${flagged > 1 ? "s are" : " is"} being managed — normal load management, not an alarm.`, IS: `${flagged} flaggaðir leikmenn eru í stýringu — eðlileg álags-stýring, ekki viðvörun.` }
      : { EN: "Nothing flagged today — the squad looks well managed.", IS: "Ekkert flaggað í dag — hópurinn lítur vel út." },
  };
}

/**
 * Injury burden — AGGREGATE only. A GM tracks how many are sidelined and whether
 * it's improving, NOT who or what (no names, body parts, diagnoses — that stays
 * with the medical staff). Counts in, plain language out.
 */
export type InjurySummary = { out: number; newRecent: number; returnedRecent: number; returningSoon: number };

export function injuryNarrative(inj: InjurySummary): { label: Bi; briefing: Bi } {
  const { out, newRecent, returnedRecent, returningSoon } = inj;
  if (out === 0 && newRecent === 0 && returnedRecent === 0) {
    return {
      label: { EN: "None out", IS: "Engir frá" },
      briefing: { EN: "No players are currently sidelined through injury.", IS: "Enginn leikmaður er frá vegna meiðsla núna." },
    };
  }
  const headEN = out === 0 ? "No players are currently out through injury" : `${out} ${out === 1 ? "player is" : "players are"} currently out through injury`;
  const headIS = out === 0 ? "Enginn er frá vegna meiðsla núna" : `${out} ${out === 1 ? "leikmaður er" : "leikmenn eru"} frá vegna meiðsla núna`;
  const bEN: string[] = [], bIS: string[] = [];
  if (newRecent > 0) { bEN.push(`${newRecent} new in the last two weeks`); bIS.push(`${newRecent} ${newRecent === 1 ? "nýtt tilfelli" : "ný tilfelli"} síðustu tvær vikur`); }
  if (returnedRecent > 0) { bEN.push(`${returnedRecent} returned recently`); bIS.push(`${returnedRecent} ${returnedRecent === 1 ? "snéri" : "snéru"} aftur nýlega`); }
  if (returningSoon > 0) { bEN.push(`${returningSoon} expected back within a week`); bIS.push(`${returningSoon} ${returningSoon === 1 ? "væntanlegur" : "væntanlegir"} til baka í vikunni`); }
  const tailEN = bEN.length ? ` — ${bEN.join(", ")}.` : ".";
  const tailIS = bIS.length ? ` — ${bIS.join(", ")}.` : ".";
  return {
    label: { EN: out === 0 ? "None out" : `${out} out`, IS: out === 0 ? "Engir frá" : `${out} frá` },
    briefing: { EN: `${headEN}${tailEN}`, IS: `${headIS}${tailIS}` },
  };
}

/**
 * Post-match recovery — how the squad rebounded after the last match. Aggregate
 * readiness colours in the days after the game: cleared = rebounded, managed/
 * unavailable = still carrying fatigue. Directional, not a medical recovery test.
 */
export type RecoverySummary = { rebounded: number; carrying: number; assessed: number; matchDate: string | null; daysAgo: number | null };

export function recoveryNarrative(r: RecoverySummary): { available: boolean; label: Bi; briefing: Bi } {
  if (!r.matchDate || r.daysAgo == null || r.daysAgo > 6 || r.assessed === 0) {
    return {
      available: false,
      label: { EN: "No recent match", IS: "Enginn nýlegur leikur" },
      briefing: { EN: "No match in the last few days to read recovery from.", IS: "Enginn leikur síðustu daga til að lesa endurheimt af." },
    };
  }
  const pct = r.assessed ? r.rebounded / r.assessed : 0;
  const label: Bi = pct >= 0.8 ? { EN: "Recovered well", IS: "Góð endurheimt" }
    : pct >= 0.5 ? { EN: "Mostly back", IS: "Að mestu komnir" }
      : { EN: "Still recovering", IS: "Enn að jafna sig" };
  return {
    available: true,
    label,
    briefing: {
      EN: `${r.daysAgo} day${r.daysAgo === 1 ? "" : "s"} after the last match, ${r.rebounded} of ${r.assessed} ${r.rebounded === 1 ? "has" : "have"} rebounded to green${r.carrying ? `; ${r.carrying} still carrying fatigue` : ""}.`,
      IS: `${r.daysAgo} ${r.daysAgo === 1 ? "degi" : "dögum"} eftir síðasta leik ${r.rebounded === 1 ? "hefur" : "hafa"} ${r.rebounded} af ${r.assessed} náð sér í grænt${r.carrying ? `; ${r.carrying} enn þreyttir` : ""}.`,
    },
  };
}

export type LoadBand = "building" | "sustained" | "easing" | "na";

/**
 * Team training-load trajectory from acute (recent) vs chronic (baseline) mean
 * session load per player — participation-independent, tier-fair (player_load
 * exists on Lite + Pro). A directional management signal, not an ACWR risk score.
 */
export function loadTrajectory(acute: number | null, chronic: number | null, daysCovered: number): { band: LoadBand; ratio: number | null; label: Bi; briefing: Bi } {
  if (acute == null || chronic == null || chronic <= 0 || daysCovered < 5) {
    return {
      band: "na", ratio: null,
      label: { EN: "Not enough data", IS: "Ekki nóg gögn" },
      briefing: { EN: "Not enough recent training-load data to read a trend yet.", IS: "Ekki nóg af nýlegum álagsgögnum til að lesa þróun enn." },
    };
  }
  const ratio = Math.round((acute / chronic) * 100) / 100;
  const pctDiff = Math.round((ratio - 1) * 100);
  if (ratio >= 1.15) {
    return {
      band: "building", ratio,
      label: { EN: "Building", IS: "Að byggjast upp" },
      briefing: { EN: `Training load is building — sessions are about ${pctDiff}% heavier than the squad's recent norm. Normal in a loading week; worth a note if it keeps climbing.`, IS: `Álag er að byggjast upp — æfingar eru um ${pctDiff}% þyngri en venjulega. Eðlilegt í álagsviku; vert að fylgjast með ef það heldur áfram að hækka.` },
    };
  }
  if (ratio <= 0.85) {
    return {
      band: "easing", ratio,
      label: { EN: "Easing", IS: "Að minnka" },
      briefing: { EN: `Training load is easing — lighter than the recent norm. Normal around a taper or a recovery block.`, IS: `Álag er að minnka — léttara en venjulega. Eðlilegt í niðurtröppun eða endurheimtar-bloki.` },
    };
  }
  return {
    band: "sustained", ratio,
    label: { EN: "Steady", IS: "Stöðugt" },
    briefing: { EN: `Training load is steady — in line with the squad's recent norm.`, IS: `Álag er stöðugt — í takt við það sem hópurinn gerir venjulega.` },
  };
}
