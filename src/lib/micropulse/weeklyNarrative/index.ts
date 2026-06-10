/**
 * Weekly Narrative — squad-level 7-day storytelling.
 *
 * Reads the last 7 days of training-load data + verdict history and emits
 * a one-line story + 2–3 supporting facts that summarise what KIND of
 * week the team has had so the coach gets a strategic read in 5 seconds:
 *
 *   "Hard week (3 high-load sessions, 1 match) — load 12% above 4-wk avg.
 *    Two players trending toward overload (Affi, Kristófer)."
 *
 * Pure function, deterministic. Companion loader fetches the rows.
 *
 * Inputs are intentionally narrow:
 *   - daily team-aggregated training load (player_load mean / sum)
 *   - count of high-load days (PL above per-player baseline)
 *   - count of matches in window (60+ min = match day)
 *   - count of REDUCED/RECOVERY verdicts logged in the window
 *   - players whose 7-day mean trended down ≥ 1 STEN band
 *
 * The narrative is NOT a verdict — it's strategic context for periodisation.
 * Coach uses it to decide "do we push this week or back off?"
 */

export type WeeklyNarrativeInput = {
  /** Number of days in the 7-day window with team-mean PL above baseline. */
  highLoadDays: number;
  /** Number of match days in the window (any player with ≥60 min logged). */
  matchDays: number;
  /** Total count of REDUCED + RECOVERY verdicts across all players in the window. */
  reducedRecoveryCount: number;
  /** Total count of FULL verdicts across the window (denominator for ratio). */
  fullCount: number;
  /** Acute (7d) team-mean Player Load. null when no data. */
  acuteMeanPl: number | null;
  /** Chronic (28d) team-mean Player Load. null when no data. */
  chronicMeanPl: number | null;
  /** Names of players whose 7d mean STEN dropped ≥ 1 band vs prior 14d. */
  decliningPlayers: string[];
  /** Names of players currently injured or in RTP. */
  injuredPlayers: string[];
};

export type WeeklyNarrativeOutput = {
  /** Single bold sentence — the headline story of the week. */
  headline: string;
  /** 1–3 supporting facts (sentences). May be empty when nothing notable. */
  facts: string[];
  /** Recommendation for the rest of the week. May be null on quiet weeks. */
  recommendation: string | null;
};

/** Acute:Chronic ratio for the team mean. null when chronic is missing. */
function teamAcwr(input: WeeklyNarrativeInput): number | null {
  const { acuteMeanPl, chronicMeanPl } = input;
  if (acuteMeanPl == null || chronicMeanPl == null || chronicMeanPl <= 0) return null;
  return acuteMeanPl / chronicMeanPl;
}

/** Convert acwr into "+12%" / "-8%" / "balanced" descriptor. */
function loadDeltaText(input: WeeklyNarrativeInput, lang: "IS" | "EN"): string | null {
  const r = teamAcwr(input);
  if (r == null) return null;
  const pctDelta = Math.round((r - 1) * 100);
  if (Math.abs(pctDelta) < 5) {
    return lang === "IS" ? "í takt við 4-vikna meðaltal" : "in line with the 4-week average";
  }
  const sign = pctDelta > 0 ? "+" : "";
  return lang === "IS"
    ? `${sign}${pctDelta}% miðað við 4-vikna meðaltal`
    : `${sign}${pctDelta}% vs the 4-week average`;
}

/** Build the narrative. Pure deterministic transform of the inputs. */
export function buildWeeklyNarrative(
  input: WeeklyNarrativeInput,
  lang: "IS" | "EN" = "EN",
): WeeklyNarrativeOutput {
  const { highLoadDays, matchDays, reducedRecoveryCount, fullCount, decliningPlayers, injuredPlayers } = input;
  const totalVerdicts = reducedRecoveryCount + fullCount;
  const reducedPct = totalVerdicts > 0 ? (reducedRecoveryCount / totalVerdicts) * 100 : 0;
  const acwr = teamAcwr(input);
  const loadDelta = loadDeltaText(input, lang);

  // ── Headline ──────────────────────────────────────────────────────────
  let intensity: "quiet" | "normal" | "hard" | "very_hard";
  if (matchDays >= 2 || highLoadDays >= 4) intensity = "very_hard";
  else if (matchDays >= 1 || highLoadDays >= 3) intensity = "hard";
  else if (highLoadDays >= 1) intensity = "normal";
  else intensity = "quiet";

  const intensityHeadline: Record<typeof intensity, { IS: string; EN: string }> = {
    very_hard: {
      IS: "Mjög þung vika",
      EN: "Very hard week",
    },
    hard: {
      IS: "Þung vika",
      EN: "Hard week",
    },
    normal: {
      IS: "Venjuleg æfingavika",
      EN: "Normal training week",
    },
    quiet: {
      IS: "Róleg vika",
      EN: "Quiet week",
    },
  };

  const composition: string[] = [];
  if (highLoadDays > 0) {
    composition.push(lang === "IS"
      ? `${highLoadDays} ${highLoadDays === 1 ? "hörð æfing" : "harðar æfingar"}`
      : `${highLoadDays} hard session${highLoadDays === 1 ? "" : "s"}`);
  }
  if (matchDays > 0) {
    composition.push(lang === "IS"
      ? `${matchDays} ${matchDays === 1 ? "leikur" : "leikir"}`
      : `${matchDays} match${matchDays === 1 ? "" : "es"}`);
  }
  const compositionStr = composition.length > 0 ? ` (${composition.join(", ")})` : "";
  const loadStr = loadDelta ? ` — álag ${loadDelta}` : "";
  const headline = `${intensityHeadline[intensity][lang]}${compositionStr}${loadStr}.`
    .replace(/álag/, lang === "IS" ? "álag" : "load");

  // ── Facts ─────────────────────────────────────────────────────────────
  const facts: string[] = [];

  // Verdict mix — only mention when REDUCED/RECOVERY has a meaningful share
  if (totalVerdicts > 0 && reducedPct >= 15) {
    facts.push(lang === "IS"
      ? `${reducedRecoveryCount} af ${totalVerdicts} dagsverdict-um endaði í REDUCED eða RECOVERY (${reducedPct.toFixed(0)}%) — meiri þreyta en í góðri viku.`
      : `${reducedRecoveryCount} of ${totalVerdicts} daily verdicts landed in REDUCED or RECOVERY (${reducedPct.toFixed(0)}%) — fatigue load above a clean week.`);
  }

  // Declining players
  if (decliningPlayers.length > 0) {
    const top3 = decliningPlayers.slice(0, 3);
    const more = decliningPlayers.length > 3 ? (lang === "IS" ? ` +${decliningPlayers.length - 3}` : ` +${decliningPlayers.length - 3}`) : "";
    facts.push(lang === "IS"
      ? `Trending niður um a.m.k. eitt STEN band: ${top3.join(", ")}${more}.`
      : `Trending down ≥ 1 STEN band: ${top3.join(", ")}${more}.`);
  }

  // Injuries
  if (injuredPlayers.length > 0) {
    const top3 = injuredPlayers.slice(0, 3);
    const more = injuredPlayers.length > 3 ? ` +${injuredPlayers.length - 3}` : "";
    facts.push(lang === "IS"
      ? `Í meiðslaferli / RTP: ${top3.join(", ")}${more}.`
      : `In injury / return-to-play: ${top3.join(", ")}${more}.`);
  }

  // ACWR risk band
  if (acwr != null) {
    if (acwr >= 1.5) {
      facts.push(lang === "IS"
        ? `Lið-ACWR ${acwr.toFixed(2)} — yfir Hulin 2014 spike-þröskuldi (1.5×): snöggt álagsstökk, meira en síðustu vikur byggðu upp. (ACWR er álagsstýring, ekki meiðslaspá — Impellizzeri 2020.)`
        : `Team ACWR ${acwr.toFixed(2)} — above the Hulin 2014 spike threshold (1.5×): a sharp load spike, beyond what recent weeks built up to. (ACWR is a workload-management signal, not an injury predictor — Impellizzeri 2020.)`);
    } else if (acwr < 0.8) {
      facts.push(lang === "IS"
        ? `Lið-ACWR ${acwr.toFixed(2)} — undertraining-zone (Gabbett 2016), ætti að setja meiri stimulation inn.`
        : `Team ACWR ${acwr.toFixed(2)} — undertraining zone (Gabbett 2016), consider adding stimulus.`);
    }
  }

  // ── Recommendation ────────────────────────────────────────────────────
  let recommendation: string | null = null;
  if (intensity === "very_hard" || (acwr != null && acwr >= 1.5)) {
    recommendation = lang === "IS"
      ? "Mæli með léttari næstu 1–2 dögum — gefa CNS og vöðvum tíma til að jafna sig áður en næsta hörð blokk kemur."
      : "Recommend the next 1–2 days run lighter — give CNS and tissues time to recover before the next hard block.";
  } else if (acwr != null && acwr < 0.8 && injuredPlayers.length === 0) {
    recommendation = lang === "IS"
      ? "Vika hefur verið létt — hægt að bæta einum hörðum degi við áður en MD ef tilefni er."
      : "Week has been light — room to add one hard day before MD if it fits the periodisation.";
  } else if (decliningPlayers.length >= 3) {
    recommendation = lang === "IS"
      ? `Þrír eða fleiri leikmenn að lækka — endurskoðaðu volume á næstu æfingu fyrir ${decliningPlayers[0]} og fleiri.`
      : `Three or more players trending down — review volume for the next session, starting with ${decliningPlayers[0]} and the rest of the list.`;
  }

  return { headline, facts, recommendation };
}
