/**
 * renderCardSvg — builds the shareable match card as a pure SVG string
 * (1080×1920, 9:16). No DOM: rasterised to PNG by ./toPng. Club-branded from a
 * hex accent + optional crest data-URL; falls back to an initial circle.
 *
 * The card shows the three stats players brag about — Top Speed / Distance /
 * Sprints — with the most impressive auto-promoted to the hero slot (see
 * ./pickHeroStat). Every number on the card is a real match total.
 */

export type CardModel = {
  accent: string; // club hex, e.g. "#DC1E35"
  playerName: string;
  clubName: string;
  crestHref: string | null; // inlined data URL, or null → initial fallback
  initial: string;
  subline: string; // "vs Fylkir · 26 Jun" or just "26 Jun"
  hero: { label: string; value: string; unit: string; badge: string | null };
  supporting: Array<{ label: string; value: string; unit: string }>;
};

const W = 1080;
const H = 1920;
const BASE = "#111418";

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6) || "888888", 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function relLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function mixWhite(c: { r: number; g: number; b: number }, t: number) {
  return { r: c.r + (255 - c.r) * t, g: c.g + (255 - c.g) * t, b: c.b + (255 - c.b) * t };
}
/** Lift a genuinely dark club colour so it stays legible as text on the dark
 *  base. Mid-luminance colours (e.g. #DC1E35 red) are left true. */
function readableAccent(hex: string): string {
  const rgb = hexToRgb(hex);
  const lum = relLuminance(rgb);
  if (lum >= 0.15) return rgbToHex(rgb.r, rgb.g, rgb.b);
  const t = lum < 0.06 ? 0.5 : lum < 0.1 ? 0.34 : 0.2;
  const m = mixWhite(rgb, t);
  return rgbToHex(m.r, m.g, m.b);
}

/** Points for a 5-point star centred at (cx,cy). */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

export function renderCardSvg(m: CardModel): string {
  const accent = readableAccent(m.accent);
  const rawAccent = m.accent;
  const cx = W / 2;

  // Crest — inlined image clipped to a circle, or a coloured initial circle.
  const crestCy = 300;
  const crestR = 96;
  const crest = m.crestHref
    ? `<clipPath id="crestClip"><circle cx="${cx}" cy="${crestCy}" r="${crestR}"/></clipPath>
       <circle cx="${cx}" cy="${crestCy}" r="${crestR}" fill="#ffffff"/>
       <image href="${m.crestHref}" x="${cx - crestR}" y="${crestCy - crestR}" width="${crestR * 2}" height="${crestR * 2}" clip-path="url(#crestClip)" preserveAspectRatio="xMidYMid slice"/>
       <circle cx="${cx}" cy="${crestCy}" r="${crestR}" fill="none" stroke="${rawAccent}" stroke-width="9"/>`
    : `<circle cx="${cx}" cy="${crestCy}" r="${crestR}" fill="${rawAccent}"/>
       <text x="${cx}" y="${crestCy + 40}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="120" font-weight="800" fill="#ffffff">${esc(m.initial)}</text>`;

  // Motion streaks behind the hero — accent parallelograms, low opacity.
  const streaks = [0, 1, 2, 3]
    .map((i) => {
      const y = 700 + i * 70;
      const op = 0.10 - i * 0.02;
      return `<polygon points="${-40},${y} ${W * 0.62},${y - 26} ${W * 0.62 + 60},${y + 6} ${20},${y + 32}" fill="${rawAccent}" opacity="${op.toFixed(2)}"/>`;
    })
    .join("");

  // Badge pill (centred estimate). Star for the season best, chevron for match high.
  let badge = "";
  if (m.hero.badge) {
    const isBest = /best|met/i.test(m.hero.badge);
    const txt = m.hero.badge.toUpperCase();
    const fs = 34;
    const pillW = Math.min(W - 120, txt.length * 20 + 150);
    const pillH = 70;
    const px = cx - pillW / 2;
    const py = 632;
    const iconX = px + 44;
    const iconY = py + pillH / 2;
    const icon = isBest
      ? `<polygon points="${starPoints(iconX, iconY, 20, 8)}" fill="#111418"/>`
      : `<path d="M ${iconX - 16} ${iconY + 8} L ${iconX} ${iconY - 12} L ${iconX + 16} ${iconY + 8}" fill="none" stroke="#111418" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
    badge =
      `<rect x="${px}" y="${py}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${rawAccent}"/>` +
      icon +
      `<text x="${iconX + 34}" y="${py + 48}" text-anchor="start" font-family="Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="800" letter-spacing="2" fill="#111418">${esc(txt)}</text>`;
  }

  // Hero number (big) + unit, centred as one text node.
  const heroBaseline = 950;
  const hero =
    `<text x="${cx}" y="${heroBaseline}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" fill="${accent}">` +
    `<tspan font-size="300">${esc(m.hero.value)}</tspan>` +
    `<tspan font-size="96" dx="6" fill="${accent}">${esc(m.hero.unit)}</tspan>` +
    `</text>` +
    `<text x="${cx}" y="${heroBaseline + 88}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" letter-spacing="8" fill="#c8ccd2">${esc(m.hero.label.toUpperCase())}</text>`;

  // Supporting row — the other two stats, side by side with a divider.
  const sy = 1420;
  const cols = [W * 0.29, W * 0.71];
  const supporting = m.supporting
    .map((s, i) => {
      const x = cols[i];
      return (
        `<text x="${x}" y="${sy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" fill="#ffffff">` +
        `<tspan font-size="104">${esc(s.value)}</tspan>` +
        `<tspan font-size="42" dx="4" fill="#8a9099">${esc(s.unit)}</tspan></text>` +
        `<text x="${x}" y="${sy + 62}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700" letter-spacing="4" fill="#8a9099">${esc(s.label.toUpperCase())}</text>`
      );
    })
    .join("");
  const divider = `<rect x="${cx - 1.5}" y="${sy - 96}" width="3" height="150" rx="1.5" fill="#2a2f36"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BASE}"/>
  ${streaks}
  <rect x="0" y="0" width="${W}" height="14" fill="${rawAccent}"/>
  ${crest}
  <text x="${cx}" y="480" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="#ffffff">${esc(m.playerName)}</text>
  <text x="${cx}" y="536" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="600" fill="#9aa0a8">${esc(m.subline)}</text>
  ${badge}
  ${hero}
  ${divider}
  ${supporting}
  <text x="${cx}" y="1820" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" letter-spacing="2" fill="#6b7178">${esc(m.clubName)}</text>
  <text x="${cx}" y="1868" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="800" letter-spacing="6" fill="${accent}">MICROPULSE.IS</text>
</svg>`;
}
