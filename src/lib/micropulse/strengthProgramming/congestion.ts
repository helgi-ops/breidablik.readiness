/**
 * Congested week (coach's call 2026-11-23, contradiction 8): two matches in 7 days, with today in those 7 days. Pure.
 *
 * Which matches count:
 *   - today and later: every team fixture (match_schedule). Nobody has minutes for a match not yet played, and the
 *     next match is what the week protects.
 *   - before today: a match the player played 60 minutes or more of (match_player_minutes). A match he sat out did not
 *     tire him.
 *
 * "In 7 days": the two matches and today all fit in one 7-day span (the later date at most 6 days after the earlier).
 * Two matches in 7 days is the usual definition of a congested schedule in the fixture-congestion studies (e.g.
 * Dupont 2010: two matches a week, recovery 72–96 h). The 60 minutes and the "today in the span" are MicroPulse's rule.
 */

export const CONGESTION_SPAN_DAYS = 7;
export const CONGESTION_PAST_MIN_MINUTES = 60;

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

/**
 * @param fixtures  the team's match dates (any range; only today − 6 … today + 6 matter)
 * @param playedPast  dates (before today) the player played ≥ 60 minutes
 */
export function isCongestedWeek(fixtures: string[], playedPast: string[], todayIso: string): boolean {
  const t = dayNum(todayIso);
  const span = CONGESTION_SPAN_DAYS - 1;
  const days = new Set<number>();
  for (const d of fixtures) { const n = dayNum(d); if (n >= t && n <= t + span) days.add(n); }
  for (const d of playedPast) { const n = dayNum(d); if (n < t && n >= t - span) days.add(n); }
  const sorted = [...days].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const lo = Math.min(sorted[i], t), hi = Math.max(sorted[j], t);
      if (hi - lo <= span) return true;
    }
  }
  return false;
}
