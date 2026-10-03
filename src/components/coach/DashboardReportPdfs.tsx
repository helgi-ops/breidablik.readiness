/**
 * Dashboard PDF reports (readiness-risk + post-training) — extracted from DevCoachDashboardClient so the
 * heavy @react-pdf/renderer engine is NOT in the coach landing's First Load JS. Imported LAZILY (dynamic
 * import) from the download handlers. Self-contained: shared consts/types come from their libs, the
 * data-shape types are type-only imports from the dashboard, and the small formatters are local copies.
 */
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { ImaPlayerDay } from "@/lib/micropulse/imaDayProfile";
import { PVA_KPIS, PVA_LABEL, type PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import type {
  ReadinessRiskReportData,
  ReadinessRiskReportPlayer,
  PostTrainingReportData,
  PostTrainingReportPlayer,
} from "@/app/coach/dev-coach-dashboard/DevCoachDashboardClient";

// Small formatters (local copies — kept tiny and dependency-free so this module stays self-contained).
function scoreFmt(x: number | null) { return x == null ? "—" : String(x); }
function numFmt(x: number | null, digits = 2) { return x == null ? "—" : x.toFixed(digits); }
function confidenceFmt(x: number | null) { if (x == null) return "—"; return x <= 1 ? `${Math.round(x * 100)}%` : `${Math.round(x)}%`; }
function acwrFmt(x: number | null) { return x == null ? "—" : x.toFixed(2); }

const reportStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#221f18", fontFamily: "Helvetica" },
  header: { marginBottom: 14, paddingBottom: 10, borderBottom: "2 solid #e6e1d4" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  headerMeta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  headerMetaText: { fontSize: 10, color: "#6d6858" },
  muted: { color: "#8b8676", fontSize: 9 },
  // Player card
  playerCard: { marginBottom: 14, border: "1 solid #d5cfbe", borderRadius: 6, overflow: "hidden" },
  playerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "8 10", backgroundColor: "#f7f5ef" },
  playerName: { fontSize: 13, fontWeight: 700 },
  badgeYellow: { fontSize: 11, fontWeight: 700, color: "#7c5210", backgroundColor: "#f3e0b4", padding: "2 8", borderRadius: 4 },
  badgeRed: { fontSize: 11, fontWeight: 700, color: "#72291c", backgroundColor: "#f1d3c8", padding: "2 8", borderRadius: 4 },
  // Coach action box
  actionBoxRecovery: { backgroundColor: "#f1d3c8", padding: "8 10", borderBottom: "1 solid #e6b6a6" },
  actionBoxModified: { backgroundColor: "#f3e0b4", padding: "8 10", borderBottom: "1 solid #e9c983" },
  actionBoxFull: { backgroundColor: "#d3e8da", padding: "8 10", borderBottom: "1 solid #b0d6bd" },
  actionLabel: { fontSize: 9, fontWeight: 700, color: "#8b8676", marginBottom: 2, textTransform: "uppercase" },
  actionTextRecovery: { fontSize: 12, fontWeight: 700, color: "#72291c" },
  actionTextModified: { fontSize: 12, fontWeight: 700, color: "#7c5210" },
  actionTextFull: { fontSize: 12, fontWeight: 700, color: "#145233" },
  actionNote: { fontSize: 9, color: "#6d6858", marginTop: 2 },
  // Body sections
  cardBody: { padding: "8 10" },
  sectionLabel: { fontSize: 9, fontWeight: 700, color: "#8b8676", textTransform: "uppercase", marginBottom: 4, marginTop: 6 },
  reasonItem: { fontSize: 10, color: "#3a352c", marginBottom: 3, paddingLeft: 8 },
  // Injury risk
  injuryRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  injuryLabelLow: { fontSize: 10, fontWeight: 700, color: "#145233", backgroundColor: "#d3e8da", padding: "1 6", borderRadius: 3 },
  injuryLabelModerate: { fontSize: 10, fontWeight: 700, color: "#7c5210", backgroundColor: "#f3e0b4", padding: "1 6", borderRadius: 3 },
  injuryLabelHigh: { fontSize: 10, fontWeight: 700, color: "#72291c", backgroundColor: "#f1d3c8", padding: "1 6", borderRadius: 3 },
  injuryRec: { fontSize: 9, color: "#565044", marginBottom: 2, paddingLeft: 8 },
  // Reference table
  refTableWrap: { marginTop: 8, borderTop: "1 solid #e6e1d4", paddingTop: 6 },
  refTableLabel: { fontSize: 8, color: "#a9a493", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 },
  table: { border: "1 solid #e6e1d4", borderRadius: 3 },
  tHead: { flexDirection: "row", backgroundColor: "#efece2" },
  tRow: { flexDirection: "row", borderTop: "1 solid #e6e1d4" },
  cellH: { flex: 1, padding: "3 4", fontSize: 8, fontWeight: 700, color: "#8b8676" },
  cell: { flex: 1, padding: "3 4", fontSize: 8, color: "#565044" },
  // Footer
  footerBar: { marginTop: 12, paddingTop: 8, borderTop: "1 solid #e6e1d4", flexDirection: "row", justifyContent: "space-between" },
  footerCount: { fontSize: 10 },
  footerGreen: { color: "#145233", fontWeight: 700 },
  footerYellow: { color: "#7c5210", fontWeight: 700 },
  footerRed: { color: "#72291c", fontWeight: 700 },
});

function coachAction(mode: "full" | "modified" | "recovery"): { boxStyle: any; textStyle: any; title: string; note: string } {
  if (mode === "recovery") return {
    boxStyle: reportStyles.actionBoxRecovery,
    textStyle: reportStyles.actionTextRecovery,
    title: "RECOVERY — Do not train today",
    note: "Athlete's body is under significant stress. Rest or light recovery work only.",
  };
  if (mode === "modified") return {
    boxStyle: reportStyles.actionBoxModified,
    textStyle: reportStyles.actionTextModified,
    title: "REDUCE LOAD — Modified session",
    note: "Reduce intensity or volume. Monitor closely during training.",
  };
  return {
    boxStyle: reportStyles.actionBoxFull,
    textStyle: reportStyles.actionTextFull,
    title: "FULL PARTICIPATION — Monitor closely",
    note: "Can train normally. Flag is precautionary — keep an eye on this player.",
  };
}

function injuryBadgeStyle(level: "LOW" | "MODERATE" | "HIGH") {
  if (level === "HIGH") return reportStyles.injuryLabelHigh;
  if (level === "MODERATE") return reportStyles.injuryLabelModerate;
  return reportStyles.injuryLabelLow;
}

function ReadinessRiskReportDocument({ data }: { data: ReadinessRiskReportData }) {
  const playersPerPage = 2;
  const flaggedPages: ReadinessRiskReportPlayer[][] = [];
  for (let i = 0; i < data.flaggedPlayers.length; i += playersPerPage) {
    flaggedPages.push(data.flaggedPlayers.slice(i, i + playersPerPage));
  }
  if (flaggedPages.length === 0) flaggedPages.push([]);

  return (
    <Document>
      {flaggedPages.map((pagePlayers, pageIdx) => (
        <Page key={`risk-report-page-${pageIdx}`} size="A4" style={reportStyles.page}>
          {/* Header — only on first page */}
          {pageIdx === 0 && (
            <View style={reportStyles.header}>
              <Text style={reportStyles.h1}>Daily Readiness Report</Text>
              <View style={reportStyles.headerMeta}>
                <Text style={reportStyles.headerMetaText}>{data.teamName || "—"}</Text>
                <Text style={reportStyles.headerMetaText}>{data.date}</Text>
              </View>
              <Text style={reportStyles.muted}>
                Players requiring attention: {data.flaggedPlayers.length} of {data.summary.green + data.summary.yellow + data.summary.red}
              </Text>
            </View>
          )}

          {/* Player cards */}
          {pagePlayers.length ? (
            pagePlayers.map((p, i) => {
              const action = coachAction(p.ateSessionMode);
              const reasons = p.why.length ? p.why : ["No specific reasons available."];
              const injRecs = p.injuryRecommendation.length ? p.injuryRecommendation : ["Continue with planned load and routine monitoring."];
              return (
                <View key={`${p.name}-${pageIdx}-${i}`} style={reportStyles.playerCard}>
                  {/* Player name + status */}
                  <View style={reportStyles.playerHeader}>
                    <Text style={reportStyles.playerName}>{p.name}</Text>
                    <Text style={p.readinessStatus === "RED" ? reportStyles.badgeRed : reportStyles.badgeYellow}>
                      {p.readinessStatus === "RED" ? "🔴 RED" : "🟡 YELLOW"}
                    </Text>
                  </View>

                  {/* Coach action — prominent */}
                  <View style={action.boxStyle}>
                    <Text style={reportStyles.actionLabel}>Today&apos;s recommendation</Text>
                    <Text style={action.textStyle}>{action.title}</Text>
                    <Text style={reportStyles.actionNote}>{action.note}</Text>
                  </View>

                  {/* Reasons */}
                  <View style={reportStyles.cardBody}>
                    <Text style={reportStyles.sectionLabel}>Why this player is flagged</Text>
                    {reasons.map((r, idx) => (
                      <Text key={`${p.name}-reason-${idx}`} style={reportStyles.reasonItem}>• {r}</Text>
                    ))}

                    {/* Injury risk */}
                    <Text style={reportStyles.sectionLabel}>Injury risk</Text>
                    <View style={reportStyles.injuryRow}>
                      <Text style={injuryBadgeStyle(p.injuryRiskLevel)}>{p.injuryRiskLevel}</Text>
                    </View>
                    {injRecs.map((r, idx) => (
                      <Text key={`${p.name}-injrec-${idx}`} style={reportStyles.injuryRec}>• {r}</Text>
                    ))}

                    {/* Reference numbers — compact, for staff use */}
                    <View style={reportStyles.refTableWrap}>
                      <Text style={reportStyles.refTableLabel}>Reference data</Text>
                      <View style={reportStyles.table}>
                        <View style={reportStyles.tHead}>
                          <Text style={reportStyles.cellH}>Wellness score</Text>
                          <Text style={reportStyles.cellH}>Sleep (1–5)</Text>
                          <Text style={reportStyles.cellH}>Load ratio</Text>
                          <Text style={reportStyles.cellH}>HRV</Text>
                          <Text style={reportStyles.cellH}>Load index</Text>
                          <Text style={reportStyles.cellH}>vs. baseline</Text>
                        </View>
                        <View style={reportStyles.tRow}>
                          <Text style={reportStyles.cell}>{scoreFmt(p.checkInScore)}</Text>
                          <Text style={reportStyles.cell}>{p.sleepScore != null ? `${p.sleepScore}/5` : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.acwr != null ? numFmt(p.acwr) : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.hrv != null ? numFmt(p.hrv) : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.zScore != null ? numFmt(p.zScore) : "—"}</Text>
                          <Text style={reportStyles.cell}>{p.deltaZ != null ? numFmt(p.deltaZ) : "—"}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={reportStyles.muted}>No players requiring attention today.</Text>
          )}

          {/* Footer summary — last page only */}
          {pageIdx === flaggedPages.length - 1 && (
            <View style={reportStyles.footerBar}>
              <Text style={reportStyles.footerCount}>
                Team status:{"  "}
                <Text style={reportStyles.footerGreen}>● {data.summary.green} ready</Text>
                {"   "}
                <Text style={reportStyles.footerYellow}>● {data.summary.yellow} monitor</Text>
                {"   "}
                <Text style={reportStyles.footerRed}>● {data.summary.red} at risk</Text>
              </Text>
              <Text style={reportStyles.muted}>Page {pageIdx + 1} / {flaggedPages.length}</Text>
            </View>
          )}
        </Page>
      ))}
    </Document>
  );
}

// ── Post-Training GPS Report PDF ──────────────────────────────
const postStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#221f18", fontFamily: "Helvetica" },
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#8b8676", marginBottom: 14 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #e6e1d4" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  summaryBox: { flex: 1, border: "1 solid #e6e1d4", borderRadius: 4, padding: 6, alignItems: "center" },
  summaryVal: { fontSize: 13, fontWeight: 700 },
  summaryLabel: { fontSize: 8, color: "#8b8676", marginTop: 2 },
  table: { border: "1 solid #d5cfbe", borderRadius: 4, overflow: "hidden" },
  tHead: { flexDirection: "row", backgroundColor: "#efece2" },
  tRow: { flexDirection: "row", borderTop: "1 solid #e6e1d4" },
  tRowAlt: { flexDirection: "row", borderTop: "1 solid #e6e1d4", backgroundColor: "#f7f5ef" },
  colName: { width: "18%", padding: 4, fontSize: 9 },
  colPos: { width: "8%", padding: 4, fontSize: 9, color: "#8b8676" },
  colFlag: { width: "8%", padding: 4, fontSize: 9, textAlign: "center" },
  colMetric: { width: "9%", padding: 4, fontSize: 9, textAlign: "right" },
  colPct: { width: "7%", padding: 4, fontSize: 9, textAlign: "right" },
  colAttn: { width: "9%", padding: 4, fontSize: 9, textAlign: "center" },
  // RPE-specific table columns
  colRpeName: { width: "19%", padding: 4, fontSize: 9 },
  colRpePos: { width: "7%", padding: 4, fontSize: 9, color: "#8b8676" },
  colRpeScore: { width: "9%", padding: 4, fontSize: 9, textAlign: "center" },
  colRpeDesc: { width: "12%", padding: 4, fontSize: 9 },
  colRpeDur: { width: "11%", padding: 4, fontSize: 9, textAlign: "right" },
  colRpeLoad: { width: "12%", padding: 4, fontSize: 9, textAlign: "right" },
  colRpeBand: { width: "18%", padding: 4, fontSize: 9 },
  hdr: { fontWeight: 700 },
  attnAlert: { color: "#a83e28", fontWeight: 700 },
  attnMonitor: { color: "#b0700f", fontWeight: 700 },
  attnOk: { color: "#1c7a4a" },
  flagRed: { color: "#a83e28", fontWeight: 700 },
  flagYellow: { color: "#b0700f", fontWeight: 700 },
  flagGreen: { color: "#1c7a4a" },
  alertBox: { marginBottom: 6, padding: 6, border: "1 solid #d68e77", borderRadius: 4, backgroundColor: "#f8e9e3" },
  alertName: { fontWeight: 700, marginBottom: 2 },
  alertLine: { color: "#5c2318", fontSize: 9 },
  monitorBox: { marginBottom: 6, padding: 6, border: "1 solid #e9c983", borderRadius: 4, backgroundColor: "#faf1de" },
  monitorName: { fontWeight: 700, marginBottom: 2 },
  monitorLine: { color: "#66450f", fontSize: 9 },
});

function numFmt2(v: number | null, digits = 0): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function pctFmt(v: number | null): string {
  if (v == null) return "—";
  const s = Math.round(v);
  return (s >= 0 ? "+" : "") + s + "%";
}

function rpeInterpretation(avgRpe: number | null, submittedCount: number, totalPlayers: number): string {
  if (avgRpe == null || submittedCount === 0) {
    return `Engir leikmenn hafa skilað inn RPE fyrir þessa æfingu (${submittedCount}/${totalPlayers}). Ekki er hægt að meta innri álag liðsins.`;
  }
  const score = avgRpe.toFixed(1);
  const sub = `${submittedCount}/${totalPlayers} leikmenn skildu inn`;
  if (avgRpe <= 2) {
    return `Upplifun liðsins á æfingunni var mjög létt (meðal RPE ${score}). Æfingin lítur út sem hlýjunar- eða endurhæfingarþáttur með lítið sem ekkert líkamlegt álag. (${sub})`;
  }
  if (avgRpe <= 4) {
    return `Upplifun liðsins á æfingunni var létt (meðal RPE ${score}). Liðið var vel á sig komið og þoldi æfinguna vel án mikillar fyrirhafnar. (${sub})`;
  }
  if (avgRpe <= 6) {
    return `Upplifun liðsins á æfingunni var í meðallagi (meðal RPE ${score}). Líkamlegt álag var hóflegt — góð jafnvægisæfing milli álags og hvíldar. (${sub})`;
  }
  if (avgRpe <= 7.9) {
    return `Upplifun liðsins á æfingunni var erfið (meðal RPE ${score}). Líkamlegt álag var hátt. Mikilvægt er að tryggja góða hvíld og næringaruppbót fyrir næstu æfingu. (${sub})`;
  }
  if (avgRpe <= 8.9) {
    return `Upplifun liðsins á æfingunni var mjög erfið (meðal RPE ${score}). Álagið var mjög hátt. Nauðsynlegt er að gefa liðinu tíma til að jafna sig og fylgjast vel með ástandi leikmanna næstu daga. (${sub})`;
  }
  return `Upplifun liðsins á æfingunni var á hámarki (meðal RPE ${score}). Þetta er mesta mögulega álag sem leikmenn upplifðu. Hvíld og endurhæfing eru sérstaklega mikilvægar næstu 48 klst. (${sub})`;
}

function rpeScoreLabel(rpe: number | null): string {
  if (rpe == null) return "—";
  if (rpe <= 2) return "Very easy";
  if (rpe <= 4) return "Easy";
  if (rpe <= 6) return "Moderate";
  if (rpe <= 8) return "Hard";
  if (rpe <= 9) return "Very hard";
  return "Maximal";
}

function rpeLoadBand(sessionLoad: number | null): string {
  if (sessionLoad == null) return "—";
  if (sessionLoad < 200) return "Very light  (<200)";
  if (sessionLoad < 400) return "Light  (200–399)";
  if (sessionLoad < 600) return "Moderate  (400–599)";
  if (sessionLoad < 800) return "Hard  (600–799)";
  return "Very hard  (≥800)";
}

function PostTrainingReportDocument({ data }: { data: PostTrainingReportData }) {
  const PLAYERS_PER_PAGE = 30;

  // GPS page only shows players who actually have GPS data
  const gpsPlayers = data.players.filter((p) => p.totalDistance != null);
  const pages: PostTrainingReportPlayer[][] = [];
  for (let i = 0; i < gpsPlayers.length; i += PLAYERS_PER_PAGE) {
    pages.push(gpsPlayers.slice(i, i + PLAYERS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const alerts = data.players.filter((p) => p.attentionFlag === "ALERT");
  const monitors = data.players.filter((p) => p.attentionFlag === "MONITOR");

  // RPE table: all players who submitted RPE, sorted highest first
  const rpeTablePlayers = data.players.filter((p) => p.rpeSubmitted).sort((a, b) => (b.rpe ?? -1) - (a.rpe ?? -1));
  const interpretText = rpeInterpretation(data.rpeTeamAvg, data.rpeSubmissionCount, data.players.length);

  // IMA / stride page — sorted by sprint-strides desc, paginated like GPS
  const ima = data.ima;
  const imaPlayers: ImaPlayerDay[] = ima
    ? [...ima.per_player].filter((p) => p.total_strides > 0).sort((a, b) => b.sprint_strides - a.sprint_strides)
    : [];
  const imaPages: ImaPlayerDay[][] = [];
  for (let i = 0; i < imaPlayers.length; i += PLAYERS_PER_PAGE) {
    imaPages.push(imaPlayers.slice(i, i + PLAYERS_PER_PAGE));
  }

  // Load explainability — verdict, colour and an interpretation paragraph.
  const ls = data.loadSummary;
  const plPct = ls.pl.pctAvg;
  const recentColor =
    plPct == null ? "#8b8676"
      : plPct <= 110 ? "#1c7a4a"
      : plPct <= 140 ? "#b0700f"
      : "#a83e28";
  const recentBand =
    plPct == null ? null
      : plPct <= 90 ? "below the recent norm"
      : plPct <= 110 ? "in line with the recent norm"
      : plPct <= 140 ? "moderately above the recent norm"
      : "well above the recent norm";
  const loadVerdict =
    plPct == null
      ? "No GPS baseline available to compare today's load."
      : `Team Player Load today was ${plPct}% of the 4-week average (${recentBand})`
        + (ls.pl.pctMatch != null ? ` and ${ls.pl.pctMatch}% of a typical match` : "")
        + ". "
        + (ls.spikePlayers.length === 0
          ? "No player exceeded their usual load."
          : `${ls.spikePlayers.length} player${ls.spikePlayers.length === 1 ? "" : "s"} ran above their usual.`);
  // Detailed interpretation that walks through every number on the card.
  const fmtInt = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
  const loadInterpretation = (() => {
    if (plPct == null) return "";
    const parts: string[] = [];
    parts.push(
      `Player Load is the total accelerometer-derived mechanical work the squad absorbed today — the sum of every player's load. Today's team total of ${fmtInt(ls.pl.today)} is ${plPct}% of the ${fmtInt(ls.pl.avg)} the squad averages on a training day across the last 4 weeks, i.e. ${recentBand}.`,
    );
    if (ls.pl.pctMatch != null) {
      parts.push(
        `Measured against a typical match — the squad's single highest-load day in that window (≈ ${fmtInt(ls.pl.peak)}) — today reached ${ls.pl.pctMatch}% of match demand, so the session was ${ls.pl.pctMatch >= 90 ? "essentially match-level" : ls.pl.pctMatch >= 60 ? "a substantial fraction of a game" : "well below match intensity"}.`,
      );
    }
    const dParts: string[] = [];
    if (ls.dist.pctAvg != null) dParts.push(`total distance ${fmtInt(ls.dist.today)} m (${ls.dist.pctAvg}% of the 4-week average)`);
    if (ls.hsd.pctAvg != null) dParts.push(`high-speed distance ${fmtInt(ls.hsd.today)} m (${ls.hsd.pctAvg}% of average)`);
    if (dParts.length) {
      parts.push(
        `Breaking that down, the squad covered ${dParts.join(" and ")} — total distance reflects running volume while high-speed distance (the top sprint bands) reflects intensity, so you can see whether today's load came from doing more or from running faster.`,
      );
    }
    if (ls.distribution.total > 0) {
      parts.push(
        `Player-by-player against each athlete's own 4-week norm: ${ls.distribution.above} ran ≥30% above their usual, ${ls.distribution.elevated} were mildly elevated, ${ls.distribution.inLine} were in line and ${ls.distribution.below} below — so the team number ${ls.distribution.above > 0 ? "is not uniform; the spikes below are the ones carrying it" : "reflects a broadly even session"}.`,
      );
    }
    parts.push(
      plPct <= 110
        ? "Overall this was a routine day — standard recovery applies, and only the individuals flagged below need watching."
        : plPct <= 140
        ? "This is a manageable mid-week stimulus, but stack it carefully: avoid a second high day back-to-back and keep an eye on the flagged players."
        : "This is a clear team-level spike — prioritise recovery (sleep, nutrition, a lighter next session) and review the flagged players before the next hard day to avoid an acute:chronic overshoot.",
    );
    return parts.join(" ");
  })();

  // Day-summary inputs: who to watch tomorrow + return-to-training status.
  const watchTomorrow = data.players.filter((p) => p.attentionFlag === "ALERT" || p.attentionFlag === "MONITOR");
  const rttReturning = (data.rttSummary ?? []).filter((p) => p.currentlyInjured || p.started);
  const rttOver = rttReturning.filter((p) => p.thisWeek?.status === "over");

  return (
    <Document>
      {/* ══ Page 1: Internal Load — RPE ══ */}
      <Page size="A4" orientation="landscape" style={postStyles.page}>
        {/* Header */}
        <View style={postStyles.section}>
          <Text style={postStyles.h1}>Post-Training Report</Text>
          <Text style={postStyles.subtitle}>
            {data.teamName} · {data.sessionDate} · {data.mdDay} · {data.players.length} players
          </Text>
        </View>

        {/* ── Day summary — the whole day in three lines ── */}
        <View style={[postStyles.section, { backgroundColor: "#eef2ff", border: "1 solid #c7d2fe", borderRadius: 4, padding: 10 }]} wrap={false}>
          <Text style={postStyles.sectionTitle}>Day summary</Text>
          <Text style={{ fontSize: 9.5, color: "#565044", lineHeight: 1.5, marginBottom: 3 }}>
            <Text style={{ fontWeight: 700 }}>Load vs plan: </Text>
            {data.plannedVsActual && data.plannedVsActual.hasPlan ? data.plannedVsActual.summary : loadVerdict}
          </Text>
          <Text style={{ fontSize: 9.5, color: "#565044", lineHeight: 1.5, marginBottom: rttReturning.length > 0 ? 3 : 0 }}>
            <Text style={{ fontWeight: 700 }}>Watch tomorrow: </Text>
            {watchTomorrow.length === 0
              ? "no one flagged — routine recovery."
              : `${watchTomorrow.length} player${watchTomorrow.length === 1 ? "" : "s"} — ${watchTomorrow.slice(0, 8).map((p) => p.name).join(", ")}${watchTomorrow.length > 8 ? ` +${watchTomorrow.length - 8} more` : ""}.`}
          </Text>
          {rttReturning.length > 0 && (
            <Text style={{ fontSize: 9.5, color: "#565044", lineHeight: 1.5 }}>
              <Text style={{ fontWeight: 700 }}>Return-to-training: </Text>
              {`${rttReturning.length} player${rttReturning.length === 1 ? "" : "s"}`}
              {rttOver.length > 0 ? ` — ${rttOver.length} over their recommended ramp (${rttOver.map((p) => p.name).join(", ")}).` : " — all within their recommended ramp."}
            </Text>
          )}
        </View>

        {/* ── Explainability — session load overview (top of report) ── */}
        <View style={[postStyles.section, { backgroundColor: "#f7f5ef", border: "1 solid #e6e1d4", borderRadius: 4, padding: 10 }]}>
          <Text style={postStyles.sectionTitle}>Session Load — Explainability</Text>
          <Text style={{ fontSize: 11, fontWeight: 700, color: recentColor, lineHeight: 1.4, marginBottom: 4 }}>
            {loadVerdict}
          </Text>
          {loadInterpretation ? (
            <Text style={{ fontSize: 9.5, color: "#565044", lineHeight: 1.5, marginBottom: 8 }}>{loadInterpretation}</Text>
          ) : null}

          {/* Metric breakdown — today vs 4-week average vs typical match */}
          <View style={postStyles.table}>
            <View style={postStyles.tHead}>
              <Text style={[{ width: "34%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Metric</Text>
              <Text style={[{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Today</Text>
              <Text style={[{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>4-wk avg</Text>
              <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>% of avg</Text>
              <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>% of match</Text>
            </View>
            {([
              ["Team Player Load", ls.pl, 0],
              ["Total Distance (m)", ls.dist, 0],
              ["High-Speed Distance (m)", ls.hsd, 0],
            ] as Array<[string, typeof ls.pl, number]>).map(([label, m], i) => {
              const c = m.pctAvg == null ? "#221f18" : m.pctAvg <= 110 ? "#1c7a4a" : m.pctAvg <= 140 ? "#b0700f" : "#a83e28";
              return (
                <View key={label} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                  <Text style={{ width: "34%", padding: 4, fontSize: 9, fontWeight: 700 }}>{label}</Text>
                  <Text style={{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(m.today, 0)}</Text>
                  <Text style={{ width: "18%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(m.avg, 0)}</Text>
                  <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }, { color: c }]}>{m.pctAvg != null ? `${m.pctAvg}%` : "—"}</Text>
                  <Text style={{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }}>{m.pctMatch != null ? `${m.pctMatch}%` : "—"}</Text>
                </View>
              );
            })}
          </View>

          {/* Player distribution vs each player's own 4-week norm */}
          {ls.distribution.total > 0 && (
            <Text style={{ fontSize: 9, color: "#565044", marginTop: 6 }}>
              Players vs their own 4-week norm ({ls.distribution.total} with GPS):{" "}
              <Text style={{ color: "#a83e28", fontWeight: 700 }}>{ls.distribution.above} above (≥130%)</Text> ·{" "}
              <Text style={{ color: "#b0700f" }}>{ls.distribution.elevated} elevated</Text> ·{" "}
              <Text style={{ color: "#1c7a4a" }}>{ls.distribution.inLine} in line</Text> ·{" "}
              {ls.distribution.below} below
            </Text>
          )}

          {/* Spiking players (named) */}
          {ls.spikePlayers.length > 0 && (
            <Text style={{ fontSize: 9, color: "#8c3221", marginTop: 6, lineHeight: 1.4 }}>
              Spikes (above their usual): {ls.spikePlayers.slice(0, 10).map((p) => {
                const parts: string[] = [];
                if (p.plPct != null) parts.push(`+${Math.round(p.plPct)}% PL`);
                if (p.distPct != null && p.distPct >= 30) parts.push(`+${Math.round(p.distPct)}% dist`);
                if (p.acwr != null && p.acwr >= 1.5) parts.push(`ACWR ${p.acwr.toFixed(2)}`);
                return `${p.name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
              }).join(" · ")}{ls.spikePlayers.length > 10 ? ` +${ls.spikePlayers.length - 10} more` : ""}
            </Text>
          )}

          <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 6, lineHeight: 1.4 }}>
            Baselines use the team total for each metric over the prior 4 weeks (catapult/manual GPS). &quot;4-wk avg&quot; = mean of prior session days; &quot;match&quot; = the highest team-load day in the window (matches are a team&apos;s peak-load days). A player spike = Player Load ≥30% above their own 4-week average, or ACWR ≥ 1.5 (Gabbett 2016 acute:chronic ceiling).
          </Text>
        </View>

        {/* ── Planned vs Actual — did the session hit the recommendation? ── */}
        {data.plannedVsActual && data.plannedVsActual.hasPlan && (() => {
          const pva = data.plannedVsActual;
          const pvaColor = (st: PvaStatus) =>
            st === "on" ? "#1c7a4a" : st === "over" || st === "under" ? "#b0700f" : st === "well_over" || st === "well_under" ? "#a83e28" : "#a9a493";
          return (
            <View style={[postStyles.section, { backgroundColor: "#F5F3FF", border: "1 solid #DDD6FE", borderRadius: 4, padding: 10 }]} wrap={false}>
              <Text style={postStyles.sectionTitle}>Planned vs Actual — did we hit the recommendation?</Text>
              <Text style={{ fontSize: 9, color: "#4C1D95", marginBottom: 2 }}>
                Plan: {pva.mode === "microcycle" && pva.mdLabel ? `${pva.mdLabel} · ${pva.loadType} · ${pva.matchPct}% of match` : "recent-load baseline (mixed)"}
                {pva.readinessAdjustPct !== 0 ? ` · readiness-adjusted ${pva.readinessAdjustPct}%` : ""}
              </Text>
              <Text style={{ fontSize: 9.5, color: "#565044", lineHeight: 1.5, marginBottom: 8 }}>{pva.summary}</Text>

              {/* Team-level: planned vs actual per KPI */}
              <View style={postStyles.table}>
                <View style={postStyles.tHead}>
                  <Text style={[{ width: "40%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Metric (per player)</Text>
                  <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Planned</Text>
                  <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Actual</Text>
                  <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>% of plan</Text>
                </View>
                {pva.team.map((t, i) => (
                  <View key={t.kpi} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                    <Text style={{ width: "40%", padding: 4, fontSize: 9, fontWeight: 700 }}>{PVA_LABEL[t.kpi]}</Text>
                    <Text style={{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(t.planned, 0)}</Text>
                    <Text style={{ width: "20%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(t.actual, 0)}</Text>
                    <Text style={[{ width: "20%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }, { color: pvaColor(t.status) }]}>{t.pctOfPlan != null ? `${t.pctOfPlan}%` : "—"}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 5, lineHeight: 1.4 }}>
                Planned = the pre-session recommendation for this date (per player), readiness-adjusted. On plan = 85–115% (green); 116–140% or 60–84% = elevated/reduced (amber); &gt;140% or &lt;60% = well off plan (red).
              </Text>
            </View>
          );
        })()}

        {/* ── Return-to-training — how each returning player's ramp is going ── */}
        {data.rttSummary && data.rttSummary.length > 0 && (
          <View style={[postStyles.section, { backgroundColor: "#f7f5ef", border: "1 solid #e6e1d4", borderRadius: 4, padding: 10 }]} wrap={false}>
            <Text style={postStyles.sectionTitle}>Return-to-training — how the ramp is going</Text>
            <View style={postStyles.table}>
              <View style={postStyles.tHead}>
                <Text style={[{ width: "30%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Player</Text>
                <Text style={[{ width: "24%", padding: 4, fontSize: 9 }, postStyles.hdr]}>RTP stage</Text>
                <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Week load</Text>
                <Text style={[{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Recommended</Text>
                <Text style={[{ width: "16%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>vs ramp</Text>
              </View>
              {data.rttSummary.map((p, i) => {
                const stColor = p.thisWeek?.status === "over" ? "#a83e28" : p.thisWeek?.status === "under" ? "#a9a493" : "#1c7a4a";
                const vs = !p.thisWeek
                  ? (p.started ? "—" : "not started")
                  : p.thisWeek.status === "over" ? `+${p.thisWeek.deltaPct}% over`
                  : p.thisWeek.status === "under" ? `${p.thisWeek.deltaPct}%${p.thisWeek.inProgress ? " so far" : " under"}`
                  : "on plan";
                const stage = p.rtpStatus ? `${p.rtpStatus.replace(/_/g, " ")} · ${p.rtpStage ?? 0}/5` : (p.currentlyInjured ? "injured" : "returned");
                return (
                  <View key={p.playerId} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                    <Text style={{ width: "30%", padding: 4, fontSize: 9, fontWeight: 700 }}>{p.name}</Text>
                    <Text style={{ width: "24%", padding: 4, fontSize: 9 }}>{stage}</Text>
                    <Text style={{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }}>{p.thisWeek ? numFmt2(p.thisWeek.loadActual, 0) : "—"}</Text>
                    <Text style={{ width: "15%", padding: 4, fontSize: 9, textAlign: "right" }}>{p.thisWeek ? numFmt2(p.thisWeek.loadTarget, 0) : "—"}</Text>
                    <Text style={[{ width: "16%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }, { color: stColor }]}>{vs}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 5, lineHeight: 1.4 }}>
              Week load = his actual weekly player load this plan week; Recommended = the graded ramp target. Over the ramp is the signal to ease off; under is usually fine (a partial week reads &quot;so far&quot;). See each player&apos;s return-to-training page for the full plan and the evidence.
            </Text>
          </View>
        )}

        {/* Per-player: planned vs actual adherence */}
        {data.plannedVsActual && data.plannedVsActual.hasPlan && data.plannedVsActual.players.length > 0 && (() => {
          const pva = data.plannedVsActual;
          const pvaColor = (st: PvaStatus) =>
            st === "on" ? "#1c7a4a" : st === "over" || st === "under" ? "#b0700f" : st === "well_over" || st === "well_under" ? "#a83e28" : "#a9a493";
          const pctCell = (kpi: typeof PVA_KPIS[number], pp: typeof pva.players[number], w: string) => {
            const c = pp.byKpi[kpi];
            return <Text key={kpi} style={[{ width: w, padding: 3, fontSize: 8, textAlign: "right", fontWeight: 700 }, { color: pvaColor(c.status) }]}>{c.pctOfPlan != null ? `${c.pctOfPlan}%` : "—"}</Text>;
          };
          // Capability-aware columns: Core/Lite has no IMA (accel/ima) — it sends
          // the combined "efforts" instead. Show what the club actually captures.
          const SHORT: Record<string, string> = { playerLoad: "P.Load", totalDistance: "Dist", hsr: "HSR", sprint: "Sprint", accel: "Accel", ima: "IMA", efforts: "Efforts" };
          const moveKpis: Array<typeof PVA_KPIS[number]> = pva.availableKpis.includes("efforts") ? ["efforts"] : ["accel", "ima"];
          const ppCols: Array<typeof PVA_KPIS[number]> = ["playerLoad", "totalDistance", "hsr", "sprint", ...moveKpis];
          const ppColW = `${Math.round(78 / ppCols.length)}%`;
          return (
            <View style={postStyles.section}>
              <Text style={postStyles.sectionTitle}>Planned vs Actual — per player (% of plan)</Text>
              <View style={postStyles.table}>
                <View style={postStyles.tHead}>
                  <Text style={[{ width: "22%", padding: 3, fontSize: 8 }, postStyles.hdr]}>Player</Text>
                  {ppCols.map((k) => <Text key={k} style={[{ width: ppColW, padding: 3, fontSize: 8, textAlign: "right" }, postStyles.hdr]}>{SHORT[k]}</Text>)}
                </View>
                {pva.players.map((pp, i) => (
                  <View key={pp.player_id + i} style={i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt}>
                    <Text style={{ width: "22%", padding: 3, fontSize: 8, fontWeight: 700 }}>{pp.name}</Text>
                    {ppCols.map((k) => pctCell(k, pp, ppColW))}
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 5, lineHeight: 1.4 }}>
                Each cell = the player&apos;s actual for that metric as a % of their own readiness-adjusted target. Green 85–115% (on plan), amber 60–84% / 116–140%, red &lt;60% / &gt;140%. A dash means no target or no capture for that metric.
              </Text>
            </View>
          );
        })()}

        {/* RPE summary boxes */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>Innri álag — Session RPE</Text>
          <View style={postStyles.summaryRow}>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{data.rpeTeamAvg != null ? numFmt2(data.rpeTeamAvg, 1) : "—"}</Text>
              <Text style={postStyles.summaryLabel}>Meðal RPE liðsins</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{data.rpeTotalLoad != null ? numFmt2(data.rpeTotalLoad, 0) : "—"}</Text>
              <Text style={postStyles.summaryLabel}>Heildar session load</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{data.rpeSubmissionCount} / {data.players.length}</Text>
              <Text style={postStyles.summaryLabel}>Leikmenn skildu inn</Text>
            </View>
          </View>
        </View>

        {/* Interpretation text */}
        <View style={[postStyles.section, { backgroundColor: "#f7f5ef", border: "1 solid #e6e1d4", borderRadius: 4, padding: 10 }]}>
          <Text style={{ fontSize: 10, color: "#221f18", lineHeight: 1.5 }}>{interpretText}</Text>
          <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 6 }}>
            Session Load = RPE x Mínútur (AU). Flokkur: &lt;200 Very light · 200-399 Light · 400-599 Moderate · 600-799 Hard · &gt;=800 Very hard
          </Text>
        </View>

        {/* Per-player RPE table (sorted by RPE desc) */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>RPE eftir leikmann (raðað eftir RPE, hæst fyrst)</Text>
          <View style={postStyles.table}>
            <View style={postStyles.tHead}>
              <Text style={[postStyles.colRpeName, postStyles.hdr]}>Leikmaður</Text>
              <Text style={[postStyles.colRpePos, postStyles.hdr]}>Staða</Text>
              <Text style={[postStyles.colRpeScore, postStyles.hdr]}>RPE</Text>
              <Text style={[postStyles.colRpeDesc, postStyles.hdr]}>Lýsing</Text>
              <Text style={[postStyles.colRpeDur, postStyles.hdr]}>Tímalengd (mín)</Text>
              <Text style={[postStyles.colRpeLoad, postStyles.hdr]}>Session Load</Text>
              <Text style={[postStyles.colRpeBand, postStyles.hdr]}>Session Load flokkur</Text>
            </View>
            {rpeTablePlayers.map((p, i) => {
              const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
              const rpeNumStyle = p.rpe != null && p.rpe >= 9 ? postStyles.attnAlert : p.rpe != null && p.rpe >= 7 ? postStyles.attnMonitor : postStyles.attnOk;
              return (
                <View key={p.name + "-rpe"} style={rowStyle}>
                  <Text style={postStyles.colRpeName}>{p.name}</Text>
                  <Text style={postStyles.colRpePos}>{p.position}</Text>
                  <Text style={[postStyles.colRpeScore, rpeNumStyle]}>{p.rpeSubmitted ? numFmt2(p.rpe, 1) : "—"}</Text>
                  <Text style={[postStyles.colRpeDesc, rpeNumStyle]}>{p.rpeSubmitted ? rpeScoreLabel(p.rpe) : "—"}</Text>
                  <Text style={postStyles.colRpeDur}>{p.rpeSubmitted ? numFmt2(p.durationMinutes, 0) : "—"}</Text>
                  <Text style={postStyles.colRpeLoad}>{p.rpeSubmitted ? numFmt2(p.sessionLoad, 0) : "—"}</Text>
                  <Text style={postStyles.colRpeBand}>{p.rpeSubmitted ? rpeLoadBand(p.sessionLoad) : "Ekki skilað"}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Page>

      {/* ══ Page 2: External Load — GPS ══ */}
      <Page size="A4" orientation="landscape" style={postStyles.page}>
        <View style={postStyles.section}>
          <Text style={postStyles.h1}>Post-Training Report — GPS (Catapult)</Text>
          <Text style={postStyles.subtitle}>
            {data.teamName} · {data.sessionDate} · {data.mdDay} · {gpsPlayers.length} players with GPS data
          </Text>
        </View>

        {/* GPS team averages */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>Ytra álag — liðsmeðaltal</Text>
          <View style={postStyles.summaryRow}>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.totalDistance, 0)}</Text>
              <Text style={postStyles.summaryLabel}>Total Dist (m)</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.hsd, 0)}</Text>
              <Text style={postStyles.summaryLabel}>HSD (m)</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.playerLoad, 1)}</Text>
              <Text style={postStyles.summaryLabel}>Player Load</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.accelB23, 0)}</Text>
              <Text style={postStyles.summaryLabel}>Accel B2-3</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.decelB23, 0)}</Text>
              <Text style={postStyles.summaryLabel}>Decel B2-3</Text>
            </View>
            <View style={postStyles.summaryBox}>
              <Text style={postStyles.summaryVal}>{numFmt2(data.teamAvg.maxVelocity, 1)}</Text>
              <Text style={postStyles.summaryLabel}>Max Vel (m/s)</Text>
            </View>
          </View>
        </View>

        {/* Attention flags */}
        {(alerts.length > 0 || monitors.length > 0) && (
          <View style={postStyles.section}>
            <Text style={postStyles.sectionTitle}>
              Attention — {alerts.length} ALERT · {monitors.length} MONITOR
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                {alerts.map((p) => (
                  <View key={p.name + "-alert"} style={postStyles.alertBox}>
                    <Text style={postStyles.alertName}>! {p.name} ({p.position})</Text>
                    {p.attentionReason.map((line, i) => (
                      <Text key={i} style={postStyles.alertLine}>· {line}</Text>
                    ))}
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                {monitors.map((p) => (
                  <View key={p.name + "-monitor"} style={postStyles.monitorBox}>
                    <Text style={postStyles.monitorName}>~ {p.name} ({p.position})</Text>
                    {p.attentionReason.map((line, i) => (
                      <Text key={i} style={postStyles.monitorLine}>· {line}</Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Player GPS table — first GPS page */}
        <View style={postStyles.section}>
          <Text style={postStyles.sectionTitle}>GPS gögn eftir leikmann (raðað eftir heildar vegalengd)</Text>
          <View style={postStyles.table}>
            <View style={postStyles.tHead}>
              <Text style={[postStyles.colName, postStyles.hdr]}>Leikmaður</Text>
              <Text style={[postStyles.colPos, postStyles.hdr]}>Staða</Text>
              <Text style={[postStyles.colFlag, postStyles.hdr]}>Pre</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>Dist</Text>
              <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>HSD</Text>
              <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>PL</Text>
              <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>PL/min</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>Ac B2-3</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>De B2-3</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>Vmax</Text>
              <Text style={[postStyles.colMetric, postStyles.hdr]}>ACWR</Text>
              <Text style={[postStyles.colAttn, postStyles.hdr]}>Signal</Text>
            </View>
            {(pages[0] ?? []).map((p, i) => {
              const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
              const flagStyle = p.readinessFlag === "RED" ? postStyles.flagRed : p.readinessFlag === "YELLOW" ? postStyles.flagYellow : postStyles.flagGreen;
              const attnStyle = p.attentionFlag === "ALERT" ? postStyles.attnAlert : p.attentionFlag === "MONITOR" ? postStyles.attnMonitor : postStyles.attnOk;
              return (
                <View key={p.name} style={rowStyle}>
                  <Text style={postStyles.colName}>{p.name}</Text>
                  <Text style={postStyles.colPos}>{p.position}</Text>
                  <Text style={[postStyles.colFlag, flagStyle]}>{p.readinessFlag}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.totalDistance, 0)}</Text>
                  <Text style={postStyles.colPct}>{pctFmt(p.totalDistancePct)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.hsd, 0)}</Text>
                  <Text style={postStyles.colPct}>{pctFmt(p.hsdPct)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.playerLoad, 1)}</Text>
                  <Text style={postStyles.colPct}>{pctFmt(p.playerLoadPct)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.playerLoadPerMin, 2)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.accelB23, 0)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.decelB23, 0)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.maxVelocity, 1)}</Text>
                  <Text style={postStyles.colMetric}>{numFmt2(p.acwr, 2)}</Text>
                  <Text style={[postStyles.colAttn, attnStyle]}>{p.attentionFlag}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </Page>

      {/* ── GPS overflow pages if many players ── */}
      {pages.slice(1).map((pagePlayers, pgIdx) => (
        <Page key={"pt-page-" + (pgIdx + 3)} size="A4" orientation="landscape" style={postStyles.page}>
          <Text style={postStyles.h1}>Post-Training Report — GPS (cont.) · {data.sessionDate}</Text>
          <View style={[postStyles.section, { marginTop: 8 }]}>
            <View style={postStyles.table}>
              <View style={postStyles.tHead}>
                <Text style={[postStyles.colName, postStyles.hdr]}>Leikmaður</Text>
                <Text style={[postStyles.colPos, postStyles.hdr]}>Staða</Text>
                <Text style={[postStyles.colFlag, postStyles.hdr]}>Pre</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>Dist</Text>
                <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>HSD</Text>
                <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>PL</Text>
                <Text style={[postStyles.colPct, postStyles.hdr]}>%28D</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>PL/min</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>Ac B2-3</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>De B2-3</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>Vmax</Text>
                <Text style={[postStyles.colMetric, postStyles.hdr]}>ACWR</Text>
                <Text style={[postStyles.colAttn, postStyles.hdr]}>Signal</Text>
              </View>
              {pagePlayers.map((p, i) => {
                const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
                const flagStyle = p.readinessFlag === "RED" ? postStyles.flagRed : p.readinessFlag === "YELLOW" ? postStyles.flagYellow : postStyles.flagGreen;
                const attnStyle = p.attentionFlag === "ALERT" ? postStyles.attnAlert : p.attentionFlag === "MONITOR" ? postStyles.attnMonitor : postStyles.attnOk;
                return (
                  <View key={p.name} style={rowStyle}>
                    <Text style={postStyles.colName}>{p.name}</Text>
                    <Text style={postStyles.colPos}>{p.position}</Text>
                    <Text style={[postStyles.colFlag, flagStyle]}>{p.readinessFlag}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.totalDistance, 0)}</Text>
                    <Text style={postStyles.colPct}>{pctFmt(p.totalDistancePct)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.hsd, 0)}</Text>
                    <Text style={postStyles.colPct}>{pctFmt(p.hsdPct)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.playerLoad, 1)}</Text>
                    <Text style={postStyles.colPct}>{pctFmt(p.playerLoadPct)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.playerLoadPerMin, 2)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.accelB23, 0)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.decelB23, 0)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.maxVelocity, 1)}</Text>
                    <Text style={postStyles.colMetric}>{numFmt2(p.acwr, 2)}</Text>
                    <Text style={[postStyles.colAttn, attnStyle]}>{p.attentionFlag}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </Page>
      ))}

      {/* ══ Page: Biomechanical Load — IMA / Stride ══ */}
      {ima && imaPages.length > 0 && imaPages.map((pagePlayers, pgIdx) => (
        <Page key={"pt-ima-" + pgIdx} size="A4" orientation="landscape" style={postStyles.page}>
          <View style={postStyles.section}>
            <Text style={postStyles.h1}>
              Post-Training Report — IMA (Stride){pgIdx > 0 ? " (frh.)" : ""}
            </Text>
            <Text style={postStyles.subtitle}>
              {data.teamName} · {data.sessionDate} · {data.mdDay} · {ima.player_count} players captured · {ima.session_headline}
            </Text>
          </View>

          {/* Team summary boxes — only on the first IMA page */}
          {pgIdx === 0 && (
            <>
              <View style={postStyles.section}>
                <Text style={postStyles.sectionTitle}>Lífaflfræðilegt álag — liðsyfirlit</Text>
                <View style={postStyles.summaryRow}>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{numFmt2(ima.team_total_strides, 0)}</Text>
                    <Text style={postStyles.summaryLabel}>Total strides</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{numFmt2(ima.team_sprint_strides, 0)} ({Math.round(ima.pct_sprint)}%)</Text>
                    <Text style={postStyles.summaryLabel}>Sprint-strides (b5-8)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>
                      {ima.team_cod_high_left} L / {ima.team_cod_high_right} R{ima.team_cod_asymmetry_pct != null ? ` · ${Math.round(ima.team_cod_asymmetry_pct)}%` : ""}
                    </Text>
                    <Text style={postStyles.summaryLabel}>L/R CoD balance (high)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{ima.players_high_cod_flagged} / {ima.player_count}</Text>
                    <Text style={postStyles.summaryLabel}>High-CoD asym. flagged</Text>
                  </View>
                </View>
              </View>

              <View style={postStyles.section}>
                <Text style={postStyles.sectionTitle}>Band dreifing (lið)</Text>
                <View style={postStyles.summaryRow}>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{Math.round(ima.pct_low)}%</Text>
                    <Text style={postStyles.summaryLabel}>Low (b1-3)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{Math.round(ima.pct_mid)}%</Text>
                    <Text style={postStyles.summaryLabel}>Mid (b4-6)</Text>
                  </View>
                  <View style={postStyles.summaryBox}>
                    <Text style={postStyles.summaryVal}>{Math.round(ima.pct_high)}%</Text>
                    <Text style={postStyles.summaryLabel}>High (b7-8)</Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Per-player IMA table */}
          <View style={postStyles.section}>
            <Text style={postStyles.sectionTitle}>IMA eftir leikmann (raðað eftir sprint-strides b5-8)</Text>
            <View style={postStyles.table}>
              <View style={postStyles.tHead}>
                <Text style={[{ width: "20%", padding: 4, fontSize: 9 }, postStyles.hdr]}>Leikmaður</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Total</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>b1-3</Text>
                <Text style={[{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>b4-6</Text>
                <Text style={[{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>b7-8</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>Sprint b5-8</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>vs grunnl.</Text>
                <Text style={[{ width: "12%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>CoD L/R (há)</Text>
                <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, postStyles.hdr]}>CoD ósamh.</Text>
              </View>
              {pagePlayers.map((p, i) => {
                const rowStyle = i % 2 === 0 ? postStyles.tRow : postStyles.tRowAlt;
                const vs = p.sprint_vs_baseline_pct;
                const vsStyle = vs == null ? {} : vs > 150 ? { color: "#a83e28", fontWeight: 700 } : vs > 120 ? { color: "#b0700f" } : {};
                const asym = p.cod_asymmetry_pct;
                const asymStyle = asym != null && asym > 15 ? { color: "#a83e28", fontWeight: 700 } : {};
                return (
                  <View key={p.player_id} style={rowStyle}>
                    <Text style={{ width: "20%", padding: 4, fontSize: 9 }}>{p.full_name}</Text>
                    <Text style={{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.total_strides, 0)}</Text>
                    <Text style={{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.low_strides, 0)}</Text>
                    <Text style={{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.mid_strides, 0)}</Text>
                    <Text style={{ width: "9%", padding: 4, fontSize: 9, textAlign: "right" }}>{numFmt2(p.high_strides, 0)}</Text>
                    <Text style={{ width: "10%", padding: 4, fontSize: 9, textAlign: "right", fontWeight: 700 }}>{numFmt2(p.sprint_strides, 0)}</Text>
                    <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, vsStyle]}>{vs == null ? "—" : `${Math.round(vs)}%`}</Text>
                    <Text style={{ width: "12%", padding: 4, fontSize: 9, textAlign: "right" }}>{p.cod_left_high} / {p.cod_right_high}</Text>
                    <Text style={[{ width: "10%", padding: 4, fontSize: 9, textAlign: "right" }, asymStyle]}>{asym == null ? "—" : `${Math.round(asym)}%`}</Text>
                  </View>
                );
              })}
            </View>
            {pgIdx === imaPages.length - 1 && (
              <Text style={{ fontSize: 8, color: "#a9a493", marginTop: 6 }}>
                IMA Free Running: 8-banda stride dreifing (Low b1-3 · Mid b4-6 · High b7-8). Sprint = bönd 5-8 vs persónuleg 14-daga grunnlína. CoD ósamhverfa &gt; 15% á háa intensity = aukin meiðslahætta (Bishop 2020).
              </Text>
            )}
          </View>
        </Page>
      ))}
    </Document>
  );
}


function triggerPdfDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Render + download the readiness-risk report. Lazy entry point (keeps @react-pdf out of First Load JS). */
export async function downloadReadinessRiskReportPdf(data: ReadinessRiskReportData) {
  const blob = await pdf(<ReadinessRiskReportDocument data={data} />).toBlob();
  triggerPdfDownload(blob, `readiness-risk-report-${data.date}.pdf`);
}

/** Render + download the post-training report. Lazy entry point. */
export async function downloadPostTrainingReportPdf(data: PostTrainingReportData, sessionDate: string) {
  const blob = await pdf(<PostTrainingReportDocument data={data} />).toBlob();
  triggerPdfDownload(blob, `post-training-report-${sessionDate}.pdf`);
}
