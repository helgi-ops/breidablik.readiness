"use client";

/**
 * MicroPulse PDF brand kit — the ONE place every @react-pdf export gets its look.
 *
 * Tokens follow CLAUDE.md § Design system (bone #f4f2ec, ink #14181c, cobalt #2740e6,
 * traffic-light green/amber/red, rtp purple; Archivo headings + numbers, Geist body).
 * Fonts are WOFF files in /public/fonts/pdf (OFL). If they can't load, renderPdfBlob()
 * re-renders with Helvetica so an export never fails on styling.
 *
 * Explainability-first (docs/explainability-first.md) in print form:
 *   layer 0  <Verdict> / <AiBox>  — one sentence, first and boldest
 *   layer 1  <FactRow>            — 2-3 plain supporting facts with their number
 *   layer 2  <Table>, <StatGrid>  — raw data, further down / later pages
 * AI content always goes in <AiBox> (labelled "AI"), never in a <Verdict>.
 *
 * Usage:
 *   <Document><BrandPage doc="Session plan" title="MD-3 Possession" subtitle="12 May 2026">…</BrandPage></Document>
 *   await downloadPdf(() => <MyDoc data={d} />, "session.pdf");
 */

import React from "react";
import { Font, Page, Text, View, pdf } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";

// ── Tokens ───────────────────────────────────────────────────────────────────
export const C = {
  bone: "#f4f2ec",
  card: "#ffffff",
  ink: "#14181c",
  mute: "#575c63",
  faint: "#8a8f96",
  rule: "#dcd8cc",
  ruleStrong: "#cfcabd",
  hair: "#efece4",
  track: "#eceae3",
  cobalt: "#2740e6",
  cobaltTint: "#e6e9fc",
  cobaltEdge: "#c4cbf5",
  green: "#1c7a4a",
  greenTint: "#e3f1e8",
  greenText: "#145233",
  amber: "#de9328",
  amberTint: "#fbeed8",
  amberText: "#7a4c0c",
  red: "#a83e28",
  redTint: "#f7e4df",
  redText: "#7a2a1a",
  rtp: "#7a5cc4",
  rtpTint: "#efe9fa",
  rtpText: "#4f3590",
} as const;

export type Tone = "green" | "amber" | "red" | "rtp" | "cobalt" | "neutral";
/** fill = strong swatch/bar, tint = background, text = readable text on tint/bone (≥4.5:1). */
export const TONE: Record<Tone, { fill: string; tint: string; text: string; edge: string }> = {
  green: { fill: C.green, tint: C.greenTint, text: C.greenText, edge: "#b5d9c3" },
  amber: { fill: C.amber, tint: C.amberTint, text: C.amberText, edge: "#ecc98c" },
  red: { fill: C.red, tint: C.redTint, text: C.redText, edge: "#e2b2a6" },
  rtp: { fill: C.rtp, tint: C.rtpTint, text: C.rtpText, edge: "#cfc1ee" },
  cobalt: { fill: C.cobalt, tint: C.cobaltTint, text: C.cobalt, edge: C.cobaltEdge },
  neutral: { fill: C.ink, tint: "#ebe8e0", text: C.ink, edge: C.rule },
};
/** Map common verdict strings (GREEN/YELLOW/RED, FULL/MODIFIED/RECOVERY, ok/low/high…) to a tone. */
export function toneOf(v: string | null | undefined): Tone {
  const s = String(v ?? "").toLowerCase();
  if (["green", "full", "ready", "ok", "low_risk", "low"].includes(s)) return "green";
  if (["yellow", "amber", "modified", "reduced", "caution", "moderate", "medium"].includes(s)) return "amber";
  if (["red", "recovery", "rest", "high", "high_risk", "danger"].includes(s)) return "red";
  if (["rtp", "rtt", "return", "rehab"].includes(s)) return "rtp";
  return "neutral";
}

// ── Fonts ────────────────────────────────────────────────────────────────────
type W = 400 | 500 | 600 | 700 | 800;
type FontStyle = { fontFamily: string; fontWeight?: number };
let useBrand = true;
/** Heading / number font (Archivo). */
export const fh = (w: W = 700): FontStyle => (useBrand ? { fontFamily: "Archivo", fontWeight: w < 600 ? 600 : w } : { fontFamily: "Helvetica-Bold" });
/** Body font (Geist). */
export const fb = (w: W = 400): FontStyle =>
  useBrand ? { fontFamily: "Geist", fontWeight: w >= 700 ? 700 : w >= 500 ? 600 : 400 } : { fontFamily: w >= 500 ? "Helvetica-Bold" : "Helvetica" };

let registered = false;
function registerBrandFonts() {
  if (registered || typeof window === "undefined") return;
  const base = `${window.location.origin}/fonts/pdf`;
  Font.register({ family: "Archivo", fonts: [600, 700, 800].map((w) => ({ src: `${base}/archivo-latin-${w}-normal.woff`, fontWeight: w })) });
  Font.register({ family: "Geist", fonts: [400, 600, 700].map((w) => ({ src: `${base}/geist-sans-latin-${w}-normal.woff`, fontWeight: w })) });
  registered = true;
}
/** Test/server hook: register the brand fonts from explicit sources (e.g. file paths). */
export function registerBrandFontsFrom(src: (file: string) => string) {
  Font.register({ family: "Archivo", fonts: [600, 700, 800].map((w) => ({ src: src(`archivo-latin-${w}-normal.woff`), fontWeight: w })) });
  Font.register({ family: "Geist", fonts: [400, 600, 700].map((w) => ({ src: src(`geist-sans-latin-${w}-normal.woff`), fontWeight: w })) });
  registered = true;
}
// Whole words only — automatic hyphenation splits names and numbers mid-word.
Font.registerHyphenationCallback((word) => [word]);

/** Render to a Blob with the brand fonts; on font failure fall back to Helvetica. */
export async function renderPdfBlob(make: () => React.ReactElement<DocumentProps>): Promise<Blob> {
  try {
    registerBrandFonts();
    useBrand = true;
    return await pdf(make()).toBlob();
  } catch (e) {
    console.warn("[pdf] brand fonts failed, falling back to Helvetica", e);
    useBrand = false;
    try {
      return await pdf(make()).toBlob();
    } finally {
      useBrand = true;
    }
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPdf(make: () => React.ReactElement<DocumentProps>, filename: string) {
  saveBlob(await renderPdfBlob(make), filename);
}

// ── Text helpers ─────────────────────────────────────────────────────────────
/** Normalise typographic quotes/dashes/arrows (kept for the Helvetica fallback). */
export const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[‘’′]/g, "'").replace(/[“”„″]/g, '"').replace(/[–—−]/g, "-")
    .replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/≈/g, "~").replace(/↔/g, "vs").replace(/→/g, "->").replace(/←/g, "<-")
    .replace(/[▲▼✓✔✗✘↑↓↗↘⛨]/g, "").replace(/\s+$/g, "");
export const dash = "-";
export const n1 = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? dash : v.toFixed(d));
export const pc = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? dash : `${v.toFixed(d)}%`);
export const fileSafe = (s: string) => clean(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";

// ── Page shell ───────────────────────────────────────────────────────────────
const PAD_X = 40;
export const PAGE_STYLE = { backgroundColor: C.bone, color: C.ink, paddingTop: 62, paddingBottom: 58, paddingHorizontal: PAD_X, fontSize: 9.5 } as const;
// NB: never put lineHeight on the Page — it stops `fixed` absolute header/footer rendering (react-pdf 4.3).

export type BrandPageProps = {
  /** Running header label, right side (e.g. "SESSION PLAN"). */
  doc: string;
  /** Running header left context (team / player / opponent). */
  context?: string;
  /** Masthead — only pass on the first page of a document. */
  title?: string;
  kicker?: string;
  subtitle?: string;
  chips?: { text: string; tone?: Tone }[];
  /** Footer disclaimer / provenance line. */
  note?: string;
  orientation?: "portrait" | "landscape";
  size?: "A4" | "LETTER";
  children?: React.ReactNode;
  wrap?: boolean;
};

export function BrandPage({ doc, context, title, kicker, subtitle, chips, note, orientation = "portrait", size = "A4", children, wrap = true }: BrandPageProps) {
  return (
    <Page size={size} orientation={orientation} style={PAGE_STYLE} wrap={wrap}>
      <View fixed style={{ position: "absolute", top: 26, left: PAD_X, right: PAD_X, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 7, borderBottomWidth: 1.25, borderBottomColor: C.ink }}>
        <Text style={[fh(700), { fontSize: 9.5 }]}>
          MicroPulse{context ? <Text style={[fb(400), { color: C.mute }]}>{`  ·  ${clean(context)}`}</Text> : null}
        </Text>
        <Text style={[fb(600), { fontSize: 8, letterSpacing: 1.1, color: C.cobalt }]}>{clean(doc).toUpperCase()}</Text>
      </View>
      {title ? <Masthead title={title} kicker={kicker} subtitle={subtitle} chips={chips} /> : null}
      {children}
      <View fixed style={{ position: "absolute", bottom: 20, left: PAD_X, right: PAD_X, borderTopWidth: 1, borderTopColor: C.ruleStrong, paddingTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <Text style={[fb(400), { fontSize: 7.5, color: C.mute, flex: 1, marginRight: 24, lineHeight: 1.35 }]}>{note ? clean(note) : "MicroPulse · micropulse.is"}</Text>
        <Text style={[fb(600), { fontSize: 8, color: C.ink }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

export function Masthead({ title, kicker, subtitle, chips }: { title: string; kicker?: string; subtitle?: string; chips?: { text: string; tone?: Tone }[] }) {
  const t = clean(title);
  return (
    <View style={{ marginBottom: 14, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: C.rule }}>
      {kicker ? <Text style={[fb(600), { fontSize: 8, letterSpacing: 1.1, color: C.cobalt, marginBottom: 5 }]}>{clean(kicker).toUpperCase()}</Text> : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[fh(800), { fontSize: t.length > 34 ? 20 : t.length > 20 ? 26 : 32, lineHeight: 1.05, letterSpacing: -0.6 }]}>{t}</Text>
          {subtitle ? <Text style={[fb(400), { fontSize: 9.5, color: C.mute, marginTop: 5 }]}>{clean(subtitle)}</Text> : null}
        </View>
        {chips?.length ? (
          <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 260 }}>
            {chips.map((c, i) => <Chip key={i} text={c.text} tone={c.tone} />)}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────
type Sty = Record<string, unknown>;
const S = (x: Sty) => x as never;

export function Section({ title, hint, children, mt = 4, break: brk, wrap = true }: { title?: string; hint?: string; children?: React.ReactNode; mt?: number; break?: boolean; wrap?: boolean }) {
  return (
    <View style={{ marginTop: mt, paddingBottom: 10 }} break={brk} wrap={wrap}>
      {title ? (
        <View minPresenceAhead={50} wrap={false}>
          <Text style={[fh(700), { fontSize: 13, letterSpacing: -0.1, marginBottom: hint ? 2 : 6 }]}>{clean(title)}</Text>
          {hint ? <Text style={[fb(400), { fontSize: 8.25, color: C.mute, marginBottom: 6, lineHeight: 1.35 }]}>{clean(hint)}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Label({ children, color = C.mute, mt = 0 }: { children: React.ReactNode; color?: string; mt?: number }) {
  return <Text style={[fb(700), { fontSize: 7.5, letterSpacing: 0.8, color, marginTop: mt, marginBottom: 2 }]}>{typeof children === "string" ? clean(children).toUpperCase() : children}</Text>;
}

export function Body({ children, size = 9, color = C.ink, mt = 0, bold = false }: { children: React.ReactNode; size?: number; color?: string; mt?: number; bold?: boolean }) {
  return <Text style={[fb(bold ? 600 : 400), { fontSize: size, color, marginTop: mt, lineHeight: 1.45 }]}>{typeof children === "string" ? clean(children) : children}</Text>;
}

export function Card({ children, style, tone, pad = 11, wrap = false }: { children?: React.ReactNode; style?: Sty; tone?: Tone; pad?: number; wrap?: boolean }) {
  const t = tone ? TONE[tone] : null;
  return (
    <View wrap={wrap} style={S({ backgroundColor: t ? t.tint : C.card, borderWidth: 1, borderColor: t ? t.edge : C.rule, borderRadius: 8, padding: pad, ...style })}>
      {children}
    </View>
  );
}

export function Chip({ text, tone = "neutral" }: { text: string; tone?: Tone }) {
  const t = TONE[tone];
  const outline = tone === "neutral";
  return (
    <Text style={[fb(600), { fontSize: 7.75, color: t.text, backgroundColor: outline ? undefined : t.tint, borderWidth: outline ? 1 : 0, borderColor: C.ink, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }]}>{clean(text)}</Text>
  );
}

/** Traffic-light dot + word. Colour is never the only signal — the word is always printed. */
export function Status({ tone, text, size = 8.5 }: { tone: Tone; text: string; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4, backgroundColor: TONE[tone].fill }} />
      <Text style={[fb(600), { fontSize: size, color: TONE[tone].text }]}>{clean(text)}</Text>
    </View>
  );
}

/** Layer 0 — the rule-based verdict. One sentence, first and boldest. */
export function Verdict({ tone = "neutral", label, headline, body, confidence }: { tone?: Tone; label?: string; headline: string; body?: string; confidence?: string }) {
  const t = TONE[tone];
  return (
    <View wrap={false} style={{ backgroundColor: tone === "neutral" ? C.card : t.tint, borderWidth: 1, borderColor: t.edge, borderRadius: 9, padding: 13, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        {label ? <Status tone={tone} text={clean(label).toUpperCase()} size={8} /> : <View />}
        {confidence ? <Text style={[fb(400), { fontSize: 7.75, color: C.mute }]}>{clean(confidence)}</Text> : null}
      </View>
      <Text style={[fh(700), { fontSize: 13, lineHeight: 1.3 }]}>{clean(headline)}</Text>
      {body ? <Text style={[fb(400), { fontSize: 9, lineHeight: 1.45, marginTop: 5, color: "#33373d" }]}>{clean(body)}</Text> : null}
    </View>
  );
}

/** AI synthesis — always labelled as AI, always cites what it read. */
export function AiBox({ headline, body, bullets, cites, label = "READS THE NUMBERS - DECIDES NOTHING", children }: { headline?: string; body?: string; bullets?: string[]; cites?: string; label?: string; children?: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.cobaltTint, borderWidth: 1, borderColor: C.cobaltEdge, borderRadius: 9, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Text style={[fb(700), { backgroundColor: C.cobalt, color: "#ffffff", fontSize: 7.5, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 3, letterSpacing: 0.6 }]}>AI</Text>
        <Text style={[fb(600), { fontSize: 7.75, letterSpacing: 0.8, color: C.cobalt }]}>{clean(label)}</Text>
      </View>
      {headline ? <Text style={[fh(600), { fontSize: 12, lineHeight: 1.32, marginTop: 7 }]}>{clean(headline)}</Text> : null}
      {body ? <Text style={[fb(400), { fontSize: 9, lineHeight: 1.5, marginTop: headline ? 5 : 7, color: "#2b2f35" }]}>{clean(body)}</Text> : null}
      {bullets?.length ? <View style={{ marginTop: 5 }}><Bullets items={bullets} /></View> : null}
      {children}
      {cites ? <Text style={[fb(400), { fontSize: 7.75, color: "#444a56", marginTop: 6 }]}>{clean(cites)}</Text> : null}
    </View>
  );
}

/** Layer 1 — 2-4 plain facts, each with its number. */
export function FactRow({ facts }: { facts: { value: string; label: string; sub?: string; tone?: Tone }[] }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", gap: 7, marginBottom: 10 }}>
      {facts.map((f, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.rule, borderRadius: 8, padding: 10 }}>
          <Text style={[fh(800), { fontSize: 17, lineHeight: 1.05, letterSpacing: -0.3, color: f.tone ? TONE[f.tone].text : C.ink }]}>{clean(f.value)}</Text>
          <Text style={[fb(600), { fontSize: 9, marginTop: 4 }]}>{clean(f.label)}</Text>
          {f.sub ? <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 2, lineHeight: 1.35 }]}>{clean(f.sub)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Compact KPI tiles (label above value). cols = tiles per row. */
export function StatGrid({ items, cols = 4 }: { items: { label: string; value: string; sub?: string; tone?: Tone }[]; cols?: number }) {
  const w = `${(100 - (cols - 1) * 1.6) / cols}%`;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
      {items.map((it, i) => (
        <View key={i} wrap={false} style={{ width: w, backgroundColor: it.tone ? TONE[it.tone].tint : C.card, borderWidth: 1, borderColor: it.tone ? TONE[it.tone].edge : C.rule, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6 }}>
          <Text style={[fb(600), { fontSize: 7.5, color: C.mute }]}>{clean(it.label)}</Text>
          <Text style={[fh(800), { fontSize: 12.5, marginTop: 1.5, color: it.tone ? TONE[it.tone].text : C.ink }]}>{clean(it.value)}</Text>
          {it.sub ? <Text style={[fb(400), { fontSize: 7.25, color: C.mute, marginTop: 1 }]}>{clean(it.sub)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Label/value rows inside a card. */
export function KeyValues({ rows, labelWidth }: { rows: [string, React.ReactNode][]; labelWidth?: number }) {
  return (
    <View>
      {rows.map(([k, v], i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 3.5, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.hair }}>
          <Text style={[fb(400), { fontSize: 8.75, color: C.mute, width: labelWidth }]}>{clean(k)}</Text>
          {typeof v === "string" || typeof v === "number" ? <Text style={[fb(600), { fontSize: 8.75, textAlign: "right", flex: labelWidth ? 1 : undefined }]}>{clean(v)}</Text> : v}
        </View>
      ))}
    </View>
  );
}

export type Col = { label: string; width?: number; flex?: number; align?: "left" | "right" | "center"; strong?: boolean };
/** Data table in a card: ink header rule, hairline rows, numbers right-aligned. Cells may be strings or nodes. */
export function Table({ cols, rows, size = 8.5, rowTone, dense = false }: { cols: Col[]; rows: React.ReactNode[][]; size?: number; rowTone?: (i: number) => Tone | null | undefined; dense?: boolean }) {
  const cell = (c: Col) => ({ width: c.width, flex: c.width ? undefined : c.flex ?? 1, textAlign: c.align ?? "left", paddingHorizontal: 3 });
  return (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.rule, borderRadius: 8, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2 }}>
      <View fixed style={{ flexDirection: "row", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.ink }}>
        {cols.map((c, i) => <Text key={i} style={S({ ...fb(600), fontSize: 7.5, color: C.mute, ...cell(c) })}>{clean(c.label)}</Text>)}
      </View>
      {rows.map((r, ri) => {
        const tone = rowTone?.(ri);
        return (
          <View key={ri} wrap={false} style={{ flexDirection: "row", alignItems: "center", paddingVertical: dense ? 2.5 : 4, borderBottomWidth: ri < rows.length - 1 ? 1 : 0, borderBottomColor: C.hair, backgroundColor: tone ? TONE[tone].tint : undefined }}>
            {cols.map((c, ci) => {
              const v = r[ci];
              return typeof v === "string" || typeof v === "number" || v == null ? (
                <Text key={ci} style={S({ ...(c.strong ? fh(700) : fb(ci === 0 ? 600 : 400)), fontSize: size, ...cell(c) })}>{v == null ? dash : clean(v)}</Text>
              ) : (
                <View key={ci} style={S({ ...cell(c), alignItems: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "stretch" })}>{v}</View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** Horizontal bar (value / max) with an optional band marker [lo, hi]. */
export function Bar({ value, max, color = C.cobalt, height = 6, band }: { value: number; max: number; color?: string; height?: number; band?: [number, number] }) {
  const p = (v: number) => `${max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
  return (
    <View style={{ height, alignSelf: "stretch", backgroundColor: C.track, borderRadius: 2, position: "relative" }}>
      <View style={{ width: value > 0 ? p(value) : 0, minWidth: value > 0 ? 2 : 0, height, backgroundColor: color, borderRadius: 2 }} />
      {band ? <View style={{ position: "absolute", left: p(band[0]), width: `${max > 0 ? Math.max(0, Math.min(100, ((band[1] - band[0]) / max) * 100)) : 0}%`, top: -1.5, bottom: -1.5, borderWidth: 1, borderColor: C.ink, borderRadius: 2 }} /> : null}
    </View>
  );
}

/** Bulleted list. lead/detail split on " - " when the lead is short. */
export function Bullets({ items, tone, size = 8.75, split = false }: { items: string[]; tone?: Tone; size?: number; split?: boolean }) {
  return (
    <View>
      {items.map((x, i) => {
        const c = clean(x).trim();
        const k = split ? c.indexOf(" - ") : -1;
        const lead = k > 0 && k <= 70 ? c.slice(0, k) : null;
        const rest = lead ? c.slice(k + 3) : c;
        return (
          <View key={i} wrap={false} style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: tone ? TONE[tone].fill : C.ink, marginTop: size * 0.5 }} />
            <Text style={[fb(400), { flex: 1, fontSize: size, lineHeight: 1.45, color: tone ? TONE[tone].text : C.ink }]}>
              {lead ? <Text style={fb(600)}>{`${lead} - `}</Text> : null}
              {rest}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Two or more equal columns. */
export function Cols({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", gap, alignItems: "flex-start" }}>{React.Children.map(children, (c) => (c ? <View style={{ flex: 1 }}>{c}</View> : null))}</View>;
}

/** Small source / method / citation line. */
export function Provenance({ children }: { children: React.ReactNode }) {
  return <Text style={[fb(400), { fontSize: 7.5, color: C.mute, marginTop: 4, lineHeight: 1.4 }]}>{typeof children === "string" ? clean(children) : children}</Text>;
}
