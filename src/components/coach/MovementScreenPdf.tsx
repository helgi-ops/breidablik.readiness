"use client";

/**
 * MovementScreenPdf
 * ─────────────────
 * A printable PDF of a movement-screen report — the same layered read the app
 * shows on screen: (0) verdict, (1) plain facts + confidence, (2) checkpoints by
 * view (auto-measured / coach-scored / not captured), the interpretation rules
 * that fired (finding → cause → lever, cited), the corrective plan, references
 * and honest caveats.
 *
 * Screening/training only — never a diagnosis, never the readiness colour. Rules
 * recommend; the coach/clinician decides. Language follows the app toggle.
 * Styling comes from the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */
import { Document, Text, View } from "@react-pdf/renderer";
import {
  BrandPage, Body, Bullets, C, Card, Chip, KeyValues, Label, Provenance, Section, Status, Table, Verdict,
  clean, fb, fh, renderPdfBlob, saveBlob, type Tone,
} from "@/components/pdf/brand";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import { STRENGTH_EMPHASIS_LABEL } from "@/lib/micropulse/movementScreen/interpret";
import type { CheckpointView, ScreenReport } from "@/lib/micropulse/movementScreen/report";
import { MVIC_BAND_LABEL } from "@/lib/micropulse/movementScreen/correctives/registry";
import { prescribeCorrectives } from "@/lib/micropulse/movementScreen/correctives/mapping";

export type MovementScreenPdfMeta = { testName: string; playerName: string; date: string };

const REPORT_TONE: Record<ScreenReport["tone"], Tone> = { ok: "green", caution: "amber", alert: "red" };
const CONF_TONE: Record<ScreenReport["confidence"], Tone> = { high: "green", moderate: "amber", low: "red" };
const SEV_TONE: Record<string, Tone> = { ok: "neutral", mild: "neutral", moderate: "amber", marked: "red" };
const VIEW_ORDER: CheckpointView[] = ["front", "side", "back", "other"];

/** Section heading (same look as the kit's <Section title>) — used where the heading must stay glued to its first card. */
function SectionTitle({ children }: { children: string }) {
  return <Text style={[fh(700), { fontSize: 13, letterSpacing: -0.1, marginBottom: 6 }]}>{clean(children)}</Text>;
}

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
  const toneWord: Record<ScreenReport["tone"], string> = { ok: T("Looks good", "Lítur vel út"), caution: T("Worth working on", "Þess virði að vinna í"), alert: T("Needs attention", "Þarf athygli") };
  const confWord = `${report.confidence} ${T("confidence", "vissa")}`;
  const plan = prescribeCorrectives(report.readings);

  return (
    <Document>
      <BrandPage
        doc={T("Movement screen", "Hreyfiskimun")}
        context={meta.playerName || undefined}
        kicker={T("Movement screen", "Hreyfiskimun")}
        title={meta.testName}
        subtitle={`${meta.playerName ? `${meta.playerName} · ` : ""}${meta.date}`}
        chips={[
          { text: confWord, tone: CONF_TONE[report.confidence] },
          ...(report.rtpFlag ? [{ text: T("Re-screen before return-to-play", "Endurskima fyrir endurkomu"), tone: "rtp" as Tone }] : []),
        ]}
        note={`${T("MicroPulse · Movement screen · screening/training only — not a diagnosis", "MicroPulse · Hreyfiskimun · aðeins skimun/þjálfun — ekki greining")} · ${meta.date}`}
      >
        {/* Layer 0 + 1 — verdict, plain facts, confidence */}
        {report.redFlag ? (
          <Verdict
            tone="red"
            label={T("Red flag", "Rautt flagg")}
            headline={report.redFlagNote ? L(report.redFlagNote) : T("Refer to a clinician.", "Vísaðu til klíníkers.")}
          />
        ) : (
          <>
            <Verdict tone={REPORT_TONE[report.tone]} label={toneWord[report.tone]} headline={L(report.verdict)} confidence={confWord} />
            {report.facts.length ? (
              <Card style={{ marginBottom: 10 }}>
                <Bullets items={report.facts.map(L)} size={9.25} />
                <Provenance>{`${confWord} — ${L(report.confidenceNote)}`}</Provenance>
              </Card>
            ) : (
              <Provenance>{`${confWord} — ${L(report.confidenceNote)}`}</Provenance>
            )}
          </>
        )}

        {/* Layer 2 — checkpoints by view */}
        {report.checkpoints.length > 0 && (
          <Section title={T("Checkpoints by view", "Checkpoints eftir sýn")}>
            {usedViews.map((view) => {
              const rows = report.checkpoints.filter((c) => c.view === view);
              return (
                <View key={view} wrap={false} style={{ marginBottom: 7 }}>
                  <Label>{viewLabel[view]}</Label>
                  <Table
                    dense
                    cols={[
                      { label: T("Source", "Uppruni"), width: 44 },
                      { label: T("Checkpoint", "Atriði"), flex: 1 },
                      { label: T("Value", "Gildi"), width: 60, align: "right" },
                      { label: T("Status", "Staða"), width: 118, align: "right" },
                    ]}
                    rows={rows.map((c) => {
                      const u = c.unit === "band" ? "" : c.unit.replace("/band", "");
                      const statusText = c.status === "flagged" ? (c.bandLabel ? L(c.bandLabel) : c.severity ?? "")
                        : c.status === "normal" ? T("within normal", "innan eðlilegs")
                        : c.source === "pose" ? T(`needs ${viewWord[c.view]} clip`, `vantar ${viewWord[c.view]}myndband`) : T("coach to score", "þjálfari skorar");
                      const status = c.status === "flagged"
                        ? <Status key="st" tone={c.severity ? SEV_TONE[c.severity] ?? "amber" : "amber"} text={statusText} size={8} />
                        : c.status === "normal"
                          ? <Status key="st" tone="green" text={statusText} size={8} />
                          : <Text key="st" style={[fb(400), { fontSize: 8, color: C.faint, textAlign: "right" }]}>{clean(statusText)}</Text>;
                      return [
                        <Text key="src" style={[fb(400), { fontSize: 7.5, color: C.mute }]}>{c.source === "pose" ? T("auto", "sjálfv.") : T("coach", "þjálf.")}</Text>,
                        <Text key="l" style={[fb(400), { fontSize: 8.75 }]}>{clean(`${L(c.label)}${c.leg && c.leg !== "both" ? ` (${c.leg})` : ""}`)}</Text>,
                        c.value == null ? "" : `${c.value}${u ? " " + u : ""}`,
                        status,
                      ];
                    })}
                  />
                </View>
              );
            })}
            <Provenance>{T("auto = measured from video · coach = coach-scored · a missing view / score reads as “needs … clip” or “coach to score”.", "sjálfv. = mælt úr myndbandi · þjálf. = þjálfari skorar · sýn/skor sem vantar birtist sem „vantar … myndband“ eða „þjálfari skorar“.")}</Provenance>
          </Section>
        )}

        {/* Interpretation — finding → likely cause → lever, cited */}
        {report.readings.length > 0 && (
          <Section>
            {report.readings.map((r, i) => (
              <View key={i} wrap={false}>
                {i === 0 ? <SectionTitle>{T("Interpretation", "Túlkun")}</SectionTitle> : null}
              <Card pad={10} style={{ marginBottom: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <Text style={[fb(600), { fontSize: 10, flex: 1, lineHeight: 1.3 }]}>{clean(`${L(r.finding)}${r.leg ? ` (${r.leg})` : ""}`)}</Text>
                  <Chip text={r.evidenceGrade} />
                </View>
                <KeyValues
                  labelWidth={92}
                  rows={[
                    [T("likely", "líklega"), <Text key="c" style={[fb(400), { fontSize: 8.75, flex: 1, lineHeight: 1.4 }]}>{clean(L(r.cause))}</Text>],
                    [L(STRENGTH_EMPHASIS_LABEL[r.strengthEmphasis]), <Text key="l" style={[fb(600), { fontSize: 8.75, flex: 1, lineHeight: 1.4 }]}>{clean(L(r.lever))}</Text>],
                  ]}
                />
                <Provenance>{r.citation}</Provenance>
              </Card>
              </View>
            ))}
          </Section>
        )}

        {/* Corrective plan */}
        {plan ? (
          <Section>
            <View wrap={false}>
              <SectionTitle>{T("Corrective plan", "Leiðréttingar-áætlun")}</SectionTitle>
              <Body size={8.75} color={C.mute}>
                {`${T("Priority", "Áhersla")}: ${plan.priorities.map((x) => L(x.label)).join(" · ")}   ·   ${T(`re-screen in ~${Math.round(plan.reScreenInDays / 7)} wks`, `endurskima ~${Math.round(plan.reScreenInDays / 7)} vikur`)}`}
              </Body>
            </View>
            {plan.phases.map((grp) => (
              <Card key={grp.phase} pad={9} style={{ marginTop: 6 }} wrap={grp.items.length > 14}>
                <Label color={C.cobalt}>{L(grp.label)}</Label>
                <KeyValues rows={grp.items.map((e) => [`${L(e.name)}${e.mvic ? ` (${L(MVIC_BAND_LABEL[e.mvic.band])})` : ""}`, L(e.dose)] as [string, string])} />
              </Card>
            ))}
            <Provenance>{L(plan.caveat)}</Provenance>
          </Section>
        ) : null}

        {/* References */}
        {report.references.length > 0 && (
          <Section title={T("References", "Heimildir")}>
            {report.references.map((ref, i) => <Provenance key={i}>{`${ref.label}${ref.source ? ` — ${ref.source}` : ""}`}</Provenance>)}
          </Section>
        )}

        {/* Caveats */}
        <Section title={T("Caveats", "Fyrirvarar")} wrap={false}>
          <Bullets items={report.caveats.map(L)} size={8} />
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadMovementScreenPdf(report: ScreenReport, meta: MovementScreenPdfMeta, isEN: boolean) {
  const blob = await renderPdfBlob(() => <MovementScreenDoc report={report} meta={meta} isEN={isEN} />);
  const safe = (str: string) => str.replace(/\s+/g, "-").replace(/[^\w.\-]+/g, "");
  saveBlob(blob, `MicroPulse-MovementScreen-${safe(meta.playerName || "player")}-${meta.date}.pdf`);
}

export default MovementScreenDoc;
