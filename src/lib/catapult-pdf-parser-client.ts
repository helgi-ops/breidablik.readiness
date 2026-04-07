/**
 * Client-side Catapult PDF parser.
 *
 * Uses pdf.js (loaded from CDN) to extract text from the PDF,
 * then regex-parses the drill summary rows.
 *
 * Supports TWO Catapult PDF formats:
 *
 * FORMAT A (old) — Page 1 main table has 9+ numeric columns:
 *   Avg Dist | Vel B5 | Vel B6 | HIR Dist | Avg PL | Acc B2-3 Tot Effs | Tot As | Decel B2-3 Tot Effs | Tot Ds
 *   Plus a sub-table with 2 columns: Acc B2-3 Avg Effs | Decel B2-3 Avg Effs
 *
 * FORMAT B (new) — Page 1 has 7 columns (some may be "n/a"):
 *   Avg Dist | Vel B5+ Avg Eff Dist | Vel B6+ Avg Eff Dist | HIR Dist | Avg PL | Acc B2-3 Avg Effs | Decel B2-3 Avg Effs
 *
 * Both formats share Page 2 with 8 columns:
 *   Avg Dist | Vel B5 Avg Dist | Vel B6 Avg Dist | HIR Dist | Max Vel | Avg PL | Tot As | Tot Ds
 *
 * This runs in the browser — no server-side dependencies needed.
 */

export interface ParsedDrillClient {
  drill_name: string;
  date: string; // YYYY-MM-DD
  distance_m: number | null;
  vel_b5: number | null; // Total Vel B5 distance (from page 2)
  vel_b6: number | null; // Total Vel B6 distance (from page 2)
  vel_b5_avg: number | null; // Avg Vel B5 Eff distance per player (from Format B page 1)
  vel_b6_avg: number | null; // Avg Vel B6 Eff distance per player (from Format B page 1)
  hir_dist_m: number | null;
  player_load: number | null;
  accel_b23_total: number | null; // Acc B2-3 Tot Effs (Format A main table)
  decel_b23_total: number | null; // Decel B2-3 Tot Effs (Format A main table)
  accel_b23_avg: number | null; // Acc B2-3 Avg Effs per session (Format A sub-table or Format B main)
  decel_b23_avg: number | null; // Decel B2-3 Avg Effs per session (Format A sub-table or Format B main)
  accel_total: number | null; // Tot As (#) — from page 2
  decel_total: number | null; // Tot Ds (#) — from page 2
  max_velocity: number | null; // Max Vel km/h — from page 2
}

// Dynamically load pdf.js from CDN
let pdfjsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(lib);
      } else {
        reject(new Error("pdfjsLib not found after script load"));
      }
    };
    script.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(script);
  });

  return pdfjsPromise;
}

/**
 * Extract text from a PDF buffer, preserving approximate layout.
 */
async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const lines: Map<number, Array<{ x: number; text: string }>> = new Map();
    const Y_TOLERANCE = 3;

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;

      const y = Math.round(item.transform[5]);
      let lineY: number | null = null;
      for (const key of lines.keys()) {
        if (Math.abs(key - y) <= Y_TOLERANCE) {
          lineY = key;
          break;
        }
      }
      if (lineY === null) lineY = y;

      if (!lines.has(lineY)) lines.set(lineY, []);
      lines.get(lineY)!.push({
        x: Math.round(item.transform[4]),
        text: item.str,
      });
    }

    const sortedLines = [...lines.entries()].sort((a, b) => b[0] - a[0]);

    const pageLines: string[] = [];
    for (const [, items] of sortedLines) {
      items.sort((a, b) => a.x - b.x);

      let line = "";
      let lastX = 0;
      for (const item of items) {
        const gap = item.x - lastX;
        if (gap > 30 && line.length > 0) {
          line += "  ".repeat(Math.max(1, Math.floor(gap / 15)));
        } else if (gap > 5 && line.length > 0) {
          line += " ";
        }
        line += item.text;
        lastX = item.x + item.text.length * 5;
      }
      pageLines.push(line);
    }

    if (i > 1) pages.push(`\n--- PAGE ${i} ---\n`);
    pages.push(pageLines.join("\n"));
  }

  return pages.join("\n");
}

/** Parse a number or return null for "n/a", "–", empty, etc. */
function safeNum(s: string): number | null {
  if (!s || s === "n/a" || s === "–" || s === "-") return null;
  const v = Number(s);
  return Number.isNaN(v) ? null : v;
}

/** Check if a line is a header/metadata line to skip */
function isHeaderLine(line: string): boolean {
  return (
    /SESSION\s+(SUMMARY|DURATION)/i.test(line) ||
    /Avg\s+Dist/i.test(line) ||
    /Vel\s+B[56]/i.test(line) ||
    /HIR\s+Dist/i.test(line) ||
    /Tot\s+[AD]s/i.test(line) ||
    /Max\s+Vel/i.test(line) ||
    /\(Gen\s*2\)/i.test(line) ||
    /\(Sess\)/i.test(line) ||
    /\(km\/h\)/i.test(line) ||
    /^\s*\(m\)\s*$/i.test(line) ||
    /Avg\s+Effs/i.test(line) ||
    /Eff\s+Dist/i.test(line) ||
    /PAGE\s+\d/i.test(line) ||
    /Powered\s+by/i.test(line) ||
    /BREI[ÐD]ABLIK/i.test(line) ||
    /Drillur/i.test(line) ||
    /Avg\s+PL/i.test(line) ||
    /Avg\s+Dur/i.test(line) ||
    /B2-3\s+Avg/i.test(line) ||
    /^Decel$/i.test(line.trim())
  );
}

/**
 * Parse a Catapult "Drill breakdown" PDF in the browser.
 * Handles both Format A and Format B automatically.
 */
export async function parseCatapultDrillPdfClient(
  file: File
): Promise<ParsedDrillClient[]> {
  const arrayBuffer = await file.arrayBuffer();
  const text = await extractTextFromPdf(arrayBuffer);

  // ── Extract date (DD/MM/YYYY) ──
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let sessionDate = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    sessionDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const lines = text.split("\n");

  // Regex for data rows: name followed by values (numbers or "n/a")
  const dataRowRe =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v/.·\-]*?)\s{2,}([\w/.]+(?:\s+[\w/.]+)*)\s*$/;

  const drills: Record<string, ParsedDrillClient> = {};

  // Detect page 1 format by scanning headers before PAGE 2
  // Format A: has "Tot Effs" or "Tot As" in page 1 headers (9+ cols, tot+avg separate)
  // Format B: has "Avg Eff Dist" but NOT "Max Vel" in page 1 headers
  // Format C: has "Max Vel" AND "Avg Effs" in page 1 headers (8 cols)
  let page1HasMaxVel = false;
  let page1HasTotEffs = false;
  for (const raw of lines) {
    if (raw.includes("PAGE 2") || raw.includes("PREVIEW")) break;
    if (/Max\s+Vel/i.test(raw)) page1HasMaxVel = true;
    if (/Tot\s+Effs/i.test(raw) || /Tot\s+As/i.test(raw)) page1HasTotEffs = true;
  }
  // Format A: page1HasTotEffs (9+ cols)
  // Format C: page1HasMaxVel && !page1HasTotEffs (8 cols with maxvel)
  // Format B: !page1HasMaxVel && !page1HasTotEffs (7 cols without maxvel)
  const page1Format: "A" | "B" | "C" = page1HasTotEffs ? "A" : page1HasMaxVel ? "C" : "B";

  let inPage2 = false;
  let inSubTable = false; // Format A: the Acc B2-3 Avg / Decel B2-3 Avg sub-table

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    // Detect page transitions
    if (
      line.includes("PREVIEW") ||
      line.includes("--- PAGE 2") ||
      line.includes("PAGE 2 OF")
    ) {
      inPage2 = true;
      inSubTable = false;
      continue;
    }

    // Detect Format A sub-table header: "Acc B2-3       Decel"
    if (!inPage2 && /Acc\s+B2-3\s+Decel/i.test(line)) {
      inSubTable = true;
      continue;
    }

    // Skip header/metadata lines
    if (isHeaderLine(line)) continue;

    const trimmed = line.trim();
    const m = trimmed.match(dataRowRe);
    if (!m) continue;

    const name = m[1].trim();
    const vals = m[2].trim().split(/\s+/);

    // Skip if name looks like a header
    if (/^(SESSION|AVG|BREI|Vel|HIR|Tot|Max|Acc|Decel|PAGE|Powered)/i.test(name))
      continue;

    // ── Page 2 (same for both formats): 8 numeric values ──
    // dist, velB5, velB6, hirDist, maxVel, pl, totAs, totDs
    if (inPage2 && vals.length >= 8) {
      const nums = vals.map(safeNum);
      if (!drills[name]) {
        drills[name] = {
          drill_name: name,
          date: sessionDate,
          distance_m: nums[0],
          vel_b5: nums[1],
          vel_b6: nums[2],
          vel_b5_avg: null,
          vel_b6_avg: null,
          hir_dist_m: nums[3],
          max_velocity: nums[4],
          player_load: nums[5],
          accel_b23_total: null,
          decel_b23_total: null,
          accel_b23_avg: null,
          decel_b23_avg: null,
          accel_total: nums[6],
          decel_total: nums[7],
        };
      } else {
        // Merge page 2 data into existing drill
        drills[name].vel_b5 = nums[1];
        drills[name].vel_b6 = nums[2];
        drills[name].max_velocity = nums[4];
        drills[name].accel_total = nums[6];
        drills[name].decel_total = nums[7];
      }
      continue;
    }

    // ── Page 1: Format A sub-table (2 values) ──
    if (inSubTable && !inPage2 && vals.length === 2) {
      const nums = vals.map(safeNum);
      if (drills[name]) {
        drills[name].accel_b23_avg = nums[0];
        drills[name].decel_b23_avg = nums[1];
      }
      continue;
    }

    // ── Page 1: Format A main table (9+ numeric values) ──
    // dist, vb5, vb6, hir, pl, accB23Tot, totAs, decB23Tot, totDs
    if (!inPage2 && !inSubTable && page1Format === "A" && vals.length >= 9) {
      const nums = vals.map(safeNum);
      drills[name] = {
        drill_name: name,
        date: sessionDate,
        distance_m: nums[0],
        vel_b5: nums[1],
        vel_b6: nums[2],
        vel_b5_avg: null,
        vel_b6_avg: null,
        hir_dist_m: nums[3],
        player_load: nums[4],
        accel_b23_total: nums[5],
        accel_total: nums[6],
        decel_b23_total: nums[7],
        decel_total: nums[8],
        accel_b23_avg: null,
        decel_b23_avg: null,
        max_velocity: null,
      };
      continue;
    }

    // ── Page 1: Format C (8 values with maxVel at position 4) ──
    // dist, velB5, velB6, hirDist, maxVel, pl, accB23Avg, decB23Avg
    if (!inPage2 && !inSubTable && page1Format === "C" && vals.length >= 7) {
      const nums = vals.map(safeNum);
      drills[name] = {
        drill_name: name,
        date: sessionDate,
        distance_m: nums[0],
        vel_b5: nums[1],
        vel_b6: nums[2],
        vel_b5_avg: null,
        vel_b6_avg: null,
        hir_dist_m: nums[3],
        max_velocity: nums[4],
        player_load: nums[5],
        accel_b23_total: null,
        decel_b23_total: null,
        accel_b23_avg: nums[6],
        decel_b23_avg: nums[7] ?? null,
        accel_total: null, // Will be filled from page 2
        decel_total: null, // Will be filled from page 2
      };
      continue;
    }

    // ── Page 1: Format B main table (6-7 values, may include "n/a") ──
    // dist, velB5AvgEff, velB6AvgEff, hirDist, pl, accB23Avg, decB23Avg
    if (!inPage2 && !inSubTable && page1Format === "B" && vals.length >= 6 && vals.length <= 8) {
      const nums = vals.map(safeNum);
      drills[name] = {
        drill_name: name,
        date: sessionDate,
        distance_m: nums[0],
        vel_b5: null, // Will be filled from page 2
        vel_b6: null, // Will be filled from page 2
        vel_b5_avg: nums[1], // Avg eff distance per player
        vel_b6_avg: nums[2], // Avg eff distance per player (can be null for "n/a")
        hir_dist_m: nums[3],
        player_load: nums[4],
        accel_b23_total: null, // Not in Format B page 1
        decel_b23_total: null,
        accel_b23_avg: nums[5],
        decel_b23_avg: nums[6] ?? null,
        accel_total: null, // Will be filled from page 2
        decel_total: null, // Will be filled from page 2
        max_velocity: null, // Will be filled from page 2
      };
      continue;
    }
  }

  return Object.values(drills).sort((a, b) =>
    a.drill_name.localeCompare(b.drill_name)
  );
}
