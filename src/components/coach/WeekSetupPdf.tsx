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
import type { PlayerWeekLoad, PlayerWeekRole, PlayerWeekValues, PlayerWeekVar } from "@/lib/micropulse/weekSetup/playerWeekLoad";

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
  // Indoor teams (basketball / Kinexon) have no football day-idea — show the planned load
  // for the day instead: a band + the team's expected Player Load from the MD-day taper.
  dayLoad?: { band: string | null; bandColor: string | null; pl: number | null; durationMin: number | null } | null;
  strength?: string | null;     // the day's strength-session title (indoor teams)
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
      pl: number | null; distance: number | null; hsr: number | null; accel: number | null; decel: number | null; // per-session typical
      // Kinexon-only distinctive variables (indoor LPS): changes of direction/orientation, exertions, mechanical load.
      cod?: number | null; coo?: number | null; exertions?: number | null; mechLoad?: number | null;
      perDay: Array<number | null>;             // weekly PL distributed across the training days below
      // Kinexon: the week's expected match load (the player's own recorded match mean × the week's matches),
      // and how many recorded matches that mean rests on. null = no recorded match → no match line.
      match?: { pl: number | null; distance: number | null; hsr: number | null; cod: number | null; coo: number | null; exertions: number | null; mechLoad: number | null } | null;
      matchesRecorded?: number | null;
    }>;
    trainDays: Array<{ label: string; md: string | null }>; // the training-day columns for the detailed grid
    hasGps: boolean;                             // any GPS/IMA metric present (else overview shows PL only)
    isKinexon?: boolean;                         // Kinexon team → show its own variables (CoO / Exert / Mech)
    // Kinexon team → a compact team-level breakdown of each Kinexon variable across the
    // MD-days (rows = variables, cols = the training-day grid above). Descriptive.
    kinexonMd?: { rows: Array<{ label: string; perDay: Array<number | null>; total: number | null }> } | null;
    matchCount?: number;                         // matches in the week (Kinexon weekly table prints a match line)
    notPlanned?: Array<{ name: string; status: "injured" | "rehabilitation" }>; // injured / rehab: named, not planned
    // Every variable per day and for the week, matches counted. Present → these landscape pages replace the
    // two tables above (null for Kinexon, which keeps its own variables). Labels are already localized.
    detail?: (PlayerWeekLoad & { varLabels: string[]; legend: string; days: Array<{ title: string; note: string }> }) | null;
  } | null;
};

/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");
const nf = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n)));
/** The caller sends the on-screen band colour; map it to a kit tone (the band word is always printed). */
/** One variable's value for a table cell: distance prints in km, everything else as a whole number. */
const cellOf = (k: PlayerWeekVar, v: number | null) => (v == null ? "-" : k === "distance" ? (v / 1000).toFixed(1) : nf(v));
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
    plWeekly: "Per-player weekly load", plWeeklyLead: "Weekly totals, individualised from each player's own recent session load (the main GPS + IMA variables) across the week's training days. Descriptive — a feed that lacks a metric shows \"-\".",
    plDetail: "Detailed load — per MD-day", plDetailLead: "Each training day = the player's session baseline scaled by that day's planned load — the week's MD-day taper (MD-1 the lightest primer). Descriptive — off/match days omitted; the row totals the week.",
    plWeekLead: (n: number) => n > 0
      ? `Each player's week: training days + expected matches = the week. A match line is the player's own match load at their usual minutes, × ${n} this week. Descriptive - a feed that lacks a metric shows "-".`
      : `Each player's week across the training days; no match this week. Descriptive - a feed that lacks a metric shows "-".`,
    rowTrain: "Training", rowMatch: (n: number) => `Matches ×${n}`, rowWeek: "Week",
    sprintCaveat: "Sprint targets are the least certain: only the biggest day is measured, the rest are derived from it.",
    notPlanned: "Not in this plan", outInjured: "injured", outRehab: "in rehab", returning: "returning - follow the return ramp",
    plKxWeekLead: (n: number) => `Each player's week: training days + expected matches = the week. A match line is the mean of the player's own recorded matches, × ${n} this week. Kinexon records in the home arena, so a player with no recorded match shows "-" and the week is training only.`,
    plDays: "Detailed load - per day", plDaysLead: "Each day's plan for every player. Off and match days omitted.",
    plPerMatch: "Per match - expected", plPerMatchLead: (n: number) => `One match at the player's usual minutes, counted ×${n} in the week above.`,
    roleOf: (r: PlayerWeekRole) => (r === "starter" ? "starter" : r === "rotation" ? "rotation" : r === "low" ? "low-min" : "-"),
    plKxMd: "Kinexon variables — per MD-day", plKxMdLead: "Team weekly total of each Kinexon variable, spread across the MD-days by the same taper. Descriptive.", metricCol: "Variable",
    player: "Player", role: "Role", wk: "Week PL", dist: "Dist", hsr: "HSR", acc: "Acc", dec: "Dec", cod: "CoD", coo: "CoO", exert: "Exert", mech: "Mech", conf2: "conf", total: "Total", starter: "starter", rot: "rotation", lowMin: "low-min",
    note: "Descriptive planning - a starting point per the day's focus, never a norm to obey, and never the readiness colour.",
    foot: "Descriptive planning — the planned load (low/moderate/high), duration and on-pitch examples are a starting point per the day's focus, never a norm to obey, and never the readiness colour. planSessionLoad (Buchheit 2024) · small-sided games Hill-Haas 2011 · Lacome 2018 · López-Fernández 2019 · Foster (sRPE)." },
  IS: { title: "vikuplan", doc: "Vikuplan", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", phase: "Fasi", wtype: "Vikugerð",
    pre: "Undirbúningur — byrjun", week: "Vika", anchor: "grunnur", conf: "vissa", weekly: "Vikumark", sess: "Á æfingu", testing: "Mælingar þessa viku",
    pl: "PL", srpe: "sRPE", match: "Leikur", off: "Frí", min: "mín", onPitch: "Á vellinum", days: "Dagarnir", matchMult: "× leikur", ofMatch: "af einum leik",
    trainDays: (n: number) => `${n} æfingadag${n === 1 ? "ur" : "ar"}`, matches: (n: number) => `${n} leik${n === 1 ? "ur" : "ir"}`, offDays: (n: number) => `${n} frí`,
    legForce: "Kraftur / vélrænt", legVel: "Hraði", legAct: "Virkjun / fínpússun", legRec: "Endurheimt", legMatchOff: "Leikur / frí",
    plWeekly: "Vikulegt álag per leikmann", plWeeklyLead: "Vikusamtölur, einstaklingsmiðaðar frá nýlegu æfingaálagi hvers leikmanns (helstu GPS + IMA breyturnar) yfir æfingadaga vikunnar. Lýsandi — mæling sem gögnin vantar sýnir \"-\".",
    plDetail: "Ítarlegt álag — eftir MD-degi", plDetailLead: "Hver æfingadagur = grunnlína leikmanns margfölduð með áætluðu álagi dagsins — taper vikunnar (MD-1 léttasti undirbúningsdagur). Lýsandi — frí/leikdagar sleppt; röðin telur vikuna.",
    plWeekLead: (n: number) => n > 0
      ? `Vika hvers leikmanns: æfingadagar + væntanlegir leikir = vikan. Leikjalínan er eigið leikálag leikmannsins miðað við venjulegar mínútur hans, × ${n} þessa viku. Lýsandi - mæling sem gögnin vantar sýnir "-".`
      : `Vika hvers leikmanns yfir æfingadagana; enginn leikur þessa viku. Lýsandi - mæling sem gögnin vantar sýnir "-".`,
    rowTrain: "Æfingar", rowMatch: (n: number) => `Leikir ×${n}`, rowWeek: "Vikan",
    sprintCaveat: "Sprettmarkmiðin eru óvissust: aðeins stærsti dagurinn er mældur, hinir eru afleiddir af honum.",
    notPlanned: "Ekki í þessu plani", outInjured: "meiddur", outRehab: "í endurhæfingu", returning: "í endurkomu - fylgið endurkomuáætlun",
    plKxWeekLead: (n: number) => `Vika hvers leikmanns: æfingadagar + væntanlegir leikir = vikan. Leikjalínan er meðaltal skráðra leikja leikmannsins sjálfs, × ${n} þessa viku. Kinexon mælir í heimahöllinni, svo leikmaður án skráðs leiks sýnir "-" og vikan er þá bara æfingar.`,
    plDays: "Ítarlegt álag - eftir degi", plDaysLead: "Áætlun dagsins fyrir hvern leikmann. Frí- og leikdögum sleppt.",
    plPerMatch: "Á leik - áætlað", plPerMatchLead: (n: number) => `Einn leikur miðað við venjulegar mínútur leikmannsins, talinn ×${n} í vikunni hér að ofan.`,
    roleOf: (r: PlayerWeekRole) => (r === "starter" ? "byrjun" : r === "rotation" ? "skipt" : r === "low" ? "lág-mín" : "-"),
    plKxMd: "Kinexon breytur — eftir MD-degi", plKxMdLead: "Vikusamtala liðsins fyrir hverja Kinexon breytu, dreift á MD-dagana með sama taper. Lýsandi.", metricCol: "Breyta",
    player: "Leikmaður", role: "Hlutverk", wk: "Viku PL", dist: "Vegal.", hsr: "HSR", acc: "Hröð.", dec: "Heml.", cod: "Stefnubr.", coo: "Snún.", exert: "Átök", mech: "Vélr.", conf2: "vissa", total: "Alls", starter: "byrjun", rot: "skipt", lowMin: "lág-mín",
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
                  {/* Indoor teams (no football idea) — the day's planned load + strength session. */}
                  {d.kind === "train" && !d.idea && d.dayLoad && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
                      {d.dayLoad.band ? <Chip text={d.dayLoad.band} tone={toneOfHex(d.dayLoad.bandColor)} /> : null}
                      {d.dayLoad.durationMin != null && <Text style={[fh(600), { fontSize: 8.5 }]}>{`~${d.dayLoad.durationMin} ${t.min}`}</Text>}
                      {d.dayLoad.pl != null && <Text style={[fh(600), { fontSize: 8.5 }]}>{`${t.pl} ~${nf(d.dayLoad.pl)}`}</Text>}
                      {d.strength ? <Text style={[fb(400), { fontSize: 8, color: C.mute }]}>{tx(d.strength)}</Text> : null}
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

        {payload.playerLoad && payload.playerLoad.players.length > 0 && !payload.playerLoad.detail && (() => {
          const pl = payload.playerLoad!;
          const players = [...pl.players].sort((a, b) => (b.weeklyPl ?? -1) - (a.weeklyPl ?? -1));
          const roleOf = (min: number | null) => (min == null ? "-" : min >= 80 ? t.starter : min >= 30 ? t.rot : t.lowMin);
          const kmv = (m: number | null) => (m == null ? "-" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
          const num = (v: number | null) => (v == null ? "-" : nf(v));
          type P = (typeof players)[number];
          type M = NonNullable<P["match"]>;
          const col = (key: string, label: string, width: number, train: (p: P) => number | null, match: (m: M) => number | null, fmt: (v: number | null) => string = num) => ({ key, label, width, train, match, fmt });
          const kxCols = [
            col("pl", t.wk, 52, (p) => p.weeklyPl, (m) => m.pl),
            ...(pl.hasGps ? (pl.isKinexon ? [
              // Kinexon (indoor LPS) → its own distinctive variables.
              col("distance", t.dist, 42, (p) => p.distance, (m) => m.distance, kmv),
              col("hsr", t.hsr, 38, (p) => p.hsr, (m) => m.hsr, (v) => (v == null ? "-" : `${nf(v)}m`)),
              col("cod", t.cod, 38, (p) => p.cod ?? null, (m) => m.cod),
              col("coo", t.coo, 38, (p) => p.coo ?? null, (m) => m.coo),
              col("exertions", t.exert, 40, (p) => p.exertions ?? null, (m) => m.exertions),
              col("mechLoad", t.mech, 42, (p) => p.mechLoad ?? null, (m) => m.mechLoad),
            ] : [
              col("distance", t.dist, 46, (p) => p.distance, () => null, kmv),
              col("hsr", t.hsr, 42, (p) => p.hsr, () => null, (v) => (v == null ? "-" : `${nf(v)}m`)),
              col("accel", t.acc, 38, (p) => p.accel, () => null),
              col("decel", t.dec, 38, (p) => p.decel, () => null),
            ]) : []),
          ];
          const matchCount = pl.matchCount ?? 0;
          // The match line prints only when the week has a match AND some player has a recorded one.
          const withMatch = matchCount > 0 && players.some((p) => p.match);
          const outNames = (pl.notPlanned ?? []).map((x) => `${x.name} (${x.status === "injured" ? t.outInjured : t.outRehab})`).join(", ");
          const stack = (key: number, texts: Array<{ s: string; bold?: boolean }>, right = false) => (
            <View key={key}>
              {texts.map((x, i) => (
                <Text key={i} style={[x.bold ? fh(700) : fb(400), { fontSize: 7.5, textAlign: right ? "right" : "left", color: x.bold ? C.ink : C.mute }]}>{x.s}</Text>
              ))}
            </View>
          );
          return (
            <>
              {/* Per-player weekly load. With matches in the week, each cell stacks Training / Matches / Week. */}
              <Section title={t.plWeekly} break>
                <Text style={[fb(400), { fontSize: 8, color: C.mute, marginBottom: 5, lineHeight: 1.35 }]}>{tx(withMatch ? t.plKxWeekLead(matchCount) : t.plWeeklyLead)}</Text>
                {outNames ? (
                  <Text style={[fb(400), { fontSize: 8.5, marginBottom: 6 }]}>
                    <Text style={fb(600)}>{tx(`${t.notPlanned}:`)}</Text>{` ${tx(outNames)}`}
                  </Text>
                ) : null}
                <Table
                  dense={withMatch}
                  cols={[
                    { label: t.player, flex: 1 },
                    { label: t.role, width: 50 },
                    ...(withMatch ? [{ label: "", width: 50 }] : []),
                    ...kxCols.map((c) => ({ label: c.label, width: c.width, align: "right" as const, strong: !withMatch && c.key === "pl" })),
                  ]}
                  rows={players.map((p) => [
                    tx(p.name),
                    roleOf(p.minutes),
                    ...(withMatch ? [stack(0, [{ s: t.rowTrain }, { s: t.rowMatch(matchCount) }, { s: t.rowWeek, bold: true }])] : []),
                    ...kxCols.map((c, i) => {
                      const train = c.train(p), match = p.match ? c.match(p.match) : null;
                      if (!withMatch) return c.fmt(train);
                      const week = train == null && match == null ? null : (train ?? 0) + (match ?? 0);
                      return stack(i + 1, [{ s: c.fmt(train) }, { s: c.fmt(match) }, { s: c.fmt(week), bold: true }], true);
                    }),
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

              {/* Kinexon variables by MD-day — compact team-level breakdown of each
                  Kinexon variable across the same MD-day grid. */}
              {pl.isKinexon && pl.kinexonMd && pl.kinexonMd.rows.length > 0 && pl.trainDays.length > 0 && (
                <Section title={t.plKxMd}>
                  <Text style={[fb(400), { fontSize: 8, color: C.mute, marginBottom: 5, lineHeight: 1.35 }]}>{tx(t.plKxMdLead)}</Text>
                  <Table
                    size={7.75}
                    dense
                    cols={[
                      { label: t.metricCol, flex: 1 },
                      ...pl.trainDays.map((d) => ({ label: d.md ?? d.label, width: 42, align: "right" as const })),
                      { label: t.total, width: 46, align: "right" as const, strong: true },
                    ]}
                    rows={pl.kinexonMd.rows.map((r) => [
                      tx(r.label),
                      ...r.perDay.map((v) => (v == null ? "-" : nf(v))),
                      r.total == null ? "-" : nf(r.total),
                    ])}
                  />
                </Section>
              )}
            </>
          );
        })()}

        {!payload.playerLoad?.detail && <Provenance>{tx(t.foot)}</Provenance>}
      </BrandPage>
      {payload.playerLoad?.detail && payload.playerLoad.detail.players.length > 0 && (
        <PlayerDetailPages detail={payload.playerLoad.detail} teamName={payload.teamName} lang={lang} />
      )}
    </Document>
  );
}

/** Landscape pages: 11 numeric columns don't fit portrait. Week table, then one table per training day. */
function PlayerDetailPages({ detail, teamName, lang }: { detail: NonNullable<NonNullable<WeekSetupPdfPayload["playerLoad"]>["detail"]>; teamName: string; lang: Lang }) {
  const t = L[lang];
  const vars = detail.vars;
  const numCols = vars.map((k, i) => ({ label: detail.varLabels[i], width: k === "accHi" || k === "decHi" || k === "cod" ? 50 : 42, align: "right" as const }));
  const lines: Array<{ label: string; of: (r: (typeof detail.players)[number]) => PlayerWeekValues; bold?: boolean }> = detail.matchCount > 0
    ? [
        { label: t.rowTrain, of: (r) => r.training },
        { label: t.rowMatch(detail.matchCount), of: (r) => r.matches },
        { label: t.rowWeek, of: (r) => r.week, bold: true },
      ]
    : [{ label: t.rowTrain, of: (r) => r.training, bold: true }];
  const stack = (key: number, texts: Array<{ s: string; bold?: boolean }>, right = false) => (
    <View key={key}>
      {texts.map((x, i) => (
        <Text key={i} style={[x.bold ? fh(700) : fb(400), { fontSize: 7.5, textAlign: right ? "right" : "left", color: x.bold ? C.ink : C.mute }]}>{x.s}</Text>
      ))}
    </View>
  );
  const nameCol = (r: (typeof detail.players)[number]) => stack(0, [
    { s: tx(r.name), bold: true },
    { s: tx(r.returning ? t.returning : `${t.roleOf(r.role)}${r.usualMinutes != null ? ` · ${Math.round(r.usualMinutes)} ${t.min}` : ""}`) },
  ]);
  const notPlanned = detail.notPlanned.map((x) => `${x.name.trim()} (${x.status === "injured" ? t.outInjured : t.outRehab})`).join(", ");
  const lead = (s: string) => <Text style={[fb(400), { fontSize: 8, color: C.mute, marginBottom: 5, lineHeight: 1.35 }]}>{tx(s)}</Text>;
  // A whole table stays together on one page when a landscape page can hold it (about 24 dense rows).
  const keepTogether = detail.players.length <= 24;
  const simple = (of: (r: (typeof detail.players)[number]) => PlayerWeekValues) => (
    <Table
      size={7.75}
      dense
      cols={[{ label: t.player, flex: 1 }, ...numCols]}
      rows={detail.players.map((r) => [tx(r.name), ...vars.map((k) => cellOf(k, of(r)[k]))])}
    />
  );
  return (
    <BrandPage doc={t.doc} context={teamName} orientation="landscape" note={t.note}>
      <Section title={t.plWeekly} mt={0}>
        {lead(t.plWeekLead(detail.matchCount))}
        {notPlanned ? (
          <Text style={[fb(400), { fontSize: 8.5, marginBottom: 6 }]}>
            <Text style={fb(600)}>{tx(`${t.notPlanned}:`)}</Text>{` ${tx(notPlanned)}`}
          </Text>
        ) : null}
        <Table
          dense
          cols={[{ label: t.player, flex: 1 }, { label: "", width: 52 }, ...numCols]}
          rows={detail.players.map((r) => [
            nameCol(r),
            stack(1, lines.map((l) => ({ s: l.label, bold: l.bold }))),
            ...vars.map((k, i) => stack(i + 2, lines.map((l) => ({ s: cellOf(k, l.of(r)[k]), bold: l.bold })), true)),
          ])}
        />
        <Text style={[fb(400), { fontSize: 7.25, color: C.mute, marginTop: 5, lineHeight: 1.35 }]}>{tx(detail.legend)}</Text>
      </Section>
      {detail.days.map((d, j) => (
        <Section key={j} title={j === 0 ? t.plDays : undefined} wrap={!keepTogether}>
          {j === 0 ? lead(t.plDaysLead) : null}
          <View minPresenceAhead={60} wrap={false}>
            <Text style={[fh(700), { fontSize: 10, marginBottom: 1 }]}>{tx(d.title)}</Text>
            {lead(d.note)}
          </View>
          {simple((r) => r.perDay[j])}
        </Section>
      ))}
      {detail.matchCount > 0 && (
        <Section title={t.plPerMatch} wrap={!keepTogether}>
          {lead(t.plPerMatchLead(detail.matchCount))}
          {simple((r) => r.perMatch)}
        </Section>
      )}
      <Provenance>{tx(`${t.foot} Stevens 2017 · Martín-García 2018 · Dalen 2019 · Gualtieri 2023. ${t.sprintCaveat}`)}</Provenance>
    </BrandPage>
  );
}

export async function downloadWeekSetupPdf(payload: WeekSetupPdfPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <WeekDoc payload={payload} lang={lang} />);
  saveBlob(blob, `week-plan-${payload.weekLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}
