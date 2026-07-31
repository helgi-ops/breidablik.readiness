/**
 * Sample basketball IMA generator — DEMO ONLY.
 *
 * Basketball is indoor: GPS is dead, but Catapult indoor pods (ClearSky / Vector
 * indoor) still measure IMA — the "Driver": accelerations, decelerations,
 * change-of-direction, jumps, PlayerLoad. The free KKÍ feed carries no IMA, so
 * for a DEMO team we synthesise a realistic, deterministic sample profile so the
 * capability can be shown at a prospect meeting.
 *
 * This is illustrative SAMPLE data, never a real measurement. It is gated to
 * demo teams (isDemoTeamName) and is always surfaced with a "sample" label. It
 * never touches the readiness colour or any decision.
 */

/** Demo/sample teams only — real clubs must never get synthetic IMA. */
export function isDemoTeamName(name: string | null | undefined): boolean {
  const s = String(name ?? "").toLowerCase();
  return /sýni|syni|demo|sample|micropulse/.test(s);
}

// Small deterministic PRNG (xmur3 seed → mulberry32) so the same player+game
// always yields the same numbers — stable across reloads, no DB writes.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Family = "guard" | "wing" | "big";
function family(position: string | null | undefined): Family {
  const p = String(position ?? "").toUpperCase();
  if (/\bC\b|PF|CENTER|POWER/.test(p)) return "big";
  if (/PG|SG|\bG\b|GUARD|POINT|SHOOT/.test(p)) return "guard";
  return "wing";
}

export type SampleIma = {
  playerLoad: number;   // AU
  imaAccel: number;     // high-intensity accelerations
  imaDecel: number;     // hard decelerations
  imaCoD: number;       // change-of-direction events (L+R)
  jumps: number;        // take-offs / landings
  imaTotal: number;     // accel + decel + cod (headline movement count)
};

// Per-minute baselines (guard archetype) — realistic basketball indoor IMA.
const BASE = { accel: 1.35, decel: 1.55, cod: 3.15, jumps: 0.7, load: 13 };
const MULT: Record<Family, { accel: number; decel: number; cod: number; jumps: number; load: number }> = {
  guard: { accel: 1.15, decel: 1.0, cod: 1.18, jumps: 0.75, load: 1.0 },
  wing:  { accel: 1.0, decel: 1.0, cod: 1.0, jumps: 1.0, load: 1.0 },
  big:   { accel: 0.9, decel: 1.1, cod: 0.82, jumps: 1.5, load: 1.05 },
};

/** One game's sample IMA for a player (deterministic on playerId+gameId). */
export function sampleImaForGame(args: {
  playerId: string; gameId: string; minutes: number | null | undefined; position?: string | null;
}): SampleIma {
  const m = args.minutes && args.minutes > 0 ? args.minutes : 20;
  const fam = family(args.position);
  const mult = MULT[fam];
  const rnd = mulberry32(xmur3(`${args.playerId}|${args.gameId}`)());
  // ±12% deterministic jitter per metric.
  const jit = () => 0.88 + rnd() * 0.24;
  const accel = Math.round(m * BASE.accel * mult.accel * jit());
  const decel = Math.round(m * BASE.decel * mult.decel * jit());
  const cod = Math.round(m * BASE.cod * mult.cod * jit());
  const jumps = Math.round(m * BASE.jumps * mult.jumps * jit());
  const playerLoad = Math.round(m * BASE.load * mult.load * jit());
  return { playerLoad, imaAccel: accel, imaDecel: decel, imaCoD: cod, jumps, imaTotal: accel + decel + cod };
}
