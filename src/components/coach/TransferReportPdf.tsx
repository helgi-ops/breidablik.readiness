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

import { Document, Page, StyleSheet, Text, View, Image, pdf } from "@react-pdf/renderer";
import type { TransferDossier, DossierSection, Confidence } from "@/lib/micropulse/transferReport";
import type { TransferAiSummary } from "@/lib/micropulse/transferReport/ai";

type Lang = "EN" | "IS";

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";
const GREEN = "#1c7a4a", AMBER = "#de9328";
const LOGO = "/breidablik-ubk-vector-logo.png";

const s = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 34, paddingHorizontal: 32, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  logo: { width: 46, height: 47 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9.5, color: MUTE, marginTop: 1 },
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

function SectionBlock({ sec, lang }: { sec: DossierSection; lang: Lang }) {
  return (
    <View style={s.sec} wrap={false}>
      <View style={s.secHead}>
        <Text style={s.h2}>{lang === "IS" ? sec.title.is : sec.title.en}</Text>
        <Chip c={sec.confidence} lang={lang} />
      </View>
      {sec.headline ? <Text style={s.headline}>{lang === "IS" ? sec.headline.is : sec.headline.en}</Text> : null}
      {sec.facts.map((f, i) => (
        <View style={s.bullet} key={i}><Text style={s.bDot}>·</Text><Text style={{ flex: 1 }}>{lang === "IS" ? f.is : f.en}</Text></View>
      ))}
      {sec.table && sec.table.rows.length ? (
        <View style={{ marginTop: 3 }}>
          <View style={s.trow}>
            {sec.table.columns.map((c, i) => (
              <Text key={i} style={[s.th, { flex: i === 0 ? 2 : 1, textAlign: i === 0 ? "left" : "right" }]}>{lang === "IS" ? c.is : c.en}</Text>
            ))}
          </View>
          {sec.table.rows.map((row, ri) => (
            <View style={s.trow} key={ri}>
              {row.map((cell, ci) => (
                <Text key={ci} style={[s.td, { flex: ci === 0 ? 2 : 1, textAlign: ci === 0 ? "left" : "right" }]}>{cell}</Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TransferDoc({ dossier, ai, lang }: { dossier: TransferDossier; ai: TransferAiSummary | null; lang: Lang }) {
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
            <Text style={s.h1}>{id.name} — {t.dossier}</Text>
            <Text style={s.sub}>{[id.position, id.ageYears != null ? `${id.ageYears} ${lang === "IS" ? "ára" : "yrs"}` : null].filter(Boolean).join(" · ")} · {w.start} → {w.end} ({w.days}-{lang === "IS" ? "daga" : "day"} {t.window})</Text>
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

        {dossier.sections.map((sec) => <SectionBlock key={sec.id} sec={sec} lang={lang} />)}

        <Text style={s.foot}>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadTransferReportPdf(dossier: TransferDossier, ai: TransferAiSummary | null, lang: Lang) {
  const blob = await pdf(<TransferDoc dossier={dossier} ai={ai} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dossier.identity.name.replace(/\s+/g, "-")}-Breidablik-performance-dossier.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
