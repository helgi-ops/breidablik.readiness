"use client";

/**
 * MatchAnalysisPdf — the article-quality single-match analysis (PDF), the per-match
 * analog of TeamSeasonArticlePdf.
 *
 * Layered read: score header → THE READ verdict box → the sectioned prose
 * (possession, chance quality, OBV, set pieces, keeping/finishing/pressing, what it
 * tells us) → the "game in numbers" two-column table → confidence + sources footer.
 * Numbers are rule-computed from StatsBomb team + per-player match stats; the prose is
 * AI-written from those numbers and labelled AI. Descriptive context — it never touches
 * the readiness colour, load, or the daily decision. WinAnsi/Helvetica (Icelandic-safe):
 * no arrows / ticks / U+2212 (uses the ASCII hyphen for the score).
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { NumbersRow, SeasonContext } from "@/lib/micropulse/matchReview";

type Lang = "EN" | "IS";

export type MatchAnalysisProse = {
  theRead?: string; theReadBody?: string; possession?: string; chanceQuality?: string;
  obv?: string; setPieces?: string; keepingFinishingPressing?: string; whatItTells?: string;
};

export type MatchAnalysisPdfPayload = {
  teamName: string;
  opponent: string | null;
  homeAway: string | null;      // "home" | "away" for the coach's team
  competition: string | null;
  date: string;
  venue: string | null;
  score: string | null;         // own–against (e.g. "0-1")
  ownGoals: number | null;
  oppGoals: number | null;
  gameInNumbers: NumbersRow[];
  seasonContext: SeasonContext | null;
  confidence: { level: string; note: string };
  prose: MatchAnalysisProse | null;
  aiGenerated: boolean;
};

const INK = "#14181c", MUTE = "#6b7280", LINE = "#e5e7eb", COBALT = "#2740e6";

const s = StyleSheet.create({
  page: { paddingTop: 26, paddingBottom: 34, paddingHorizontal: 34, fontSize: 9.5, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  kicker: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 3 },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: MUTE, marginTop: 2 },
  byline: { fontSize: 8, color: MUTE, fontFamily: "Helvetica-Oblique", marginTop: 3, marginBottom: 8 },
  vbox: { borderWidth: 1, borderColor: "#c9d0f7", backgroundColor: "#eef0fb", borderRadius: 4, padding: 9, marginBottom: 9 },
  vlabel: { fontSize: 8, color: COBALT, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, marginBottom: 2 },
  vtxt: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK },
  vbody: { fontSize: 9.5, color: "#333", marginTop: 3 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 9, marginBottom: 3 },
  para: { fontSize: 9.5, color: "#222", marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 2 },
  cM: { flex: 1, color: "#333" },
  cV: { width: 74, textAlign: "right", fontFamily: "Helvetica-Bold" },
  cO: { width: 74, textAlign: "right", color: "#333" },
  foot: { marginTop: 12, paddingTop: 7, borderTopWidth: 1, borderTopColor: LINE, fontSize: 7.5, color: MUTE, lineHeight: 1.5 },
});

const L = {
  EN: { kicker: "MATCH ANALYSIS", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers below — cites the data, decides nothing",
    theRead: "THE READ", numbers: "The game in numbers", metric: "Per match", read: "Read", confidence: "Confidence",
    sections: { possession: "Possession & passing", chanceQuality: "xG & chance quality", obv: "OBV — the value of actions",
      setPieces: "Set pieces", keepingFinishingPressing: "Keeping, finishing & pressing", whatItTells: "What it tells us" },
    method: "Descriptive context only — it never changes the readiness colour, load, or the daily decision. Figures are StatsBomb per-match team + player stats for this single game; xG and OBV are models with uncertainty and describe what happened, they do not predict. One match is a snapshot, not a pattern.",
    signals: "Signals: StatsBomb IQ Match Stats (team) + per-player match stats for this game. Rules compute the figures; the read is AI-phrased and coach-overridable." },
  IS: { kicker: "LEIKGREINING", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum að neðan — vitnar í gögnin, ákveður ekkert",
    theRead: "LESTURINN", numbers: "Leikurinn í tölum", metric: "Á leik", read: "Lestur", confidence: "Áreiðanleiki",
    sections: { possession: "Boltahald & sendingar", chanceQuality: "xG & gæði færa", obv: "OBV — virði aðgerða",
      setPieces: "Fastir leikir", keepingFinishingPressing: "Markvarsla, klárun & pressa", whatItTells: "Hvað segir þetta okkur" },
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Tölur eru StatsBomb per-leik liðs- + leikmannatölur fyrir þennan eina leik; xG og OBV eru líkön með óvissu og lýsa því sem gerðist, þau spá ekki. Einn leikur er svipmynd, ekki mynstur.",
    signals: "Uppspretta: StatsBomb IQ Match Stats (lið) + per-leikmanns leikjatölur fyrir þennan leik. Reglur reikna tölurnar; lesturinn er AI-orðaður og þjálfari getur hnekkt." },
} as const;

const ROW_LABELS: Record<string, { en: string; is: string }> = {
  goals: { en: "Goals", is: "Mörk" },
  xg: { en: "xG", is: "xG" },
  openPlayXg: { en: "Open-play xG", is: "xG úr opnum leik" },
  shots: { en: "Shots", is: "Skot" },
  possession: { en: "Possession %", is: "Boltahald %" },
  passing: { en: "Passing %", is: "Sendingar %" },
  obv: { en: "OBV (value of actions)", is: "OBV (virði aðgerða)" },
  boxTouches: { en: "Touches in box", is: "Snertingar í teig" },
  setPieceXg: { en: "Set-piece xG", is: "xG úr föstum leik" },
  biggestChance: { en: "Biggest chance (xG)", is: "Stærsta færi (xG)" },
};

const CONF_LABEL: Record<string, { en: string; is: string }> = {
  "medium-high": { en: "medium-high", is: "miðlungs-hátt" }, high: { en: "high", is: "hátt" },
  medium: { en: "medium", is: "miðlungs" }, low: { en: "low", is: "lágt" },
};

const fmt = (v: number | null, decimals: number): string => (v == null ? "—" : v.toFixed(decimals));

/** Home team on the left of the scoreline. Coach's team may be home or away. */
function titleLine(p: MatchAnalysisPdfPayload): string {
  const opp = p.opponent ?? "Opponent";
  if (p.score == null || p.ownGoals == null || p.oppGoals == null) {
    return p.homeAway === "away" ? `${opp} v ${p.teamName}` : `${p.teamName} v ${opp}`;
  }
  return p.homeAway === "away"
    ? `${opp} ${p.oppGoals}-${p.ownGoals} ${p.teamName}`
    : `${p.teamName} ${p.ownGoals}-${p.oppGoals} ${opp}`;
}

export function Doc({ payload, lang }: { payload: MatchAnalysisPdfPayload; lang: Lang }) {
  const t = L[lang];
  const pr = payload.prose;
  // Prefer a row's inline localized label (source-specific rows, e.g. Wyscout metrics),
  // else the static map, else the key.
  const rowLabel = (r: NumbersRow) =>
    (lang === "IS" && r.labelIs) ? r.labelIs : (ROW_LABELS[r.key] ? ROW_LABELS[r.key][lang === "IS" ? "is" : "en"] : r.label);
  const sub = [payload.competition, payload.date, payload.venue].filter(Boolean).join(" · ");
  const conf = CONF_LABEL[payload.confidence.level] ?? CONF_LABEL.low;
  const sections: Array<[keyof typeof t.sections, string | undefined]> = [
    ["possession", pr?.possession], ["chanceQuality", pr?.chanceQuality], ["obv", pr?.obv],
    ["setPieces", pr?.setPieces], ["keepingFinishingPressing", pr?.keepingFinishingPressing], ["whatItTells", pr?.whatItTells],
  ];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{t.kicker}</Text>
        <Text style={s.h1}>{titleLine(payload)}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
        <Text style={s.byline}>{t.prepared}{payload.aiGenerated ? ` · AI · ${t.ai}` : ""}</Text>

        {pr?.theRead ? (
          <View style={s.vbox}>
            <Text style={s.vlabel}>{t.theRead}</Text>
            <Text style={s.vtxt}>{pr.theRead}</Text>
            {pr.theReadBody ? <Text style={s.vbody}>{pr.theReadBody}</Text> : null}
          </View>
        ) : null}

        {sections.map(([key, body]) => (body ? (
          <View key={key}>
            <Text style={s.h2}>{t.sections[key]}</Text>
            <Text style={s.para}>{body}</Text>
          </View>
        ) : null))}

        {payload.gameInNumbers.length ? (
          <View wrap={false}>
            <Text style={s.h2}>{t.numbers}</Text>
            <View style={s.row}>
              <Text style={[s.cM, { fontFamily: "Helvetica-Bold", color: INK }]}>{t.metric}</Text>
              <Text style={[s.cV, { color: INK }]}>{payload.teamName}</Text>
              <Text style={[s.cO, { fontFamily: "Helvetica-Bold" }]}>{payload.opponent ?? "Opp"}</Text>
            </View>
            {payload.gameInNumbers.map((r: NumbersRow) => (
              <View style={s.row} key={r.key}>
                <Text style={s.cM}>{rowLabel(r)}</Text>
                <Text style={s.cV}>{fmt(r.own, r.decimals)}</Text>
                <Text style={s.cO}>{fmt(r.opp, r.decimals)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[s.para, { marginTop: 8 }]}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{t.confidence}: </Text>
          {lang === "IS" ? conf.is : conf.en}. {payload.confidence.note}
        </Text>

        <Text style={s.foot}>{t.method}{"\n"}{t.signals}</Text>
      </Page>
    </Document>
  );
}

export async function downloadMatchAnalysisPdf(payload: MatchAnalysisPdfPayload, lang: Lang) {
  const blob = await pdf(<Doc payload={payload} lang={lang} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const oppSlug = (payload.opponent ?? "opponent").replace(/\s+/g, "-");
  a.download = `match-${oppSlug}-${payload.date}-analysis.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
