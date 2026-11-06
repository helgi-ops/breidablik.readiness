import type { ResearchDrillRow } from "./dayDrillSheet";

/** The football research drill bank for a PDF export (`/api/public/drill-library`, readable by any signed-in
 *  coach). A failed read gives an empty list, so the export still prints the day ideas instead of failing. */
export async function fetchResearchDrills(authorization: string): Promise<ResearchDrillRow[]> {
  try {
    const res = await fetch("/api/public/drill-library?sport=football", { headers: { Authorization: authorization } });
    if (!res.ok) return [];
    const j = (await res.json()) as { templates?: ResearchDrillRow[] };
    return Array.isArray(j.templates) ? j.templates : [];
  } catch {
    return [];
  }
}
