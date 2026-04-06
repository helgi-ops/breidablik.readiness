import type { ValdAthleteSummary } from "./types";

// ---------------------------------------------------------------------------
// Legacy team-scope constants (Breiðablik-specific, kept for reference only).
// Production sync no longer uses these — see filterValdAthletesToMicroPulseRoster.
// ---------------------------------------------------------------------------
const _LEGACY_MENS_SCOPE_MATCHES = [
  "breiðablik fc - men's teams",
  "breidablik fc - men's teams",
  "breiðablik fc mens teams",
  "breidablik fc mens teams",
  "breiðablik men's teams",
  "breidablik men's teams",
  "breiðablik mens teams",
  "breidablik mens teams",
];

const _LEGACY_WOMENS_SCOPE_MATCHES = [
  "women",
  "women's",
  "womens",
  "kvenna",
  "kvennalið",
  "kvennaliðið",
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function athleteSearchText(athlete: ValdAthleteSummary): string {
  const rawText = athlete.raw ? JSON.stringify(athlete.raw) : "";
  return normalizeText([
    athlete.fullName,
    athlete.email,
    athlete.externalRef,
    athlete.teamName,
    athlete.groupName,
    athlete.genderLabel,
    rawText,
  ].filter(Boolean).join(" | "));
}

// ---------------------------------------------------------------------------
// Legacy exports — not called by production sync, preserved for compatibility.
// ---------------------------------------------------------------------------

/** @deprecated Use filterValdAthletesToMicroPulseRoster instead. */
export function isBreidablikMensTeamAthlete(athlete: ValdAthleteSummary): boolean {
  const haystack = athleteSearchText(athlete);
  if (!haystack) return true;
  const matchesMensScope = _LEGACY_MENS_SCOPE_MATCHES.some((pattern) => haystack.includes(pattern));
  if (matchesMensScope) return true;
  const matchesWomenScope = _LEGACY_WOMENS_SCOPE_MATCHES.some((pattern) => haystack.includes(pattern));
  if (matchesWomenScope) return false;
  return true;
}

/** @deprecated Use filterValdAthletesToMicroPulseRoster instead. */
export function filterBreidablikMensTeamAthletes(athletes: ValdAthleteSummary[]): ValdAthleteSummary[] {
  return athletes.filter(isBreidablikMensTeamAthlete);
}

// ---------------------------------------------------------------------------
// Name-matching utilities (sport-agnostic)
// ---------------------------------------------------------------------------

function slugifyName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeName(value: string): string[] {
  return slugifyName(value).split(/\s+/).filter(Boolean);
}

function sharedTokenCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((token) => setB.has(token)).length;
}

/**
 * Returns true if the VALD athlete name probably matches one of the
 * MicroPulse players by fuzzy name comparison. Sport-agnostic.
 */
export function probablyMatchesMicroPulsePlayer(
  athlete: ValdAthleteSummary,
  players: Array<{ id: string; name: string }>
): boolean {
  const athleteName = athlete.fullName?.trim();
  if (!athleteName) return false;
  const athleteTokens = tokenizeName(athleteName);
  if (!athleteTokens.length) return false;
  return players.some((player) => {
    const playerName = player.name?.trim();
    if (!playerName) return false;
    const playerTokens = tokenizeName(playerName);
    if (!playerTokens.length) return false;
    const shared = sharedTokenCount(athleteTokens, playerTokens);
    return shared >= 2 || slugifyName(athleteName) === slugifyName(playerName);
  });
}

/** @deprecated Use filterValdAthletesToMicroPulseRoster instead. */
export function filterBreidablikMensTeamCandidates(
  athletes: ValdAthleteSummary[],
  players: Array<{ id: string; name: string }>
): ValdAthleteSummary[] {
  return athletes.filter((athlete) => probablyMatchesMicroPulsePlayer(athlete, players) || isBreidablikMensTeamAthlete(athlete));
}

/**
 * Primary filter for VALD → MicroPulse sync.
 * Matches athletes to the team roster by name — works for any sport or club.
 */
export function filterValdAthletesToMicroPulseRoster(
  athletes: ValdAthleteSummary[],
  players: Array<{ id: string; name: string }>
): ValdAthleteSummary[] {
  return athletes.filter((athlete) => probablyMatchesMicroPulsePlayer(athlete, players));
}
