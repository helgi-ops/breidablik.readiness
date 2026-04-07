import { execSync } from "child_process";

export interface ParsedDrill {
  drillName: string;
  date: string; // YYYY-MM-DD
  distanceM: number | null;
  velB5: number | null;
  velB6: number | null;
  hirDistM: number | null;
  playerLoad: number | null;
  accelB23: number | null;
  decelB23: number | null;
  accelTotal: number | null;
  decelTotal: number | null;
  maxVelocity: number | null;
}

/**
 * Parse a Catapult "Drill breakdown" PDF.
 *
 * Uses pdftotext (poppler-utils) to extract text with layout,
 * then regex-parses the drill summary rows.
 */
export async function parseCatapultDrillPdf(
  buffer: Buffer
): Promise<ParsedDrill[]> {
  // Write buffer to a temp file, run pdftotext, clean up
  const tmp = `/tmp/catapult-drill-${Date.now()}.pdf`;
  const fs = await import("fs");
  fs.writeFileSync(tmp, buffer);

  let text: string;
  try {
    text = execSync(`pdftotext -layout "${tmp}" -`, {
      encoding: "utf-8",
      timeout: 10_000,
    });
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }

  // ── Extract date (DD/MM/YYYY) ──
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let sessionDate = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    sessionDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const lines = text.split("\n");

  // ── Page 1 main table ──
  // Rows look like:
  // Possession                    2274         41                5          45        199          119         32          153              29
  // Pattern: drill name at start, then 10 numbers
  const page1Re =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v]*?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;

  // ── Page 2 table (has max velocity as decimal) ──
  // SSG 10v10                     1817         65                6          71        28.9       156           23              22
  // Pattern: drill name, then 4 ints, 1 decimal, 3 ints
  const page2Re =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v]*?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;

  // ── Per-drill accel/decel B2-3 averages (sub-table page 1) ──
  // Upphitun                1  0
  const subRe =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v]*?)\s{2,}(\d+)\s+(\d+)\s*$/;

  const drills: Record<string, ParsedDrill> = {};

  // Track whether we've passed the sub-table header (Acc B2-3 / Decel cols)
  let inSubTable = false;
  // Track if we've seen "PREVIEW" or page 2 header
  let inPage2 = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    // Detect page / section transitions
    if (line.includes("PREVIEW") || (line.includes("PAGE 2") && line.includes("OF"))) {
      inPage2 = true;
      inSubTable = false;
      continue;
    }
    if (/Acc\s+B2-3\s+Decel/i.test(line) && !inPage2) {
      inSubTable = true;
      continue;
    }

    // Skip header rows
    if (
      /SESSION\s+(SUMMARY|DURATION)/i.test(line) ||
      /Avg\s+Dist/i.test(line) ||
      /Vel\s+B[56]/i.test(line) ||
      /HIR\s+Dist/i.test(line) ||
      /Tot\s+[AD]s/i.test(line) ||
      /Max\s+Vel/i.test(line) ||
      /\(Gen\s*2\)/i.test(line) ||
      /\(Sess\)/i.test(line) ||
      /\(km\/h\)/i.test(line) ||
      /\(m\)/i.test(line) ||
      /Avg\s+Effs/i.test(line) ||
      /PAGE\s+\d/i.test(line) ||
      /Powered\s+by/i.test(line) ||
      /BREIÐABLIK/i.test(line) ||
      /Drillur/i.test(line)
    ) {
      continue;
    }

    const trimmed = line.trim();

    if (inPage2) {
      // Page 2: 9-number row with decimal max vel
      const m = trimmed.match(page2Re);
      if (m) {
        const name = m[1].trim();
        if (!drills[name]) {
          drills[name] = {
            drillName: name,
            date: sessionDate,
            distanceM: int(m[2]),
            velB5: int(m[3]),
            velB6: int(m[4]),
            hirDistM: int(m[5]),
            playerLoad: int(m[7]),
            accelB23: null,
            decelB23: null,
            accelTotal: int(m[8]),
            decelTotal: int(m[9]),
            maxVelocity: float(m[6]),
          };
        } else {
          drills[name].maxVelocity = float(m[6]);
        }
      }
    } else if (inSubTable) {
      // Sub-table: drill name + 2 numbers (avg accel B2-3, avg decel B2-3)
      const m = trimmed.match(subRe);
      if (m) {
        const name = m[1].trim();
        if (drills[name]) {
          // These are per-session averages, we already have totals — store as-is
          // The main table has total effs; sub-table has avg effs per session
        }
      }
    } else {
      // Page 1 main table: 10-number row
      const m = trimmed.match(page1Re);
      if (m) {
        const name = m[1].trim();
        drills[name] = {
          drillName: name,
          date: sessionDate,
          distanceM: int(m[2]),
          velB5: int(m[3]),
          velB6: int(m[4]),
          hirDistM: int(m[5]),
          playerLoad: int(m[6]),
          accelB23: int(m[7]),
          accelTotal: int(m[8]),
          decelB23: int(m[9]),
          decelTotal: int(m[10]),
          maxVelocity: null,
        };
      }
    }
  }

  return Object.values(drills).sort((a, b) =>
    a.drillName.localeCompare(b.drillName)
  );
}

function int(s: string): number | null {
  const v = parseInt(s, 10);
  return isNaN(v) ? null : v;
}
function float(s: string): number | null {
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}
