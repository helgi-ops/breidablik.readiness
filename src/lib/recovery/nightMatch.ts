/**
 * Night-match sleep flag. An evening kickoff compresses the window between the
 * final whistle and bedtime and reliably disrupts sleep — ~90% of players report
 * worse sleep after night matches and lose ~90 min of total sleep (direct
 * football evidence). That sleep disruption is STRONG; the autonomic mechanism
 * behind it is UNCERTAIN, so the flag claims the disruption, not the cause.
 *
 * Descriptive — a coaching prompt (protect bedtime, cut late stimulation, offer
 * the breathing reset). Never sets the readiness colour.
 */

/** A kickoff at or after this hour (local clock, from match_schedule.kickoff_time) counts as a night match. */
export const NIGHT_KICKOFF_HOUR = 18;

/** Parse the hour from a "HH:MM[:SS]" time string; null if unparseable. */
export function kickoffHour(kickoffTime: string | null | undefined): number | null {
  if (!kickoffTime) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(kickoffTime.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

export function isNightMatch(kickoffTime: string | null | undefined, thresholdHour = NIGHT_KICKOFF_HOUR): boolean {
  const h = kickoffHour(kickoffTime);
  return h != null && h >= thresholdHour;
}

export type Bi = { en: string; is: string };

/** Coach-facing transition-to-sleep guidance for a night match. */
export function nightMatchGuidance(kickoffTime: string | null | undefined): {
  isNight: boolean;
  kickoff: string | null;
  headline: Bi;
  guidance: Bi;
  evidence: Bi;
} {
  const isNight = isNightMatch(kickoffTime);
  const kickoff = kickoffTime ? kickoffTime.slice(0, 5) : null;
  return {
    isNight,
    kickoff,
    headline: {
      en: `Night kickoff${kickoff ? ` (${kickoff})` : ""} — expect disrupted sleep tonight`,
      is: `Kvöldleikur${kickoff ? ` (${kickoff})` : ""} — búist við skertum svefni í nótt`,
    },
    guidance: {
      en: "The hours between final whistle and bedtime are the key window: protect bedtime, cut late stimulation (screens/caffeine), and offer the breathing reset. Load is done — the lever now is the transition to sleep.",
      is: "Klukkustundirnar milli lokaflauts og háttatíma eru lykilglugginn: verndaðu háttatímann, dragðu úr seinu áreiti (skjár/koffín) og bjóddu öndunar-endurstillinguna. Álagið er búið — vogarstöngin núna er umskiptin í svefn.",
    },
    evidence: {
      en: "STRONG that night football disrupts sleep (~90% report worse sleep, ~90 min less); UNCERTAIN on the autonomic mechanism — so this flags the disruption, not a cause.",
      is: "STERKT að kvöldfótbolti raski svefni (~90% sofa verr, ~90 mín minna); ÓVISST um ósjálfráða aðferð — svo þetta merkir röskunina, ekki orsök.",
    },
  };
}
