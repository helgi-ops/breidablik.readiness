"use client";

/**
 * PtClientReportPdf — a sendable 4-week progress report for one PT client:
 * adherence, readiness trend, internal-load (ACWR), strength PRs and volume.
 * Mirrors the coach report styling.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

export type PtClientReport = {
  client: { id: string; name: string };
  period: { start: string; end: string; weeks: number };
  adherence: { completed: number; skipped: number; total: number; pct: number | null };
  readiness: { checkIns: number; avgScore: number | null; green: number; yellow: number; red: number; series: Array<{ date: string; score: number | null; color: string }> };
  strength: {
    records: Array<{ exercise: string; best_e1rm: number; best_e1rm_date: string; best_weight: number; best_weight_date: string }>;
    recent_prs: Array<{ exercise: string; e1rm?: number; date?: string; prev_best?: number; delta_kg: number }>;
  };
  volume: { weeks: Array<{ week_start: string; total: number }>; by_lift: Array<{ lift: string; total: number }>; this_week: number; last_week: number; delta_pct: number | null; acwr: number | null; acwr_status: string };
  training: { strength_7d: number; sport_7d: number; other_7d?: number; total_7d: number; acwr: number | null; status: string; confidence: string };
  generatedAt?: string;
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
const fmt1 = (n: number | null | undefined) => (n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("en-US"));

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 44, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 6, borderBottom: "2 solid #4F46E5" },
  brand: { fontSize: 12, fontWeight: 700, color: "#4F46E5", letterSpacing: 0.5 },
  brandMeta: { fontSize: 8, color: "#9CA3AF" },
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 2 },
  sub: { fontSize: 10, color: "#6B7280", marginBottom: 10 },
  bottomLine: { borderLeft: "4 solid #4F46E5", backgroundColor: "#EEF2FF", paddingVertical: 6, paddingHorizontal: 8, marginBottom: 10, fontSize: 11, fontWeight: 700, color: "#1E1B4B" },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #E5E7EB", marginTop: 10 },
  para: { fontSize: 9.5, color: "#334155", lineHeight: 1.5, marginBottom: 4 },
  cardsRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  card: { flex: 1, border: "1 solid #E5E7EB", borderRadius: 4, padding: 8 },
  cardVal: { fontSize: 16, fontWeight: 700, color: "#111827" },
  cardLbl: { fontSize: 8, color: "#6B7280", marginTop: 1 },
  tHead: { flexDirection: "row", backgroundColor: "#F3F4F6" },
  tRow: { flexDirection: "row", borderTop: "1 solid #E5E7EB" },
  tRowAlt: { flexDirection: "row", borderTop: "1 solid #E5E7EB", backgroundColor: "#F9FAFB" },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #E5E7EB", paddingTop: 6, fontSize: 7.5, color: "#9CA3AF" },
});

const STATUS_LABEL: Record<string, string> = { low: "below baseline", optimal: "in the sweet spot", high: "elevated", very_high: "spiking", building: "still building a baseline" };

export async function downloadPtClientReportPdf(d: PtClientReport, trainerName = "MicroPulse PT") {
  const generatedAt = new Date(d.generatedAt ?? Date.now()).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Bottom-line summary.
  const adhTxt = d.adherence.pct != null ? `${d.adherence.pct}% session adherence (${d.adherence.completed}/${d.adherence.total})` : "no logged sessions yet";
  const prTxt = d.strength.recent_prs.length ? `, ${d.strength.recent_prs.length} new strength PR${d.strength.recent_prs.length === 1 ? "" : "s"}` : "";
  const rdTxt = d.readiness.avgScore != null ? `, average readiness ${fmt1(d.readiness.avgScore)}/25` : "";
  const bottomLine = `Last ${d.period.weeks} weeks: ${adhTxt}${rdTxt}${prTxt}. Internal load ${STATUS_LABEL[d.training.status] ?? d.training.status}.`;

  const blob = await pdf(
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.brandRow} fixed>
          <Text style={s.brand}>MicroPulse PT</Text>
          <Text style={s.brandMeta}>Client Progress Report</Text>
        </View>

        <Text style={s.h1}>{d.client.name}</Text>
        <Text style={s.sub}>{d.period.start} → {d.period.end} · {d.period.weeks}-week snapshot</Text>

        <Text style={s.bottomLine}>{bottomLine}</Text>

        <View style={s.footer} fixed>
          <Text>MicroPulse PT · {trainerName} · generated {generatedAt}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>

        {/* Headline cards */}
        <View style={s.cardsRow}>
          <View style={s.card}>
            <Text style={s.cardVal}>{d.adherence.pct != null ? `${d.adherence.pct}%` : "—"}</Text>
            <Text style={s.cardLbl}>Adherence ({d.adherence.completed}/{d.adherence.total} sessions)</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardVal}>{fmt1(d.readiness.avgScore)}<Text style={{ fontSize: 9, color: "#9CA3AF" }}> /25</Text></Text>
            <Text style={s.cardLbl}>Avg readiness · {d.readiness.checkIns} check-ins</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardVal}>{d.training.acwr != null ? d.training.acwr.toFixed(2) : "—"}</Text>
            <Text style={s.cardLbl}>Load ACWR · {STATUS_LABEL[d.training.status] ?? d.training.status}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardVal}>{d.strength.recent_prs.length}</Text>
            <Text style={s.cardLbl}>New strength PRs</Text>
          </View>
        </View>

        {/* Readiness */}
        <Text style={s.sectionTitle}>Readiness — how they felt</Text>
        <Text style={s.para}>
          {d.readiness.checkIns > 0
            ? `${d.readiness.checkIns} check-ins over the period — ${d.readiness.green} green, ${d.readiness.yellow} yellow, ${d.readiness.red} red, averaging ${fmt1(d.readiness.avgScore)}/25. ${d.readiness.red === 0 ? "No red days — recovery kept pace with training." : `${d.readiness.red} red day${d.readiness.red === 1 ? "" : "s"} flagged — worth a conversation about sleep/stress/load.`}`
            : "No readiness check-ins logged in this period — encourage daily check-ins to track recovery."}
        </Text>

        {/* Internal load */}
        <Text style={s.sectionTitle}>Training load (last 7 days)</Text>
        <Text style={s.para}>
          Internal load (sRPE): strength {fmt(d.training.strength_7d)} AU + sport {fmt(d.training.sport_7d)} AU = {fmt(d.training.total_7d)} AU total. Acute:chronic ratio {d.training.acwr != null ? d.training.acwr.toFixed(2) : "—"} — {STATUS_LABEL[d.training.status] ?? d.training.status} (0.8–1.3 = familiar load range; a spike-size context, not an injury predictor — Gabbett 2016, Impellizzeri 2020). Confidence: {d.training.confidence}.
        </Text>

        {/* Strength PRs */}
        {d.strength.recent_prs.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>New personal records</Text>
            <View>
              <View style={s.tHead}>
                <Text style={{ width: "46%", padding: 4, fontWeight: 700 }}>Lift</Text>
                <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>Est. 1RM (kg)</Text>
                <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>Improvement</Text>
              </View>
              {d.strength.recent_prs.slice(0, 12).map((p, i) => (
                <View key={p.exercise + i} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                  <Text style={{ width: "46%", padding: 4 }}>{p.exercise}</Text>
                  <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>{fmt1(p.e1rm)}</Text>
                  <Text style={{ width: "27%", padding: 4, textAlign: "right", color: "#059669" }}>+{fmt1(p.delta_kg)} kg</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Best lifts */}
        {d.strength.records.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Current best lifts (estimated 1RM)</Text>
            <View>
              <View style={s.tHead}>
                <Text style={{ width: "46%", padding: 4, fontWeight: 700 }}>Lift</Text>
                <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>Best e1RM (kg)</Text>
                <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>Top set (kg)</Text>
              </View>
              {d.strength.records.slice(0, 10).map((r, i) => (
                <View key={r.exercise + i} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                  <Text style={{ width: "46%", padding: 4 }}>{r.exercise}</Text>
                  <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>{fmt1(r.best_e1rm)}</Text>
                  <Text style={{ width: "27%", padding: 4, textAlign: "right" }}>{fmt1(r.best_weight)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Volume */}
        <Text style={s.sectionTitle}>Strength volume (tonnage)</Text>
        <Text style={s.para}>
          This week {fmt(d.volume.this_week)} kg vs last week {fmt(d.volume.last_week)} kg
          {d.volume.delta_pct != null ? ` (${d.volume.delta_pct >= 0 ? "+" : ""}${d.volume.delta_pct}%)` : ""}. Tonnage acute:chronic {d.volume.acwr != null ? d.volume.acwr.toFixed(2) : "—"} ({STATUS_LABEL[d.volume.acwr_status] ?? d.volume.acwr_status}).
          {d.volume.by_lift.length ? ` Top lifts by volume: ${d.volume.by_lift.slice(0, 4).map((l) => `${l.lift} ${fmt(l.total)} kg`).join(", ")}.` : ""}
        </Text>

        <Text style={{ fontSize: 8, color: "#94A3B8", marginTop: 8, lineHeight: 1.4 }}>
          Adherence = completed ÷ logged sessions. Readiness = daily wellness check-in (sleep, energy, soreness, stress) on a 5–25 scale. Internal load = session RPE × minutes (Foster sRPE). e1RM = estimated 1-rep max (Epley, RIR-adjusted). ACWR = acute(7d) ÷ chronic(28d) load; 0.8–1.3 = familiar range, a spike-size context, not an injury predictor (Gabbett 2016, Impellizzeri 2020).
        </Text>
      </Page>
    </Document>,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pt-progress-${d.client.name.replace(/\s+/g, "-")}-${d.period.end}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
