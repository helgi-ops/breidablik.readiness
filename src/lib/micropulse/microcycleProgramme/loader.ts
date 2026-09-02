import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerStrengthSnapshot } from "../strengthProgramming/loader";
import { loadAthleteProfilesForTeam } from "../playerAnalysis/loadAthleteProfilesForTeam";
import type { QualityId } from "../playerAnalysis/athleteProfile";
import {
  buildMicrocycleProgramme,
  preferredMdForQuality,
  type MicrocycleProgramme,
  type MicrocycleDayInput,
  type MdTag,
  type GapNote,
} from "./index";

/** Plain bilingual labels for the capacity gaps we surface as emphasis. */
const QUALITY_LABEL: Record<QualityId, { en: string; is: string }> = {
  speed: { en: "top speed", is: "hámarkshraði" },
  acceleration: { en: "acceleration", is: "hröðun" },
  deceleration: { en: "deceleration / braking", is: "hraðaminnkun / hemlun" },
  reactive_power: { en: "reactive power", is: "hvatkraftur" },
  max_strength: { en: "maximal strength", is: "hámarksstyrkur" },
  vbt_power: { en: "bar-speed power", is: "stangar-hraða afl" },
  change_of_direction: { en: "change of direction", is: "stefnubreytingar" },
  work_capacity: { en: "work capacity", is: "vinnugeta" },
  mechanical_power: { en: "mechanical power", is: "vélrænt afl" },
  peak_demands: { en: "peak match demands", is: "hámarkskröfur leiks" },
  aerobic_endurance: { en: "aerobic endurance", is: "þolgeta" },
  anaerobic_reserve: { en: "anaerobic reserve", is: "loftfirrð geta" },
  robustness: { en: "robustness / symmetry", is: "styrkur gegn meiðslum / samhverfa" },
};

/** Same rank logic as fn_md_tag: post-match tags win over the nearest future match. */
function mdTagFor(dateMs: number, matchMs: number[]): { tag: MdTag; rank: number } | null {
  const DAY = 86_400_000;
  let best: { tag: MdTag; rank: number } | null = null;
  for (const m of matchMs) {
    const delta = Math.round((m - dateMs) / DAY); // match − date
    let tag: MdTag | null = null; let rank = 99;
    if (delta === 0) { tag = "MD"; rank = 0; }
    else if (delta === -1) { tag = "MD+1"; rank = 1; }
    else if (delta === -2) { tag = "MD+2"; rank = 2; }
    else if (delta >= 1 && delta <= 4) { tag = (`MD-${delta}`) as MdTag; rank = 3 + delta; }
    else if (delta === 5) { tag = "MD-5"; rank = 8; }
    if (tag && rank < (best?.rank ?? 100)) best = { tag, rank };
  }
  return best;
}

/**
 * Assemble a player's MD-periodised microcycle from live data. Returns null when
 * the player has no team. DESCRIPTIVE — reads readiness_entries.color to ease a
 * day, never writes it.
 */
export async function loadMicrocycleProgramme(
  sb: SupabaseClient,
  args: { playerId: string; playerName?: string; teamId: string | null; todayIso: string },
): Promise<MicrocycleProgramme | null> {
  const { playerId, playerName, teamId, todayIso } = args;
  if (!teamId) return null;

  const DAY = 86_400_000;
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  // Base current-state snapshot (mdContext overwritten per day by the engine).
  const baseSnapshot = await loadPlayerStrengthSnapshot(sb, { playerId, playerName, teamId, todayIso });

  // Fixtures around today → MD tags. Window covers post-match (−3d) to a week out.
  const { data: matchRows } = await sb
    .from("match_schedule").select("match_date")
    .eq("team_id", teamId)
    .gte("match_date", iso(todayMs - 3 * DAY))
    .lte("match_date", iso(todayMs + 8 * DAY))
    .order("match_date", { ascending: true });
  const matchMs = ((matchRows ?? []) as Array<{ match_date: string | null }>)
    .map((m) => (m.match_date ? Date.parse(`${m.match_date}T00:00:00Z`) : NaN))
    .filter((n) => Number.isFinite(n));

  // The microcycle runs from today up to (and including) the next match, capped at
  // a week; each day tagged like fn_md_tag. Days outside the MD window are dropped.
  const nextMatchMs = matchMs.find((m) => m >= todayMs) ?? todayMs + 6 * DAY;
  const endMs = Math.min(nextMatchMs, todayMs + 6 * DAY);

  const dayDates: string[] = [];
  for (let ms = todayMs; ms <= endMs; ms += DAY) dayDates.push(iso(ms));

  // Per-day readiness colour (canonical), only for today/past — future has none yet.
  const { data: readRows } = await sb
    .from("readiness_entries").select("entry_date, color")
    .eq("player_id", playerId)
    .gte("entry_date", dayDates[0]).lte("entry_date", dayDates[dayDates.length - 1]);
  const colourByDate = new Map<string, string | null>();
  for (const r of (readRows ?? []) as Array<{ entry_date: string; color: string | null }>) {
    colourByDate.set(r.entry_date, r.color);
  }

  const days: MicrocycleDayInput[] = [];
  for (const date of dayDates) {
    const tagged = mdTagFor(Date.parse(`${date}T00:00:00Z`), matchMs);
    if (!tagged) continue; // outside the MD window (e.g. > MD-5) — not part of the week
    days.push({
      date,
      mdTag: tagged.tag,
      isTodayOrPast: Date.parse(`${date}T00:00:00Z`) <= todayMs,
      readinessColor: colourByDate.get(date) ?? null,
    });
  }

  // Top capacity gaps → emphasis (movement/capacity is ONE input, placed on the
  // day that trains it). athleteProfile.weaknesses = worst-percentile first.
  let topGaps: GapNote[] = [];
  try {
    const { profiles } = await loadAthleteProfilesForTeam(teamId);
    const prof = profiles.get(playerId);
    if (prof?.weaknesses?.length) {
      topGaps = prof.weaknesses.slice(0, 2).map((w) => {
        const q = w.id as QualityId;
        return {
          quality: q,
          source: "capacity" as const,
          label: QUALITY_LABEL[q] ?? { en: q, is: q },
          preferredMd: preferredMdForQuality(q),
        };
      });
    }
  } catch {
    // Profile assembly is best-effort — a missing profile just means no emphasis.
  }

  return buildMicrocycleProgramme({
    baseSnapshot,
    days,
    topGaps,
    weekStart: dayDates[0],
  });
}
