"use client";

/**
 * LoadPlanPdf — builds and downloads a pre-session "Today's Load Target" PDF
 * from the deterministic load plan. Explainability-first: the bottom line (the
 * SAME sentence as the on-screen card) first, then the plain facts (readiness
 * check-ins, the headline targets), the "why" paragraphs, then the raw tables.
 *
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text } from "@react-pdf/renderer";
import { buildLoadPlanNarrative, buildLoadPlanBottomLine } from "@/lib/micropulse/loadPlan/narrative";
import { BrandPage, Body, Bullets, C, Card, FactRow, Label, Provenance, Section, Status, TONE, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob, toneOf } from "@/components/pdf/brand";

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
  sprint: "Sprint distance (m)", accel: "Accelerations (B2-3)", decel: "Decelerations (B2-3)", ima: "Long-run distance (m)",
};
const fmt = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

type AttentionPlayer = { player_id: string; name: string; color: string; score: number | null; acwr: number | null; reason: string | null; drivers?: string[] };
type ReadinessSummary = { green: number; yellow: number; red: number; checkedIn: number; rosterWithGps: number };

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

function LoadPlanDoc({ plan, topAttention, readiness, restDay }: { plan: LoadPlanForPdf; topAttention: AttentionPlayer[]; readiness: ReadinessSummary | null; restDay: boolean }) {
  const p = plan.planned;
  const team = plan.teamName ?? "Team";
  const availSet = new Set(plan.availableKpis ?? PDF_COL_ORDER);
  const valueKeys = PDF_COL_ORDER.filter((k) => availSet.has(k));
  const legendBits: string[] = [];
  if (availSet.has("hsr")) legendBits.push("HSR VB5 = high-speed running (velocity band 5)");
  if (availSet.has("sprint")) legendBits.push("Sprint VB6 = sprint distance (band 6)");
  if (availSet.has("efforts")) legendBits.push("Efforts = combined high-intensity accel + decel count (Core/Lite pods)");
  else if (availSet.has("accel")) legendBits.push("Acc/Dec B2-3 = high-intensity accel/decel (effort bands 2-3); IMA COD = change-of-direction distance");
  if (availSet.has("imaAccel")) legendBits.push("IMA Acc/Dec = explosive accel/decel counts; CoD = change-of-direction events (braking load: McBurnie 2022); Jumps = take-offs/landings");
  const moveLegend = legendBits.length ? `${legendBits.join("; ")}.` : "";
  // The SAME explainability paragraphs / bottom line the on-screen card renders.
  const narrative = buildLoadPlanNarrative(plan, readiness?.checkedIn ?? null);
  const bottomLine = buildLoadPlanBottomLine(plan, readiness?.red ?? null);
  const generatedAt = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const subtitle = `${team} · ${plan.sessionDate}${restDay ? " · REST DAY (no training load planned)" : p.applicable ? ` · ${p.mdLabel ?? "training day"} · ${p.loadType.toUpperCase()} · ${p.matchPct}% of match` : " · recent-load baseline (no match-week set)"}`;
  const showTargets = !restDay && (plan.hasTargets ?? p.applicable);
  const tgt = (k: string) => plan.targets.find((x) => x.kpi === k);
  const headKpis = ["playerLoad", "totalDistance", "hsr"].map(tgt).filter((x): x is KpiTarget => !!x && x.target != null);

  return (
    <Document>
      <BrandPage
        doc="Pre-session report"
        context={team}
        kicker="Pre-session report"
        title="Today's Load Target"
        subtitle={subtitle}
        chips={restDay ? [{ text: "Rest day" }] : p.applicable ? [{ text: p.mdLabel ?? "Training day" }, { text: p.loadType, tone: "cobalt" }] : [{ text: "Recent-load baseline" }]}
        note={`MicroPulse · ${team} · generated ${generatedAt}`}
      >
        {/* Layer 0 — the bottom line */}
        {restDay ? (
          <Verdict tone="neutral" label="Rest day" headline="Rest day - no training load planned." body="Marked as a rest day, so no load targets are prescribed. Use today for recovery; the readiness check-ins below still flag anyone to keep an eye on." />
        ) : plan.hasTargets ? (
          <Verdict
            tone="neutral"
            label={plan.mode === "recent_baseline" ? "Recent-load baseline" : `${p.mdLabel ?? "Training day"} · ${p.matchPct}% of match`}
            headline={tx(bottomLine)}
            confidence={`${plan.coverage.playersWithHistory}/${plan.coverage.totalPlayers} players with history · ${plan.coverage.distinctDates} days in ${plan.coverage.windowDays}d`}
          />
        ) : null}

        {/* Layer 1 — readiness + headline targets */}
        {readiness && (
          <FactRow
            facts={[
              { value: String(readiness.checkedIn), label: "Checked in", sub: `${readiness.rosterWithGps} on the GPS roster` },
              { value: String(readiness.green), label: "GREEN", sub: "ready", tone: "green" },
              { value: String(readiness.yellow), label: "YELLOW", sub: "modify", tone: "amber" },
              { value: String(readiness.red), label: "RED", sub: "recovery", tone: "red" },
            ]}
          />
        )}
        {showTargets && headKpis.length > 0 && (
          <FactRow facts={headKpis.map((k) => ({ value: fmt(k.target), label: `${LABEL[k.kpi] ?? k.kpi} / player`, sub: k.pctOfMatch != null ? `${k.pctOfMatch}% of match (${fmt(k.matchRef)})` : undefined }))} />
        )}

        {/* Readiness-adjusted prescription — mirrors the on-screen amber box. */}
        {showTargets && plan.readinessAdjustPct !== 0 && plan.adjustedTargets?.length ? (
          <Card tone="amber" style={{ marginBottom: 10 }}>
            <Label color={C.amberText}>{`After the ${plan.readinessAdjustPct}% readiness trim - prescribe today`}</Label>
            <Body color={C.amberText}>{tx(plan.adjustedTargets.filter((t) => t.target != null).map((t) => `${LABEL[t.kpi] ?? t.kpi} ${fmt(t.target)}`).join(" · "))}</Body>
          </Card>
        ) : null}

        {restDay ? null : !showTargets ? (
          <Section title="Why no targets">
            <Body>{tx(p.rationaleEN)}</Body>
          </Section>
        ) : (
          <>
            {/* The "why" — the SAME paragraphs shown on the page. */}
            <Section title="Why this target">
              {plan.mode === "recent_baseline" && plan.baselineNote ? <Body color={C.cobalt}>{tx(plan.baselineNote)}</Body> : null}
              <Text style={[fb(400), { fontSize: 9, lineHeight: 1.45, marginTop: 3, marginBottom: 3 }]}>
                <Text style={fb(600)}>{`Session ${plan.mode === "recent_baseline" ? "emphasis" : "type"}: ${plan.mode === "recent_baseline" ? "mixed" : p.loadType}`}</Text>
                {tx(
                  (plan.mode === "recent_baseline" && plan.recentLean?.lean ? ` · recent squad lean: ${plan.recentLean.lean}` : "") +
                  (plan.mode !== "recent_baseline" ? ` · band ${p.band} · sRPE ${p.sessionLoad} AU (RPE ${p.rpe} × ${p.durationMin} min)` : "") +
                  (plan.mode === "recent_baseline" && plan.targetSrpe != null ? ` · target sRPE ${plan.targetSrpe} AU (RPE ~${plan.targetRpe} × ${plan.targetDurationMin} min)` : "") +
                  (plan.teamAcwr != null ? ` · Team ACWR ${plan.teamAcwr.toFixed(2)}` : "") +
                  (plan.readinessAdjustPct !== 0 ? ` · Readiness suggests ${plan.readinessAdjustPct}%` : ""),
                )}
              </Text>
              {narrative.map((para, i) => <Body key={i} mt={3}>{tx(para)}</Body>)}
            </Section>
          </>
        )}

        {/* Short tables are kept whole (wrap={false}): the kit Table's fixed header otherwise repeats
            alone on the next page when only the card's bottom edge spills over. */}
        {/* Top attention — named exceptions (canonical readiness colour + its word) */}
        {(readiness || topAttention.length > 0) && (
          <Section
            title="Top attention today"
            hint={readiness ? `${readiness.checkedIn} checked in (${readiness.green} green, ${readiness.yellow} yellow, ${readiness.red} red)` : undefined}
          >
            {topAttention.length === 0 ? (
              <Body>No flagged check-ins - squad is broadly green.</Body>
            ) : (
              <Table
                cols={[{ label: "Player", width: 120 }, { label: "Verdict", width: 66 }, { label: "Readiness", width: 54, align: "right" }, { label: "Why", flex: 1 }]}
                rows={topAttention.slice(0, 20).map((a) => {
                  const tone = toneOf(a.color);
                  return [
                    tx(a.name),
                    <Status key="s" tone={tone} text={a.color.toUpperCase()} size={8} />,
                    a.score != null ? `${a.score}/25` : "-",
                    a.drivers && a.drivers.length > 0
                      ? <Bullets key="d" items={a.drivers.map(tx)} size={8} />
                      : <Text key="r" style={[fb(400), { fontSize: 8, lineHeight: 1.35 }]}>{tx(a.reason ?? "")}</Text>,
                  ];
                })}
              />
            )}
          </Section>
        )}

        {showTargets && (
          <>
            <Section wrap={false} title={`Per-player targets${plan.mode === "recent_baseline" ? " (recent-load baseline)" : " (anchored to match demand)"}`}>
              <Table
                cols={[{ label: "Metric", flex: 1.7 }, { label: "Target / player", flex: 1, align: "right", strong: true }, { label: "% of match (ref)", flex: 1, align: "right" }]}
                rows={plan.targets.map((t) => [LABEL[t.kpi] ?? t.kpi, fmt(t.target), t.pctOfMatch != null ? `${t.pctOfMatch}% (${fmt(t.matchRef)})` : "-"])}
              />
            </Section>

            {/* Leading in — last sessions before today */}
            {plan.recentSessions.length > 0 ? (
              <Section wrap={false} title={`Leading in - last ${plan.recentSessions.length} session${plan.recentSessions.length === 1 ? "" : "s"} (per player)`}>
                <Table
                  cols={[{ label: "Date", flex: 1.2 }, { label: "Player Load", flex: 1, align: "right", strong: true }, { label: "Distance (m)", flex: 1, align: "right" }, { label: "HSR (m)", flex: 1, align: "right" }]}
                  rows={plan.recentSessions.map((rs) => [`${rs.date}${rs.isPeak ? "  · peak/match" : ""}`, fmt(rs.playerLoad), fmt(rs.totalDistance), fmt(rs.hsr)])}
                  rowTone={(i) => (plan.recentSessions[i]?.isPeak ? "neutral" : null)}
                />
                <Provenance>{`Per-player team means on the squad's last training days before this session (oldest first). "Peak/match" marks a highest-load (~ match) day. This is the trajectory today's target sits on top of.`}</Provenance>
              </Section>
            ) : null}

            {plan.recentAvg ? (
              <Section wrap={false} title="Every metric - target vs match demand vs recent average">
                <Table
                  cols={[{ label: "Metric", flex: 2 }, { label: "Target", flex: 1, align: "right", strong: true }, { label: "% match", flex: 0.7, align: "right" }, { label: "Match ref", flex: 0.8, align: "right" }, { label: "Recent avg", flex: 0.8, align: "right" }]}
                  rows={plan.targets.map((t) => [LABEL[t.kpi] ?? t.kpi, fmt(t.target), t.pctOfMatch != null ? `${t.pctOfMatch}%` : "-", fmt(t.matchRef), fmt(plan.recentAvg?.[t.kpi] ?? null)])}
                />
              </Section>
            ) : null}

            <Section title="Per-player targets - every metric">
              <Table
                size={7.25}
                dense
                cols={[
                  { label: "Player", flex: 2.2 },
                  ...valueKeys.map((k) => ({ label: PDF_COL_LABEL[k], flex: 1, align: "right" as const })),
                  { label: "ACWR", flex: 0.8, align: "right" },
                  { label: "Flag", flex: 0.9 },
                ]}
                rows={plan.perPlayer.map((pp) => {
                  const v = pp as unknown as Record<string, number | null>;
                  const hi = pp.acwr != null && pp.acwr >= 1.3, lo = pp.acwr != null && pp.acwr < 0.8;
                  return [
                    tx(pp.name),
                    ...valueKeys.map((k) => fmt(v[k])),
                    <Text key="a" style={[hi ? fh(700) : fb(400), { fontSize: 7.25, textAlign: "right", color: hi ? TONE.red.text : lo ? TONE.amber.text : C.ink }]}>{pp.acwr != null ? pp.acwr.toFixed(2) : "-"}</Text>,
                    <Text key="f" style={[fb(pp.flag === "reduce" || pp.flag === "build" ? 600 : 400), { fontSize: 7.25, color: pp.flag === "reduce" ? TONE.red.text : pp.flag === "build" ? TONE.amber.text : C.ink }]}>{pp.flag === "reduce" ? "reduce" : pp.flag === "build" ? "build" : "-"}</Text>,
                  ];
                })}
              />
            </Section>

            <Provenance>
              {tx(`${moveLegend ? `${moveLegend} ` : ""}Targets = match reference × ${p.matchPct}% (the microcycle day's share of match demand) re-weighted by session type. Match reference = the squad's average on its ${plan.matchDaysUsed} highest-load days over the last ~17 weeks. ACWR = acute(7d) ÷ chronic(28d) Player Load; 0.8–1.3 ≈ a load change within the familiar range — a spike-size context for scaling, not an injury predictor (Gabbett 2016; not validated for injury risk — Impellizzeri 2020).`)}
            </Provenance>
          </>
        )}
      </BrandPage>
    </Document>
  );
}

export async function downloadLoadPlanPdf(
  plan: LoadPlanForPdf,
  topAttention: AttentionPlayer[] = [],
  readiness: ReadinessSummary | null = null,
  restDay = false,
) {
  const blob = await renderPdfBlob(() => <LoadPlanDoc plan={plan} topAttention={topAttention} readiness={readiness} restDay={restDay} />);
  saveBlob(blob, `load-target-${plan.sessionDate}.pdf`);
}
