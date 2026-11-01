/**
 * Week setup — PDF of the planned week: the week in one line first, the pre-season starting-load
 * target + ramp position as plain facts, then the 7 days with each day's intent (or match / off), the
 * MD tag and — in pre-season — the per-day load doses (PL, sRPE, the KPIs each day loads most) that the
 * grid shows on screen. Descriptive planning — never the readiness colour.
 *
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { BrandPage, C, Chip, FactRow, Provenance, Section, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type WeekSetupPdfDay = {
  weekday: string;
  date: string;                 // "dd.mm."
  md: string | null;            // MD tag ("MD", "MD-3", …)
  kind: "match" | "off" | "train";
  stripe?: string;              // day-type colour band (hex)
  matchLabel?: string;          // "@Opp" / "vs Opp"
  intent?: string;              // localized intent label (train days)
  dose?: { load: number | null; srpe: number | null; kpis: Array<{ label: string; value: number; unit: string }> } | null;
  // Detailed coaching idea (train days, football): physical focus + planned load band + est. duration +
  // sRPE + on-pitch examples (resolved to the PDF's language). Omitted → the card shows the compact row.
  idea?: { focus: string; band: string | null; bandColor: string | null; durationMin: number | null; srpe: number | null; pitch: Array<{ text: string; cite: string }> } | null;
};

export type WeekSetupPdfPayload = {
  teamName: string;
  weekLabel: string;            // e.g. "Week of 5 Aug"
  phaseLabel: string;
  weekTypeLabel: string;
  preseason?: {
    weekIndex: number; preWeeks: number;
    multiple: number | null; weeklyLoad: number | null; perSession: number | null; srpe: number | null;
    anchor: string; confidence: string;
    tests?: Array<{ name: string; kind: string }>;
  } | null;
  days: WeekSetupPdfDay[];
  // Per-player individualised load (the main GPS + IMA load), from each player's match
  // unit × the week's target. Optional → when absent the PDF is team-level only; metrics
  // that a team's feed doesn't carry come through null and render "-". For all teams.
  playerLoad?: {
    players: Array<{
      name: string; position: string | null;
      minutes: number | null; confidence: "high" | "medium" | "low";
      weeklyPl: number | null;                  // individualised weekly Player Load target
      pl: number | null; distance: number | null; hsr: number | null; accel: number | null; decel: number | null; // match-unit (typical)
      perDay: Array<number | null>;             // weekly PL distributed across the training days below
    }>;
    trainDays: Array<{ label: string; md: string | null }>; // the training-day columns for the detailed grid
    hasGps: boolean;                             // any GPS/IMA metric present (else overview shows PL only)
  } | null;
};

/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");
const nf = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n)));
/** The caller sends the on-screen band colour; map it to a kit tone (the band word is always printed). */
const toneOfHex = (hex: string | null | undefined): Tone => {
  const h = String(hex ?? "").toLowerCase();
  return h === C.green ? "green" : h === C.cobalt ? "cobalt" : h === C.amber ? "amber" : h === C.red ? "red" : h === C.rtp ? "rtp" : "neutral";
};

const L = {
  EN: { title: "week plan", doc: "Week plan", prepared: "Prepared for the coaching staff · MicroPulse", phase: "Phase", wtype: "Week type",
    pre: "Pre-season start", week: "Week", anchor: "anchor", conf: "confidence", weekly: "Weekly load", sess: "Per session", testing: "Testing this week",
    pl: "PL", srpe: "sRPE", match: "Match", off: "Off", min: "min", onPitch: "On the pitch", days: "The days", matchMult: "× match", ofMatch: "of one match",
    trainDays: (n: number) => `${n} training day${n === 1 ? "" : "s"}`, matches: (n: number) => `${n} match${n === 1 ? "" : "es"}`, offDays: (n: number) => `${n} off`,
    legForce: "Force / mechanical", legVel: "Velocity / speed", legAct: "Activation / polish", legRec: "Recovery", legMatchOff: "Match / off",
    plWeekly: "Per-player weekly load", plWeeklyLead: "Each player's week individualised from his own match unit — the main GPS + IMA load. Descriptive — scales from his near-full matches; a feed that lacks a metric shows \"-\".",
    plDetail: "Detailed load — per MD-day", plDetailLead: "Each training day = the player's session baseline scaled by that MD-day's load from the team's own data (MD-5 highest, MD-1 lowest). Descriptive — off/match days omitted; the row totals the week.",
    player: "Player", role: "Role", wk: "Week PL", dist: "Dist", hsr: "HSR", acc: "Acc", dec: "Dec", conf2: "conf", total: "Total", starter: "starter", rot: "rotation", lowMin: "low-min",
    note: "Descriptive planning - a starting point per the day's focus, never a norm to obey, and never the readiness colour.",
    foot: "Descriptive planning — the planned load (low/moderate/high), duration and on-pitch examples are a starting point per the day's focus, never a norm to obey, and never the readiness colour. planSessionLoad (Buchheit 2024) · small-sided games Hill-Haas 2011 · Lacome 2018 · López-Fernández 2019 · Foster (sRPE)." },
  IS: { title: "vikuplan", doc: "Vikuplan", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", phase: "Fasi", wtype: "Vikugerð",
    pre: "Undirbúningur — byrjun", week: "Vika", anchor: "grunnur", conf: "vissa", weekly: "Vikumark", sess: "Á æfingu", testing: "Mælingar þessa viku",
    pl: "PL", srpe: "sRPE", match: "Leikur", off: "Frí", min: "mín", onPitch: "Á vellinum", days: "Dagarnir", matchMult: "× leikur", ofMatch: "af einum leik",
    trainDays: (n: number) => `${n} æfingadag${n === 1 ? "ur" : "ar"}`, matches: (n: number) => `${n} leik${n === 1 ? "ur" : "ir"}`, offDays: (n: number) => `${n} frí`,
    legForce: "Kraftur / vélrænt", legVel: "Hraði", legAct: "Virkjun / fínpússun", legRec: "Endurheimt", legMatchOff: "Leikur / frí",
    plWeekly: "Vikulegt álag per leikmann", plWeeklyLead: "Vika hvers leikmanns einstaklingsmiðuð frá hans eigin leikviðmiði — helsta GPS + IMA álagið. Lýsandi — skalast frá næstum-heilum leikjum hans; mæling sem gögnin vantar sýnir \"-\".",
    plDetail: "Ítarlegt álag — eftir MD-degi", plDetailLead: "Hver æfingadagur = grunnlína leikmanns margfölduð með álagi þess MD-dags úr eigin gögnum liðsins (MD-5 hæst, MD-1 lægst). Lýsandi — frí/leikdagar sleppt; röðin telur vikuna.",
    player: "Leikmaður", role: "Hlutverk", wk: "Viku PL", dist: "Vegal.", hsr: "HSR", acc: "Hröð.", dec: "Heml.", conf2: "vissa", total: "Alls", starter: "byrjun", rot: "skipt", lowMin: "lág-mín",
    note: "Lýsandi áætlun - upphafspunktur eftir áherslu dagsins, aldrei viðmið til að hlýða, og aldrei readiness-liturinn.",
    foot: "Lýsandi áætlun — áætlað álag (lágt/miðlungs/hátt), lengd og vallar-dæmi eru upphafspunktur eftir áherslu dagsins, aldrei viðmið til að hlýða, og aldrei readiness-liturinn. planSessionLoad (Buchheit 2024) · fámennir leikir Hill-Haas 2011 · Lacome 2018 · López-Fernández 2019 · Foster (sRPE)." },
} as const;

function WeekDoc({ payload, lang }: { payload: WeekSetupPdfPayload; lang: Lang }) {
  const t = L[lang];
  const p = payload.preseason;
  const nTrain = payload.days.filter((d) => d.kind === "train").length;
  const matchDays = payload.days.filter((d) => d.kind === "match");
  const nOff = payload.days.filter((d) => d.kind === "off").length;
  const headline = [t.trainDays(nTrain), `${t.matches(matchDays.length)}${matchDays.length ? ` (${matchDays.map((d) => `${d.matchLabel || t.match} ${d.weekday}`).join(", ")})` : ""}`, t.offDays(nOff)].join(" · ");
  return (
    <Document>
      <BrandPage
        doc={t.doc}
        context={payload.teamName}
        kicker={payload.weekLabel}
        title={`${payload.teamName} - ${t.title}`}
        subtitle={`${payload.weekLabel} · ${t.phase}: ${payload.phaseLabel} · ${t.wtype}: ${payload.weekTypeLabel} · ${t.prepared}`}
        chips={[{ text: payload.phaseLabel }, { text: payload.weekTypeLabel, tone: "cobalt" }]}
        note={t.note}
      >
        {/* Layer 0 — the week in one line */}
        <Verdict
          tone="neutral"
          label={payload.weekLabel}
          headline={tx(headline)}
          body={p ? tx(`${t.pre} - ${t.week} ${p.weekIndex}/${p.preWeeks}.`) : undefined}
          confidence={p ? tx(`${t.anchor}: ${p.anchor} · ${t.conf}: ${p.confidence}`) : undefined}
        />

        {/* Layer 1 — the pre-season starting load (when in pre-season) */}
        {p && (
          <>
            <FactRow
              facts={[
                { value: p.multiple == null ? "-" : `${p.multiple}×`, label: t.matchMult, sub: `${t.pre} · ${t.week} ${p.weekIndex}/${p.preWeeks}` },
                { value: p.weeklyLoad != null ? `~${nf(p.weeklyLoad)}` : "-", label: `${t.weekly} (PL)` },
                { value: p.perSession != null ? `~${nf(p.perSession)}` : "-", label: `${t.sess} (PL)` },
                { value: p.srpe != null ? `~${nf(p.srpe)}` : "-", label: "sRPE (AU)" },
              ]}
            />
            {p.tests && p.tests.length > 0 && (
              <Text style={[fb(400), { fontSize: 8.5, color: C.ink, marginTop: -4, marginBottom: 10 }]}>
                <Text style={fb(600)}>{`${t.testing}: `}</Text>
                {tx(p.tests.map((tt) => `${tt.name} (${tt.kind})`).join(" · "))}
              </Text>
            )}
          </>
        )}

        {/* Layer 2 — the days */}
        <Section title={t.days} mt={2}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
            {[{ c: C.rtp, l: t.legForce }, { c: C.cobalt, l: t.legVel }, { c: C.amber, l: t.legAct }, { c: C.green, l: t.legRec }, { c: C.red, l: t.legMatchOff }].map((g, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: g.c }} />
                <Text style={[fb(400), { fontSize: 7.5, color: C.mute }]}>{g.l}</Text>
              </View>
            ))}
          </View>

          {payload.days.map((d, i) => {
            const stripe = d.stripe ?? (d.kind === "match" ? C.red : d.kind === "off" ? C.green : C.faint);
            const planText = d.kind === "match" ? (d.matchLabel || t.match) : d.kind === "off" ? t.off : (d.intent ?? "");
            const srpe = d.idea?.srpe ?? d.dose?.srpe ?? null;
            const hasLoad = d.idea?.band != null || d.dose?.load != null || srpe != null || d.idea?.durationMin != null;
            return (
              <View key={i} wrap={false} style={{ flexDirection: "row", backgroundColor: C.card, borderWidth: 1, borderColor: C.rule, borderRadius: 8, padding: 8, marginBottom: 5 }}>
                <View style={{ width: 3, backgroundColor: stripe, borderRadius: 1, marginRight: 8, alignSelf: "stretch", minHeight: 18 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[fh(700), { fontSize: 10.5 }]}>
                      {tx(d.weekday)} <Text style={[fb(400), { fontSize: 8.5, color: C.mute }]}>{tx(d.date)}</Text>
                    </Text>
                    {d.md ? <Chip text={d.md} tone={d.kind === "match" ? "neutral" : "cobalt"} /> : null}
                    <Text style={[fb(600), { marginLeft: "auto", fontSize: 9, color: d.kind === "train" ? C.ink : C.mute, textAlign: "right", maxWidth: 260 }]}>{tx(planText)}</Text>
                  </View>
                  {d.kind === "train" && d.idea?.focus ? <Text style={[fb(400), { fontSize: 8.5, color: C.mute, marginTop: 3, lineHeight: 1.35 }]}>{tx(d.idea.focus)}</Text> : null}
                  {d.kind === "train" && hasLoad && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
                      {d.idea?.band ? <Chip text={d.idea.band} tone={toneOfHex(d.idea.bandColor)} /> : null}
                      {d.idea?.durationMin != null && <Text style={[fh(600), { fontSize: 8.5 }]}>{`~${d.idea.durationMin} ${t.min}`}</Text>}
                      {srpe != null && <Text style={[fh(600), { fontSize: 8.5 }]}>{`sRPE ${nf(srpe)} AU`}</Text>}
                      {d.dose?.load != null && <Text style={[fh(600), { fontSize: 8.5 }]}>{`${t.pl} ${nf(d.dose.load)}`}</Text>}
                      {(d.dose?.kpis ?? []).map((k, j) => (
                        <Text key={j} style={[fb(400), { fontSize: 8, color: C.mute }]}>{tx(`${k.label} ${nf(k.value)}${k.unit}`)}</Text>
                      ))}
                    </View>
                  )}
                  {d.kind === "train" && (d.idea?.pitch ?? []).length > 0 && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={[fb(700), { fontSize: 7, letterSpacing: 0.6, color: C.mute }]}>{t.onPitch.toUpperCase()}</Text>
                      {(d.idea?.pitch ?? []).map((pp, j) => (
                        <View key={j} style={{ flexDirection: "row", gap: 5, marginTop: 1.5 }}>
                          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.ink, marginTop: 4 }} />
                          <Text style={[fb(400), { flex: 1, fontSize: 8, lineHeight: 1.3 }]}>
                            {tx(pp.text)}
                            {pp.cite ? <Text style={{ color: C.mute }}>{`  (${tx(pp.cite)})`}</Text> : null}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </Section>

        {payload.playerLoad && payload.playerLoad.players.length > 0 && (() => {
          const pl = payload.playerLoad!;
          const players = [...pl.players].sort((a, b) => (b.weeklyPl ?? -1) - (a.weeklyPl ?? -1));
          const roleOf = (min: number | null) => (min == null ? "-" : min >= 80 ? t.starter : min >= 30 ? t.rot : t.lowMin);
          const kmv = (m: number | null) => (m == null ? "-" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
          return (
            <>
              {/* Per-player weekly load — individualised GPS + IMA load from each match unit. */}
              <Section title={t.plWeekly} break>
                <Text style={[fb(400), { fontSize: 8, color: C.mute, marginBottom: 5, lineHeight: 1.35 }]}>{tx(t.plWeeklyLead)}</Text>
                <Table
                  cols={[
                    { label: t.player, flex: 1 },
                    { label: t.role, width: 50 },
                    { label: t.wk, width: 50, align: "right", strong: true },
                    { label: t.pl, width: 40, align: "right" },
                    ...(pl.hasGps ? [
                      { label: t.dist, width: 46, align: "right" as const },
                      { label: t.hsr, width: 42, align: "right" as const },
                      { label: t.acc, width: 38, align: "right" as const },
                      { label: t.dec, width: 38, align: "right" as const },
                    ] : []),
                  ]}
                  rows={players.map((p) => [
                    tx(p.name),
                    roleOf(p.minutes),
                    p.weeklyPl == null ? "-" : nf(p.weeklyPl),
                    p.pl == null ? "-" : nf(p.pl),
                    ...(pl.hasGps ? [
                      kmv(p.distance),
                      p.hsr == null ? "-" : `${nf(p.hsr)}m`,
                      p.accel == null ? "-" : nf(p.accel),
                      p.decel == null ? "-" : nf(p.decel),
                    ] : []),
                  ])}
                />
              </Section>

              {/* Detailed per-day — the weekly PL spread across the training days. */}
              {pl.trainDays.length > 0 && (
                <Section title={t.plDetail}>
                  <Text style={[fb(400), { fontSize: 8, color: C.mute, marginBottom: 5, lineHeight: 1.35 }]}>{tx(t.plDetailLead)}</Text>
                  <Table
                    size={7.75}
                    dense
                    cols={[
                      { label: t.player, flex: 1 },
                      ...pl.trainDays.map((d) => ({ label: d.md ?? d.label, width: 42, align: "right" as const })),
                      { label: t.total, width: 46, align: "right" as const, strong: true },
                    ]}
                    rows={players.map((p) => [
                      tx(p.name),
                      ...p.perDay.map((v) => (v == null ? "-" : nf(v))),
                      p.weeklyPl == null ? "-" : nf(p.weeklyPl),
                    ])}
                  />
                </Section>
              )}
            </>
          );
        })()}

        <Provenance>{tx(t.foot)}</Provenance>
      </BrandPage>
    </Document>
  );
}

export async function downloadWeekSetupPdf(payload: WeekSetupPdfPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <WeekDoc payload={payload} lang={lang} />);
  saveBlob(blob, `week-plan-${payload.weekLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}
