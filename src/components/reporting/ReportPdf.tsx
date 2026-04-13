"use client";

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { PdfRenderModel } from "@/lib/micropulse/reporting";

/* ── Styles ─────────────────────────────────────────────────────────── */

const colors = {
  primary: "#1E3A8A",
  primaryLight: "#DBEAFE",
  accent: "#2563EB",
  text: "#111827",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  white: "#FFFFFF",
  greenBg: "#ECFDF5",
  greenBorder: "#A7F3D0",
  greenText: "#065F46",
  yellowBg: "#FFFBEB",
  yellowBorder: "#FDE68A",
  yellowText: "#92400E",
  redBg: "#FEF2F2",
  redBorder: "#FECACA",
  redText: "#991B1B",
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: colors.text,
    fontFamily: "Helvetica",
    backgroundColor: colors.white,
  },

  /* Header */
  headerBar: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    padding: "14 18",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: colors.white,
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 9,
    color: "#93C5FD",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  dateLine: {
    fontSize: 8,
    color: "#93C5FD",
    marginTop: 4,
  },

  /* Summary box */
  summaryBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
    padding: "10 14",
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  summaryLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  summaryText: {
    fontSize: 10,
    color: colors.primary,
    lineHeight: 1.5,
  },

  /* Section */
  sectionWrap: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  /* Text section */
  textBlock: {
    fontSize: 10,
    color: colors.text,
    lineHeight: 1.5,
    marginBottom: 4,
  },

  /* List section */
  listItem: {
    flexDirection: "row",
    marginBottom: 3,
    paddingLeft: 4,
  },
  listBullet: {
    width: 12,
    fontSize: 10,
    color: colors.accent,
    fontWeight: 700,
  },
  listText: {
    flex: 1,
    fontSize: 9,
    color: colors.text,
    lineHeight: 1.4,
  },

  /* Metric grid */
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  metricTile: {
    width: "31%",
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: "#EFF6FF",
    borderRadius: 4,
    padding: "8 10",
  },
  metricLabel: {
    fontSize: 7,
    color: colors.accent,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.primary,
  },

  /* Table section */
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tableRowAlt: {
    backgroundColor: "#F9FAFB",
  },
  cellH: {
    padding: "5 6",
    fontSize: 7,
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: "uppercase",
    flex: 1,
  },
  cell: {
    padding: "5 6",
    fontSize: 9,
    color: colors.text,
    flex: 1,
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: colors.textLight,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
});

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
  if (v == null) return "–";
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
        <Text key={i} style={styles.textBlock}>{t}</Text>
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
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={styles.listItem}>
          <Text style={styles.listBullet}>•</Text>
          <Text style={styles.listText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function MetricGridSection({ rows }: { rows: unknown[] }) {
  return (
    <View style={styles.metricsGrid}>
      {rows.map((row, i) => {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          const obj = row as Record<string, unknown>;
          // Try common patterns: {metric, value}, {label, value}, {name, count}, or just key-value pairs
          const label =
            displayValue(obj.metric ?? obj.label ?? obj.name ?? obj.key ?? Object.keys(obj)[0] ?? `Metric ${i + 1}`);
          const value =
            displayValue(obj.value ?? obj.count ?? obj.score ?? obj.total ?? Object.values(obj)[1] ?? "–");
          return (
            <View key={i} style={styles.metricTile}>
              <Text style={styles.metricLabel}>{label}</Text>
              <Text style={styles.metricValue}>{value}</Text>
            </View>
          );
        }
        return (
          <View key={i} style={styles.metricTile}>
            <Text style={styles.metricLabel}>Item {i + 1}</Text>
            <Text style={styles.metricValue}>{displayValue(row)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TableSection({ rows }: { rows: unknown[] }) {
  const columns = extractColumns(rows);
  if (columns.length === 0) {
    // Fall back to list rendering
    return <ListSection rows={rows} />;
  }
  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        {columns.map((col) => (
          <Text key={col} style={styles.cellH}>
            {col.replace(/_/g, " ")}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => {
        const obj = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return (
          <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
            {columns.map((col) => (
              <Text key={col} style={styles.cell}>
                {displayValue(obj[col])}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/* ── Main document ───────────────────────────────────────────────────── */

function ReportSection({
  section,
}: {
  section: PdfRenderModel["sections"][number];
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{section.title}</Text>

      {section.kind === "TEXT" && section.text && <TextSection text={section.text} />}

      {section.kind === "LIST" && <ListSection rows={section.rows} text={section.text} />}

      {section.kind === "METRIC_GRID" && section.rows && <MetricGridSection rows={section.rows} />}

      {section.kind === "TABLE" && section.rows && <TableSection rows={section.rows} />}

      {/* Fallback: if kind doesn't match but we have data */}
      {!["TEXT", "LIST", "METRIC_GRID", "TABLE"].includes(section.kind) && (
        <ListSection rows={section.rows} text={section.text} />
      )}
    </View>
  );
}

export function ReportPdfDocument({ model }: { model: PdfRenderModel }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBar}>
          <Text style={styles.title}>{model.title}</Text>
          {model.subtitle && <Text style={styles.subtitle}>{model.subtitle}</Text>}
          {model.generatedAt && (
            <Text style={styles.dateLine}>Generated: {formatDate(model.generatedAt)}</Text>
          )}
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Summary</Text>
          <Text style={styles.summaryText}>{model.summaryLine}</Text>
        </View>

        {/* Sections */}
        {model.sections.map((section, i) => (
          <ReportSection key={i} section={section} />
        ))}

        {/* Footer */}
        <Text style={styles.footer}>
          {model.footerNote ?? "Generated by MicroPulse"} · {formatDate(model.generatedAt)}
        </Text>
      </Page>
    </Document>
  );
}

/** Generate and download a real PDF from a PdfRenderModel */
export async function downloadReportPdf(model: PdfRenderModel, filename: string) {
  const blob = await pdf(<ReportPdfDocument model={model} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
