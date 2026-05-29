/**
 * Pre-game taper for athletes.
 *
 * Given the next upcoming game date, ease training load down so the athlete is
 * fresh on match day:
 *
 *   D-0 (game today) → match day: no gym session, freshness priority
 *   D-1 (tomorrow)   → primer only (×0.4 volume)
 *   D-2              → easing down (×0.7 volume)
 *   D-3 or more      → no taper
 *
 * Returns an explainable volume multiplier + a plain-language note so the
 * client always sees WHY today is lighter. Trainer-entered game dates only —
 * the athlete never has to maintain a calendar.
 */

export type GameTaper = {
  days_to_game: number | null;
  is_match_day: boolean;
  volume: number; // multiplier on each exercise's set count (0 on match day)
  label: { IS: string; EN: string } | null;
  note: { IS: string; EN: string } | null;
};

const NONE: GameTaper = { days_to_game: null, is_match_day: false, volume: 1, label: null, note: null };

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** nextGameDateIso = the soonest game on/after today, or null if none. */
export function computeGameTaper(nextGameDateIso: string | null, todayIso: string): GameTaper {
  if (!nextGameDateIso) return NONE;
  const d = daysBetween(todayIso, nextGameDateIso);
  if (d < 0) return NONE; // game already passed (caller should filter, belt-and-braces)

  if (d === 0) {
    return {
      days_to_game: 0,
      is_match_day: true,
      volume: 0,
      label: { IS: "Leikdagur", EN: "Match day" },
      note: { IS: "Leikdagur — haltu þér ferskum. Engin lyftingaæfing í dag.", EN: "Match day — keep fresh. No gym session today." },
    };
  }
  if (d === 1) {
    return {
      days_to_game: 1,
      is_match_day: false,
      volume: 0.4,
      label: { IS: "Leikur á morgun", EN: "Game tomorrow" },
      note: { IS: "Leikur á morgun — aðeins léttur primer, haltu ferskleika.", EN: "Game tomorrow — light primer only, stay fresh." },
    };
  }
  if (d === 2) {
    return {
      days_to_game: 2,
      is_match_day: false,
      volume: 0.7,
      label: { IS: "2 dagar í leik", EN: "2 days to game" },
      note: { IS: "2 dagar í leik — róum aðeins niður.", EN: "2 days to game — easing the load down." },
    };
  }
  return { ...NONE, days_to_game: d };
}
