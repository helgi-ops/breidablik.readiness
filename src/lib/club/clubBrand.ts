/**
 * The club's own name and logo for branded exports (KSÍ report, transfer dossier).
 *
 * Source: `teams.club_short_name` / `teams.name` and `teams.club_logo_url` (set under
 * Settings → Club branding). Breiðablik squads keep the crest shipped in `public/` when
 * they have no logo saved, or when the saved one can't be read, so their reports look
 * as before. Another club never gets Breiðablik's crest: no readable logo → no logo.
 *
 * react-pdf only embeds PNG/JPEG and silently drops anything else (a missing file, SVG,
 * WebP), so each candidate is checked before it goes into the PDF.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClubBrand = { name: string; logoUrl: string | null };

export const BREIDABLIK_LOGO = "/breidablik-ubk-vector-logo.png";

type TeamBrandRow = { name?: string | null; club_short_name?: string | null; club_logo_url?: string | null };

function isBreidablik(name: string): boolean {
  return /brei[ðd]ablik/i.test(name);
}

/** Logos to try, best first: the club's saved logo, then (Breiðablik only) the shipped crest. */
export function clubLogoCandidates(team: TeamBrandRow | null | undefined): string[] {
  const saved = (team?.club_logo_url ?? "").trim();
  const out = saved ? [saved] : [];
  if (isBreidablik((team?.name ?? "").trim())) out.push(BREIDABLIK_LOGO);
  return out;
}

/** Name + first logo candidate, without checking the logo can be read. */
export function resolveClubBrand(team: TeamBrandRow | null | undefined): ClubBrand {
  const fullName = (team?.name ?? "").trim();
  const name = (team?.club_short_name ?? "").trim() || fullName;
  return { name, logoUrl: clubLogoCandidates(team)[0] ?? null };
}

type Fetcher = (url: string) => Promise<{ ok: boolean; headers: { get(name: string): string | null } }>;

/** First candidate that loads as a PNG or JPEG (what react-pdf can embed), else null. */
export async function pickReadableLogo(candidates: string[], fetcher: Fetcher = (u) => fetch(u)): Promise<string | null> {
  for (const url of candidates) {
    try {
      const res = await fetcher(url);
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (res.ok && /image\/(png|jpe?g)/.test(type)) return url;
    } catch {
      // unreachable → try the next one
    }
  }
  return null;
}

/** The signed-in coach's current team, as a brand with a logo the PDF can embed. */
export async function fetchMyClubBrand(sb: SupabaseClient): Promise<ClubBrand | null> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return null;
  const { data } = await sb.from("teams").select("name, club_short_name, club_logo_url").eq("id", teamId).maybeSingle();
  const team = data as TeamBrandRow | null;
  return { name: resolveClubBrand(team).name, logoUrl: await pickReadableLogo(clubLogoCandidates(team)) };
}
