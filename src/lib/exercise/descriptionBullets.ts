/**
 * Split an exercise description into readable bullet points.
 *
 * Authored descriptions are a single flowing paragraph (setup → execution →
 * cues → common faults). Reading that as a wall of text is tiring, so we split
 * it: explicit line breaks first, otherwise sentence boundaries. Short
 * one-sentence descriptions simply return a single item. Pure rendering — the
 * stored text is untouched.
 */
export function splitDescription(text?: string | null): string[] {
  if (!text) return [];
  const t = text.trim();
  if (!t) return [];
  // Prefer explicit line breaks if the author used them.
  const byLine = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  // Otherwise split on sentence boundaries: . ! ? (or ; before a label) followed
  // by whitespace and a capital / opening quote / bracket. Handles IS letters.
  return t
    .split(/(?<=[.!?])\s+(?=[A-ZÁÐÉÍÓÚÝÞÆÖ“„"(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}
