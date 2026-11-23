/**
 * The language a player uses the app in (`players.app_language`, 2026-11-18, review item D). Every strength send
 * stores the Today session in ONE language (`player_today_strength_override.structure`), so it is built in the
 * player's language when the app has reported one. Not known yet → `sendLangFor`: the team's default language, the
 * coach's UI language (hand sends), else English.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AppLang = "EN" | "IS";

export const asAppLang = (v: unknown): AppLang | null => {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return s === "EN" || s === "IS" ? s : null;
};

/** The language to build a player's session in: theirs when known, else the fallback. */
export const sessionLangFor = (playerLang: unknown, fallback: AppLang): AppLang => asAppLang(playerLang) ?? fallback;

/**
 * One rule for every send (contradiction 19, coach's call 2026-11-23): the player's app language, else the team's
 * default language, else the coach's UI language (hand sends only; the automatic send has no coach), else English
 * (CLAUDE.md: English is the default). Before: a hand send fell back to Icelandic, the 4-week block and the
 * corrective send ignored the player's language and fell back to English.
 */
export const sendLangFor = (a: { player?: unknown; team?: unknown; coach?: unknown }): AppLang =>
  asAppLang(a.player) ?? asAppLang(a.team) ?? asAppLang(a.coach) ?? "EN";

/** A team's default language (`teams.default_language`), or null. Best effort: a failed read = null. */
export async function loadTeamDefaultLang(sb: SupabaseClient, teamId: string | null | undefined): Promise<AppLang | null> {
  if (!teamId) return null;
  try {
    const { data } = await sb.from("teams").select("default_language").eq("id", teamId).maybeSingle();
    return asAppLang((data as { default_language?: string | null } | null)?.default_language);
  } catch {
    return null;
  }
}

/** The send language for one player (their app language, their team's, the coach's, English). */
export async function sendLangForPlayer(sb: SupabaseClient, args: { playerId: string; teamId: string | null | undefined; coachLang: unknown }): Promise<AppLang> {
  const [players, team] = await Promise.all([loadPlayerLanguages(sb, [args.playerId]), loadTeamDefaultLang(sb, args.teamId)]);
  return sendLangFor({ player: players.get(args.playerId), team, coach: args.coachLang });
}

/** Known app languages for these players (players with none are left out). Best effort: a failed read = none. */
export async function loadPlayerLanguages(sb: SupabaseClient, playerIds: string[]): Promise<Map<string, AppLang>> {
  const out = new Map<string, AppLang>();
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 200) {
    try {
      const { data, error } = await sb.from("players").select("id, app_language").in("id", ids.slice(i, i + 200));
      if (error) continue;
      for (const r of (data ?? []) as Array<{ id: string; app_language: string | null }>) {
        const l = asAppLang(r.app_language);
        if (l) out.set(r.id, l);
      }
    } catch { /* best effort */ }
  }
  return out;
}
