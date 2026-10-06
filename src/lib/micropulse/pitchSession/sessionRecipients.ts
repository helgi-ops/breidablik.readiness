import { positionGroup, positionGroupsForSport } from "@/lib/micropulse/positionStyle";

/**
 * Shared, pure recipient-resolution for sending a built pitch session to the
 * player app. Used by BOTH the inline picker in SessionBuilder and the send
 * dialog, so the two surfaces can never disagree on who gets the session.
 */

export type RosterRow = { id: string; full_name: string; position: string | null };

export type RecipientGroup = { key: string; en: string; is: string; count: number };

/** The sport's position groups that actually have players, with counts. */
export function groupsWithCounts(
  roster: RosterRow[],
  teamSport?: string | null
): RecipientGroup[] {
  const groups = positionGroupsForSport(teamSport);
  const counts = new Map<string, number>();
  for (const p of roster) {
    const key = positionGroup(p.position, teamSport);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return groups
    .map((g) => ({ ...g, count: counts.get(g.key) ?? 0 }))
    .filter((g) => g.count > 0);
}

/**
 * Resolve the current selection to a list of players.id. `null` means the whole
 * team (the stored `recipient_player_ids` default). `sendGroup` is "all" |
 * a position-group key | "custom".
 */
export function resolveRecipientIds(
  sendGroup: string,
  customIds: ReadonlySet<string>,
  roster: RosterRow[],
  teamSport?: string | null
): string[] | null {
  if (sendGroup === "all") return null;
  if (sendGroup === "custom") return Array.from(customIds);
  return roster
    .filter((p) => positionGroup(p.position, teamSport) === sendGroup)
    .map((p) => p.id);
}

/** How many players the current selection reaches (whole team → roster size). */
export function recipientCountOf(
  recipientIds: string[] | null,
  rosterSize: number
): number {
  return recipientIds == null ? rosterSize : recipientIds.length;
}
