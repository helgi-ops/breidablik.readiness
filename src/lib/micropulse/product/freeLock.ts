/**
 * FREE lock — what a club team on the FREE plan may open.
 *
 * FREE = the player's daily check-in, the basic readiness verdict (today's colour + its plain why), the player
 * list and coach↔player messages. Everything else in the coach app is PRO or higher. Trials ended Nov 2026, so
 * every FREE club is locked to this set; paying (PRO/ELITE) opens the rest.
 *
 * It is an ALLOW-list on purpose: hub pages mount other pages' bodies (load-intelligence-hub, strength-hub,
 * programme-library, match-hub), so a block-list of routes would leak through them.
 *
 * Personal-trainer teams are never locked (their own plan model), and PRO/ELITE teams never are.
 * The server uses the same definition: `isFreeLockedTier` in src/lib/micropulse/elite/index.ts.
 */
import { pathMatchesPrefix } from "./routeGating";
import type { MicroPulsePlanKey } from "./types";

/** True for a team the FREE lock applies to. */
export function isFreeLocked(plan: MicroPulsePlanKey | null | undefined, teamType: string | null | undefined): boolean {
  return (plan ?? "FREE") === "FREE" && String(teamType ?? "").toLowerCase() !== "personal_trainer";
}

/** Coach routes a FREE club keeps (prefix-matched). `/coach` itself is handled by tab below. */
export const FREE_COACH_ROUTES: readonly string[] = [
  "/coach/players", // player list + approvals
  "/coach/availability-board", // who's available, today's readiness dot
  "/coach/conversations",
  "/coach/messages",
  "/coach/notifications",
  "/coach/settings",
  "/coach/display", // wall display of today's colours
];

/** Admin-only tools: gated by the admin role, never by the team's plan. */
export const ADMIN_ONLY_ROUTES: readonly string[] = ["/coach/leads", "/coach/usage-analytics", "/coach/admin"];

/** Dashboard tabs on `/coach` that FREE keeps. No tab = Today. */
export const FREE_DASHBOARD_TABS: readonly string[] = ["today"];

/**
 * True when a FREE club must see the upgrade wall instead of this page.
 * `tab` is the `?tab=` value on `/coach` (null = Today).
 */
export function isFreeLockedPath(pathname: string | null | undefined, tab?: string | null): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (!pathMatchesPrefix(path, "/coach")) return false; // only the coach app is gated here
  if (path === "/coach") return tab != null && tab !== "" && !FREE_DASHBOARD_TABS.includes(tab);
  if (ADMIN_ONLY_ROUTES.some((p) => pathMatchesPrefix(path, p))) return false;
  return !FREE_COACH_ROUTES.some((p) => pathMatchesPrefix(path, p));
}

/** Same check for a sidebar href that may carry `?tab=` (e.g. `/coach?tab=squad`). */
export function isFreeLockedHref(href: string): boolean {
  const [path, query] = href.split("?");
  const tab = query ? new URLSearchParams(query).get("tab") : null;
  return isFreeLockedPath(path, tab);
}
