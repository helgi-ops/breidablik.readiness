"use client";

/**
 * BasketballOpponentPdf — the opponent scouting report as a downloadable PDF.
 *
 * Layout follows the explainability-first layered read (docs/explainability-first.md):
 *   Page 1  Summary — AI verdict (labelled as AI) → 2-3 plain rule-based facts →
 *           the game plan (how to defend / where to attack).
 *   Page 2  How they score — team profile, Four Factors, shot map, play types,
 *           shot pressure, lineups, where to attack (weakest defender per action).
 *   Page 3  Players — the top three as large cards, the rest compact.
 *   Page 4  Behind the numbers — the full AI read, glossary, source & confidence.
 *
 * Styling uses the design tokens from CLAUDE.md (bone #f4f2ec, ink #14181c, cobalt
 * #2740e6; Archivo headings/numbers, Geist body) via the shared kit in
 * src/components/pdf/brand.tsx (fonts + Helvetica fallback live there).
 *
 * Descriptive scouting — never touches readiness.
 */

import * as React from "react";
import { Document, Page, StyleSheet, Text, View, Svg, Path, Line, Circle, Polygon } from "@react-pdf/renderer";
import { fb, fh, fileSafe, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
import { shotLabel, type Lang } from "@/lib/micropulse/basketballStats/shotLabels";
import { shotChartGeometry } from "@/lib/micropulse/basketballStats/shotChartGeometry";

export type ClipLite = { action: string; made: boolean | null; court_x: number | null; court_y: number | null; period: string | null; clock: string | null; video_url: string | null; source: string };
const CLIP_ACTION_LABELS: Record<string, { en: string; is: string }> = {
  "3pt_make": { en: "3PT make", is: "3ja hitt" }, "3pt_miss": { en: "3PT miss", is: "3ja miss" },
  drive: { en: "Drive", is: "Drive" }, post_up: { en: "Post-up", is: "Póstur" }, oreb_putback: { en: "OReb put-back", is: "Sóknarfrák." },
  assist: { en: "Assist", is: "Stoðs." }, turnover: { en: "Turnover", is: "Tapaður" }, other: { en: "Other", is: "Annað" },
};
import { buildPlayDiagram, playTypeLabel, PLAY_VIEW, type PlayDiagram, type PlayColors } from "@/lib/micropulse/basketballStats/playDiagram";

type ShotType = { key: string; made: number; att: number; pct: number | null; sharePct?: number | null };
type CourtRegion = { key: "paint" | "mid" | "three"; made: number; att: number; pct: number | null };
type FourFactors = { efgPct: number | null; toPct: number | null; orebPct: number | null; ftf: number | null; ppp: number | null; games: number } | null;
type Team = { ppg: number | null; fgPct: number | null; tpPct: number | null; tpaPg: number | null; reb: number | null; ast: number | null; tov: number | null; homePpg: number | null; awayPpg: number | null } | null;
type Player = { name: string; ppg: number | null; rpg: number | null; apg: number | null; fgPct: number | null; tpPct: number | null; tpaPg: number | null; descriptor?: { en: string; is: string } };
type Defend = { en: string; is: string; evidence?: string };
type Lineup = { members: string[]; minutes: number | null; plusMinus: number | null; points: number | null; fgPct: number | null };
type Shooting = { twoPct: number | null; twoPaPg: number | null; threePct: number | null; threePaPg: number | null; ftPct: number | null; ftaPg: number | null };
type PlayerDetail = {
  name: string; games: number; tags: string[];
  mpg: number | null; ppg: number | null; rpg: number | null; apg: number | null; spg: number | null; topg: number | null;
  shooting: Shooting;
  notes?: { offense: string[]; defense: string[] } | null;
  descriptor?: { en: string; is: string };
};

export type BasketballOpponentPdfData = {
  opponentName: string;
  source: "instat" | "kki" | null;
  games: number | null;
  team: Team;
  fourFactors: FourFactors;
  courtRegions: CourtRegion[] | null;
  playtypes: ShotType[] | null;
  efficiency: ShotType[] | null;
  lineups: Lineup[] | null;
  howToDefend: Defend[];
  /** Each action's weakest defender — the "where to attack" board (InStat season). */
  attack?: { key: string; defender: string; oppPct: number; att: number }[] | null;
  keyPlayers: Player[];
  /** Detailed per-player analysis (top scorers). Richer than keyPlayers; rendered when present. */
  players?: PlayerDetail[] | null;
  /** Tagged scouting clips per player (deep links + timecodes) — a clips strip under each top scorer. */
  clipsByPlayer?: Record<string, ClipLite[]> | null;
  /** Coach-drawn set-play diagrams (confirmed only) — rendered on their own page. */
  plays?: PdfPlay[] | null;
  ai: { headline?: string; summary?: string; strengths?: string[]; weaknesses?: string[]; keyPlayers?: { name: string; note: string }[]; howToDefend?: string[]; howToAttack?: string[] } | null;
};
export type PdfPlay = { name: string; playType: string | null; diagram: PlayDiagram; source?: string | null; confidence?: string | null };

// ── Design tokens (CLAUDE.md § Design system) ────────────────────────────────
const BONE = "#f4f2ec", CARD = "#ffffff", INK = "#14181c", MUTE = "#575c63", RULE = "#dcd8cc", HAIR = "#efece4";
const COBALT = "#2740e6", COBALT_TINT = "#e6e9fc", COBALT_EDGE = "#c4cbf5", TRACK = "#eceae3";
const AMBER_LBL = "#8f5a10", AMBER_TXT = "#6e450b", AMBER_TINT = "#fbeed8";
/** Below this many games the report is flagged as a small sample (confidence). */
const SMALL_SAMPLE_GAMES = 5;

// ── Fonts — shared MicroPulse PDF kit (Archivo / Geist, Helvetica fallback) ──
type W = 400 | 600 | 700 | 800;
type Fonts = { h: (w: W) => { fontFamily: string; fontWeight?: number }; b: (w: W) => { fontFamily: string; fontWeight?: number } };
const BRAND: Fonts = { h: fh, b: fb };

// ── Helpers ──────────────────────────────────────────────────────────────────
const clean = (s: unknown) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-").replace(/[▲▼✓→⛨]/g, "");
const pct = (v: number | null | undefined) => (v == null ? "-" : `${v.toFixed(1)}%`);
const d1 = (v: number | null | undefined) => (v == null ? "-" : v.toFixed(1));
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** "Lead - detail" → [lead, detail]. AI + rule bullets are written that way. */
const splitLead = (s: string): [string, string] => {
  const c = clean(s).trim();
  const i = c.indexOf(" - ");
  if (i > 0 && i <= 70) return [c.slice(0, i).trim(), cap(c.slice(i + 3).trim())];
  return [c, ""];
};
const barW = (v: number, max: number) => `${max > 0 ? Math.max(2, Math.min(100, (v / max) * 100)) : 0}%`;

const T = {
  EN: {
    kicker: "OPPONENT SCOUTING", sub: "Scouting report", fromH2h: "from your head-to-head InStat games", fromKki: "from the KKI season", games: "games",
    small: "Small sample - read as tendencies", ai: "READS THE NUMBERS - DECIDES NOTHING", basedOn: "Based on the InStat numbers on pages 2-3 of this report.",
    plan: "Game plan", defend: "How to defend", attack: "Where to attack", keyFacts: "Key facts",
    scoreHead: "HOW THEY SCORE", playersHead: "PLAYERS", behindHead: "BEHIND THE NUMBERS", setPlaysHead: "SET PLAYS",
    setPlays: "Set plays", setPlaysHint: "The opponent's most-used sets, drawn by the coaching staff. O = attacker, X = defender; dashed = pass, zig-zag = dribble, bar = screen.", aiDraft: "AI first draft", unconfirmed: "unconfirmed",
    profile: "Team profile", perGame: "per game", ff: "How they played you (Four Factors)", zones: "Shot map",
    shotsFrom: "Where their shots come from", shareOfShots: "Share of shots", aboveAvg: "Above their average FG%", playType: "Play type", madeAtt: "Made-att",
    pressure: "Shot pressure", contested: "Contested", uncontested: "Uncontested", pressureNote: "Share of their attempts with a defender close enough to affect the shot.",
    otherEff: "Offensive-efficiency types",
    lineups: "Most-used lineups", lineupsHint: "By minutes on court, with net +/- and the points and FG% each unit put up.",
    attackBoard: "Weakest defender per action", attackHint: "Opponents' shooting against that player on that action.",
    bigThree: "Top scorers", rolePlayers: "Role players", keyPlayers: "Key players", tendencies: "TENDENCIES", whenDefending: "WHEN DEFENDING", defendingLegend: "When defending - how to attack them",
    fullRead: "FULL READ - WRITTEN FROM THE INSTAT NUMBERS", strengths: "Strengths", weaknesses: "Weaknesses",
    howToRead: "How to read this report", source: "Source and confidence", data: "Data", gamesLbl: "Games", sample: "Sample", aiRole: "AI role",
    sampleSmall: "Small - tendencies, not certainties", sampleOk: "Reasonable", aiExplains: "Explains the numbers only", noAi: "No AI summary generated",
    sourceNote: "Numbers come straight from the imported reports. The AI summary is labelled and never changes a number or a readiness verdict.",
    gloss: [["FG%", "share of shots that go in."], ["3PA", "three-point attempts per game."], ["Usage", "share of team possessions a player finishes while on court."], ["+/-", "points scored minus points allowed while a player or lineup is on court."], ["Contested", "a defender was close enough to affect the shot."], ["When defending", "how opponents shoot with that player as the defender."]] as [string, string][],
    foot: "Descriptive opponent scouting from imported InStat Game Reports. It does not decide anything and never changes a readiness verdict.",
  },
  IS: {
    kicker: "ANDSTÆÐINGAGREINING", sub: "Leikgreining", fromH2h: "úr ykkar innbyrðis InStat-leikjum", fromKki: "úr KKÍ-tímabilinu", games: "leikir",
    small: "Lítið úrtak - lesið sem tilhneigingar", ai: "LES TÖLURNAR - ÁKVEÐUR EKKERT", basedOn: "Byggt á InStat-tölunum á bls. 2-3 í þessari skýrslu.",
    plan: "Leikplan", defend: "Hvernig á að verjast", attack: "Hvar á að sækja", keyFacts: "Lykilatriði",
    scoreHead: "HVERNIG ÞEIR SKORA", playersHead: "LEIKMENN", behindHead: "Á BAK VIÐ TÖLURNAR", setPlaysHead: "LEIKKERFI",
    setPlays: "Leikkerfi", setPlaysHint: "Mest notuðu sóknir andstæðingsins, teiknaðar af þjálfarateymi. O = sóknarmaður, X = varnarmaður; brotalína = sending, sikk-sakk = rakning, strik = skermur.", aiDraft: "AI-uppkast", unconfirmed: "óstaðfest",
    profile: "Liðsprófíll", perGame: "í leik", ff: "Hvernig þeir spiluðu ykkur (Four Factors)", zones: "Skotkort",
    shotsFrom: "Hvaðan skotin koma", shareOfShots: "Hlutfall skota", aboveAvg: "Yfir meðalnýtingu þeirra", playType: "Sóknartegund", madeAtt: "Hitt-reynt",
    pressure: "Pressa á skot", contested: "Varin", uncontested: "Óvarin", pressureNote: "Hlutfall skota þar sem varnarmaður var nógu nálægt til að trufla skotið.",
    otherEff: "Sóknargerð (efficiency)",
    lineups: "Mest notuðu fimmurnar", lineupsHint: "Eftir mínútum á velli, með +/- og stig og FG% sem fimman skoraði.",
    attackBoard: "Veikasti varnarmaður í hverri sókn", attackHint: "Hittni andstæðinga á þann leikmann í þeirri sóknartegund.",
    bigThree: "Stigahæstu leikmenn", rolePlayers: "Aðrir leikmenn", keyPlayers: "Lykilmenn", tendencies: "TILHNEIGINGAR", whenDefending: "Í VÖRN", defendingLegend: "Í vörn - hvernig á að sækja á þá",
    fullRead: "ÍTARLEG GREINING - SKRIFUÐ ÚT FRÁ INSTAT-TÖLUNUM", strengths: "Styrkleikar", weaknesses: "Veikleikar",
    howToRead: "Hvernig á að lesa skýrsluna", source: "Uppruni og áreiðanleiki", data: "Gögn", gamesLbl: "Leikir", sample: "Úrtak", aiRole: "Hlutverk AI",
    sampleSmall: "Lítið - tilhneigingar, ekki vissa", sampleOk: "Ásættanlegt", aiExplains: "Útskýrir tölurnar eingöngu", noAi: "Engin AI-samantekt búin til",
    sourceNote: "Tölurnar koma beint úr innfluttu skýrslunum. AI-samantektin er merkt og breytir aldrei tölu né readiness-dómi.",
    gloss: [["FG%", "hlutfall skota sem fara ofan í."], ["3PA", "þriggja stiga tilraunir í leik."], ["Usage", "hlutfall sókna liðsins sem leikmaður klárar á meðan hann er inná."], ["+/-", "skoruð stig mínus fengin stig á meðan leikmaður eða fimma er inná."], ["Varið skot", "varnarmaður var nógu nálægt til að trufla skotið."], ["Í vörn", "hvernig andstæðingar hitta með þennan leikmann sem varnarmann."]] as [string, string][],
    foot: "Lýsandi andstæðingagreining úr innfluttum InStat-leikskýrslum. Ákveður ekkert og breytir aldrei readiness-dómi.",
  },
} as const;

const TAG_LABELS: Record<string, { EN: string; IS: string }> = {
  primary_scorer: { EN: "Scorer", IS: "Skorari" },
  three_point_threat: { EN: "3pt threat", IS: "3ja stiga skytta" },
  playmaker: { EN: "Playmaker", IS: "Leikstjórnandi" },
  glass: { EN: "Glass", IS: "Fráköst" },
};

const regionLabel = (key: CourtRegion["key"], lang: Lang) =>
  key === "paint" ? (lang === "IS" ? "Teigur" : "Paint") : key === "mid" ? (lang === "IS" ? "Miðsvæði" : "Mid-range") : (lang === "IS" ? "Þristar" : "3PT");

const st = StyleSheet.create({
  page: { backgroundColor: BONE, color: INK, paddingTop: 34, paddingBottom: 64, paddingHorizontal: 42, fontSize: 9.5 }, // no page-level lineHeight: it stops `fixed` absolute footers rendering (react-pdf 4.3)
  pageRun: { paddingTop: 66 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: RULE, borderRadius: 9 },
  row: { flexDirection: "row" },
  foot: { position: "absolute", bottom: 22, left: 42, right: 42, borderTopWidth: 1, borderTopColor: "#cfcabd", paddingTop: 7, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTE },
  runHead: { position: "absolute", top: 34, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: INK },
  kicker: { fontSize: 8.5, letterSpacing: 1.2, color: COBALT },
  muted: { color: MUTE },
  hairRow: { borderBottomWidth: 1, borderBottomColor: HAIR },
});

// Play-diagram colours on the PDF (concrete hex — @react-pdf has no CSS tokens). Mirrors
// the design system: amber offense, cobalt ball, ink markings.
const PDF_PLAY_COLORS: PlayColors = { court: "#ffffff", line: "#c3c7cd", off: "#de9328", def: "#6b7280", ball: "#2740e6", ink: "#14181c", arrow: "#334155" };

/** The exact same primitive list as the web canvas, drawn with @react-pdf <Svg>. */
function PlayDiagramPdf({ diagram, w }: { diagram: PlayDiagram; w: number }) {
  const { prims } = buildPlayDiagram(diagram, PDF_PLAY_COLORS);
  const h = w * (PLAY_VIEW.h / PLAY_VIEW.w);
  return (
    <Svg viewBox={`-2 -2 ${PLAY_VIEW.w + 4} ${PLAY_VIEW.h + 4}`} width={w} height={h}>
      {prims.map((p, i) => {
        switch (p.t) {
          case "line": return <Line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.w} strokeLinecap="round" strokeDasharray={p.dash} />;
          case "path": return <Path key={i} d={p.d} stroke={p.stroke ?? "none"} fill={p.fill ?? "none"} strokeWidth={p.w ?? 0.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={p.dash} />;
          case "circle": return <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.w ?? 0} />;
          case "polygon": return <Polygon key={i} points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")} fill={p.fill ?? "none"} stroke={p.stroke ?? "none"} strokeWidth={p.w ?? 0} />;
          case "text": return <Text key={i} x={p.x} y={p.y} fill={p.fill} textAnchor={p.anchor ?? "middle"} style={{ fontSize: p.size, fontFamily: "Helvetica" }}>{p.s}</Text>;
        }
      })}
    </Svg>
  );
}

/** A compact clips strip under a top scorer: the shared shot-tendency chart (located clips) + a short
 *  referenced list (action · Q/clock · link). A print can't play video, so clips are references only. */
function ClipsStrip({ clips, lang, f }: { clips: ClipLite[]; lang: Lang; f: Fonts }) {
  if (!clips.length) return null;
  const g = shotChartGeometry(clips.filter((c) => c.court_x != null && c.court_y != null).map((c) => ({ x: c.court_x, y: c.court_y, made: !!c.made, kind: (c.action === "post_up" || c.action === "oreb_putback" || c.action === "drive") ? "paint" as const : "shot" as const })), 60, 56);
  const label = (a: string) => clean(lang === "IS" ? CLIP_ACTION_LABELS[a]?.is ?? a : CLIP_ACTION_LABELS[a]?.en ?? a);
  return (
    <View wrap={false} style={[st.card, st.row, { paddingHorizontal: 13, paddingVertical: 8, marginBottom: 6, gap: 11 }]}>
      <View>
        <Text style={[f.b(700), { fontSize: 7.5, letterSpacing: 0.7, color: MUTE }]}>{lang === "IS" ? "MERKT SKEIÐ" : "TAGGED CLIPS"} · {clips.length}</Text>
        {g.attempts ? (
          <Svg viewBox={`-2 -2 ${g.width + 4} ${g.height + 4}`} width={66} height={62} style={{ marginTop: 3 }}>
            <Path d={`M0 0 H${g.width} V${g.height} H0 Z`} stroke="#c9b48a" strokeWidth={0.8} fill="#f6efe2" />
            {g.shots.map((p, i) => p.made
              ? <Circle key={i} cx={p.cx} cy={p.cy} r={2.4} fill={p.kind === "paint" ? "#de9328" : "#1c7a4a"} />
              : <Path key={i} d={`M${p.cx - 2} ${p.cy - 2} L${p.cx + 2} ${p.cy + 2} M${p.cx + 2} ${p.cy - 2} L${p.cx - 2} ${p.cy + 2}`} stroke="#a83e28" strokeWidth={0.8} />)}
          </Svg>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        {clips.slice(0, 7).map((c, i) => (
          <View key={i} style={[st.row, { justifyContent: "space-between", paddingVertical: 1 }]}>
            <Text style={[f.b(600), { fontSize: 8.25 }]}>{label(c.action)}{c.made != null ? ` · ${c.made ? (lang === "IS" ? "hitt" : "make") : "miss"}` : ""}</Text>
            <Text style={[f.b(400), { fontSize: 8, color: MUTE }]}>{clean([c.period, c.clock].filter(Boolean).join(" "))}{c.video_url ? "  link" : ""}</Text>
          </View>
        ))}
        {clips.length > 7 ? <Text style={[f.b(400), { fontSize: 7.5, color: MUTE, marginTop: 1 }]}>+{clips.length - 7} {lang === "IS" ? "fleiri" : "more"}</Text> : null}
      </View>
    </View>
  );
}

function Doc({ data, lang, f }: { data: BasketballOpponentPdfData; lang: Lang; f: Fonts }) {
  const t = T[lang];
  const team = data.team;
  const ai = data.ai;
  const name = clean(data.opponentName);
  const small = data.games != null && data.games < SMALL_SAMPLE_GAMES;
  const sourceLine = data.source === "instat" ? t.fromH2h : data.source === "kki" ? t.fromKki : "";
  const avgFg = team?.fgPct ?? null;

  const h2 = (children: React.ReactNode, size = 16, mt = 0) => (
    <Text style={[f.h(700), { fontSize: size, marginTop: mt, marginBottom: 7, letterSpacing: -0.1 }]}>{children}</Text>
  );
  const footer = () => (
    <View style={st.foot} fixed>
      <Text style={[f.b(400), { maxWidth: 400 }]}>{t.foot}</Text>
      <Text style={[f.b(600), { color: INK }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
  const runHead = (label: string) => (
    <View style={st.runHead} fixed>
      <Text style={[f.h(700), { fontSize: 10 }]}>{name}<Text style={[f.b(400), { color: MUTE }]}>{`  ·  ${lang === "IS" ? "Andstæðingagreining" : "Opponent scouting"}`}</Text></Text>
      <Text style={[f.b(600), st.kicker]}>{label}</Text>
    </View>
  );
  const aiTag = (label: string) => (
    <View style={[st.row, { alignItems: "center", gap: 6 }]}>
      <Text style={[f.b(700), { backgroundColor: COBALT, color: "#ffffff", fontSize: 8, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, letterSpacing: 0.6 }]}>AI</Text>
      <Text style={[f.b(600), { fontSize: 8.5, letterSpacing: 0.8, color: COBALT }]}>{label}</Text>
    </View>
  );
  const planCard = (title: string, items: string[], icon: "shield" | "arrow") => (
    <View style={[st.card, { flex: 1, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 4 }]}>
      <View style={[st.row, { alignItems: "center", gap: 6, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: "#e6e2d8" }]}>
        <View style={{ width: 8, height: 8, borderRadius: icon === "shield" ? 2 : 4, backgroundColor: icon === "shield" ? INK : COBALT }} />
        <Text style={[f.h(700), { fontSize: 12 }]}>{title}</Text>
      </View>
      {items.map((x, i) => {
        const [lead, detail] = splitLead(x);
        return (
          <View key={i} wrap={false} style={[{ paddingVertical: 4.5 }, i < items.length - 1 ? st.hairRow : {}]}>
            {detail ? (
              <>
                <Text style={[f.b(600), { fontSize: 9, lineHeight: 1.3 }]}>{lead}</Text>
                <Text style={[f.b(400), { fontSize: 8.25, color: MUTE, marginTop: 1, lineHeight: 1.35 }]}>{detail}</Text>
              </>
            ) : (
              <Text style={[f.b(400), { fontSize: 8.5, lineHeight: 1.35 }]}>{lead}</Text>
            )}
          </View>
        );
      })}
    </View>
  );

  // ── Page 2 data prep ──
  const plays = (data.playtypes ?? []).slice(0, 8);
  const playTotal = plays.reduce((s, r) => s + r.att, 0);
  const playShare = (r: ShotType) => r.sharePct ?? (playTotal ? (r.att / playTotal) * 100 : 0);
  const playMax = Math.max(0, ...plays.map(playShare));
  const eff = data.efficiency ?? [];
  const contested = eff.find((r) => r.key === "contestedFg");
  const uncontested = eff.find((r) => r.key === "uncontestedFg");
  const pressTotal = (contested?.att ?? 0) + (uncontested?.att ?? 0);
  const contShare = contested && pressTotal ? (contested.att / pressTotal) * 100 : null;
  const otherEff = eff.filter((r) => r.key !== "contestedFg" && r.key !== "uncontestedFg");
  const regions = data.courtRegions ?? [];
  const regionTotal = regions.reduce((s, r) => s + r.att, 0);
  const lineups = (data.lineups ?? []).slice(0, 6);
  const maxMin = Math.max(0, ...lineups.map((l) => l.minutes ?? 0));
  const hasScore = !!(team || data.fourFactors || regions.length || plays.length || eff.length || lineups.length || data.attack?.length);

  const players = data.players ?? [];
  const top = players.slice(0, 3);
  const rest = players.slice(3, 9);
  const tagsOf = (p: PlayerDetail) => p.tags.map((tg) => TAG_LABELS[tg]?.[lang] ?? tg).join("  ·  ");
  const statLine = (p: PlayerDetail) => `${d1(p.mpg)} MIN  ·  ${d1(p.rpg)} REB  ·  ${d1(p.apg)} AST  ·  ${d1(p.spg)} STL  ·  ${d1(p.topg)} TO`;
  const shootLine = (s: Shooting) => [
    `2P ${pct(s.twoPct)}${s.twoPaPg != null ? ` (${d1(s.twoPaPg)}/g)` : ""}`,
    `3P ${pct(s.threePct)}${s.threePaPg != null ? ` (${d1(s.threePaPg)}/g)` : ""}`,
    `FT ${pct(s.ftPct)}${s.ftaPg != null ? ` (${d1(s.ftaPg)}/g)` : ""}`,
  ].join("  ·  ");
  const descr = (p: { descriptor?: { en: string; is: string } }) => (p.descriptor ? clean(lang === "IS" ? p.descriptor.is : p.descriptor.en) : "");
  const clipsOf = (name: string): ClipLite[] => (data.clipsByPlayer?.[name] ?? []);

  const facts = data.howToDefend.slice(0, 3);
  const planDefend = ai?.howToDefend?.length ? ai.howToDefend : [];
  const planAttack = ai?.howToAttack?.length ? ai.howToAttack : [];

  return (
    <Document title={`${name} - ${t.sub}`} author="MicroPulse">
      {/* ───────────── Page 1 — Summary & game plan ───────────── */}
      <Page size="A4" style={st.page}>
        <View style={[st.row, { justifyContent: "space-between", alignItems: "center", marginBottom: 12 }]}>
          <Text style={[f.b(600), st.kicker]}>{t.kicker}{data.source === "kki" ? " · KKI" : " · INSTAT"}</Text>
          <Text style={[f.h(700), { fontSize: 10 }]}>MicroPulse</Text>
        </View>

        <View style={[st.row, { justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 12, borderBottomWidth: 1.5, borderBottomColor: INK, marginBottom: 14 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[f.h(800), { fontSize: name.length > 18 ? 30 : 40, lineHeight: 1, letterSpacing: -0.8 }]}>{name}</Text>
            <Text style={[f.b(400), { fontSize: 10.5, color: MUTE, marginTop: 7 }]}>{t.sub}{sourceLine ? `  ·  ${data.games ?? ""} ${data.games != null ? t.games : ""} ${sourceLine}` : ""}</Text>
          </View>
          <View style={[st.row, { gap: 5 }]}>
            {data.games != null ? <Text style={[f.b(600), { fontSize: 8.5, borderWidth: 1, borderColor: INK, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }]}>{data.games} {t.games}</Text> : null}
            {small ? <Text style={[f.b(600), { fontSize: 8.5, backgroundColor: AMBER_TINT, color: "#7a4c0c", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }]}>{t.small}</Text> : null}
          </View>
        </View>

        {ai?.headline ? (
          <View style={{ backgroundColor: COBALT_TINT, borderWidth: 1, borderColor: COBALT_EDGE, borderRadius: 10, padding: 12, marginBottom: 10 }} wrap={false}>
            {aiTag(t.ai)}
            <Text style={[f.h(600), { fontSize: 12.5, lineHeight: 1.32, marginTop: 8 }]}>{clean(ai.headline)}</Text>
            <Text style={[f.b(400), { fontSize: 8.5, color: "#444a56", marginTop: 7 }]}>{t.basedOn}</Text>
          </View>
        ) : null}

        {facts.length ? (
          <View style={[st.row, { gap: 9, marginBottom: 10 }]} wrap={false}>
            {facts.map((x, i) => {
              const [lead, detail] = splitLead(lang === "IS" ? x.is : x.en);
              return (
                <View key={i} style={[st.card, { flex: 1, padding: 10 }]}>
                  {x.evidence ? <Text style={[f.h(800), { fontSize: 13, lineHeight: 1.15, letterSpacing: -0.2 }]}>{clean(x.evidence)}</Text> : null}
                  <Text style={[f.b(600), { fontSize: 10, marginTop: x.evidence ? 6 : 0 }]}>{lead}</Text>
                  {detail ? <Text style={[f.b(400), { fontSize: 8.75, color: MUTE, marginTop: 2, lineHeight: 1.4 }]}>{detail}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {planDefend.length || planAttack.length ? (
          <>
            {h2(t.plan)}
            <View style={[st.row, { gap: 9, alignItems: "flex-start" }]}>
              {planDefend.length ? planCard(t.defend, planDefend, "shield") : null}
              {planAttack.length ? planCard(t.attack, planAttack, "arrow") : null}
            </View>
          </>
        ) : null}
        {footer()}
      </Page>

      {/* ───────────── Page 2 — How they score ───────────── */}
      {hasScore ? (
        <Page size="A4" style={[st.page, st.pageRun]}>
          {runHead(t.scoreHead)}

          {team ? (
            <View style={{ marginBottom: 12 }} wrap={false}>
              {h2(<>{t.profile} <Text style={[f.b(400), { fontSize: 9.5, color: MUTE }]}>{`  ${t.perGame}${data.games != null ? `, ${data.games} ${t.games}` : ""}`}</Text></>)}
              <View style={[st.row, { flexWrap: "wrap", gap: 6 }]}>
                {([
                  [lang === "IS" ? "Stig" : "PPG", d1(team.ppg)],
                  ["FG%", pct(team.fgPct)],
                  ["3P%", pct(team.tpPct)],
                  ["3PA", d1(team.tpaPg)],
                  [lang === "IS" ? "Fráköst" : "REB", d1(team.reb)],
                  [lang === "IS" ? "Stoðs." : "AST", d1(team.ast)],
                  [lang === "IS" ? "Tapaðir" : "TOV", d1(team.tov)],
                  [lang === "IS" ? "Heima / Úti" : "Home / Away", `${d1(team.homePpg)} / ${d1(team.awayPpg)}`],
                ] as const).map(([l, v]) => (
                  <View key={l} style={[st.card, { width: "23.9%", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7 }]}>
                    <Text style={[f.b(600), { fontSize: 8, color: MUTE }]}>{l}</Text>
                    <Text style={[f.h(800), { fontSize: 14, marginTop: 2 }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {data.fourFactors ? (
            <View style={{ marginBottom: 12 }} wrap={false}>
              {h2(t.ff, 13)}
              <View style={[st.row, { gap: 6 }]}>
                {([["eFG%", pct(data.fourFactors.efgPct)], ["TO%", pct(data.fourFactors.toPct)], ["OREB%", pct(data.fourFactors.orebPct)], ["FTF", pct(data.fourFactors.ftf)], ["PPP", d1(data.fourFactors.ppp)]] as const).map(([l, v]) => (
                  <View key={l} style={[st.card, { flex: 1, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7 }]}>
                    <Text style={[f.b(600), { fontSize: 8, color: MUTE }]}>{l}</Text>
                    <Text style={[f.h(800), { fontSize: 14, marginTop: 1 }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {plays.length || contested || regions.length ? (
            <View style={[st.card, { padding: 13, marginBottom: 12 }]}>
              {plays.length ? (
                <View wrap={false}>
                  <View style={[st.row, { justifyContent: "space-between", alignItems: "center", marginBottom: 7 }]}>
                    <Text style={[f.h(700), { fontSize: 13 }]}>{t.shotsFrom}</Text>
                    <View style={[st.row, { gap: 10, alignItems: "center" }]}>
                      <View style={[st.row, { gap: 4, alignItems: "center" }]}><View style={{ width: 11, height: 6, borderRadius: 1.5, backgroundColor: COBALT }} /><Text style={[f.b(400), { fontSize: 8, color: MUTE }]}>{t.shareOfShots}</Text></View>
                      {avgFg != null ? <View style={[st.row, { gap: 4, alignItems: "center" }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: INK }} /><Text style={[f.b(400), { fontSize: 8, color: MUTE }]}>{`${t.aboveAvg} (${pct(avgFg)})`}</Text></View> : null}
                    </View>
                  </View>
                  <View style={[st.row, { paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: INK }]}>
                    <Text style={[f.b(600), { width: 118, fontSize: 8, color: MUTE }]}>{t.playType}</Text>
                    <Text style={[f.b(600), { flex: 1, fontSize: 8, color: MUTE }]}>{t.shareOfShots}</Text>
                    <Text style={[f.b(600), { width: 52, fontSize: 8, color: MUTE, textAlign: "right" }]}>{t.madeAtt}</Text>
                    <Text style={[f.b(600), { width: 56, fontSize: 8, color: MUTE, textAlign: "right" }]}>FG%</Text>
                  </View>
                  {plays.map((r, i) => {
                    const share = playShare(r);
                    const above = avgFg != null && r.pct != null && r.pct > avgFg;
                    return (
                      <View key={r.key} style={[st.row, { alignItems: "center", paddingVertical: 4.5 }, i < plays.length - 1 ? st.hairRow : {}]}>
                        <Text style={[f.b(600), { width: 118, fontSize: 9 }]}>{clean(shotLabel(r.key, lang))}</Text>
                        <View style={[st.row, { flex: 1, alignItems: "center", gap: 6, paddingRight: 8 }]}>
                          <View style={{ flex: 1, height: 7, backgroundColor: TRACK, borderRadius: 2 }}>
                            <View style={{ width: barW(share, playMax), height: 7, backgroundColor: COBALT, borderRadius: 2 }} />
                          </View>
                          <Text style={[f.b(400), { width: 30, fontSize: 8, color: MUTE, textAlign: "right" }]}>{`${Math.round(share * 10) / 10}%`}</Text>
                        </View>
                        <Text style={[f.b(400), { width: 52, fontSize: 9, color: MUTE, textAlign: "right" }]}>{r.made}-{r.att}</Text>
                        <View style={[st.row, { width: 56, justifyContent: "flex-end", alignItems: "center", gap: 4 }]}>
                          <View style={above ? { width: 6, height: 6, borderRadius: 3, backgroundColor: INK } : { width: 5, height: 5, borderRadius: 2.5, borderWidth: 0.75, borderColor: "#8a8f96" }} />
                          <Text style={[f.h(700), { fontSize: 9.5 }]}>{r.pct != null ? `${r.pct}%` : "-"}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {contested && contShare != null ? (
                <View style={[st.row, { marginTop: plays.length ? 11 : 0, alignItems: "flex-start" }]} wrap={false}>
                  <Text style={[f.b(600), { width: 118, fontSize: 9, paddingTop: 3 }]}>{t.pressure}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={[st.row, { height: 17, borderRadius: 3, overflow: "hidden" }]}>
                      <View style={{ width: `${contShare}%`, backgroundColor: INK, justifyContent: "center", paddingLeft: 6 }}>
                        <Text style={[f.b(600), { fontSize: 8, color: "#ffffff" }]}>{`${t.contested} ${Math.round(contShare * 10) / 10}%  ·  ${contested.made}-${contested.att}  ·  ${contested.pct ?? "-"}%`}</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: COBALT_EDGE }} />
                    </View>
                    <Text style={[f.b(400), { fontSize: 8.25, color: MUTE, marginTop: 3 }]}>
                      {uncontested ? `${t.uncontested} ${Math.round((100 - contShare) * 10) / 10}%  ·  ${uncontested.made}-${uncontested.att}  ·  ${uncontested.pct ?? "-"}%.  ` : ""}{t.pressureNote}
                    </Text>
                  </View>
                </View>
              ) : null}

              {regions.length ? (
                <View style={{ marginTop: plays.length || contested ? 11 : 0 }} wrap={false}>
                  <Text style={[f.h(700), { fontSize: 11, marginBottom: 4 }]}>{t.zones}</Text>
                  {regions.map((r) => (
                    <View key={r.key} style={[st.row, { alignItems: "center", paddingVertical: 3.5 }, st.hairRow]}>
                      <Text style={[f.b(600), { width: 118, fontSize: 9 }]}>{regionLabel(r.key, lang)}</Text>
                      <View style={{ flex: 1, height: 7, backgroundColor: TRACK, borderRadius: 2, marginRight: 8 }}>
                        <View style={{ width: barW(r.att, regionTotal), height: 7, backgroundColor: COBALT, borderRadius: 2 }} />
                      </View>
                      <Text style={[f.b(400), { width: 52, fontSize: 9, color: MUTE, textAlign: "right" }]}>{r.made}-{r.att}</Text>
                      <Text style={[f.h(700), { width: 56, fontSize: 9.5, textAlign: "right" }]}>{r.pct != null ? `${r.pct}%` : "-"}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {otherEff.length ? (
            <View style={[st.card, { padding: 13, marginBottom: 12 }]} wrap={false}>
              <Text style={[f.h(700), { fontSize: 11, marginBottom: 4 }]}>{t.otherEff}</Text>
              {otherEff.map((r, i) => (
                <View key={r.key} style={[st.row, { paddingVertical: 3.5 }, i < otherEff.length - 1 ? st.hairRow : {}]}>
                  <Text style={[f.b(600), { flex: 1, fontSize: 9 }]}>{clean(shotLabel(r.key, lang))}</Text>
                  <Text style={[f.b(400), { width: 52, fontSize: 9, color: MUTE, textAlign: "right" }]}>{r.made}-{r.att}</Text>
                  <Text style={[f.h(700), { width: 56, fontSize: 9.5, textAlign: "right" }]}>{r.pct != null ? `${r.pct}%` : "-"}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {lineups.length ? (
            <View style={{ marginBottom: 12 }}>
              <View wrap={false} minPresenceAhead={60}>
                {h2(t.lineups, 14)}
                <Text style={[f.b(400), { fontSize: 8.5, color: MUTE, marginTop: -4, marginBottom: 6 }]}>{t.lineupsHint}</Text>
              </View>
              <View style={[st.card, { paddingHorizontal: 13, paddingVertical: 2 }]}>
                {lineups.map((l, i) => {
                  const pm = l.plusMinus == null ? "-" : `${l.plusMinus > 0 ? "+" : ""}${l.plusMinus.toFixed(1)}`;
                  return (
                    <View key={i} wrap={false} style={[st.row, { alignItems: "center", paddingVertical: 6 }, i < lineups.length - 1 ? st.hairRow : {}]}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[f.b(600), { fontSize: 9 }]}>{clean(l.members.join("  ·  "))}</Text>
                        <Text style={[f.b(400), { fontSize: 8.25, color: MUTE, marginTop: 1 }]}>{d1(l.points)} PTS  ·  {pct(l.fgPct)} FG</Text>
                      </View>
                      <View style={[st.row, { width: 72, alignItems: "center", gap: 4 }]}>
                        <View style={{ flex: 1, height: 4.5, backgroundColor: TRACK, borderRadius: 2 }}>
                          <View style={{ width: barW(l.minutes ?? 0, maxMin), height: 4.5, backgroundColor: INK, borderRadius: 2 }} />
                        </View>
                        <Text style={[f.b(400), { width: 28, fontSize: 8, color: MUTE, textAlign: "right" }]}>{d1(l.minutes)}m</Text>
                      </View>
                      <Text style={[f.h(800), { width: 44, fontSize: 11, textAlign: "right" }]}>{pm}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {data.attack && data.attack.length ? (
            <View>
              <View wrap={false} minPresenceAhead={60}>
                {h2(t.attackBoard, 14)}
                <Text style={[f.b(400), { fontSize: 8.5, color: MUTE, marginTop: -4, marginBottom: 6 }]}>{t.attackHint}</Text>
              </View>
              <View style={[st.card, { paddingHorizontal: 13, paddingVertical: 2 }]}>
                {data.attack.slice(0, 8).map((a, i, arr) => (
                  <View key={a.key} wrap={false} style={[st.row, { paddingVertical: 5 }, i < arr.length - 1 ? st.hairRow : {}]}>
                    <Text style={[f.b(400), { flex: 1, fontSize: 9 }]}>{clean(shotLabel(a.key, lang))}  ·  <Text style={f.b(600)}>{clean(a.defender)}</Text></Text>
                    <Text style={[f.h(700), { width: 100, fontSize: 9.5, textAlign: "right", color: COBALT }]}>{a.oppPct}%  <Text style={[f.b(400), { color: MUTE, fontSize: 8.5 }]}>({d1(a.att)}/g)</Text></Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {footer()}
        </Page>
      ) : null}

      {/* ───────────── Page 3 — Players ───────────── */}
      {players.length || data.keyPlayers.length ? (
        <Page size="A4" style={[st.page, st.pageRun]}>
          {runHead(t.playersHead)}
          {players.length ? (
            <>
              <View style={[st.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
                {h2(t.bigThree)}
                <View style={[st.row, { gap: 4, alignItems: "center" }]}>
                  <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: AMBER_LBL }} />
                  <Text style={[f.b(400), { fontSize: 8.5, color: MUTE }]}>{t.defendingLegend}</Text>
                </View>
              </View>
              {top.map((p, i) => {
                const off = p.notes?.offense ?? [];
                const def = p.notes?.defense ?? [];
                const clips = clipsOf(p.name);
                return (
                  <React.Fragment key={i}>
                  <View wrap={false} style={[st.card, st.row, { paddingHorizontal: 13, paddingVertical: 9, marginBottom: clips.length ? 0 : 6, ...(clips.length ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}) }]}>
                    <View style={{ flex: 1.15, paddingRight: 12 }}>
                      <View style={[st.row, { justifyContent: "space-between", alignItems: "flex-start", gap: 8 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[f.h(800), { fontSize: 13.5 }]}>{clean(p.name)}</Text>
                          {p.tags.length ? <Text style={[f.b(600), { fontSize: 8.25, color: COBALT, marginTop: 1 }]}>{tagsOf(p)}</Text> : null}
                        </View>
                        <Text style={[f.h(800), { fontSize: 20, lineHeight: 1, letterSpacing: -0.4 }]}>{d1(p.ppg)}<Text style={[f.b(600), { fontSize: 8, color: MUTE, letterSpacing: 0 }]}> PPG</Text></Text>
                      </View>
                      <Text style={[f.b(400), { fontSize: 8.25, color: MUTE, marginTop: 4 }]}>{statLine(p)}</Text>
                      <Text style={[f.b(600), { fontSize: 8.75, marginTop: 5 }]}>{shootLine(p.shooting)}</Text>
                      {descr(p) ? <Text style={[f.b(400), { fontSize: 9, marginTop: 4, lineHeight: 1.4 }]}>{descr(p)}</Text> : null}
                    </View>
                    {off.length || def.length ? (
                      <View style={{ flex: 1, paddingLeft: 11, borderLeftWidth: 1, borderLeftColor: "#e6e2d8", gap: 6 }}>
                        {off.length ? (
                          <View>
                            <Text style={[f.b(700), { fontSize: 7.75, letterSpacing: 0.7, color: MUTE }]}>{t.tendencies}</Text>
                            <Text style={[f.b(400), { fontSize: 8.5, lineHeight: 1.4, marginTop: 1.5 }]}>{clean(off.join("  ·  "))}</Text>
                          </View>
                        ) : null}
                        {def.length ? (
                          <View>
                            <Text style={[f.b(700), { fontSize: 7.75, letterSpacing: 0.7, color: AMBER_LBL }]}>{t.whenDefending}</Text>
                            <Text style={[f.b(400), { fontSize: 8.5, lineHeight: 1.4, marginTop: 1.5, color: AMBER_TXT }]}>{clean(def.join("  ·  "))}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                  {clips.length ? <ClipsStrip clips={clips} lang={lang} f={f} /> : null}
                  </React.Fragment>
                );
              })}

              {rest.length ? (
                <>
                  {h2(t.rolePlayers, 13, 6)}
                  <View style={[st.row, { flexWrap: "wrap", gap: 7 }]}>
                    {rest.map((p, i) => {
                      // Role players: the two most telling lines each, so the page holds.
                      const off = (p.notes?.offense ?? []).slice(0, 2);
                      const def = (p.notes?.defense ?? []).slice(0, 2);
                      return (
                        <View key={i} wrap={false} style={[st.card, { width: "49.3%", paddingHorizontal: 11, paddingVertical: 9, gap: 3 }]}>
                          <View style={[st.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
                            <Text style={[f.h(800), { fontSize: 11, flex: 1, paddingRight: 6 }]}>{clean(p.name)}</Text>
                            <Text style={[f.h(800), { fontSize: 13 }]}>{d1(p.ppg)}<Text style={[f.b(600), { fontSize: 8, color: MUTE }]}> PPG</Text></Text>
                          </View>
                          <Text style={[f.b(400), { fontSize: 8, color: MUTE }]}>{statLine(p)}</Text>
                          <Text style={[f.b(600), { fontSize: 8.25 }]}>{shootLine(p.shooting)}</Text>
                          {off.length || descr(p) ? <Text style={[f.b(400), { fontSize: 8.5, lineHeight: 1.4 }]}>{off.length ? clean(off.join("  ·  ")) : descr(p)}</Text> : null}
                          {def.length ? <Text style={[f.b(400), { fontSize: 8.5, lineHeight: 1.4, color: AMBER_TXT, paddingTop: 3, borderTopWidth: 1, borderTopColor: HAIR }]}>{clean(def.join("  ·  "))}</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <>
              {h2(t.keyPlayers)}
              {data.keyPlayers.slice(0, 8).map((p, i) => (
                <View key={i} wrap={false} style={[st.card, { paddingHorizontal: 13, paddingVertical: 9, marginBottom: 6 }]}>
                  <View style={[st.row, { justifyContent: "space-between", alignItems: "baseline" }]}>
                    <Text style={[f.h(800), { fontSize: 12 }]}>{clean(p.name)}</Text>
                    <Text style={[f.h(800), { fontSize: 13 }]}>{d1(p.ppg)}<Text style={[f.b(600), { fontSize: 8, color: MUTE }]}> PPG</Text></Text>
                  </View>
                  <Text style={[f.b(400), { fontSize: 8.5, color: MUTE, marginTop: 2 }]}>{d1(p.rpg)} REB  ·  {d1(p.apg)} AST  ·  {pct(p.tpPct)} 3P ({d1(p.tpaPg)}/g)</Text>
                  {descr(p) ? <Text style={[f.b(400), { fontSize: 9, marginTop: 3 }]}>{descr(p)}</Text> : null}
                </View>
              ))}
            </>
          )}
          {footer()}
        </Page>
      ) : null}

      {/* ───────────── Set plays — coach-drawn diagrams ───────────── */}
      {data.plays && data.plays.length ? (
        <Page size="A4" style={[st.page, st.pageRun]}>
          {runHead(t.setPlaysHead)}
          {h2(t.setPlays)}
          <Text style={[f.b(400), { fontSize: 8.75, color: MUTE, marginTop: -3, marginBottom: 9, lineHeight: 1.4, maxWidth: 440 }]}>{t.setPlaysHint}</Text>
          <View style={[st.row, { flexWrap: "wrap", gap: 9 }]}>
            {data.plays.map((p, i) => {
              const isDraft = p.source === "ai_draft";
              return (
                <View key={i} wrap={false} style={[st.card, { width: "49.3%", paddingHorizontal: 11, paddingVertical: 9 }]}>
                  <View style={[st.row, { justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[f.h(800), { fontSize: 12, letterSpacing: -0.1 }]}>{clean(p.name)}</Text>
                      <Text style={[f.b(600), { fontSize: 8.5, color: COBALT, marginTop: 1 }]}>{clean(playTypeLabel(p.playType, lang))}</Text>
                    </View>
                    {isDraft ? (
                      <Text style={[f.b(700), { fontSize: 7, backgroundColor: COBALT_TINT, color: COBALT, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, letterSpacing: 0.4 }]}>{t.aiDraft}{p.confidence ? ` · ${clean(p.confidence)}` : ""}</Text>
                    ) : null}
                  </View>
                  <View style={{ backgroundColor: "#ffffff", borderWidth: 1, borderColor: HAIR, borderRadius: 6, padding: 4, alignItems: "center" }}>
                    <PlayDiagramPdf diagram={p.diagram} w={210} />
                  </View>
                </View>
              );
            })}
          </View>
          {footer()}
        </Page>
      ) : null}

      {/* ───────────── Page 4 — Behind the numbers ───────────── */}
      <Page size="A4" style={[st.page, st.pageRun]}>
        {runHead(t.behindHead)}
        {ai?.summary || ai?.strengths?.length || ai?.weaknesses?.length || ai?.keyPlayers?.length ? (
          <View style={[st.card, { paddingHorizontal: 18, paddingVertical: 16, marginBottom: 12 }]}>
            {aiTag(t.fullRead)}
            {ai.summary ? <Text style={[f.b(400), { fontSize: 10, lineHeight: 1.6, marginTop: 10 }]}>{clean(ai.summary)}</Text> : null}
            {ai.strengths?.length || ai.weaknesses?.length ? (
              <View style={[st.row, { gap: 14, marginTop: 12 }]}>
                {([[t.strengths, ai.strengths ?? []], [t.weaknesses, ai.weaknesses ?? []]] as const).filter(([, xs]) => xs.length).map(([lbl, xs]) => (
                  <View key={lbl} style={{ flex: 1 }}>
                    <Text style={[f.h(700), { fontSize: 11, marginBottom: 3 }]}>{lbl}</Text>
                    {xs.map((x, i) => <Text key={i} style={[f.b(400), { fontSize: 9, lineHeight: 1.45, marginBottom: 2 }]}>{`•  ${clean(x)}`}</Text>)}
                  </View>
                ))}
              </View>
            ) : null}
            {ai.keyPlayers?.length ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[f.h(700), { fontSize: 11, marginBottom: 3 }]}>{t.keyPlayers}</Text>
                {ai.keyPlayers.map((k, i) => (
                  <Text key={i} style={[f.b(400), { fontSize: 9, lineHeight: 1.45, marginBottom: 2 }]}><Text style={f.b(600)}>{clean(k.name)}</Text>{`  ${clean(k.note)}`}</Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={[st.row, { gap: 9 }]} wrap={false}>
          <View style={[st.card, { flex: 1, padding: 14 }]}>
            <Text style={[f.h(700), { fontSize: 12, marginBottom: 6 }]}>{t.howToRead}</Text>
            {t.gloss.map(([k, v]) => (
              <Text key={k} style={[f.b(400), { fontSize: 8.75, lineHeight: 1.45, marginBottom: 3 }]}><Text style={f.b(700)}>{k}</Text>{` - ${v}`}</Text>
            ))}
          </View>
          <View style={[st.card, { flex: 1, padding: 14 }]}>
            <Text style={[f.h(700), { fontSize: 12, marginBottom: 6 }]}>{t.source}</Text>
            {([
              [t.data, data.source === "kki" ? "KKI" : "InStat Game Reports", false],
              [t.gamesLbl, data.games != null ? `${data.games}` : "-", false],
              [t.sample, small ? t.sampleSmall : t.sampleOk, small],
              [t.aiRole, ai ? t.aiExplains : t.noAi, false],
            ] as const).map(([k, v, warn], i) => (
              <View key={k} style={[st.row, { justifyContent: "space-between", gap: 8, paddingVertical: 4 }, i < 3 ? st.hairRow : {}]}>
                <Text style={[f.b(400), { fontSize: 8.75, color: MUTE }]}>{k}</Text>
                <Text style={[f.b(600), { fontSize: 8.75, textAlign: "right", color: warn ? "#7a4c0c" : INK }]}>{v}</Text>
              </View>
            ))}
            <Text style={[f.b(400), { fontSize: 8.25, color: MUTE, marginTop: 6, lineHeight: 1.45 }]}>{t.sourceNote}</Text>
          </View>
        </View>
        {footer()}
      </Page>
    </Document>
  );
}

export async function downloadBasketballOpponentPdf(data: BasketballOpponentPdfData, lang: Lang) {
  const blob = await renderPdfBlob(() => <Doc data={data} lang={lang} f={BRAND} />);
  saveBlob(blob, `${fileSafe(data.opponentName) || "opponent"}-scouting.pdf`);
}
