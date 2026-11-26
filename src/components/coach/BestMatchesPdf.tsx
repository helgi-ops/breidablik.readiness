"use client";

/**
 * BestMatchesPdf — the Best Match Analysis report as a PDF.
 *
 * Explainability-first layered read (docs/explainability-first.md):
 *   layer 0  rule verdict: the best game and what we did well in it
 *   layer 1  plain facts: record across the selected games, goals, the most common strength
 *            (+ the AI summary, labelled AI, when the coach generated it)
 *   layer 2  per game: what we did well, the DETAILED team statistics (Attack · Build-up &
 *            passing · Pressing & defence · On-ball value · Against) and who was in the team.
 *
 * Numbers are the rule-computed sb_team_match_stats figures — descriptive, never touches the
 * readiness colour. Bilingual EN/IS. Styling comes from the shared PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, BrandPage, C, Card, Chip, FactRow, Section, Status, Verdict, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
import type { Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";
type Bi = { en: string; is: string };

type PdfLineup = { name: string; line: string | null; starter: boolean | null; minutes: number | null };
export type PdfMatch = {
  matchDate: string; opponent: string | null; isHome: boolean | null;
  goals: number; goalsAgainst: number; outcome: "win" | "draw" | "loss";
  strengths: Array<{ label: Bi }>;
  lineup: PdfLineup[]; startersKnown: boolean; lineupCount: number;
  detail: Record<string, number | null> | null;
};
export type BestMatchesPdfPayload = {
  matches: PdfMatch[];
  lens: "overall" | "attack" | "defense";
  teamName?: string | null;
  ai?: { overall: string; notes: Record<string, string> } | null;
};

const OUT_TONE: Record<PdfMatch["outcome"], Tone> = { win: "green", draw: "amber", loss: "red" };

type Kind = "int" | "dec2" | "pct";
type Metric = { key: string; label: Bi; kind: Kind };
type Group = { title: Bi; metrics: Metric[] };
const M = (key: string, en: string, is: string, kind: Kind = "int"): Metric => ({ key, label: { en, is }, kind });

const GROUPS: Group[] = [
  { title: { en: "Attack", is: "Sókn" }, metrics: [
    M("goals", "Goals", "Mörk"), M("xg", "xG", "xG", "dec2"), M("open_play_xg", "Open-play xG", "xG (opinn leikur)", "dec2"),
    M("set_piece_xg", "Set-piece xG", "Fastra-bolta xG", "dec2"), M("shots", "Shots", "Skot"), M("shots_on_target", "Shots on target", "Skot á mark"),
    M("xg_per_shot", "xG / shot", "xG á skot", "dec2"),
  ] },
  { title: { en: "Build-up & passing", is: "Uppbygging & sendingar" }, metrics: [
    M("passing_pct", "Pass completion", "Sendinganákvæmni", "pct"), M("possession_proxy_pct", "Possession", "Boltahald", "pct"),
    M("passes", "Passes", "Sendingar"), M("passes_into_box", "Passes into box", "Sendingar í teig"), M("passes_final_third", "Into final third", "Á lokaþriðjung"),
    M("deep_progressions", "Deep progressions", "Djúpar framfærslur"), M("long_balls", "Long balls", "Langar sendingar"),
    M("crosses", "Crosses", "Fyrirgjafir"), M("through_balls", "Through balls", "Gegnumbrot"), M("key_passes", "Key passes", "Lykilsendingar"),
  ] },
  { title: { en: "Pressing & defence", is: "Pressa & vörn" }, metrics: [
    M("pressures", "Pressures", "Pressur"), M("counterpressures", "Counterpressures", "Gagnpressur"), M("pressures_opp_half_pct", "Pressures opp. half", "Pressur á vallarhelmingi andst.", "pct"),
    M("tackles", "Tackles", "Tæklingar"), M("interceptions", "Interceptions", "Stungur rofnar"), M("def_action_regains", "Ball recoveries", "Endurheimtur"),
    M("aggressive_actions", "Aggressive actions", "Ágengar aðgerðir"), M("clearances", "Clearances", "Frákast"),
  ] },
  { title: { en: "On-ball value (OBV)", is: "On-ball value (OBV)" }, metrics: [
    M("obv", "Total OBV", "Heildar-OBV", "dec2"), M("pass_obv", "Pass OBV", "Sendinga-OBV", "dec2"), M("shot_obv", "Shot OBV", "Skot-OBV", "dec2"),
    M("carry_obv", "Dribble & carry OBV", "Rekstur-OBV", "dec2"), M("def_action_obv", "Defensive OBV", "Varnar-OBV", "dec2"),
  ] },
  { title: { en: "Against", is: "Á móti" }, metrics: [
    M("goals_against", "Goals conceded", "Mörk á móti"), M("xg_against", "xG against", "xG á móti", "dec2"),
    M("shots_against", "Shots faced", "Skot á markið"), M("opposition_obv", "Opposition OBV", "OBV andstæðings", "dec2"),
  ] },
];

const LINE_LABEL: Record<string, Bi> = { GK: { en: "GK", is: "Markv." }, DEF: { en: "Defence", is: "Vörn" }, MID: { en: "Midfield", is: "Miðja" }, FWD: { en: "Attack", is: "Sókn" }, other: { en: "Other", is: "Aðrir" } };
const LINE_SEQ = ["GK", "DEF", "MID", "FWD", "other"];

const T = {
  EN: { title: "Best Match Analysis", doc: "Best matches", prepared: "Prepared for the coaching staff · MicroPulse", matches: "matches",
    lens: { overall: "Ranked overall (result, then goal margin, then xG)", attack: "Best attacking games", defense: "Best defensive games" },
    aiTag: "AI SUMMARY · PHRASES THE NUMBERS, DECIDES NOTHING", starters: "Starting XI", team: "The team", subs: "Subs",
    best: "BEST GAME", bestHead: (score: string, opp: string, date: string) => `${score} vs ${opp} (${date}) is the best of the selection.`,
    welldone: "What we did well", record: "Record in these games", goals: "Goals for - against", total: "total", common: "Most common strength", inGames: (n: number, of: number) => `in ${n} of ${of} games`,
    perGame: "Game by game", howTo: "How this was made", note: "Descriptive football context from StatsBomb team stats. Rules rank; AI text is labelled AI. Never touches readiness.", win: "Win", draw: "Draw", loss: "Loss", vs: "vs", home: "home", away: "away", aiNote: "AI",
    method: "Descriptive football context only — it never changes the readiness colour or the daily decision. Ranking and “what we did well” are rule-computed from ingested StatsBomb team stats; the starting XI is read from Match minutes (55+ min). Any AI text is labelled and written from these numbers." },
  IS: { title: "Bestu leikir", doc: "Bestu leikir", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", matches: "leikir",
    lens: { overall: "Raðað eftir heildarúrslitum (úrslit, svo markamunur, svo xG)", attack: "Bestu sóknarleikir", defense: "Bestu varnarleikir" },
    aiTag: "AI SAMANTEKT · ORÐAR TÖLURNAR, ÁKVEÐUR EKKERT", starters: "Byrjunarlið", team: "Liðið", subs: "Inn á",
    best: "BESTI LEIKURINN", bestHead: (score: string, opp: string, date: string) => `${score} gegn ${opp} (${date}) er besti leikurinn í úrvalinu.`,
    welldone: "Hvað við gerðum vel", record: "Árangur í þessum leikjum", goals: "Mörk skoruð - fengin", total: "samtals", common: "Algengasti styrkleikinn", inGames: (n: number, of: number) => `í ${n} af ${of} leikjum`,
    perGame: "Leikur fyrir leik", howTo: "Hvernig þetta var unnið", note: "Lýsandi samhengi úr StatsBomb liðs-tölum. Reglur raða; AI-texti er merktur AI. Snertir aldrei readiness.", win: "Sigur", draw: "Jafntefli", loss: "Tap", vs: "gegn", home: "heima", away: "úti", aiNote: "AI",
    method: "Lýsandi samhengi — breytir aldrei readiness-litnum né daglegri ákvörðun. Röðun og „hvað við gerðum vel“ eru reiknuð úr StatsBomb liðs-tölum; byrjunarlið er lesið úr Leikmínútum (55+ mín). AI-texti er merktur og skrifaður úr þessum tölum." },
} as const;

function fmt(v: number | null | undefined, kind: Kind): string {
  if (v == null) return "-";
  if (kind === "pct") return `${Math.round(v)}%`;
  if (kind === "dec2") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(Math.round(v));
}

/** Small inline "AI" pill — the kit's AiBox is a full box; per-game AI notes need a one-liner. */
function AiLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 5, alignItems: "flex-start", marginTop: 5, backgroundColor: C.cobaltTint, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4 }}>
      <Text style={[fb(700), { backgroundColor: C.cobalt, color: "#ffffff", fontSize: 6.5, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2, letterSpacing: 0.5, marginTop: 1 }]}>AI</Text>
      <Text style={[fb(400), { flex: 1, fontSize: 8.5, lineHeight: 1.4, color: "#2b2f35" }]}>{clean(text)}</Text>
    </View>
  );
}

export function BestMatchesDoc({ payload, lang }: { payload: BestMatchesPdfPayload; lang: Lang }) {
  const t = T[lang];
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const ms = payload.matches;
  const outWord = (o: PdfMatch["outcome"]) => (o === "win" ? t.win : o === "draw" ? t.draw : t.loss);
  const ctx = payload.teamName ? clean(payload.teamName) : undefined;

  // Layer 0/1 — rule facts across the selection.
  const top = ms[0];
  const w = ms.filter((m) => m.outcome === "win").length, d = ms.filter((m) => m.outcome === "draw").length, l = ms.filter((m) => m.outcome === "loss").length;
  const gf = ms.reduce((s, m) => s + m.goals, 0), ga = ms.reduce((s, m) => s + m.goalsAgainst, 0);
  const counts = new Map<string, { label: Bi; n: number }>();
  ms.forEach((m) => m.strengths.forEach((x) => { const k = x.label.en; const c = counts.get(k); if (c) c.n += 1; else counts.set(k, { label: x.label, n: 1 }); }));
  const common = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  const facts: { value: string; label: string; sub?: string; tone?: Tone }[] = ms.length
    ? [
      { value: `${w}-${d}-${l}`, label: t.record, sub: `${t.win} - ${t.draw} - ${t.loss}` },
      { value: `${gf}-${ga}`, label: t.goals, sub: `${ms.length} ${t.matches} ${t.total}` },
      ...(common ? [{ value: L(common.label), label: t.common, sub: t.inGames(common.n, ms.length) }] : []),
    ]
    : [];

  return (
    <Document title={`${t.title}${ctx ? ` - ${ctx}` : ""}`} author="MicroPulse">
      <BrandPage
        doc={t.doc}
        context={ctx}
        title={`${t.title}${ctx ? ` · ${ctx}` : ""}`}
        kicker={t.lens[payload.lens]}
        subtitle={`${ms.length} ${t.matches} · ${t.prepared}`}
        chips={([[w, t.win, "green"], [d, t.draw, "amber"], [l, t.loss, "red"]] as const).filter(([n]) => n > 0).map(([n, word, tone]) => ({ text: `${n} ${word}`, tone }))}
        note={t.note}
      >
        {top ? (
          <Verdict
            tone={OUT_TONE[top.outcome]}
            label={`${t.best} · ${outWord(top.outcome)}`}
            headline={t.bestHead(`${top.goals}-${top.goalsAgainst}`, clean(top.opponent ?? "?"), top.matchDate)}
            body={top.strengths.length ? `${t.welldone}: ${top.strengths.map((x) => L(x.label)).join(" · ")}.` : undefined}
          />
        ) : null}
        {facts.length ? <FactRow facts={facts} /> : null}

        {payload.ai?.overall ? <AiBox label={t.aiTag} body={payload.ai.overall} /> : null}

        <Section title={t.perGame}>
          {ms.map((m, i) => {
            const det = m.detail ?? {};
            const starters = m.lineup.filter((p) => p.starter === true);
            const useStarters = m.startersKnown;
            const lineupSet = useStarters ? starters : m.lineup;
            const bench = m.lineup.filter((p) => p.starter !== true);
            const groupsPresent = GROUPS.map((g) => ({ ...g, metrics: g.metrics.filter((mm) => det[mm.key] != null) })).filter((g) => g.metrics.length > 0);
            const aiNote = payload.ai?.notes?.[m.matchDate];
            return (
              <Card wrap key={m.matchDate} style={{ marginBottom: 8 }}>
                <View wrap={false} minPresenceAhead={120}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[fh(800), { fontSize: 18, color: C.cobalt, width: 22 }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[fh(800), { fontSize: 13 }]}>{`${m.goals}-${m.goalsAgainst} ${t.vs} ${clean(m.opponent ?? "?")}`}</Text>
                    <Text style={[fb(400), { fontSize: 8, color: C.mute, marginTop: 1 }]}>{m.matchDate}{m.isHome == null ? "" : ` · ${m.isHome ? t.home : t.away}`}</Text>
                  </View>
                  <Status tone={OUT_TONE[m.outcome]} text={outWord(m.outcome).toUpperCase()} />
                </View>

                {m.strengths.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {m.strengths.map((x, k) => <Chip key={k} text={L(x.label)} tone="cobalt" />)}
                  </View>
                ) : null}
                {aiNote ? <AiLine text={aiNote} /> : null}
                </View>

                {groupsPresent.map((g) => (
                  <View key={g.title.en} wrap={false} style={{ marginTop: 7 }}>
                    <Text style={[fb(700), { fontSize: 7.5, letterSpacing: 0.8, color: C.mute, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: C.hair }]}>{L(g.title).toUpperCase()}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 1 }}>
                      {g.metrics.map((mm) => (
                        <View key={mm.key} style={{ width: "25%", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingRight: 10, paddingVertical: 1.8 }}>
                          <Text style={[fb(400), { flex: 1, fontSize: 8, color: C.mute, lineHeight: 1.25 }]}>{L(mm.label)}</Text>
                          <Text style={[fh(700), { fontSize: 8.5, marginLeft: 4 }]}>{fmt(det[mm.key], mm.kind)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                {m.lineupCount > 0 ? (
                  <View wrap={false} style={{ marginTop: 7 }}>
                    <Text style={[fb(700), { fontSize: 7.5, letterSpacing: 0.8, color: C.mute, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: C.hair }]}>{(useStarters ? `${t.starters} (${starters.length})` : `${t.team} (${m.lineupCount})`).toUpperCase()}</Text>
                    {LINE_SEQ.map((ln) => {
                      const ps = lineupSet.filter((p) => (p.line ?? "other") === ln);
                      if (ps.length === 0) return null;
                      return (
                        <View key={ln} style={{ flexDirection: "row", marginTop: 2 }}>
                          <Text style={[fb(600), { width: 60, fontSize: 8.25, color: C.mute }]}>{L(LINE_LABEL[ln])}</Text>
                          <Text style={[fb(400), { flex: 1, fontSize: 8.25, lineHeight: 1.35 }]}>{clean(ps.map((p) => p.name).join(", "))}</Text>
                        </View>
                      );
                    })}
                    {useStarters && bench.length > 0 ? (
                      <View style={{ flexDirection: "row", marginTop: 2 }}>
                        <Text style={[fb(600), { width: 60, fontSize: 8.25, color: C.mute }]}>{t.subs}</Text>
                        <Text style={[fb(400), { flex: 1, fontSize: 8.25, lineHeight: 1.35 }]}>{clean(bench.map((p) => `${p.name}${p.minutes != null ? ` (${Math.round(p.minutes)}')` : ""}`).join(", "))}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </Section>

        <Section title={t.howTo} wrap={false}>
          <Card><Text style={[fb(400), { fontSize: 8.5, lineHeight: 1.5 }]}>{clean(t.method)}</Text></Card>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadBestMatchesPdf(payload: BestMatchesPdfPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <BestMatchesDoc payload={payload} lang={lang} />);
  saveBlob(blob, `best-match-analysis-${payload.lens}-${payload.matches.length}.pdf`);
}
