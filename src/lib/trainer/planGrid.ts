/**
 * Plan builder grid: when the trainer changes "weeks" or "sessions per week",
 * the grid follows — without losing what is already built.
 *
 *   - More weeks: each new week starts as a copy of the last week (adjust, don't rebuild).
 *   - Fewer weeks: weeks are taken off the end.
 *   - More sessions a week: empty sessions are added at the end of every week.
 *   - Fewer sessions a week: sessions are taken off the end of every week.
 *
 * Before this the grid was only built once (on open), so changing the inputs
 * changed the saved header but not the plan itself.
 */

export type GridWeek<S> = { week: number; sessions: S[] };

export function resizePlanWeeks<S>(
  weeks: readonly GridWeek<S>[],
  durationWeeks: number,
  sessionsPerWeek: number,
  makeSession: (dayOfWeek: number) => S,
): GridWeek<S>[] {
  const nWeeks = Math.max(1, Math.floor(durationWeeks));
  const nSessions = Math.max(1, Math.floor(sessionsPerWeek));

  const out: GridWeek<S>[] = [];
  for (let w = 0; w < nWeeks; w++) {
    const src = weeks[w] ?? weeks[weeks.length - 1];
    const sessions: S[] = src
      ? (weeks[w] ? src.sessions.slice() : src.sessions.map((s) => structuredClone(s)))
      : [];
    while (sessions.length < nSessions) sessions.push(makeSession(sessions.length + 1));
    sessions.length = Math.min(sessions.length, nSessions);
    out.push({ week: w + 1, sessions });
  }
  return out;
}

/** Per-week percentages (deload / recovery) padded or cut to the week count. */
export function resizePerWeek(values: readonly number[], durationWeeks: number, fill: number): number[] {
  const n = Math.max(1, Math.floor(durationWeeks));
  return Array.from({ length: n }, (_, i) => values[i] ?? fill);
}
