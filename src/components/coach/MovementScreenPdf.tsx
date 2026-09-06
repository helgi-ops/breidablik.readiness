"use client";

/**
 * MovementScreenPdf
 * ─────────────────
 * A printable PDF of a movement-screen report — the same layered read the app
 * shows on screen: (0) verdict, (1) plain facts + confidence, (2) checkpoints by
 * view (auto-measured / coach-scored / not captured), the interpretation rules
 * that fired (finding → cause → lever, cited), references and honest caveats.
 *
 * Screening/training only — never a diagnosis, never the readiness colour. Rules
 * recommend; the coach/clinician decides. Language follows the app toggle.
 */
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import { STRENGTH_EMPHASIS_LABEL } from "@/lib/micropulse/movementScreen/interpret";
import type { CheckpointView, ScreenReport } from "@/lib/micropulse/movementScreen/report";

export type MovementScreenPdfMeta = { testName: string; playerName: string; date: string };

const TONE = { ok: "#1c7a4a", caution: "#de9328", alert: "#a83e28" } as const;
const CONF = { high: "#1c7a4a", moderate: "#de9328", low: "#a83e28" } as const;
const SEV: Record<string, string> = { ok: "#6d6858", mild: "#6d6858", moderate: "#de9328", marked: "#a83e28" };
const VIEW_ORDER: CheckpointView[] = ["front", "side", "back", "other"];

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#221f18", lineHeight: 1.35 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: "#d5cfbe", paddingBottom: 6, marginBottom: 10 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: "#6d6858", marginTop: 2 },
  conf: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  redFlag: { backgroundColor: "#f6e4df", borderRadius: 3, padding: 8, fontSize: 10, color: "#a83e28", marginBottom: 10 },
  verdict: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  fact: { fontSize: 10, color: "#3a352c", marginBottom: 2 },
  confNote: { fontSize: 8, color: "#6d6858", marginTop: 4, marginBottom: 12 },
  sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#565044", textTransform: "uppercase", marginBottom: 4, marginTop: 6 },
  viewTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#8b8676", textTransform: "uppercase", marginTop: 5, marginBottom: 2 },
  cpRow: { flexDirection: "row", alignItems: "baseline", marginBottom: 1.5, gap: 5 },
  cpSrc: { fontSize: 7, color: "#a9a493", width: 30 },
  cpLabel: { fontSize: 9, color: "#3a352c", flex: 1 },
  cpValue: { fontSize: 8, color: "#8b8676", width: 52, textAlign: "right" },
  cpStatus: { fontSize: 9, fontFamily: "Helvetica-Bold", width: 96, textAlign: "right" },
  legend: { fontSize: 7, color: "#a9a493", marginTop: 4 },
  reading: { borderWidth: 1, borderColor: "#e6e1d4", borderRadius: 3, padding: 6, marginBottom: 5 },
  rFinding: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#221f18" },
  rGrade: { fontSize: 7, color: "#8b8676" },
  rCause: { fontSize: 8, color: "#565044", marginTop: 2 },
  rLever: { fontSize: 8, color: "#221f18", marginTop: 2 },
  rCite: { fontSize: 7, color: "#a9a493", marginTop: 2 },
  ref: { fontSize: 7, color: "#8b8676", marginBottom: 1.5 },
  caveat: { fontSize: 7.5, color: "#6d6858", marginBottom: 2 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a9a493", borderTopWidth: 1, borderTopColor: "#e6e1d4", paddingTop: 6 },
});

function MovementScreenDoc({ report, meta, isEN }: { report: ScreenReport; meta: MovementScreenPdfMeta; isEN: boolean }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const viewLabel: Record<CheckpointView, string> = {
    front: T("Front view", "Framsýn"), side: T("Side view", "Hliðarsýn"), back: T("Back view", "Aftansýn"), other: T("Overall", "Heildar"),
  };
  const viewWord: Record<CheckpointView, string> = {
    front: T("front", "framan-"), side: T("side", "hliðar-"), back: T("back", "aftan-"), other: T("another", "aðra "),
  };
  const usedViews = VIEW_ORDER.filter((v) => report.checkpoints.some((c) => c.view === v));

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>{meta.testName}</Text>
            <Text style={s.sub}>{meta.playerName ? `${meta.playerName} · ` : ""}{meta.date}</Text>
          </View>
          <Text style={[s.conf, { color: CONF[report.confidence] }]}>{report.confidence}</Text>
        </View>

        {report.redFlag ? (
          <Text style={s.redFlag}>⚑ {report.redFlagNote ? L(report.redFlagNote) : T("Refer to a clinician.", "Vísaðu til klíníkers.")}</Text>
        ) : (
          <>
            <Text style={[s.verdict, { color: TONE[report.tone] }]}>{L(report.verdict)}</Text>
            {report.facts.map((f, i) => <Text key={i} style={s.fact}>· {L(f)}</Text>)}
            <Text style={s.confNote}>
              {report.confidence} {T("confidence", "vissa")} — {L(report.confidenceNote)}
            </Text>
          </>
        )}

        {/* Checkpoints by view */}
        {report.checkpoints.length > 0 && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>{T("Checkpoints by view", "Checkpoints eftir sýn")}</Text>
            {usedViews.map((view) => (
              <View key={view}>
                <Text style={s.viewTitle}>{viewLabel[view]}</Text>
                {report.checkpoints.filter((c) => c.view === view).map((c, i) => {
                  const u = c.unit === "band" ? "" : c.unit.replace("/band", "");
                  const statusText = c.status === "flagged" ? (c.bandLabel ? L(c.bandLabel) : c.severity ?? "")
                    : c.status === "normal" ? T("within normal", "innan eðlilegs")
                    : c.source === "pose" ? T(`needs ${viewWord[c.view]} clip`, `vantar ${viewWord[c.view]}myndband`) : T("coach to score", "þjálfari skorar");
                  const color = c.status === "flagged" ? (c.severity ? SEV[c.severity] : "#de9328") : c.status === "normal" ? "#1c7a4a" : "#a9a493";
                  return (
                    <View key={`${c.variableKey}|${c.leg ?? ""}|${i}`} style={s.cpRow}>
                      <Text style={s.cpSrc}>{c.source === "pose" ? T("auto", "sjálfv.") : T("coach", "þjálf.")}</Text>
                      <Text style={s.cpLabel}>{L(c.label)}{c.leg && c.leg !== "both" ? ` (${c.leg})` : ""}</Text>
                      <Text style={s.cpValue}>{c.value == null ? "" : `${c.value}${u ? " " + u : ""}`}</Text>
                      <Text style={[s.cpStatus, { color }]}>{statusText}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
            <Text style={s.legend}>{T("auto = measured from video · coach = coach-scored · a missing view / score reads as “needs … clip” or “coach to score”.", "sjálfv. = mælt úr myndbandi · þjálf. = þjálfari skorar · sýn/skor sem vantar birtist sem „vantar … myndband“ eða „þjálfari skorar“.")}</Text>
          </View>
        )}

        {/* Interpretation */}
        {report.readings.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>{T("Interpretation", "Túlkun")}</Text>
            {report.readings.map((r, i) => (
              <View key={i} style={s.reading} wrap={false}>
                <Text style={s.rFinding}>{L(r.finding)}{r.leg ? ` (${r.leg})` : ""}  <Text style={s.rGrade}>[{r.evidenceGrade}]</Text></Text>
                <Text style={s.rCause}>{T("likely", "líklega")}: {L(r.cause)}</Text>
                <Text style={s.rLever}>{L(STRENGTH_EMPHASIS_LABEL[r.strengthEmphasis])}: {L(r.lever)}</Text>
                <Text style={s.rCite}>{r.citation}</Text>
              </View>
            ))}
          </View>
        )}

        {/* References */}
        {report.references.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>{T("References", "Heimildir")}</Text>
            {report.references.map((ref, i) => <Text key={i} style={s.ref}>· {ref.label}{ref.source ? ` — ${ref.source}` : ""}</Text>)}
          </View>
        )}

        {/* Caveats */}
        <View>
          <Text style={s.sectionTitle}>{T("Caveats", "Fyrirvarar")}</Text>
          {report.caveats.map((c, i) => <Text key={i} style={s.caveat}>· {L(c)}</Text>)}
        </View>

        <View style={s.footer} fixed>
          <Text>{T("MicroPulse · Movement screen · screening/training only — not a diagnosis", "MicroPulse · Hreyfiskimun · aðeins skimun/þjálfun — ekki greining")}</Text>
          <Text>{meta.date}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function downloadMovementScreenPdf(report: ScreenReport, meta: MovementScreenPdfMeta, isEN: boolean) {
  const blob = await pdf(<MovementScreenDoc report={report} meta={meta} isEN={isEN} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (str: string) => str.replace(/\s+/g, "-").replace(/[^\w.\-]+/g, "");
  a.href = url;
  a.download = `MicroPulse-MovementScreen-${safe(meta.playerName || "player")}-${meta.date}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default MovementScreenDoc;
