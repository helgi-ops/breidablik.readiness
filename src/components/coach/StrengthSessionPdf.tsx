"use client";

/**
 * StrengthSessionPdf
 * ──────────────────
 * Renders a printable PDF of micro-dose strength sessions for the whole
 * squad. A cover page (summary first: who has a session, how long, how many
 * auto-adaptations) and then one page per player.
 *
 * Coaches typically print these and pin them on the gym whiteboard, or
 * email PDFs to players. Layout is dense but readable — exercise name,
 * sets × reps × intensity, modification reason if the adaptation engine
 * fired. Blocks print in the engine's order (power before strength).
 *
 * Styling: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import type { StrengthSession } from "@/lib/micropulse/strengthProgramming/types";
import { BrandPage, Body, C, Card, Chip, FactRow, Label, Provenance, Section, Table, Verdict, clean, fb, fh } from "@/components/pdf/brand";

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

/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

const NOTE = "MicroPulse · Micro-dose strength";
const NO_SESSION = "No session prescribed today (rehab, recovery, or off-day verdict).";

const doseLine = (ex: StrengthSession["blocks"][number]["exercises"][number]) =>
  `${ex.dose.sets} × ${ex.dose.reps} · ${ex.dose.intensity} · rest ${ex.dose.rest}` +
  (ex.dose.intraRepRestSec ? ` · cluster ${ex.dose.intraRepRestSec}s` : "") +
  (ex.dose.velocityLossCap ? ` · stop @ -${ex.dose.velocityLossCap}% velocity` : "");

/** Local building block: per-player page header (no masthead after page 1). */
function PlayerHead({ name, chips }: { name: string; chips: string[] }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.rule }}>
      <Text style={[fh(800), { fontSize: 20, letterSpacing: -0.4, flex: 1 }]}>{tx(name)}</Text>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {chips.map((c, i) => <Chip key={i} text={c} tone={i === 0 ? "cobalt" : "neutral"} />)}
      </View>
    </View>
  );
}

function PlayerPage({ data, playerName, session, error }: { data: StrengthSessionPdfData; playerName: string; session: StrengthSession | null; error?: string }) {
  const ctx = session?.mdContext ?? data.mdContextRequested;
  const chips = [ctx, ...(session ? [`~${session.durationMin} min`] : [])];
  const exCount = session ? session.blocks.reduce((a, b) => a + b.exercises.length, 0) : 0;
  return (
    <BrandPage doc="Strength session" context={`${data.teamName} · ${data.date}`} note={`${NOTE} · ${data.date}`}>
      <PlayerHead name={playerName} chips={chips} />
      {error || !session ? (
        <Verdict tone="amber" label="No session" headline={tx(error ?? NO_SESSION)} />
      ) : session.blocks.length === 0 ? (
        <Verdict tone="amber" label="No session" headline={tx(session.summaryEN)} />
      ) : (
        <>
          <Verdict
            tone="neutral"
            label={`${ctx} session`}
            headline={tx(session.summaryEN)}
            confidence={`Confidence: ${Math.round(session.confidence * 100)}%${session.vbtAutoRegulated ? " · VBT auto-regulated" : ""} · Date: ${data.date}`}
          />
          <FactRow
            facts={[
              { value: `~${session.durationMin} min`, label: "Session length" },
              { value: String(exCount), label: "Exercises", sub: `${session.blocks.length} block${session.blocks.length === 1 ? "" : "s"}` },
              { value: String(session.appliedAdaptations.length), label: "Auto-adaptations", sub: session.appliedAdaptations.length ? "Explained at the bottom of the page" : "Base template as planned", tone: session.appliedAdaptations.length ? "amber" : undefined },
            ]}
          />

          {session.blocks.map((block) => (
            <View key={block.id} wrap={false} style={{ marginBottom: 8 }}>
              <Card pad={10}>
                <Text style={[fh(700), { fontSize: 11 }]}>{tx(block.titleEN)}</Text>
                {block.noteEN ? <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 2, lineHeight: 1.35 }]}>{tx(block.noteEN)}</Text> : null}
                {block.exercises.map((ex, i) => (
                  <View key={`${ex.exerciseId}-${i}`} wrap={false} style={{ marginTop: i === 0 ? 6 : 4, paddingTop: i === 0 ? 0 : 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hair }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={[fb(600), { fontSize: 9.5, flex: 1 }]}>{tx(ex.nameEN)}</Text>
                      {ex.modificationReason || ex.isAdaptiveAddition ? <Chip text={ex.modificationReason ? "Adapted" : "Added"} tone="amber" /> : null}
                    </View>
                    <Text style={[fh(600), { fontSize: 9, marginTop: 1.5 }]}>{tx(doseLine(ex))}</Text>
                    {ex.dose.cue ? <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 1.5 }]}>{`Cue: ${tx(ex.dose.cue)}`}</Text> : null}
                    {ex.modificationReason ? <Text style={[fb(600), { fontSize: 8, color: C.amberText, marginTop: 1.5 }]}>{tx(ex.modificationReason)}</Text> : null}
                    {ex.isAdaptiveAddition && !ex.modificationReason ? <Text style={[fb(600), { fontSize: 8, color: C.amberText, marginTop: 1.5 }]}>Added by adaptation engine</Text> : null}
                  </View>
                ))}
              </Card>
            </View>
          ))}

          {session.appliedAdaptations.length > 0 && (
            <Section title={`Why these changes? (${session.appliedAdaptations.length} adaptation${session.appliedAdaptations.length === 1 ? "" : "s"})`} mt={2}>
              <Table
                cols={[{ label: "Trigger", flex: 1 }, { label: "Action", flex: 1.3 }]}
                rows={session.appliedAdaptations.map((a) => [tx(a.triggerEN), tx(a.actionEN)])}
                size={8}
              />
            </Section>
          )}
        </>
      )}
    </BrandPage>
  );
}

export function StrengthSessionPdf({ data }: { data: StrengthSessionPdfData }) {
  const withSession = data.sessions.filter((x) => x.session && !x.error && x.session.blocks.length > 0);
  const without = data.sessions.length - withSession.length;
  const avgMin = withSession.length ? Math.round(withSession.reduce((a, x) => a + (x.session?.durationMin ?? 0), 0) / withSession.length) : null;
  const adaptations = withSession.reduce((a, x) => a + (x.session?.appliedAdaptations.length ?? 0), 0);
  const adapted = withSession.filter((x) => (x.session?.appliedAdaptations.length ?? 0) > 0).length;
  return (
    <Document>
      {/* Cover — summary first */}
      <BrandPage
        doc="Strength sessions"
        context={data.teamName}
        kicker="Micro-dose strength"
        title="Strength sessions - Micro-dose"
        subtitle={`${data.teamName} · ${data.date} · Context: ${data.mdContextRequested}`}
        chips={[{ text: `${data.sessions.length} players` }, { text: `Context: ${data.mdContextRequested}`, tone: "cobalt" }]}
        note={`${NOTE} · ${data.date}`}
      >
        <Verdict
          tone="neutral"
          label="Today"
          headline={`${withSession.length} of ${data.sessions.length} players have a strength session today${avgMin != null ? ` (~${avgMin} min each)` : ""}.`}
          body={without > 0 ? `${without} without a session (rehab, recovery, off-day verdict or no data) - their page says why.` : "Everyone in the squad has a session."}
        />
        <FactRow
          facts={[
            { value: String(withSession.length), label: "Sessions prescribed", sub: `of ${data.sessions.length} players` },
            { value: avgMin != null ? `~${avgMin} min` : "-", label: "Average length", sub: "Micro-dose: ~15-20 min" },
            { value: String(adaptations), label: "Auto-adaptations", sub: `${adapted} player${adapted === 1 ? "" : "s"} adjusted to today's signals`, tone: adaptations ? "amber" : undefined },
          ]}
        />

        <Section title="About these sessions">
          <Card>
            <Body>{"Per-player ~15-20 minute strength sessions tuned to today's signals (Sprint Speed Drop, Sprint Exposure, CoD asymmetry, decel burden, VBT, wellness sore-areas, verdict)."}</Body>
            <Body mt={5}>Micro-dose by design: small, frequent, high-quality exposure beats infrequent big sessions for in-season teams.</Body>
            <Body mt={5}>{'Print these for the whiteboard, hand to players, or scan into your session log. Exercises marked "Adapted" are auto-applied by the engine; the audit trail on each page explains why.'}</Body>
          </Card>
        </Section>

        <Section title="Squad overview" hint="One page per player follows, in this order.">
          <Table
            cols={[{ label: "Player", flex: 1.6 }, { label: "Context", width: 60 }, { label: "Length", width: 52, align: "right" }, { label: "Exercises", width: 56, align: "right" }, { label: "Adaptations", width: 66, align: "right" }]}
            rows={data.sessions.map(({ playerName, session, error }) => {
              const ok = session && !error && session.blocks.length > 0;
              return [
                tx(playerName),
                session?.mdContext ?? data.mdContextRequested,
                ok ? `~${session!.durationMin} min` : <Text style={[fb(600), { fontSize: 8.5, color: C.amberText }]}>No session</Text>,
                ok ? String(session!.blocks.reduce((a, b) => a + b.exercises.length, 0)) : "-",
                ok ? String(session!.appliedAdaptations.length) : "-",
              ];
            })}
            dense
          />
        </Section>

        <Label mt={4}>Evidence</Label>
        <Provenance>
          Cuthbert 2021 (microdosing) · van Dyk 2019 (Nordic, 51% hamstring reduction) · Harøy 2019 (Copenhagen, 41% groin reduction) · Pareja-Blanco 2017 (VBT) · Tufano 2017 (cluster sets) · Zhao 2025 (French contrast) · Lum & Barbosa 2019 (isometrics) · Bishop 2023 (L/R asymmetry) · Malone 2018 (sprint exposure) · Edouard 2018 (fatigue lowered sprint power in a lab study).
        </Provenance>
      </BrandPage>

      {/* One page per player */}
      {data.sessions.map(({ playerName, session, error }) => (
        <PlayerPage key={playerName} data={data} playerName={playerName} session={session} error={error} />
      ))}
    </Document>
  );
}

export default StrengthSessionPdf;
