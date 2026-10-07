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

/* ── Named teams / squad split ───────────────────────────────────────────────
 * A session can carry an explicit split of the training squad into named teams
 * (e.g. possession units). Each player is in at most one team. The flat delivery
 * list (`recipient_player_ids`) is the UNION of every team's players.
 */

export type SessionGroup = { id: string; name: string; player_ids: string[] };

/** The unique union of every team's players — the flat delivery list. */
export function unionOfGroups(groups: SessionGroup[]): string[] {
  const seen = new Set<string>();
  for (const g of groups) for (const id of g.player_ids) if (id) seen.add(id);
  return Array.from(seen);
}

/** player id → team id (last team wins; the editor enforces one team per player). */
export function assignmentMap(groups: SessionGroup[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) for (const id of g.player_ids) m.set(id, g.id);
  return m;
}

/**
 * Server-side sanitiser: trims names, keeps only uuid player ids, enforces one
 * team per player (first assignment wins), drops empty teams, and caps sizes.
 * Returns null when there is no real split (→ whole team, no labels).
 */
export function sanitizeGroups(
  raw: unknown,
  isUuid: (s: string) => boolean
): SessionGroup[] | null {
  if (!Array.isArray(raw)) return null;
  const assigned = new Set<string>();
  const out: SessionGroup[] = [];
  for (const g of raw.slice(0, 12)) {
    if (!g || typeof g !== "object") continue;
    const rec = g as Record<string, unknown>;
    const name = String(rec.name ?? "").trim().slice(0, 40);
    const id = String(rec.id ?? "").trim().slice(0, 64) || `g${out.length + 1}`;
    const ids = Array.isArray(rec.player_ids)
      ? rec.player_ids.filter((x): x is string => typeof x === "string" && isUuid(x))
      : [];
    const unique: string[] = [];
    for (const pid of ids.slice(0, 200)) {
      if (assigned.has(pid)) continue; // one team per player
      assigned.add(pid);
      unique.push(pid);
    }
    if (unique.length === 0) continue; // drop empty teams
    out.push({ id, name: name || id, player_ids: unique });
  }
  return out.length > 0 ? out : null;
}
