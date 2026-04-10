/**
 * Shared helpers for rendering team labels consistently across the app.
 *
 * The `teams` table has multiple rows with the same `name` (e.g. four
 * "Fjölnir" entries across different sport/gender combinations). When
 * users see these in a dropdown, they can't tell them apart without the
 * sport and gender being included in the label.
 *
 * Use `formatTeamLabel()` for any team <option> / dropdown item rendering.
 */

export type TeamLabelLang = "IS" | "EN";

export interface TeamLabelInput {
  name: string;
  sport?: string | null;
  gender?: string | null;
}

// Human-readable sport names by language.
const SPORT_LABELS: Record<TeamLabelLang, Record<string, string>> = {
  IS: {
    football: "Fótbolti",
    basketball: "Körfubolti",
    handball: "Handbolti",
  },
  EN: {
    football: "Football",
    basketball: "Basketball",
    handball: "Handball",
  },
};

// Human-readable gender names by language.
//   M / male  -> Karlar / Men
//   F / female -> Konur  / Women
//   mixed     -> Blandað / Mixed
const GENDER_LABELS: Record<TeamLabelLang, Record<string, string>> = {
  IS: {
    M: "KK",
    male: "KK",
    F: "KVK",
    female: "KVK",
    mixed: "Blandað",
  },
  EN: {
    M: "M",
    male: "M",
    F: "W",
    female: "W",
    mixed: "Mixed",
  },
};

export function sportLabel(sport: string | null | undefined, lang: TeamLabelLang = "IS"): string | null {
  if (!sport) return null;
  return SPORT_LABELS[lang][sport] ?? sport;
}

export function genderLabel(gender: string | null | undefined, lang: TeamLabelLang = "IS"): string | null {
  if (!gender) return null;
  return GENDER_LABELS[lang][gender] ?? gender;
}

/**
 * Format a team label like "Fjölnir · Fótbolti · KK".
 * Omits sections that are missing so smaller labels still look clean.
 */
export function formatTeamLabel(
  team: TeamLabelInput,
  lang: TeamLabelLang = "IS",
): string {
  const parts: string[] = [team.name];
  const sp = sportLabel(team.sport, lang);
  const gn = genderLabel(team.gender, lang);
  if (sp) parts.push(sp);
  if (gn) parts.push(gn);
  return parts.join(" · ");
}
