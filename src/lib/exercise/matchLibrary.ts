/**
 * Conservative exercise-name → library matcher.
 *
 * Curated programmes (pt-explosive) name exercises freely: emoji/number
 * prefixes ("1️⃣ Heavy Back Squat"), parenthetical qualifiers ("(deep)"),
 * alternatives ("Back / Goblet Squat"), and abbreviations ("DB", "Med-ball",
 * "Hex-bar", "RDL"). Many are specialised drills/tests (depth jumps, bounds,
 * sprints, agility) that are deliberately NOT in the strength library.
 *
 * We only attach an explanation when a confident BASE-exercise match exists —
 * a wrong description would be worse than none. Normalisation strips the noise
 * and applies a small alias map, then does an exact lookup against the library
 * (English + Icelandic names). No fuzzy "starts-with" guessing.
 */

export type GlossaryEntry = {
  name: string;
  name_is: string | null;
  description: string | null;
  description_is: string | null;
};

/** Normalise a free-text exercise name to a comparable key (or "" if nothing usable). */
export function normalizeExerciseName(raw: string): string {
  if (!raw) return "";
  // Take the first variant only — drop parentheticals, arrows, "/" alternatives,
  // commas and "w/" qualifiers so "Back Squat (deep)" and "Back / Goblet Squat"
  // resolve to their lead base exercise.
  let s = raw.toLowerCase().split(/\(|→|->|\/|,| w\/| with /)[0];
  // Strip emoji / numbering / punctuation to spaces.
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  // Alias normalisation (collapse equivalent terms BEFORE stripping spaces).
  s = s
    .replace(/\bmedicine ball\b/g, "medball")
    .replace(/\bmed ball\b/g, "medball")
    .replace(/\bmb\b/g, "medball")
    .replace(/\bhex bar\b/g, "trapbar")
    .replace(/\btrap bar\b/g, "trapbar")
    .replace(/\brdl\b/g, "romaniandeadlift")
    .replace(/\boh press\b/g, "overheadpress")
    .replace(/\bdb\b/g, "")
    .replace(/\bbb\b/g, "");
  // Drop leading digits left by emoji keycaps ("1️⃣ Heavy Back Squat" → "Heavy …").
  s = s.replace(/^[0-9\s]+/, "");
  // Drop leading load/intent qualifiers ("Heavy Back Squat" → "Back Squat").
  // These describe how the SAME exercise is loaded, not a different exercise.
  s = s.replace(/^(?:\s*(heavy|light|explosive|reactive|loaded|max|maximal|deep)\b)+/g, "");
  // Collapse to alnum.
  return s.replace(/[^a-z0-9]/g, "");
}

/** Extra hand-curated aliases for confident matches the normaliser misses. */
const EXTRA_ALIASES: Record<string, string> = {
  // programme-key (normalised) → library name (exact)
  nordic: "Nordic Hamstring Curl",
  nordichamstring: "Nordic Hamstring Curl",
  conventionaldeadlift: "Deadlift",
  countermovementjump: "Squat Jump", // closest library analogue for a CMJ cue
};

export type ExerciseIndex = Map<string, GlossaryEntry>;

/** Build a lookup index from the library glossary. */
export function buildExerciseIndex(entries: GlossaryEntry[]): ExerciseIndex {
  const idx: ExerciseIndex = new Map();
  for (const e of entries) {
    const keys = [normalizeExerciseName(e.name)];
    if (e.name_is) keys.push(normalizeExerciseName(e.name_is));
    for (const k of keys) if (k && !idx.has(k)) idx.set(k, e);
  }
  // Apply curated aliases (only if the target library exercise exists).
  const byName = new Map(entries.map((e) => [e.name, e]));
  for (const [aliasKey, libName] of Object.entries(EXTRA_ALIASES)) {
    const target = byName.get(libName);
    if (target && !idx.has(aliasKey)) idx.set(aliasKey, target);
  }
  return idx;
}

/** Resolve a free-text name to a library entry, or null when no confident match. */
export function resolveExercise(name: string, idx: ExerciseIndex): GlossaryEntry | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  const hit = idx.get(key);
  if (hit) return hit;
  // Plural fallback: "Pull-ups" → "pullup", "Drop jumps" → "dropjump".
  if (key.length > 4 && key.endsWith("s")) {
    const singular = idx.get(key.slice(0, -1));
    if (singular) return singular;
  }
  return null;
}
