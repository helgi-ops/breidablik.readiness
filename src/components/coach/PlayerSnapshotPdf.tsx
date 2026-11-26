"use client";

/**
 * PlayerSnapshotPdf
 * ──────────────────
 * Renders a one/two-page PDF summary of a player's daily snapshot.
 * Given the Snapshot JSON returned by /api/coach/player-snapshot, produces
 * a printable coach report in the explainability-first order:
 *   0  Masthead (player, date, overall risk chip) → rule-based risk verdict
 *   1  Three plain facts: readiness, daily load, average RPE
 *      → risk drivers + recommended actions
 *   2  Behind the numbers: load ratio (ACWR, acute/chronic), session RPE entries,
 *      wellness breakdown, GPS / external load blocks, context (week plan)
 *
 * Styling comes from the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 * The readiness band is printed exactly as the snapshot API returns it (never re-derived).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import {
  BrandPage, Body, C, Card, FactRow, Label, Provenance, Section, StatGrid, Status, Table, Verdict, clean, fb, toneOf,
  type Tone,
} from "@/components/pdf/brand";

type RiskDriver = {
  key: string;
  label: string;
  value: string;
  severity: "RED" | "AMBER";
  explanation: string;
};

type RiskAnalysis = {
  overallSeverity: "LOW" | "ELEVATED" | "HIGH";
  summary: string;
  drivers: RiskDriver[];
  recommendations: string[];
};

export type PlayerSnapshotPdfData = {
  date: string;
  player: { id: string; full_name: string | null; team_id: string | null; position: string | null };
  summary: {
    daily_rpe_load_total: number;
    avg_rpe: number | null;
    rpe_count: number;
    load_band: "VERY_LIGHT" | "LIGHT" | "MEDIUM" | "HIGH" | "VERY_HIGH" | null;
    acwr: number | null;
    acwr_band: "OPTIMAL" | "CAUTION" | "RISK" | null;
    acute_load_7d: number | null;
    chronic_load_28d: number | null;
    readiness_total_raw: number | null;
    readiness_total: number | null;
    readiness_band: "GREEN" | "AMBER" | "RED" | null;
    session_type_mix: Record<string, number>;
  };
  risk_analysis: RiskAnalysis;
  rpe: {
    entries: Array<{
      id: string;
      session_type: string;
      session_name: string | null;
      duration_minutes: number;
      rpe: number;
      session_load: number;
      source: string | null;
      notes: string | null;
      submitted_at: string;
    }>;
  };
  readiness: {
    total_score: number | null;
    fatigue_energy: number | null;
    sleep_quality: number | null;
    sleep_duration: number | null;
    stress_mood: number | null;
    muscle_soreness: number | null;
    notes: string | null;
  } | null;
  external_load: Array<Record<string, unknown>>;
  context: { week_plan: Record<string, unknown> | null };
};

function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(Number(v))) return "-";
  return Number(v).toFixed(digits);
}

function sessionTypeLabel(t: string): string {
  switch (t) {
    case "match":
      return "Leikur";
    case "team_training":
      return "Liðsæfing";
    case "gym":
      return "Styrktaræfing";
    case "recovery":
      return "Endurheimt";
    case "individual":
      return "Einstaklingsæfing";
    default:
      return "Annað";
  }
}

function loadBandLabel(b: PlayerSnapshotPdfData["summary"]["load_band"]): string {
  if (b === "VERY_HIGH") return "Very hard";
  if (b === "HIGH") return "Hard";
  if (b === "MEDIUM") return "Moderate";
  if (b === "LIGHT") return "Light";
  if (b === "VERY_LIGHT") return "Very light";
  return "-";
}

function acwrTone(band: PlayerSnapshotPdfData["summary"]["acwr_band"]): Tone | undefined {
  if (band === "RISK") return "red";
  if (band === "CAUTION") return "amber";
  if (band === "OPTIMAL") return "green";
  return undefined;
}

/** Readiness band exactly as the API returns it (GREEN / AMBER / RED) — never re-derived here. */
function readinessTone(band: PlayerSnapshotPdfData["summary"]["readiness_band"]): Tone | undefined {
  return band ? toneOf(band) : undefined;
}

const SLEEP_HOURS: Record<number, string> = { 1: "<5", 2: "5-6", 3: "6-7", 4: "7-8", 5: "8+" };
const of5 = (v: number | null | undefined) => (v != null ? `${v}/5` : "-");

export function PlayerSnapshotPdfDocument({ data }: { data: PlayerSnapshotPdfData }) {
  const sev = data.risk_analysis.overallSeverity;
  const sevTone: Tone = sev === "HIGH" ? "red" : sev === "ELEVATED" ? "amber" : "green";
  const badgeLabel = sev === "HIGH" ? "Há áhætta" : sev === "ELEVATED" ? "Aukin aðgát" : "Lág áhætta";
  const name = data.player.full_name ?? "-";
  const s = data.summary;
  const rd = data.readiness;
  const rTone = readinessTone(s.readiness_band);

  return (
    <Document>
      <BrandPage
        doc="Player snapshot"
        context={name}
        kicker="Daily snapshot"
        title={name}
        subtitle={`${data.player.position ?? "-"}  ·  Dagsetning: ${data.date}`}
        chips={[{ text: badgeLabel, tone: sevTone }]}
        note={`MicroPulse · Player daily snapshot · ${name} · ${data.date}`}
      >
        {/* Layer 0 — the rule-based risk verdict */}
        <Verdict
          tone={sevTone}
          label={`Áhættugreining · ${badgeLabel}`}
          headline={data.risk_analysis.summary}
          confidence={`${data.risk_analysis.drivers.length} áhættuþættir · ${s.rpe_count} RPE · ${rd ? "readiness skráð" : "engin readiness færsla"}`}
        />

        {/* Layer 1 — the plain facts */}
        <FactRow
          facts={[
            {
              value: s.readiness_total != null ? `${s.readiness_total}%` : "-",
              label: "Readiness check-in",
              sub: `${s.readiness_band ? `Score band ${s.readiness_band}` : "No entry"}${s.readiness_total_raw != null ? ` · ${s.readiness_total_raw}/25` : ""}`,
              tone: rTone,
            },
            {
              value: s.daily_rpe_load_total > 0 ? String(s.daily_rpe_load_total) : "-",
              label: "Daily load (sRPE)",
              sub: loadBandLabel(s.load_band),
            },
            {
              value: fmtNum(s.avg_rpe, 1),
              label: `Avg RPE (${s.rpe_count})`,
              sub: "Scale 1-10",
            },
          ]}
        />

        <Section title="Áhættuþættir">
          {data.risk_analysis.drivers.length > 0 ? (
            data.risk_analysis.drivers.map((d) => {
              const tone: Tone = d.severity === "RED" ? "red" : "amber";
              return (
                <Card key={d.key} style={{ marginBottom: 5, borderLeftWidth: 3, borderLeftColor: tone === "red" ? C.red : C.amber }} pad={9}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
                      <Status tone={tone} text={d.severity} size={7.5} />
                      <Text style={[fb(600), { fontSize: 9.5, flex: 1 }]}>{clean(d.label)}</Text>
                    </View>
                    <Text style={[fb(600), { fontSize: 9, color: C.mute }]}>{clean(d.value)}</Text>
                  </View>
                  <Body size={8.5} color={C.mute}>{d.explanation}</Body>
                </Card>
              );
            })
          ) : (
            <Body color={C.mute}>Engir áhættuþættir greindir fyrir þennan dag.</Body>
          )}

          {data.risk_analysis.recommendations.length > 0 ? (
            <Card style={{ marginTop: 3 }}>
              <Label color={C.cobalt}>Tillögur að aðgerðum</Label>
              {data.risk_analysis.recommendations.map((r, i) => (
                <View key={i} wrap={false} style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
                  <Text style={[fb(600), { fontSize: 8.75, color: C.cobalt, width: 10 }]}>{`${i + 1}.`}</Text>
                  <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, flex: 1 }]}>{clean(r)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </Section>

        {/* Layer 2 — behind the numbers */}
        <Section title="Álag · load ratio" hint="ACWR = acute (7-day) load ÷ chronic (28-day) load. A context number for spikes, not an injury predictor.">
          <StatGrid
            cols={3}
            items={[
              { label: "ACWR", value: fmtNum(s.acwr, 2), sub: s.acwr_band ?? "N/A", tone: acwrTone(s.acwr_band) },
              { label: "Acute 7d", value: fmtNum(s.acute_load_7d, 0), sub: "AU" },
              { label: "Chronic 28d", value: fmtNum(s.chronic_load_28d, 0), sub: "AU" },
            ]}
          />
        </Section>

        <Section title="Session RPE entries">
          {data.rpe.entries.length === 0 ? (
            <Body color={C.mute}>Engar RPE færslur fyrir þennan dag.</Body>
          ) : (
            <Table
              cols={[
                { label: "Session", flex: 2.4 },
                { label: "Mín", width: 34, align: "right" },
                { label: "RPE", width: 30, align: "right" },
                { label: "Load", width: 40, align: "right", strong: true },
                { label: "Skráð", width: 92 },
                { label: "Src", width: 52 },
              ]}
              rows={data.rpe.entries.map((e) => [
                <View key="s">
                  <Text style={[fb(600), { fontSize: 8.5 }]}>{clean(`${sessionTypeLabel(e.session_type)}${e.session_name ? ` · ${e.session_name}` : ""}`)}</Text>
                  {e.notes ? <Text style={[fb(400), { fontSize: 7.75, color: C.mute, marginTop: 1.5, lineHeight: 1.35 }]}>{clean(`"${e.notes}"`)}</Text> : null}
                </View>,
                String(e.duration_minutes),
                String(e.rpe),
                String(e.session_load),
                new Date(e.submitted_at).toLocaleString("is-IS"),
                e.source ?? "-",
              ])}
            />
          )}
        </Section>

        <Section title="Readiness / wellness" wrap={false}>
          {rd ? (
            <>
              <StatGrid
                cols={3}
                items={[
                  { label: "Total (raw 5-25)", value: fmtNum(rd.total_score, 0) },
                  { label: "Sleep quality", value: of5(rd.sleep_quality) },
                  {
                    label: "Sleep duration",
                    value: rd.sleep_duration != null ? `${rd.sleep_duration}/5 (${SLEEP_HOURS[Number(rd.sleep_duration)] ?? ""} klst)` : "-",
                  },
                  { label: "Fatigue / energy", value: of5(rd.fatigue_energy) },
                  { label: "Stress / mood", value: of5(rd.stress_mood) },
                  { label: "Muscle soreness", value: of5(rd.muscle_soreness) },
                ]}
              />
              {rd.notes ? <Body size={8.75} color={C.mute} mt={5}>{`Athugasemd: "${rd.notes}"`}</Body> : null}
            </>
          ) : (
            <Body color={C.mute}>Engin readiness færsla fyrir þennan dag.</Body>
          )}
        </Section>

        {data.external_load.length > 0 ? (
          <Section title="GPS / external load (Catapult)">
            {data.external_load.map((row, i) => {
              const n = (k: string) => {
                const v = row[k];
                return v == null ? null : Number(v);
              };
              const src = (row.source as string | null) ?? "-";
              return (
                <View key={i} wrap={false} style={{ marginBottom: 6 }}>
                  <Label>{`Source: ${src}`}</Label>
                  <StatGrid
                    cols={3}
                    items={[
                      { label: "Total dist (m)", value: fmtNum(n("total_distance"), 0) },
                      { label: "Player load", value: fmtNum(n("total_player_load"), 0) },
                      { label: "HSR (vb5+vb6)", value: fmtNum(n("high_speed_distance"), 0) },
                      { label: "Sprint (vb6) m", value: fmtNum(n("velocity_band6_total_distance"), 0) },
                      { label: "Accels", value: fmtNum(n("tot_as"), 0) },
                      { label: "Decels", value: fmtNum(n("tot_ds"), 0) },
                      { label: "Accel B2-3", value: fmtNum(n("accel_b2_3_tot_effs_gen2"), 0) },
                      { label: "Decel B2-3", value: fmtNum(n("decel_b2_3_tot_effs_gen2"), 0) },
                      { label: "IMA total", value: fmtNum(n("ima_total"), 0) },
                    ]}
                  />
                </View>
              );
            })}
          </Section>
        ) : null}

        {data.context.week_plan ? (
          <Section title="Samhengi / week setup">
            <Body>{`Day type: ${String((data.context.week_plan as { day_type?: string }).day_type ?? "-")}`}</Body>
          </Section>
        ) : null}

        {/* Closing card — how to read / source */}
        <Card style={{ marginTop: 4 }}>
          <Label>Source / how to read</Label>
          <Provenance>
            Áhættugreining (risk analysis) is rule-computed from the day&apos;s check-in, session RPE (sRPE = RPE x minutes, Foster) and the acute:chronic load ratio - no AI. Score band = the zone of the wellness check-in score (raw 5-25); the day&apos;s readiness verdict colour (each player vs his own norm) lives on the Daily Briefing. ACWR is spike-size context, not an injury predictor (Gabbett 2016, Impellizzeri 2020).
          </Provenance>
        </Card>
      </BrandPage>
    </Document>
  );
}
