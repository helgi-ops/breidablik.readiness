"use client";

/**
 * BasketballMatchPdf — the single-game InStat read as a downloadable PDF.
 *
 * Explainability-first layered read (docs/explainability-first.md):
 *   Page 1  the AI game summary (labelled AI) → 2-3 plain rule facts (margin, shooting,
 *           ball security) → the AI game read (what decided it, flow, players, takeaways).
 *   Page 2  the numbers it reasons from — Four Factors, per quarter, how we scored
 *           (playtypes + efficiency), shot map and zones, opponent players, lineups.
 *
 * Styling comes from the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 * AI is labelled AS AI and cites the data; descriptive — never touches readiness.
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, BrandPage, Bullets, C, Cols, FactRow, Label, Section, StatGrid, Table, TONE, Verdict, clean, fb, fh, n1, pc, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
import type { Tone } from "@/components/pdf/brand";
import { shotLabel, zoneLabel, type Lang } from "@/lib/micropulse/basketballStats/shotLabels";

type MA = { m: number | null; a: number | null };
type ShotTypeAgg = { key: string; made: number; att: number; pct: number | null };
type ZoneAgg = { key: string; made: number; att: number; pct: number | null };
type FactorAvg = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null };
type OppPlayer = { name: string; minutes: number | null; points: number | null; fg: MA; threePt: MA };
type Lineup = { players: string[]; minutes: number | null; plusMinus: number | null; pointsFor: number | null; pointsAgainst: number | null };

export type BasketballMatchPdfData = {
  match: { ownName?: string | null; opponent: string | null; ownPoints: number | null; oppPoints: number | null; date: string | null };
  fourFactors: { own: FactorAvg; opp: FactorAvg } | null;
  quarters: { own: (number | null)[]; opp: (number | null)[] } | null;
  tacticalShots: { playtypes: ShotTypeAgg[]; efficiency: ShotTypeAgg[] } | null;
  shotZones: { team: ZoneAgg[] } | null;
  courtRegions: { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null }[] | null;
  oppPlayers: { team: string | null; players: OppPlayer[] } | null;
  lineups: Lineup[] | null;
};
export type BasketballAiSummary = {
  headline?: string; result?: string; summary?: string;
  decisiveFactors?: { factor: string; detail: string }[];
  quarterFlow?: string;
  keyPlayers?: { name: string; note: string }[];
  opponentThreats?: { name: string; note: string }[];
  takeaways?: string[];
};

const maS = (c: MA) => (c.m == null && c.a == null ? "-" : `${c.m ?? 0}-${c.a ?? 0}`);
const ma = (r: { made: number; att: number }) => `${r.made}-${r.att}`;
const fgp = (v: number | null) => (v == null ? "-" : `${v}%`);
const signed = (v: number | null | undefined, d = 1) => (v == null ? "-" : `${v > 0 ? "+" : ""}${Number.isInteger(v) ? v : v.toFixed(d)}`);

const T = {
  EN: {
    doc: "Single match", kicker: "Single match analysis · InStat", ai: "READS THE NUMBERS - DECIDES NOTHING", read: "AI GAME READ - WRITTEN FROM THE NUMBERS ON PAGE 2",
    win: "Win", loss: "Loss", draw: "Draw", ourTeam: "Our team",
    margin: "Final margin", result: "Result", ffWon: (n: number, of: number) => `we won ${n} of ${of} Four Factors`, by: (n: number) => `by ${n}`, efg: "Shooting (eFG%)", tov: "Turnovers (TO%)", oppShort: "Opponent",
    gameRead: "How the game was decided", decided: "What decided it", flow: "How it flowed", ourPl: "Our key players", oppThreat: "Opponent threats", takeaways: "Takeaways",
    numbers: "The numbers", numbersHint: "Everything the summary above was written from.",
    ff: "Four Factors (us vs opponent)", ffHint: "eFG% = shooting adjusted for threes · TO% = turnovers per possession · OREB% = offensive rebounds · FTF = free throws per shot · PPP = points per possession.",
    byQ: "By quarter", scored: "How we scored", playtypes: "FG playtypes", eff: "Offensive-efficiency types", playType: "Play type", type: "Type", madeAtt: "Made-att",
    map: "Shot map (paint / mid-range / 3PT)", zones: "Shot zones", zone: "Zone", region: "Region",
    opp: "Opponent players", player: "Player", lineups: "Lineups (net +/-)", lineupsHint: "By minutes on court, with the score while each unit played.", lineup: "Lineup", score: "Score",
    min: "Min", pts: "Pts", us: "Us", them: "Opp",
    foot: "InStat single-game read. The AI summary is AI-generated from these numbers, is labelled as such, and decides nothing - it never changes a readiness verdict.",
  },
  IS: {
    doc: "Stakur leikur", kicker: "Stakur leikur · InStat", ai: "LES TÖLURNAR - ÁKVEÐUR EKKERT", read: "AI-LESTUR - SKRIFAÐUR ÚT FRÁ TÖLUNUM Á BLS. 2",
    win: "Sigur", loss: "Tap", draw: "Jafntefli", ourTeam: "Okkar lið",
    margin: "Munur í lokin", result: "Úrslit", ffWon: (n: number, of: number) => `unnum ${n} af ${of} Four Factors`, by: (n: number) => `með ${n} stigum`, efg: "Skotnýting (eFG%)", tov: "Tapaðir boltar (TO%)", oppShort: "Andstæðingur",
    gameRead: "Hvað réð úrslitum leiksins", decided: "Hvað réð úrslitum", flow: "Framvinda leiksins", ourPl: "Okkar lykilmenn", oppThreat: "Hættulegastir hjá andstæðingi", takeaways: "Lærdómar",
    numbers: "Tölurnar", numbersHint: "Allt sem samantektin hér að ofan byggir á.",
    ff: "Four Factors (við vs andstæðingur)", ffHint: "eFG% = skotnýting leiðrétt fyrir þristum · TO% = tapaðir boltar á sókn · OREB% = sóknarfráköst · FTF = vítaskot á skot · PPP = stig á sókn.",
    byQ: "Eftir leikhlutum", scored: "Hvernig við skoruðum", playtypes: "Sóknartegundir", eff: "Sóknargerð (efficiency)", playType: "Sóknartegund", type: "Tegund", madeAtt: "Hitt-reynt",
    map: "Skotkort (teigur / miðsvæði / þristar)", zones: "Skotsvæði", zone: "Svæði", region: "Svæði",
    opp: "Andstæðingur - leikmenn", player: "Leikmaður", lineups: "Fimmur (net +/-)", lineupsHint: "Eftir mínútum á velli, með stöðuna á meðan hver fimma spilaði.", lineup: "Fimma", score: "Staða",
    min: "Mín", pts: "Stig", us: "Við", them: "Andst.",
    foot: "InStat-lestur á stökum leik. AI-samantektin er gerð af gervigreind úr þessum tölum, merkt sem slík og ákveður ekkert - breytir aldrei readiness-dómi.",
  },
} as const;

const regionName = (k: "paint" | "mid" | "three", lang: Lang) =>
  k === "paint" ? (lang === "IS" ? "Teigur" : "Paint") : k === "mid" ? (lang === "IS" ? "Miðsvæði" : "Mid-range") : (lang === "IS" ? "Þristar" : "3PT");

/** "Name - note" list used for both key players and opponent threats. */
function NamedList({ title, items }: { title: string; items: { name: string; note: string }[] }) {
  return (
    <View>
      <Label color={C.cobalt}>{title}</Label>
      {items.map((p, i) => (
        <Text key={i} style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, marginBottom: 2 }]}>
          <Text style={fb(600)}>{clean(p.name)}</Text>{p.note ? ` - ${clean(p.note)}` : ""}
        </Text>
      ))}
    </View>
  );
}

function Doc({ data, ai, lang }: { data: BasketballMatchPdfData; ai: BasketballAiSummary | null; lang: Lang }) {
  const t = T[lang];
  const m = data.match;
  const own = clean(m.ownName ?? t.ourTeam);
  const opp = clean(m.opponent ?? "-");
  const title = `${own} ${m.ownPoints ?? "-"} - ${m.oppPoints ?? "-"} ${opp}`;
  const q = data.quarters;
  const ff = data.fourFactors;
  const diff = m.ownPoints != null && m.oppPoints != null ? m.ownPoints - m.oppPoints : null;
  const resTone: Tone = diff == null ? "neutral" : diff > 0 ? "green" : diff < 0 ? "red" : "amber";
  const resWord = diff == null ? null : diff > 0 ? t.win : diff < 0 ? t.loss : t.draw;

  // Layer 1 — plain rule facts straight from the box score / Four Factors.
  const facts: { value: string; label: string; sub?: string; tone?: Tone }[] = [];
  if (diff != null) facts.push({ value: signed(diff), label: t.margin, sub: `${resWord} ${m.ownPoints}-${m.oppPoints}`, tone: resTone });
  if (ff?.own.efgPct != null) facts.push({ value: pc(ff.own.efgPct), label: t.efg, sub: `${t.oppShort} ${pc(ff.opp.efgPct)}` });
  if (ff?.own.toPct != null) facts.push({ value: pc(ff.own.toPct), label: t.tov, sub: `${t.oppShort} ${pc(ff.opp.toPct)}` });

  // Layer 0 (rule) when there is no AI headline: result + how many Four Factors we won.
  const ffCmp = ff ? ([["efgPct", 1], ["toPct", -1], ["orebPct", 1], ["ftf", 1]] as const).filter(([k]) => ff.own[k] != null && ff.opp[k] != null) : [];
  const ffWon = ff ? ffCmp.filter(([k, dir]) => (ff.own[k]! - ff.opp[k]!) * dir > 0).length : 0;
  const ruleHead = resWord ? `${resWord}${diff ? ` ${t.by(Math.abs(diff))}` : ""}${ffCmp.length ? ` - ${t.ffWon(ffWon, ffCmp.length)}` : ""}.` : null;

  const hasRead = !!(ai && (ai.decisiveFactors?.length || ai.quarterFlow || ai.keyPlayers?.length || ai.opponentThreats?.length || ai.takeaways?.length));
  const tac = data.tacticalShots;
  const hasScored = !!(tac && (tac.playtypes.length || tac.efficiency.length));
  const regions = data.courtRegions ?? [];
  const zones = data.shotZones?.team ?? [];
  const nQ = q ? Math.max(q.own.length, q.opp.length) : 0;
  const shotCols = (first: string) => [{ label: first, flex: 1 }, { label: t.madeAtt, width: 54, align: "right" as const }, { label: "FG%", width: 44, align: "right" as const, strong: true }];

  return (
    <Document title={`${title} - InStat`} author="MicroPulse">
      <BrandPage
        doc={t.doc}
        context={`${own} vs ${opp}`}
        title={title}
        kicker={t.kicker}
        subtitle={clean(m.date ?? "")}
        chips={[...(resWord ? [{ text: resWord, tone: resTone }] : []), { text: "InStat" }]}
        note={t.foot}
      >
        {ai && (ai.headline || ai.summary) ? (
          <AiBox label={t.ai} headline={ai.headline} body={ai.summary} />
        ) : ruleHead ? (
          <Verdict tone={resTone} label={t.result} headline={ruleHead} />
        ) : null}

        {facts.length ? <FactRow facts={facts} /> : null}

        {hasRead && ai ? (
          <Section title={t.gameRead}>
            <AiBox label={t.read}>
              {ai.decisiveFactors?.length ? (
                <View style={{ marginTop: 8 }}>
                  <Label color={C.cobalt}>{t.decided}</Label>
                  <Bullets split items={ai.decisiveFactors.map((f) => `${clean(f.factor)} - ${clean(f.detail)}`)} />
                </View>
              ) : null}
              {ai.quarterFlow ? (
                <View style={{ marginTop: 6 }} wrap={false}>
                  <Label color={C.cobalt}>{t.flow}</Label>
                  <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.45 }]}>{clean(ai.quarterFlow)}</Text>
                </View>
              ) : null}
              {ai.keyPlayers?.length || ai.opponentThreats?.length ? (
                <View style={{ marginTop: 6 }} wrap={false}>
                  <Cols gap={14}>
                    {ai.keyPlayers?.length ? <NamedList title={t.ourPl} items={ai.keyPlayers} /> : null}
                    {ai.opponentThreats?.length ? <NamedList title={t.oppThreat} items={ai.opponentThreats} /> : null}
                  </Cols>
                </View>
              ) : null}
              {ai.takeaways?.length ? (
                <View style={{ marginTop: 6 }}>
                  <Label color={C.cobalt}>{t.takeaways}</Label>
                  <Bullets items={ai.takeaways} />
                </View>
              ) : null}
            </AiBox>
          </Section>
        ) : null}

        {/* ── Layer 2: the numbers ── */}
        <Section title={t.numbers} hint={t.numbersHint} break={!!ai} mt={0}>
          {ff ? (
            <View wrap={false} style={{ marginBottom: 10 }}>
              <Label>{t.ff}</Label>
              <StatGrid
                cols={5}
                items={([["eFG%", "efgPct", true], ["TO%", "toPct", true], ["OREB%", "orebPct", true], ["FTF", "ftf", true], ["PPP", "ppp", false]] as const).map(([lbl, key, isPct]) => ({
                  label: lbl,
                  value: isPct ? pc(ff.own[key]) : n1(ff.own[key]),
                  sub: `${t.them} ${isPct ? pc(ff.opp[key]) : n1(ff.opp[key])}`,
                }))}
              />
              <Text style={[fb(400), { fontSize: 7.5, color: C.mute, marginTop: 4, lineHeight: 1.35 }]}>{t.ffHint}</Text>
            </View>
          ) : null}

          {q && nQ ? (
            <View wrap={false} style={{ marginBottom: 10 }}>
              <Label>{t.byQ}</Label>
              <Table
                cols={[{ label: "", flex: 1.4 }, ...Array.from({ length: nQ }, (_, i) => ({ label: i < 4 ? `Q${i + 1}` : `OT${i - 3}`, flex: 1, align: "right" as const }))]}
                rows={[[t.us, ...Array.from({ length: nQ }, (_, i) => n1(q.own[i]))], [t.them, ...Array.from({ length: nQ }, (_, i) => n1(q.opp[i]))]]}
              />
            </View>
          ) : null}

          {hasScored && tac ? (
            <View style={{ marginBottom: 10 }}>
              <Label>{t.scored}</Label>
              <Cols>
                {tac.playtypes.length ? (
                  <View wrap={false}>
                    <Text style={[fh(700), { fontSize: 10, marginBottom: 4 }]}>{t.playtypes}</Text>
                    <Table cols={shotCols(t.playType)} rows={tac.playtypes.slice(0, 8).map((r) => [clean(shotLabel(r.key, lang)), ma(r), fgp(r.pct)])} />
                  </View>
                ) : null}
                {tac.efficiency.length ? (
                  <View wrap={false}>
                    <Text style={[fh(700), { fontSize: 10, marginBottom: 4 }]}>{t.eff}</Text>
                    <Table cols={shotCols(t.type)} rows={tac.efficiency.map((r) => [clean(shotLabel(r.key, lang)), ma(r), fgp(r.pct)])} />
                  </View>
                ) : null}
              </Cols>
            </View>
          ) : null}

          {regions.length || zones.length ? (
            <View style={{ marginBottom: 10 }} wrap={false}>
              <Cols>
                {regions.length ? (
                  <View>
                    <Label>{t.map}</Label>
                    <Table cols={shotCols(t.region)} rows={regions.map((r) => [regionName(r.key, lang), ma(r), fgp(r.pct)])} />
                  </View>
                ) : null}
                {zones.length ? (
                  <View>
                    <Label>{t.zones}</Label>
                    <Table cols={shotCols(t.zone)} rows={zones.map((z) => [clean(zoneLabel(z.key, lang)), ma(z), fgp(z.pct)])} />
                  </View>
                ) : null}
              </Cols>
            </View>
          ) : null}
        </Section>

        {data.oppPlayers && data.oppPlayers.players.length ? (
          <Section wrap={data.oppPlayers.players.length > 18} title={`${t.opp}${data.oppPlayers.team ? ` - ${clean(data.oppPlayers.team)}` : ""}`}>
            <Table
              cols={[{ label: t.player, flex: 1 }, { label: t.min, width: 44, align: "right" }, { label: t.pts, width: 44, align: "right", strong: true }, { label: "FG", width: 56, align: "right" }, { label: "3PT", width: 56, align: "right" }]}
              rows={[...data.oppPlayers.players].sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map((p) => [clean(p.name), p.minutes != null ? n1(p.minutes) : "-", p.points != null ? String(p.points) : "-", maS(p.fg), maS(p.threePt)])}
            />
          </Section>
        ) : null}

        {data.lineups && data.lineups.length ? (
          <Section wrap={false} title={t.lineups} hint={t.lineupsHint}>
            <Table
              cols={[{ label: t.lineup, flex: 1 }, { label: t.min, width: 44, align: "right" }, { label: t.score, width: 60, align: "right" }, { label: "+/-", width: 48, align: "right" }]}
              rows={[...data.lineups].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 10).map((l) => {
                const pmTone: Tone = (l.plusMinus ?? 0) > 0 ? "green" : (l.plusMinus ?? 0) < 0 ? "red" : "neutral";
                return [
                  clean(l.players.join(", ")),
                  l.minutes != null ? `${l.minutes.toFixed(1)}m` : "-",
                  `${l.pointsFor ?? "-"}-${l.pointsAgainst ?? "-"}`,
                  <Text key="pm" style={[fh(700), { fontSize: 9, color: TONE[pmTone].text, textAlign: "right" }]}>{l.plusMinus == null ? "-" : signed(l.plusMinus)}</Text>,
                ];
              })}
            />
          </Section>
        ) : null}
      </BrandPage>
    </Document>
  );
}

export async function downloadBasketballMatchPdf(data: BasketballMatchPdfData, ai: BasketballAiSummary | null, lang: Lang) {
  const blob = await renderPdfBlob(() => <Doc data={data} ai={ai} lang={lang} />);
  const base = clean(`${data.match.ownName ?? "team"}-${data.match.opponent ?? "game"}-${data.match.date ?? ""}`).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "match";
  saveBlob(blob, `${base}-instat.pdf`);
}
