/**
 * The three strength send modes (2026-11-17). Pure and client-safe.
 *
 *   standard              — the team's Custom Programme (what the coach authored; any length). Players choose nothing.
 *   individualised        — data + screen: each player's own session (readiness, MD day, movement screen, the
 *                           player's data). Players choose nothing.
 *   individualised_goals  — data + screen + goals: as above, and the players take part: exercise picks, a strength
 *                           goal, 8-week goals that start without approval, and the goal's gym session inside Today's
 *                           session. Mostly a pre-/off-season mode (the strength goal's extra set only comes then).
 *
 * The team's mode (`teams.strength_send_mode`) is the ONE switch for player choices. Per player the coach can take
 * someone out on the goals mode (`choices_off`) or let one player in on another mode (`test_enabled`, e.g. a test).
 */

export type SendMode = "standard" | "individualised" | "individualised_goals";

export const SEND_MODES: readonly SendMode[] = ["standard", "individualised", "individualised_goals"];

/** Unknown / missing → individualised (the product default, as before). */
export function normalizeSendMode(v: unknown): SendMode {
  return v === "standard" || v === "individualised_goals" ? v : "individualised";
}

/** Is this a valid mode value (for request bodies)? */
export function isSendMode(v: unknown): v is SendMode {
  return v === "standard" || v === "individualised" || v === "individualised_goals";
}

/** The coach's setting for one player. `on` = let in on another mode; `off` = taken out of the goals mode. */
export type PlayerChoiceSetting = { on?: boolean | null; off?: boolean | null };

/**
 * Does this player take part (choose goals / exercises) under `mode`?
 * - Standard: never (the coach's programme is the session).
 * - Goals mode: everyone, unless the coach took the player out.
 * - Individualised: only a player the coach let in.
 */
export function takesPart(mode: SendMode, s: PlayerChoiceSetting | null | undefined): boolean {
  if (mode === "standard") return false;
  if (mode === "individualised_goals") return !s?.off;
  return !!s?.on;
}

/** The mode a player's session is built in, given the mode of the send. */
export function buildModeFor(mode: SendMode, s: PlayerChoiceSetting | null | undefined): SendMode {
  if (mode === "standard") return "standard";
  return takesPart(mode, s) ? "individualised_goals" : "individualised";
}

/** One plain line per mode, for the coach (EN default, IS). */
export const SEND_MODE_TEXT: Record<SendMode, { label: { en: string; is: string }; line: { en: string; is: string } }> = {
  standard: {
    label: { en: "Standard (Custom Programme)", is: "Staðlað (æfingakerfi liðsins)" },
    line: {
      en: "Everyone gets the programme you built in Custom Programmes. It can be as long as you want.",
      is: "Allir fá æfingakerfið sem þú settir inn í Custom Programmes. Það má vera eins langt og þú vilt.",
    },
  },
  individualised: {
    label: { en: "Individualised (data + screen)", is: "Einstaklingsmiðað (gögn + skimun)" },
    line: {
      en: "Each player gets their own session from their data and movement screen. Players choose nothing.",
      is: "Hver leikmaður fær sína æfingu út frá gögnum og skimun. Leikmenn velja ekkert.",
    },
  },
  individualised_goals: {
    label: { en: "Individualised + goals", is: "Einstaklingsmiðað + markmið" },
    line: {
      en: "The same, and players choose a goal and exercises. Mostly for off- and pre-season: in season the session is maintenance and the goal is kept.",
      is: "Eins, og leikmenn velja sér markmið og æfingar. Aðallega fyrir hvíldar- og undirbúningstímabil: á tímabili er æfingin viðhald og markmiðið geymt.",
    },
  },
};
