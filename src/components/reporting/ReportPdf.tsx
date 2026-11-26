"use client";

/**
 * ReportPdf — the generic reporting-layer PDF (any PdfRenderModel).
 *
 * Layered read via the shared PDF kit (src/components/pdf/brand.tsx): the summary line
 * first and boldest, then each section in order — text and lists before metric tiles,
 * tables last within their section. Content is rule-built by the reporting layer.
 */

import { Document, Text, View } from "@react-pdf/renderer";
import type { PdfRenderModel } from "@/lib/micropulse/reporting";
import { AiBox, BrandPage, Bullets, C, Section, StatGrid, Table, Verdict, clean, downloadPdf, fb, type Col } from "@/components/pdf/brand";

type ReportSectionModel = PdfRenderModel["sections"][number];
/** Glyphs outside the brand fonts' latin subset (and WinAnsi) → nearest ASCII. */
const tx = (s: string) => clean(s).replace(/[′‘’]/g, "'").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=").replace(/[≈]/g, "~");
/** AI-written prose sections (e.g. "Executive Summary (AI synthesis …)") stay labelled as AI. */
const isAiSection = (s: ReportSectionModel) => s.kind === "TEXT" && /\bAI\b/.test(s.title);

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Flatten an object/value into a displayable string */
function displayValue(v: unknown): string {
  if (v == null) return "-";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    // For objects, try to find a meaningful label
    const obj = v as Record<string, unknown>;
    if ("name" in obj && typeof obj.name === "string") return obj.name;
    if ("label" in obj && typeof obj.label === "string") return obj.label;
    if ("title" in obj && typeof obj.title === "string") return obj.title;
    if ("value" in obj) return displayValue(obj.value);
    return JSON.stringify(v);
  }
  return String(v);
}

/** Extract table columns from array of row objects */
function extractColumns(rows: unknown[]): string[] {
  const cols = new Set<string>();
  for (const row of rows.slice(0, 10)) {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      for (const key of Object.keys(row as Record<string, unknown>)) {
        cols.add(key);
      }
    }
  }
  return Array.from(cols);
}

/* ── Section renderers ───────────────────────────────────────────────── */

function TextSection({ text }: { text: string[] }) {
  return (
    <View>
      {text.map((t, i) => (
        <Text key={i} style={[fb(400), { fontSize: 9.5, lineHeight: 1.5, color: C.ink, marginBottom: 4 }]}>{tx(t)}</Text>
      ))}
    </View>
  );
}

function ListSection({ rows, text }: { rows?: unknown[]; text?: string[] }) {
  const items: string[] = [];
  if (rows) {
    for (const r of rows) items.push(displayValue(r));
  }
  if (text) {
    for (const t of text) items.push(t);
  }
  return <Bullets items={items.map(tx)} size={9} />;
}

function MetricGridSection({ rows }: { rows: unknown[] }) {
  const items = rows.map((row, i) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const obj = row as Record<string, unknown>;
      // Try common patterns: {metric, value}, {label, value}, {name, count}, or just key-value pairs
      const label =
        displayValue(obj.metric ?? obj.label ?? obj.name ?? obj.key ?? Object.keys(obj)[0] ?? `Metric ${i + 1}`);
      const value =
        displayValue(obj.value ?? obj.count ?? obj.score ?? obj.total ?? Object.values(obj)[1] ?? "-");
      return { label: tx(label), value: tx(value) };
    }
    return { label: `Item ${i + 1}`, value: tx(displayValue(row)) };
  });
  return <StatGrid items={items} cols={3} />;
}

function TableSection({ rows }: { rows: unknown[] }) {
  const columns = extractColumns(rows);
  if (columns.length === 0) {
    // Fall back to list rendering
    return <ListSection rows={rows} />;
  }
  const cols: Col[] = columns.map((col) => ({ label: tx(col.replace(/_/g, " ")) }));
  const body = rows.map((row) => {
    const obj = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    return columns.map((col) => tx(displayValue(obj[col])));
  });
  return <Table cols={cols} rows={body} size={8.5} />;
}

/* ── Main document ───────────────────────────────────────────────────── */

function ReportSection({
  section,
}: {
  section: ReportSectionModel;
}) {
  if (isAiSection(section)) {
    return <AiBox label={tx(section.title).toUpperCase()} body={(section.text ?? []).map(tx).join("\n\n")} />;
  }
  return (
    // Short sections stay on one page (no orphaned title or table header); long tables flow.
    <Section title={tx(section.title)} mt={6} wrap={(section.rows?.length ?? 0) > 12}>
      {section.kind === "TEXT" && section.text && <TextSection text={section.text} />}

      {section.kind === "LIST" && <ListSection rows={section.rows} text={section.text} />}

      {section.kind === "METRIC_GRID" && section.rows && <MetricGridSection rows={section.rows} />}

      {section.kind === "TABLE" && section.rows && <TableSection rows={section.rows} />}

      {/* Fallback: if kind doesn't match but we have data */}
      {!["TEXT", "LIST", "METRIC_GRID", "TABLE"].includes(section.kind) && (
        <ListSection rows={section.rows} text={section.text} />
      )}
    </Section>
  );
}

export function ReportPdfDocument({ model }: { model: PdfRenderModel }) {
  const generated = formatDate(model.generatedAt);
  // AI synthesis is read right after the summary; everything else keeps the model's order.
  const ordered = [...model.sections.filter(isAiSection), ...model.sections.filter((s) => !isAiSection(s))];
  return (
    <Document title={model.title} author="MicroPulse">
      <BrandPage
        doc="Report"
        context={model.subtitle ?? undefined}
        title={tx(model.title)}
        kicker={model.subtitle ?? undefined}
        subtitle={generated ? `Generated: ${generated}` : undefined}
        note={`${model.footerNote ?? "Generated by MicroPulse"}${generated ? ` · ${generated}` : ""}`}
      >
        {/* Summary — first and boldest */}
        <Verdict tone="neutral" label="Summary" headline={tx(model.summaryLine)} />

        {/* Sections */}
        {ordered.map((section, i) => (
          <ReportSection key={i} section={section} />
        ))}
      </BrandPage>
    </Document>
  );
}

/** Generate and download a real PDF from a PdfRenderModel */
export async function downloadReportPdf(model: PdfRenderModel, filename: string) {
  await downloadPdf(() => <ReportPdfDocument model={model} />, filename);
}
