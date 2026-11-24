/**
 * Position-aware context for the basketball indoor-load surface — descriptive only.
 *
 * Zhang et al. 2026 (J Strength Cond Res 40(5):e472–e478; PMID 41432633) showed that in collegiate
 * basketball, player characteristics shape both external load and PERCEIVED effort/wellness: minutes
 * drive PlayerLoad and RPE, and centres report lower RPE than forwards and higher well-being than
 * guards. So a guard's session and a big's session are not read on the same scale — which is exactly
 * why the indoor-load surface already scores every player on their OWN 28-day norm, never across
 * positions. This module adds the position as reading context (a chip + a cited note); it is never a
 * verdict, never the readiness colour, and makes no injury/performance-prediction claim.
 */

export type PositionFamily = "guard" | "wing" | "big";

/** Citation for the position-aware context (collegiate basketball load × player characteristics). */
export const POSITION_LOAD_CITATION = "Zhang et al. 2026";

/** Fold a free-text position into guard / wing / big, or null when no position is set. */
export function basketballFamily(position: string | null | undefined): PositionFamily | null {
  const p = String(position ?? "").toUpperCase().trim();
  if (!p) return null;
  if (/\bC\b|PF|CENTER|CENTRE|POWER|BIG/.test(p)) return "big";
  if (/PG|SG|\bG\b|GUARD|POINT|SHOOT|BACKCOURT/.test(p)) return "guard";
  return "wing"; // SF / F / forward / wing / anything else
}

/** Short family label for the position chip. */
export function familyLabel(family: PositionFamily, isEN: boolean): string {
  if (family === "guard") return isEN ? "Guard" : "Bakvörður";
  if (family === "big") return isEN ? "Big" : "Miðherji";
  return isEN ? "Wing" : "Vængur";
}

/** One-line descriptive note for a family — how load / perceived effort tends to differ, always
 *  pointing back to the player's own norm. Perceived-effort part cited to Zhang et al. 2026; the movement-load part is MicroPulse's reading. */
export function positionLoadNote(family: PositionFamily, isEN: boolean): string {
  if (family === "guard") {
    return isEN
      ? "Guards accumulate more accelerations and change-of-direction, and perceived effort runs differently than for bigs — read on their own norm."
      : "Bakverðir safna fleiri hröðunum og stefnubreytingum, og upplifað álag er annað en hjá miðherjum — lesið á þeirra eigin viðmiðun.";
  }
  if (family === "big") {
    return isEN
      ? "Bigs log fewer high-intensity change-of-direction but more jumps and contacts, and tend to report lower perceived effort than wings and guards — read on their own norm."
      : "Miðherjar fá færri háákefðar stefnubreytingar en fleiri stökk og snertingar, og gefa oft lægra upplifað álag en vængir og bakverðir — lesið á þeirra eigin viðmiðun.";
  }
  return isEN
    ? "Wings sit between guards and bigs on movement load — read on their own norm."
    : "Vængir liggja milli bakvarða og miðherja í hreyfiálagi — lesið á þeirra eigin viðmiðun.";
}

/** The general interpretive line for the surface's "how to read" panel (cited). */
export function positionGeneralNote(isEN: boolean): string {
  return isEN
    ? "Position shapes perceived effort: in one college study, centres reported lower RPE than forwards and higher well-being than guards (Zhang et al. 2026). Guards tend to log more accel / change-of-direction and bigs more jumps and contacts (MicroPulse's reading, not from that study). That is why every read here is on the player's OWN 28-day norm, never across positions."
    : "Leikstaða mótar upplifað álag: í einni háskólarannsókn gáfu miðherjar lægra RPE en framherjar og meiri vellíðan en bakverðir (Zhang et al. 2026). Bakverðir safna oft fleiri hröðunum / stefnubreytingum og miðherjar fleiri stökkum og snertingum (lestur MicroPulse, ekki úr þeirri rannsókn). Þess vegna er hver lestur hér á leikmannsins EIGIN 28-daga viðmiðun, aldrei milli leikstaða.";
}
