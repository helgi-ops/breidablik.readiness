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

import { Document, Page, StyleSheet, Text, View, Image, Svg, Polygon, Line, Circle, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";
export type KsiPdfRadarAxis = { key: string; labelIs: string; labelEn: string; unit: string; value: number; pct: number | null };
export type KsiPdfDay = {
  date: string; duration_min: number; total_distance: number; hsr: number; sprint: number;
  max_vel_kmh: number; accels: number; decels: number; player_load: number; ima_hsr: number;
};
export type KsiPdfPlayer = {
  full_name: string; sessions: number;
  agg: { total_distance: number; hsr: number; sprint: number; max_vel_kmh: number; accels: number; decels: number; player_load: number; ima_hsr: number };
  radar: KsiPdfRadarAxis[];
  days: KsiPdfDay[];
  injuryText: string;
  programText: string;
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
  noteBox: { borderWidth: 1, borderColor: LINE, backgroundColor: "#fafafa", borderRadius: 4, padding: 7 },
  noteTxt: { fontSize: 9.5, lineHeight: 1.45 },
  caption: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTE, letterSpacing: 0.4, marginBottom: 2 },
  trow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 1.6 },
  th: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: MUTE },
  td: { fontSize: 7.4 },
  radarWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  radarNote: { flex: 1, fontSize: 7.5, color: MUTE, lineHeight: 1.45 },
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

const T = {
  IS: {
    eyebrow: "KSÍ – ÁLAGS- OG STÖÐUSKÝRSLA", window: "tímabil", sessions: "lotur",
    keySess: "Lotur", keyDist: "Vegalengd", keyMax: "Hám.hraði", keyHsr: "Háhraði", keyPl: "Álag (PL)",
    injuries: "Meiðsli / þættir að vita af", program: "Einstaklings styrktar- / fyrirbyggjandi prógram",
    radar: "Atgervis-prófíll", radarNote: "Hver ás = percentíl leikmannsins innan liðsins á tímabilinu (0-100). Tala = uppsafnað gildi. Lýsandi.",
    summary: "Álags-yfirlit (uppsafnað)", daily: "Dagleg sundurliðun",
    date: "Dags.", min: "Mín", dist: "Vegal. (km)", hsr: "HSR (m)", sprint: "Sprettur (m)", maxv: "Hám (km/klst)",
    acc: "Acc", dec: "Dec", pl: "PL", ima: "IMA HSR (m)",
    foot: "MicroPulse - micropulse.is - Lysandi alags-skyrsla. Kerfid sendir ekkert ut; thjalfari yfirfer og sendir sjalfur.",
  },
  EN: {
    eyebrow: "KSÍ – LOAD & STATUS REPORT", window: "window", sessions: "sessions",
    keySess: "Sessions", keyDist: "Distance", keyMax: "Top speed", keyHsr: "High-speed", keyPl: "Load (PL)",
    injuries: "Injuries / factors to be aware of", program: "Individual strength / prevention programme",
    radar: "Athletic profile", radarNote: "Each axis = the player's percentile within the squad over the window (0-100). Number = accrued value. Descriptive.",
    summary: "Load summary (accrued)", daily: "Daily breakdown",
    date: "Date", min: "Min", dist: "Dist (km)", hsr: "HSR (m)", sprint: "Sprint (m)", maxv: "Top (km/h)",
    acc: "Acc", dec: "Dec", pl: "PL", ima: "IMA HSR (m)",
    foot: "MicroPulse - micropulse.is - Descriptive load report. The app transmits nothing; the coach reviews and sends it.",
  },
} as const;

function PlayerPage({ p, from, to, lang }: { p: KsiPdfPlayer; from: string; to: string; lang: Lang }) {
  const t = T[lang];
  const dailyCols = [t.date, t.min, t.dist, t.hsr, t.sprint, t.maxv, t.acc, t.dec, t.pl, t.ima];
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

      <View style={s.idstrip}>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keySess}</Text><Text style={s.idval}>{p.sessions}</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyDist}</Text><Text style={s.idval}>{km(p.agg.total_distance)} km</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyMax}</Text><Text style={s.idval}>{p.agg.max_vel_kmh || "-"}</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyHsr}</Text><Text style={s.idval}>{n0(p.agg.hsr)} m</Text></View>
        <View style={s.idcell}><Text style={s.idlabel}>{t.keyPl}</Text><Text style={s.idval}>{n0(p.agg.player_load)}</Text></View>
      </View>

      {p.radar.filter((a) => a.pct != null).length >= 3 ? (
        <View style={s.sec} wrap={false}>
          <Text style={s.h2}>{t.radar}</Text>
          <View style={s.radarWrap}>
            <RadarPdf axes={p.radar} lang={lang} />
            <Text style={s.radarNote}>{t.radarNote}</Text>
          </View>
        </View>
      ) : null}

      <View style={s.sec} wrap={false}>
        <Text style={s.h2}>{t.injuries}</Text>
        <View style={s.noteBox}><Text style={s.noteTxt}>{wa(p.injuryText) || "-"}</Text></View>
      </View>

      <View style={s.sec} wrap={false}>
        <Text style={s.h2}>{t.program}</Text>
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

export function KsiDoc({ players, from, to, lang }: { players: KsiPdfPlayer[]; from: string; to: string; lang: Lang }) {
  return <Document>{players.map((p, i) => <PlayerPage key={i} p={p} from={from} to={to} lang={lang} />)}</Document>;
}

export async function downloadKsiReportPdf(players: KsiPdfPlayer[], from: string, to: string, lang: Lang) {
  const blob = await pdf(<KsiDoc players={players} from={from} to={to} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `KSI-skyrsla-${players.length === 1 ? players[0].full_name.replace(/\s+/g, "-") : "lid"}-${to}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
