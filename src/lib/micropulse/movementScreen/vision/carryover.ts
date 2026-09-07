/**
 * Carry-over bridge from the AI movement analysis into the assessment — a body
 * region + its priority field ids, passed via sessionStorage + a window event so
 * any assessment surface on the page (the test screen, the region form) can pick
 * it up. Client-only glue; no DB, never the readiness colour.
 */
import type { RegionKey } from "./regions";

export const MOVEMENT_CARRYOVER_KEY = "micropulse:movement-carryover";
export const MOVEMENT_CARRYOVER_EVENT = "micropulse:movement-carryover";

export type MovementCarryover = { region: RegionKey; priorityFieldIds: string[] };

export function carryOverMovement(region: RegionKey, priorityFieldIds: string[]) {
  const detail: MovementCarryover = { region, priorityFieldIds };
  try { sessionStorage.setItem(MOVEMENT_CARRYOVER_KEY, JSON.stringify({ ...detail, ts: Date.now() })); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(MOVEMENT_CARRYOVER_EVENT, { detail })); } catch { /* older browser */ }
}
