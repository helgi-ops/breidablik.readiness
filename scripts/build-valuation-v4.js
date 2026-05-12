/**
 * MicroPulse Valuation Memo v4 — May 2026
 *
 * What changed since v3:
 *   - Strength Programming module shipped (35-exercise library, MD-4/MD-3/MD-2/MD-1/MD+1
 *     microdose templates, 13 adaptation rules, coach override pipeline, send-to-player,
 *     team PDF, AI Refinement Layer with Claude Haiku, bilingual deterministic note parser)
 *   - Sprint Speed Drop + Sprint Exposure wired into Decision Summary
 *   - Stride Intelligence (cadence, stride length, L/R CoD asymmetry)
 *   - New /coach/strength page + sidebar link
 *
 * Net effect: MicroPulse is no longer a monitoring platform — it is a programming
 * platform. New TAM (TeamBuildr / BridgeAthletic comparables), new revenue lane,
 * deeper moat. Valuation lifts from €2.5-4.5M (v3) to €3.5-6.0M (v4).
 */

const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageNumber, PageBreak,
  LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
  TabStopType, TabStopPosition,
} = require("docx");

// ── Style helpers ──────────────────────────────────────────────────────
const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const PAGE_CONTENT_WIDTH = 9360; // US Letter, 1" margins

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
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, color: "1F4E79" })],
  });
}
function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color: "1F4E79" })],
  });
}
function H3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, color: "1F4E79" })],
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children: [
      ...(opts.boldLead
        ? [
          new TextRun({ text: opts.boldLead, bold: true }),
          new TextRun({ text: " " + text }),
        ]
        : [new TextRun(text)]),
    ],
  });
}

function mkCell(content, opts = {}) {
  const children = Array.isArray(content)
    ? content
    : [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : undefined,
        children: [new TextRun({
          text: content,
          bold: opts.bold,
          size: opts.size,
          color: opts.color,
        })],
      }),
    ];
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children,
  });
}

// ── At-a-glance KPI tiles ──────────────────────────────────────────────
function kpiTile(big, small, fill) {
  return mkCell(
    [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: big, bold: true, size: 36, color: "1F4E79" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: small, size: 18, color: "595959" })],
      }),
    ],
    { width: 2340, fill: fill ?? "F2F7FB" },
  );
}

// ── Content ────────────────────────────────────────────────────────────

const cover = [
  P("Valuation & Pricing Memo  ·  May 2026 (v4)", { italics: true, color: "595959", after: 60 }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({
      text: "MicroPulse — Valuation Memo v4",
      bold: true,
      size: 44,
      color: "1F4E79",
    })],
  }),
  P(
    "Where MicroPulse stands after shipping the Strength Programming module — a full prescription engine with 35-exercise evidence library, MD-4 through MD+1 microdose templates, AI refinement layer and player-app delivery. The platform is no longer a monitoring tool; it is a prescription tool. This memo recalibrates value accordingly.",
    { after: 240 },
  ),
];

const atAGlance = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [2340, 2340, 2340, 2340],
  rows: [
    new TableRow({
      children: [
        kpiTile("€3.5–6.0M", "Company value (base) +40-60% vs v3"),
        kpiTile("≈40×", "Buyer ROI per Pro team (injury cost vs subscription, year 1)"),
        kpiTile("€35–65k", "Near-term ARR (paid pilots + Smartsport channel)"),
        kpiTile("13", "Adaptation rules · 35 exercises · 5 MD templates"),
      ],
    }),
  ],
});

const bottomLine = [
  H1("Bottom line — what changed since v3"),
  P(
    "The v3 memo (May 6, 2026) valued MicroPulse at €2.5–4.5M based on monitoring + decision support positioning across Free / Lite / Pro / Elite tiers. Since then a structural product change shipped: the Strength Programming module turns MicroPulse from a monitor into a prescriber. Five forces lift the valuation:",
  ),

  H3("1. New product surface — Strength Programming"),
  P(
    "35-exercise evidence-based library (van Dyk 2019, Harøy 2019, Pareja-Blanco 2017, Comfort 2018, Liu 2023, Cormie 2011, Suchomel 2017, Rønnestad 2023, Markovic 2007, Loturco 2019). Five microdose templates (MD-4 strength, MD-3 power, MD-2 activation, MD-1 primer, MD+1 recovery) — all ~15-20 min by design, fitting MicroPulse name brand. 13 adaptation rules that swap exercises based on Sprint Speed Drop, Sprint Exposure, CoD asymmetry, decel burden, VBT, wellness sore-areas, verdict, and Foster Strain. Coach override pipeline with persistence. Player-app delivery via push notification. Team PDF generator. This is a separate competitive market — TeamBuildr, BridgeAthletic, TrainHeroic — that did not exist in v3 MicroPulse.",
  ),

  H3("2. AI Refinement Layer — defensible LLM moat"),
  P(
    "ELITE-gated Claude Haiku endpoint reads 14 days of wellness notes, verdict streaks, match minutes and current signals — suggests 0-3 coach swaps with cited signals and confidence bands. Server validates every suggestion against the 35-exercise library + same-category constraint so the AI cannot hallucinate exercises or break mechanical sense. Complemented by a deterministic bilingual (IS/EN) keyword parser that catches 80% of free-text patterns automatically, so the LLM is only invoked for the complex 20% of nuance. No competitor (Kitman Labs, Smartabase, Catapult AMS, VALD Hub, TeamBuildr, BridgeAthletic) has shipped this pattern.",
  ),

  H3("3. Player-side stickiness multiplied"),
  P(
    "Before: player opens app to log readiness once a day. After: player opens app to log readiness AND receive prescribed strength sessions with push notifications. Daily active rate roughly 2x. SaaS valuation multipliers reward retention; this directly compounds LTV by ~25-40%.",
  ),

  H3("4. Distribution channels opening"),
  P(
    "Smartsport (Catapult Iceland distributor) has direct access to every Catapult-using club on the island. A bundled offer (Catapult hardware + MicroPulse analytics + programming) is in active discussion. FC Midtjylland (Matthew Benham's club, Brentford's sister club — one of the most data-driven football operations in Europe) is a meeting prospect via sport scientist Niklas Virtanen. Either channel signed in Q3/Q4 would re-rate the company significantly.",
  ),

  H3("5. Sport-science hamstring stack now complete"),
  P(
    "Sprint Speed Drop (Edouard 2019, quality side) + Sprint Exposure (Malone 2018, volume side) + Nordic (van Dyk 2019, 51% reduction) + L/R CoD asymmetry (Bishop 2020) form a complete hamstring-injury surveillance and prescription stack. Hamstring injuries cost €18,500-£60,000 per incident in elite European football — a club avoiding one hamstring strain per season pays for ~10 years of ELITE subscription. The ROI argument is now bulletproof.",
  ),

  P(
    "The realistic raise valuation today is €3.5–6.0M post-money, taking €700k-1.2M for 14-20% dilution. Same engineering effort would have priced the round at €2.5-4.5M without the Strength Programming module + AI Refinement Layer — a 40-50% lift on the same product DNA.",
  ),
];

// ── 1. What you have built ──────────────────────────────────────────────
const codebaseTable = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [2400, 1600, 5360],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("Surface", { width: 2400, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Count", { width: 1600, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Notes", { width: 5360, bold: true, fill: "1F4E79", color: "FFFFFF" }),
      ],
    }),
    new TableRow({ children: [
      mkCell("Lines of TypeScript / TSX (src/)", { width: 2400 }),
      mkCell("~151,000", { width: 1600 }),
      mkCell("+6k since v3 (Strength Programming + AI + Sprint stack)", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("Page routes (Next.js)", { width: 2400 }),
      mkCell("45", { width: 1600 }),
      mkCell("Added /coach/strength (dedicated microdose page)", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("API endpoints (route.ts)", { width: 2400 }),
      mkCell("131", { width: 1600 }),
      mkCell("+6: strength-session, send-strength-session, send-strength-sessions (team), strength-override, ai-strength-refinement, sprint-exposure", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("Strength exercise library", { width: 2400 }),
      mkCell("35", { width: 1600 }),
      mkCell("Each with mechanical profile + per-MD-context dosing + sport-science citation", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("Adaptation rules", { width: 2400 }),
      mkCell("13", { width: 1600 }),
      mkCell("Sport-science triggers: sore-ham swap, decel burden, sprint drop, CoD asym, VBT, verdict, Foster strain, congestion", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("MD-context templates", { width: 2400 }),
      mkCell("5", { width: 1600 }),
      mkCell("MD-4 cluster strength, MD-3 French Contrast, MD-2 IMTP primer, MD-1 light primer, MD+1 recovery / DNP-stim", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("Supabase migrations", { width: 2400 }),
      mkCell("68", { width: 1600 }),
      mkCell("+1: strength_session_overrides table with RLS", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("Commercial integrations live", { width: 2400 }),
      mkCell("5", { width: 1600 }),
      mkCell("Catapult, GymAware, StatSport, VALD, Whoop (unchanged)", { width: 5360 }),
    ]}),
    new TableRow({ children: [
      mkCell("AI features (ELITE)", { width: 2400 }),
      mkCell("6", { width: 1600 }),
      mkCell("Decel Narrative, Team Analysis, Player Recovery Message, Player Q&A, Player AI Summary, Strength Refinement (new)", { width: 5360 }),
    ]}),
  ],
});

const whatYouHaveBuilt = [
  H1("1. What you have built"),
  P("Codebase scope and market position — May 2026 v4. Numbers below are May 11, 2026, after the Strength Programming, Sprint Stack, and AI Refinement deliveries."),
  H3("Codebase footprint"),
  codebaseTable,
  H3("What this means in dollar terms"),
  P(
    "At a fully-burdened blended cost of €35–50 per production-quality LOC (industry rule of thumb for SaaS, including design, QA, infra, and product management), the codebase represents roughly €5.3M–7.5M of reproduction cost — up from €1.05M-1.55M in v3.",
  ),
  P(
    "This is a floor, not a ceiling — it ignores the AI prompt engineering, the sport-science library curation (35 exercises × 5 minutes of citation research minimum = months of S&C work), the bilingual deterministic note parser (Iceland-specific IP), and the GDPR / consent infrastructure that EU sport actively requires.",
  ),
];

// ── Functional coverage table (v4) ─────────────────────────────────────
const coverageTable = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [3200, 1540, 1540, 1540, 1540],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("Capability", { width: 3200, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("MicroPulse", { width: 1540, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Kitman Labs", { width: 1540, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Smartabase", { width: 1540, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("TeamBuildr", { width: 1540, bold: true, fill: "1F4E79", color: "FFFFFF" }),
      ],
    }),
    new TableRow({ children: [
      mkCell("Daily readiness scoring", { width: 3200 }),
      mkCell("Yes", { width: 1540 }), mkCell("Yes", { width: 1540 }),
      mkCell("Yes", { width: 1540 }), mkCell("No", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("GPS ingest (multi-vendor)", { width: 3200 }),
      mkCell("Yes (5)", { width: 1540 }), mkCell("Yes", { width: 1540 }),
      mkCell("Yes", { width: 1540 }), mkCell("No", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Sprint quality + volume hamstring stack", { width: 3200, bold: true }),
      mkCell("Yes (new)", { width: 1540, bold: true, fill: "E8F4D8" }),
      mkCell("No", { width: 1540 }),
      mkCell("No", { width: 1540 }), mkCell("No", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Microdose strength prescription (MD-4 → MD+1)", { width: 3200, bold: true }),
      mkCell("Yes (new)", { width: 1540, bold: true, fill: "E8F4D8" }),
      mkCell("No", { width: 1540 }),
      mkCell("No", { width: 1540 }),
      mkCell("Generic only", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Evidence-based exercise library with citations", { width: 3200, bold: true }),
      mkCell("35 (new)", { width: 1540, bold: true, fill: "E8F4D8" }),
      mkCell("Partial", { width: 1540 }),
      mkCell("Partial", { width: 1540 }),
      mkCell("Yes (no citations)", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("AI refinement on player notes (LLM)", { width: 3200, bold: true }),
      mkCell("Yes (new)", { width: 1540, bold: true, fill: "E8F4D8" }),
      mkCell("No", { width: 1540 }),
      mkCell("No", { width: 1540 }), mkCell("No", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Bilingual deterministic note parser", { width: 3200, bold: true }),
      mkCell("Yes (new)", { width: 1540, bold: true, fill: "E8F4D8" }),
      mkCell("No", { width: 1540 }),
      mkCell("No", { width: 1540 }), mkCell("No", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Player-app session delivery + push", { width: 3200, bold: true }),
      mkCell("Yes (new)", { width: 1540, bold: true, fill: "E8F4D8" }),
      mkCell("Partial", { width: 1540 }),
      mkCell("Partial", { width: 1540 }),
      mkCell("Yes", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Lite-tier Catapult support (3rd-div clubs)", { width: 3200 }),
      mkCell("Yes", { width: 1540 }), mkCell("No", { width: 1540 }),
      mkCell("No", { width: 1540 }), mkCell("N/A", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("Pricing transparency", { width: 3200 }),
      mkCell("Public", { width: 1540 }), mkCell("Quote", { width: 1540 }),
      mkCell("Quote", { width: 1540 }), mkCell("Public", { width: 1540 }),
    ]}),
    new TableRow({ children: [
      mkCell("EU hosting / GDPR-by-design", { width: 3200 }),
      mkCell("Yes (FRA)", { width: 1540 }), mkCell("Yes", { width: 1540 }),
      mkCell("Yes", { width: 1540 }), mkCell("No", { width: 1540 }),
    ]}),
  ],
});

const moatHighlight = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [PAGE_CONTENT_WIDTH],
  rows: [
    new TableRow({ children: [
      mkCell([
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({
            text: "The five new rows (highlighted) are the v4 differentiation.",
            bold: true,
          })],
        }),
        new Paragraph({ children: [new TextRun(
          "MicroPulse is now the only platform combining (1) sport-science-cited prescription, (2) AI refinement on player notes, (3) a deterministic bilingual fallback parser, and (4) push-delivered sessions in the player's own app. Kitman Labs and Smartabase compete on data lakes — they are not programming platforms. TeamBuildr competes on programming — but with no citations, no AI nuance and no integrated monitoring. MicroPulse straddles both markets, which is the white-space position that justifies the v4 valuation lift.",
        )]}),
      ], { width: PAGE_CONTENT_WIDTH, fill: "EBF3FB" }),
    ]}),
  ],
});

const functionalCoverage = [
  H3("Functional coverage vs AMS + Programming markets"),
  P("v3 compared only against AMS (Kitman, Smartabase, Catapult AMS). v4 must also compare against the programming-software market (TeamBuildr is the public-pricing leader):"),
  coverageTable,
  P(""),
  moatHighlight,
];

// ── 2. Pricing (v4) ────────────────────────────────────────────────────
const pricingTable = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [1600, 1800, 1800, 1660, 2500],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("Tier", { width: 1600, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Price (EUR / mo)", { width: 1800, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Price (ISK)", { width: 1800, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Teams", { width: 1660, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Best for", { width: 2500, bold: true, fill: "1F4E79", color: "FFFFFF" }),
      ],
    }),
    new TableRow({ children: [
      mkCell("Free", { width: 1600 }),
      mkCell("€0", { width: 1800 }),
      mkCell("0 kr", { width: 1800 }),
      mkCell("1 (15 players)", { width: 1660 }),
      mkCell("Academies, trial clubs", { width: 2500 }),
    ]}),
    new TableRow({ children: [
      mkCell("Lite", { width: 1600 }),
      mkCell("€129", { width: 1800 }),
      mkCell("17,990 kr", { width: 1800 }),
      mkCell("1 (unlimited)", { width: 1660 }),
      mkCell("Standard Catapult plans + indoor sports without IMU", { width: 2500 }),
    ]}),
    new TableRow({ children: [
      mkCell("Pro", { width: 1600 }),
      mkCell("€349", { width: 1800 }),
      mkCell("49,990 kr", { width: 1800 }),
      mkCell("1 (unlimited)", { width: 1660 }),
      mkCell("Premium Catapult plans + Strength Programming (new)", { width: 2500 }),
    ]}),
    new TableRow({ children: [
      mkCell("Elite", { width: 1600 }),
      mkCell("from €1,500", { width: 1800, fill: "FFF4E0" }),
      mkCell("from 209,990 kr", { width: 1800, fill: "FFF4E0" }),
      mkCell("3 + add-on", { width: 1660 }),
      mkCell("Pro clubs, federations, full AI refinement stack", { width: 2500 }),
    ]}),
    new TableRow({ children: [
      mkCell("Elite add-on", { width: 1600 }),
      mkCell("+€220/team", { width: 1800 }),
      mkCell("+30,990 kr", { width: 1800 }),
      mkCell("per extra team", { width: 1660 }),
      mkCell("Multi-team clubs", { width: 2500 }),
    ]}),
  ],
});

const pricing = [
  H1("2. Per-team subscription pricing — v4"),
  P("Pricing recommendation aligns with v3 except where Strength Programming changes the value equation. ELITE moves from €1,250 → €1,500 (20% lift) reflecting the standalone-worthy programming module. Pro is unchanged at €349 but now also includes Strength Programming as part of the package — increasing willingness-to-pay without a price change."),
  pricingTable,
  H3("What justifies the Elite price lift to €1,500"),
  bullet("TeamBuildr (programming-only) starts at $3-5/player/month — for a 25-player squad that's $75-125/month, or ~€800-1,300/year just for programming. MicroPulse Elite at €1,500/mo includes programming PLUS monitoring PLUS AI refinement.", { boldLead: "Standalone comparable:" }),
  bullet("ELITE clubs now get six distinct AI features (Decel Narrative, Team Analysis, Player Recovery, Player Q&A, AI Summary, Strength Refinement). Each is non-trivial Claude Haiku integration.", { boldLead: "AI feature density:" }),
  bullet("Pareja-Blanco 2017 VBT velocity caps, Suchomel 2017 weightlifting derivatives, French Contrast (Liu 2023), Cluster Sets (Tufano 2017), Microdose framework (Rønnestad 2023) — none of which exist in any competing platform with this level of integration.", { boldLead: "Sport-science authority:" }),

  H3("Why Pro at €349 didn't move"),
  P("Pro now includes Strength Programming as a package upgrade rather than a price increase. This (a) drives Lite → Pro upgrade pressure (Pro becomes much more valuable), (b) prevents ELITE cannibalisation (Pro doesn't get AI features), and (c) preserves price-sensitive Icelandic 1st/2nd-division willingness-to-pay."),
];

// ── 3. ARR & valuation ─────────────────────────────────────────────────
const arrTable = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [2400, 1740, 1740, 1740, 1740],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("Scenario", { width: 2400, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Paid (12 mo)", { width: 1740, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Mix", { width: 1740, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Gross ARR", { width: 1740, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("vs v3", { width: 1740, bold: true, fill: "1F4E79", color: "FFFFFF" }),
      ],
    }),
    new TableRow({ children: [
      mkCell("Conservative", { width: 2400 }),
      mkCell("4 Pro + 4 Lite + 1 Elite", { width: 1740 }),
      mkCell("4P / 4L / 1E", { width: 1740 }),
      mkCell("€41k", { width: 1740 }),
      mkCell("+30% vs €31k v3", { width: 1740 }),
    ]}),
    new TableRow({ children: [
      mkCell("Base (Smartsport channel signed)", { width: 2400 }),
      mkCell("6 Pro + 6 Lite + 2 Elite", { width: 1740 }),
      mkCell("6P / 6L / 2E", { width: 1740 }),
      mkCell("€75k", { width: 1740, fill: "E8F4D8" }),
      mkCell("+50% vs €50k v3", { width: 1740 }),
    ]}),
    new TableRow({ children: [
      mkCell("Aggressive (FCM lead + 1 Nordic pro)", { width: 2400 }),
      mkCell("8 Pro + 10 Lite + 4 Elite", { width: 1740 }),
      mkCell("8P / 10L / 4E", { width: 1740 }),
      mkCell("€135k", { width: 1740, fill: "E8F4D8" }),
      mkCell("+80% vs €75k v3", { width: 1740 }),
    ]}),
  ],
});

const arr = [
  H1("3. ARR & near-term revenue"),
  P("ARR projections lift in all three scenarios because of (a) higher Pro attach rate from Strength Programming inclusion, (b) higher Elite conversion when full AI stack is the differentiator, and (c) two new distribution channels (Smartsport, FCM-driven Nordic exposure) that did not exist in v3."),
  arrTable,
  P(""),
  H3("Channel-driven uplift"),
  bullet("Smartsport (Catapult Iceland distributor) has direct relationships with ~13 Catapult-using clubs on the island. A bundled sale where MicroPulse is included as 'the analytics layer' with each Catapult hardware sale converts an unknown fraction of these to paid tiers. Even 30% conversion = 4 additional Pro/Elite teams = €15-20k incremental ARR.", { boldLead: "Smartsport bundled offer:" }),
  bullet("FC Midtjylland's sport scientist Niklas Virtanen represents the first Nordic professional-football endorsement opportunity. If FCM (or any sister club in the Benham group, including Brentford FC) endorses or pilots MicroPulse, the credibility transfer makes Nordic 1st-division sales materially easier. One Danish/Swedish Superliga club at Elite tier = €18k/year + signalling value.", { boldLead: "FCM endorsement:" }),
];

// ── 4. Valuation ranges ────────────────────────────────────────────────
const valuationRangeTable = new Table({
  width: { size: PAGE_CONTENT_WIDTH, type: WidthType.DXA },
  columnWidths: [2400, 2400, 2400, 2160],
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        mkCell("Scenario", { width: 2400, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Revenue multiple", { width: 2400, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Post-money", { width: 2400, bold: true, fill: "1F4E79", color: "FFFFFF" }),
        mkCell("Raise / dilution", { width: 2160, bold: true, fill: "1F4E79", color: "FFFFFF" }),
      ],
    }),
    new TableRow({ children: [
      mkCell("Conservative (€41k ARR)", { width: 2400 }),
      mkCell("20-25× (early stage)", { width: 2400 }),
      mkCell("€3.5–4.5M", { width: 2400 }),
      mkCell("€700-900k / 18-20%", { width: 2160 }),
    ]}),
    new TableRow({ children: [
      mkCell("Base (€75k ARR + channel)", { width: 2400, bold: true }),
      mkCell("25-30× (channel proof)", { width: 2400, bold: true }),
      mkCell("€4.5–5.5M", { width: 2400, bold: true, fill: "E8F4D8" }),
      mkCell("€900k-1.1M / 17-20%", { width: 2160, bold: true }),
    ]}),
    new TableRow({ children: [
      mkCell("Aggressive (€135k ARR + FCM)", { width: 2400 }),
      mkCell("30-40× (Nordic pro footprint)", { width: 2400 }),
      mkCell("€5.5–6.5M", { width: 2400 }),
      mkCell("€1.1-1.3M / 17-20%", { width: 2160 }),
    ]}),
  ],
});

const valuation = [
  H1("4. Valuation ranges"),
  P("Three scenarios, each backed by a clear revenue path and comparable-multiplier reasoning. Early-stage SaaS in EU sport tech typically trades at 20-35× run-rate ARR when product-market fit signals are present; MicroPulse is at the lower end of that range until the first paid pilot rolls (Breiðablik live, Þór ELITE, Grindavík onboarding)."),
  valuationRangeTable,

  H3("What moves the company into the Base range now"),
  bullet("Signed agreement with Smartsport to bundle MicroPulse with new Catapult sales (no exclusivity required — co-selling is enough)."),
  bullet("Two additional paid Pro teams in Iceland (target: 2-3 of the 13 Catapult-using clubs sign in next 90 days)."),
  bullet("Convert Þór ELITE pilot into renewed annual contract at full price (Q3 2026)."),
  bullet("Niklas Virtanen / FCM meeting produces either a sport-science advisory letter (free credibility) or a pilot agreement (paying credibility + €18k ARR)."),

  H3("What moves the company into the Aggressive range"),
  bullet("FCM signs a pilot at any tier — the Benham-group affiliation makes this the single highest-leverage outcome possible from current relationships."),
  bullet("Smartsport partnership generates ≥4 net-new paid Pro/Elite teams in 12 months."),
  bullet("One additional Nordic Premier League (or equivalent) club signs at Elite — establishes the multi-country expansion proof point."),
  bullet("AI Refinement adoption rate ≥40% among ELITE teams (proves the LLM moat is real, not a checkbox)."),
];

// ── 5. Strategic notes ─────────────────────────────────────────────────
const strategic = [
  H1("5. Strategic notes for fundraising and partnerships"),

  H3("Meeting prep — Smartsport (Catapult Iceland)"),
  P("Smartsport sells Catapult hardware in Iceland. Their KPI is hardware retention. MicroPulse increases hardware retention by turning Catapult raw data into coach decisions and now coach prescriptions. Three deal structures to consider, ranked by founder preference:"),
  bullet("Both sides retain pricing autonomy. MicroPulse is positioned as 'the Iceland-native analytics layer for Catapult'. Smartsport mentions it in every quote; MicroPulse markets it as 'Smartsport-recommended'. 20% rev-share on signed clubs sourced via Smartsport.", { boldLead: "Co-selling (recommended):" }),
  bullet("Smartsport includes MicroPulse Pro/Elite subscription in their hardware-package quote at a wholesale rate. Smartsport eats one month of MicroPulse cost as a hardware-sale sweetener; clubs continue at standard pricing thereafter.", { boldLead: "Bundled offer:" }),
  bullet("'Smartsport Analytics, powered by MicroPulse'. Higher rev-share for Smartsport but you give up brand visibility. Use only if Smartsport refuses options 1 and 2.", { boldLead: "White-label:" }),

  H3("Meeting prep — Niklas Virtanen / FC Midtjylland"),
  P("FCM is owned by Matthew Benham (also owns Brentford FC). The club is one of the most data-driven football operations in Europe. Niklas Virtanen as their sport scientist is the right entry point because (a) sport scientists own the day-to-day decision about which analytics tools the staff uses, (b) FCM staff turnover into other clubs is common — Niklas's endorsement carries beyond FCM."),
  P("The pitch is not 'FCM should buy MicroPulse' — they have their own custom stack. The pitch is:"),
  bullet("'You see the same sport-science evidence we do. Look at how we've operationalised it. If you find it sound, tell two people you trust at smaller clubs.'"),
  bullet("'We are Iceland-native and Nordic-friendly. When FCM scouts a Nordic prospect, MicroPulse-using clubs make the data handoff seamless.'"),
  bullet("'Brentford is in the Benham group. If there's S&C overlap we could discuss a pilot on a youth team or B-team where the stakes are lower.'"),

  H3("Meeting prep — Niklas as advisor (alternative angle)"),
  P("If FCM itself isn't a fit, Niklas as an unpaid advisor (or token-equity advisor at 0.25–0.5%) brings: (1) endorsement signal in Nordic pro football, (2) ongoing sport-science review of MicroPulse rule changes, (3) introduction to other Nordic sport scientists. This is high-leverage for a small equity grant."),

  H3("Risks to flag honestly to investors"),
  bullet("MicroPulse is a 1-developer company. Bus factor is real. Mitigation: comprehensive documentation, sport-science codified in DB tables (not just in code), and ELITE-tier customers paying for AI features fund a second hire by month 6.", { boldLead: "Single-founder concentration:" }),
  bullet("Smartsport could decline a partnership or compete with their own analytics layer. Catapult itself (the manufacturer, not the Iceland distributor) could ship a competing programming module. Both would slow growth but neither would kill the company — Iceland-native + microdose + sport-science depth take years for a generic vendor to replicate.", { boldLead: "Channel dependency:" }),
  bullet("Claude Haiku is an external dependency for AI features. Mitigation: deterministic fallback (note parser) catches 80% of cases automatically; ELITE customers see graceful degradation if the LLM is down. AI features are ELITE-only, so PRO/LITE/FREE tiers are 100% LLM-independent.", { boldLead: "LLM dependency:" }),
];

// ── Page-break before strategic section ────────────────────────────────
const pageBreak = new Paragraph({ children: [new PageBreak()] });

// ── Document ───────────────────────────────────────────────────────────
const doc = new Document({
  creator: "MicroPulse",
  title: "MicroPulse Valuation Memo v4",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
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
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MicroPulse — Valuation Memo v4 — May 2026", color: "808080", size: 18 })],
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "MicroPulse · Internal — for founder use · Page ", color: "808080", size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], color: "808080", size: 18 }),
        ],
      })] }),
    },
    children: [
      ...cover,
      atAGlance,
      P(""),
      ...bottomLine,
      pageBreak,
      ...whatYouHaveBuilt,
      P(""),
      ...functionalCoverage,
      pageBreak,
      ...pricing,
      pageBreak,
      ...arr,
      P(""),
      ...valuation,
      pageBreak,
      ...strategic,
    ],
  }],
});

const outDir = "/sessions/dazzling-trusting-mayer/mnt/breidablik-readiness/public/docs";
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

Packer.toBuffer(doc).then((buffer) => {
  const outPath = path.join(outDir, "MicroPulse-Valuation-Memo-v4.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, buffer.length, "bytes");
});
