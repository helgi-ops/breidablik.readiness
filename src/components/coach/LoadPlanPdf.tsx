"use client";

/**
 * LoadPlanPdf — builds and downloads a pre-session "Today's Load Target" PDF
 * from the deterministic load plan (and the optional AI narrative). Mirrors the
 * Post-Training report styling.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { buildLoadPlanNarrative, buildLoadPlanBottomLine } from "@/lib/micropulse/loadPlan/narrative";

type KpiTarget = { kpi: string; target: number | null; matchRef: number | null; pctOfMatch: number | null };
export type LoadPlanForPdf = {
  sessionDate: string;
  teamName?: string | null;
  planned: { applicable: boolean; mdLabel: string | null; loadType: string; band: string; rpe: number; durationMin: number; sessionLoad: number; matchPct: number; rationaleEN: string };
  applicable: boolean;
  mode: "microcycle" | "recent_baseline" | "unavailable";
  hasTargets: boolean;
  baselineNote?: string | null;
  targets: KpiTarget[];
  matchDaysUsed: number;
  teamAcwr: number | null; acutePL: number | null; chronicPL: number | null;
  readinessAdjustPct: number; readinessNote: string | null;
  targetRpe: number | null; targetDurationMin: number | null; targetSrpe: number | null; srpeSource: "microcycle" | "recent" | "none";
  recentSessions: Array<{ date: string; totalDistance: number | null; playerLoad: number | null; hsr: number | null; isPeak: boolean }>;
  availableKpis?: string[];
  perPlayer: Array<{ name: string; totalDistance: number | null; playerLoad: number | null; hsr: number | null; sprint: number | null; accel: number | null; decel: number | null; efforts: number | null; ima: number | null; imaAccel: number | null; imaDecel: number | null; imaCod: number | null; jumps: number | null; acwr: number | null; flag: string; flagReason: string | null }>;
  adjustedTargets: KpiTarget[];
  recentAvg?: Record<string, number | null>;
  coverage: { trainingDays: number; matchDays: number; distinctDates: number; playersWithHistory: number; totalPlayers: number; windowDays: number };
  recentLean: { mechIdx: number | null; locoIdx: number | null; lean: string | null; note: string | null };
};

const LABEL: Record<string, string> = {
  totalDistance: "Total distance (m)", playerLoad: "Player Load", hsr: "High-speed distance (m)",
  sprint: "Sprint distance (m)", accel: "Accelerations (B2-3)", decel: "Decelerations (B2-3)", ima: "IMA high-intensity (m)",
};
const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingHorizontal: 28, paddingBottom: 44, fontSize: 10, color: "#221f18", fontFamily: "Helvetica" },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 6, borderBottom: "2 solid #4F46E5" },
  brand: { fontSize: 12, fontWeight: 700, color: "#4F46E5", letterSpacing: 0.5 },
  brandMeta: { fontSize: 8, color: "#a9a493" },
  bottomLine: { borderLeft: "4 solid #4F46E5", backgroundColor: "#EEF2FF", paddingVertical: 6, paddingHorizontal: 8, marginBottom: 10, fontSize: 11, fontWeight: 700, color: "#1E1B4B" },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", borderTop: "1 solid #e6e1d4", paddingTop: 6, fontSize: 7.5, color: "#a9a493" },
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 2 },
  sub: { fontSize: 10, color: "#8b8676", marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #e6e1d4", marginTop: 10 },
  row: { flexDirection: "row" },
  tHead: { flexDirection: "row", backgroundColor: "#efece2" },
  tRow: { flexDirection: "row", borderTop: "1 solid #e6e1d4" },
  tRowAlt: { flexDirection: "row", borderTop: "1 solid #e6e1d4", backgroundColor: "#f7f5ef" },
  para: { fontSize: 9.5, color: "#565044", lineHeight: 1.5, marginBottom: 4 },
  badge: { fontSize: 10, fontWeight: 700, color: "#1E3A8A" },
});

type AttentionPlayer = { player_id: string; name: string; color: string; score: number | null; acwr: number | null; reason: string | null; drivers?: string[] };
type ReadinessSummary = { green: number; yellow: number; red: number; checkedIn: number; rosterWithGps: number };

export async function downloadLoadPlanPdf(
  plan: LoadPlanForPdf,
  topAttention: AttentionPlayer[] = [],
  readiness: ReadinessSummary | null = null,
  restDay = false,
) {
  const p = plan.planned;
  // Capability-aware value columns: only the KPIs the club actually captures.
  // Core/Lite send the combined "efforts"; Pro sends the accel/decel split + IMA
  // distance; an indoor (basketball) team has no GPS at all and sends the IMA
  // counts (accel/decel/CoD/jumps). Drives both the header and the per-player rows
  // so no team gets empty columns.
  const PDF_COL_LABEL: Record<string, string> = {
    totalDistance: "Dist (m)", hsr: "HSR VB5", sprint: "Sprint VB6", playerLoad: "P.Load",
    accel: "Acc B2-3", decel: "Dec B2-3", efforts: "Efforts", ima: "IMA COD",
    imaAccel: "IMA Acc", imaDecel: "IMA Dec", imaCod: "CoD", jumps: "Jumps",
  };
  const PDF_COL_ORDER = ["totalDistance", "hsr", "sprint", "playerLoad", "accel", "decel", "efforts", "ima", "imaAccel", "imaDecel", "imaCod", "jumps"];
  const availSet = new Set(plan.availableKpis ?? PDF_COL_ORDER);
  const valueKeys = PDF_COL_ORDER.filter((k) => availSet.has(k));
  // Fixed widths: Player 22%, ACWR 8%, Flag 10% → the rest split across value cols.
  const NAME_W = 22, ACWR_W = 8, FLAG_W = 10;
  const colW = `${((100 - NAME_W - ACWR_W - FLAG_W) / Math.max(1, valueKeys.length)).toFixed(2)}%`;
  const legendBits: string[] = [];
  if (availSet.has("hsr")) legendBits.push("HSR VB5 = high-speed running (velocity band 5)");
  if (availSet.has("sprint")) legendBits.push("Sprint VB6 = sprint distance (band 6)");
  if (availSet.has("efforts")) legendBits.push("Efforts = combined high-intensity accel + decel count (Core/Lite pods)");
  else if (availSet.has("accel")) legendBits.push("Acc/Dec B2-3 = high-intensity accel/decel (effort bands 2-3); IMA COD = change-of-direction distance");
  if (availSet.has("imaAccel")) legendBits.push("IMA Acc/Dec = explosive accel/decel counts; CoD = change-of-direction events; Jumps = take-offs/landings (McBurnie 2022)");
  const moveLegend = legendBits.length ? `${legendBits.join("; ")}.` : "";
  // The SAME explainability paragraphs / bottom line the on-screen card renders.
  const narrative = buildLoadPlanNarrative(plan, readiness?.checkedIn ?? null);
  const bottomLine = buildLoadPlanBottomLine(plan, readiness?.red ?? null);
  const generatedAt = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const blob = await pdf(
    <Document>
      <Page size="A4" style={s.page}>
        {/* Brand header */}
        <View style={s.brandRow} fixed>
          <Text style={s.brand}>MicroPulse</Text>
          <Text style={s.brandMeta}>Pre-Session Report</Text>
        </View>

        <Text style={s.h1}>Today&apos;s Load Target</Text>
        <Text style={s.sub}>
          {(plan.teamName ?? "Team")} · {plan.sessionDate}
          {restDay ? " · REST DAY (no training load planned)" : p.applicable ? ` · ${p.mdLabel ?? "training day"} · ${p.loadType.toUpperCase()} · ${p.matchPct}% of match` : " · recent-load baseline (no match-week set)"}
        </Text>

        {restDay ? (
          <View style={{ borderLeft: "4 solid #8b8676", backgroundColor: "#efece2", paddingVertical: 6, paddingHorizontal: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#221f18", marginBottom: 2 }}>Rest day — no training load planned.</Text>
            <Text style={[s.para, { marginBottom: 0 }]}>Marked as a rest day, so no load targets are prescribed. Use today for recovery; the readiness check-ins below still flag anyone to keep an eye on.</Text>
          </View>
        ) : plan.hasTargets ? <Text style={s.bottomLine}>{bottomLine}</Text> : null}

        {/* Footer — generated stamp + page numbers, on every page */}
        <View style={s.footer} fixed>
          <Text>MicroPulse · {plan.teamName ?? "Team"} · generated {generatedAt}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>

        {(readiness || topAttention.length > 0) && (
          <>
            <Text style={s.sectionTitle}>
              Top attention today{readiness ? ` — ${readiness.checkedIn} checked in (${readiness.green} green, ${readiness.yellow} yellow, ${readiness.red} red)` : ""}
            </Text>
            {topAttention.length === 0 ? (
              <Text style={s.para}>No flagged check-ins — squad is broadly green.</Text>
            ) : (
              topAttention.slice(0, 20).map((a) => (
                <View key={a.player_id} style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: 700, color: a.color === "red" ? "#8c3221" : "#7c5210" }}>
                    {a.name}  ·  {a.color.toUpperCase()}{a.score != null ? `  ·  readiness ${a.score}/25` : ""}
                  </Text>
                  {a.drivers && a.drivers.length > 0 ? (
                    a.drivers.map((d, i) => (
                      <Text key={i} style={{ fontSize: 9, color: "#565044", marginLeft: 10, lineHeight: 1.35 }}>— {d}</Text>
                    ))
                  ) : (
                    <Text style={{ fontSize: 9, color: "#565044", marginLeft: 10 }}>{a.reason ?? ""}</Text>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {restDay ? null : !(plan.hasTargets ?? p.applicable) ? (
          <Text style={s.para}>{p.rationaleEN}</Text>
        ) : (
          <>
            {plan.mode === "recent_baseline" && plan.baselineNote ? (
              <Text style={[s.para, { color: "#075985" }]}>{plan.baselineNote}</Text>
            ) : null}
            <Text style={s.sectionTitle}>Per-player targets{plan.mode === "recent_baseline" ? " (recent-load baseline)" : " (anchored to match demand)"}</Text>
            <View>
              <View style={s.tHead}>
                <Text style={{ width: "46%", padding: 4, fontWeight: 700 }}>Metric</Text>
                <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>Target / player</Text>
                <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>% of match (ref)</Text>
              </View>
              {plan.targets.map((t, i) => (
                <View key={t.kpi} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                  <Text style={{ width: "46%", padding: 4 }}>{LABEL[t.kpi] ?? t.kpi}</Text>
                  <Text style={{ width: "27%", padding: 4, textAlign: "right", fontWeight: 700 }}>{fmt(t.target)}</Text>
                  <Text style={{ width: "27%", padding: 4, textAlign: "right" }}>{t.pctOfMatch != null ? `${t.pctOfMatch}% (${fmt(t.matchRef)})` : "—"}</Text>
                </View>
              ))}
            </View>

            {/* Chip line — mirrors the on-screen card's status line. */}
            <Text style={[s.para, { marginTop: 8 }]}>
              <Text style={{ fontWeight: 700 }}>Session {plan.mode === "recent_baseline" ? "emphasis" : "type"}: {plan.mode === "recent_baseline" ? "mixed" : p.loadType}</Text>
              {plan.mode === "recent_baseline" && plan.recentLean?.lean ? ` · recent squad lean: ${plan.recentLean.lean}` : ""}
              {plan.mode !== "recent_baseline" ? ` · band ${p.band} · sRPE ${p.sessionLoad} AU (RPE ${p.rpe} × ${p.durationMin} min)` : ""}
              {plan.mode === "recent_baseline" && plan.targetSrpe != null ? ` · target sRPE ${plan.targetSrpe} AU (RPE ~${plan.targetRpe} × ${plan.targetDurationMin} min)` : ""}
              {plan.teamAcwr != null ? ` · Team ACWR ${plan.teamAcwr.toFixed(2)}` : ""}
              {plan.readinessAdjustPct !== 0 ? ` · Readiness suggests ${plan.readinessAdjustPct}%` : ""}
            </Text>

            {/* Readiness-adjusted prescription callout — mirrors the on-screen amber box. */}
            {plan.readinessAdjustPct !== 0 && plan.adjustedTargets?.length ? (
              <View style={{ borderLeft: "3 solid #cb8420", paddingLeft: 8, marginTop: 2, marginBottom: 2 }}>
                <Text style={[s.para, { color: "#7c5210" }]}>
                  After the {plan.readinessAdjustPct}% readiness trim — prescribe today: {plan.adjustedTargets.filter((t) => t.target != null).map((t) => `${LABEL[t.kpi] ?? t.kpi} ${fmt(t.target)}`).join(" · ")}.
                </Text>
              </View>
            ) : null}

            {/* Explainability — the SAME paragraphs shown on the page. */}
            <View style={{ marginTop: 4 }}>
              {narrative.map((para, i) => <Text key={i} style={[s.para, { marginBottom: 3 }]}>{para}</Text>)}
            </View>

            {/* Leading in — last sessions before today */}
            {plan.recentSessions.length > 0 ? (
              <>
                <Text style={s.sectionTitle}>Leading in — last {plan.recentSessions.length} session{plan.recentSessions.length === 1 ? "" : "s"} (per player)</Text>
                <View>
                  <View style={s.tHead}>
                    <Text style={{ width: "28%", padding: 4, fontWeight: 700 }}>Date</Text>
                    <Text style={{ width: "24%", padding: 4, textAlign: "right", fontWeight: 700 }}>Player Load</Text>
                    <Text style={{ width: "24%", padding: 4, textAlign: "right", fontWeight: 700 }}>Distance (m)</Text>
                    <Text style={{ width: "24%", padding: 4, textAlign: "right", fontWeight: 700 }}>HSR (m)</Text>
                  </View>
                  {plan.recentSessions.map((rs, i) => (
                    <View key={rs.date} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                      <Text style={{ width: "28%", padding: 4 }}>{rs.date}{rs.isPeak ? "  · peak/match" : ""}</Text>
                      <Text style={{ width: "24%", padding: 4, textAlign: "right", fontWeight: 700 }}>{fmt(rs.playerLoad)}</Text>
                      <Text style={{ width: "24%", padding: 4, textAlign: "right" }}>{fmt(rs.totalDistance)}</Text>
                      <Text style={{ width: "24%", padding: 4, textAlign: "right" }}>{fmt(rs.hsr)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 4, lineHeight: 1.4 }}>
                  Per-player team means on the squad&apos;s last training days before this session (oldest first). &quot;Peak/match&quot; marks a highest-load (≈ match) day. This is the trajectory today&apos;s target sits on top of.
                </Text>
              </>
            ) : null}

            {plan.recentAvg ? (
              <>
                <Text style={s.sectionTitle}>Every metric — target vs match demand vs recent average</Text>
                <View>
                  <View style={s.tHead}>
                    <Text style={{ width: "40%", padding: 4, fontWeight: 700 }}>Metric</Text>
                    <Text style={{ width: "20%", padding: 4, textAlign: "right", fontWeight: 700 }}>Target</Text>
                    <Text style={{ width: "13%", padding: 4, textAlign: "right", fontWeight: 700 }}>% match</Text>
                    <Text style={{ width: "13%", padding: 4, textAlign: "right", fontWeight: 700 }}>Match ref</Text>
                    <Text style={{ width: "14%", padding: 4, textAlign: "right", fontWeight: 700 }}>Recent avg</Text>
                  </View>
                  {plan.targets.map((t, i) => (
                    <View key={t.kpi} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
                      <Text style={{ width: "40%", padding: 4 }}>{LABEL[t.kpi] ?? t.kpi}</Text>
                      <Text style={{ width: "20%", padding: 4, textAlign: "right", fontWeight: 700 }}>{fmt(t.target)}</Text>
                      <Text style={{ width: "13%", padding: 4, textAlign: "right" }}>{t.pctOfMatch != null ? `${t.pctOfMatch}%` : "—"}</Text>
                      <Text style={{ width: "13%", padding: 4, textAlign: "right" }}>{fmt(t.matchRef)}</Text>
                      <Text style={{ width: "14%", padding: 4, textAlign: "right" }}>{fmt(plan.recentAvg?.[t.kpi] ?? null)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={s.sectionTitle}>Per-player targets — every metric</Text>
            <View>
              <View style={[s.tHead, { fontSize: 7 }]}>
                <Text style={{ width: `${NAME_W}%`, padding: 3, fontWeight: 700 }}>Player</Text>
                {valueKeys.map((k) => <Text key={k} style={{ width: colW, padding: 3, textAlign: "right", fontWeight: 700 }}>{PDF_COL_LABEL[k]}</Text>)}
                <Text style={{ width: `${ACWR_W}%`, padding: 3, textAlign: "right", fontWeight: 700 }}>ACWR</Text>
                <Text style={{ width: `${FLAG_W}%`, padding: 3, fontWeight: 700 }}>Flag</Text>
              </View>
              {plan.perPlayer.map((pp, i) => {
                const v = pp as unknown as Record<string, number | null>;
                return (
                <View key={pp.name + i} style={[i % 2 === 0 ? s.tRow : s.tRowAlt, { fontSize: 7 }]}>
                  <Text style={{ width: `${NAME_W}%`, padding: 3 }}>{pp.name}</Text>
                  {valueKeys.map((k) => <Text key={k} style={{ width: colW, padding: 3, textAlign: "right" }}>{fmt(v[k])}</Text>)}
                  <Text style={[{ width: `${ACWR_W}%`, padding: 3, textAlign: "right" }, pp.acwr != null && pp.acwr >= 1.3 ? { color: "#a83e28", fontWeight: 700 } : pp.acwr != null && pp.acwr < 0.8 ? { color: "#b0700f" } : {}]}>{pp.acwr != null ? pp.acwr.toFixed(2) : "—"}</Text>
                  <Text style={{ width: `${FLAG_W}%`, padding: 3 }}>{pp.flag === "reduce" ? "reduce" : pp.flag === "build" ? "build" : "—"}</Text>
                </View>
                );
              })}
            </View>

            <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 8, lineHeight: 1.4 }}>
              {moveLegend ? `${moveLegend} ` : ""}Targets = match reference × {p.matchPct}% (the microcycle day&apos;s share of match demand) re-weighted by session type. Match reference = the squad&apos;s average on its {plan.matchDaysUsed} highest-load days over the last ~17 weeks. ACWR = acute(7d) ÷ chronic(28d) Player Load; 0.8–1.3 ≈ a load change within the familiar range — a spike-size context for scaling, not an injury predictor (Gabbett 2016; not validated for injury risk — Impellizzeri 2020).
            </Text>
          </>
        )}
      </Page>
    </Document>,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `load-target-${plan.sessionDate}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
