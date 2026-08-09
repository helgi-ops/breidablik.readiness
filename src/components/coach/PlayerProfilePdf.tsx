"use client";

/**
 * PlayerProfilePdf — the written Total Player Analysis profile as a coach-facing PDF,
 * modelled on the hand-made Player-profile article.
 *
 * Layered read: header → PROFILE verdict box → the written read (footballer / athlete /
 * cross / role & fit) → footballer strengths & limitations → athlete qualities table →
 * "how to improve the weak areas" → footer. Presentation-only: every number is
 * rule-computed upstream and the prose is AI-phrased + labelled; the caller passes
 * already-localised strings. PERFORMANCE ONLY — never the readiness colour or a medical
 * read. WinAnsi/Helvetica (Icelandic-safe): no arrows / ticks / U+2212.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type Lang = "EN" | "IS";

export type PlayerProfilePdfPayload = {
  playerName: string;
  position: string | null;
  minutes: number | null;
  headline: string | null;
  aiGenerated: boolean;
  narrative: { profile?: string; footballerRead?: string; athleteRead?: string; crossRead?: string; roleFit?: string } | null;
  footballer: {
    role: string | null;
    strengths: Array<{ label: string; percentile: number | null }>;
    weaknesses: Array<{ label: string; percentile: number | null }>;
  } | null;
  athlete: {
    qualities: Array<{ label: string; value: string; unit: string; percentile: number | null; verdict: string; source: string | null; date: string | null }>;
  } | null;
  crossLinks: Array<{ text: string; evidence: string }>;
  development: Array<{ label: string; percentile: number | null; lever: string; cite?: string }>;
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6", GREEN = "#1c7a4a", AMBER = "#a86a12";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2 },
  byline: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 2 },
  vtxt: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 3 },
  para: { fontSize: 9.5, color: "#222", marginBottom: 2 },
  colWrap: { flexDirection: "row", marginTop: 4 },
  col: { flex: 1, paddingRight: 8 },
  colLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 2 },
  bullet: { fontSize: 9, color: "#333", marginBottom: 1.5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  cQ: { flex: 1, color: "#333" },
  cVal: { width: 96, textAlign: "right", color: "#333" },
  cPct: { width: 42, textAlign: "right", fontFamily: "Helvetica-Bold" },
  cRead: { width: 66, textAlign: "right", color: MUTE },
  imp: { fontSize: 9, color: "#222", marginBottom: 3 },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const L = {
  EN: { kicker: "PLAYER PROFILE", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers — cites the data, decides nothing",
    profile: "PROFILE", footballer: "As a footballer", athlete: "As an athlete", cross: "Reading across the two",
    roleFit: "Role & fit", strengths: "STRENGTHS", limitations: "LIMITATIONS",
    qualities: "Athlete qualities", quality: "Quality", value: "Value", pctl: "%ile", read: "Read",
    improve: "How to improve the weak areas", within: "percentiles within squad / position",
    verdicts: { strength: "strength", weakness: "weak", neutral: "on par", no_data: "—" } as Record<string, string>,
    method: "Two separate reads — as a footballer and as an athlete — never blended into one score. Percentiles rank the player within his own squad / position group and describe what the data shows; they do not predict. PERFORMANCE ONLY: nothing here is the readiness colour, load decision, or a medical/injury judgement — asymmetry is a robustness quality, and the medical read stays in the RTP module.",
    signals: "Signals: StatsBomb/Wyscout per-90 (footballer) + GPS / VALD force plates / VBT (athlete). Rules compute the percentiles and the development levers; any prose is AI-phrased and coach-overridable." },
  IS: { kicker: "LEIKMANNAPRÓFÍLL", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum — vitnar í gögnin, ákveður ekkert",
    profile: "PRÓFÍLL", footballer: "Sem fótboltamaður", athlete: "Sem íþróttamaður", cross: "Lesið þvert á ásana",
    roleFit: "Hlutverk og notkun", strengths: "STYRKLEIKAR", limitations: "TAKMARKANIR",
    qualities: "Íþrótta-eiginleikar", quality: "Eiginleiki", value: "Gildi", pctl: "pctl", read: "Lestur",
    improve: "Hvernig má bæta veiku svæðin", within: "percentíl innan liðs / stöðu",
    verdicts: { strength: "styrkur", weakness: "veikt", neutral: "í meðallagi", no_data: "—" } as Record<string, string>,
    method: "Tveir aðskildir lestrar — sem fótboltamaður og sem íþróttamaður — aldrei blandað í eina einkunn. Percentíl raða leikmanni innan síns liðs / stöðu og lýsa því sem gögnin sýna; þau spá ekki. FRAMMISTAÐA EINGÖNGU: ekkert hér er readiness-liturinn, álags-ákvörðun né læknis-/meiðsla-mat — ósamhverfa er styrkleikamerki og læknis-lesturinn er áfram í RTP-modúlinu.",
    signals: "Uppspretta: StatsBomb/Wyscout per-90 (fótbolti) + GPS / VALD kraftplötur / VBT (íþrótt). Reglur reikna percentílin og æfingaleiðirnar; texti er AI-orðaður og þjálfari getur hnekkt." },
} as const;

function bio(p: PlayerProfilePdfPayload, lang: Lang): string {
  const parts = [p.position, p.minutes != null ? `${Math.round(p.minutes)} ${lang === "IS" ? "mín" : "min"}` : null, L[lang].within].filter(Boolean);
  return parts.join(" · ");
}

export function Doc({ payload, lang }: { payload: PlayerProfilePdfPayload; lang: Lang }) {
  const t = L[lang];
  const n = payload.narrative;
  const sections: Array<[string, string | undefined]> = [
    [t.footballer, n?.footballerRead], [t.athlete, n?.athleteRead], [t.cross, n?.crossRead], [t.roleFit, n?.roleFit],
  ];
  const fb = payload.footballer;
  const ath = payload.athlete;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{t.kicker}</Text>
        <Text style={s.h1}>{payload.playerName}</Text>
        <Text style={s.sub}>{bio(payload, lang)}</Text>
        <Text style={s.byline}>{t.prepared}{payload.aiGenerated ? ` · AI · ${t.ai}` : ""}</Text>

        {(n?.profile ?? payload.headline) ? (
          <View style={s.vbox}>
            <Text style={s.vlabel}>{t.profile}</Text>
            <Text style={s.vtxt}>{n?.profile ?? payload.headline}</Text>
          </View>
        ) : null}

        {sections.map(([label, body]) => (body && body.trim() ? (
          <View key={label} wrap={false}>
            <Text style={s.h2}>{label}</Text>
            <Text style={s.para}>{body}</Text>
          </View>
        ) : null))}

        {fb && (fb.strengths.length > 0 || fb.weaknesses.length > 0) ? (
          <View wrap={false} style={s.colWrap}>
            <View style={s.col}>
              <Text style={[s.colLabel, { color: GREEN }]}>{t.strengths}</Text>
              {fb.strengths.length ? fb.strengths.map((m, i) => (
                <Text key={i} style={s.bullet}>{m.label}{m.percentile != null ? ` (${m.percentile}${lang === "IS" ? "." : "th"})` : ""}</Text>
              )) : <Text style={s.bullet}>—</Text>}
            </View>
            <View style={s.col}>
              <Text style={[s.colLabel, { color: AMBER }]}>{t.limitations}</Text>
              {fb.weaknesses.length ? fb.weaknesses.map((m, i) => (
                <Text key={i} style={s.bullet}>{m.label}{m.percentile != null ? ` (${m.percentile}${lang === "IS" ? "." : "th"})` : ""}</Text>
              )) : <Text style={s.bullet}>—</Text>}
            </View>
          </View>
        ) : null}

        {ath && ath.qualities.length ? (
          <View wrap={false}>
            <Text style={[s.h2, { color: COBALT }]}>{t.qualities}</Text>
            <View style={s.row}>
              <Text style={[s.cQ, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.quality}</Text>
              <Text style={[s.cVal, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.value}</Text>
              <Text style={[s.cPct, { color: INK }]}>{t.pctl}</Text>
              <Text style={[s.cRead, { fontFamily: "Helvetica-Bold" }]}>{t.read}</Text>
            </View>
            {ath.qualities.map((q, i) => (
              <View style={s.row} key={i}>
                <Text style={s.cQ}>{q.label}</Text>
                <Text style={s.cVal}>{q.value}{q.unit ? ` ${q.unit}` : ""}</Text>
                <Text style={s.cPct}>{q.percentile ?? "—"}</Text>
                <Text style={s.cRead}>{t.verdicts[q.verdict] ?? q.verdict}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {payload.development.length ? (
          <View>
            <Text style={[s.h2, { color: AMBER }]}>{t.improve}</Text>
            {payload.development.map((d, i) => (
              <Text key={i} style={s.imp}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{d.label}{d.percentile != null ? ` (${d.percentile}${lang === "IS" ? "." : "th"})` : ""}: </Text>
                {d.lever}{d.cite ? ` [${d.cite}]` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={s.foot}>{t.method}{"\n"}{t.signals}</Text>
      </Page>
    </Document>
  );
}

export async function downloadPlayerProfilePdf(payload: PlayerProfilePdfPayload, lang: Lang) {
  const blob = await pdf(<Doc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = payload.playerName.replace(/\s+/g, "-");
  a.download = `player-profile-${slug}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
