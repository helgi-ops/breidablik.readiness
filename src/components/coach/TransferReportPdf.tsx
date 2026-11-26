"use client";

/**
 * TransferReportPdf — the Breiðablik-branded performance dossier for a departing
 * player, for the receiving club's performance staff. The masthead carries the club
 * logo; the read is explainability-first:
 *   layer 0  the labelled AI summary (<AiBox>) — or, without AI, a rule-written line
 *            on what the window covers
 *   layer 1  identity strip + the AI physical / game read, strengths and watch points
 *   layer 2  charts (squad-percentile radars, match trend) and every dossier section
 *            (headline -> plain facts -> compact raw table, each with a confidence chip)
 * Styling comes from the shared MicroPulse PDF kit (src/components/pdf/brand.tsx); the
 * SVG charts use the kit tokens.
 *
 * Descriptive export — it never encodes the readiness colour or an availability
 * decision. The coach downloads it and shares it themselves.
 */

import type { ReactNode } from "react";
import { Document, Text, View, Image, Svg, Polygon, Line, Circle, Rect } from "@react-pdf/renderer";
import {
  AiBox, BrandPage, Bullets, C, Card, Chip, Label, Provenance, StatGrid, Table, Verdict,
  clean, fb, fh, renderPdfBlob, saveBlob, type Col, type Tone,
} from "@/components/pdf/brand";
import type { TransferDossier, DossierSection, Confidence, ClockPoint } from "@/lib/micropulse/transferReport";
import { DIRECTIONS } from "@/lib/micropulse/directionalSignature";
import type { TransferAiSummary } from "@/lib/micropulse/transferReport/ai";
import type { RadarMetric, TrendBar } from "@/components/coach/PlayerGameReportCharts";

type Lang = "EN" | "IS";
export type TransferRadar = { engine: RadarMetric[]; driver: RadarMetric[] } | null;
export type TrendSeries = { bars: TrendBar[]; avg: number | null };
export type TransferTrends = { distance: TrendSeries; hsr: TrendSeries; sprint: TrendSeries } | null;

const LOGO = "/breidablik-ubk-vector-logo.png";

/** Confidence chip — tone + the word (colour is never the only signal). */
const CONF: Record<Confidence, { tone: Tone; en: string; is: string }> = {
  high: { tone: "green", en: "HIGH CONFIDENCE", is: "MIKIL VISSA" },
  moderate: { tone: "cobalt", en: "MODERATE", is: "MIÐLUNGS" },
  low: { tone: "amber", en: "LIMITED DATA", is: "TAKMÖRKUÐ GÖGN" },
  none: { tone: "neutral", en: "NO DATA", is: "ENGIN GÖGN" },
};

const T = {
  EN: { dossier: "Performance Dossier", prepared: "Prepared by Breiðablik UBK Performance", window: "window", sessions: "sessions", matches: "matches",
    pos: "Position", age: "Age", height: "Height", weight: "Weight", aiNote: "Written from the numbers below - cites the data, decides nothing",
    strengths: "Strengths", watch: "Watch points", details: "Details", overview: "What this dossier covers",
    covers: (s: number, m: number, d: number) => `${s} sessions and ${m} matches over a ${d}-day window.`,
    coversBody: "Each section opens with its one-line read and the supporting facts; the raw numbers follow in a compact table. Confidence chips show how much data sits behind each section.",
    source: "Source / how to read",
    note: "Descriptive performance export - never a readiness verdict, injury judgement or availability decision.",
    foot: "Descriptive performance export shared by Breiðablik UBK as part of an agreed transfer. Figures are session/test aggregates over the window; they never encode a readiness verdict, an injury judgement, or an availability decision. Source signals: Catapult (GPS/IMA), VALD ForceDecks, GymAware (VBT), match records and fitness tests." },
  IS: { dossier: "Frammistöðuskýrsla", prepared: "Unnið af Breiðablik UBK Performance", window: "tímabil", sessions: "lotur", matches: "leikir",
    pos: "Staða", age: "Aldur", height: "Hæð", weight: "Þyngd", aiNote: "Skrifað úr tölunum að neðan - vitnar í gögnin, ákveður ekkert",
    strengths: "Styrkleikar", watch: "Athuga", details: "Nánar", overview: "Hvað skýrslan nær yfir",
    covers: (s: number, m: number, d: number) => `${s} lotur og ${m} leikir á ${d} daga tímabili.`,
    coversBody: "Hver kafli byrjar á einnar línu lestri og stuðningsatriðum; hráu tölurnar fylgja í þéttri töflu. Vissu-merkin sýna hversu mikil gögn liggja að baki hverjum kafla.",
    source: "Uppruni / hvernig á að lesa",
    note: "Lýsandi frammistöðu-útflutningur - aldrei readiness-dómur, meiðslamat eða ákvörðun um leikhæfi.",
    foot: "Lýsandi frammistöðu-útflutningur, deilt af Breiðablik UBK sem hluti af samþykktum félagaskiptum. Tölur eru samtölur lota/prófa á tímabilinu; þær fela aldrei í sér readiness-dóm, meiðslamat eða ákvörðun um leikhæfi. Uppsprettur: Catapult (GPS/IMA), VALD ForceDecks, GymAware (VBT), leikjaskrár og þolpróf." },
} as const;

const svgText = (size: number, w: 400 | 600 = 400) => ({ ...fb(w), fontSize: size });

function ConfChip({ c, lang }: { c: Confidence; lang: Lang }) {
  const cc = CONF[c];
  return <Chip text={lang === "IS" ? cc.is : cc.en} tone={cc.tone} />;
}

/** Kit-style masthead with the club logo on the left (the kit's Masthead has no image slot). */
function LogoMasthead({ title, kicker, subtitle, byline, chip }: { title: string; kicker: string; subtitle: string; byline: string; chip: ReactNode }) {
  const tt = clean(title);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 12, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: C.rule }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={LOGO} style={{ width: 46, height: 47 }} />
      <View style={{ flex: 1 }}>
        <Text style={[fb(600), { fontSize: 8, letterSpacing: 1.1, color: C.cobalt, marginBottom: 4 }]}>{clean(kicker).toUpperCase()}</Text>
        <Text style={[fh(800), { fontSize: tt.length > 30 ? 20 : 26, lineHeight: 1.05, letterSpacing: -0.5 }]}>{tt}</Text>
        <Text style={[fb(400), { fontSize: 9.5, color: C.mute, marginTop: 4 }]}>{clean(subtitle)}</Text>
        <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 2 }]}>{clean(byline)}</Text>
      </View>
      <View style={{ paddingBottom: 2 }}>{chip}</View>
    </View>
  );
}

/** Section heading row with its confidence chip (kit Section look). */
function SecHead({ title, chip }: { title: string; chip?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 }}>
      <Text style={[fh(700), { fontSize: 13, letterSpacing: -0.1 }]}>{clean(title)}</Text>
      {chip}
    </View>
  );
}

/** Percentile radar (player vs squad), mirroring the Player Game Report chart,
 *  drawn with react-pdf SVG primitives. */
function RadarSvg({ metrics, title, color }: { metrics: RadarMetric[]; title: string; color: string }) {
  const N = metrics.length;
  if (N < 3) return null;
  const W = 210, H = 160, cx = W / 2, cy = H / 2 + 2, R = 54;
  const ang = (i: number) => (-90 + (i * 360) / N) * (Math.PI / 180);
  const pt = (i: number, pct: number) => {
    const r = (Math.max(0, Math.min(100, pct)) / 100) * R;
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
  };
  const ringPts = (pct: number) => metrics.map((_, i) => pt(i, pct).join(",")).join(" ");
  const playerPts = metrics.map((m, i) => pt(i, m.percentile).join(",")).join(" ");
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[fb(600), { fontSize: 8.5, marginBottom: 1 }]}>{clean(title)}</Text>
      <Svg width={W} height={H}>
        {[25, 50, 75, 100].map((pct) => <Polygon key={pct} points={ringPts(pct)} fill="none" stroke={C.rule} strokeWidth={0.6} />)}
        {metrics.map((_, i) => { const [x, y] = pt(i, 100); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.rule} strokeWidth={0.5} />; })}
        <Polygon points={playerPts} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={1.3} />
        {metrics.map((m, i) => { const [x, y] = pt(i, m.percentile); return <Circle key={i} cx={x} cy={y} r={1.6} fill={color} />; })}
        {metrics.map((m, i) => {
          const [lx, ly] = pt(i, 124);
          return <Text key={i} x={lx} y={ly + 2} style={svgText(6.25)} fill={C.mute} textAnchor="middle">{clean(m.label)}</Text>;
        })}
      </Svg>
    </View>
  );
}

/** Per-match trend bars (per-90), mirroring the Player Game Report charts. */
function TrendChart({ series, title, unit, color }: { series: TrendSeries; title: string; unit: string; color: string }) {
  const bars = series.bars;
  if (!bars.length) return null;
  const W = 160, H = 84, ml = 4, mr = 4, mt = 15, mb = 6;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const maxV = Math.max(series.avg ?? 0, ...bars.map((b) => b.value)) * 1.12 || 1;
  const n = bars.length, gap = 2;
  const bw = Math.max(2, (plotW - gap * (n - 1)) / n);
  const yFor = (v: number) => mt + plotH - (v / maxV) * plotH;
  const avgY = series.avg != null ? yFor(series.avg) : null;
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Svg width={W} height={H}>
        <Text x={ml} y={9} style={svgText(7, 600)} fill={C.ink}>{clean(title)}</Text>
        {series.avg != null ? <Text x={W - mr} y={9} style={svgText(6.5)} fill={C.mute} textAnchor="end">{`avg ${Math.round(series.avg).toLocaleString("en-US")} ${unit}`}</Text> : null}
        <Line x1={ml} y1={mt + plotH} x2={W - mr} y2={mt + plotH} stroke={C.ruleStrong} strokeWidth={0.6} />
        {bars.map((b, i) => {
          const x = ml + i * (bw + gap), y = yFor(b.value);
          return <Rect key={i} x={x} y={y} width={bw} height={Math.max(0, mt + plotH - y)} fill={color} fillOpacity={0.85} />;
        })}
        {avgY != null ? <Line x1={ml} y1={avgY} x2={W - mr} y2={avgY} stroke={C.ink} strokeWidth={0.7} strokeDasharray="3 2" /> : null}
      </Svg>
    </View>
  );
}

function TrendBlock({ trends, lang }: { trends: NonNullable<TransferTrends>; lang: Lang }) {
  const any = trends.distance.bars.length || trends.hsr.bars.length || trends.sprint.bars.length;
  if (!any) return null;
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <SecHead title={lang === "IS" ? "Leik-fyrir-leik þróun (per 90)" : "Match-by-match trend (per 90)"} />
      <Card pad={9}>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <TrendChart series={trends.distance} title={lang === "IS" ? "Vegalengd (m)" : "Distance (m)"} unit="m" color={C.green} />
          <TrendChart series={trends.hsr} title="HSR (m)" unit="m" color={C.cobalt} />
          <TrendChart series={trends.sprint} title={lang === "IS" ? "Sprettur (m)" : "Sprint (m)"} unit="m" color={C.amber} />
        </View>
        <Provenance>{lang === "IS" ? "Hver súla = einn leikur (per 90). Brotna línan = meðaltal hans." : "Each bar = one match (per 90). Dashed line = his average."}</Provenance>
      </Card>
    </View>
  );
}

function RadarBlock({ radar, lang }: { radar: NonNullable<TransferRadar>; lang: Lang }) {
  const engine = lang === "IS" ? "Vél (GPS) vs hópur" : "Engine (GPS) vs squad";
  const driver = lang === "IS" ? "Drif (IMA) vs hópur" : "Driver (IMA) vs squad";
  const hasE = radar.engine.length >= 3, hasD = radar.driver.length >= 3;
  if (!hasE && !hasD) return null;
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <SecHead title={lang === "IS" ? "Líkamlegur prófíll vs hópur" : "Physical profile vs squad"} />
      <Card pad={9}>
        <Text style={[fb(600), { fontSize: 9, marginBottom: 4 }]}>{lang === "IS" ? "Vél = magn (GPS); Drif = hvernig hann hreyfir sig (IMA). Ásar = percentíl innan hóps." : "Engine = how much (GPS); Driver = how he moves (IMA). Axes are squad percentiles."}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          {hasE ? <RadarSvg metrics={radar.engine} title={engine} color={C.green} /> : null}
          {hasD ? <RadarSvg metrics={radar.driver} title={driver} color={C.cobalt} /> : null}
        </View>
      </Card>
    </View>
  );
}

/** IMA clock — a 12-direction polar chart (12 o'clock = straight ahead). */
function ClockRadarPdf({ points, lang }: { points: ClockPoint[]; lang: Lang }) {
  const W = 274, H = 214, cx = W / 2, cy = H / 2, R = 74;
  const max = Math.max(1, ...points.map((p) => p.value));
  const at = (dir: string, frac: number) => {
    const th = ((Number(dir) % 12) * 30) * (Math.PI / 180);
    const r = frac * R;
    return [cx + r * Math.sin(th), cy - r * Math.cos(th)] as const;
  };
  const atRad = (dir: string, radius: number) => {
    const th = ((Number(dir) % 12) * 30) * (Math.PI / 180);
    return [cx + radius * Math.sin(th), cy - radius * Math.cos(th)] as const;
  };
  const ordered = [...points].sort((a, b) => (Number(a.dir) % 12) - (Number(b.dir) % 12));
  const poly = ordered.map((p) => at(p.dir, p.value / max).join(",")).join(" ");
  const dom = [...points].sort((a, b) => b.value - a.value)[0];
  const card = lang === "IS"
    ? { f: "Áfram", r: "Hægri", b: "Aftur", l: "Vinstri" }
    : { f: "Forward", r: "Right", b: "Back", l: "Left" };
  return (
    <View style={{ alignItems: "center", marginTop: 2, marginBottom: 4 }} wrap={false}>
      <Svg width={W} height={H}>
        {[0.25, 0.5, 0.75, 1].map((f, i) => <Circle key={i} cx={cx} cy={cy} r={f * R} fill="none" stroke={C.rule} strokeWidth={0.6} />)}
        {DIRECTIONS.map((d) => { const [x, y] = at(d, 1); return <Line key={d} x1={cx} y1={cy} x2={x} y2={y} stroke={C.rule} strokeWidth={0.45} />; })}
        <Polygon points={poly} fill={C.cobalt} fillOpacity={0.16} stroke={C.cobalt} strokeWidth={1.3} />
        {ordered.map((p, i) => { const [x, y] = at(p.dir, p.value / max); return <Circle key={i} cx={x} cy={y} r={dom && p.dir === dom.dir ? 2.8 : 1.5} fill={dom && p.dir === dom.dir ? C.cobalt : C.cobaltEdge} />; })}
        {DIRECTIONS.map((d) => { const [x, y] = atRad(d, R + 9); return <Text key={d} x={x} y={y + 2.4} style={svgText(6.5)} fill={C.mute} textAnchor="middle">{d}</Text>; })}
        <Text x={cx} y={cy - R - 22} style={svgText(7.5, 600)} fill={C.ink} textAnchor="middle">{card.f}</Text>
        <Text x={cx + R + 22} y={cy + 2.5} style={svgText(7.5, 600)} fill={C.ink} textAnchor="start">{card.r}</Text>
        <Text x={cx} y={cy + R + 26} style={svgText(7.5, 600)} fill={C.ink} textAnchor="middle">{card.b}</Text>
        <Text x={cx - R - 22} y={cy + 2.5} style={svgText(7.5, 600)} fill={C.ink} textAnchor="end">{card.l}</Text>
      </Svg>
    </View>
  );
}

function SectionBlock({ sec, lang, clock }: { sec: DossierSection; lang: Lang; clock?: ClockPoint[] | null }) {
  // Short sections (e.g. the 13-row athlete profile) are kept whole so a single
  // row never orphans onto the next page; long sections flow (the kit table header
  // repeats), but their header + headline + facts stay together and
  // `minPresenceAhead` breaks before the header if there isn't room for it plus the
  // start of its table.
  const totalRows = sec.tables.reduce((n, t) => n + t.rows.length, 0);
  const keepWhole = totalRows <= 16;
  const B = (b: { en: string; is: string }) => (lang === "IS" ? b.is : b.en);
  return (
    <View style={{ marginBottom: 12 }} break={!!sec.pdfBreakBefore} wrap={!keepWhole}>
      <View wrap={false} minPresenceAhead={130}>
        <SecHead title={B(sec.title)} chip={<ConfChip c={sec.confidence} lang={lang} />} />
        {sec.headline ? <Text style={[fh(700), { fontSize: 10.5, lineHeight: 1.3, marginBottom: 4 }]}>{clean(B(sec.headline))}</Text> : null}
        {sec.facts.length ? <Bullets items={sec.facts.map(B)} size={8.75} /> : null}
      </View>
      {clock && clock.length ? <ClockRadarPdf points={clock} lang={lang} /> : null}
      {sec.tables.filter((t) => t.rows.length).map((tbl, ti) => {
        const cols: Col[] = tbl.columns.map((c, i) => ({ label: B(c), flex: i === 0 ? 2 : 1, align: i === 0 ? "left" : "right" }));
        return (
          <View style={{ marginTop: 5 }} key={ti} minPresenceAhead={60}>
            {tbl.caption ? <Label>{B(tbl.caption)}</Label> : null}
            <Table dense size={8} cols={cols} rows={tbl.rows} />
          </View>
        );
      })}
    </View>
  );
}

export function TransferDoc({ dossier, ai, radar, trends, lang }: { dossier: TransferDossier; ai: TransferAiSummary | null; radar: TransferRadar; trends: TransferTrends; lang: Lang }) {
  const t = T[lang];
  const id = dossier.identity;
  const w = dossier.window;
  const sub = [id.position, id.ageYears != null ? `${id.ageYears} ${lang === "IS" ? "ára" : "yrs"}` : null, `${w.start} - ${w.end}`, `${w.days}-${lang === "IS" ? "daga" : "day"} ${t.window}`].filter(Boolean).join(" · ");
  const hasAiDetail = !!(ai && (ai.physicalProfile || ai.gameProfile || ai.strengths?.length || ai.watchPoints?.length));
  return (
    <Document title={`${id.name} - ${t.dossier}`} author="Breiðablik UBK · MicroPulse">
      <BrandPage doc={t.dossier} context={`${id.name} · Breiðablik UBK`} note={t.note}>
        <LogoMasthead
          kicker={t.dossier}
          title={id.name}
          subtitle={sub}
          byline={`${t.prepared} · ${w.sessions} ${t.sessions} · ${w.matches} ${t.matches}`}
          chip={<ConfChip c={dossier.overallConfidence} lang={lang} />}
        />

        {/* Identity strip (header facts) */}
        <View style={{ marginBottom: 10 }}>
          <StatGrid
            cols={4}
            items={[
              { label: t.pos, value: id.position ?? "-" },
              { label: t.age, value: id.ageYears != null ? String(id.ageYears) : "-" },
              { label: t.height, value: id.heightCm != null ? `${Math.round(id.heightCm)} cm` : "-" },
              { label: t.weight, value: id.massKg != null ? `${Math.round(id.massKg)} kg` : "-" },
            ]}
          />
        </View>

        {/* Layer 0 + 1 — the AI summary (labelled as AI): headline first, then the physical / game read,
            strengths and watch points. Without AI, a rule-written line on what the window covers. */}
        {ai && (ai.headline || ai.summary || hasAiDetail) ? (
          <View wrap={false}>
            <AiBox label={t.aiNote.toUpperCase()} headline={ai.headline} body={ai.summary}>
              {ai.physicalProfile ? <Text style={[fb(400), { fontSize: 9, lineHeight: 1.5, marginTop: 4, color: "#2b2f35" }]}>{clean(ai.physicalProfile)}</Text> : null}
              {ai.gameProfile ? <Text style={[fb(400), { fontSize: 9, lineHeight: 1.5, marginTop: 4, color: "#2b2f35" }]}>{clean(ai.gameProfile)}</Text> : null}
              {ai.strengths?.length || ai.watchPoints?.length ? (
                <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                  {ai.strengths?.length ? (
                    <View style={{ flex: 1 }}>
                      <Label color={C.greenText}>{t.strengths}</Label>
                      <Bullets items={ai.strengths} tone="green" size={8.5} />
                    </View>
                  ) : null}
                  {ai.watchPoints?.length ? (
                    <View style={{ flex: 1 }}>
                      <Label color={C.amberText}>{t.watch}</Label>
                      <Bullets items={ai.watchPoints} tone="amber" size={8.5} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </AiBox>
          </View>
        ) : (
          <Verdict tone="neutral" label={t.overview} headline={t.covers(w.sessions, w.matches, w.days)} body={t.coversBody} />
        )}

        {/* Layer 2 — charts, then every section's raw read */}
        {radar ? <RadarBlock radar={radar} lang={lang} /> : null}
        {trends ? <TrendBlock trends={trends} lang={lang} /> : null}

        {dossier.sections.map((sec) => <SectionBlock key={sec.id} sec={sec} lang={lang} clock={sec.id === "ima-clock" ? dossier.imaClock : null} />)}

        <Card style={{ marginTop: 4 }}>
          <Label>{t.source}</Label>
          <Provenance>{t.foot}</Provenance>
        </Card>
      </BrandPage>
    </Document>
  );
}

export async function downloadTransferReportPdf(dossier: TransferDossier, ai: TransferAiSummary | null, radar: TransferRadar, trends: TransferTrends, lang: Lang) {
  const blob = await renderPdfBlob(() => <TransferDoc dossier={dossier} ai={ai} radar={radar} trends={trends} lang={lang} />);
  saveBlob(blob, `${dossier.identity.name.replace(/\s+/g, "-")}-Breidablik-performance-dossier.pdf`);
}
