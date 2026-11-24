/**
 * Finds "Author Year" citations in text ("Carling 2018", "van der Horst 2015", "Hoff & Helgerud 2004",
 * "Sáez de Villarreal 2009"). Used by the reference test and the script that writes docs/heimildir-aefingakerfis.md.
 */

/** Where the training-programme rules live (the scope of `RULE_REFS`). */
export const RULE_CODE_DIRS = [
  "src/lib/micropulse/strengthProgramming",
  "src/lib/micropulse/planIntent",
  "src/lib/micropulse/goalPlan",
  "src/lib/micropulse/periodization",
  "src/lib/micropulse/plannedSessionLoad.ts",
] as const;

/**
 * Where else citations reach a coach: the sources behind VALD focus, test benchmarks, recovery, isometric
 * protocols, development levers and position prescriptions. Same rule as the rule code: each one resolves to
 * a full reference or is listed as unresolved.
 */
export const OTHER_CITATION_SOURCES = [
  "src/lib/micropulse/vald",
  "src/lib/micropulse/isometrics",
  "src/lib/recovery",
  "src/lib/micropulse/trainingPrescriptions.ts",
  "src/lib/micropulse/load/fitnessTrend.ts",
  "src/lib/micropulse/load/fitnessTestBenchmarks.ts",
  "src/lib/micropulse/playerAnalysis/developmentLevers.ts",
] as const;

/**
 * The rest of the app, added lot by lot as each area's citations are checked (papers in `appRefs.ts`).
 * Lot A (2026-11-24): injury and return-to-play pages, rehab, movement screen, injury-risk rules.
 * Lot B (2026-11-24): daily verdict and signals, readiness, monitoring, methodology.
 */
export const APP_CITATION_SOURCES = [
  "src/app/coach/achilles-tendinopathy",
  "src/app/coach/adductor-groin",
  "src/app/coach/ankle-sprain",
  "src/app/coach/calf-strain",
  "src/app/coach/hamstring-rehab",
  "src/app/coach/jumpers-knee",
  "src/app/coach/low-back",
  "src/app/coach/injuries",
  "src/app/coach/rtp",
  "src/app/coach/return-to-training",
  "src/app/coach/rehab-protocols",
  "src/app/coach/movement-screen",
  "src/app/coach/clinical-reports",
  "src/app/api/coach/clinical-assessment",
  "src/app/api/coach/clinical-reports",
  "src/app/api/coach/corrective-exercises",
  "src/app/api/coach/movement-analysis",
  "src/app/api/coach/movement-assessment-form",
  "src/app/api/coach/movement-region-assessment",
  "src/app/api/coach/movement-screen",
  "src/app/api/coach/movement-tests",
  "src/app/api/coach/rehab-track-progress",
  "src/app/api/coach/return-to-training",
  "src/app/api/coach/rtp",
  "src/lib/micropulse/rtp",
  "src/lib/micropulse/ccc",
  "src/lib/micropulse/movementScreen",
  "src/lib/micropulse/returnToTraining.ts",
  "src/lib/micropulse/rttForPlayer.ts",
  "src/lib/micropulse/injuryRisk",
  "src/components/movement",
  "src/components/rehab",
  "src/components/clinical",
  "src/components/coach/ReturnToTrainingPage.tsx",
  "src/components/coach/AssignRehabModal.tsx",
  "src/components/coach/MovementScreenPdf.tsx",
  "src/components/coach/MovementScreenTpaCard.tsx",
  "src/components/coach/DecisionSummaryCard.tsx",
  "src/components/coach/DecisionTraceModal.tsx",
  "src/lib/micropulse/coachSignals",
  "src/lib/micropulse/signalPack",
  "src/lib/micropulse/robustnessWatch",
  "src/lib/micropulse/robustness",
  "src/app/methodology",
  "src/lib/methodologyCaveats.ts",
  "src/lib/micropulse/attention",
  "src/lib/micropulse/decision",
  "src/lib/micropulse/readiness",
  "src/lib/micropulse/interpretation",
  "src/lib/micropulse/playerDecision",
  "src/lib/micropulse/readinessOutlook",
  "src/lib/micropulse/intensityVerdict",
  "src/lib/micropulse/loadVerdict",
  "src/lib/micropulse/sprintSpeedDrop",
  "src/lib/micropulse/sprintExposure",
  "src/lib/micropulse/nearMaxExposure",
  "src/lib/micropulse/cmjFatigue",
  "src/lib/micropulse/cmjRecovery",
  "src/lib/micropulse/hrvTrend",
  "src/lib/micropulse/rpeDiscrepancy",
  "src/lib/micropulse/rpeExpectation",
  "src/lib/micropulse/rulesEngine",
  "src/lib/micropulse/volatility",
  "src/lib/micropulse/neuralVolatilityIntelligence",
  "src/lib/micropulse/playerNeuralStatus.ts",
  "src/lib/micropulse/recoveryWatch",
  "src/lib/micropulse/wearableRecovery",
  "src/lib/micropulse/baselines",
  "src/lib/micropulse/dataQuality.ts",
  "src/app/coach/readiness-signals",
  "src/app/coach/quadrant",
  "src/app/coach/dev-coach-dashboard",
  "src/app/api/team/decisions",
  "src/app/api/coach/signals",
  "src/app/api/coach/player/[id]/robustness-watch",
  "src/components/dashboard",
] as const;

const SHORT_RE =
  /(?:\p{Lu}[\p{L}]+ de |(?:Los|van der|van|de|di|dos|Di|De|Van|Dos) )?\p{Lu}[\p{L}'’-]+(?: et al\.?)?(?: (?:&|&amp;) \p{Lu}[\p{L}'’-]+)? \(?(?:19|20)\d{2}[ab]?\b/gu;

/** The other authors written before the last one: "Lum, Barbosa, Joseph, " in "Lum, Barbosa, Joseph, Balasekaran (2021)". */
const AUTHOR_CHAIN_BEFORE = /(?:^|[\s"'(\[`])((?:\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+)?, )+)$/u;

/**
 * Words that sit before a year without being an author: journal abbreviations inside full references
 * ("Sports Med 2016"), months and labels ("Nov 2026", "Season 2026").
 */
const NOT_AUTHORS = new Set([
  "Med", "Res", "Perform", "Sports", "Sport", "Exerc", "PeerJ", "Kinet", "Physiol", "Psychol", "Health", "ISBS",
  "Cond", "Football", "One", "Rehabil", "Ther", "Train", "Sci", "Rep", "Open", "Season",
  "Since", "Until", "Yellow", "VERSION", "Library", "Safety", "DSI", "Coach", "Endurgreining", "Breiðabliks",
  "Jan", "Feb", "Mar", "March", "Apr", "April", "May", "Jun", "June", "Jul", "July", "Aug", "August", "Sep", "Sept",
  "September", "Oct", "October", "Nov", "November", "Dec", "December", "EFL", "IJSC",
  // Dates and names in comments ("Fixed 2026-04-29", "On 2026-07-20", "Breiðablik 2026 data", "on Lite, Gabbett 2016").
  "Fixed", "On", "Breiðablik", "Breiðablik's", "Breiðablik’s", "Lite", "ML", "SHAP",
]);

/**
 * Each citation with where it sits in the text. `length` covers a closing ")" in "Carling (2018)". A full author
 * list ("Lum, Barbosa, Joseph, Balasekaran (2021)") is one citation; `ruleRefs` reads it by its first author.
 */
export function citationMatches(text: string): Array<{ index: number; length: number; short: string }> {
  const out: Array<{ index: number; length: number; short: string }> = [];
  for (const m of text.matchAll(SHORT_RE)) {
    let s = m[0].replace("(", "").replace("&amp;", "&"); // JSX text escapes "&"
    if (NOT_AUTHORS.has(s.split(" ")[0])) continue;
    let index = m.index ?? 0;
    const closes = m[0].includes("(") && text[index + m[0].length] === ")";
    const end = index + m[0].length + (closes ? 1 : 0);
    const chain = text.slice(Math.max(0, index - 200), index).match(AUTHOR_CHAIN_BEFORE)?.[1];
    if (chain && !NOT_AUTHORS.has(chain.split(/[ ,]/)[0])) {
      index -= chain.length;
      s = chain + s;
    }
    out.push({ index, length: end - index, short: s });
  }
  return out;
}

export function citationsIn(text: string): string[] {
  return [...new Set(citationMatches(text).map((m) => m.short))];
}
