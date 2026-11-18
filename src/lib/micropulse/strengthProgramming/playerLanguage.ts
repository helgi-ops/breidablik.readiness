/**
 * The language a player uses the app in (`players.app_language`, 2026-11-18, review item D). Every strength send
 * stores the Today session in ONE language (`player_today_strength_override.structure`), so it is built in the
 * player's language when the app has reported one. Null = not known yet → the caller's fallback (the coach's UI
 * language for a hand send; the team's default language, else English, for the automatic send).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AppLang = "EN" | "IS";

export const asAppLang = (v: unknown): AppLang | null => {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return s === "EN" || s === "IS" ? s : null;
};

/** The language to build a player's session in: theirs when known, else the fallback. */
export const sessionLangFor = (playerLang: unknown, fallback: AppLang): AppLang => asAppLang(playerLang) ?? fallback;

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
