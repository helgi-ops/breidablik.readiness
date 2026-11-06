import type { DrillLibraryRow } from "./dayDrillSheet";

/** The coach's drill library for a PDF export: own + team + public, the team's sport, archived left out
 *  (`/api/coach/drill-library?scope=all`). A failed read gives an empty list, so the export still prints
 *  the day ideas instead of failing. */
export async function fetchDrillLibrary(authorization: string): Promise<DrillLibraryRow[]> {
  try {
    const res = await fetch("/api/coach/drill-library?scope=all", { headers: { Authorization: authorization } });
    if (!res.ok) return [];
    const j = (await res.json()) as { drills?: DrillLibraryRow[] };
    return Array.isArray(j.drills) ? j.drills : [];
  } catch {
    return [];
  }
}
