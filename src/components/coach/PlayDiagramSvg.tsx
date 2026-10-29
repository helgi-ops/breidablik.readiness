"use client";

/**
 * PlayDiagramSvg — the WEB half of the shared play renderer. Draws the primitives from
 * buildPlayDiagram() as an inline <svg>. A set-play diagram is a black-on-white coaching
 * diagram (white "paper", black ink) like a chalkboard — so it is intentionally theme-
 * independent fixed B&W, not tinted by the app tokens. The PDF renders the identical
 * primitive list with @react-pdf <Svg>, so the drawing matches.
 */

import * as React from "react";
import { buildPlayDiagram, PLAY_VIEW, type PlayColors, type PlayDiagram, type Prim } from "@/lib/micropulse/basketballStats/playDiagram";

/** Pure black-on-white coaching-diagram palette (matches the printed PDF; theme-independent). */
export const WEB_PLAY_COLORS: PlayColors = {
  court: "#ffffff",
  line: "#14181c",
  off: "#14181c",
  def: "#14181c",
  ball: "#14181c",
  ink: "#14181c",
  arrow: "#14181c",
  paint: "#ffffff",
};

function PrimEl({ p }: { p: Prim }) {
  switch (p.t) {
    case "line":
      return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} style={{ stroke: p.stroke }} strokeWidth={p.w} strokeLinecap="round" strokeDasharray={p.dash} />;
    case "path":
      return <path d={p.d} style={{ stroke: p.stroke ?? "none", fill: p.fill ?? "none" }} strokeWidth={p.w ?? 0.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={p.dash} />;
    case "circle":
      return <circle cx={p.cx} cy={p.cy} r={p.r} style={{ fill: p.fill ?? "none", stroke: p.stroke ?? "none" }} strokeWidth={p.w ?? 0} />;
    case "polygon":
      return <polygon points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")} style={{ fill: p.fill ?? "none", stroke: p.stroke ?? "none" }} strokeWidth={p.w ?? 0} />;
    case "text":
      return <text x={p.x} y={p.y} style={{ fill: p.fill }} fontSize={p.size} fontWeight={p.weight ?? 500} textAnchor={p.anchor ?? "middle"} dominantBaseline="middle">{p.s}</text>;
  }
}

export default function PlayDiagramSvg({ diagram, colors = WEB_PLAY_COLORS, className, style }: {
  diagram: PlayDiagram | null | undefined;
  colors?: PlayColors;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { w, h, prims } = React.useMemo(() => buildPlayDiagram(diagram, colors), [diagram, colors]);
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} className={className} style={{ width: "100%", height: "auto", display: "block", ...style }} role="img" aria-label="Set-play diagram">
      <rect x={-2} y={-2} width={w + 4} height={h + 4} fill="transparent" />
      {prims.map((p, i) => <PrimEl key={i} p={p} />)}
    </svg>
  );
}

export { PLAY_VIEW };
