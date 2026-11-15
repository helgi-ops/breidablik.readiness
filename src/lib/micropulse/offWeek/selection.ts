/**
 * Which players the coach has ticked in the off-week modal (send to app / one PDF for the picked).
 * Pure helpers so the modal's rules are tested: everyone is picked on first load; ticks survive a
 * regenerate (days / gym change); a player no longer in the list drops out of the pick.
 */

/**
 * The pick after the list (re)loads. `prev` null = nothing chosen yet → everyone. An empty set the coach
 * cleared stays empty. If none of the previous picks is in the new list (e.g. another team), everyone.
 */
export function nextPicked(prev: ReadonlySet<string> | null, ids: string[]): Set<string> {
  if (prev == null) return new Set(ids);
  if (prev.size === 0) return new Set();
  const kept = ids.filter((id) => prev.has(id));
  return new Set(kept.length ? kept : ids);
}

/** File name for the PDF of the picked players: the team pack when everyone is picked. */
export function packFilename(pickedCount: number, total: number): string {
  return pickedCount >= total ? "off-week-team-pack.pdf" : `off-week-${pickedCount}-players.pdf`;
}
