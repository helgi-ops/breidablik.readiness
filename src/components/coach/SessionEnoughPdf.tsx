/**
 * "Did we do enough?" page for the Post-Training PDF — the print twin of SessionEnoughCard.
 * Same engine output (sessionEnough), same layered read: <Verdict> (rule-based) → <FactRow> (the five
 * movement types vs the day's target) → plain facts → per-player / week-so-far tables → method + sources.
 * Rules decide; no AI. Descriptive — never the readiness colour. Renders nothing when not applicable.
 */
import { Text, View } from "@react-pdf/renderer";
import { BrandPage, Bullets, Provenance, Section, Status, Table, Verdict, FactRow, fb, type Col, type Tone } from "@/components/pdf/brand";
import type { PvaStatus } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { DAY_TYPE_LABEL, ENOUGH_LABEL, ENOUGH_VARS, isContextOnly, type PlayerVerdict, type SessionEnough, type TeamVerdict } from "@/lib/micropulse/sessionEnough";

const VERDICT_TONE: Record<TeamVerdict, Tone> = { yes: "green", mostly: "amber", no: "red" };
const VERDICT_LABEL: Record<TeamVerdict, string> = { yes: "Enough", mostly: "Mostly", no: "Not enough" };
const STATUS_TONE: Record<PvaStatus, Tone> = { on: "green", over: "green", well_over: "amber", under: "amber", well_under: "red", na: "neutral" };
const PLAYER: Record<PlayerVerdict, { text: string; tone: Tone }> = {
  enough: { text: "enough", tone: "green" }, partly: { text: "partly", tone: "amber" }, short: { text: "short", tone: "red" },
  partial_session: { text: "shortened", tone: "neutral" }, recovery: { text: "recovering", tone: "neutral" }, no_data: { text: "no data", tone: "neutral" },
};
const fmt = (n: number | null) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));

export function SessionEnoughPdfPage({ enough, teamName, sessionDate }: { enough: SessionEnough | null | undefined; teamName: string; sessionDate: string }) {
  if (!enough || (enough.state !== "ok" && enough.state !== "no_md")) return null;
  const v = enough.verdict;
  const stdTarget = enough.team.find((t) => t.focus && t.basis === "day_type");
  const md = [
    enough.mdLabel ? `${enough.mdLabel}${!stdTarget && enough.matchPct != null ? ` (~${enough.matchPct}% of a match)` : ""}` : "no MD-day",
    enough.dayType ? `${DAY_TYPE_LABEL[enough.dayType].en}${stdTarget?.targetPct != null ? ` (~${stdTarget.targetPct}% of a match)` : ""}` : "",
  ].filter(Boolean).join(" · ");
  const c = enough.confidence;
  const rank: Record<PlayerVerdict, number> = { short: 0, partly: 1, enough: 2, recovery: 3, partial_session: 4, no_data: 5 };
  const players = [...enough.players].sort((a, b) => rank[a.verdict] - rank[b.verdict] || a.name.localeCompare(b.name));

  // Print width: the judged types plus the long-run count and how many at match pace (distance / strides stay on screen).
  const pdfVars = ENOUGH_VARS.filter((k) => k !== "frDistance" && k !== "strideHi");
  const cols: Col[] = [
    { label: "Player", flex: 1.6 },
    ...pdfVars.map((k): Col => ({ label: `${ENOUGH_LABEL[k].en}${isContextOnly(k) ? " (info only)" : enough.team.find((t) => t.key === k)?.focus === false ? " (not focus)" : ""} (session / target)`, flex: 1.15, align: "right" })),
    { label: "Verdict", width: 66 },
    { label: "Match reference", width: 92 },
  ];
  const rows = players.map((p) => [
    p.name,
    ...pdfVars.map((k) => {
      const x = p.byVar[k];
      return (
        <Text key={k} style={[fb(400), { fontSize: 8 }]}>
          <Text style={[fb(600)]}>{fmt(x.actual)}</Text>
          {` / ${fmt(x.dayTarget ?? x.matchRef)}`}
        </Text>
      );
    }),
    <Status key="s" tone={PLAYER[p.verdict].tone} text={PLAYER[p.verdict].text} size={7.5} />,
    p.refSource === "own" ? `own · ${p.refMatches} matches` : "team (few own)",
  ]);

  return (
    <BrandPage
      doc="Post-training report"
      context={`${teamName} · ${sessionDate}`}
      orientation="landscape"
      note="Rule-computed from IMA data - no AI. Session vs each player's own near-full match median, scaled to the day. Never the readiness colour."
    >
      <Section title="Did we do enough?" hint={`This session's movement vs what a match demands · ${md}`} mt={0}>
        <Verdict
          tone={v ? VERDICT_TONE[v] : "neutral"}
          label={v ? VERDICT_LABEL[v] : "Not judged"}
          headline={enough.headline.en}
          body={enough.counterfactual ? `What would have flipped it: ${enough.counterfactual.en}` : undefined}
          confidence={`Confidence: ${c.level} · ${c.judged}/${c.squad} judged · ${c.ownRef} on own matches`}
        />
        {enough.focusNote ? <Text style={[fb(600), { fontSize: 8.5, marginBottom: 6 }]}>{enough.focusNote.en}</Text> : null}
        <FactRow
          facts={enough.team.filter((t) => !isContextOnly(t.key) && (!v || t.focus)).map((t) => ({
            value: v ? (t.pctOfTarget == null ? "-" : `${t.pctOfTarget}%`) : (t.pctOfMatch == null ? "-" : `${t.pctOfMatch}%`),
            label: ENOUGH_LABEL[t.key].en,
            sub: v
              ? `${fmt(t.actual)} of ${fmt(t.dayTarget)} target · ${t.pctOfMatch ?? "-"}% of a match`
              : `${fmt(t.actual)} vs ${fmt(t.matchRef)} in a match`,
            tone: v ? STATUS_TONE[t.status] : undefined,
          }))}
        />
        {enough.facts.length || enough.overNote ? (
          <Bullets items={[...enough.facts.map((f) => f.en), ...(enough.overNote ? [enough.overNote.en] : [])]} />
        ) : null}
      </Section>

      <Section title="Per player" hint="Each cell: session / the day's target for that player. Green ≥85% of target, amber 60-84%, red <60%. Shortened sessions are shown but not judged.">
        <Table cols={cols} rows={rows} size={8} dense />
      </Section>

      {enough.week ? (
        <Section title={`Week so far - ${enough.week.sessions} sessions since the match`}>
          <View style={{ width: "62%" }}>
            <Table
              cols={[{ label: "Movement", flex: 1.4 }, { label: "Done (× a match)", align: "right" }, { label: "Planned by now", align: "right" }, { label: "% of plan", align: "right" }, { label: "", width: 70 }]}
              rows={enough.week.vars.map((w) => [
                ENOUGH_LABEL[w.key].en,
                w.timesMatch == null ? "-" : `${w.timesMatch}×`,
                `${w.targetTimesMatch}×`,
                w.pctOfTarget == null ? "-" : `${w.pctOfTarget}%`,
                <Status key="w" tone={STATUS_TONE[w.status]} text={w.status === "na" ? "-" : w.status.replace("_", " ")} size={7.5} />,
              ])}
              size={8}
              dense
            />
          </View>
        </Section>
      ) : null}

      <Provenance>
        {`How it's calculated: each player's match reference = median of the player's own near-full matches (≥80 min, last ~11 weeks; the team's when fewer than 3). The planned day-type decides what is judged: Mechanical, Mixed, Activation = accelerations, braking, CoD; Locomotive = high-speed running and sprint distance (GPS); Top-up = starters (60+ min) recover, the rest are judged. It also sets the target, the same standards the Meso calendar and Week plan plan from: accelerations, braking and CoD Mechanical 80% of a match, Mixed 60%, Top-up 55%, Locomotive 50%, Activation 38%; high-speed running and sprint on a Locomotive day 45% of his own match (studies of elite teams describe this, they don't prove it best; CoD follows the same share). Everything with no planned day-type is sized by the MD-day. Enough = ≥85% of target. Long runs (18 s or more without stopping, IMA Free Running) are shown, never judged: their count, how many were at match pace (11 km/h or faster), distance and strides. In training most long runs are jogs. Sources: ${enough.citations.join("; ")}.`}
      </Provenance>
    </BrandPage>
  );
}
