/**
 * Client-side Catapult PDF parser.
 *
 * Uses pdf.js (loaded from CDN) to extract text from the PDF,
 * then regex-parses the drill summary rows.
 *
 * This runs in the browser — no server-side dependencies needed.
 */

export interface ParsedDrillClient {
  drill_name: string;
  date: string; // YYYY-MM-DD
  distance_m: number | null;
  vel_b5: number | null;
  vel_b6: number | null;
  hir_dist_m: number | null;
  player_load: number | null;
  accel_b23_total: number | null; // Acc B2-3 Tot Effs (from main table)
  decel_b23_total: number | null; // Decel B2-3 Tot Effs (from main table)
  accel_b23_avg: number | null; // Acc B2-3 Avg Effs per session (from sub-table)
  decel_b23_avg: number | null; // Decel B2-3 Avg Effs per session (from sub-table)
  accel_total: number | null; // Tot As (#)
  decel_total: number | null; // Tot Ds (#)
  max_velocity: number | null;
}

// Dynamically load pdf.js from CDN
let pdfjsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = new Promise((resolve, reject) => {
    // Check if already loaded
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
 * Returns one string per page, with items positioned by x-coordinate gaps.
 */
async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group items by approximate Y position (line)
    const lines: Map<number, Array<{ x: number; text: string }>> = new Map();
    const Y_TOLERANCE = 3; // pixels

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;

      const y = Math.round(item.transform[5]);
      // Find existing line within tolerance
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

    // Sort lines by Y (descending since PDF Y is bottom-up)
    const sortedLines = [...lines.entries()].sort((a, b) => b[0] - a[0]);

    const pageLines: string[] = [];
    for (const [, items] of sortedLines) {
      // Sort items by X position
      items.sort((a, b) => a.x - b.x);

      // Build line with spacing based on X gaps
      let line = "";
      let lastX = 0;
      for (const item of items) {
        const gap = item.x - lastX;
        if (gap > 30 && line.length > 0) {
          // Large gap = column separator
          line += "  ".repeat(Math.max(1, Math.floor(gap / 15)));
        } else if (gap > 5 && line.length > 0) {
          line += " ";
        }
        line += item.text;
        lastX = item.x + item.text.length * 5; // approximate character width
      }
      pageLines.push(line);
    }

    if (i > 1) pages.push(`\n--- PAGE ${i} ---\n`);
    pages.push(pageLines.join("\n"));
  }

  return pages.join("\n");
}

/**
 * Parse a Catapult "Drill breakdown" PDF in the browser.
 *
 * Page 1 has two tables:
 *   Main table (9 number columns):
 *     Avg Dist | Vel B5 | Vel B6 | HIR Dist | Avg PL | Acc B2-3 Tot Effs | Tot As (#) | Decel B2-3 Tot Effs | Tot Ds (#)
 *
 *   Sub-table (2 number columns):
 *     Acc B2-3 Avg Effs (Sess) | Decel B2-3 Avg Effs (Sess)
 *
 * Page 2 has one table (8 number columns):
 *     Avg Dist | Vel B5 | Vel B6 | HIR Dist | Max Vel | Avg PL | Tot As (#) | Tot Ds (#)
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

  // Regex for data rows: drill name followed by numbers
  const numberRowRe =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v/.·\-]*?)\s{2,}([\d.]+(?:\s+[\d.]+)*)\s*$/;

  const drills: Record<string, ParsedDrillClient> = {};

  let inPage2 = false;
  let inSubTable = false; // The Acc B2-3 Avg / Decel B2-3 Avg table on page 1

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

    // Detect the sub-table header on page 1:
    // "Acc B2-3       Decel"
    // "Avg Effs    B2-3 Avg"
    if (
      !inPage2 &&
      /Acc\s+B2-3\s+Decel/i.test(line)
    ) {
      inSubTable = true;
      continue;
    }

    // Skip header/metadata lines
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
      /BREI[ÐD]ABLIK/i.test(line) ||
      /Drillur/i.test(line) ||
      /Avg\s+PL/i.test(line) ||
      /Avg\s+Dur/i.test(line) ||
      /B2-3\s+Avg/i.test(line) ||
      /Decel$/i.test(line.trim())
    ) {
      continue;
    }

    const trimmed = line.trim();
    const m = trimmed.match(numberRowRe);
    if (!m) continue;

    const name = m[1].trim();
    const nums = m[2].trim().split(/\s+/).map(Number);

    if (inSubTable && !inPage2 && nums.length >= 2) {
      // Sub-table: Acc B2-3 Avg Effs, Decel B2-3 Avg Effs (2 columns)
      if (drills[name]) {
        drills[name].accel_b23_avg = nums[0];
        drills[name].decel_b23_avg = nums[1];
      }
    } else if (inPage2 && nums.length >= 8) {
      // Page 2: dist, vb5, vb6, hir, maxVel(decimal), pl, totAs, totDs
      if (!drills[name]) {
        drills[name] = {
          drill_name: name,
          date: sessionDate,
          distance_m: nums[0],
          vel_b5: nums[1],
          vel_b6: nums[2],
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
        // Merge max velocity from page 2
        drills[name].max_velocity = nums[4];
      }
    } else if (!inPage2 && !inSubTable && nums.length >= 9) {
      // Page 1 main table: dist, vb5, vb6, hir, pl, accB23Tot, totAs, decB23Tot, totDs
      drills[name] = {
        drill_name: name,
        date: sessionDate,
        distance_m: nums[0],
        vel_b5: nums[1],
        vel_b6: nums[2],
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
    }
  }

  return Object.values(drills).sort((a, b) =>
    a.drill_name.localeCompare(b.drill_name)
  );
}
