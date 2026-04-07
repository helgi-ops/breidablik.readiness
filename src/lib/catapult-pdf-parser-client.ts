/**
 * Client-side Catapult PDF parser.
 *
 * Uses pdf.js (loaded from CDN) to extract text from the PDF,
 * then regex-parses the drill summary rows.
 *
 * Supports the Breiðablik Catapult "Drill breakdown" PDF format:
 *
 * PAGE 1 — 8 columns:
 *   Avg Dist (m) | Vel B5 Avg Dist (m) | Vel B6 Avg Dist (m) | HIR Dist (m) |
 *   Max Vel (km/h) | Avg PL | Acc B2-3 Avg Effs | Decel B2-3 Avg Effs
 *
 * PAGE 2 — 8 columns:
 *   Avg Dist (m) | Vel B5 Avg Dist (m) | Vel B6 Avg Dist (m) | HIR Dist (m) |
 *   Max Vel (km/h) | Avg PL (Sess) | Tot As (#) | Tot Ds (#)
 *
 * This runs in the browser — no server-side dependencies needed.
 */

export interface ParsedDrillClient {
  drill_name: string;
  date: string; // YYYY-MM-DD
  distance_m: number | null;
  vel_b5: number | null; // Vel B5 Avg Dist
  vel_b6: number | null; // Vel B6 Avg Dist
  vel_b5_avg: number | null;
  vel_b6_avg: number | null;
  hir_dist_m: number | null;
  player_load: number | null;
  accel_b23_total: number | null;
  decel_b23_total: number | null;
  accel_b23_avg: number | null; // Acc B2-3 Avg Effs (page 1)
  decel_b23_avg: number | null; // Decel B2-3 Avg Effs (page 1)
  accel_total: number | null; // Tot As (#) (page 2)
  decel_total: number | null; // Tot Ds (#) (page 2)
  max_velocity: number | null; // Max Vel km/h
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
 *
 * Page 1 data rows have 8 values:
 *   dist, velB5, velB6, hirDist, maxVel, pl, accB23Avg, decB23Avg
 *
 * Page 2 data rows have 8 values:
 *   dist, velB5, velB6, hirDist, maxVel, pl, totAs, totDs
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

  // Regex for data rows: name followed by numeric values
  const dataRowRe =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v/.·\-]*?)\s{2,}([\w/.]+(?:\s+[\w/.]+)*)\s*$/;

  const drills: Record<string, ParsedDrillClient> = {};

  let inPage2 = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    // Detect page 2 transition
    if (
      line.includes("PREVIEW") ||
      line.includes("--- PAGE 2") ||
      line.includes("PAGE 2 OF")
    ) {
      inPage2 = true;
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
    if (
      /^(SESSION|AVG|BREI|Vel|HIR|Tot|Max|Acc|Decel|PAGE|Powered)/i.test(name)
    )
      continue;

    // Need at least 6 values for a valid data row
    if (vals.length < 6) continue;

    const nums = vals.map(safeNum);

    if (inPage2) {
      // ── Page 2: dist, velB5, velB6, hirDist, maxVel, pl, totAs, totDs ──
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
          accel_total: nums[6] ?? null,
          decel_total: nums[7] ?? null,
        };
      } else {
        // Merge page 2 totals into existing drill from page 1
        drills[name].accel_total = nums[6] ?? null;
        drills[name].decel_total = nums[7] ?? null;
        // Page 2 also has maxVel, velB5, velB6 — use as fallback
        if (drills[name].max_velocity == null) drills[name].max_velocity = nums[4];
        if (drills[name].vel_b5 == null) drills[name].vel_b5 = nums[1];
        if (drills[name].vel_b6 == null) drills[name].vel_b6 = nums[2];
      }
    } else {
      // ── Page 1: dist, velB5, velB6, hirDist, maxVel, pl, accB23Avg, decB23Avg ──
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
        accel_b23_avg: nums[6] ?? null,
        decel_b23_avg: nums[7] ?? null,
        accel_total: null, // Filled from page 2
        decel_total: null, // Filled from page 2
      };
    }
  }

  return Object.values(drills).sort((a, b) =>
    a.drill_name.localeCompare(b.drill_name)
  );
}
