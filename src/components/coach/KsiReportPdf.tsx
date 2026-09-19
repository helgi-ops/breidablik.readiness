"use client";

/**
 * KsiReportPdf — the Breiðablik-branded KSÍ (federation call-up) dossier, ONE PAGE PER
 * PLAYER: header + key numbers, an athletic radar (squad percentile), the coach-curated
 * injuries/factors and individual strength/prevention programme, then the club load summary
 * and the daily breakdown. Mirrors the transfer dossier's look.
 *
 * WinAnsi/Helvetica (Icelandic-safe): sanitise arrows / emoji / U+2212 out of coach text.
 * Descriptive export — never a readiness colour or availability decision. The coach downloads
 * and emails it themselves; the app transmits nothing.
 */

import { Document, Page, StyleSheet, Text, View, Image, Svg, Polygon, Line, Circle, Rect, pdf } from "@react-pdf/renderer";

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

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";
const LOGO = "/breidablik-ubk-vector-logo.png";

/** WinAnsi-safe: Helvetica can't render arrows / emoji / minus-sign. */
const wa = (s: string): string =>
  (s ?? "")
    .replace(/→/g, " -> ")
    .replace(/−/g, "-")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/️/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const s = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 34, paddingHorizontal: 30, fontSize: 9, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  logo: { width: 44, height: 45 },
  eyebrow: { fontSize: 7.5, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold", lineHeight: 1.15, marginTop: 1 },
  sub: { fontSize: 9, color: MUTE, marginTop: 2 },
  idstrip: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, marginTop: 8, marginBottom: 9 },
  idcell: { marginRight: 16, marginBottom: 2 },
  idlabel: { fontSize: 6.5, color: MUTE, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  idval: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 1 },
  sec: { marginBottom: 9 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  aibox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  ailabel: { fontSize: 7.5, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 3 },
  aihead: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  aitxt: { fontSize: 9, color: "#333", marginTop: 3, lineHeight: 1.45 },
  noteBox: { borderWidth: 1, borderColor: LINE, backgroundColor: "#fafafa", borderRadius: 4, padding: 7 },
  noteTxt: { fontSize: 9.5, lineHeight: 1.45 },
  caption: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTE, letterSpacing: 0.4, marginBottom: 2 },
  trow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 1.6 },
  th: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: MUTE },
  td: { fontSize: 7.4 },
  radarWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  radarNote: { flex: 1, fontSize: 7.5, color: MUTE, lineHeight: 1.45 },
  byline: { fontSize: 8, color: MUTE, marginTop: 5, marginBottom: 2 },
  src: { fontSize: 6.8, color: MUTE, marginBottom: 3 },
  trendRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  trendCell: { width: 118 },
  trendLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: INK },
  trendAvg: { fontSize: 6.5, color: MUTE, marginTop: 1 },
  foot: { position: "absolute", bottom: 16, left: 30, right: 30, fontSize: 7, color: MUTE, textAlign: "center", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5 },
});

const km = (m: number) => (m / 1000).toFixed(1);
const n0 = (v: number) => Math.round(v).toLocaleString("is-IS");

function RadarPdf({ axes, lang }: { axes: KsiPdfRadarAxis[]; lang: Lang }) {
  const usable = axes.filter((a) => a.pct != null);
  if (usable.length < 3) return null;
  const W = 220, H = 200, cx = W / 2, cy = H / 2, R = 62, N = usable.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, r: number) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r] as const;
  const poly = usable.map((a, i) => pt(i, R * ((a.pct ?? 0) / 100)).join(",")).join(" ");
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {[25, 50, 75, 100].map((ring) => (
        <Polygon key={ring} points={usable.map((_, i) => pt(i, R * (ring / 100)).join(",")).join(" ")} fill="none" stroke={LINE} strokeWidth={ring === 100 ? 1 : 0.6} />
      ))}
      {usable.map((_, i) => { const [x, y] = pt(i, R); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={LINE} strokeWidth={0.6} />; })}
      <Polygon points={poly} fill={COBALT} fillOpacity={0.18} stroke={COBALT} strokeWidth={1.4} />
      {usable.map((a, i) => { const [x, y] = pt(i, R * ((a.pct ?? 0) / 100)); return <Circle key={a.key} cx={x} cy={y} r={2} fill={COBALT} />; })}
      {usable.map((a, i) => {
        const [lx, ly] = pt(i, R + 12);
        const anchor = Math.abs(Math.cos(ang(i))) < 0.3 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end";
        return (
          <Text key={a.key} x={lx} y={ly} style={{ fontSize: 6 }} fill={INK} textAnchor={anchor}>
            {`${lang === "IS" ? a.labelIs : a.labelEn} ${a.value}${a.unit && a.unit !== "n" ? a.unit : ""} (${a.pct}%)`}
          </Text>
        );
      })}
    </Svg>
  );
}

function TrendBars({ days, get, label, avgText }: { days: KsiPdfDay[]; get: (d: KsiPdfDay) => number; label: string; avgText: string }) {
  const vals = days.map(get);
  const max = Math.max(1, ...vals);
  const W = 118, H = 38, n = Math.max(1, days.length), gap = n > 30 ? 0.8 : 1.5, bw = Math.max(1, (W - (n - 1) * gap) / n);
  return (
    <View style={s.trendCell}>
      <Text style={s.trendLabel}>{label}</Text>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke={LINE} strokeWidth={0.5} />
        {days.map((d, i) => { const v = get(d); const bh = v > 0 ? Math.max(1, (v / max) * (H - 4)) : 0; return <Rect key={i} x={i * (bw + gap)} y={H - bh} width={bw} height={bh} fill={COBALT} fillOpacity={0.75} />; })}
      </Svg>
      <Text style={s.trendAvg}>{avgText}</Text>
    </View>
  );
}

const T = {
  IS: {
    eyebrow: "KSÍ – ÁLAGS- OG STÖÐUSKÝRSLA", window: "tímabil", sessions: "lotur",
    prepared: "Unnið af", club: "Breiðablik", generated: "útbúið",
    keySess: "Lotur", keyDist: "Vegalengd", keyMax: "Hám.hraði", keyHsr: "Háhraði", keyPl: "Álag (PL)",
    keyMatches: "Leikir", keyMinutes: "Mínútur",
    trends: "Þróun per lotu", avg: "meðaltal",
    peak: "Verstu leik-kröfur (peak period)", peakWin: "Gluggi", peakDist: "Vegal. (m/mín)", peakHsr: "HSR (m/mín)",
    peakNote: "Hámarks per-mínútu ákefð í hörðustu rúllandi gluggum leiksins (Catapult MII). m/mín lækkar eðlilega með lengd gluggans.",
    srcPeak: "Heimild: Catapult MII peak-gluggar.",
    srcLoad: "Heimild: Catapult GPS + IMA (álag safnað hjá félagi).", srcRadar: "Heimild: GPS/IMA gögn tímabilsins.",
    srcInjury: "Heimild: skráð af þjálfara/sjúkraþjálfara.", srcProgram: "Heimild: þjálfari + hreyfiskimun/RTP.",
    injuries: "Meiðsli / þættir að vita af", program: "Einstaklings styrktar- / fyrirbyggjandi prógram",
    ai: "AI-SAMANTEKT · ÚR TÖLUM LEIKMANNSINS", radar: "Atgervis-prófíll", radarNote: "Hver ás = percentíl leikmannsins innan liðsins á tímabilinu (0-100). Tala = uppsafnað gildi. Lýsandi.",
    aiNote: "Byggt af AI ur alagstolum leikmannsins - reglur velja tolurnar, AI ordar. Yfirfarid af thjalfara.",
    summary: "Álags-yfirlit (uppsafnað)", daily: "Dagleg sundurliðun",
    date: "Dags.", min: "Mín", dist: "Vegal. (km)", hsr: "HSR (m)", sprint: "Sprettur (m)", maxv: "Hám (km/klst)",
    acc: "Acc", dec: "Dec", pl: "PL", ima: "IMA HSR (m)",
    foot: "MicroPulse - micropulse.is - Lysandi alags-skyrsla. Kerfid sendir ekkert ut; thjalfari yfirfer og sendir sjalfur.",
  },
  EN: {
    eyebrow: "KSÍ – LOAD & STATUS REPORT", window: "window", sessions: "sessions",
    prepared: "Prepared by", club: "Breiðablik", generated: "generated",
    keySess: "Sessions", keyDist: "Distance", keyMax: "Top speed", keyHsr: "High-speed", keyPl: "Load (PL)",
    keyMatches: "Matches", keyMinutes: "Minutes",
    trends: "Per-session trend", avg: "avg",
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
    acc: "Acc", dec: "Dec", pl: "PL", ima: "IMA HSR (m)",
    foot: "MicroPulse - micropulse.is - Descriptive load report. The app transmits nothing; the coach reviews and sends it.",
  },
} as const;

function PlayerPage({ p, from, to, lang, preparedBy, generated }: { p: KsiPdfPlayer; from: string; to: string; lang: Lang; preparedBy: string | null; generated: string }) {
  const t = T[lang];
  const dailyCols = [t.date, t.min, t.dist, t.hsr, t.sprint, t.maxv, t.acc, t.dec, t.pl, t.ima];
  const avg = (get: (d: KsiPdfDay) => number) => (p.days.length ? p.days.reduce((a, d) => a + get(d), 0) / p.days.length : 0);
  return (
    <Page size="A4" style={s.page}>
      <View style={s.head}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={LOGO} style={s.logo} />
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>{t.eyebrow}</Text>
          <Text style={s.h1}>{p.full_name}</Text>
          <Text style={s.sub}>{`${from} - ${to}  ·  ${p.sessions} ${t.sessions}`}</Text>
        </View>
      </View>
      <Text style={s.byline}>{`${t.prepared} ${preparedBy ?? t.club} · ${t.club} · ${t.generated} ${generated}`}</Text>

      <View style={s.idstrip}>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keySess}</Text><Text style={s.idval}>{p.sessions}</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyMatches}</Text><Text style={s.idval}>{p.matches ?? 0}</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyMinutes}</Text><Text style={s.idval}>{p.matchMinutes ?? 0}</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyDist}</Text><Text style={s.idval}>{km(p.agg.total_distance)} km</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyMax}</Text><Text style={s.idval}>{p.agg.max_vel_kmh || "-"}</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyHsr}</Text><Text style={s.idval}>{n0(p.agg.hsr)} m</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyPl}</Text><Text style={s.idval}>{n0(p.agg.player_load)}</Text></View>
      </View>

      {(p.aiHeadline || p.aiSummary) ? (
        <View style={s.aibox} wrap={false}>
          <Text style={s.ailabel}>{t.ai}</Text>
          {p.aiHeadline ? <Text style={s.aihead}>{wa(p.aiHeadline)}</Text> : null}
          {p.aiSummary ? <Text style={s.aitxt}>{wa(p.aiSummary)}</Text> : null}
          <Text style={[s.aitxt, { fontSize: 7, color: MUTE }]}>{t.aiNote}</Text>
        </View>
      ) : null}

      {p.radar.filter((a) => a.pct != null).length >= 3 ? (
        <View style={s.sec} wrap={false}>
          <Text style={s.h2}>{t.radar}</Text>
          <Text style={s.src}>{t.srcRadar}</Text>
          <View style={s.radarWrap}>
            <RadarPdf axes={p.radar} lang={lang} />
            <Text style={s.radarNote}>{t.radarNote}</Text>
          </View>
        </View>
      ) : null}

      {p.days.length >= 2 ? (
        <View style={s.sec} wrap={false}>
          <Text style={s.h2}>{t.trends}</Text>
          <Text style={s.src}>{t.srcLoad}</Text>
          <View style={s.trendRow}>
            <TrendBars days={p.days} get={(d) => d.total_distance} label={t.dist} avgText={`${t.avg} ${km(avg((d) => d.total_distance))} km`} />
            <TrendBars days={p.days} get={(d) => d.hsr} label={t.hsr} avgText={`${t.avg} ${n0(avg((d) => d.hsr))} m`} />
            <TrendBars days={p.days} get={(d) => d.max_vel_kmh} label={t.maxv} avgText={`${t.avg} ${(avg((d) => d.max_vel_kmh)).toFixed(1)}`} />
            <TrendBars days={p.days} get={(d) => d.player_load} label={t.pl} avgText={`${t.avg} ${n0(avg((d) => d.player_load))}`} />
          </View>
        </View>
      ) : null}

      {p.peakDemands && p.peakDemands.length ? (
        <View style={s.sec} wrap={false}>
          <Text style={s.h2}>{t.peak}</Text>
          <Text style={s.src}>{t.srcPeak}</Text>
          <View style={s.trow}>
            <Text style={[s.th, { flex: 1 }]}>{t.peakWin}</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>{t.peakDist}</Text>
            <Text style={[s.th, { flex: 1, textAlign: "right" }]}>{t.peakHsr}</Text>
          </View>
          {p.peakDemands.map((d, i) => (
            <View style={s.trow} key={i}>
              <Text style={[s.td, { flex: 1 }]}>{d.windowMin} {lang === "IS" ? "mín" : "min"}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.distance != null ? Math.round(d.distance) : "-"}</Text>
              <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.hsr != null ? Math.round(d.hsr) : "-"}</Text>
            </View>
          ))}
          <Text style={[s.trendAvg, { marginTop: 2 }]}>{t.peakNote}</Text>
        </View>
      ) : null}

      <View style={s.sec} wrap={false}>
        <Text style={s.h2}>{t.injuries}</Text>
        <Text style={s.src}>{t.srcInjury}</Text>
        <View style={s.noteBox}><Text style={s.noteTxt}>{wa(p.injuryText) || "-"}</Text></View>
      </View>

      <View style={s.sec} wrap={false}>
        <Text style={s.h2}>{t.program}</Text>
        <Text style={s.src}>{t.srcProgram}</Text>
        <View style={s.noteBox}><Text style={s.noteTxt}>{wa(p.programText) || "-"}</Text></View>
      </View>

      <View style={s.sec}>
        <Text style={s.h2}>{t.daily}</Text>
        <Text style={s.caption}>{t.summary}: {p.sessions} {t.sessions.toLowerCase()} · {km(p.agg.total_distance)} km · HSR {n0(p.agg.hsr)} m · IMA {n0(p.agg.ima_hsr)} m · PL {n0(p.agg.player_load)}</Text>
        <View style={s.trow}>
          {dailyCols.map((c, i) => (
            <Text key={i} style={[s.th, { flex: i === 0 ? 1.6 : 1, textAlign: i === 0 ? "left" : "right" }]}>{c}</Text>
          ))}
        </View>
        {p.days.map((d, ri) => (
          <View style={s.trow} key={ri}>
            <Text style={[s.td, { flex: 1.6 }]}>{d.date}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.duration_min || "-"}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{km(d.total_distance)}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{n0(d.hsr)}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{n0(d.sprint)}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.max_vel_kmh || "-"}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.accels}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.decels}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{n0(d.player_load)}</Text>
            <Text style={[s.td, { flex: 1, textAlign: "right" }]}>{d.ima_hsr > 0 ? n0(d.ima_hsr) : "-"}</Text>
          </View>
        ))}
      </View>

      <Text style={s.foot} fixed>{t.foot}</Text>
    </Page>
  );
}

export function KsiDoc({ players, from, to, lang, preparedBy }: { players: KsiPdfPlayer[]; from: string; to: string; lang: Lang; preparedBy: string | null }) {
  const generated = new Date().toISOString().slice(0, 10);
  return <Document>{players.map((p, i) => <PlayerPage key={i} p={p} from={from} to={to} lang={lang} preparedBy={preparedBy} generated={generated} />)}</Document>;
}

export async function downloadKsiReportPdf(players: KsiPdfPlayer[], from: string, to: string, lang: Lang, preparedBy: string | null = null) {
  const blob = await pdf(<KsiDoc players={players} from={from} to={to} lang={lang} preparedBy={preparedBy} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `KSI-skyrsla-${players.length === 1 ? players[0].full_name.replace(/\s+/g, "-") : "lid"}-${to}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
