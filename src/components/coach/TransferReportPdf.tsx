"use client";

/**
 * TransferReportPdf — the Breiðablik-branded performance dossier for a departing
 * player, for the receiving club's performance staff. Header carries the club
 * logo; each section is a layered read (headline -> facts -> a compact table),
 * with a per-section confidence chip and an optional labelled AI summary at the
 * top. WinAnsi/Helvetica (Icelandic-safe): no arrows / ticks / U+2212.
 *
 * Descriptive export — it never encodes the readiness colour or an availability
 * decision. The coach downloads it and shares it themselves.
 */

import { Document, Page, StyleSheet, Text, View, Image, Svg, Polygon, Line, Circle, Rect, pdf } from "@react-pdf/renderer";
import type { TransferDossier, DossierSection, Confidence, ClockPoint } from "@/lib/micropulse/transferReport";
import { DIRECTIONS } from "@/lib/micropulse/directionalSignature";
import type { TransferAiSummary } from "@/lib/micropulse/transferReport/ai";
import type { RadarMetric, TrendBar } from "@/components/coach/PlayerGameReportCharts";

type Lang = "EN" | "IS";
export type TransferRadar = { engine: RadarMetric[]; driver: RadarMetric[] } | null;
export type TrendSeries = { bars: TrendBar[]; avg: number | null };
export type TransferTrends = { distance: TrendSeries; hsr: TrendSeries; sprint: TrendSeries } | null;

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";
const GREEN = "#1c7a4a", AMBER = "#de9328";
const LOGO = "/breidablik-ubk-vector-logo.png";

const s = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 34, paddingHorizontal: 32, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  logo: { width: 46, height: 47 },
  eyebrow: { fontSize: 7.5, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold", lineHeight: 1.15, marginTop: 1 },
  sub: { fontSize: 9, color: MUTE, marginTop: 2 },
  byline: { fontSize: 8, color: MUTE, marginTop: 6, marginBottom: 8 },
  idstrip: { flexDirection: "row", flexWrap: "wrap", gap: 12, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, marginBottom: 9 },
  idcell: { marginRight: 8 },
  idlabel: { fontSize: 7, color: MUTE, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  idval: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 1 },
  aibox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 10 },
  ailabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 3 },
  aihead: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  aitxt: { fontSize: 9, color: "#333", marginTop: 3, lineHeight: 1.45 },
  sec: { marginBottom: 9 },
  secHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  chip: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "white", paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 3, letterSpacing: 0.3 },
  headline: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK, marginTop: 1, marginBottom: 2 },
  caption: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MUTE, letterSpacing: 0.4, marginBottom: 1, marginTop: 1 },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  bDot: { width: 8, color: COBALT, fontFamily: "Helvetica-Bold" },
  trow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 1.8 },
  th: { fontFamily: "Helvetica-Bold", color: INK, fontSize: 8 },
  td: { fontSize: 8, color: "#333" },
  muted: { fontSize: 9, color: MUTE },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const CONF: Record<Confidence, { color: string; en: string; is: string }> = {
  high: { color: GREEN, en: "HIGH CONFIDENCE", is: "MIKIL VISSA" },
  moderate: { color: COBALT, en: "MODERATE", is: "MIÐLUNGS" },
  low: { color: AMBER, en: "LIMITED DATA", is: "TAKMORKUD GOGN" },
  none: { color: MUTE, en: "NO DATA", is: "ENGIN GOGN" },
};

const T = {
  EN: { dossier: "Performance Dossier", prepared: "Prepared by Breiðablik UBK Performance", window: "window", sessions: "sessions", matches: "matches",
    pos: "Position", age: "Age", height: "Height", weight: "Weight", ai: "AI SUMMARY", aiNote: "Written from the numbers below — cites the data, decides nothing",
    strengths: "Strengths", watch: "Watch points", details: "Details",
    foot: "Descriptive performance export shared by Breiðablik UBK as part of an agreed transfer. Figures are session/test aggregates over the window; they never encode a readiness verdict, an injury judgement, or an availability decision. Source signals: Catapult (GPS/IMA), VALD ForceDecks, GymAware (VBT), match records and fitness tests." },
  IS: { dossier: "Frammistöðuskýrsla", prepared: "Unnið af Breiðablik UBK Performance", window: "tímabil", sessions: "lotur", matches: "leikir",
    pos: "Staða", age: "Aldur", height: "Hæð", weight: "Þyngd", ai: "AI SAMANTEKT", aiNote: "Skrifað úr tölunum að neðan — vitnar í gögnin, ákveður ekkert",
    strengths: "Styrkleikar", watch: "Athuga", details: "Nánar",
    foot: "Lýsandi frammistöðu-útflutningur, deilt af Breiðablik UBK sem hluti af samþykktum félagaskiptum. Tölur eru samtölur lota/prófa á tímabilinu; þær fela aldrei í sér readiness-dóm, meiðslamat eða ákvörðun um leikhæfi. Uppsprettur: Catapult (GPS/IMA), VALD ForceDecks, GymAware (VBT), leikjaskrár og þolpróf." },
} as const;

function Chip({ c, lang }: { c: Confidence; lang: Lang }) {
  const cc = CONF[c];
  return <Text style={[s.chip, { backgroundColor: cc.color }]}>{lang === "IS" ? cc.is : cc.en}</Text>;
}

/** Percentile radar (player vs squad), mirroring the Player Game Report chart,
 *  drawn with react-pdf SVG primitives. */
function RadarSvg({ metrics, title, color }: { metrics: RadarMetric[]; title: string; color: string }) {
  const N = metrics.length;
  if (N < 3) return null;
  const W = 190, H = 150, cx = W / 2, cy = H / 2 + 2, R = 52;
  const ang = (i: number) => (-90 + (i * 360) / N) * (Math.PI / 180);
  const pt = (i: number, pct: number) => {
    const r = (Math.max(0, Math.min(100, pct)) / 100) * R;
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
  };
  const ringPts = (pct: number) => metrics.map((_, i) => pt(i, pct).join(",")).join(" ");
  const playerPts = metrics.map((m, i) => pt(i, m.percentile).join(",")).join(" ");
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 1 }}>{title}</Text>
      <Svg width={W} height={H}>
        {[25, 50, 75, 100].map((pct) => <Polygon key={pct} points={ringPts(pct)} fill="none" stroke="#e5e1d6" strokeWidth={0.5} />)}
        {metrics.map((_, i) => { const [x, y] = pt(i, 100); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e1d6" strokeWidth={0.5} />; })}
        <Polygon points={playerPts} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.2} />
        {metrics.map((m, i) => { const [x, y] = pt(i, m.percentile); return <Circle key={i} cx={x} cy={y} r={1.4} fill={color} />; })}
        {metrics.map((m, i) => {
          const [lx, ly] = pt(i, 122);
          return <Text key={i} x={lx} y={ly} style={{ fontSize: 6 }} fill={MUTE} textAnchor="middle">{m.label}</Text>;
        })}
      </Svg>
    </View>
  );
}

/** Per-match trend bars (per-90), mirroring the Player Game Report charts. */
function TrendChart({ series, title, unit, color }: { series: TrendSeries; title: string; unit: string; color: string }) {
  const bars = series.bars;
  if (!bars.length) return null;
  const W = 165, H = 82, ml = 4, mr = 4, mt = 15, mb = 6;
  const plotW = W - ml - mr, plotH = H - mt - mb;
  const maxV = Math.max(series.avg ?? 0, ...bars.map((b) => b.value)) * 1.12 || 1;
  const n = bars.length, gap = 2;
  const bw = Math.max(2, (plotW - gap * (n - 1)) / n);
  const yFor = (v: number) => mt + plotH - (v / maxV) * plotH;
  const avgY = series.avg != null ? yFor(series.avg) : null;
  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={W} height={H}>
        <Text x={ml} y={9} style={{ fontSize: 7 }} fill={INK}>{title}</Text>
        {series.avg != null ? <Text x={W - mr} y={9} style={{ fontSize: 6.5 }} fill={MUTE} textAnchor="end">{`avg ${Math.round(series.avg).toLocaleString()} ${unit}`}</Text> : null}
        {bars.map((b, i) => {
          const x = ml + i * (bw + gap), y = yFor(b.value);
          return <Rect key={i} x={x} y={y} width={bw} height={Math.max(0, mt + plotH - y)} fill={color} fillOpacity={0.8} />;
        })}
        {avgY != null ? <Line x1={ml} y1={avgY} x2={W - mr} y2={avgY} stroke={INK} strokeWidth={0.6} strokeDasharray="3 2" /> : null}
      </Svg>
    </View>
  );
}

function TrendBlock({ trends, lang }: { trends: NonNullable<TransferTrends>; lang: Lang }) {
  const any = trends.distance.bars.length || trends.hsr.bars.length || trends.sprint.bars.length;
  if (!any) return null;
  return (
    <View style={s.sec} wrap={false}>
      <View style={s.secHead}>
        <Text style={s.h2}>{lang === "IS" ? "Leik-fyrir-leik þróun (per 90)" : "Match-by-match trend (per 90)"}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 2 }}>
        <TrendChart series={trends.distance} title={lang === "IS" ? "Vegalengd (m)" : "Distance (m)"} unit="m" color={GREEN} />
        <TrendChart series={trends.hsr} title="HSR (m)" unit="m" color={COBALT} />
        <TrendChart series={trends.sprint} title={lang === "IS" ? "Sprettur (m)" : "Sprint (m)"} unit="m" color={AMBER} />
      </View>
    </View>
  );
}

function RadarBlock({ radar, lang }: { radar: NonNullable<TransferRadar>; lang: Lang }) {
  const engine = lang === "IS" ? "Vél (GPS) vs hópur" : "Engine (GPS) vs squad";
  const driver = lang === "IS" ? "Drif (IMA) vs hópur" : "Driver (IMA) vs squad";
  const hasE = radar.engine.length >= 3, hasD = radar.driver.length >= 3;
  if (!hasE && !hasD) return null;
  return (
    <View style={s.sec} wrap={false}>
      <View style={s.secHead}>
        <Text style={s.h2}>{lang === "IS" ? "Líkamlegur prófíll vs hópur" : "Physical profile vs squad"}</Text>
      </View>
      <Text style={s.headline}>{lang === "IS" ? "Vél = magn (GPS); Drif = hvernig hann hreyfir sig (IMA). Ásar = percentíl innan hóps." : "Engine = how much (GPS); Driver = how he moves (IMA). Axes are squad percentiles."}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 2 }}>
        {hasE ? <RadarSvg metrics={radar.engine} title={engine} color={GREEN} /> : null}
        {hasD ? <RadarSvg metrics={radar.driver} title={driver} color={COBALT} /> : null}
      </View>
    </View>
  );
}

/** IMA clock — a 12-direction polar chart (12 o'clock = straight ahead). */
function ClockRadarPdf({ points, lang }: { points: ClockPoint[]; lang: Lang }) {
  const W = 250, H = 210, cx = W / 2, cy = H / 2, R = 74;
  const max = Math.max(1, ...points.map((p) => p.value));
  const at = (dir: string, frac: number) => {
    const th = ((Number(dir) % 12) * 30) * (Math.PI / 180);
    const r = frac * R;
    return [cx + r * Math.sin(th), cy - r * Math.cos(th)] as const;
  };
  const ordered = [...points].sort((a, b) => (Number(a.dir) % 12) - (Number(b.dir) % 12));
  const poly = ordered.map((p) => at(p.dir, p.value / max).join(",")).join(" ");
  const dom = [...points].sort((a, b) => b.value - a.value)[0];
  const card = lang === "IS"
    ? { f: "Áfram", r: "Hægri", b: "Aftur", l: "Vinstri" }
    : { f: "Forward", r: "Right", b: "Back", l: "Left" };
  return (
    <View style={{ alignItems: "center", marginTop: 4 }}>
      <Svg width={W} height={H}>
        {[0.25, 0.5, 0.75, 1].map((f, i) => <Circle key={i} cx={cx} cy={cy} r={f * R} fill="none" stroke="#e5e1d6" strokeWidth={0.5} />)}
        {DIRECTIONS.map((d) => { const [x, y] = at(d, 1); return <Line key={d} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e1d6" strokeWidth={0.4} />; })}
        <Polygon points={poly} fill={COBALT} fillOpacity={0.16} stroke={COBALT} strokeWidth={1.2} />
        {ordered.map((p, i) => { const [x, y] = at(p.dir, p.value / max); return <Circle key={i} cx={x} cy={y} r={dom && p.dir === dom.dir ? 2.8 : 1.5} fill={dom && p.dir === dom.dir ? COBALT : "#8ea2ea"} />; })}
        <Text x={cx} y={cy - R - 4} style={{ fontSize: 7.5 }} fill={INK} textAnchor="middle">{card.f}</Text>
        <Text x={cx + R + 3} y={cy + 2.5} style={{ fontSize: 7.5 }} fill={INK} textAnchor="start">{card.r}</Text>
        <Text x={cx} y={cy + R + 10} style={{ fontSize: 7.5 }} fill={INK} textAnchor="middle">{card.b}</Text>
        <Text x={cx - R - 3} y={cy + 2.5} style={{ fontSize: 7.5 }} fill={INK} textAnchor="end">{card.l}</Text>
      </Svg>
    </View>
  );
}

function SectionBlock({ sec, lang, clock }: { sec: DossierSection; lang: Lang; clock?: ClockPoint[] | null }) {
  // Short sections (e.g. the 13-row athlete profile) are kept whole so a single
  // row never orphans onto the next page; long sections flow, but their header +
  // headline + facts stay together and `minPresenceAhead` breaks before the
  // header if there isn't room for it plus the start of its table.
  const totalRows = sec.tables.reduce((n, t) => n + t.rows.length, 0);
  const keepWhole = totalRows <= 16;
  return (
    <View style={s.sec} break={!!sec.pdfBreakBefore} wrap={!keepWhole}>
      <View wrap={false} minPresenceAhead={130}>
        <View style={s.secHead}>
          <Text style={s.h2}>{lang === "IS" ? sec.title.is : sec.title.en}</Text>
          <Chip c={sec.confidence} lang={lang} />
        </View>
        {sec.headline ? <Text style={s.headline}>{lang === "IS" ? sec.headline.is : sec.headline.en}</Text> : null}
        {sec.facts.map((f, i) => (
          <View style={s.bullet} key={i}><Text style={s.bDot}>·</Text><Text style={{ flex: 1 }}>{lang === "IS" ? f.is : f.en}</Text></View>
        ))}
      </View>
      {clock && clock.length ? <ClockRadarPdf points={clock} lang={lang} /> : null}
      {sec.tables.filter((t) => t.rows.length).map((tbl, ti) => (
        <View style={{ marginTop: 4 }} key={ti} minPresenceAhead={36}>
          <View wrap={false}>
            {tbl.caption ? <Text style={s.caption}>{lang === "IS" ? tbl.caption.is : tbl.caption.en}</Text> : null}
            <View style={s.trow}>
              {tbl.columns.map((c, i) => (
                <Text key={i} style={[s.th, { flex: i === 0 ? 2 : 1, textAlign: i === 0 ? "left" : "right" }]}>{lang === "IS" ? c.is : c.en}</Text>
              ))}
            </View>
          </View>
          {tbl.rows.map((row, ri) => (
            <View style={s.trow} key={ri}>
              {row.map((cell, ci) => (
                <Text key={ci} style={[s.td, { flex: ci === 0 ? 2 : 1, textAlign: ci === 0 ? "left" : "right" }]}>{cell}</Text>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function TransferDoc({ dossier, ai, radar, trends, lang }: { dossier: TransferDossier; ai: TransferAiSummary | null; radar: TransferRadar; trends: TransferTrends; lang: Lang }) {
  const t = T[lang];
  const id = dossier.identity;
  const w = dossier.window;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO} style={s.logo} />
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>{t.dossier.toUpperCase()}</Text>
            <Text style={s.h1}>{id.name}</Text>
            <Text style={s.sub}>{[id.position, id.ageYears != null ? `${id.ageYears} ${lang === "IS" ? "ára" : "yrs"}` : null, `${w.start} - ${w.end}`, `${w.days}-${lang === "IS" ? "daga" : "day"} ${t.window}`].filter(Boolean).join(" · ")}</Text>
          </View>
          <Chip c={dossier.overallConfidence} lang={lang} />
        </View>
        <Text style={s.byline}>{t.prepared} · {w.sessions} {t.sessions} · {w.matches} {t.matches}</Text>

        <View style={s.idstrip}>
          <View style={s.idcell}><Text style={s.idlabel}>{t.pos}</Text><Text style={s.idval}>{id.position ?? "—"}</Text></View>
          <View style={s.idcell}><Text style={s.idlabel}>{t.age}</Text><Text style={s.idval}>{id.ageYears != null ? String(id.ageYears) : "—"}</Text></View>
          <View style={s.idcell}><Text style={s.idlabel}>{t.height}</Text><Text style={s.idval}>{id.heightCm != null ? `${Math.round(id.heightCm)} cm` : "—"}</Text></View>
          <View style={s.idcell}><Text style={s.idlabel}>{t.weight}</Text><Text style={s.idval}>{id.massKg != null ? `${Math.round(id.massKg)} kg` : "—"}</Text></View>
        </View>

        {ai ? (
          <View style={s.aibox} wrap={false}>
            <Text style={s.ailabel}>{t.ai} · {t.aiNote}</Text>
            {ai.headline ? <Text style={s.aihead}>{ai.headline}</Text> : null}
            {ai.summary ? <Text style={s.aitxt}>{ai.summary}</Text> : null}
            {ai.physicalProfile ? <Text style={s.aitxt}>{ai.physicalProfile}</Text> : null}
            {ai.gameProfile ? <Text style={s.aitxt}>{ai.gameProfile}</Text> : null}
            {ai.strengths?.length ? (
              <View style={{ marginTop: 4 }}>
                <Text style={[s.ailabel, { color: GREEN }]}>{t.strengths}</Text>
                {ai.strengths.map((x, i) => <View style={s.bullet} key={i}><Text style={s.bDot}>·</Text><Text style={{ flex: 1 }}>{x}</Text></View>)}
              </View>
            ) : null}
            {ai.watchPoints?.length ? (
              <View style={{ marginTop: 3 }}>
                <Text style={[s.ailabel, { color: AMBER }]}>{t.watch}</Text>
                {ai.watchPoints.map((x, i) => <View style={s.bullet} key={i}><Text style={s.bDot}>·</Text><Text style={{ flex: 1 }}>{x}</Text></View>)}
              </View>
            ) : null}
          </View>
        ) : null}

        {radar ? <RadarBlock radar={radar} lang={lang} /> : null}
        {trends ? <TrendBlock trends={trends} lang={lang} /> : null}

        {dossier.sections.map((sec) => <SectionBlock key={sec.id} sec={sec} lang={lang} clock={sec.id === "ima-clock" ? dossier.imaClock : null} />)}

        <Text style={s.foot}>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadTransferReportPdf(dossier: TransferDossier, ai: TransferAiSummary | null, radar: TransferRadar, trends: TransferTrends, lang: Lang) {
  const blob = await pdf(<TransferDoc dossier={dossier} ai={ai} radar={radar} trends={trends} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dossier.identity.name.replace(/\s+/g, "-")}-Breidablik-performance-dossier.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
