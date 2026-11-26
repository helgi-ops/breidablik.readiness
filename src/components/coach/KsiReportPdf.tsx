"use client";

/**
 * KsiReportPdf — the Breiðablik-branded KSÍ (federation call-up) dossier, ONE PAGE (block) PER
 * PLAYER, styled with the shared MicroPulse PDF kit (src/components/pdf/brand.tsx):
 * club masthead + key numbers → AI summary (labelled AI) → KSÍ's two explicit questions
 * (injuries/factors, individual strength/prevention programme) → athletic radar (squad
 * percentile) → per-session trends → peak demands → daily breakdown table (may flow onto a
 * second page; its header repeats).
 *
 * Coach text is sanitised of arrows / emoji / U+2212 so the Helvetica fallback never breaks.
 * Descriptive export — never a readiness colour or availability decision. The coach downloads
 * and emails it themselves; the app transmits nothing.
 */

import { Document, Text, View, Image, Svg, Polygon, Line, Circle, Rect } from "@react-pdf/renderer";
import { AiBox, BrandPage, Body, C, Card, Chip, Provenance, Section, StatGrid, Table, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";
export type KsiPdfRadarAxis = { key: string; labelIs: string; labelEn: string; unit: string; value: number; pct: number | null };
export type KsiPdfDay = {
  date: string; duration_min: number; total_distance: number; hsr: number; sprint: number;
  max_vel_kmh: number; accels: number; decels: number; player_load: number; ima_hsr: number;
};
export type KsiPdfPlayer = {
  full_name: string; sessions: number; matches?: number; matchMinutes?: number;
  agg: { total_distance: number; hsr: number; sprint: number; max_vel_kmh: number; accels: number; decels: number; player_load: number; ima_hsr: number };
  radar: KsiPdfRadarAxis[];
  days: KsiPdfDay[];
  injuryText: string;
  programText: string;
  aiHeadline?: string;
  aiSummary?: string;
  peakDemands?: Array<{ windowMin: number; distance: number | null; hsr: number | null }>;
};

const LOGO = "/breidablik-ubk-vector-logo.png";

/** Fallback-safe: Helvetica can't render arrows / emoji / minus-sign. */
const wa = (s: string): string =>
  (s ?? "")
    .replace(/→/g, " -> ")
    .replace(/−/g, "-")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/️/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const km = (m: number) => (m / 1000).toFixed(1);
const n0 = (v: number) => Math.round(v).toLocaleString("is-IS");

function RadarPdf({ axes, lang }: { axes: KsiPdfRadarAxis[]; lang: Lang }) {
  const usable = axes.filter((a) => a.pct != null);
  if (usable.length < 3) return null;
  const W = 320, H = 196, cx = W / 2, cy = H / 2, R = 62, N = usable.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, r: number) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r] as const;
  const poly = usable.map((a, i) => pt(i, R * ((a.pct ?? 0) / 100)).join(",")).join(" ");
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {[25, 50, 75, 100].map((ring) => (
        <Polygon key={ring} points={usable.map((_, i) => pt(i, R * (ring / 100)).join(",")).join(" ")} fill="none" stroke={C.rule} strokeWidth={ring === 100 ? 1 : 0.6} />
      ))}
      {usable.map((_, i) => { const [x, y] = pt(i, R); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.rule} strokeWidth={0.6} />; })}
      <Polygon points={poly} fill={C.cobalt} fillOpacity={0.18} stroke={C.cobalt} strokeWidth={1.4} />
      {usable.map((a, i) => { const [x, y] = pt(i, R * ((a.pct ?? 0) / 100)); return <Circle key={a.key} cx={x} cy={y} r={2} fill={C.cobalt} />; })}
      {usable.map((a, i) => {
        const [lx, ly] = pt(i, R + 12);
        const anchor = Math.abs(Math.cos(ang(i))) < 0.3 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end";
        return (
          <Text key={a.key} x={lx} y={ly} style={{ ...fb(400), fontSize: 6.25 }} fill={C.ink} textAnchor={anchor}>
            {`${lang === "IS" ? a.labelIs : a.labelEn} ${a.value}${a.unit && a.unit !== "n" ? a.unit : ""} (${a.pct}%)`}
          </Text>
        );
      })}
    </Svg>
  );
}

function TrendBars({ days, get, label, avgText, peakText }: { days: KsiPdfDay[]; get: (d: KsiPdfDay) => number; label: string; avgText: string; peakText: string }) {
  const vals = days.map(get);
  const max = Math.max(1, ...vals);
  const mean = vals.reduce((a, v) => a + v, 0) / Math.max(1, vals.length);
  const W = 232, PAD_T = 4, PAD_B = 3, H = 58, plot = H - PAD_T - PAD_B;
  const n = Math.max(1, days.length);
  const gap = n > 24 ? 1.4 : n > 12 ? 2.4 : 3.5;
  const bw = Math.max(1.5, (W - (n - 1) * gap) / n);
  const meanY = PAD_T + plot - (mean / max) * plot;
  return (
    <Card pad={8} style={{ width: "49%" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <Text style={[fb(600), { fontSize: 8.5 }]}>{label}</Text>
        <Text style={[fb(400), { fontSize: 7.25, color: C.mute }]}>{peakText}</Text>
      </View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={0} y1={meanY} x2={W} y2={meanY} stroke={C.ink} strokeOpacity={0.45} strokeWidth={0.6} strokeDasharray="3 3" />
        <Line x1={0} y1={PAD_T + plot} x2={W} y2={PAD_T + plot} stroke={C.ruleStrong} strokeWidth={0.8} />
        {days.map((d, i) => { const v = get(d); const bh = v > 0 ? Math.max(1.5, (v / max) * plot) : 0; return <Rect key={i} x={i * (bw + gap)} y={PAD_T + plot - bh} width={bw} height={bh} fill={C.cobalt} fillOpacity={0.85} />; })}
      </Svg>
      <Text style={[fb(400), { fontSize: 7.25, color: C.mute, marginTop: 3 }]}>{avgText}</Text>
    </Card>
  );
}

const T = {
  IS: {
    doc: "KSÍ-skýrsla", eyebrow: "KSÍ – ÁLAGS- OG STÖÐUSKÝRSLA", window: "tímabil", sessions: "lotur",
    prepared: "Unnið af", club: "Breiðablik", generated: "útbúið",
    keySess: "Lotur", keyDist: "Vegalengd", keyMax: "Hám.hraði", keyHsr: "Háhraði", keyPl: "Álag (PL)",
    keyMatches: "Leikir", keyMinutes: "Mínútur",
    trends: "Þróun per lotu", trendsHint: "Hver súla = ein lota. Brotalína = meðaltal tímabilsins.", avg: "meðaltal", peakw: "hæst",
    peak: "Verstu leik-kröfur (peak period)", peakWin: "Gluggi", peakDist: "Vegal. (m/mín)", peakHsr: "HSR (m/mín)",
    peakNote: "Hámarks per-mínútu ákefð í hörðustu rúllandi gluggum leiksins (Catapult MII). m/mín lækkar eðlilega með lengd gluggans.",
    srcPeak: "Heimild: Catapult MII peak-gluggar.",
    srcLoad: "Heimild: Catapult GPS + IMA (álag safnað hjá félagi).", srcRadar: "Heimild: GPS/IMA gögn tímabilsins.",
    srcInjury: "Heimild: skráð af þjálfara/sjúkraþjálfara.", srcProgram: "Heimild: þjálfari + hreyfiskimun/RTP.",
    injuries: "Meiðsli / þættir að vita af", program: "Einstaklings styrktar- / fyrirbyggjandi prógram",
    ai: "AI-SAMANTEKT · ÚR TÖLUM LEIKMANNSINS", radar: "Atgervis-prófíll", radarNote: "Hver ás = percentíl leikmannsins innan liðsins á tímabilinu (0-100). Tala = uppsafnað gildi. Lýsandi.",
    aiNote: "Byggt af AI úr álagstölum leikmannsins - reglur velja tölurnar, AI orðar. Yfirfarið af þjálfara.",
    summary: "Álags-yfirlit (uppsafnað)", daily: "Dagleg sundurliðun",
    date: "Dags.", min: "Mín", dist: "Vegal. (km)", hsr: "HSR (m)", sprint: "Sprettur (m)", maxv: "Hám (km/klst)",
    acc: "Acc", dec: "Dec", pl: "PL", ima: "Long runs ≥18 s (m)",
    foot: "MicroPulse - micropulse.is - Lýsandi álags-skýrsla. Kerfið sendir ekkert út; þjálfari yfirfer og sendir sjálfur.",
  },
  EN: {
    doc: "KSÍ report", eyebrow: "KSÍ – LOAD & STATUS REPORT", window: "window", sessions: "sessions",
    prepared: "Prepared by", club: "Breiðablik", generated: "generated",
    keySess: "Sessions", keyDist: "Distance", keyMax: "Top speed", keyHsr: "High-speed", keyPl: "Load (PL)",
    keyMatches: "Matches", keyMinutes: "Minutes",
    trends: "Per-session trend", trendsHint: "Each bar = one session. Dashed line = the window average.", avg: "avg", peakw: "peak",
    peak: "Worst-case demands (peak period)", peakWin: "Window", peakDist: "Dist (m/min)", peakHsr: "HSR (m/min)",
    peakNote: "Peak per-minute intensity in the match's hardest rolling windows (Catapult MII). m/min naturally falls as the window lengthens.",
    srcPeak: "Source: Catapult MII peak windows.",
    srcLoad: "Source: Catapult GPS + IMA (load accrued at the club).", srcRadar: "Source: GPS/IMA data over the window.",
    srcInjury: "Source: recorded by the coach / physio.", srcProgram: "Source: coach + movement screen / RTP.",
    injuries: "Injuries / factors to be aware of", program: "Individual strength / prevention programme",
    ai: "AI SUMMARY - FROM THE PLAYER'S NUMBERS", aiNote: "AI-generated from the player's load numbers - rules pick the numbers, AI phrases. Reviewed by the coach.",
    radar: "Athletic profile", radarNote: "Each axis = the player's percentile within the squad over the window (0-100). Number = accrued value. Descriptive.",
    summary: "Load summary (accrued)", daily: "Daily breakdown",
    date: "Date", min: "Min", dist: "Dist (km)", hsr: "HSR (m)", sprint: "Sprint (m)", maxv: "Top (km/h)",
    acc: "Acc", dec: "Dec", pl: "PL", ima: "Long runs ≥18 s (m)",
    foot: "MicroPulse - micropulse.is - Descriptive load report. The app transmits nothing; the coach reviews and sends it.",
  },
} as const;

/** Club masthead: Breiðablik crest + the kit's masthead typography (the kit Masthead has no logo slot). */
function ClubMasthead({ kicker, title, subtitle, byline, chips }: { kicker: string; title: string; subtitle: string; byline: string; chips: string[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: C.rule }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={LOGO} style={{ width: 44, height: 45 }} />
      <View style={{ flex: 1 }}>
        <Text style={[fb(600), { fontSize: 8, letterSpacing: 1.1, color: C.cobalt, marginBottom: 4 }]}>{clean(kicker).toUpperCase()}</Text>
        <Text style={[fh(800), { fontSize: title.length > 26 ? 22 : 28, lineHeight: 1.05, letterSpacing: -0.6 }]}>{clean(title)}</Text>
        <Text style={[fb(400), { fontSize: 9.5, color: C.mute, marginTop: 4 }]}>{clean(subtitle)}</Text>
        <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 2 }]}>{clean(byline)}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 160, alignSelf: "flex-end" }}>
        {chips.map((c, i) => <Chip key={i} text={c} />)}
      </View>
    </View>
  );
}

function NoteCard({ title, src, text }: { title: string; src: string; text: string }) {
  return (
    <Card style={{ flex: 1 }} wrap={false}>
      <Text style={[fh(700), { fontSize: 11.5 }]}>{title}</Text>
      <Text style={[fb(400), { fontSize: 7.5, color: C.mute, marginTop: 1, marginBottom: 5 }]}>{src}</Text>
      <Body size={9.25}>{wa(text) || "-"}</Body>
    </Card>
  );
}

function PlayerPage({ p, from, to, lang, preparedBy, generated }: { p: KsiPdfPlayer; from: string; to: string; lang: Lang; preparedBy: string | null; generated: string }) {
  const t = T[lang];
  const avg = (get: (d: KsiPdfDay) => number) => (p.days.length ? p.days.reduce((a, d) => a + get(d), 0) / p.days.length : 0);
  const peak = (get: (d: KsiPdfDay) => number) => (p.days.length ? Math.max(0, ...p.days.map(get)) : 0);
  const r = (label: string, flex = 1) => ({ label, flex, align: "right" as const });
  return (
    <BrandPage doc={t.doc} context={`${p.full_name} · ${t.club}`} note={t.foot}>
      <ClubMasthead
        kicker={t.eyebrow}
        title={p.full_name}
        subtitle={`${from} - ${to}  ·  ${p.sessions} ${t.sessions}`}
        byline={`${t.prepared} ${preparedBy ?? t.club} · ${t.club} · ${t.generated} ${generated}`}
        chips={[t.club, "KSÍ"]}
      />

      <View style={{ marginBottom: 10 }}>
        <StatGrid
          cols={7}
          items={[
            { label: t.keySess, value: String(p.sessions) },
            { label: t.keyMatches, value: String(p.matches ?? 0) },
            { label: t.keyMinutes, value: String(p.matchMinutes ?? 0) },
            { label: t.keyDist, value: km(p.agg.total_distance), sub: "km" },
            { label: t.keyMax, value: p.agg.max_vel_kmh ? String(p.agg.max_vel_kmh) : "-", sub: p.agg.max_vel_kmh ? "km/h" : undefined },
            { label: t.keyHsr, value: n0(p.agg.hsr), sub: "m" },
            { label: t.keyPl, value: n0(p.agg.player_load) },
          ]}
        />
      </View>

      {(p.aiHeadline || p.aiSummary) ? (
        <View wrap={false}>
          <AiBox label={t.ai} headline={p.aiHeadline ? wa(p.aiHeadline) : undefined} body={p.aiSummary ? wa(p.aiSummary) : undefined} cites={t.aiNote} />
        </View>
      ) : null}

      {/* KSÍ's two explicit questions — injuries/factors + individual programme — lead the report. */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }} wrap={false}>
        <NoteCard title={t.injuries} src={t.srcInjury} text={p.injuryText} />
        <NoteCard title={t.program} src={t.srcProgram} text={p.programText} />
      </View>

      {p.radar.filter((a) => a.pct != null).length >= 3 ? (
        <Section title={t.radar} hint={t.srcRadar} wrap={false}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <RadarPdf axes={p.radar} lang={lang} />
              <Text style={[fb(400), { flex: 1, fontSize: 8.25, color: C.mute, lineHeight: 1.45 }]}>{t.radarNote}</Text>
            </View>
          </Card>
        </Section>
      ) : null}

      {p.days.length >= 2 ? (
        <Section title={t.trends} hint={`${t.trendsHint} ${t.srcLoad}`} wrap={false}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "space-between" }}>
            <TrendBars days={p.days} get={(d) => d.total_distance} label={t.dist} avgText={`${t.avg} ${km(avg((d) => d.total_distance))} km`} peakText={`${t.peakw} ${km(peak((d) => d.total_distance))} km`} />
            <TrendBars days={p.days} get={(d) => d.hsr} label={t.hsr} avgText={`${t.avg} ${n0(avg((d) => d.hsr))} m`} peakText={`${t.peakw} ${n0(peak((d) => d.hsr))} m`} />
            <TrendBars days={p.days} get={(d) => d.max_vel_kmh} label={t.maxv} avgText={`${t.avg} ${(avg((d) => d.max_vel_kmh)).toFixed(1)}`} peakText={`${t.peakw} ${(peak((d) => d.max_vel_kmh)).toFixed(1)}`} />
            <TrendBars days={p.days} get={(d) => d.player_load} label={t.pl} avgText={`${t.avg} ${n0(avg((d) => d.player_load))}`} peakText={`${t.peakw} ${n0(peak((d) => d.player_load))}`} />
          </View>
        </Section>
      ) : null}

      {p.peakDemands && p.peakDemands.length ? (
        <Section title={t.peak} hint={t.srcPeak} wrap={false}>
          <Table
            cols={[{ label: t.peakWin, flex: 1 }, r(t.peakDist), r(t.peakHsr)]}
            rows={p.peakDemands.map((d) => [`${d.windowMin} ${lang === "IS" ? "mín" : "min"}`, d.distance != null ? String(Math.round(d.distance)) : "-", d.hsr != null ? String(Math.round(d.hsr)) : "-"])}
            dense
          />
          <Provenance>{t.peakNote}</Provenance>
        </Section>
      ) : null}

      <Section title={t.daily} hint={`${t.summary}: ${p.sessions} ${t.sessions.toLowerCase()} · ${km(p.agg.total_distance)} km · HSR ${n0(p.agg.hsr)} m · IMA ${n0(p.agg.ima_hsr)} m · PL ${n0(p.agg.player_load)}`}>
        <Table
          size={7.75}
          dense
          cols={[{ label: t.date, flex: 1.6 }, r(t.min), r(t.dist), r(t.hsr), r(t.sprint), r(t.maxv, 1.2), r(t.acc), r(t.dec), r(t.pl), r(t.ima, 1.2)]}
          rows={p.days.map((d) => [
            d.date,
            d.duration_min ? String(d.duration_min) : "-",
            km(d.total_distance),
            n0(d.hsr),
            n0(d.sprint),
            d.max_vel_kmh ? String(d.max_vel_kmh) : "-",
            String(d.accels),
            String(d.decels),
            n0(d.player_load),
            d.ima_hsr > 0 ? n0(d.ima_hsr) : "-",
          ])}
        />
      </Section>
    </BrandPage>
  );
}

export function KsiDoc({ players, from, to, lang, preparedBy }: { players: KsiPdfPlayer[]; from: string; to: string; lang: Lang; preparedBy: string | null }) {
  const generated = new Date().toISOString().slice(0, 10);
  return <Document>{players.map((p, i) => <PlayerPage key={i} p={p} from={from} to={to} lang={lang} preparedBy={preparedBy} generated={generated} />)}</Document>;
}

export async function downloadKsiReportPdf(players: KsiPdfPlayer[], from: string, to: string, lang: Lang, preparedBy: string | null = null) {
  const blob = await renderPdfBlob(() => <KsiDoc players={players} from={from} to={to} lang={lang} preparedBy={preparedBy} />);
  saveBlob(blob, `KSI-skyrsla-${players.length === 1 ? players[0].full_name.replace(/\s+/g, "-") : "lid"}-${to}.pdf`);
}
