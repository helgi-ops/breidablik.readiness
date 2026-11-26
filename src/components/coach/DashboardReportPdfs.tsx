/**
 * Dashboard PDF reports (readiness-risk + post-training) — extracted from DevCoachDashboardClient so the
 * heavy @react-pdf/renderer engine is NOT in the coach landing's First Load JS. Imported LAZILY (dynamic
 * import) from the download handlers. Self-contained: shared consts/types come from their libs, the
 * data-shape types are type-only imports from the dashboard, and the small formatters are local copies.
 *
 * Look + layered read come from the shared PDF kit (src/components/pdf/brand.tsx):
 *   layer 0  <Verdict>  — the day's rule-based verdict, first and boldest
 *   layer 1  <FactRow>  — the 2-4 plain facts behind it (named players, key numbers)
 *   layer 2  tables     — per-player raw numbers, GPS / IMA jargon on later pages
 * Readiness colours are printed exactly as the data carries them (readinessStatus / readinessFlag),
 * never re-derived here. Nothing in these reports is AI-generated.
 */
import { Document, Text, View } from "@react-pdf/renderer";
import {
  BrandPage, Bullets, C, Card, Cols, FactRow, Label, Provenance, Section, StatGrid, Status, TONE, Table, Verdict,
  clean, fb, fh, renderPdfBlob, saveBlob, toneOf,
  type Col, type Tone,
} from "@/components/pdf/brand";
import type { ImaPlayerDay } from "@/lib/micropulse/imaDayProfile";
import { PVA_KPIS, PVA_LABEL, type PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { SessionEnoughPdfPage } from "@/components/coach/SessionEnoughPdf";
import type {
  ReadinessRiskReportData,
  ReadinessRiskReportPlayer,
  PostTrainingReportData,
} from "@/app/coach/dev-coach-dashboard/DevCoachDashboardClient";

const DASH = "-";

// Small formatters (local copies — kept tiny and dependency-free so this module stays self-contained).
function scoreFmt(x: number | null) { return x == null ? DASH : String(x); }
function numFmt(x: number | null, digits = 2) { return x == null ? DASH : x.toFixed(digits); }
function confidenceFmt(x: number | null) { if (x == null) return DASH; return x <= 1 ? `${Math.round(x * 100)}%` : `${Math.round(x)}%`; }
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ══ Readiness-risk report ═══════════════════════════════════════════════════

const ACTION: Record<ReadinessRiskReportPlayer["ateSessionMode"], { tone: Tone; title: string; note: string }> = {
  recovery: { tone: "red", title: "RECOVERY - Do not train today", note: "Athlete's body is under significant stress. Rest or light recovery work only." },
  modified: { tone: "amber", title: "REDUCE LOAD - Modified session", note: "Reduce intensity or volume. Monitor closely during training." },
  full: { tone: "green", title: "FULL PARTICIPATION - Monitor closely", note: "Can train normally. Flag is precautionary - keep an eye on this player." },
};
const INJURY_TONE: Record<ReadinessRiskReportPlayer["injuryRiskLevel"], Tone> = { LOW: "green", MODERATE: "amber", HIGH: "red" };
/** The player's readiness colour as the data carries it (YELLOW → amber swatch, word stays YELLOW). */
const readinessTone = (s: ReadinessRiskReportPlayer["readinessStatus"]): Tone => (s === "RED" ? "red" : "amber");

const REF_COLS: Col[] = [
  { label: "Wellness score", align: "center" },
  { label: "Sleep (1-5)", align: "center" },
  { label: "Load ratio", align: "center" },
  { label: "HRV", align: "center" },
  { label: "Load index", align: "center" },
  { label: "vs. baseline", align: "center" },
];

function RiskPlayerCard({ p }: { p: ReadinessRiskReportPlayer }) {
  const action = ACTION[p.ateSessionMode];
  const at = TONE[action.tone];
  const reasons = p.why.length ? p.why : ["No specific reasons available."];
  const injRecs = p.injuryRecommendation.length ? p.injuryRecommendation : ["Continue with planned load and routine monitoring."];
  const flips = (p.counterfactuals ?? []).slice(0, 2);
  return (
    <Card style={{ marginBottom: 10 }}>
      {/* Name + readiness colour */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={[fh(700), { fontSize: 14, flex: 1 }]}>{clean(p.name)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={[fb(400), { fontSize: 7.75, color: C.mute }]}>{`Score ${scoreFmt(p.score)}  ·  Confidence ${confidenceFmt(p.confidence)}`}</Text>
          <Status tone={readinessTone(p.readinessStatus)} text={p.readinessStatus} size={9} />
        </View>
      </View>

      {/* Coach action — prominent */}
      <View style={{ backgroundColor: at.tint, borderWidth: 1, borderColor: at.edge, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 9 }}>
        <Label color={at.text}>Today&apos;s recommendation</Label>
        <Text style={[fh(700), { fontSize: 12, color: at.text, marginTop: 1 }]}>{action.title}</Text>
        <Text style={[fb(400), { fontSize: 8.75, color: C.ink, marginTop: 2 }]}>{action.note}</Text>
      </View>

      <Cols gap={16}>
        <View>
          <Label>Why this player is flagged</Label>
          <Bullets items={reasons} size={8.75} />
          {flips.length ? (
            <View style={{ marginTop: 3 }}>
              <Label>What would change the colour</Label>
              <Bullets items={flips.map((f) => f.descriptionEN)} size={8.25} />
            </View>
          ) : null}
        </View>
        <View>
          <Label>Injury risk</Label>
          <View style={{ marginTop: 1, marginBottom: 4 }}>
            <Status tone={INJURY_TONE[p.injuryRiskLevel]} text={p.injuryRiskLevel} size={9} />
          </View>
          <Bullets items={injRecs} size={8.5} />
        </View>
      </Cols>

      {/* Reference numbers — compact, for staff use */}
      <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.hair }}>
        <Label color={C.faint}>Reference data (staff)</Label>
        <Table
          dense
          size={8}
          cols={REF_COLS}
          rows={[[
            scoreFmt(p.checkInScore),
            p.sleepScore != null ? `${p.sleepScore}/5` : DASH,
            p.acwr != null ? numFmt(p.acwr) : DASH,
            p.hrv != null ? numFmt(p.hrv) : DASH,
            p.zScore != null ? numFmt(p.zScore) : DASH,
            p.deltaZ != null ? numFmt(p.deltaZ) : DASH,
          ]]}
        />
      </View>
    </Card>
  );
}

function ReadinessRiskReportDocument({ data }: { data: ReadinessRiskReportData }) {
  const { green, yellow, red } = data.summary;
  const total = green + yellow + red;
  const flagged = data.flaggedPlayers;
  const tone: Tone = red > 0 ? "red" : yellow > 0 ? "amber" : "green";
  const byMode = (m: ReadinessRiskReportPlayer["ateSessionMode"]) => flagged.filter((p) => p.ateSessionMode === m).map((p) => p.name);
  const recovery = byMode("recovery");
  const modified = byMode("modified");
  const headline = flagged.length === 0
    ? "No players require attention today."
    : `${flagged.length} of ${total} players need attention today.`;
  const body = [
    `${red} at risk (RED), ${yellow} to monitor (YELLOW), ${green} ready (GREEN).`,
    recovery.length ? `Recovery only: ${recovery.join(", ")}.` : "",
    modified.length ? `Reduced load: ${modified.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  return (
    <Document title={`Daily Readiness Report - ${data.date}`} author="MicroPulse">
      <BrandPage
        doc="Readiness report"
        context={data.teamName || undefined}
        title="Daily Readiness Report"
        kicker={data.teamName || undefined}
        subtitle={`${data.date}  ·  Players requiring attention: ${flagged.length} of ${total}`}
        note="Colour = today's readiness verdict (each player vs his own norm). Recommendation = suggested session mode."
      >
        <Verdict
          tone={tone}
          label={red > 0 ? "At risk" : yellow > 0 ? "Monitor" : "Ready"}
          headline={headline}
          body={body}
        />
        <FactRow
          facts={[
            { value: String(green), label: "Ready", sub: "GREEN - train as planned", tone: "green" },
            { value: String(yellow), label: "Monitor", sub: "YELLOW - watch or modify", tone: "amber" },
            { value: String(red), label: "At risk", sub: "RED - recovery focus", tone: "red" },
          ]}
        />

        <Section title="Players requiring attention" hint="Each card: the colour, today's recommendation, the plain reasons, injury risk, then the raw numbers.">
          {flagged.length ? (
            flagged.map((p, i) => <RiskPlayerCard key={`${p.name}-${i}`} p={p} />)
          ) : (
            <Card><Text style={[fb(400), { fontSize: 9, color: C.mute }]}>No players requiring attention today.</Text></Card>
          )}
        </Section>

        {/* Team status — closing summary line */}
        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.rule }}>
          <Text style={[fb(600), { fontSize: 9 }]}>Team status:</Text>
          <Status tone="green" text={`${green} ready`} />
          <Status tone="amber" text={`${yellow} monitor`} />
          <Status tone="red" text={`${red} at risk`} />
        </View>
      </BrandPage>
    </Document>
  );
}

// ══ Post-training report ════════════════════════════════════════════════════

function numFmt2(v: number | null, digits = 0): string {
  if (v == null) return DASH;
  return v.toFixed(digits);
}

function pctFmt(v: number | null): string {
  if (v == null) return DASH;
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
    return `Upplifun liðsins á æfingunni var í meðallagi (meðal RPE ${score}). Líkamlegt álag var hóflegt - góð jafnvægisæfing milli álags og hvíldar. (${sub})`;
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
  if (rpe == null) return DASH;
  if (rpe <= 2) return "Very easy";
  if (rpe <= 4) return "Easy";
  if (rpe <= 6) return "Moderate";
  if (rpe <= 8) return "Hard";
  if (rpe <= 9) return "Very hard";
  return "Maximal";
}
const rpeTone = (rpe: number | null): Tone => (rpe != null && rpe >= 9 ? "red" : rpe != null && rpe >= 7 ? "amber" : "green");

function rpeLoadBand(sessionLoad: number | null): string {
  if (sessionLoad == null) return DASH;
  if (sessionLoad < 200) return "Very light  (<200)";
  if (sessionLoad < 400) return "Light  (200-399)";
  if (sessionLoad < 600) return "Moderate  (400-599)";
  if (sessionLoad < 800) return "Hard  (600-799)";
  return "Very hard  (800+)";
}

/** % of the 4-week average → tone + the word printed next to it (colour is never the only signal). */
const loadTone = (pct: number | null): Tone => (pct == null ? "neutral" : pct <= 110 ? "green" : pct <= 140 ? "amber" : "red");
const loadWord = (pct: number | null) => (pct == null ? DASH : pct <= 90 ? "below norm" : pct <= 110 ? "in line" : pct <= 140 ? "above norm" : "well above");

const PVA_TONE: Record<PvaStatus, Tone> = { on: "green", over: "amber", under: "amber", well_over: "red", well_under: "red", na: "neutral" };
const PVA_WORD: Record<PvaStatus, string> = { on: "on plan", over: "over", under: "under", well_over: "well over", well_under: "well under", na: DASH };

/** Coloured number for dense tables — the band meaning is spelled out in the legend under the table. */
function Num({ v, tone, bold = true }: { v: string; tone?: Tone | null; bold?: boolean }) {
  return <Text style={[fb(bold ? 600 : 400), { fontSize: 8, color: tone && tone !== "neutral" ? TONE[tone].text : C.ink, textAlign: "right" }]}>{clean(v)}</Text>;
}
function StatusCell({ tone, text, size = 8 }: { tone: Tone; text: string; size?: number }) {
  return text === DASH ? <Text style={[fb(400), { fontSize: size, color: C.mute }]}>{DASH}</Text> : <Status tone={tone} text={text} size={size} />;
}

const GPS_COLS: Col[] = [
  { label: "Leikmaður", flex: 1 },
  { label: "Staða", width: 40 },
  { label: "Pre", width: 60 },
  { label: "Dist", width: 44, align: "right" },
  { label: "%28D", width: 38, align: "right" },
  { label: "HSD", width: 40, align: "right" },
  { label: "%28D", width: 38, align: "right" },
  { label: "PL", width: 40, align: "right" },
  { label: "%28D", width: 38, align: "right" },
  { label: "PL/min", width: 40, align: "right" },
  { label: "Ac B2-3", width: 42, align: "right" },
  { label: "De B2-3", width: 42, align: "right" },
  { label: "Vmax", width: 36, align: "right" },
  { label: "ACWR", width: 36, align: "right" },
  { label: "Signal", width: 64, align: "center" },
];
const ATTN_TONE: Record<string, Tone> = { ALERT: "red", MONITOR: "amber", OK: "green" };

function PostTrainingReportDocument({ data }: { data: PostTrainingReportData }) {
  // GPS page only shows players who actually have GPS data
  const gpsPlayers = data.players.filter((p) => p.totalDistance != null);

  const alerts = data.players.filter((p) => p.attentionFlag === "ALERT");
  const monitors = data.players.filter((p) => p.attentionFlag === "MONITOR");

  // RPE table: all players who submitted RPE, sorted highest first
  const rpeTablePlayers = data.players.filter((p) => p.rpeSubmitted).sort((a, b) => (b.rpe ?? -1) - (a.rpe ?? -1));
  const interpretText = rpeInterpretation(data.rpeTeamAvg, data.rpeSubmissionCount, data.players.length);

  // IMA / stride page — sorted by long-run strides desc. `sprint_strides` is a legacy field name:
  // it holds strides in IMA Free Running runs ≥18 s (ima_fr_ge18; bout-duration bands,
  // docs/ima-free-running-bands.md) — sustained running, NOT sprinting.
  const ima = data.ima;
  const imaPlayers: ImaPlayerDay[] = ima
    ? [...ima.per_player].filter((p) => p.total_strides > 0).sort((a, b) => b.sprint_strides - a.sprint_strides)
    : [];

  // Load explainability — verdict, tone and an interpretation paragraph.
  const ls = data.loadSummary;
  const plPct = ls.pl.pctAvg;
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
          : `${plural(ls.spikePlayers.length, "player")} ran above their usual.`);
  // Detailed interpretation that walks through every number on the card.
  const fmtInt = (n: number | null) => (n == null ? DASH : Math.round(n).toLocaleString("en-US"));
  const loadInterpretation = (() => {
    if (plPct == null) return "";
    const parts: string[] = [];
    parts.push(
      `Player Load is the total accelerometer-derived mechanical work the squad absorbed today - the sum of every player's load. Today's team total of ${fmtInt(ls.pl.today)} is ${plPct}% of the ${fmtInt(ls.pl.avg)} the squad averages on a training day across the last 4 weeks, i.e. ${recentBand}.`,
    );
    if (ls.pl.pctMatch != null) {
      parts.push(
        `Measured against a typical match - the squad's single highest-load day in that window (~ ${fmtInt(ls.pl.peak)}) - today reached ${ls.pl.pctMatch}% of match demand, so the session was ${ls.pl.pctMatch >= 90 ? "essentially match-level" : ls.pl.pctMatch >= 60 ? "a substantial fraction of a game" : "well below match intensity"}.`,
      );
    }
    const dParts: string[] = [];
    if (ls.dist.pctAvg != null) dParts.push(`total distance ${fmtInt(ls.dist.today)} m (${ls.dist.pctAvg}% of the 4-week average)`);
    if (ls.hsd.pctAvg != null) dParts.push(`high-speed distance ${fmtInt(ls.hsd.today)} m (${ls.hsd.pctAvg}% of average)`);
    if (dParts.length) {
      parts.push(
        `Breaking that down, the squad covered ${dParts.join(" and ")} - total distance reflects running volume while high-speed distance (the top sprint bands) reflects intensity, so you can see whether today's load came from doing more or from running faster.`,
      );
    }
    if (ls.distribution.total > 0) {
      parts.push(
        `Player-by-player against each athlete's own 4-week norm: ${ls.distribution.above} ran 30% or more above their usual, ${ls.distribution.elevated} were mildly elevated, ${ls.distribution.inLine} were in line and ${ls.distribution.below} below - so the team number ${ls.distribution.above > 0 ? "is not uniform; the spikes below are the ones carrying it" : "reflects a broadly even session"}.`,
      );
    }
    parts.push(
      plPct <= 110
        ? "Overall this was a routine day - standard recovery applies, and only the individuals flagged below need watching."
        : plPct <= 140
        ? "This is a manageable mid-week stimulus, but stack it carefully: avoid a second high day back-to-back and keep an eye on the flagged players."
        : "This is a clear team-level spike - prioritise recovery (sleep, nutrition, a lighter next session) and review the flagged players before the next hard day to avoid an acute:chronic overshoot.",
    );
    return parts.join(" ");
  })();

  // Day-summary inputs: who to watch tomorrow + return-to-training status.
  const watchTomorrow = data.players.filter((p) => p.attentionFlag === "ALERT" || p.attentionFlag === "MONITOR");
  const rttReturning = (data.rttSummary ?? []).filter((p) => p.currentlyInjured || p.started);
  const rttOver = rttReturning.filter((p) => p.thisWeek?.status === "over");
  const pva = data.plannedVsActual && data.plannedVsActual.hasPlan ? data.plannedVsActual : null;

  const verdictTone = loadTone(plPct);
  const verdictLabel = plPct == null ? "No baseline" : plPct <= 90 ? "Below norm" : plPct <= 110 ? "In line" : plPct <= 140 ? "Above norm" : "Well above norm";
  const watchNames = watchTomorrow.length === 0
    ? "No one flagged - routine recovery."
    : `${watchTomorrow.slice(0, 8).map((p) => p.name).join(", ")}${watchTomorrow.length > 8 ? ` +${watchTomorrow.length - 8} more` : ""}`;

  const facts: { value: string; label: string; sub?: string; tone?: Tone }[] = [
    {
      value: plPct != null ? `${plPct}%` : DASH,
      label: "Player Load vs 4-week avg",
      sub: plPct == null ? "No GPS baseline" : ls.pl.pctMatch != null ? `${loadWord(plPct)} · ${ls.pl.pctMatch}% of a typical match` : loadWord(plPct),
      tone: verdictTone,
    },
    {
      value: String(watchTomorrow.length),
      label: "Watch tomorrow",
      sub: watchNames,
      tone: alerts.length ? "red" : monitors.length ? "amber" : "green",
    },
    {
      value: data.rpeTeamAvg != null ? numFmt2(data.rpeTeamAvg, 1) : DASH,
      label: "Team RPE (avg)",
      sub: `${data.rpeTeamAvg != null ? `${rpeScoreLabel(data.rpeTeamAvg)} · ` : ""}${data.rpeSubmissionCount}/${data.players.length} submitted`,
    },
  ];
  if (rttReturning.length > 0) {
    facts.push({
      value: String(rttReturning.length),
      label: "Return-to-training",
      sub: rttOver.length > 0 ? `${rttOver.length} over their recommended ramp (${rttOver.map((p) => p.name).join(", ")})` : "All within their recommended ramp",
      tone: rttOver.length > 0 ? "red" : "rtp",
    });
  }

  const subtitle = `${data.teamName} · ${data.sessionDate} · ${data.mdDay} · ${data.players.length} players`;
  const note = "Rule-computed from GPS, RPE and IMA data - no AI. Pre = the player's readiness colour that day.";
  const pageProps = { doc: "Post-training report", context: `${data.teamName} · ${data.sessionDate}`, note, orientation: "landscape" as const };

  return (
    <Document title={`Post-Training Report - ${data.sessionDate}`} author="MicroPulse">
      {/* ══ Page 1: the day — verdict, facts, who to watch, load detail, plan, RTT, RPE ══ */}
      <BrandPage {...pageProps} title="Post-Training Report" kicker={data.mdDay} subtitle={subtitle}>
        <Verdict
          tone={verdictTone}
          label={verdictLabel}
          headline={loadVerdict}
          body={pva ? `Against the plan: ${pva.summary}` : undefined}
          confidence={`${ls.distribution.total} players with GPS · ${data.rpeSubmissionCount}/${data.players.length} RPE`}
        />
        <FactRow facts={facts} />

        {/* Attention flags — named exceptions, plain reasons */}
        {(alerts.length > 0 || monitors.length > 0) && (
          <Section title={`Who to watch - ${alerts.length} ALERT · ${monitors.length} MONITOR`}>
            <Table
              cols={[
                { label: "Player", width: 170 },
                { label: "Pos", width: 40 },
                { label: "Signal", width: 80 },
                { label: "Why", flex: 1 },
              ]}
              rowTone={(i) => (i < alerts.length ? "red" : "amber")}
              rows={[...alerts, ...monitors].map((p) => [
                p.name,
                p.position,
                <Status key="s" tone={p.attentionFlag === "ALERT" ? "red" : "amber"} text={p.attentionFlag} size={8} />,
                p.attentionReason.join("; ") || DASH,
              ])}
            />
          </Section>
        )}

        {/* ── Session load — the numbers behind the verdict ── */}
        <Section title="Session load - behind the verdict" hint="Team totals today vs the prior 4 weeks and vs a typical match.">
          {loadInterpretation ? (
            <Text style={[fb(400), { fontSize: 9, lineHeight: 1.5, color: C.ink, marginBottom: 7 }]}>{clean(loadInterpretation)}</Text>
          ) : null}
          <Table
            cols={[
              { label: "Metric", flex: 1 },
              { label: "Today", width: 90, align: "right" },
              { label: "4-wk avg", width: 90, align: "right" },
              { label: "% of avg", width: 70, align: "right", strong: true },
              { label: "Read", width: 100, align: "center" },
              { label: "% of match", width: 80, align: "right" },
            ]}
            rows={([
              ["Team Player Load", ls.pl],
              ["Total Distance (m)", ls.dist],
              ["High-Speed Distance (m)", ls.hsd],
            ] as Array<[string, typeof ls.pl]>).map(([label, m]) => [
              label,
              numFmt2(m.today, 0),
              numFmt2(m.avg, 0),
              m.pctAvg != null ? `${m.pctAvg}%` : DASH,
              <StatusCell key="r" tone={loadTone(m.pctAvg)} text={loadWord(m.pctAvg)} />,
              m.pctMatch != null ? `${m.pctMatch}%` : DASH,
            ])}
          />

          {/* Player distribution vs each player's own 4-week norm */}
          {ls.distribution.total > 0 && (
            <View style={{ marginTop: 8 }} wrap={false}>
              <Label>{`Players vs their own 4-week norm (${ls.distribution.total} with GPS)`}</Label>
              <StatGrid
                cols={4}
                items={[
                  { label: "Above (130%+)", value: String(ls.distribution.above), tone: "red" },
                  { label: "Elevated", value: String(ls.distribution.elevated), tone: "amber" },
                  { label: "In line", value: String(ls.distribution.inLine), tone: "green" },
                  { label: "Below", value: String(ls.distribution.below) },
                ]}
              />
            </View>
          )}

          {/* Spiking players (named) */}
          {ls.spikePlayers.length > 0 && (
            <Text style={[fb(400), { fontSize: 8.75, color: TONE.red.text, marginTop: 7, lineHeight: 1.45 }]}>
              <Text style={fb(600)}>Spikes (above their usual): </Text>
              {clean(ls.spikePlayers.slice(0, 10).map((p) => {
                const parts: string[] = [];
                if (p.plPct != null) parts.push(`+${Math.round(p.plPct)}% PL`);
                if (p.distPct != null && p.distPct >= 30) parts.push(`+${Math.round(p.distPct)}% dist`);
                if (p.acwr != null && p.acwr >= 1.5) parts.push(`ACWR ${p.acwr.toFixed(2)}`);
                return `${p.name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
              }).join(" · ") + (ls.spikePlayers.length > 10 ? ` +${ls.spikePlayers.length - 10} more` : ""))}
            </Text>
          )}

          <Provenance>
            Baselines use the team total for each metric over the prior 4 weeks (catapult/manual GPS). &quot;4-wk avg&quot; = mean of prior session days; &quot;match&quot; = the highest team-load day in the window (matches are a team&apos;s peak-load days). A player spike = Player Load 30% or more above their own 4-week average, or ACWR 1.5 or higher (Gabbett 2016 acute:chronic ceiling).
          </Provenance>
        </Section>

        {/* ── Planned vs Actual — did the session hit the recommendation? ── */}
        {pva && (
          <Section title="Planned vs Actual - did we hit the recommendation?" wrap={false}>
            <Text style={[fb(600), { fontSize: 8.75, color: C.cobalt, marginBottom: 2 }]}>
              {clean(`Plan: ${pva.mode === "microcycle" && pva.mdLabel ? `${pva.mdLabel} · ${pva.loadType} · ${pva.matchPct}% of match` : "recent-load baseline (mixed)"}${pva.readinessAdjustPct !== 0 ? ` · readiness-adjusted ${pva.readinessAdjustPct}%` : ""}`)}
            </Text>
            <Text style={[fb(400), { fontSize: 9, lineHeight: 1.5, marginBottom: 6 }]}>{clean(pva.summary)}</Text>
            <Table
              cols={[
                { label: "Metric (per player)", flex: 1 },
                { label: "Planned", width: 100, align: "right" },
                { label: "Actual", width: 100, align: "right" },
                { label: "% of plan", width: 80, align: "right", strong: true },
                { label: "Read", width: 100, align: "center" },
              ]}
              rows={pva.team.map((t) => [
                PVA_LABEL[t.kpi],
                numFmt2(t.planned, 0),
                numFmt2(t.actual, 0),
                t.pctOfPlan != null ? `${t.pctOfPlan}%` : DASH,
                <StatusCell key="s" tone={PVA_TONE[t.status]} text={PVA_WORD[t.status]} />,
              ])}
            />
            <Provenance>
              Planned = the pre-session recommendation for this date (per player), readiness-adjusted. On plan = 85-115% (green); 116-140% or 60-84% = elevated/reduced (amber); &gt;140% or &lt;60% = well off plan (red).
            </Provenance>
          </Section>
        )}

        {/* ── Return-to-training — how each returning player's ramp is going ── */}
        {data.rttSummary && data.rttSummary.length > 0 && (
          <Section title="Return-to-training - how the ramp is going" wrap={false}>
            <Table
              cols={[
                { label: "Player", flex: 1 },
                { label: "RTP stage", width: 170 },
                { label: "Week load", width: 90, align: "right" },
                { label: "Recommended", width: 90, align: "right" },
                { label: "vs ramp", width: 120, align: "center" },
              ]}
              rows={data.rttSummary.map((p) => {
                const vs = !p.thisWeek
                  ? (p.started ? DASH : "not started")
                  : p.thisWeek.status === "over" ? `+${p.thisWeek.deltaPct}% over`
                  : p.thisWeek.status === "under" ? `${p.thisWeek.deltaPct}%${p.thisWeek.inProgress ? " so far" : " under"}`
                  : "on plan";
                const vsTone: Tone = p.thisWeek?.status === "over" ? "red" : p.thisWeek?.status === "on" ? "green" : "neutral";
                const stage = p.rtpStatus ? `${p.rtpStatus.replace(/_/g, " ")} · ${p.rtpStage ?? 0}/5` : (p.currentlyInjured ? "injured" : "returned");
                return [
                  p.name,
                  <Status key="st" tone="rtp" text={stage} size={8.25} />,
                  p.thisWeek ? numFmt2(p.thisWeek.loadActual, 0) : DASH,
                  p.thisWeek ? numFmt2(p.thisWeek.loadTarget, 0) : DASH,
                  vs === DASH || vsTone === "neutral" ? vs : <Status key="vs" tone={vsTone} text={vs} size={8.25} />,
                ];
              })}
            />
            <Provenance>
              Week load = his actual weekly player load this plan week; Recommended = the graded ramp target. Over the ramp is the signal to ease off; under is usually fine (a partial week reads &quot;so far&quot;). See each player&apos;s return-to-training page for the full plan and the evidence.
            </Provenance>
          </Section>
        )}

        {/* ── Internal load — RPE ── */}
        <Section title="Innri álag - Session RPE">
          <StatGrid
            cols={3}
            items={[
              { label: "Meðal RPE liðsins", value: data.rpeTeamAvg != null ? numFmt2(data.rpeTeamAvg, 1) : DASH },
              { label: "Heildar session load", value: data.rpeTotalLoad != null ? numFmt2(data.rpeTotalLoad, 0) : DASH },
              { label: "Leikmenn skildu inn", value: `${data.rpeSubmissionCount} / ${data.players.length}` },
            ]}
          />
          <Card style={{ marginTop: 6 }}>
            <Text style={[fb(400), { fontSize: 9.5, lineHeight: 1.5 }]}>{clean(interpretText)}</Text>
            <Provenance>Session Load = RPE x Mínútur (AU). Flokkur: &lt;200 Very light · 200-399 Light · 400-599 Moderate · 600-799 Hard · 800+ Very hard</Provenance>
          </Card>
        </Section>

        <Section title="RPE eftir leikmann (raðað eftir RPE, hæst fyrst)">
          <Table
            cols={[
              { label: "Leikmaður", flex: 1 },
              { label: "Staða", width: 60 },
              { label: "RPE", width: 50, align: "center", strong: true },
              { label: "Lýsing", width: 90 },
              { label: "Tímalengd (mín)", width: 90, align: "right" },
              { label: "Session Load", width: 80, align: "right" },
              { label: "", width: 14 },
              { label: "Session Load flokkur", width: 140 },
            ]}
            rows={rpeTablePlayers.map((p) => [
              p.name,
              p.position,
              p.rpeSubmitted ? numFmt2(p.rpe, 1) : DASH,
              p.rpeSubmitted ? <Status key="d" tone={rpeTone(p.rpe)} text={rpeScoreLabel(p.rpe)} size={8.25} /> : DASH,
              p.rpeSubmitted ? numFmt2(p.durationMinutes, 0) : DASH,
              p.rpeSubmitted ? numFmt2(p.sessionLoad, 0) : DASH,
              "",
              p.rpeSubmitted ? rpeLoadBand(p.sessionLoad) : "Ekki skilað",
            ])}
          />
        </Section>

        {/* Per-player: planned vs actual adherence (raw % grid — later in the read) */}
        {pva && pva.players.length > 0 && (() => {
          // Capability-aware columns: Core/Lite has no IMA (accel/ima) — it sends
          // the combined "efforts" instead. Show what the club actually captures.
          const SHORT: Record<string, string> = { playerLoad: "P.Load", totalDistance: "Dist", hsr: "HSR", sprint: "Sprint", accel: "Accel", ima: "IMA", efforts: "Efforts" };
          const moveKpis: Array<typeof PVA_KPIS[number]> = pva.availableKpis.includes("efforts") ? ["efforts"] : ["accel", "ima"];
          const ppCols: Array<typeof PVA_KPIS[number]> = ["playerLoad", "totalDistance", "hsr", "sprint", ...moveKpis];
          return (
            <Section title="Planned vs Actual - per player (% of plan)">
              <Table
                dense
                size={8}
                cols={[{ label: "Player", flex: 1.4 }, ...ppCols.map((k): Col => ({ label: SHORT[k], flex: 1, align: "right" }))]}
                rows={pva.players.map((pp) => [
                  pp.name,
                  ...ppCols.map((k) => {
                    const c = pp.byKpi[k];
                    return <Num key={k} v={c.pctOfPlan != null ? `${c.pctOfPlan}%` : DASH} tone={PVA_TONE[c.status]} />;
                  }),
                ])}
              />
              <Provenance>
                Each cell = the player&apos;s actual for that metric as a % of their own readiness-adjusted target. On plan 85-115% (green), elevated/reduced 60-84% / 116-140% (amber), well off plan &lt;60% / &gt;140% (red). A dash means no target or no capture for that metric.
              </Provenance>
            </Section>
          );
        })()}
      </BrandPage>

      {/* ══ Did we do enough? — session IMA vs match demand (Vector Pro football; skipped otherwise) ══ */}
      <SessionEnoughPdfPage enough={data.enough} teamName={data.teamName} sessionDate={data.sessionDate} />

      {/* ══ External Load — GPS ══ */}
      <BrandPage {...pageProps}>
        <Section title="GPS (Catapult) - external load" hint={`${data.teamName} · ${data.sessionDate} · ${data.mdDay} · ${gpsPlayers.length} players with GPS data`} mt={0}>
          <Label>Ytra álag - liðsmeðaltal</Label>
          <StatGrid
            cols={6}
            items={[
              { label: "Total Dist (m)", value: numFmt2(data.teamAvg.totalDistance, 0) },
              { label: "HSD (m)", value: numFmt2(data.teamAvg.hsd, 0) },
              { label: "Player Load", value: numFmt2(data.teamAvg.playerLoad, 1) },
              { label: "Accel B2-3", value: numFmt2(data.teamAvg.accelB23, 0) },
              { label: "Decel B2-3", value: numFmt2(data.teamAvg.decelB23, 0) },
              { label: "Max Vel (m/s)", value: numFmt2(data.teamAvg.maxVelocity, 1) },
            ]}
          />
        </Section>

        <Section title="GPS gögn eftir leikmann (raðað eftir heildar vegalengd)" hint="%28D = today vs the player's own 28-day average. Signal = the post-session attention flag (who to watch is on page 1).">
          <Table
            dense
            size={8}
            cols={GPS_COLS}
            rows={gpsPlayers.map((p) => [
              p.name,
              p.position,
              p.readinessFlag === "—" ? DASH : <Status key="f" tone={toneOf(p.readinessFlag)} text={p.readinessFlag} size={7.75} />,
              numFmt2(p.totalDistance, 0),
              pctFmt(p.totalDistancePct),
              numFmt2(p.hsd, 0),
              pctFmt(p.hsdPct),
              numFmt2(p.playerLoad, 1),
              pctFmt(p.playerLoadPct),
              numFmt2(p.playerLoadPerMin, 2),
              numFmt2(p.accelB23, 0),
              numFmt2(p.decelB23, 0),
              numFmt2(p.maxVelocity, 1),
              numFmt2(p.acwr, 2),
              <Status key="a" tone={ATTN_TONE[p.attentionFlag] ?? "neutral"} text={p.attentionFlag} size={7.75} />,
            ])}
          />
        </Section>
      </BrandPage>

      {/* ══ Biomechanical Load — IMA / Stride ══ */}
      {ima && imaPlayers.length > 0 && (
        <BrandPage {...pageProps}>
          <Section title="IMA (Stride) - biomechanical load" hint={`${data.teamName} · ${data.sessionDate} · ${data.mdDay} · ${ima.player_count} players captured`} mt={0}>
            <Verdict tone="neutral" label="Session shape" headline={ima.session_headline} />
            <Cols gap={10}>
              <View>
                <Label>Lífaflfræðilegt álag - liðsyfirlit</Label>
                <StatGrid
                  cols={2}
                  items={[
                    { label: "Total strides", value: numFmt2(ima.team_total_strides, 0) },
                    { label: "Strides in long runs (≥18 s)", value: `${numFmt2(ima.team_sprint_strides, 0)} (${Math.round(ima.pct_sprint)}%)` },
                    { label: "L/R CoD balance (high)", value: `${ima.team_cod_high_left} L / ${ima.team_cod_high_right} R${ima.team_cod_asymmetry_pct != null ? ` · ${Math.round(ima.team_cod_asymmetry_pct)}%` : ""}` },
                    { label: "High-CoD asym. flagged", value: `${ima.players_high_cod_flagged} / ${ima.player_count}`, tone: ima.players_high_cod_flagged > 0 ? "red" : undefined },
                  ]}
                />
              </View>
              <View>
                <Label>Strides by run length (team)</Label>
                <StatGrid
                  cols={3}
                  items={[
                    { label: "Short bursts (<12 s)", value: `${Math.round(ima.pct_low)}%` },
                    { label: "Medium runs (12-24 s)", value: `${Math.round(ima.pct_mid)}%` },
                    { label: "Longest runs (≥24 s)", value: `${Math.round(ima.pct_high)}%` },
                  ]}
                />
              </View>
            </Cols>
          </Section>

          <Section title="Strides per player (sorted by strides in long runs ≥18 s)">
            <Table
              dense
              size={8}
              cols={[
                { label: "Player", flex: 1 },
                { label: "Total", width: 60, align: "right" },
                { label: "<12 s", width: 60, align: "right" },
                { label: "12-24 s", width: 56, align: "right" },
                { label: "≥24 s", width: 56, align: "right" },
                { label: "Long ≥18 s", width: 66, align: "right", strong: true },
                { label: "vs usual", width: 62, align: "right" },
                { label: "CoD L/R (há)", width: 74, align: "right" },
                { label: "CoD ósamh.", width: 66, align: "right" },
              ]}
              rows={imaPlayers.map((p) => {
                const vs = p.sprint_vs_baseline_pct;
                const asym = p.cod_asymmetry_pct;
                return [
                  p.full_name,
                  numFmt2(p.total_strides, 0),
                  numFmt2(p.low_strides, 0),
                  numFmt2(p.mid_strides, 0),
                  numFmt2(p.high_strides, 0),
                  numFmt2(p.sprint_strides, 0),
                  <Num key="v" v={vs == null ? DASH : `${Math.round(vs)}%`} tone={vs == null ? null : vs > 150 ? "red" : vs > 120 ? "amber" : null} bold={vs != null && vs > 150} />,
                  `${p.cod_left_high} / ${p.cod_right_high}`,
                  <Num key="a" v={asym == null ? DASH : `${Math.round(asym)}%`} tone={asym != null && asym > 15 ? "red" : null} bold={asym != null && asym > 15} />,
                ];
              })}
            />
            <Provenance>
              {`IMA Free Running bands sort each continuous run by how long it lasted, not by speed: short bursts (<12 s) · medium runs (12-24 s) · longest runs (≥24 s); band edges are set in OpenField and read per session. "Long ≥18 s" = strides in runs of 18 s or more vs the player's own 14-day baseline (red above 150%, amber above 120%) - sustained running volume, not sprinting; sprint load comes from GPS. High-intensity CoD asymmetry above 15% is MicroPulse’s flag; not tested against injury (Helme 2021).`}
            </Provenance>
          </Section>
        </BrandPage>
      )}
    </Document>
  );
}

/** Render + download the readiness-risk report. Lazy entry point (keeps @react-pdf out of First Load JS). */
export async function downloadReadinessRiskReportPdf(data: ReadinessRiskReportData) {
  const blob = await renderPdfBlob(() => <ReadinessRiskReportDocument data={data} />);
  saveBlob(blob, `readiness-risk-report-${data.date}.pdf`);
}

/** Render + download the post-training report. Lazy entry point. */
export async function downloadPostTrainingReportPdf(data: PostTrainingReportData, sessionDate: string) {
  const blob = await renderPdfBlob(() => <PostTrainingReportDocument data={data} />);
  saveBlob(blob, `post-training-report-${sessionDate}.pdf`);
}
