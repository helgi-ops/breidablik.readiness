/**
 * Finds "Author Year" citations in text ("Carling 2018", "van der Horst 2015", "Hoff & Helgerud 2004",
 * "Sáez de Villarreal 2009"). Used by the reference test and the script that writes docs/heimildir-aefingakerfis.md.
 */

/** Where the training-programme rules live (the scope of `RULE_REFS`). */
export const RULE_CODE_DIRS = [
  "src/lib/micropulse/strengthProgramming",
  "src/lib/micropulse/planIntent",
  "src/lib/micropulse/goalPlan",
  "src/lib/micropulse/periodization",
  "src/lib/micropulse/plannedSessionLoad.ts",
] as const;

const SHORT_RE =
  /(?:\p{Lu}[\p{L}]+ de |(?:Los|van der|van|de|di|dos) )?\p{Lu}[\p{L}'’-]+(?: et al\.?)?(?: & \p{Lu}[\p{L}'’-]+)? \(?(?:19|20)\d{2}[ab]?\b/gu;

/**
 * Words that sit before a year without being an author: journal abbreviations inside full references
 * ("Sports Med 2016"), months and labels ("Nov 2026", "Season 2026").
 */
const NOT_AUTHORS = new Set([
  "Med", "Res", "Perform", "Sports", "Sport", "Exerc", "PeerJ", "Kinet", "Physiol", "Psychol", "Health", "ISBS",
  "Cond", "Football", "One", "Rehabil", "Ther", "Train", "Sci", "Rep", "Open", "Nov", "Oct", "Jan", "Season",
  "Since", "Until", "Yellow", "VERSION", "Library", "Safety", "DSI", "Coach", "Endurgreining", "Breiðabliks",
]);

export function citationsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(SHORT_RE)) {
    const s = m[0].replace("(", "");
    const first = s.split(" ")[0];
    if (NOT_AUTHORS.has(first)) continue;
    out.add(s);
  }
  return [...out];
}
