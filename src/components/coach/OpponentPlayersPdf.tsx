"use client";

/**
 * OpponentPlayersPdf — a one-document scouting read of the OPPONENT's WHOLE squad.
 *
 * Explainability-first layered read (docs/explainability-first.md):
 *   layer 0  a rule verdict: who leads their squad in each area (attacking / possession /
 *            defending), first and boldest
 *   layer 1  those three leaders as plain facts with their percentile
 *   layer 2  a squad overview table, then one section per player laid out like the
 *            on-screen Players tab: the opponent-framed AI read (profile / threat / how to
 *            stop, labelled AI) over the per-90 percentile bars, ranked WITHIN their squad.
 *
 * The bars/percentiles are computed by rules (buildPlayerAnalysis); the AI only phrases
 * them and is labelled AI. Styling comes from the shared PDF kit (src/components/pdf/brand.tsx).
 * Descriptive scouting context only — never touches the readiness colour or the daily decision.
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, Bar, BrandPage, C, Card, Chip, FactRow, Section, Table, TONE, Verdict, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
import type { Tone } from "@/components/pdf/brand";
import type { PlayerAnalysis, Category, MetricRow } from "@/lib/micropulse/playerAnalysis";

type Lang = "EN" | "IS";
export type PlayerProse = { summary?: string; threat?: string; howToStop?: string } | null;
export type PdfPlayer = { analysis: PlayerAnalysis; prose: PlayerProse };

/** Percentile → tone: top quartile green, bottom quartile red, else cobalt. The number is always printed. */
const pTone = (p: number | null): Tone => (p == null ? "neutral" : p >= 75 ? "green" : p <= 25 ? "red" : "cobalt");
const pColor = (p: number | null) => (p == null ? C.faint : TONE[pTone(p)].fill);
const fmtV = (v: number | null): string => (v == null ? "-" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));
const CATS: Category[] = ["attacking", "possession", "defending"];

const CAT_LABEL: Record<Category, { EN: string; IS: string }> = {
  attacking: { EN: "Attacking", IS: "Sókn" },
  possession: { EN: "Possession & progression", IS: "Boltahald & framrás" },
  defending: { EN: "Defending", IS: "Vörn" },
};

/** Area name as it reads after "in" / "í" (Icelandic dative). */
const CAT_IN: Record<Category, { EN: string; IS: string }> = {
  attacking: { EN: "attacking", IS: "sókn" },
  possession: { EN: "possession", IS: "boltahaldi" },
  defending: { EN: "defending", IS: "vörn" },
};

const T = {
  EN: {
    doc: "Player scouting", kicker: "Opponent player scouting", sub: "Every player ranked within their own squad · Prepared for the coaching staff", players: "players", pool: "pool",
    aiChip: "AI-phrased", lead: "THEIR SQUAD LEADERS", leaders: (a: string) => `Who leads their squad: ${a}.`, inArea: (n: string, c: string) => `${n} in ${c}`,
    leadersBody: "Each player is ranked against his own team-mates (per 90 minutes), so 90 = better than 90% of their squad in that area.",
    leaderSub: (c: string) => `Leads their squad - ${c.toLowerCase()}`,
    overview: "Squad overview", overviewHint: "Area percentile vs their own squad (higher = better). Green = top 25%, red = bottom 25%.",
    player: "Player", role: "Role", min: "Min", mins: "min", vsSquad: "players vs their squad", gk: "GOALKEEPER",
    gkNote: "The outfield per-90 metrics (attacking / possession / defending) don't describe a keeper, so he isn't ranked here.",
    perPlayer: "Player by player", aiLabel: "WRITTEN FROM THE NUMBERS - DECIDES NOTHING", threat: "Threat. ", stop: "How to stop him. ",
    pctVs: "percentile vs squad", metric: "Per 90", pctl: "Pctl",
    howTo: "How to read this",
    foot: "Percentiles are vs the opponent's own players (green = top 25%, red = bottom 25%), from StatsBomb per-90 season stats. Rules compute the numbers; the AI only phrases them and is labelled AI. Role = the category a player rates highest in. Low minutes = a small sample. Descriptive context - it never touches the readiness colour or the daily decision.",
    note: "Descriptive scouting from StatsBomb per-90 stats. Rules compute; AI only phrases (labelled AI). Never touches readiness.",
  },
  IS: {
    doc: "Leikmannagreining", kicker: "Leikmannagreining andstæðings", sub: "Hver leikmaður raðaður innan síns eigin liðs · Unnið fyrir þjálfarateymið", players: "leikmenn", pool: "laug",
    aiChip: "AI-orðað", lead: "LYKILMENN ÞEIRRA", leaders: (a: string) => `Fremstir í liðinu: ${a}.`, inArea: (n: string, c: string) => `${n} í ${c}`,
    leadersBody: "Hver leikmaður er borinn saman við eigin liðsfélaga (á 90 mínútur), svo 90 = betri en 90% af liðinu á því sviði.",
    leaderSub: (c: string) => `Efstur í liðinu - ${c.toLowerCase()}`,
    overview: "Yfirlit yfir hópinn", overviewHint: "Percentíll á hverju sviði vs eigið lið (hærra = betra). Grænt = topp 25%, rautt = neðstu 25%.",
    player: "Leikmaður", role: "Hlutverk", min: "Mín", mins: "mín", vsSquad: "leikmenn vs þeirra lið", gk: "MARKMAÐUR",
    gkNote: "Útspila-mælarnir (sókn / boltahald / vörn) lýsa ekki markmanni, svo hann er ekki raðaður hér.",
    perPlayer: "Leikmaður fyrir leikmann", aiLabel: "SKRIFAÐ ÚR TÖLUNUM - ÁKVEÐUR EKKERT", threat: "Ógn. ", stop: "Hvernig á að stöðva hann. ",
    pctVs: "percentíll vs lið", metric: "Á 90", pctl: "Pctl",
    howTo: "Hvernig á að lesa þetta",
    foot: "Percentílar eru vs leikmenn andstæðingsins sjálfs (grænt = topp 25%, rautt = neðstu 25%), úr StatsBomb per-90 tímabils-tölum. Reglur reikna tölurnar; AI orðar þær aðeins og er merkt AI. Hlutverk = flokkurinn sem leikmaður raðast hæst í. Fáar mínútur = lítið úrtak. Lýsandi samhengi - snertir aldrei readiness-litinn né daglegu ákvörðunina.",
    note: "Lýsandi greining úr StatsBomb per-90 tölum. Reglur reikna; AI orðar aðeins (merkt AI). Snertir aldrei readiness.",
  },
} as const;

/** Percentile cell: tone-coloured number (the number is the signal, colour only supports it). */
function Pct({ p, size = 8.5 }: { p: number | null; size?: number }) {
  return <Text style={[fh(700), { fontSize: size, color: p == null ? C.faint : TONE[pTone(p)].text, textAlign: "right" }]}>{p == null ? "-" : String(p)}</Text>;
}

function BarRow({ m }: { m: MetricRow }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 1.8 }}>
      <Text style={[fb(400), { width: 130, fontSize: 8.25 }]}>{clean(m.label)}</Text>
      <View style={{ flex: 1, paddingHorizontal: 6 }}><Bar value={m.percentile ?? 0} max={100} color={pColor(m.percentile)} height={5} /></View>
      <View style={{ width: 24 }}><Pct p={m.percentile} /></View>
      <Text style={[fb(400), { width: 34, fontSize: 7.75, color: C.mute, textAlign: "right" }]}>{fmtV(m.value)}</Text>
    </View>
  );
}

function PlayerHead({ name, tag, meta }: { name: string; tag?: string | null; meta: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
      <Text style={[fh(800), { fontSize: 13 }]}>{clean(name)}</Text>
      {tag ? <Chip text={tag} tone="cobalt" /> : null}
      <Text style={[fb(400), { fontSize: 8, color: C.mute }]}>{meta}</Text>
    </View>
  );
}

function PlayerSection({ p, lang }: { p: PdfPlayer; lang: Lang }) {
  const { analysis: a, prose } = p;
  const t = T[lang];
  const mins = a.minutes != null ? `${Math.round(a.minutes)} ${t.mins}` : "";

  // Goalkeeper: outfield per-90 metrics don't describe a keeper → a labelled note, no bars.
  if (a.goalkeeper) {
    return (
      <Card style={{ marginBottom: 8 }}>
        <PlayerHead name={a.player} tag={t.gk} meta={mins} />
        <Text style={[fb(400), { fontSize: 8.5, color: C.mute, lineHeight: 1.4 }]}>{t.gkNote}</Text>
      </Card>
    );
  }

  return (
    <Card wrap style={{ marginBottom: 8 }}>
      {/* Keep the header + AI read together; the bar groups may flow to the next page. */}
      <View wrap={false}>
        <PlayerHead name={a.player} tag={a.role ? CAT_LABEL[a.role][lang].toUpperCase() : null} meta={`${mins}${mins ? " · " : ""}${a.poolSize} ${t.vsSquad}`} />
        {prose && (prose.summary || prose.threat || prose.howToStop) ? (
          <AiBox label={t.aiLabel} headline={prose.summary}>
            {prose.threat ? <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, marginTop: 4, color: "#2b2f35" }]}><Text style={fb(600)}>{t.threat}</Text>{clean(prose.threat)}</Text> : null}
            {prose.howToStop ? <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, marginTop: 4, color: "#2b2f35" }]}><Text style={fb(600)}>{t.stop}</Text>{clean(prose.howToStop)}</Text> : null}
          </AiBox>
        ) : null}
      </View>

      {CATS.map((c) => {
        const rows = a.metrics.filter((m) => m.category === c);
        if (!rows.length) return null;
        return (
          <View key={c} style={{ marginTop: 4 }}>
            <View wrap={false} minPresenceAhead={30} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 2, marginBottom: 1, borderBottomWidth: 1, borderBottomColor: C.hair }}>
              <Text style={[fh(700), { fontSize: 9.5 }]}>{CAT_LABEL[c][lang]}</Text>
              <Text style={[fb(400), { fontSize: 7.5, color: C.mute }]}>
                {a.byCategory[c] != null ? <Text style={[fh(700), { color: TONE[pTone(a.byCategory[c])].text }]}>{`${a.byCategory[c]} `}</Text> : null}
                {a.byCategory[c] != null ? t.pctVs : ""}
              </Text>
            </View>
            {rows.map((m) => <BarRow key={m.key} m={m} />)}
          </View>
        );
      })}
    </Card>
  );
}

export function Doc({ opponent, season, players, lang }: { opponent: string; season: string; players: PdfPlayer[]; lang: Lang }) {
  const isIS = lang === "IS";
  const t = T[lang];
  const pool = players[0]?.analysis.poolSize ?? players.length;
  const anyProse = players.some((p) => p.prose);
  const field = players.filter((p) => !p.analysis.goalkeeper);

  // Layer 0/1 — rule: the squad leader in each area (highest area percentile).
  const leaders = CATS.map((c) => {
    const best = field
      .filter((p) => p.analysis.byCategory[c] != null)
      .sort((x, y) => (y.analysis.byCategory[c] ?? 0) - (x.analysis.byCategory[c] ?? 0))[0];
    return best ? { c, name: best.analysis.player, p: best.analysis.byCategory[c] } : null;
  }).filter((x): x is { c: Category; name: string; p: number | null } => x != null);
  const leaderLine = leaders.map((l) => t.inArea(clean(l.name), CAT_IN[l.c][lang])).join(", ");

  return (
    <Document title={`${clean(opponent)} - ${t.doc} ${season}`} author="MicroPulse">
      <BrandPage
        doc={t.doc}
        context={`${clean(opponent)} · ${season}`}
        title={clean(opponent)}
        kicker={`${t.kicker} · ${season}`}
        subtitle={t.sub}
        chips={[{ text: `${players.length} ${t.players}` }, { text: `${t.pool} ${pool}` }, { text: "StatsBomb per-90" }, ...(anyProse ? [{ text: t.aiChip, tone: "cobalt" as Tone }] : [])]}
        note={t.note}
      >
        {leaders.length ? (
          <>
            <Verdict label={t.lead} headline={t.leaders(leaderLine)} body={t.leadersBody} />
            <FactRow facts={leaders.map((l) => ({ value: l.p != null ? `${l.p}` : "-", label: clean(l.name), sub: t.leaderSub(CAT_LABEL[l.c][lang]), tone: pTone(l.p) }))} />
          </>
        ) : null}

        {field.length ? (
          <Section title={t.overview} hint={t.overviewHint}>
            <Table
              dense
              cols={[{ label: t.player, flex: 1 }, { label: t.role, width: 120 }, { label: t.min, width: 40, align: "right" }, ...CATS.map((c) => ({ label: CAT_LABEL[c][lang].split(" ")[0], width: 70, align: "right" as const }))]}
              rows={players.map((p) => {
                const a = p.analysis;
                return [
                  clean(a.player),
                  a.goalkeeper ? (isIS ? "Markmaður" : "Goalkeeper") : a.role ? CAT_LABEL[a.role][lang] : "-",
                  a.minutes != null ? String(Math.round(a.minutes)) : "-",
                  ...CATS.map((c) => (a.goalkeeper ? "-" : <Pct key={c} p={a.byCategory[c]} />)),
                ];
              })}
            />
          </Section>
        ) : null}

        <Section title={t.perPlayer} break={field.length > 0}>
          {players.map((p) => <PlayerSection key={p.analysis.player} p={p} lang={lang} />)}
        </Section>

        <Section title={t.howTo} wrap={false}>
          <Card><Text style={[fb(400), { fontSize: 8.5, lineHeight: 1.5, color: C.ink }]}>{t.foot}</Text></Card>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadOpponentPlayersPdf(opponent: string, season: string, players: PdfPlayer[], lang: Lang) {
  const blob = await renderPdfBlob(() => <Doc opponent={opponent} season={season} players={players} lang={lang} />);
  saveBlob(blob, `${opponent.replace(/\s+/g, "-")}-players-${season}.pdf`);
}
