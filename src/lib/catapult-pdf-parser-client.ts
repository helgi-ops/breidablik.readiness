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
  accel_b23: number | null;
  decel_b23: number | null;
  accel_total: number | null;
  decel_total: number | null;
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

  // Match data rows: drill name followed by numbers
  // Page 1: name + 10 integers (dist, vb5, vb6, hir, pl, accB23, totAs, decB23, totDs)
  // But pdf.js spacing may differ from pdftotext, so use a more flexible approach:
  // Look for lines with a name followed by multiple numbers
  const numberRowRe =
    /^([A-Za-zÀ-ÿÞþÐð0-9][\w\sÀ-ÿÞþÐð+v/.·\-]*?)\s{2,}([\d.]+(?:\s+[\d.]+){5,})\s*$/;

  const drills: Record<string, ParsedDrillClient> = {};

  let inPage2 = false;

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
      continue;
    }

    // Skip headers and metadata
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
      /Acc\s+B2-3/i.test(line) ||
      /Decel/i.test(line) ||
      /Avg\s+PL/i.test(line) ||
      /Avg\s+Dur/i.test(line)
    ) {
      continue;
    }

    const trimmed = line.trim();
    const m = trimmed.match(numberRowRe);
    if (!m) continue;

    const name = m[1].trim();
    const nums = m[2].trim().split(/\s+/).map(Number);

    if (inPage2 && nums.length >= 8) {
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
          accel_b23: null,
          decel_b23: null,
          accel_total: nums[6],
          decel_total: nums[7],
        };
      } else {
        // Merge max velocity from page 2
        drills[name].max_velocity = nums[4];
      }
    } else if (!inPage2 && nums.length >= 9) {
      // Page 1: dist, vb5, vb6, hir, pl, accB23, totAs, decB23, totDs
      drills[name] = {
        drill_name: name,
        date: sessionDate,
        distance_m: nums[0],
        vel_b5: nums[1],
        vel_b6: nums[2],
        hir_dist_m: nums[3],
        player_load: nums[4],
        accel_b23: nums[5],
        accel_total: nums[6],
        decel_b23: nums[7],
        decel_total: nums[8],
        max_velocity: null,
      };
    }
  }

  return Object.values(drills).sort((a, b) =>
    a.drill_name.localeCompare(b.drill_name)
  );
}
