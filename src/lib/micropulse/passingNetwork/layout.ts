/**
 * Schematic pitch layout for the passing network — pure, no IO.
 *
 * The StatsBomb OBV CSVs carry NO player coordinates, so we place nodes by nominal role
 * band (GK / DEF / MID / FWD, from players.position) and spread them evenly within the
 * band. This is a SCHEMATIC layout (by role), NOT average pitch positions — the panel
 * labels it as such. Coordinates are 0-100 on both axes: x = width (left→right), y =
 * length with the team's own goal at y=100 (bottom) attacking toward y=0 (top).
 */

export type Band = "GK" | "DEF" | "MID" | "FWD";
export type PitchNode = { ref: string; name: string; x: number; y: number; band: Band };

const BAND_Y: Record<Band, number> = { GK: 92, DEF: 72, MID: 48, FWD: 22 };

/** Map a nominal position string (EN or IS) to a role band; unknown → MID. */
export function bandOf(position: string | null | undefined): Band {
  const p = (position ?? "").toLowerCase();
  if (!p) return "MID";
  if (/goalkeep|keeper|\bgk\b|markv|mark(?!er)/.test(p)) return "GK";
  if (/defen|\bback\b|\bcb\b|\blb\b|\brb\b|\bwb\b|\brcb\b|\blcb\b|varn/.test(p)) return "DEF";
  if (/forward|strik|strík|wing|\bfw\b|\bst\b|\bcf\b|\brw\b|\blw\b|attack|sókn|framh|fram(?!k)/.test(p)) return "FWD";
  if (/mid|\bdm\b|\bcm\b|\bam\b|\bcdm\b|\bcam\b|miðj/.test(p)) return "MID";
  return "MID";
}

/** Place players on a 0-100 schematic pitch by role band, spread evenly within each band. */
export function roleBandLayout(
  players: Array<{ ref: string; name: string; position?: string | null }>,
): PitchNode[] {
  const byBand: Record<Band, Array<{ ref: string; name: string }>> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) byBand[bandOf(p.position)].push({ ref: p.ref, name: p.name });

  const nodes: PitchNode[] = [];
  (Object.keys(byBand) as Band[]).forEach((band) => {
    const row = byBand[band];
    const n = row.length;
    row.forEach((p, i) => {
      // Even spread across the width with a margin; single node → centred.
      const x = n === 1 ? 50 : 12 + (76 * i) / (n - 1);
      nodes.push({ ref: p.ref, name: p.name, x, y: BAND_Y[band], band });
    });
  });
  return nodes;
}
