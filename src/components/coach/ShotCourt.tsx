/**
 * ShotCourt — the presentational FIBA half-court shot chart (SVG only, no data fetching).
 *
 * Extracted verbatim from FibaShotCharts.tsx so the same court renders in BOTH the
 * "Leikir & skotakort" section and the Opponent Analysis per-player modal from ONE source
 * of court geometry. Pure/presentational: give it shots (+ optional zone-efficiency fill)
 * and it draws them. The maths/zones live in shotChartGeometry.ts / shotZones.ts.
 *
 * Descriptive scouting/own-analysis only — never reads or writes the readiness colour.
 */
import * as React from "react";
import { foldShot, type FibaShot } from "@/lib/micropulse/basketballStats/fibaLiveStats";
import type { ZoneName } from "@/lib/micropulse/basketballStats/shotZones";

// ── Per-shot detail helpers ──────────────────────────────────────────────────
const SUBTYPE_LABEL: Record<string, { en: string; is: string }> = {
  jumpshot: { en: "jump shot", is: "stökkskot" },
  layup: { en: "layup", is: "upplögð karfa" },
  drivinglayup: { en: "driving layup", is: "upplögð úr drifi" },
  pullupjumpshot: { en: "pull-up jumper", is: "pull-up stökkskot" },
  stepbackjumpshot: { en: "step-back jumper", is: "step-back stökkskot" },
  catchandshoot: { en: "catch & shoot", is: "grípa og skjóta" },
  dunk: { en: "dunk", is: "troðsla" },
  hookshot: { en: "hook shot", is: "krókskot" },
  turnaround: { en: "turnaround", is: "snúningsskot" },
  fadeaway: { en: "fadeaway", is: "fadeaway" },
  tipin: { en: "tip-in", is: "tipp-karfa" },
  alleyoop: { en: "alley-oop", is: "alley-oop" },
  floater: { en: "floater", is: "fljótandi skot" },
};
export function prettySub(sub: string | null, is: boolean): string {
  if (!sub) return "";
  const m = SUBTYPE_LABEL[sub.toLowerCase()];
  return m ? (is ? m.is : m.en) : sub.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
export function shotKey(s: FibaShot): string {
  return s.actionNumber != null ? `a${s.actionNumber}` : `${s.tno}-${s.playerName}-${s.x}-${s.y}`;
}
function shotTitle(s: FibaShot, is: boolean): string {
  const who = `${s.shirt ? `#${s.shirt} ` : ""}${s.playerName}`;
  const kind = `${s.actionType === "3pt" ? "3PT" : "2PT"}${prettySub(s.subType, is) ? ` ${prettySub(s.subType, is)}` : ""}`;
  const res = s.result === 1 ? (is ? "skorað" : "made") : (is ? "missti" : "missed");
  const per = s.period != null ? (is ? `${s.period}. lh. · ` : `Q${s.period} · `) : "";
  return `${per}${who} · ${kind} · ${res}`;
}

/** FIBA half-court, geometrically to scale (10 px per metre, isotropic). The feed's
 *  x = court length (0-100 over 28 m), y = width (0-100 over 15 m); foldShot maps every
 *  shot onto one half, x∈[0,50] = depth from our baseline. Basket at the top-centre.
 *  Wood floor + club-blue painted key (FIBA Organizer style).
 *  Filled disc = make, ✕ = miss; green = 2PT, cobalt = 3PT (design tokens). */
export type ZoneFill = Record<ZoneName, string | null>;
export function ShotCourt({ shots, is, onSelect, selectedKey, big, shade, zoneFill }: { shots: FibaShot[]; is: boolean; onSelect?: (s: FibaShot) => void; selectedKey?: string | null; big?: boolean; shade?: boolean; zoneFill?: ZoneFill }) {
  const W = 150, H = 140, cx0 = 75, rimY = 15.75; // basket centre 1.575 m off the baseline
  const withXY = shots.filter((s) => s.x != null && s.y != null);
  const pt = (s: FibaShot) => {
    const f = foldShot(s.x as number, s.y as number);
    return { cx: (f.y / 100) * W, cy: (f.x / 50) * H, made: s.result === 1, three: s.actionType === "3pt" };
  };
  return (
    <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className={`block w-full rounded-xl shadow-[0_2px_8px_rgba(40,30,10,0.14)] ${big ? "max-w-[680px]" : "max-w-[440px]"}`}>
      <defs>
        <linearGradient id="fsc-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eec592" /><stop offset="0.55" stopColor="#e4b67e" /><stop offset="1" stopColor="#dcab6f" />
        </linearGradient>
        <radialGradient id="fsc-sheen" cx="0.5" cy="0.12" r="0.9">
          <stop offset="0" stopColor="rgba(255,255,255,0.28)" /><stop offset="0.5" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <filter id="fsc-dot" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.5" floodColor="rgba(30,20,5,0.35)" />
        </filter>
      </defs>
      {/* apron + floor */}
      <rect x={-6} y={-6} width={W + 12} height={H + 12} fill="#1f2a6e" />
      <rect x={0} y={0} width={W} height={H} fill="url(#fsc-wood)" />
      {/* parquet seams */}
      <g stroke="rgba(120,72,30,0.14)" strokeWidth={0.5}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => <line key={i} x1={i * 18.75} y1={0} x2={i * 18.75} y2={H} />)}
      </g>
      {shade && zoneFill ? (
        // efficiency heat by zone (points-per-shot); replaces the blue key while shading
        <g opacity={0.62}>
          {/* three-point region (court minus 2PT area), split into 5 wedges from the basket */}
          {(() => {
            const P = Math.PI / 180;
            const far = (deg: number): [number, number] => [cx0 + 460 * Math.sin(deg * P), rimY + 460 * Math.cos(deg * P)];
            const wedge = (a1: number, a2: number) => { const [x1, y1] = far(a1); const [x2, y2] = far(a2); return `M ${cx0} ${rimY} L ${x1} ${y1} L ${x2} ${y2} Z`; };
            const segs: Array<[ZoneName, number, number]> = [["threeLC", -180, -55], ["threeLW", -55, -20], ["threeTop", -20, 20], ["threeRW", 20, 55], ["threeRC", 55, 180]];
            return (
              <>
                <clipPath id="fsc-3clip"><path clipRule="evenodd" d={`M 0 0 H ${W} V ${H} H 0 Z M 9 0 L 9 29.9 A 67.5 67.5 0 0 0 ${W - 9} 29.9 L ${W - 9} 0 Z`} /></clipPath>
                <g clipPath="url(#fsc-3clip)">
                  {segs.map(([k, a1, a2]) => zoneFill[k] ? <path key={k} d={wedge(a1, a2)} fill={zoneFill[k]} /> : null)}
                </g>
              </>
            );
          })()}
          {/* mid-range band (2PT area minus key), split left / centre / right via a clip */}
          <clipPath id="fsc-midclip"><path clipRule="evenodd" d={`M 9 0 L 9 29.9 A 67.5 67.5 0 0 0 ${W - 9} 29.9 L ${W - 9} 0 Z M ${cx0 - 24.5} 0 H ${cx0 + 24.5} V 58 H ${cx0 - 24.5} Z`} /></clipPath>
          <g clipPath="url(#fsc-midclip)">
            {zoneFill.midLeft ? <rect x={0} y={0} width={cx0 - 24.5} height={H} fill={zoneFill.midLeft} /> : null}
            {zoneFill.midCentre ? <rect x={cx0 - 24.5} y={0} width={49} height={H} fill={zoneFill.midCentre} /> : null}
            {zoneFill.midRight ? <rect x={cx0 + 24.5} y={0} width={W - (cx0 + 24.5)} height={H} fill={zoneFill.midRight} /> : null}
          </g>
          {/* paint minus the restricted-area disc */}
          {zoneFill.paint ? <path fillRule="evenodd" d={`M ${cx0 - 24.5} 0 H ${cx0 + 24.5} V 58 H ${cx0 - 24.5} Z M ${cx0 - 12.5} ${rimY} A 12.5 12.5 0 0 0 ${cx0 + 12.5} ${rimY} L ${cx0 + 12.5} 12 L ${cx0 - 12.5} 12 Z`} fill={zoneFill.paint} /> : null}
          {/* restricted area (under the basket) */}
          {zoneFill.restricted ? <path d={`M ${cx0 - 12.5} ${rimY} A 12.5 12.5 0 0 0 ${cx0 + 12.5} ${rimY} L ${cx0 + 12.5} 12 L ${cx0 - 12.5} 12 Z`} fill={zoneFill.restricted} /> : null}
        </g>
      ) : (
        <>
          {/* painted key (4.9 m × 5.8 m) + FT half-disc + restricted zone */}
          <rect x={cx0 - 24.5} y={0} width={49} height={58} fill="#2740e6" />
          <path d={`M ${cx0} 58 m -18 0 a 18 18 0 0 0 36 0 z`} fill="#2740e6" />
          <path d={`M ${cx0 - 12.5} ${rimY} A 12.5 12.5 0 0 0 ${cx0 + 12.5} ${rimY} L ${cx0 + 12.5} 12 L ${cx0 - 12.5} 12 z`} fill="#1b2fb8" />
        </>
      )}
      {/* white FIBA lines */}
      <g fill="none" stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round">
        <rect x={0.55} y={0.55} width={W - 1.1} height={H - 1.1} />
        <rect x={cx0 - 24.5} y={0} width={49} height={58} />
        <circle cx={cx0} cy={58} r={18} strokeDasharray="3.1 3.1" />
        <path d={`M ${cx0 - 18} 58 A 18 18 0 0 0 ${cx0 + 18} 58`} />
        <path d={`M ${cx0 - 12.5} ${rimY} A 12.5 12.5 0 0 0 ${cx0 + 12.5} ${rimY} L ${cx0 + 12.5} 12 M ${cx0 - 12.5} 12 L ${cx0 - 12.5} ${rimY}`} />
        <path d={`M 9 0 L 9 29.9 A 67.5 67.5 0 0 0 ${W - 9} 29.9 L ${W - 9} 0`} />
        <path d={`M ${cx0 - 18} ${H} A 18 18 0 0 1 ${cx0 + 18} ${H}`} />
      </g>
      {/* rebound hash marks along the key */}
      <g stroke="#ffffff" strokeWidth={1.1}>
        {[17.5, 26, 34.5].map((y) => <React.Fragment key={y}>
          <line x1={cx0 - 27} y1={y} x2={cx0 - 24.5} y2={y} />
          <line x1={cx0 + 24.5} y1={y} x2={cx0 + 27} y2={y} />
        </React.Fragment>)}
      </g>
      {/* sheen */}
      <rect x={0} y={0} width={W} height={H} fill="url(#fsc-sheen)" pointerEvents="none" />
      {/* backboard + rim */}
      <g fill="none" strokeLinecap="round">
        <line x1={cx0 - 9} y1={12} x2={cx0 + 9} y2={12} stroke="#1f2937" strokeWidth={1.6} />
        <circle cx={cx0} cy={rimY} r={2.25} stroke="#e8542f" strokeWidth={1.3} />
      </g>
      {/* shots: filled disc = make, ✕ = miss. Click a marker for detail. */}
      <g filter="url(#fsc-dot)">
        {withXY.map((s, i) => {
          const p = pt(s);
          const fill = p.three ? "#3b5bff" : "#25a563";
          const x = p.three ? "#2740e6" : "#177a45";
          const d = 2.1;
          const k = shotKey(s);
          const sel = selectedKey === k;
          return (
            <g key={i} onClick={onSelect ? () => onSelect(s) : undefined} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <title>{shotTitle(s, is)}</title>
              {sel ? <circle cx={p.cx} cy={p.cy} r={4.6} fill="none" stroke="#111827" strokeWidth={1} /> : null}
              {p.made
                ? <circle cx={p.cx} cy={p.cy} r={2.7} fill={fill} stroke="#ffffff" strokeWidth={0.8} />
                : <path d={`M ${p.cx - d} ${p.cy - d} L ${p.cx + d} ${p.cy + d} M ${p.cx + d} ${p.cy - d} L ${p.cx - d} ${p.cy + d}`} stroke={x} strokeWidth={1.7} strokeLinecap="round" fill="none" />}
              {/* larger transparent hit target for easy clicking */}
              <circle cx={p.cx} cy={p.cy} r={4.5} fill="transparent" />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
