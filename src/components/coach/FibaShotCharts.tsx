"use client";

/**
 * FIBA LiveStats shot charts (MVP). Paste a KKÍ game URL → the server fetches the public
 * Genius Sports feed, stores the shots, and returns a half-court shot chart + per-player
 * shooting tendencies for BOTH teams (own player analysis + opponent scouting). Free,
 * public, descriptive — never touches the readiness colour or the daily decision.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { foldShot, type FibaShot, type PlayerTendency, type FibaPlayerBox, type FibaTeamTotals, type PbpSummary } from "@/lib/micropulse/basketballStats/fibaLiveStats";
import { shotLabel, zoneLabel } from "@/lib/micropulse/basketballStats/shotLabels";

type AiReport = { headline?: string; summary?: string; strengths?: string[]; weaknesses?: string[]; keyPlayers?: Array<{ name: string; note: string }>; howToDefend?: string[]; howToAttack?: string[] };
type Side = { shots: FibaShot[]; tendencies: PlayerTendency[]; box?: FibaPlayerBox[]; totals?: FibaTeamTotals | null; pbp?: PbpSummary | null; ai?: AiReport | null };
type Pulled = {
  matchId: string; ownTeam: { name: string } | null; oppTeam: { name: string } | null;
  own: Side; opp: Side; ownerTno?: number; rowsUpserted?: number; mappedOwnPlayers?: number;
};
type GameRow = { matchId: string; own: string | null; opp: string | null; shots: number; syncedAt: string | null };

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

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
function prettySub(sub: string | null, is: boolean): string {
  if (!sub) return "";
  const m = SUBTYPE_LABEL[sub.toLowerCase()];
  return m ? (is ? m.is : m.en) : sub.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}
function shotKey(s: FibaShot): string {
  return s.actionNumber != null ? `a${s.actionNumber}` : `${s.tno}-${s.playerName}-${s.x}-${s.y}`;
}
/** Straight-line shot distance from the basket, in metres (feed x=length/28 m, y=width/15 m). */
function shotDistanceM(s: FibaShot): number | null {
  if (s.x == null || s.y == null) return null;
  const f = foldShot(s.x, s.y);
  const dxm = (f.x - 5.625) * 0.28; // depth from the basket (1.575 m off the baseline)
  const dym = (f.y - 50) * 0.15; // width from centre
  return Math.round(Math.sqrt(dxm * dxm + dym * dym) * 10) / 10;
}
/** red cold → amber → green hot, from a 0..1 heat value. Null → no fill. */
function heatColor(t: number | null): string | null {
  if (t == null) return null;
  const tc = Math.max(0, Math.min(1, t));
  const stops = [[168, 62, 40], [222, 147, 40], [28, 122, 74]]; // red #a83e28, amber #de9328, green #1c7a4a
  const seg = tc < 0.5 ? 0 : 1;
  const lt = tc < 0.5 ? tc / 0.5 : (tc - 0.5) / 0.5;
  const ch = (i: number) => Math.round(stops[seg][i] + (stops[seg + 1][i] - stops[seg][i]) * lt);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}
/** Points-per-shot → heat (anchors 0.8 / 1.0 / 1.2 so 2PT & 3PT compare fairly). */
const zoneColorPps = (pps: number | null): string | null => heatColor(pps == null ? null : (pps - 0.8) / 0.4);
/** Player FG% vs the spot's expected FG% → heat (±8 pts spans cold→hot). */
const zoneColorRel = (playerPct: number | null, expectedPct: number): string | null =>
  heatColor(playerPct == null ? null : (playerPct - expectedPct + 8) / 16);

type ZoneName = "restricted" | "paint" | "midLeft" | "midCentre" | "midRight"
  | "threeLC" | "threeLW" | "threeTop" | "threeRW" | "threeRC";
const ZONE_ORDER: ZoneName[] = ["restricted", "paint", "midLeft", "midCentre", "midRight", "threeLC", "threeLW", "threeTop", "threeRW", "threeRC"];
/** Expected FG% per spot (typical league averages) — the baseline for relative colouring. */
const EXPECTED_FG: Record<ZoneName, number> = {
  restricted: 60, paint: 42, midLeft: 39, midCentre: 40, midRight: 39,
  threeLC: 38, threeLW: 35, threeTop: 35, threeRW: 35, threeRC: 38,
};
/** Court zone of a shot. 2PT: "restricted" within ~1.25 m of the rim, "paint" elsewhere in
 *  the key, else "mid" range split left / centre / right. 3PT: split by bearing from the
 *  basket into left corner / left wing / top / right wing / right corner. */
function shotZone(s: FibaShot): ZoneName {
  if (s.x != null && s.y != null) {
    const f = foldShot(s.x, s.y);
    const cx = (f.y / 100) * 150, cy = (f.x / 50) * 140; // chart plotting coords
    if (s.actionType === "3pt") {
      const a = Math.atan2(cx - 75, cy - 15.75) * 180 / Math.PI; // 0 = straight ahead, + = right, - = left
      if (a <= -55) return "threeLC";
      if (a <= -20) return "threeLW";
      if (a < 20) return "threeTop";
      if (a < 55) return "threeRW";
      return "threeRC";
    }
    if (Math.hypot(cx - 75, cy - 15.75) <= 12.5) return "restricted"; // basket at (75, 15.75), RA r=1.25 m
    if (cx >= 50.5 && cx <= 99.5 && cy <= 58) return "paint";
    return cx < 50.5 ? "midLeft" : cx > 99.5 ? "midRight" : "midCentre";
  }
  return s.actionType === "3pt" ? "threeTop" : "midCentre";
}

/** FG / 2P / 3P splits + zones (restricted / paint / mid L·C·R / three) + points + eFG%. */
function shootingSummary(shots: FibaShot[]) {
  let twoM = 0, twoA = 0, threeM = 0, threeA = 0;
  const z = Object.fromEntries(ZONE_ORDER.map((k) => [k, { m: 0, a: 0 }])) as Record<ZoneName, { m: number; a: number }>;
  for (const s of shots) {
    const three = s.actionType === "3pt";
    const made = s.result === 1;
    if (three) { threeA++; if (made) threeM++; } else { twoA++; if (made) twoM++; }
    const zn = z[shotZone(s)];
    zn.a++; if (made) zn.m++;
  }
  const fgm = twoM + threeM, fga = twoA + threeA;
  const p = (m: number, a: number): number | null => (a > 0 ? (m / a) * 100 : null);
  const zones = Object.fromEntries(ZONE_ORDER.map((k) => [k, { ...z[k], pct: p(z[k].m, z[k].a) }])) as Record<ZoneName, { m: number; a: number; pct: number | null }>;
  return {
    twoM, twoA, threeM, threeA, fgm, fga,
    twoPct: p(twoM, twoA), threePct: p(threeM, threeA), fgPct: p(fgm, fga),
    pts: twoM * 2 + threeM * 3,
    efg: fga > 0 ? ((fgm + 0.5 * threeM) / fga) * 100 : null,
    zones,
  };
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
type ZoneFill = Record<ZoneName, string | null>;
function ShotCourt({ shots, is, onSelect, selectedKey, big, shade, zoneFill }: { shots: FibaShot[]; is: boolean; onSelect?: (s: FibaShot) => void; selectedKey?: string | null; big?: boolean; shade?: boolean; zoneFill?: ZoneFill }) {
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

// ── InStat side of the source toggle — play-types + shot zones from the ingested InStat
//    data (own team, season). Complements FIBA's x/y shot charts. Reuses the season read. ──
type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null };
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type PlayerZones = { name: string; zones: ZoneAgg[] };

function InstatShotView({ is, token }: { is: boolean; token: () => Promise<string | null> }) {
  const L: "EN" | "IS" = is ? "IS" : "EN";
  const [tactical, setTactical] = React.useState<{ playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[]; games: number } | null>(null);
  const [zones, setZones] = React.useState<{ team: ZoneAgg[]; players: PlayerZones[]; games: number } | null>(null);
  const [zonePlayer, setZonePlayer] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => { (async () => {
    const t = await token(); if (!t) return;
    const r = await fetch("/api/coach/basketball-season-insights", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setTactical(r.tacticalShots ?? null); setZones(r.shotZones ?? null); }
    setLoaded(true);
  })(); }, [token]);

  const Bar = ({ label, made, att, pct, barPct }: { label: string; made: number; att: number; pct: number | null; barPct: number }) => (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 truncate text-[12px] text-slate-700" title={label}>{label}</div>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-orange-100/60"><div className="absolute inset-y-0 left-0 rounded bg-orange-500/70" style={{ width: `${Math.min(100, barPct)}%` }} /></div>
      <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{made}-{att}{pct != null ? ` · ${pct}%` : ""}</div>
    </div>
  );

  const hasTactical = tactical && (tactical.playtypes.length > 0 || tactical.efficiency.length > 0);
  const activeZones = zones ? (zonePlayer ? zones.players.find((p) => p.name === zonePlayer)?.zones ?? zones.team : zones.team) : [];

  if (loaded && !hasTactical && (!zones || zones.team.length === 0)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500">
        {is
          ? "Engin InStat-gögn enn. Flyttu inn InStat leikskýrslu (PDF) eða per-leikmanns töflu í InStat-upphleðslunni hér fyrir neðan — þá birtast play-types (pick'n'roll / catch-and-shoot / iso) og skotsvæði."
          : "No InStat data yet. Import an InStat Game Report (PDF) or per-player table via the InStat upload below — then play types (pick'n'roll / catch-and-shoot / iso) and shot zones appear here."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasTactical && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center gap-2"><span className="text-[13px] font-bold text-slate-800">{is ? "Hvernig við skorum" : "How we score"}</span><span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span><span className="text-[11px] text-slate-500">· {tactical!.games} {is ? "leikir" : "games"}</span></div>
          {tactical!.playtypes.length > 0 && (() => { const rows = tactical!.playtypes.slice(0, 8); const max = Math.max(1, ...rows.map((r) => r.att)); return (
            <div className="mt-2.5"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Sóknartegundir" : "Play types"}</div><div className="mt-1.5 space-y-1.5">{rows.map((r) => <Bar key={r.key} label={shotLabel(r.key, L)} made={r.made} att={r.att} pct={r.pct} barPct={(r.att / max) * 100} />)}</div></div>
          ); })()}
          {tactical!.efficiency.length > 0 && (() => { const max = Math.max(1, ...tactical!.efficiency.map((r) => r.att)); return (
            <div className="mt-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Sóknargerð" : "Offensive types"}</div><div className="mt-1.5 space-y-1.5">{tactical!.efficiency.map((r) => <Bar key={r.key} label={shotLabel(r.key, L)} made={r.made} att={r.att} pct={r.pct} barPct={(r.att / max) * 100} />)}</div></div>
          ); })()}
          <p className="mt-2.5 text-[11px] text-slate-500">{is ? "InStat-flokkar skarast, leggjast ekki í 100%. Súlan = magn; „m-t · %“ = hittni." : "InStat categories overlap (don't sum to 100%). Bar = volume; \"m-a · %\" = shooting."}</p>
        </div>
      )}
      {zones && zones.team.length > 0 && (() => { const max = Math.max(1, ...activeZones.map((z) => z.att)); return (
        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-bold text-slate-800">{is ? "Skotsvæði" : "Shot zones"}</span><span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">InStat</span>
            {zones.players.length > 0 && <select value={zonePlayer} onChange={(e) => setZonePlayer(e.target.value)} className="ml-auto rounded border border-orange-200 bg-white px-2 py-1 text-[12px]"><option value="">{is ? "Allt liðið" : "Whole team"}</option>{zones.players.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>}
          </div>
          <div className="mt-2.5 space-y-1.5">{activeZones.map((z) => <Bar key={z.key} label={zoneLabel(z.key, L)} made={z.made} att={z.att} pct={z.pct} barPct={(z.att / max) * 100} />)}</div>
        </div>
      ); })()}
      <p className="text-[11px] text-slate-400">{is ? "Úr innfluttum InStat-gögnum (þitt lið, tímabil). Lýsandi; snertir ekki readiness." : "From imported InStat data (your team, season). Descriptive; never touches readiness."}</p>
    </div>
  );
}

export default function FibaShotCharts({ onImported, focus = "opp" }: { onImported?: () => void; focus?: "own" | "opp" }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);

  const [source, setSource] = React.useState<"fiba" | "instat">("fiba");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Pulled | null>(null);
  const [side, setSide] = React.useState<"own" | "opp">(focus);
  const [player, setPlayer] = React.useState<string>("");
  const [tableMode, setTableMode] = React.useState<"shooting" | "box" | "pbp">("box");
  const [selShot, setSelShot] = React.useState<FibaShot | null>(null);
  const [zoom, setZoom] = React.useState(false);
  const [shade, setShade] = React.useState(false);
  const [heatMode, setHeatMode] = React.useState<"pps" | "rel">("rel");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [games, setGames] = React.useState<GameRow[]>([]);
  const [batchText, setBatchText] = React.useState("");
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchRes, setBatchRes] = React.useState<{ imported: number; failed: number; results: Array<{ matchId: string | null; ok: boolean; error?: string; own?: string | null; opp?: string | null; ownShots?: number; oppShots?: number }> } | null>(null);

  // Clear the selected shot when the view changes (team side / player / game).
  React.useEffect(() => { setSelShot(null); }, [side, player, data]);

  const loadGames = React.useCallback(async () => {
    const t = await token(); if (!t) return;
    const r = await fetch("/api/coach/basketball-fiba", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setGames(r.games ?? []);
  }, [token]);
  React.useEffect(() => { void loadGames(); }, [loadGames]);

  async function pull(ownerSide?: number) {
    if (!url.trim()) return;
    setBusy(true); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const r = await fetch("/api/coach/basketball-fiba", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ url, ownerSide }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Error"); return; }
      setData(r as Pulled); setPlayer(""); setSide(focus);
      onImported?.(); void loadGames();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  }

  async function pullBatch() {
    const urls = batchText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!urls.length) return;
    setBatchBusy(true); setBatchRes(null); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const r = await fetch("/api/coach/basketball-fiba", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ urls }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Error"); return; }
      setBatchRes({ imported: r.imported, failed: r.failed, results: r.results ?? [] });
      onImported?.(); void loadGames();
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setBatchBusy(false); }
  }

  async function openGame(matchId: string) {
    setBusy(true); setErr(null);
    try {
      const t = await token(); if (!t) return;
      const r = await fetch(`/api/coach/basketball-fiba?matchId=${matchId}`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" }).then((x) => x.json());
      if (r?.ok && r.found) { setData({ matchId, ownTeam: r.ownTeam, oppTeam: r.oppTeam, own: r.own, opp: r.opp }); setPlayer(""); setSide(focus); }
    } finally { setBusy(false); }
  }

  async function genAi() {
    if (!data) return;
    setAiBusy(true); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(is ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const r = await fetch("/api/coach/basketball-fiba", { method: "POST", headers: { Authorization: `Bearer ${t}`, "content-type": "application/json" }, body: JSON.stringify({ matchId: data.matchId, side, ai: true, lang: is ? "IS" : "EN" }) }).then((x) => x.json());
      if (!r.ok) { setErr(r.error ?? "Error"); return; }
      setData((d) => d ? { ...d, own: side === "own" ? { ...d.own, ai: r.ai } : d.own, opp: side === "opp" ? { ...d.opp, ai: r.ai } : d.opp } : d);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } finally { setAiBusy(false); }
  }

  const active = data ? (side === "own" ? data.own : data.opp) : null;
  const teamName = data ? (side === "own" ? data.ownTeam?.name : data.oppTeam?.name) ?? "—" : "—";
  const shownShots = active ? (player ? active.shots.filter((s) => `${s.shirt ?? ""}|${s.playerName}` === player) : active.shots) : [];
  const shownTend = active ? (player ? active.tendencies.filter((t) => t.key === player) : active.tendencies) : [];

  // Zone heat fills (points-per-shot) for the shown shots.
  const zoneFill = (): ZoneFill => {
    const z = shootingSummary(shownShots).zones;
    const fill = (k: ZoneName) => {
      const zn = z[k];
      if (heatMode === "rel") return zoneColorRel(zn.pct, EXPECTED_FG[k]);
      return zoneColorPps(zn.a > 0 ? (k.startsWith("three") ? 3 : 2) * (zn.m / zn.a) : null);
    };
    return Object.fromEntries(ZONE_ORDER.map((k) => [k, fill(k)])) as ZoneFill;
  };

  // Court + legend + click-a-shot detail — reused inline (small) and in the zoom modal (big).
  const renderCourt = (big: boolean) => (
    <div>
      <ShotCourt shots={shownShots} is={is} big={big} shade={shade} zoneFill={shade ? zoneFill() : undefined} onSelect={setSelShot} selectedKey={selShot ? shotKey(selShot) : null} />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
        {shade ? (
          <>
            <span className="inline-flex items-center gap-1">{heatMode === "rel" ? (is ? "Undir" : "Below") : (is ? "Kalt" : "Cold")}<span className="inline-block h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg,#a83e28,#de9328,#1c7a4a)" }} />{heatMode === "rel" ? (is ? "Yfir" : "Above") : (is ? "Heitt" : "Hot")}</span>
            <span className="text-slate-400">· {heatMode === "rel" ? (is ? "vs deildar-hittni eftir svæði" : "vs league % by zone") : (is ? "stig á skot eftir svæði" : "points/shot by zone")}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex overflow-hidden rounded border border-slate-200">
              <button onClick={() => setHeatMode("rel")} className={`px-1.5 py-0.5 ${heatMode === "rel" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "vs deild" : "vs league"}</button>
              <button onClick={() => setHeatMode("pps")} className={`px-1.5 py-0.5 ${heatMode === "pps" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "stig/skot" : "pts/shot"}</button>
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-500" /> {is ? "skorað" : "made"}</span>
            <span className="inline-flex items-center gap-1"><svg width="9" height="9" viewBox="0 0 9 9" className="block"><path d="M 1.5 1.5 L 7.5 7.5 M 7.5 1.5 L 1.5 7.5" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" /></svg> {is ? "missti" : "missed"}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#25a563]" /> 2P</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-[#3b5bff]" /> 3P</span>
          </>
        )}
        <span className="text-slate-300">·</span>
        <button onClick={() => setShade((v) => !v)} className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${shade ? "bg-[#2740e6] text-white" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{is ? "Hittni-skygging" : "Shade by %"}</button>
        <span className="text-slate-300">·</span>
        <span>{teamName} · {shownShots.length} {is ? "skot" : "shots"}</span>
      </div>
      {selShot ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[12px] shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-900">{selShot.shirt ? `#${selShot.shirt} ` : ""}{selShot.playerName}</span>
            <button onClick={() => setSelShot(null)} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="close">✕</button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${selShot.result === 1 ? "bg-[#25a563]/15 text-[#177a45]" : "bg-slate-100 text-slate-500"}`}>{selShot.result === 1 ? (is ? "Skorað" : "Made") : (is ? "Missti" : "Missed")}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{selShot.actionType === "3pt" ? "3PT" : "2PT"}</span>
            {prettySub(selShot.subType, is) ? <span className="text-slate-600">{prettySub(selShot.subType, is)}</span> : null}
            {selShot.period != null ? <span className="text-slate-500">· {is ? `${selShot.period}. lh.` : `Q${selShot.period}`}</span> : null}
            {shotDistanceM(selShot) != null ? <span className="text-slate-500">· {shotDistanceM(selShot)} m</span> : null}
          </div>
        </div>
      ) : (
        shownShots.length > 0 ? <p className="mt-1.5 text-[10.5px] text-slate-400">{is ? "Smelltu á skot fyrir nánar — eða á ⤢ til að stækka." : "Click a shot for detail — or ⤢ to enlarge."}</p> : null
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Source toggle — FIBA (free x/y shot charts + box) vs InStat (play types + zones). */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[12px]">
        <button onClick={() => setSource("fiba")} className={`rounded-md px-2.5 py-1 font-medium ${source === "fiba" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>FIBA LiveStats</button>
        <button onClick={() => setSource("instat")} className={`rounded-md px-2.5 py-1 font-medium ${source === "instat" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>InStat</button>
      </div>

      {source === "instat" ? <InstatShotView is={is} token={token} /> : (<>
      <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
        <div className="text-sm font-semibold text-slate-800">
          {focus === "own"
            ? (is ? "Shot charts fyrir þitt lið (FIBA LiveStats)" : "Your team's shot charts (FIBA LiveStats)")
            : (is ? "Shot charts úr FIBA LiveStats (KKÍ)" : "Shot charts from FIBA LiveStats (KKÍ)")}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
          {focus === "own"
            ? (is
                ? "Límdu inn slóð á leikinn þinn úr FIBA LiveStats (t.d. …/u/KKI/<id>/pbp.html). Við sækjum opinbera feed-ið og sýnum shot chart + leikjatölur fyrir þitt lið — og andstæðinginn ef þú vilt bera saman. Frítt og opinbert."
                : "Paste your game's URL from FIBA LiveStats (e.g. …/u/KKI/<id>/pbp.html). We fetch the public feed and show a shot chart + box score for your team — and the opponent too if you want to compare. Free and public.")
            : (is
                ? "Límdu inn slóð á KKÍ-leik úr FIBA LiveStats (t.d. …/u/KKI/<id>/pbp.html). Við sækjum opinbera feed-ið, geymum skotin og sýnum shot chart + skot-tilhneigingar fyrir bæði lið — þitt lið OG andstæðinginn. Frítt og opinbert."
                : "Paste a KKÍ game URL from FIBA LiveStats (e.g. …/u/KKI/<id>/pbp.html). We fetch the public feed, store the shots, and show a shot chart + shooting tendencies for both teams — your team AND the opponent. Free and public.")}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fibalivestats…/u/KKI/2846798/pbp.html"
            className="min-w-[280px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <button onClick={() => pull()} disabled={!url.trim() || busy} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : (is ? "Sækja" : "Fetch")}</button>
        </div>
        {err && <p className="mt-2 text-[12px] font-medium text-red-700">{err}</p>}

        {/* Batch — a season in one paste */}
        <details className="group mt-2 rounded-lg border border-orange-100 bg-white/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-slate-700">
            <span>{is ? "Sækja mörg í einu (tímabil) — líma marga leik-URL" : "Pull many at once (a season) — paste multiple game URLs"}</span>
            <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
          </summary>
          <div className="space-y-2 border-t border-orange-100 px-3 py-3">
            <p className="text-[11px] text-slate-500">
              {is
                ? "Límdu inn leik-URL, einn á línu (allar FIBA LiveStats síður leiksins virka — st/sc/bs/p/pbp/index). Við þekkjum þitt lið sjálfkrafa í hverjum leik. Hámark 40 í einu."
                : "Paste game URLs, one per line (any of the game's FIBA LiveStats pages work — st/sc/bs/p/pbp/index). We auto-detect your team per game. Max 40 at a time."}
            </p>
            <textarea value={batchText} onChange={(e) => setBatchText(e.target.value)} rows={5}
              placeholder={"https://fibalivestats…/u/KKI/2846798/pbp.html\nhttps://fibalivestats…/u/KKI/2843786/pbp.html"}
              className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-[11px]" />
            <button onClick={pullBatch} disabled={batchBusy || !batchText.trim()} className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {batchBusy ? (is ? "Sæki…" : "Fetching…") : (is ? "Sækja öll" : "Fetch all")}
            </button>
            {batchRes && (
              <div className="mt-1 rounded border border-slate-100 bg-slate-50 px-2.5 py-2 text-[12px]">
                <div className="font-semibold text-slate-700">{batchRes.imported} {is ? "sótt" : "imported"}{batchRes.failed ? ` · ${batchRes.failed} ${is ? "mistókst" : "failed"}` : ""}</div>
                <ul className="mt-1 space-y-0.5">
                  {batchRes.results.map((r, i) => (
                    <li key={i} className={r.ok ? "text-slate-600" : "text-red-700"}>
                      {r.ok ? "✓" : "✕"} {r.matchId ?? "?"}{r.ok ? ` — ${r.own ?? "?"} ${r.ownShots} / ${r.opp ?? "?"} ${r.oppShots} ${is ? "skot" : "shots"}` : ` — ${r.error}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>

        {games.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-[11px] text-slate-400">{is ? "Áður sótt:" : "Pulled:"}</span>
            {games.map((g) => (
              <button key={g.matchId} onClick={() => openGame(g.matchId)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-orange-300">
                {(g.own ?? "?")}–{(g.opp ?? "?")}
              </button>
            ))}
          </div>
        )}
      </div>

      {data && active && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          {/* Side toggle + swap */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button onClick={() => { setSide("own"); setPlayer(""); }} className={`rounded-md px-2.5 py-0.5 text-[12px] font-medium ${side === "own" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{data.ownTeam?.name ?? (is ? "Mitt lið" : "Us")}</button>
              <button onClick={() => { setSide("opp"); setPlayer(""); }} className={`rounded-md px-2.5 py-0.5 text-[12px] font-medium ${side === "opp" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{data.oppTeam?.name ?? (is ? "Andstæðingur" : "Opp")}</button>
            </div>
            {data.rowsUpserted != null && (
              <button onClick={() => pull(data.ownerTno === 1 ? 2 : 1)} disabled={busy} className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {is ? "↔ Skipta um lið" : "↔ Swap teams"}
              </button>
            )}
          </div>

          {/* AI scouting report — rules assemble the facts, the model narrates + cites them. */}
          <div className="mt-3 rounded-xl border border-[#2740e6]/20 bg-[#2740e6]/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-slate-800">{is ? "AI njósnaskýrsla" : "AI scouting report"}</span>
              <span className="rounded bg-[#2740e6] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">AI</span>
              <span className="text-[11px] text-slate-400">· {teamName} · {is ? "þessi leikur" : "this game"}</span>
              <button onClick={genAi} disabled={aiBusy} className="ml-auto rounded-lg border border-[#2740e6] px-2.5 py-1 text-[12px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-50">
                {aiBusy ? (is ? "Skrifa…" : "Writing…") : active.ai ? (is ? "Endurgera" : "Regenerate") : (is ? "Búa til skýrslu" : "Generate report")}
              </button>
            </div>
            {active.ai ? (
              <div className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-slate-700">
                {active.ai.headline && <p className="font-semibold text-slate-900">{active.ai.headline}</p>}
                {active.ai.summary && <p>{active.ai.summary}</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {active.ai.strengths?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{is ? "Styrkleikar" : "Strengths"}</div><ul className="mt-0.5 space-y-0.5">{active.ai.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul></div> : null}
                  {active.ai.weaknesses?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-red-700">{is ? "Veikleikar" : "Weaknesses"}</div><ul className="mt-0.5 space-y-0.5">{active.ai.weaknesses.map((s, i) => <li key={i}>• {s}</li>)}</ul></div> : null}
                  {active.ai.howToDefend?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Hvernig á að verjast" : "How to defend"}</div><ul className="mt-0.5 space-y-0.5">{active.ai.howToDefend.map((s, i) => <li key={i}>• {s}</li>)}</ul></div> : null}
                  {active.ai.howToAttack?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Hvar á að sækja" : "Where to attack"}</div><ul className="mt-0.5 space-y-0.5">{active.ai.howToAttack.map((s, i) => <li key={i}>• {s}</li>)}</ul></div> : null}
                </div>
                {active.ai.keyPlayers?.length ? <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Lykilmenn" : "Key players"}</div><ul className="mt-0.5 space-y-0.5">{active.ai.keyPlayers.map((p, i) => <li key={i}><b>{p.name}</b> — {p.note}</li>)}</ul></div> : null}
                <p className="border-t border-slate-100 pt-1.5 text-[10.5px] text-slate-400">{is ? "AI-samið úr tölum þessa leiks (FIBA + InStat ef til). Reglur velja staðreyndirnar; AI orðar. Lýsandi — snertir ekki readiness." : "AI-written from this game's numbers (FIBA + InStat if present). Rules pick the facts; the AI phrases them. Descriptive — never touches readiness."}</p>
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] text-slate-500">{is ? "Búðu til AI-njósnaskýrslu fyrir þetta lið úr leiks-tölunum (box, skot-samhengi, stoðsendinga-net, tilhneigingar)." : "Generate an AI scouting report for this team from the game's numbers (box, shot context, assist network, tendencies)."}</p>
            )}
          </div>

          {/* Player filter — sits below the team-level AI report, next to the shot chart /
              shooting table it actually drives (team totals + AI stay team-wide). */}
          {active.tendencies.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Leikmaður" : "Player"}</span>
              <select value={player} onChange={(e) => setPlayer(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[12px]">
                <option value="">{is ? "Allt liðið" : "Whole team"}</option>
                {active.tendencies.map((t) => <option key={t.key} value={t.key}>{t.shirt ? `${t.shirt} ` : ""}{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="mt-3 grid gap-4 md:grid-cols-[auto_1fr]">
            <div className="relative">
              {shownShots.length > 0 ? (
                <button onClick={() => setZoom(true)} className="absolute right-1.5 top-1.5 z-10 rounded bg-white/85 px-1.5 py-0.5 text-[13px] leading-none text-slate-500 shadow-sm hover:text-slate-800" aria-label={is ? "Stækka" : "Enlarge"} title={is ? "Stækka" : "Enlarge"}>⤢</button>
              ) : null}
              {renderCourt(false)}
            </div>

            {/* Box + tendencies */}
            <div className="overflow-x-auto">
              {/* Team scoring breakdown (from the feed's team totals) */}
              {active.totals && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {([
                    [is ? "Stig í teig" : "Paint", active.totals.pointsInPaint],
                    [is ? "Hraðaupphlaup" : "Fastbreak", active.totals.fastbreak],
                    [is ? "Af tapi" : "Off TO", active.totals.pointsOffTurnovers],
                    [is ? "2. sókn" : "2nd chance", active.totals.secondChance],
                    [is ? "Bekkur" : "Bench", active.totals.bench],
                  ] as Array<[string, number | null]>).map(([label, v]) => (
                    <span key={label} className="rounded-full border border-orange-100 bg-orange-50/60 px-2 py-0.5 text-[11px] text-slate-600">
                      {label} <b className="tabular-nums text-slate-800">{v ?? "—"}</b>
                    </span>
                  ))}
                </div>
              )}

              {/* Box | Shooting | Play-by-play toggle */}
              <div className="mb-1.5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                <button onClick={() => setTableMode("box")} className={`rounded-md px-2 py-0.5 font-medium ${tableMode === "box" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "Leikjatölur" : "Box"}</button>
                <button onClick={() => setTableMode("shooting")} className={`rounded-md px-2 py-0.5 font-medium ${tableMode === "shooting" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "Skotnýting" : "Shooting"}</button>
                <button onClick={() => setTableMode("pbp")} className={`rounded-md px-2 py-0.5 font-medium ${tableMode === "pbp" ? "bg-[#2740e6] text-white" : "text-slate-600"}`}>{is ? "Leikferli" : "Play-by-play"}</button>
              </div>

              {tableMode === "pbp" ? (
                (() => {
                  const p = active.pbp;
                  const c = p?.context;
                  const ctxRow = (label: string, made: number | undefined, total: number | undefined) => (
                    <span className="rounded-full border border-orange-100 bg-orange-50/60 px-2 py-0.5 text-[11px] text-slate-600">
                      {label} <b className="tabular-nums text-slate-800">{made ?? 0}</b>{total ? <span className="text-slate-400"> ({Math.round(((made ?? 0) / total) * 100)}%)</span> : null}
                    </span>
                  );
                  return (
                    <div className="space-y-3">
                      {/* Shot context — where the made FGs came from */}
                      {c && c.totalMade > 0 && (
                        <div>
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? `Hvaðan skorað (af ${c.totalMade} skoruðum)` : `How the makes came (of ${c.totalMade})`}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {ctxRow(is ? "Í teig" : "Paint", c.paint, c.totalMade)}
                            {ctxRow(is ? "Hraðaupphlaup" : "Fastbreak", c.fastbreak, c.totalMade)}
                            {ctxRow(is ? "Af tapi" : "Off TO", c.offTurnover, c.totalMade)}
                            {ctxRow(is ? "2. sókn" : "2nd chance", c.secondChance, c.totalMade)}
                          </div>
                        </div>
                      )}
                      {/* Assist network — who feeds whom */}
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Stoðsendinga-net (gefur → skorar)" : "Assist network (passer → scorer)"}</div>
                        {p && p.assists.length > 0 ? (
                          <ul className="space-y-0.5">
                            {p.assists.slice(0, 10).map((a, i) => (
                              <li key={i} className="flex items-center gap-2 text-[12px]">
                                <span className="text-slate-700">{a.passer} <span className="text-slate-400">→</span> {a.scorer}</span>
                                <span className="tabular-nums font-semibold text-slate-800">{a.count}</span>
                                {a.threes > 0 && <span className="rounded bg-blue-50 px-1 text-[10px] font-semibold text-blue-700">{a.threes}×3</span>}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-[11px] text-slate-400">{is ? "Engar stoðsendingar skráðar í leikferlinu." : "No assists recorded in the play-by-play."}</p>}
                      </div>
                    </div>
                  );
                })()
              ) : tableMode === "shooting" ? (
                <table className="w-full min-w-[380px] text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                      <th className="py-1 pr-2 text-right">FG</th><th className="py-1 pr-2 text-right">FG%</th>
                      <th className="py-1 pr-2 text-right">2P</th><th className="py-1 pr-2 text-right">3P</th>
                      <th className="py-1 pl-2">{is ? "Mest" : "Top type"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownTend.map((t) => (
                      <tr key={t.key} className="border-b border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{t.shirt ? `${t.shirt} ` : ""}{t.name}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{t.fgm}-{t.fga}</td>
                        <td className="py-1 pr-2 text-right tabular-nums font-semibold text-slate-800">{pct(t.fgPct)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{t.twoM}-{t.twoA}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{t.tpm}-{t.tpa}</td>
                        <td className="py-1 pl-2 text-slate-500">{t.byType[0] ? `${t.byType[0].type} (${t.byType[0].made}-${t.byType[0].att})` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[440px] text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Mín" : "Min"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Stig" : "PTS"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Frák" : "REB"}</th>
                      <th className="py-1 pr-1 text-right">{is ? "Stoð" : "AST"}</th>
                      <th className="py-1 pr-1 text-right">STL</th><th className="py-1 pr-1 text-right">BLK</th>
                      <th className="py-1 pr-1 text-right">TO</th><th className="py-1 pl-1 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(active.box ?? []).map((b, i) => (
                      <tr key={`${b.shirt}-${b.name}-${i}`} className="border-b border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{b.shirt ? `${b.shirt} ` : ""}{b.name}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-400">{b.min ?? "—"}</td>
                        <td className="py-1 pr-1 text-right tabular-nums font-semibold text-slate-800">{b.pts ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-600">{b.reb ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-600">{b.ast ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{b.stl ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{b.blk ?? 0}</td>
                        <td className="py-1 pr-1 text-right tabular-nums text-slate-500">{b.tov ?? 0}</td>
                        <td className={`py-1 pl-1 text-right tabular-nums font-medium ${(b.pm ?? 0) > 0 ? "text-emerald-600" : (b.pm ?? 0) < 0 ? "text-red-600" : "text-slate-400"}`}>{b.pm != null ? (b.pm > 0 ? `+${b.pm}` : b.pm) : "—"}</td>
                      </tr>
                    ))}
                    {(active.box ?? []).length === 0 && <tr><td colSpan={9} className="py-2 text-[11px] text-slate-400">{is ? "Engar leikjatölur — sæktu leikinn aftur." : "No box score — re-fetch the game."}</td></tr>}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                {is
                  ? "Skot + leikjatölur úr FIBA LiveStats (Genius Sports) — opinbert. Lýsandi njósn; snertir ekki readiness. Stefna vallar staðfest í prod."
                  : "Shots + box from FIBA LiveStats (Genius Sports) — public. Descriptive scouting; never touches readiness. Court orientation verified in prod."}
              </p>
            </div>
          </div>

          {/* Enlarged shot chart — pop-up (still clickable for per-shot detail). */}
          {zoom && typeof document !== "undefined" ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setZoom(false)} role="dialog" aria-modal="true">
              <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">{teamName} · {shownShots.length} {is ? "skot" : "shots"}{player ? ` · ${player.split("|")[1] ?? player}` : ""}</span>
                  <button onClick={() => setZoom(false)} aria-label="close" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
                </div>
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  {renderCourt(true)}
                  {(() => {
                    const sm = shootingSummary(shownShots);
                    const Tile = ({ label, main, sub }: { label: string; main: string; sub?: string }) => (
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                        <div className="text-[16px] font-bold tabular-nums text-slate-900">{main}</div>
                        {sub ? <div className="text-[11px] tabular-nums text-slate-500">{sub}</div> : null}
                      </div>
                    );
                    return (
                      <div className="min-w-[210px]">
                        <div className="text-[13px] font-bold text-slate-800">{is ? "Skotnýting" : "Shooting"}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Tile label="FG" main={`${sm.fgm}-${sm.fga}`} sub={pct(sm.fgPct)} />
                          <Tile label={is ? "Stig" : "Points"} main={String(sm.pts)} />
                          <Tile label="eFG%" main={pct(sm.efg)} />
                          {active?.totals ? <Tile label={is ? "Stig í teig" : "Paint pts"} main={String(active.totals.pointsInPaint ?? "—")} /> : null}
                        </div>
                        <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Eftir svæði" : "By zone"}</div>
                        <table className="mt-1 w-full text-[11px]">
                          <thead>
                            <tr className="text-[9.5px] uppercase tracking-wide text-slate-400">
                              <th className="py-0.5 pr-2 text-left font-semibold">{is ? "Svæði" : "Zone"}</th>
                              <th className="py-0.5 text-right font-semibold">M-T</th>
                              <th className="py-0.5 pl-2 text-right font-semibold">%</th>
                              <th className="w-11 py-0.5 pl-2 text-right font-semibold" title={is ? "vs væntanleg deildar-hittni" : "vs expected league %"}>{is ? "vs vænt" : "vs exp"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {([
                              ["restricted", is ? "Undir körfu" : "Restricted"],
                              ["paint", is ? "Teigur" : "Paint"],
                              ["midLeft", is ? "Mið — vinstri" : "Mid — left"],
                              ["midCentre", is ? "Mið — miðja" : "Mid — centre"],
                              ["midRight", is ? "Mið — hægri" : "Mid — right"],
                              ["threeLC", is ? "3ja — vinstra horn" : "3 — left corner"],
                              ["threeLW", is ? "3ja — vinstri vængur" : "3 — left wing"],
                              ["threeTop", is ? "3ja — toppur" : "3 — top"],
                              ["threeRW", is ? "3ja — hægri vængur" : "3 — right wing"],
                              ["threeRC", is ? "3ja — hægra horn" : "3 — right corner"],
                            ] as Array<[ZoneName, string]>).map(([k, label]) => {
                              const zn = sm.zones[k];
                              const delta = zn.pct != null ? zn.pct - EXPECTED_FG[k] : null;
                              return (
                                <tr key={k} className="border-b border-slate-50">
                                  <td className="py-0.5 pr-2 text-slate-600">{label}</td>
                                  <td className="py-0.5 text-right tabular-nums font-semibold text-slate-800">{zn.m}-{zn.a}</td>
                                  <td className="w-10 py-0.5 pl-2 text-right tabular-nums text-slate-500">{pct(zn.pct)}</td>
                                  <td className={`w-11 py-0.5 pl-2 text-right tabular-nums font-semibold ${delta == null ? "text-slate-300" : delta >= 1.5 ? "text-[#177a45]" : delta <= -1.5 ? "text-[#a83e28]" : "text-slate-400"}`}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}`}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="mt-2 text-[10.5px] leading-snug text-slate-400">{is ? "Reiknað úr skotunum sem sýnd eru; svæði úr skot-hnitum (teigur = inni í teignum). eFG% vegur þrista." : "From the shots shown; zones from shot coordinates (paint = inside the key). eFG% weights threes."}</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>,
            document.body,
          ) : null}
        </div>
      )}
      </>)}
    </div>
  );
}
