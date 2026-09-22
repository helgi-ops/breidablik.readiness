/** Strip a leading date prefix from a drill name, keeping the descriptive part.
 *  Handles both observed formats:
 *    "2026-03-27 · Æf · 10v10+GK possession"   → "10v10+GK possession"
 *    "2026-02-03 MD-4 – Reitur"                → "Reitur"
 *  Leaves already-clean names untouched. Never returns empty (falls back to the input). */
export function normalizeDrillName(raw: string): string {
  const s = (raw ?? "").trim();
  const stripped = s
    .replace(/^\s*\d{4}-\d{2}-\d{2}\s*(·\s*[^·–]*·|[^·–]*–)\s*/, "")
    .trim();
  return stripped.length ? stripped : s; // never blank out a name
}
