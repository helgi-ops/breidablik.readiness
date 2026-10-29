/**
 * Set-play diagram — ONE source of truth for both renderers.
 *
 * `buildPlayDiagram` turns the stored diagram JSON (positions + arrows, normalised 0–100 on
 * a half court, origin top-left, basket at the bottom) into a flat list of drawing primitives
 * (`Prim`). The web canvas renders those as `<svg>` elements and the PDF renders the exact
 * same list as `@react-pdf` `<Svg>` elements, so a play always looks identical in both.
 *
 * Pure, IO-free. Descriptive scouting only — never a readiness or training signal.
 */

export type ArrowKind = "move" | "dribble" | "screen" | "pass";
export type PlayTeam = "off" | "def";

export type PlayPlayer = { id: string; team: PlayTeam; x: number; y: number; ball?: boolean; label?: string };
export type PlayArrow = { from: [number, number]; to: [number, number]; kind: ArrowKind; curve?: number };
export type PlayDiagram = { court: "half"; players: PlayPlayer[]; arrows: PlayArrow[] };

/** InStat play-type vocabulary the scouting report already uses (value → bilingual label). */
export const PLAY_TYPES: Array<{ key: string; en: string; is: string }> = [
  { key: "pnrHandler", en: "Pick & roll (handler)", is: "Skýling (leikstjóri)" },
  { key: "pnrRoller", en: "Pick & roll (roller)", is: "Skýling (rúllandi)" },
  { key: "catchShoot", en: "Catch & shoot", is: "Grípa og skjóta" },
  { key: "drive", en: "Drive", is: "Drífa að körfu" },
  { key: "iso", en: "Isolation", is: "Einn á einn" },
  { key: "cut", en: "Cut", is: "Skurður" },
  { key: "postUp", en: "Post-up", is: "Undir körfu" },
  { key: "screenOff", en: "Off-screen", is: "Skýling frá" },
  { key: "transition", en: "Transition", is: "Hraðaupphlaup" },
  { key: "other", en: "Other", is: "Annað" },
];
export const ARROW_KINDS: Array<{ key: ArrowKind; en: string; is: string }> = [
  { key: "move", en: "Move", is: "Hreyfing" },
  { key: "dribble", en: "Dribble", is: "Rekja" },
  { key: "screen", en: "Screen", is: "Skýling" },
  { key: "pass", en: "Pass", is: "Sending" },
];
export const playTypeLabel = (key: string | null | undefined, lang: "EN" | "IS"): string =>
  (PLAY_TYPES.find((p) => p.key === key)?.[lang === "IS" ? "is" : "en"]) ?? (key ?? "");

// ── Drawing primitives — the shared contract both renderers consume ──────────
export type Prim =
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; w: number; dash?: string }
  | { t: "path"; d: string; stroke?: string; fill?: string; w?: number; dash?: string }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; w?: number }
  | { t: "polygon"; pts: Array<[number, number]>; fill?: string; stroke?: string; w?: number }
  | { t: "text"; x: number; y: number; s: string; size: number; fill: string; anchor?: "start" | "middle" | "end"; weight?: number };

export type PlayColors = { court: string; line: string; off: string; def: string; ball: string; ink: string; arrow: string; paint: string };

/** The view box: a FIBA-proportioned half court, 50 ft wide × 47 ft deep (×2 → 100 × 94). */
export const PLAY_VIEW = { w: 100, h: 94 } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (x: number, y: number) => `${r2(x)} ${r2(y)}`;

/** Static half-court markings, drawn like a coaching whiteboard: the BASKET IS AT THE TOP (baseline
 *  along the top edge), the key runs down from it, and the half-court line is along the bottom. */
function courtPrims(c: PlayColors): Prim[] {
  const W = PLAY_VIEW.w, H = PLAY_VIEW.h;
  const cx = 50;
  const rimY = 10.5;              // basket centre ~5.25 ft below the top baseline
  const boardY = 8;              // backboard (between the baseline and the rim)
  const ftY = 38;               // free-throw line ~19 ft from the baseline
  const keyHalf = 12;            // paint half-width (~6 ft each side)
  const ftR = 12;               // FT circle radius (~6 ft)
  const arcR = 44;              // 3-pt radius from the basket (~22 ft)
  const cornerX = 6;           // 3-pt line corner (straight part) inset from the sideline
  const dx = cornerX - cx;     // = -44 → corner sits exactly on the arc at this width
  const ayv = Math.sqrt(Math.max(0, arcR * arcR - dx * dx));
  const arcCornerY = rimY + ayv; // y where the arc meets the corner line (below the rim)
  const stroke = c.line, w = 1.0, bold = 1.4;
  const prims: Prim[] = [
    // floor + bolder boundary
    { t: "path", d: `M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z`, fill: c.court, stroke, w: bold },
    // painted key (a light tint) + outline — runs DOWN from the top baseline to the FT line
    { t: "path", d: `M ${cx - keyHalf} 0 L ${cx - keyHalf} ${ftY} L ${cx + keyHalf} ${ftY} L ${cx + keyHalf} 0 Z`, fill: c.paint, w: 0 },
    { t: "path", d: `M ${cx - keyHalf} 0 L ${cx - keyHalf} ${ftY} L ${cx + keyHalf} ${ftY} L ${cx + keyHalf} 0`, fill: "none", stroke, w },
    // FT circle: solid half toward centre court (below), dashed half inside the key (above)
    { t: "path", d: `M ${fmt(cx - ftR, ftY)} A ${ftR} ${ftR} 0 0 0 ${fmt(cx + ftR, ftY)}`, fill: "none", stroke, w },
    { t: "path", d: `M ${fmt(cx - ftR, ftY)} A ${ftR} ${ftR} 0 0 1 ${fmt(cx + ftR, ftY)}`, fill: "none", stroke, w, dash: "2 2" },
    // restricted-area semicircle under the rim (bulges down into the court)
    { t: "path", d: `M ${cx - 8} ${rimY} A 8 8 0 0 0 ${cx + 8} ${rimY}`, fill: "none", stroke, w },
    // backboard + rim + short net
    { t: "line", x1: cx - 6, y1: boardY, x2: cx + 6, y2: boardY, stroke: c.ink, w: 1.6 },
    { t: "circle", cx, cy: rimY, r: 2, fill: "none", stroke: c.ink, w: 1.2 },
    { t: "line", x1: cx, y1: rimY + 2, x2: cx, y2: rimY + 4, stroke: c.ink, w: 0.7 },
    // 3-pt line: short corners from the top baseline + arc bulging toward centre court
    { t: "line", x1: cornerX, y1: 0, x2: cornerX, y2: arcCornerY, stroke, w },
    { t: "line", x1: W - cornerX, y1: 0, x2: W - cornerX, y2: arcCornerY, stroke, w },
    { t: "path", d: `M ${fmt(cornerX, arcCornerY)} A ${arcR} ${arcR} 0 0 0 ${fmt(W - cornerX, arcCornerY)}`, fill: "none", stroke, w },
    // half-court centre circle — top half rising from the bottom edge
    { t: "path", d: `M ${fmt(cx - 9, H)} A 9 9 0 0 1 ${fmt(cx + 9, H)}`, fill: "none", stroke, w },
  ];
  // lane hash marks (block spaces) near the top baseline
  for (const y of [12, 16, 20]) {
    prims.push({ t: "line", x1: cx - keyHalf - 1.8, y1: y, x2: cx - keyHalf, y2: y, stroke, w });
    prims.push({ t: "line", x1: cx + keyHalf, y1: y, x2: cx + keyHalf + 1.8, y2: y, stroke, w });
  }
  return prims;
}

/** Arrowhead triangle at `to`, pointing along the incoming direction. */
function arrowHead(fromX: number, fromY: number, toX: number, toY: number, color: string): Prim {
  const a = Math.atan2(toY - fromY, toX - fromX);
  const len = 3.4, spread = 0.42;
  const p1: [number, number] = [toX - len * Math.cos(a - spread), toY - len * Math.sin(a - spread)];
  const p2: [number, number] = [toX - len * Math.cos(a + spread), toY - len * Math.sin(a + spread)];
  return { t: "polygon", pts: [[r2(toX), r2(toY)], [r2(p1[0]), r2(p1[1])], [r2(p2[0]), r2(p2[1])]], fill: color };
}

/** A zig-zag path from a→b (dribble), oscillating perpendicular to the line. */
function zigzag(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;         // unit along
  const nx = -uy, ny = ux;                     // unit perpendicular
  const steps = Math.max(3, Math.round(len / 5));
  const amp = 1.8;
  let d = `M ${fmt(ax, ay)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = ax + dx * t, py = ay + dy * t;
    const off = (i % 2 === 0 ? 1 : -1) * amp * (i === steps ? 0 : 1);
    d += ` L ${fmt(px + nx * off, py + ny * off)}`;
  }
  return d;
}

function arrowPrims(a: PlayArrow, c: PlayColors): Prim[] {
  const [ax, ay] = a.from, [bx, by] = a.to;
  const out: Prim[] = [];
  const stroke = c.arrow, w = 0.9;
  if (a.kind === "dribble") {
    out.push({ t: "path", d: zigzag(ax, ay, bx, by), stroke, fill: "none", w });
    out.push(arrowHead((ax + bx) / 2, (ay + by) / 2, bx, by, stroke));
    return out;
  }
  // curved (move/pass) via a quadratic control point offset perpendicular to the chord.
  let endFromX = ax, endFromY = ay;
  if (a.curve && Math.abs(a.curve) > 0.01) {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const k = a.curve * len * 0.5;
    const ctrlX = mx + nx * k, ctrlY = my + ny * k;
    out.push({ t: "path", d: `M ${fmt(ax, ay)} Q ${fmt(ctrlX, ctrlY)} ${fmt(bx, by)}`, stroke, fill: "none", w, dash: a.kind === "pass" ? "2 2" : undefined });
    endFromX = ctrlX; endFromY = ctrlY;
  } else if (a.kind === "screen") {
    // straight line, then a perpendicular bar at the end (the screen "wall").
    out.push({ t: "line", x1: r2(ax), y1: r2(ay), x2: r2(bx), y2: r2(by), stroke, w });
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, barHalf = 3;
    out.push({ t: "line", x1: r2(bx - nx * barHalf), y1: r2(by - ny * barHalf), x2: r2(bx + nx * barHalf), y2: r2(by + ny * barHalf), stroke, w: 1.1 });
    return out;
  } else {
    out.push({ t: "line", x1: r2(ax), y1: r2(ay), x2: r2(bx), y2: r2(by), stroke, w, dash: a.kind === "pass" ? "2 2" : undefined });
  }
  out.push(arrowHead(endFromX, endFromY, bx, by, stroke));
  return out;
}

function playerPrims(p: PlayPlayer, c: PlayColors): Prim[] {
  const out: Prim[] = [];
  const r = 3.6;
  if (p.team === "def") {
    // X marker — bold, with the assignment label below it
    const s = r * 0.82;
    out.push({ t: "line", x1: r2(p.x - s), y1: r2(p.y - s), x2: r2(p.x + s), y2: r2(p.y + s), stroke: c.def, w: 1.5 });
    out.push({ t: "line", x1: r2(p.x + s), y1: r2(p.y - s), x2: r2(p.x - s), y2: r2(p.y + s), stroke: c.def, w: 1.5 });
    if (p.label) out.push({ t: "text", x: p.x, y: p.y + r + 3.2, s: p.label, size: 3.4, fill: c.def, anchor: "middle" });
    return out;
  }
  // offensive O — white-filled circle with a bold dark number (the textbook coaching-diagram look):
  // the fill sits opaque over the court lines so the number stays crisp.
  out.push({ t: "circle", cx: p.x, cy: p.y, r, fill: c.court, stroke: c.off, w: 1.4 });
  if (p.label) out.push({ t: "text", x: p.x, y: p.y + 1.4, s: p.label, size: 4.2, fill: c.off, anchor: "middle", weight: 700 });
  // ball-handler — a small filled dot tucked under the circle, like a chalkboard diagram.
  if (p.ball) out.push({ t: "circle", cx: p.x, cy: p.y + r + 0.4, r: 1.4, fill: c.ball });
  return out;
}

/** Build the full primitive list for a diagram (court first, then arrows under players). */
export function buildPlayDiagram(diagram: PlayDiagram | null | undefined, colors: PlayColors): { w: number; h: number; prims: Prim[] } {
  const prims: Prim[] = [...courtPrims(colors)];
  const d = diagram && typeof diagram === "object" ? diagram : null;
  for (const a of (d?.arrows ?? [])) {
    if (!a || !Array.isArray(a.from) || !Array.isArray(a.to)) continue;
    prims.push(...arrowPrims(a, colors));
  }
  for (const p of (d?.players ?? [])) {
    if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
    prims.push(...playerPrims(p, colors));
  }
  return { w: PLAY_VIEW.w, h: PLAY_VIEW.h, prims };
}
