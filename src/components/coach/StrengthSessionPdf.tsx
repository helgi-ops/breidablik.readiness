"use client";

/**
 * StrengthSessionPdf
 * ──────────────────
 * Renders a printable PDF of micro-dose strength sessions for the whole
 * squad. One page per player.
 *
 * Coaches typically print these and pin them on the gym whiteboard, or
 * email PDFs to players. Layout is dense but readable — exercise name,
 * sets × reps × intensity, modification reason if the adaptation engine
 * fired.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { StrengthSession } from "@/lib/micropulse/strengthProgramming/types";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: "Helvetica", color: "#221f18" },
  cover: { padding: 48, fontFamily: "Helvetica", color: "#221f18" },
  coverTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  coverSubtitle: { fontSize: 12, color: "#6d6858", marginBottom: 24 },
  coverParagraph: { fontSize: 10, color: "#565044", lineHeight: 1.4, marginBottom: 12 },
  coverEvidence: { fontSize: 8, color: "#8b8676", marginTop: 24, lineHeight: 1.4 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#d5cfbe", paddingBottom: 6 },
  playerName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  mdBadge: { fontSize: 10, fontFamily: "Helvetica-Bold", backgroundColor: "#4338ca", color: "#ffffff", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3 },

  meta: { flexDirection: "row", gap: 12, marginBottom: 10, fontSize: 8, color: "#6d6858" },
  summary: { fontSize: 10, marginBottom: 12, color: "#3a352c", lineHeight: 1.4 },

  block: { marginBottom: 10, borderWidth: 1, borderColor: "#e6e1d4", borderRadius: 3, padding: 6 },
  blockTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#3730a3", marginBottom: 2, textTransform: "uppercase" },
  blockNote: { fontSize: 7, color: "#8b8676", fontStyle: "italic", marginBottom: 4, lineHeight: 1.3 },

  exerciseRow: { marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "#e6e1d4" },
  exerciseRowFirst: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  exerciseName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#221f18" },
  exerciseDose: { fontSize: 9, color: "#565044", marginTop: 1 },
  exerciseCue: { fontSize: 8, color: "#8b8676", fontStyle: "italic", marginTop: 1 },
  exerciseMod: { fontSize: 8, color: "#7c5210", fontFamily: "Helvetica-Bold", marginTop: 2, backgroundColor: "#f3e0b4", paddingHorizontal: 3, paddingVertical: 1 },

  audit: { marginTop: 6, borderTopWidth: 1, borderTopColor: "#d5cfbe", paddingTop: 6 },
  auditTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#3730a3", marginBottom: 4 },
  auditEntry: { fontSize: 8, marginBottom: 3, lineHeight: 1.4, color: "#565044" },
  auditTrigger: { fontFamily: "Helvetica-Bold" },

  footer: { position: "absolute", bottom: 16, left: 24, right: 24, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#a9a493" },

  blocked: { marginTop: 12, padding: 12, backgroundColor: "#f3e0b4", borderRadius: 3, fontSize: 10, color: "#7c5210" },
});

export type StrengthSessionPdfData = {
  teamName: string;
  date: string;
  mdContextRequested: string;
  sessions: Array<{
    playerName: string;
    session: StrengthSession | null;
    error?: string;
  }>;
};

export function StrengthSessionPdf({ data }: { data: StrengthSessionPdfData }) {
  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={styles.cover}>
        <Text style={styles.coverTitle}>Strength sessions — Micro-dose</Text>
        <Text style={styles.coverSubtitle}>
          {data.teamName} · {data.date} · Context: {data.mdContextRequested}
        </Text>
        <Text style={styles.coverParagraph}>
          Per-player ~15–20 minute strength sessions tuned to today&apos;s signals
          (Sprint Speed Drop, Sprint Exposure, CoD asymmetry, decel burden, VBT,
          wellness sore-areas, verdict).
        </Text>
        <Text style={styles.coverParagraph}>
          Micro-dose by design: small, frequent, high-quality exposure beats
          infrequent big sessions for in-season teams.
        </Text>
        <Text style={styles.coverParagraph}>
          Print these for the whiteboard, hand to players, or scan into your
          session log. Adaptations marked &quot;⚙&quot; are auto-applied by the
          engine; the audit trail on each page explains why.
        </Text>
        <Text style={styles.coverEvidence}>
          Evidence: Rønnestad 2023 (microdosing) · van Dyk 2019 (Nordic, 51%
          hamstring reduction) · Harøy 2019 (Copenhagen, 41% groin reduction) ·
          Pareja-Blanco 2017 (VBT) · Tufano 2017 (cluster sets) · Liu 2023
          (French Contrast) · Comfort 2018 (IMTP) · Bishop 2020 (L/R asymmetry) ·
          Malone 2018 (sprint exposure) · Edouard 2019 (sprint speed drop).
        </Text>
      </Page>

      {/* One page per player */}
      {data.sessions.map(({ playerName, session, error }) => (
        <Page key={playerName} size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.playerName}>{playerName}</Text>
            <Text style={styles.mdBadge}>
              {session?.mdContext ?? data.mdContextRequested}
              {session ? ` · ~${session.durationMin} min` : ""}
            </Text>
          </View>

          {error || !session ? (
            <View style={styles.blocked}>
              <Text>
                {error ?? "No session prescribed today (rehab, recovery, or off-day verdict)."}
              </Text>
            </View>
          ) : session.blocks.length === 0 ? (
            <View style={styles.blocked}>
              <Text>{session.summaryEN}</Text>
            </View>
          ) : (
            <>
              <View style={styles.meta}>
                <Text>Date: {data.date}</Text>
                <Text>Confidence: {Math.round(session.confidence * 100)}%</Text>
                {session.vbtAutoRegulated && <Text>VBT auto-regulated</Text>}
              </View>

              <Text style={styles.summary}>{session.summaryEN}</Text>

              {session.blocks.map((block) => (
                <View key={block.id} style={styles.block}>
                  <Text style={styles.blockTitle}>{block.titleEN}</Text>
                  {block.noteEN && <Text style={styles.blockNote}>{block.noteEN}</Text>}
                  {block.exercises.map((ex, i) => (
                    <View key={`${ex.exerciseId}-${i}`} style={i === 0 ? styles.exerciseRowFirst : styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{ex.nameEN}</Text>
                      <Text style={styles.exerciseDose}>
                        {ex.dose.sets} × {ex.dose.reps} · {ex.dose.intensity} · rest {ex.dose.rest}
                        {ex.dose.intraRepRestSec ? ` · cluster ${ex.dose.intraRepRestSec}s` : ""}
                        {ex.dose.velocityLossCap ? ` · stop @ −${ex.dose.velocityLossCap}% velocity` : ""}
                      </Text>
                      {ex.dose.cue && <Text style={styles.exerciseCue}>→ {ex.dose.cue}</Text>}
                      {ex.modificationReason && <Text style={styles.exerciseMod}>⚙ {ex.modificationReason}</Text>}
                      {ex.isAdaptiveAddition && !ex.modificationReason && (
                        <Text style={styles.exerciseMod}>＋ Added by adaptation engine</Text>
                      )}
                    </View>
                  ))}
                </View>
              ))}

              {session.appliedAdaptations.length > 0 && (
                <View style={styles.audit}>
                  <Text style={styles.auditTitle}>
                    Why these changes? ({session.appliedAdaptations.length} adaptations)
                  </Text>
                  {session.appliedAdaptations.map((a) => (
                    <Text key={a.ruleId} style={styles.auditEntry}>
                      <Text style={styles.auditTrigger}>{a.triggerEN}</Text>
                      {" → "}
                      {a.actionEN}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={styles.footer}>
            <Text>MicroPulse · Micro-dose strength</Text>
            <Text>{data.date}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}

export default StrengthSessionPdf;
