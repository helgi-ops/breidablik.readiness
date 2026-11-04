"use client";

/**
 * ImaClockRadar — the shared 12-spoke polar "IMA clock" rose.
 *
 * Plots a dashed reference vector (`usual`) and a solid coloured vector (`recent`)
 * on 12 clock directions (12 = straight forward, clockwise), with an optional dashed
 * position/reference polygon and per-direction mechanical-load "heat beads". Extracted
 * verbatim from MovementSignatureCard so both that card (recent vs usual fingerprint)
 * and the Train-like-you-Play movement-shape card (training vs game shape) render one
 * identical rose. Pure presentational SVG — no data fetching, no readiness.
 */

// 12 clock directions → short label (12 = straight forward, clockwise).
export const CLOCK_LABEL: Record<string, string> = {
  "12": "F", "1": "FR", "2": "R+", "3": "R", "4": "RB", "5": "BR",
  "6": "B", "7": "BL", "8": "L+", "9": "L", "10": "LF", "11": "FL",
};
export const CLOCK_DIRS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

/** Angle (deg, clockwise from top) for a clock direction. 12→0°, 3→90°, 6→180°, 9→270°. */
const angleOf = (d: string) => (Number(d) % 12) * 30;
const pt = (d: string, r: number, cx: number, cy: number) => {
  const a = (angleOf(d) * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as const;
};

/** 12-spoke polar: usual/reference vector (dashed) + recent/primary vector (solid, coloured) + optional
 *  position/reference polygon, with each direction beaded by its mechanical LOAD (cobalt intensity = hotter). */
export default function ImaClockRadar({ usual, recent, flagged, position, load }: {
  usual: Record<string, number> | null;
  recent: Record<string, number>;
  flagged: boolean;
  position?: Record<string, number> | null;
  load?: Record<string, number> | null;
}) {
  const S = 260, cx = S / 2, cy = S / 2, maxR = 96;
  const peak = Math.max(0.0001, ...CLOCK_DIRS.map((d) => Math.max(usual?.[d] ?? 0, recent[d] ?? 0, position?.[d] ?? 0)));
  const poly = (v: Record<string, number>) =>
    CLOCK_DIRS.map((d) => { const [x, y] = pt(d, ((v[d] ?? 0) / peak) * maxR, cx, cy); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ");
  const recentColor = flagged ? "#de9328" : "#1c7a4a";
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[300px]" role="img" aria-label="movement signature">
      {/* rings */}
      {[0.33, 0.66, 1].map((f) => <circle key={f} cx={cx} cy={cy} r={maxR * f} fill="none" stroke="#e2e8f0" strokeWidth="1" />)}
      {/* spokes + tick labels */}
      {CLOCK_DIRS.map((d) => {
        const [ex, ey] = pt(d, maxR, cx, cy);
        const [lx, ly] = pt(d, maxR + 14, cx, cy);
        const card = d === "12" || d === "3" || d === "6" || d === "9";
        return (
          <g key={d}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#eef2f6" strokeWidth="1" />
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize={card ? 10 : 8} fontWeight={card ? 700 : 400} fill={card ? "#475569" : "#94a3b8"}>{CLOCK_LABEL[d]}</text>
          </g>
        );
      })}
      {/* position average (cobalt, faint fill + dashed outline) — the positional norm zone his shape sits vs */}
      {position ? <polygon points={poly(position)} fill="#2740e6" fillOpacity="0.06" stroke="#2740e6" strokeWidth="1.5" strokeDasharray="3 2" strokeLinejoin="round" opacity="0.9" /> : null}
      {/* usual / reference fingerprint */}
      {usual ? <polygon points={poly(usual)} fill="#a9a493" fillOpacity="0.10" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" /> : null}
      {/* recent / primary shape */}
      <polygon points={poly(recent)} fill={recentColor} fillOpacity={flagged ? 0.12 : 0.07} stroke={recentColor} strokeWidth="2.5" strokeLinejoin="round" />
      {/* mechanical-load heat beads — one per direction on the rim, cobalt intensity by load share */}
      {load ? (() => {
        const maxL = Math.max(0.0001, ...CLOCK_DIRS.map((d) => load[d] ?? 0));
        return CLOCK_DIRS.map((d) => {
          const [dx, dy] = pt(d, maxR, cx, cy);
          const t = (load[d] ?? 0) / maxL;
          return <circle key={`ld-${d}`} cx={dx} cy={dy} r={5} fill="#2740e6" fillOpacity={0.18 + 0.82 * t} stroke="#fff" strokeWidth="0.8" />;
        });
      })() : null}
    </svg>
  );
}
