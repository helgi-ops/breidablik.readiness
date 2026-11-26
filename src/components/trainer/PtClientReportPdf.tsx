"use client";

/**
 * PtClientReportPdf — a sendable 4-week progress report for one PT client:
 * adherence, readiness trend, internal-load (ACWR), strength PRs and volume.
 * Explainability-first: the bottom line first → four headline numbers → the plain
 * reads per area → raw PR / best-lift tables → method & sources.
 * Styling comes from the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, View } from "@react-pdf/renderer";
import {
  BrandPage, Body, Card, FactRow, Label, Provenance, Section, StatGrid, Table, Verdict, renderPdfBlob, saveBlob,
} from "@/components/pdf/brand";

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

const fmt = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
const fmt1 = (n: number | null | undefined) => (n == null ? "-" : (Math.round(n * 10) / 10).toLocaleString("en-US"));

const STATUS_LABEL: Record<string, string> = { low: "below baseline", optimal: "in the sweet spot", high: "elevated", very_high: "spiking", building: "still building a baseline" };

export async function downloadPtClientReportPdf(d: PtClientReport, trainerName = "MicroPulse PT") {
  const generatedAt = new Date(d.generatedAt ?? Date.now()).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Bottom-line summary.
  const adhTxt = d.adherence.pct != null ? `${d.adherence.pct}% session adherence (${d.adherence.completed}/${d.adherence.total})` : "no logged sessions yet";
  const prTxt = d.strength.recent_prs.length ? `, ${d.strength.recent_prs.length} new strength PR${d.strength.recent_prs.length === 1 ? "" : "s"}` : "";
  const rdTxt = d.readiness.avgScore != null ? `, average readiness ${fmt1(d.readiness.avgScore)}/25` : "";
  const bottomLine = `Last ${d.period.weeks} weeks: ${adhTxt}${rdTxt}${prTxt}. Internal load ${STATUS_LABEL[d.training.status] ?? d.training.status}.`;
  const loadStatus = STATUS_LABEL[d.training.status] ?? d.training.status;
  const acwr = d.training.acwr != null ? d.training.acwr.toFixed(2) : "-";

  const blob = await renderPdfBlob(() => (
    <Document>
      <BrandPage
        doc="Client progress report"
        context={d.client.name}
        kicker="MicroPulse PT · Client progress report"
        title={d.client.name}
        subtitle={`${d.period.start} - ${d.period.end} · ${d.period.weeks}-week snapshot`}
        note={`MicroPulse PT · ${trainerName} · generated ${generatedAt}`}
      >
        {/* Layer 0 — the bottom line */}
        <Verdict tone="cobalt" label="Bottom line" headline={bottomLine} />

        {/* Layer 1 — the headline numbers */}
        <FactRow
          facts={[
            { value: d.adherence.pct != null ? `${d.adherence.pct}%` : "-", label: "Adherence", sub: `${d.adherence.completed}/${d.adherence.total} sessions` },
            { value: `${fmt1(d.readiness.avgScore)} /25`, label: "Avg readiness", sub: `${d.readiness.checkIns} check-ins` },
            { value: acwr, label: "Load ACWR", sub: loadStatus },
            { value: String(d.strength.recent_prs.length), label: "New strength PRs" },
          ]}
        />

        <Section title="Readiness - how they felt">
          <Body>
            {d.readiness.checkIns > 0
              ? `${d.readiness.checkIns} check-ins over the period — ${d.readiness.green} green, ${d.readiness.yellow} yellow, ${d.readiness.red} red, averaging ${fmt1(d.readiness.avgScore)}/25. ${d.readiness.red === 0 ? "No red days — recovery kept pace with training." : `${d.readiness.red} red day${d.readiness.red === 1 ? "" : "s"} flagged — worth a conversation about sleep/stress/load.`}`
              : "No readiness check-ins logged in this period — encourage daily check-ins to track recovery."}
          </Body>
          {d.readiness.checkIns > 0 ? (
            <DayTiles green={d.readiness.green} yellow={d.readiness.yellow} red={d.readiness.red} />
          ) : null}
        </Section>

        <Section title="Training load (last 7 days)">
          <Body>
            {`Internal load (sRPE): strength ${fmt(d.training.strength_7d)} AU + sport ${fmt(d.training.sport_7d)} AU = ${fmt(d.training.total_7d)} AU total. Acute:chronic ratio ${acwr} — ${loadStatus} (0.8–1.3 = familiar load range; a spike-size context, not an injury predictor — Gabbett 2016, Impellizzeri 2020). Confidence: ${d.training.confidence}.`}
          </Body>
        </Section>

        <Section title="Strength volume (tonnage)">
          <Body>
            {`This week ${fmt(d.volume.this_week)} kg vs last week ${fmt(d.volume.last_week)} kg${d.volume.delta_pct != null ? ` (${d.volume.delta_pct >= 0 ? "+" : ""}${d.volume.delta_pct}%)` : ""}. Tonnage acute:chronic ${d.volume.acwr != null ? d.volume.acwr.toFixed(2) : "-"} (${STATUS_LABEL[d.volume.acwr_status] ?? d.volume.acwr_status}).${d.volume.by_lift.length ? ` Top lifts by volume: ${d.volume.by_lift.slice(0, 4).map((l) => `${l.lift} ${fmt(l.total)} kg`).join(", ")}.` : ""}`}
          </Body>
        </Section>

        {/* Layer 2 — the raw tables */}
        {d.strength.recent_prs.length > 0 ? (
          <Section title="New personal records" wrap={false}>
            <Table
              cols={[{ label: "Lift", flex: 46 }, { label: "Est. 1RM (kg)", flex: 27, align: "right", strong: true }, { label: "Improvement", flex: 27, align: "right" }]}
              rows={d.strength.recent_prs.slice(0, 12).map((p) => [p.exercise, fmt1(p.e1rm), `+${fmt1(p.delta_kg)} kg`])}
            />
          </Section>
        ) : null}

        {d.strength.records.length > 0 ? (
          <Section title="Current best lifts (estimated 1RM)" wrap={false}>
            <Table
              cols={[{ label: "Lift", flex: 46 }, { label: "Best e1RM (kg)", flex: 27, align: "right", strong: true }, { label: "Top set (kg)", flex: 27, align: "right" }]}
              rows={d.strength.records.slice(0, 10).map((r) => [r.exercise, fmt1(r.best_e1rm), fmt1(r.best_weight)])}
            />
          </Section>
        ) : null}

        <Card style={{ marginTop: 4 }}>
          <Label>How these numbers are calculated</Label>
          <Provenance>
            Adherence = completed ÷ logged sessions. Readiness = daily wellness check-in (sleep, energy, soreness, stress) on a 5–25 scale. Internal load = session RPE × minutes (Foster sRPE). e1RM = estimated 1-rep max (Epley, RIR-adjusted). ACWR = acute(7d) ÷ chronic(28d) load; 0.8–1.3 = familiar range, a spike-size context, not an injury predictor (Gabbett 2016, Impellizzeri 2020).
          </Provenance>
        </Card>
      </BrandPage>
    </Document>
  ));

  saveBlob(blob, `pt-progress-${d.client.name.replace(/\s+/g, "-")}-${d.period.end}.pdf`);
}

/** Green / yellow / red day counts — colour plus the word, never colour alone. */
function DayTiles({ green, yellow, red }: { green: number; yellow: number; red: number }) {
  return (
    <View style={{ marginTop: 6 }}>
      <StatGrid
        cols={3}
        items={[
          { label: "Green days", value: String(green), tone: "green" },
          { label: "Yellow days", value: String(yellow), tone: "amber" },
          { label: "Red days", value: String(red), tone: "red" },
        ]}
      />
    </View>
  );
}
