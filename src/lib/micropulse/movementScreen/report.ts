/**
 * Movement-screen explainability report — the layered read the manifesto asks
 * for, built purely from a test definition + the recorded findings + the
 * interpreted result:
 *   (0) one-sentence verdict, (1) 2–3 plain facts + confidence, (2) behind the
 *   numbers: every recorded variable with its value, band, threshold + citation,
 *   the interpretation rules that fired (finding → cause → lever, cited), the
 *   references, and honest caveats. Pure — no DB, never the readiness colour.
 */
import type { Bi, MovementTest, Reliability, Severity, ThresholdBand } from "./registry";
import { STRENGTH_EMPHASIS_LABEL } from "./interpret";
import type { Confidence, ScreenContext, ScreenFinding, ScreenReading, ScreenResult } from "./interpret";

export type ReportTone = "ok" | "caution" | "alert";

export type ReportRow = {
  variableKey: string;
  label: Bi;
  value: number | null;
  severity: Severity | null;
  bandLabel: Bi | null;
  unit: string;
  reliability: Reliability;
  citation: string | null;
};

export type ScreenReport = {
  tone: ReportTone;
  verdict: Bi;
  facts: Bi[];
  confidence: Confidence;
  confidenceNote: Bi;
  redFlag: boolean;
  redFlagNote: Bi | null;
  rtpFlag: boolean;
  rows: ReportRow[];
  readings: ScreenReading[];
  references: Array<{ label: string; source?: string }>;
  caveats: Bi[];
};

const SEV_RANK: Record<Severity, number> = { ok: 0, mild: 1, moderate: 2, marked: 3 };
const legTag = (leg: ScreenReading["leg"]) => (leg ? ` (${leg})` : "");

function bandFor(test: MovementTest, variableKey: string, severity: Severity | null): { band: ThresholdBand | null; citation: string | null } {
  const th = test.thresholds.find((t) => t.variableKey === variableKey) ?? null;
  if (!th) return { band: null, citation: null };
  const band = severity ? th.bands.find((b) => b.severity === severity) ?? null : null;
  return { band, citation: th.citation };
}

export function buildScreenReport(
  test: MovementTest,
  findings: ScreenFinding[],
  context: ScreenContext,
  result: ScreenResult,
): ScreenReport {
  const varByKey = new Map(test.variables.map((v) => [v.key, v] as const));

  // Behind-the-numbers rows — every recorded variable (incl. ok) with its band.
  const rows: ReportRow[] = findings
    .map((f) => {
      const v = varByKey.get(f.variableKey);
      if (!v) return null;
      const { band, citation } = bandFor(test, f.variableKey, f.severity ?? null);
      return {
        variableKey: f.variableKey,
        label: v.label,
        value: f.value ?? null,
        severity: f.severity ?? null,
        bandLabel: band?.label ?? null,
        unit: v.unit,
        reliability: v.reliability,
        citation,
      } as ReportRow;
    })
    .filter((r): r is ReportRow => r != null);

  // Tone from the worst RECORDED severity (+ RTP flag); red flag overrides.
  const worstSev = rows.reduce<Severity>((acc, r) => (r.severity && SEV_RANK[r.severity] > SEV_RANK[acc] ? r.severity : acc), "ok");
  const tone: ReportTone =
    result.redFlag || worstSev === "marked" || result.rtpFlag
      ? "alert"
      : result.readings.length || worstSev === "moderate"
        ? "caution"
        : "ok";

  // Verdict.
  let verdict: Bi;
  if (result.redFlag) {
    verdict = result.redFlagNote ?? { en: "Refer to a clinician.", is: "Vísaðu til klíníkers." };
  } else if (result.readings.length) {
    const top = result.readings[0];
    const more = result.readings.length - 1;
    const rtp = result.rtpFlag ? { en: " Re-screen before return-to-play.", is: " Endurskima fyrir endurkomu." } : { en: "", is: "" };
    const moreEn = more > 0 ? ` (+${more} more)` : "";
    const moreIs = more > 0 ? ` (+${more} til viðbótar)` : "";
    verdict = {
      en: `${top.finding.en}${legTag(top.leg)} → ${STRENGTH_EMPHASIS_LABEL[top.strengthEmphasis].en}${moreEn}.${rtp.en}`,
      is: `${top.finding.is}${legTag(top.leg)} → ${STRENGTH_EMPHASIS_LABEL[top.strengthEmphasis].is}${moreIs}.${rtp.is}`,
    };
  } else {
    verdict = { en: "Screen within normal for the recorded variables.", is: "Skimun innan eðlilegs fyrir skráðar breytur." };
  }

  // Facts — the fired findings (up to 3), then the RTP note.
  const facts: Bi[] = [];
  for (const r of result.readings.slice(0, 3)) {
    facts.push({
      en: `${r.finding.en}${legTag(r.leg)} — ${r.lever.en}`,
      is: `${r.finding.is}${legTag(r.leg)} — ${r.lever.is}`,
    });
  }
  if (result.rtpFlag) {
    facts.push({
      en: "Asymmetry / limb-symmetry flag — bias unilateral loading to the weaker side and re-screen before clearing full multidirectional load.",
      is: "Ósamhverfu-flagg — hallaðu einhliða álagi á veikari hlið og endurskima áður en fullt fjölátta álag er heimilað.",
    });
  }
  if (!facts.length) facts.push({ en: "All recorded variables sit within their normal bands.", is: "Allar skráðar breytur eru innan eðlilegra banda." });

  // Confidence note — capture quality + reliability caveats.
  const views = context.viewCount ?? 1;
  const pose = context.poseQuality ?? "fair";
  const lowVars = findings
    .map((f) => varByKey.get(f.variableKey))
    .filter((v): v is NonNullable<typeof v> => !!v && v.reliability === "low_precision")
    .map((v) => v.label);
  const lowEn = lowVars.length ? ` ${lowVars.map((l) => l.en).join(", ")} are low-precision from phone video.` : "";
  const lowIs = lowVars.length ? ` ${lowVars.map((l) => l.is).join(", ")} eru ónákvæmar úr símamyndbandi.` : "";
  const confidenceNote: Bi = {
    en: `${views} view(s), ${pose} pose quality, ${context.repeated ? "repeated" : "single"} screen.${lowEn}`,
    is: `${views} sýn, ${pose} pose-gæði, ${context.repeated ? "endurtekin" : "stök"} skimun.${lowIs}`,
  };

  // Caveats.
  const caveats: Bi[] = [
    test.capture.standardisation,
    { en: "Screening/training only — not a diagnosis; pain / red flags route to a clinician.", is: "Aðeins skimun/þjálfun — ekki greining; verkur / rauð flögg fara til klíníkers." },
  ];
  if (!context.repeated) caveats.push({ en: "Single screen — a repeat turns this into a trend.", is: "Stök skimun — endurtekning gerir þetta að þróun." });

  return {
    tone,
    verdict,
    facts,
    confidence: result.confidence,
    confidenceNote,
    redFlag: result.redFlag,
    redFlagNote: result.redFlagNote,
    rtpFlag: result.rtpFlag,
    rows,
    readings: result.readings,
    references: test.references,
    caveats,
  };
}
