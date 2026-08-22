/**
 * Passing network engine — pure, no IO.
 *
 * Turns per-player passing (volume + OBV) and passer→receiver combinations (from the two
 * StatsBomb OBV CSVs) into a coach-ready read: who added most value passing, the most
 * frequent and most valuable links, and the scaling constants the schematic SVG needs.
 * Descriptive only — never touches the readiness colour.
 */

export type Bi = { en: string; is: string };

export type PassingPlayer = {
  ref: string;
  name: string;
  playerId?: string | null;
  passes: number | null;
  obv: number | null;
};

export type PassingEdge = {
  passerRef: string;
  passerName: string;
  receiverRef: string;
  receiverName: string;
  passes: number | null;
  obv: number | null;
};

export type PassingNetworkRead = {
  players: PassingPlayer[];        // sorted by OBV desc
  topByVolume: PassingEdge[];      // most frequent links
  topByObv: PassingEdge[];         // most valuable links
  totalPasses: number;
  totalObv: number;
  maxPlayerPasses: number;         // for node-size scaling
  maxEdgePasses: number;           // for edge-width scaling
  obvMin: number;                  // for node/edge colour scaling
  obvMax: number;
};

const n0 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Build the network read. `top` caps each ranked list (default 8). */
export function buildPassingNetwork(players: PassingPlayer[], edges: PassingEdge[], top = 8): PassingNetworkRead {
  const sortedPlayers = [...players].sort((a, b) => n0(b.obv) - n0(a.obv));
  const withPasses = edges.filter((e) => n0(e.passes) > 0);
  const topByVolume = [...withPasses].sort((a, b) => n0(b.passes) - n0(a.passes)).slice(0, top);
  const topByObv = [...edges].sort((a, b) => n0(b.obv) - n0(a.obv)).slice(0, top);

  const totalPasses = players.reduce((s, p) => s + n0(p.passes), 0);
  const totalObv = players.reduce((s, p) => s + n0(p.obv), 0);
  const maxPlayerPasses = players.reduce((m, p) => Math.max(m, n0(p.passes)), 0);
  const maxEdgePasses = edges.reduce((m, e) => Math.max(m, n0(e.passes)), 0);

  const obvVals = [...players.map((p) => n0(p.obv)), ...edges.map((e) => n0(e.obv))];
  const obvMin = obvVals.length ? Math.min(...obvVals) : 0;
  const obvMax = obvVals.length ? Math.max(...obvVals) : 0;

  return { players: sortedPlayers, topByVolume, topByObv, totalPasses, totalObv, maxPlayerPasses, maxEdgePasses, obvMin, obvMax };
}

export type PlayerPassingLinks = {
  asPasser: PassingEdge[];   // this player → receivers (top by passes)
  asReceiver: PassingEdge[]; // passers → this player (top by passes)
  bestValueOut: PassingEdge | null; // highest-OBV link they created
};

/** The passing links for one player (by playerId or ref) — for the player profile. */
export function topPassingLinks(edges: PassingEdge[], match: { playerId?: string | null; ref?: string | null }, top = 4): PlayerPassingLinks {
  const isP = (e: PassingEdge) => (match.ref ? e.passerRef === match.ref : false);
  const isR = (e: PassingEdge) => (match.ref ? e.receiverRef === match.ref : false);
  const out = edges.filter(isP);
  const inc = edges.filter(isR);
  const byPasses = (a: PassingEdge, b: PassingEdge) => n0(b.passes) - n0(a.passes);
  return {
    asPasser: [...out].sort(byPasses).slice(0, top),
    asReceiver: [...inc].sort(byPasses).slice(0, top),
    bestValueOut: [...out].sort((a, b) => n0(b.obv) - n0(a.obv))[0] ?? null,
  };
}
