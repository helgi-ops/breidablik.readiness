/**
 * MicroPulse × Catapult IMA — One-pager for Niklas Virtanen meeting (FCM)
 *
 * Purpose: Show that MicroPulse operationalises Catapult IMA data into
 * coach decisions, with sport-science citations for every metric. Designed
 * to be shareable as Niklas's prop in his Catapult curriculum.
 *
 * Output: 2-page PDF/DOCX, dense but readable.
 */

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageNumber, PageBreak,
  LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
} = require("docx");

const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const W = 9360;

function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120 },
    alignment: opts.alignment,
    children: [new TextRun({
      text,
      bold: opts.bold,
      italics: opts.italics,
      size: opts.size,
      color: opts.color,
    })],
  });
}

function H1(text) {
  return new Paragraph({
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: "1F4E79" })],
  });
}
function H2(text) {
  return new Paragraph({
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: "1F4E79" })],
  });
}

function bullet(text, boldLead) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children: [
      ...(boldLead
        ? [new TextRun({ text: boldLead, bold: true }), new TextRun({ text: " " + text })]
        : [new TextRun(text)]),
    ],
  });
}

function mkCell(content, opts = {}) {
  const children = Array.isArray(content)
    ? content
    : [new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : undefined,
        children: [new TextRun({
          text: content,
          bold: opts.bold,
          size: opts.size ?? 18,
          color: opts.color,
        })],
      })];
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

// ── Header & intro ───────────────────────────────────────────────────
const cover = [
  P("Briefing  ·  May 2026  ·  Iceland", { italics: true, color: "595959", after: 60 }),
  new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({
      text: "MicroPulse × Catapult IMA",
      bold: true,
      size: 40,
      color: "1F4E79",
    })],
  }),
  new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({
      text: "Operationalised inertial sport science for football",
      size: 26,
      color: "595959",
    })],
  }),
  P(
    "Catapult IMA is the most under-utilised data layer in the platform. Most clubs export Bands 5-8 stride counts, IMA CoD L/R, and IMA decel events but never translate them into a coach decision. MicroPulse is the analytics layer that closes that loop. Every IMA-derived metric in MicroPulse is tied to a published sport-science paper, surfaced as a clear coach action, and (for ELITE teams) refined by a Claude-Haiku layer that reads free-text wellness notes.",
    { after: 160 },
  ),
  P(
    "This document is a 1-page summary of the six IMA-derived modules we have shipped and the coach decisions each one drives. It is designed to be shareable inside Catapult's S&C curriculum.",
    { italics: true, color: "595959", after: 200 },
  ),
];

// ── Stack table ──────────────────────────────────────────────────────
function makeRow(imaSource, module, decision, citation, highlight = false) {
  const fill = highlight ? "F2F7FB" : undefined;
  return new TableRow({
    children: [
      mkCell(imaSource, { width: 2200, fill, size: 18 }),
      mkCell(module, { width: 2400, fill, bold: true, size: 18 }),
      mkCell(decision, { width: 3160, fill, size: 18 }),
      mkCell(citation, { width: 1600, fill, italics: true, size: 16 }),
    ],
  });
}

const stackTable = new Table({
  width: { size: W, type: WidthType.DXA },
  columnWidths: [2200, 2400, 3160, 1600],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("Catapult IMA source", { width: 2200, bold: true, fill: "1F4E79", color: "FFFFFF", size: 18 }),
        mkCell("MicroPulse module", { width: 2400, bold: true, fill: "1F4E79", color: "FFFFFF", size: 18 }),
        mkCell("Coach decision surfaced", { width: 3160, bold: true, fill: "1F4E79", color: "FFFFFF", size: 18 }),
        mkCell("Sport-science citation", { width: 1600, bold: true, fill: "1F4E79", color: "FFFFFF", size: 18 }),
      ],
    }),
    makeRow(
      "Free Running Bands 5-8 (high-velocity stride counts)",
      "Sprint Exposure",
      "Weekly bands 5-8 sum vs match-day demand. Under 50% → 3× hamstring injury risk → coach adds sprint volume. Over 150% → spike → coach caps.",
      "Malone 2018 (BJSM)",
      true,
    ),
    makeRow(
      "Free Running 8-band stride rate + GPS distance",
      "Stride Intelligence",
      "Cadence + stride length + L/R asymmetry. Coach sees if today's mechanics match personal baseline; flag when stride length drops > 10% (Buchheit 2014 norms).",
      "Buchheit 2014",
    ),
    makeRow(
      "IMA CoD L/R high-tier event counts (14d)",
      "L/R CoD Asymmetry",
      "≥ 15% asymmetry → 3× non-contact lower-limb injury risk. Triggers automatic swap to unilateral B-stance RDL on weaker side in next strength session.",
      "Bishop 2020",
      true,
    ),
    makeRow(
      "IMA Band 3 decel event counts",
      "McBurnie Decel Intelligence",
      "Preferred decel source (better indoor + outdoor coverage than GPS Gen-2 B3+). Drives overload / underload / coupling / concentration verdicts. Auto-strips Nordic if 3+ consecutive HIGH-burden days.",
      "McBurnie 2022",
    ),
    makeRow(
      "IMA Free Running + Metabolic Power (no GPS)",
      "Indoor Composite Load",
      "IMU-only weighting (HMLD and Decel B2-3 explicitly dropped) for indoor sessions. Sport-agnostic — handball + basketball + futsal teams without GPS vests still get a load score.",
      "Brown 2016, Osgnach 2023",
      true,
    ),
    makeRow(
      "Free Running Bands 1-8 stride counts (all bands)",
      "Stride length formula (v3)",
      "Total distance ÷ total strides (session avg). Stable rest-day baseline. Detects mechanical compensation patterns when no high-velocity work happens.",
      "Buchheit 2014",
    ),
  ],
});

// ── Live demo flow ────────────────────────────────────────────────────
const demoFlow = [
  H2("Live demo flow — one player, one match-week"),
  P(
    "What the meeting actually looks like in 3 minutes. Pick any player who has IMA Free Running data and play these screens in order:",
  ),
  bullet(
    "Open Decision Summary card. Coach sees Sprint Exposure chip showing 42% of match demand (UNDERLOAD band, Malone 2018). Engine prescribes: add sprint block at MD-3.",
    "1.",
  ),
  bullet(
    "Open Stride Intelligence card. Cadence 87 strides/min, stride length 1.78 m, L/R asymmetry 18% (left weaker). Bishop 2020 chip lights up.",
    "2.",
  ),
  bullet(
    "Open Strength card. MD-4 microdose: Trap-bar DL 3×3 cluster, Nordic 2×5, Copenhagen 2×6 — plus B-stance RDL added on weaker leg (CoD asymmetry rule fired automatically).",
    "3.",
  ),
  bullet(
    "Click 'AI refinement'. Player wrote 'Mjóhryggur stífur eftir leik' in their wellness check-in this morning. Claude (ELITE-only) suggests swapping the Trap-bar DL to Front squat — lower spinal compression while keeping the strength stimulus. Coach approves with one click.",
    "4.",
  ),
  bullet(
    "Click 'Send to player's app'. Player receives push notification + structured session in their PWA. Same flow works for the whole squad (one click sends to all active players).",
    "5.",
  ),
  P(
    "Five clicks. Five sport-science papers operationalised. Every step traceable to a citation and a coach decision. This is what Catapult IMA looks like when it is treated as a decision layer, not a dashboard.",
    { italics: true, color: "1F4E79" },
  ),
];

// ── Why this matters for Catapult ────────────────────────────────────
const whyForCatapult = [
  H2("Why this matters for Catapult education and curriculum"),
  bullet(
    "Most coaches use 15-20% of Catapult's IMA capability. Bands 5-8 sit untouched, IMA CoD is exported but rarely acted on, IMA Band 3 is buried in OpenField. MicroPulse turns these into one-line coach decisions.",
    "Closes the activation gap:",
  ),
  bullet(
    "Every IMA module in MicroPulse cites a published paper. A Catapult educator can point at MicroPulse and say 'this is what Malone 2018 looks like in practice'.",
    "Teachable example:",
  ),
  bullet(
    "We support Premium-IMU plans (Bands 5-8, CoD L/R, IMA Band 3) as the primary data source. We also have a Lite-tier path (Foster + RPE-based monitoring) for clubs without the Premium IMU contract — extending Catapult's value proposition into lower divisions where they currently lose deals to cheaper monitoring tools.",
    "Premium-Catapult-friendly:",
  ),
  bullet(
    "Iceland is the testbed. 13 Catapult-using clubs, 4 already on MicroPulse (Breiðablik live, Þór ELITE, Grindavík onboarding, Afturelding Lite). Operational results, not slides.",
    "Production traction:",
  ),
];

// ── Document assembly ────────────────────────────────────────────────
const doc = new Document({
  creator: "MicroPulse",
  title: "MicroPulse × Catapult IMA — Niklas Briefing",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MicroPulse × Catapult IMA — May 2026", color: "808080", size: 18 })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "helgi@metabolic.is  ·  micropulse.is  ·  Page ", color: "808080", size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: "808080", size: 18 }),
        ],
      })] }),
    },
    children: [
      ...cover,
      stackTable,
      new Paragraph({ children: [new PageBreak()] }),
      ...demoFlow,
      ...whyForCatapult,
      new Paragraph({
        spacing: { before: 320, after: 0 },
        children: [new TextRun({
          text: "Helgi Guðfinnsson  ·  Founder, MicroPulse  ·  helgi@metabolic.is",
          bold: true,
          size: 20,
          color: "1F4E79",
        })],
      }),
      new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({
          text: "Available for a deeper walkthrough — typical IMA-stack demo runs ~15 minutes.",
          italics: true,
          color: "595959",
          size: 18,
        })],
      }),
    ],
  }],
});

const outDir = "/sessions/dazzling-trusting-mayer/mnt/breidablik-readiness/public/docs";
Packer.toBuffer(doc).then((buffer) => {
  const outPath = path.join(outDir, "MicroPulse-Catapult-IMA-Briefing.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, buffer.length, "bytes");
});
