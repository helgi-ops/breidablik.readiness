import "server-only";

/**
 * Clinical / physio report extraction. Reads the report PDF and proposes a
 * structured, side-preserving, Icelandic-aware extraction. This is READ-ONLY AI:
 * the output is a proposal a clinician/coach confirms — nothing is ever written
 * to injury/risk tables from here. Rules/clinicians decide; AI only reads.
 */

// Sonnet is the accuracy tier for clinical text; extraction correctness matters
// more than latency here.
export const CLINICAL_EXTRACT_MODEL = "claude-sonnet-5";

export type Side = "left" | "right" | "bilateral" | null;

export type ExtractedInjury = {
  body_part: string;
  side: Side;
  type: string | null;
  approx_duration: string | null;
  status: string | null;
};
export type ExtractedFinding = {
  finding: string;
  side: Side;
  location: string | null;
};
export type ExtractedClinicalReport = {
  player_name: string | null;
  report_date: string | null; // YYYY-MM-DD
  clinician: { name: string | null; licence: string | null; clinic: string | null; email: string | null } | null;
  injury_history: ExtractedInjury[];
  current_status: string | null;
  clinical_findings: ExtractedFinding[];
  prevention_targets: string[];
  return_to_play: { status: string | null; match_fitness: string | null } | null;
};

export const CLINICAL_EXTRACT_SYSTEM = `You extract structured clinical data from a physiotherapy / medical report about a football player. The report is usually in Icelandic. Return ONLY JSON — no prose, no markdown — matching the schema exactly.

Non-negotiable rules:
- PRESERVE SIDE. Icelandic: "hægri" = right, "vinstri" = left, "báðum megin" / "beggja vegna" / "tvíhliða" = bilateral. Use "left" | "right" | "bilateral" | null. Never guess a side that isn't stated.
- You are READING, not diagnosing. Keep the clinician's meaning faithful; do not add findings, diagnoses, or advice that are not in the text.
- If a field is not stated, use null (or an empty array). Do NOT invent values.
- report_date and any dates as "YYYY-MM-DD".
- Keep clinical terms; you may add a short plain gloss in parentheses, but do not replace the clinician's term.

Schema:
{
  "player_name": string | null,
  "report_date": "YYYY-MM-DD" | null,
  "clinician": { "name": string | null, "licence": string | null, "clinic": string | null, "email": string | null } | null,
  "injury_history": [ { "body_part": string, "side": "left"|"right"|"bilateral"|null, "type": string | null, "approx_duration": string | null, "status": string | null } ],
  "current_status": string | null,
  "clinical_findings": [ { "finding": string, "side": "left"|"right"|"bilateral"|null, "location": string | null } ],
  "prevention_targets": [ string ],
  "return_to_play": { "status": string | null, "match_fitness": string | null } | null
}`;

const SIDES = new Set(["left", "right", "bilateral"]);
function coerceSide(v: unknown): Side {
  const s = String(v ?? "").trim().toLowerCase();
  if (SIDES.has(s)) return s as Side;
  // tolerate Icelandic / abbreviations that slipped through
  if (s === "hægri" || s === "r" || s === "right side") return "right";
  if (s === "vinstri" || s === "l" || s === "left side") return "left";
  if (s === "báðum" || s === "both" || s === "bilat") return "bilateral";
  return null;
}
function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s.length ? s : null;
}
function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter((x): x is string => x != null);
}

/** Coerce/validate the model's JSON into the strict shape (no zod dependency). */
export function validateExtractedReport(raw: unknown): ExtractedClinicalReport {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cl = (o.clinician && typeof o.clinician === "object" ? o.clinician : null) as Record<string, unknown> | null;
  const rtp = (o.return_to_play && typeof o.return_to_play === "object" ? o.return_to_play : null) as Record<string, unknown> | null;
  return {
    player_name: str(o.player_name),
    report_date: str(o.report_date),
    clinician: cl
      ? { name: str(cl.name), licence: str(cl.licence), clinic: str(cl.clinic), email: str(cl.email) }
      : null,
    injury_history: Array.isArray(o.injury_history)
      ? (o.injury_history as unknown[]).map((r) => {
          const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return {
            body_part: str(it.body_part) ?? "—",
            side: coerceSide(it.side),
            type: str(it.type),
            approx_duration: str(it.approx_duration ?? it.duration),
            status: str(it.status),
          };
        })
      : [],
    current_status: str(o.current_status),
    clinical_findings: Array.isArray(o.clinical_findings)
      ? (o.clinical_findings as unknown[]).map((r) => {
          const it = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
          return { finding: str(it.finding) ?? "—", side: coerceSide(it.side), location: str(it.location) };
        })
      : [],
    prevention_targets: strArr(o.prevention_targets),
    return_to_play: rtp ? { status: str(rtp.status), match_fitness: str(rtp.match_fitness) } : null,
  };
}

/**
 * Extract text from the PDF (pdf-parse — a text layer, not OCR) and ask the model
 * to structure it. Falls back to sending the PDF itself as a document block when
 * there is no usable text layer. Returns the AI proposal + the raw text (kept for
 * the "cite the source" UI). Throws on network / non-JSON.
 */
export async function extractClinicalReport(opts: {
  apiKey: string;
  buffer: Buffer;
  isPdf: boolean;
  mediaType: string;
}): Promise<{ extracted: ExtractedClinicalReport; rawText: string; usedFallback: boolean }> {
  let rawText = "";
  if (opts.isPdf) {
    try {
      const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
      const parsed = await pdfParse(opts.buffer);
      rawText = (parsed?.text ?? "").trim();
    } catch {
      /* no text layer — fall back to the document block below */
    }
  }

  const hasText = rawText.length > 40;
  const content: Array<Record<string, unknown>> = hasText
    ? [{ type: "text", text: `Report text:\n\n${rawText}\n\nExtract the clinical structure as JSON per the schema. JSON only.` }]
    : [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.buffer.toString("base64") } },
        { type: "text", text: "Extract the clinical structure as JSON per the schema. JSON only." },
      ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLINICAL_EXTRACT_MODEL, max_tokens: 3000, system: CLINICAL_EXTRACT_SYSTEM, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed: unknown = JSON.parse(cleaned); // throws → caller returns 422
  return { extracted: validateExtractedReport(parsed), rawText, usedFallback: !hasText };
}
