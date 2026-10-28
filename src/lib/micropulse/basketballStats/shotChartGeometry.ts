/**
 * shotChartGeometry — ONE pure mapper from shot locations to half-court pixel positions, so the web
 * SVG and the PDF <Svg> draw an identical chart from the same data (renderer parity). No IO, no React.
 *
 * Court coords are 0-100 over the full court; every shot is folded to a single basket (left) so a
 * season's shots overlay one half. Marker tone is decided here too (make / miss / paint) — the
 * surfaces only draw primitives. Descriptive scouting — never a readiness signal.
 */

export type ShotKind = "shot" | "paint";
export type ShotInput = { x: number | null | undefined; y: number | null | undefined; made: boolean; kind?: ShotKind };
export type PlacedShot = { cx: number; cy: number; made: boolean; kind: ShotKind };
export type ShotChartGeom = { width: number; height: number; shots: PlacedShot[]; made: number; attempts: number };

/** Map shot inputs to {cx,cy} on a width×height half-court, folded to the left basket. */
export function shotChartGeometry(points: ShotInput[], width = 150, height = 140): ShotChartGeom {
  const shots: PlacedShot[] = [];
  let made = 0;
  for (const p of points) {
    if (p.x == null || p.y == null || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    let x = p.x as number, y = p.y as number;
    if (x > 50) { x = 100 - x; y = 100 - y; } // fold to the left basket
    shots.push({ cx: Math.round(((x / 50) * width) * 10) / 10, cy: Math.round(((y / 100) * height) * 10) / 10, made: p.made, kind: p.kind ?? "shot" });
    if (p.made) made += 1;
  }
  return { width, height, shots, made, attempts: shots.length };
}
