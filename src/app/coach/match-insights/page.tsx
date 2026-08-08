"use client";

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import TeamStatsImportPanel from "@/components/coach/TeamStatsImportPanel";
import { downloadSeasonReportPdf } from "@/components/coach/SeasonReportPdf";
import { downloadTeamSeasonArticlePdf, type TeamSeasonArticlePayload } from "@/components/coach/TeamSeasonArticlePdf";
import OwnTeamProfileUpload from "@/components/coach/OwnTeamProfileUpload";
import StatsbombFileGuide from "@/components/coach/StatsbombFileGuide";
import { seasonReportAvailable, seasonReportMissingHint, seasonReportProvenance, seasonReportSourceLabel } from "@/lib/micropulse/seasonReportMeta";

// Article-report metric labels (own-team season report, vs League Average).
const ARTICLE_METRIC: Record<string, { EN: string; IS: string }> = {
  goals: { EN: "Goals", IS: "Mörk" }, goalsConceded: { EN: "Goals conceded", IS: "Mörk á móti" },
  npxg: { EN: "Non-penalty xG", IS: "Vítalaus xG" }, npxgFaced: { EN: "Non-penalty xG faced", IS: "Vítalaus xG á móti" },
  shots: { EN: "Shots", IS: "Skot" }, shotsFaced: { EN: "Shots faced", IS: "Skot á móti" },
  clearShots: { EN: "Clear shots", IS: "Klár færi" },
  openPlayXg: { EN: "Open-play xG", IS: "xG úr opnum leik" }, counterShots: { EN: "Counter-attack shots", IS: "Skot úr skyndisókn" },
  cornerXg: { EN: "Corner xG", IS: "Horna-xG" }, throwInXg: { EN: "Throw-in xG", IS: "Innkasta-xG" },
  passes: { EN: "Passes", IS: "Sendingar" }, passingPct: { EN: "Passing %", IS: "Sendinákvæmni %" },
  deepCompletions: { EN: "Deep completions", IS: "Djúpar sendingar" }, passesInsideBox: { EN: "Passes into box", IS: "Sendingar í teig" },
  passObv: { EN: "Pass OBV", IS: "Sendinga-OBV" }, totalObv: { EN: "Total OBV", IS: "Heildar-OBV" },
  passesInsideBoxConceded: { EN: "Passes into box conceded", IS: "Sendingar í teig á móti" }, oppDeepCompletions: { EN: "Opp deep completions", IS: "Djúpar sendingar á móti" },
  highPressShotsConceded: { EN: "High-press shots conceded", IS: "Skot eftir háa pressu á móti" }, shotObvFaced: { EN: "Shot OBV faced", IS: "Skot-OBV á móti" },
  setPieceXg: { EN: "Set-piece xG", IS: "Fastaleikja-xG" }, setPieceGoalsConceded: { EN: "Set-piece goals conceded", IS: "Fastaleikja-mörk á móti" },
  setPieceXgFaced: { EN: "Set-piece xG faced", IS: "Fastaleikja-xG á móti" },
};
const articleLabel = (k: string, lang: Lang) => (ARTICLE_METRIC[k] ? ARTICLE_METRIC[k][lang] : k);
import { dimByKey } from "@/lib/micropulse/matchMovement/types";
import { EXTENDED_METRIC_LABELS, GPS_LOCOMOTOR_KEYS } from "@/lib/micropulse/matchInsights/extendedMetrics";
import { buildMatchNarrative, summarizeResultCorrelations, summarizeStatMovement, summarizeWinLoss, type NarrativeTone } from "@/lib/micropulse/matchInsights/narrative";
import MatchIntensityHalvesCard from "@/components/coach/MatchIntensityHalvesCard";

type Lang = "EN" | "IS";

// ── Response shapes (loose) ───────────────────────────────────────────────────

type GroupStat = { n: number; mean: number | null; sd: number | null; median: number | null };
type MetricWL = { metric: string; win: GroupStat; loss: GroupStat; cohenD: number | null; deltaPct: number | null };
type WinLoss = { nWin: number; nDraw: number; nLoss: number; confident: boolean; metrics: MetricWL[] };
type WlMatchRow = {
  date: string;
  opponent: string | null;
  result: "W" | "D" | "L" | null;
  values: Record<string, number | null>;
};
type WinLossStats = {
  available: boolean; season: number | null; matches: number;
  dateFrom: string | null; dateTo: string | null;
  nWin: number; nDraw: number; nLoss: number; confident: boolean; metrics: MetricWL[];
  statKeys?: string[]; perMatch?: WlMatchRow[];
  source: string; lastImport: string | null;
};
type Corr = { key: string; r: number; n: number; strength: string; direction: string };
type MatchStatRow = {
  date: string;
  opponent: string | null;
  result: "W" | "D" | "L" | null;
  goals: number | null;
  xgFor: number | null;
  xgAgainst: number | null;
  shots: number | null;
  shotsOnTargetPct: number | null;
  possession: number | null;
  passAccuracyPct: number | null;
  duelsWonPct: number | null;
  recoveries: number | null;
  lossLow: number | null; lossMed: number | null; lossHigh: number | null;
  recLow: number | null; recMed: number | null; recHigh: number | null;
  metrics: Record<string, number | null>;
};
type StatCorr = { key: string; corr: Corr[] };
type PerMatchStats = {
  available: boolean;
  reason?: string;
  matches: number;
  stats: StatCorr[];
  series: MatchStatRow[];
  seriesMetricKeys: string[];
  source: string;
  lastImport: string | null;
};
type SbExtra = { date: string; opponent: string | null; obv: number | null; oppositionObv: number | null; setPieceXg: number | null; setPieceXgAgainst: number | null; pressures: number | null };
type InsightsResp = {
  variant: "ima" | "gps";
  provider?: "statsbomb" | "wyscout";
  providers?: { wyscout: boolean; statsbomb: boolean };
  hasTeamProfile?: boolean;
  statsbombExtras?: SbExtra[] | null;
  counts: { matchesWithLoad: number; gradedMatches: number; playersWithXg: number };
  winLoss: WinLoss;
  resultCorrelations: Corr[];
  seasonXg: { available: boolean; correlations: Corr[] };
  perMatchStats: PerMatchStats;
  winLossStats?: WinLossStats;
};

const FIRST_HALF_LABELS: Record<string, { EN: string; IS: string }> = {
  high: { EN: "High-intensity IMA / min", IS: "Háákefðar IMA / mín" },
  total: { EN: "Total IMA / min", IS: "Heildar IMA / mín" },
  hir: { EN: "High-intensity running / min", IS: "Háákefðar hlaup / mín" },
  pl: { EN: "PlayerLoad / min", IS: "PlayerLoad / mín" },
  dist: { EN: "Total distance / min", IS: "Heildarvegalengd / mín" },
  hsr: { EN: "High-speed running / min", IS: "Háhraðahlaup / mín" },
  sprint: { EN: "Sprint distance / min", IS: "Sprett-vegalengd / mín" },
  maxvel: { EN: "Top speed (km/h)", IS: "Hámarkshraði (km/klst)" },
};
function metricLabel(key: string, lang: Lang): string {
  const fh = FIRST_HALF_LABELS[key];
  if (fh) return fh[lang];
  const ext = EXTENDED_METRIC_LABELS[key];
  if (ext) return lang === "IS" ? ext.is : ext.en;
  const d = dimByKey(key);
  return d ? (lang === "IS" ? d.is : d.en) : key;
}

// Per-match team-stat labels (from the Wyscout Team-Stats export).
const STAT_LABELS: Record<string, { EN: string; IS: string; short: { EN: string; IS: string } }> = {
  xgFor: { EN: "xG (for)", IS: "xG (með)", short: { EN: "xG", IS: "xG" } },
  xgAgainst: { EN: "xG against", IS: "xG á móti", short: { EN: "xGA", IS: "xGÁ" } },
  goals: { EN: "Goals", IS: "Mörk", short: { EN: "G", IS: "M" } },
  shots: { EN: "Shots", IS: "Skot", short: { EN: "Sh", IS: "Sk" } },
  shotsOnTargetPct: { EN: "Shots on target %", IS: "Skot á mark %", short: { EN: "SoT%", IS: "ÁM%" } },
  possession: { EN: "Possession %", IS: "Boltahald %", short: { EN: "Poss%", IS: "Bolti%" } },
  passAccuracyPct: { EN: "Pass accuracy %", IS: "Sendinákvæmni %", short: { EN: "Pass%", IS: "Send%" } },
  duelsWonPct: { EN: "Duels won %", IS: "Návígi unnin %", short: { EN: "Duel%", IS: "Náv%" } },
  recoveries: { EN: "Recoveries", IS: "Boltaendurheimtur", short: { EN: "Rec", IS: "End" } },
  shotsAgainst: { EN: "Shots against", IS: "Skot á móti", short: { EN: "ShA", IS: "SkÁ" } },
  ppda: { EN: "PPDA (pressing)", IS: "PPDA (pressa)", short: { EN: "PPDA", IS: "PPDA" } },
  defDuelsWonPct: { EN: "Defensive duels won %", IS: "Varnarnávígi unnin %", short: { EN: "DefDuel%", IS: "VarnNáv%" } },
  // Passing / Attacking presets.
  smartPasses: { EN: "Line-breaking passes", IS: "Línubrjótandi sendingar", short: { EN: "Line", IS: "Lína" } },
  passesFinalThird: { EN: "Passes to final third", IS: "Sendingar á lokaþriðjung", short: { EN: "Fin⅓", IS: "Lok⅓" } },
  crossAccPct: { EN: "Cross accuracy %", IS: "Fyrirgjafa-nákvæmni %", short: { EN: "Cross%", IS: "Fyrir%" } },
  touchesInBox: { EN: "Touches in box", IS: "Snertingar í teig", short: { EN: "Box", IS: "Teig" } },
  positionalAttacks: { EN: "Positional attacks", IS: "Staðsóknir", short: { EN: "PosAtt", IS: "Staðs" } },
  offensiveDuelsWonPct: { EN: "Offensive duels won %", IS: "Sóknarnávígi unnin %", short: { EN: "OffDuel%", IS: "SóknNáv%" } },
};
function statLabel(key: string, lang: Lang): string {
  return STAT_LABELS[key] ? STAT_LABELS[key][lang] : key;
}
function statShort(key: string, lang: Lang): string {
  return STAT_LABELS[key] ? STAT_LABELS[key].short[lang] : key;
}

// Per-panel plain-language explainability (deterministic — decodes the numbers,
// never an LLM). One always-visible line (what the panel answers) + detailed
// "how to read this" bullets behind a toggle. Bilingual.
type ExplainCopy = { summary: string; how: string[] };
const EXPLAINERS: Record<string, { EN: ExplainCopy; IS: ExplainCopy }> = {
  firstHalf: {
    EN: {
      summary: "How the last match's first half compared with its second half — did the team drop off after the break?",
      how: [
        "Each row is one movement metric, shown per minute so the two halves compare fairly.",
        "H1 → H2 is the first-half value, then the second-half value.",
        "The % is the change between them: amber = a second-half drop (a fade), green = held or rose.",
        "This is the single most recent match; “Per player” breaks the same match down by player.",
        "Context only — it never changes a readiness verdict.",
      ],
    },
    IS: {
      summary: "Hvernig fyrri hálfleikur síðasta leiks var borinn saman við seinni — datt liðið niður eftir hlé?",
      how: [
        "Hver lína er einn hreyfi-mælikvarði, sýndur á mínútu svo hálfleikirnir séu sambærilegir.",
        "H1 → H2 er gildið í fyrri hálfleik, svo í seinni hálfleik.",
        "%-talan er breytingin: gult = fall í seinni hálfleik, grænt = hélst eða jókst.",
        "Þetta er nýjasti leikurinn einn; „Per leikmann“ sundurliðar sama leik eftir leikmönnum.",
        "Aðeins samhengi — breytir aldrei readiness-dómnum.",
      ],
    },
  },
  winLoss: {
    EN: {
      summary: "Whether the team moves differently in wins than in losses.",
      how: [
        "“W” and “L” are the average per-minute value in wins vs in losses.",
        "“(med …)” is the median — the middle match. When it sits far from the average, one or two outlier games are pulling the average; trust the median more there.",
        "d (Cohen's d) is how big the gap is: ~0.2 small, ~0.5 moderate, 0.8+ large.",
        "Green = higher in wins; red = higher in losses.",
        "The “W · L” count (top-right) is the sample; with fewer than ~3 of either it's flagged not-confident.",
        "GPS running metrics (distance, high-speed, sprint, top speed) are always kept in the list.",
        "An association — not proof that moving that way causes results.",
      ],
    },
    IS: {
      summary: "Hvort liðið hreyfir sig öðruvísi í sigrum en í töpum.",
      how: [
        "„S“ og „T“ eru meðalgildið á mínútu í sigrum vs í töpum.",
        "„(miðg …)“ er miðgildið — miðjuleikurinn. Þegar það er langt frá meðaltalinu eru einn eða tveir útlagaleikir að toga meðaltalið; treystu miðgildinu meira þar.",
        "d (Cohen's d) er stærð munarins: ~0,2 lítill, ~0,5 miðlungs, 0,8+ stór.",
        "Grænt = hærra í sigrum; rautt = hærra í töpum.",
        "„S · T“ talan (efst til hægri) er úrtakið; með færri en ~3 af hvoru er það merkt óöruggt.",
        "GPS-hlaupatölur (vegalengd, háhraði, sprettur, hámarkshraði) eru alltaf hafðar með.",
        "Fylgni — ekki sönnun þess að hreyfingin valdi úrslitunum.",
      ],
    },
  },
  winLossStats: {
    EN: {
      summary: "Whether the match stats — chances, shots, pressing, duels — differ in wins versus losses this season.",
      how: [
        "“W” and “L” are the per-match average in wins vs in losses this season.",
        "“(med …)” is the median — the middle match. When it sits far from the average, one or two outlier games (e.g. a 29 PPDA in a deep-block match) are pulling the average; trust the median more there.",
        "d (Cohen's d) is how big the gap is: ~0.2 small, ~0.5 moderate, 0.8+ large.",
        "Green = higher in wins; red = higher in losses. Biggest separators are listed first.",
        "PPDA is a pressing metric: a LOWER number means more intense pressing.",
        "Attacking terms (higher = better): line-breaking passes = risky passes that split the defence; passes to the final third and touches in the box = how often you get the ball into dangerous areas; offensive duels won % = 1v1s won going forward.",
        "xG against and shots against rising in losses points to a defensive story; xG for, line-breaking passes and touches in box point to an attacking one.",
        "An association — not proof that a stat causes the result. Small samples read as tentative.",
      ],
    },
    IS: {
      summary: "Hvort leiktölfræðin — færi, skot, pressa, návígi — er önnur í sigrum en í töpum á þessu tímabili.",
      how: [
        "„S“ og „T“ eru meðaltal per leik í sigrum vs í töpum á þessu tímabili.",
        "„(miðg …)“ er miðgildið — miðjuleikurinn. Þegar það er langt frá meðaltalinu eru einn eða tveir útlagaleikir (t.d. 29 í PPDA í djúpum varnarleik) að toga meðaltalið; treystu miðgildinu meira þar.",
        "d (Cohen's d) er stærð munarins: ~0,2 lítill, ~0,5 miðlungs, 0,8+ stór.",
        "Grænt = hærra í sigrum; rautt = hærra í töpum. Stærstu munirnir eru efst.",
        "PPDA er pressumæling: LÆGRI tala þýðir ákafari pressa.",
        "Sóknar-hugtök (hærra = betra): línubrjótandi sendingar = áhættusamar sendingar sem kljúfa vörnina; sendingar á lokaþriðjung og snertingar í teig = hversu oft þú kemur boltanum á hættusvæði; sóknarnávígi unnin % = einn-á-einn unnin fram á við.",
        "xG á móti og skot á móti sem hækka í töpum benda á varnarsögu; xG með, línubrjótandi sendingar og snertingar í teig á sóknarsögu.",
        "Fylgni — ekki sönnun þess að tölfræðin valdi úrslitum. Lítil úrtök lesast sem vísbending.",
      ],
    },
  },
  correlations: {
    EN: {
      summary: "Which movement metrics rise and fall together with the result, or with season xG.",
      how: [
        "r runs from −1 to +1 — how tightly two numbers track each other; the sign is the direction.",
        "Rough guide: |r| ~0.1 weak, ~0.3 moderate, 0.5+ strong.",
        "n is how many matches (or players, for season xG) sit behind the number.",
        "Below n=10 it shows “small n” — read it as a hint, not a finding.",
        "Association, never causation or prediction.",
      ],
    },
    IS: {
      summary: "Hvaða hreyfi-mælikvarðar hækka og lækka með úrslitunum, eða með season-xG.",
      how: [
        "r er frá −1 til +1 — hversu þétt tvær tölur fylgjast að; formerkið er áttin.",
        "Viðmið: |r| ~0,1 veikt, ~0,3 miðlungs, 0,5+ sterkt.",
        "n er hversu margir leikir (eða leikmenn, fyrir season-xG) liggja að baki.",
        "Undir n=10 birtist „fá sýni“ — lestu sem vísbendingu, ekki niðurstöðu.",
        "Fylgni, aldrei orsök eða spá.",
      ],
    },
  },
  perMatchStats: {
    EN: {
      summary: "Every match's team stats from Wyscout, plus how each tactical stat links to movement.",
      how: [
        "Top block: the strongest movement link for each stat (same r and n rules as above).",
        "Table: one row per match. Shared columns — goals (G), xG, xG-against (xGA), shots (Sh), possession % (Poss%), pass accuracy % (Pass%).",
        "The columns then match the data source: Wyscout shows on-target % (SoT%), duels won % (Duel%), recoveries (Rec) and Losses / Recoveries L/M/H by pitch zone (High = attacking third). StatsBomb has none of those per match, so it shows its own signals instead — OBV (on-ball value), pressures (Press) and set-piece xG for (SP xG). On StatsBomb, Poss% is a proxy (passes share).",
        "Res is the result (W/D/L). The data source and last import date are shown top-right.",
      ],
    },
    IS: {
      summary: "Öll tölfræði hvers leiks úr Wyscout, ásamt því hvernig hver taktísk tala tengist hreyfingu.",
      how: [
        "Efri hluti: sterkasta hreyfi-tengsl hverrar tölu (sömu r- og n-reglur og að ofan).",
        "Tafla: ein lína per leik. Sameiginlegir dálkar — mörk (M), xG, xG á móti (xGÁ), skot (Sk), boltahald % (Bolti%), sendinákvæmni % (Send%).",
        "Dálkarnir fara svo eftir uppruna: Wyscout sýnir á mark % (ÁM%), návígi unnin % (Náv%), endurheimtur (End) og Töp / Endurh. L/M/H eftir svæði (Hátt = sóknarþriðjungur). StatsBomb hefur ekkert af þessu per leik og sýnir sín eigin merki í staðinn — OBV (verðmæti aðgerða), pressur (Pressa) og fastaleikja-xG með (Fast-xG). Í StatsBomb er Bolti% áætlun (hlutfall sendinga).",
        "Úrsl er úrslitin (S/J/T). Uppruni gagna og síðasti innflutningur eru efst til hægri.",
      ],
    },
  },
};

const T = {
  EN: {
    title: "Season Match Analysis",
    purpose: "Read GPS/IMA movement against results and advanced stats: how the last match's first half compared to others, whether movement differs in wins vs losses, and which movement metrics track the result or season xG. Descriptive context — associations, not causation, and it never changes the readiness verdict.",
    reportBtn: "Season report (PDF)",
    reportBusy: "Generating…",
    viewMovement: "Movement (GPS/IMA)", viewSeason: "Team season report",
    seasonHeading: "Team season report", seasonSub: "How the team plays across the season — results, attack, defence, goalkeeping, pressing, wins vs losses — as a downloadable PDF. Separate from the Movement read above (how the team moves). Descriptive context; it never changes the readiness verdict.",
    seasonPdfBtn: "Generate report (PDF)", seasonSourceLine: "Source",
    articleTitle: "Article report — vs League Average", articleSub: "The richer read: a verdict, the facts behind it, strengths / weaknesses and priority fixes over a full metric table benchmarked against the league. Needs your StatsBomb Team Stats export (with the League Average row).", articleBtn: "Article report (PDF)",
    articleNeedsSb: "This report is StatsBomb-only — the league benchmark comes from the StatsBomb Team Stats export (Wyscout has no League Average). Upload it below to enable it.",
    fhTitle: "First half vs second half — last match",
    fhEmpty: "No both-halves match data yet. It appears once a match with both halves is synced.",
    fhMatch: "Match",
    h1: "H1", h2: "H2",
    wlTitle: "Wins vs losses — movement",
    wlStatsTitle: "Wins vs losses — match stats",
    wlStatsNone: "No ingested team stats with results yet for this season.",
    wlStatsSeason: "season",
    med: "med",
    wlByMatch: "Match by match",
    wlLow: "Not enough graded matches yet — enter scores on Fixtures (need ≥3 wins and ≥3 losses for a confident read).",
    wlNone: "No graded matches yet. Enter match scores on the Fixtures page to unlock this.",
    higherInWins: "higher in wins", higherInLosses: "higher in losses",
    morePressWins: "more pressing in wins", morePressLosses: "more pressing in losses",
    corrTitle: "What tracks the result?",
    corrCaveat: "Association, not causation or prediction — a link here is context to explore, not a lever to pull.",
    resultCorr: "Movement ↔ result (W/D/L)",
    xgCorr: "Movement ↔ season xG (per player)",
    perMatchXg: "Per-match team stats × movement",
    statMovement: "Strongest movement links per stat",
    perMatchTable: "Match-by-match",
    thDate: "Date", thOpp: "Opponent", thRes: "Res",
    thLossLmh: "Losses L/M/H", thRecLmh: "Recoveries L/M/H", lmhHint: "by pitch zone (low / medium / high)",
    thObv: "OBV", thPress: "Press", thSpxg: "SP xG",
    thObvHint: "On-Ball Value — value added by on-ball actions (StatsBomb)", thPressHint: "Pressures (StatsBomb)", thSpxgHint: "Set-piece xG for (StatsBomb)", possProxyHint: "possession proxy (passes share)",
    res: { W: "W", D: "D", L: "L" } as Record<string, string>,
    noCorr: "Not enough graded matches for a correlation yet.",
    noXg: "No season xG loaded yet.",
    lowSample: "Small sample — read any strong-looking link as tentative until more matches with data accrue.",
    lowN: "small n",
    matches: "matches", players: "players", win: "W", loss: "L",
    variantGps: "GPS movement",
    variantIma: "IMA movement",
    variantGpsHint: "This team's Catapult data is GPS-only, so the movement metrics here are GPS-based (total distance, high-speed running, sprint distance, top speed) rather than IMA.",
    variantImaHint: "This team captures IMA, so the movement metrics here are IMA-driven, with GPS shown alongside.",
    narrativeTitle: "The read",
    narrativeTag: "Auto-generated from your data",
    fhPlayers: "Per player",
    fhPlayersHide: "Hide players",
    fhNoPlayers: "No per-player data for this match yet.",
  },
  IS: {
    title: "Heilt tímabil",
    purpose: "Lestu GPS/IMA hreyfingu á móti úrslitum og ítarlegri tölfræði: hvernig fyrri hálfleikur síðasta leiks var miðað við aðra, hvort hreyfing er önnur í sigrum vs töpum, og hvaða hreyfi-mælikvarðar fylgja úrslitum eða season-xG. Lýsandi samhengi — fylgni, ekki orsök, og það breytir aldrei readiness-dómnum.",
    reportBtn: "Tímabilsskýrsla (PDF)",
    reportBusy: "Bý til…",
    viewMovement: "Hreyfing (GPS/IMA)", viewSeason: "Tímabilsskýrsla liðs",
    seasonHeading: "Tímabilsskýrsla liðs", seasonSub: "Hvernig liðið spilar yfir tímabilið — úrslit, sókn, vörn, markvarsla, pressa, sigrar vs töp — sem niðurhalanleg PDF. Aðskilið frá Hreyfingar-lestrinum að ofan (hvernig liðið hreyfist). Lýsandi samhengi; breytir aldrei readiness-dómnum.",
    seasonPdfBtn: "Búa til skýrslu (PDF)", seasonSourceLine: "Uppruni",
    articleTitle: "Ítarleg skýrsla — vs deildar-meðaltal", articleSub: "Dýpri lesturinn: dómur, staðreyndirnar á bak við hann, styrkleikar / veikleikar og forgangs-úrbætur ofan á fullri mæli-töflu borinni saman við deildina. Þarf StatsBomb Team Stats útflutninginn þinn (með League Average röðinni).", articleBtn: "Ítarleg skýrsla (PDF)",
    articleNeedsSb: "Þessi skýrsla er StatsBomb-only — deildar-viðmiðið kemur úr StatsBomb Team Stats útflutningnum (Wyscout hefur enga League Average). Hladdu honum upp að neðan til að virkja hana.",
    fhTitle: "Fyrri vs seinni hálfleikur — síðasti leikur",
    fhEmpty: "Engin gögn með báðum hálfleikjum enn. Þau birtast þegar leikur með báðum hálfleikjum er samstilltur.",
    fhMatch: "Leikur",
    h1: "1.h", h2: "2.h",
    wlTitle: "Sigrar vs töp — hreyfing",
    wlStatsTitle: "Sigrar vs töp — leiktölfræði",
    wlStatsNone: "Engin innhlaðin leiktölfræði með úrslitum enn fyrir þetta tímabil.",
    wlStatsSeason: "tímabil",
    med: "miðg",
    wlByMatch: "Leik fyrir leik",
    wlLow: "Ekki nógu margir metnir leikir — skráðu úrslit á Leikjadagatali (þarf ≥3 sigra og ≥3 töp fyrir öruggan lestur).",
    wlNone: "Engir metnir leikir enn. Skráðu úrslit á Leikjadagatals-síðunni til að opna þetta.",
    higherInWins: "hærra í sigrum", higherInLosses: "hærra í töpum",
    morePressWins: "meiri pressa í sigrum", morePressLosses: "meiri pressa í töpum",
    corrTitle: "Hvað fylgir úrslitunum?",
    corrCaveat: "Fylgni, ekki orsök eða spá — tengsl hér eru samhengi til að skoða, ekki stýring til að toga í.",
    resultCorr: "Hreyfing ↔ úrslit (S/J/T)",
    xgCorr: "Hreyfing ↔ season-xG (per leikmann)",
    perMatchXg: "Per-leik tölfræði × hreyfing",
    statMovement: "Sterkustu hreyfi-tengsl per tölfræði",
    perMatchTable: "Leik fyrir leik",
    thDate: "Dags", thOpp: "Andstæðingur", thRes: "Úrsl",
    thLossLmh: "Töp L/M/H", thRecLmh: "Endurh. L/M/H", lmhHint: "eftir svæði (lágt / miðlungs / hátt)",
    thObv: "OBV", thPress: "Pressa", thSpxg: "Fast-xG",
    thObvHint: "On-Ball Value — verðmæti aðgerða á vellinum (StatsBomb)", thPressHint: "Pressur (StatsBomb)", thSpxgHint: "Fastaleikja-xG með (StatsBomb)", possProxyHint: "boltahald áætlað (hlutfall sendinga)",
    res: { W: "S", D: "J", L: "T" } as Record<string, string>,
    noCorr: "Ekki nógu margir metnir leikir fyrir fylgni enn.",
    noXg: "Engin season-xG hlaðin enn.",
    lowSample: "Lítið úrtak — lestu sterk-útlítandi tengsl sem bráðabirgða þar til fleiri leikir með gögnum bætast við.",
    lowN: "fá sýni",
    matches: "leikir", players: "leikmenn", win: "S", loss: "T",
    variantGps: "GPS-hreyfing",
    variantIma: "IMA-hreyfing",
    variantGpsHint: "Catapult-gögn þessa liðs eru GPS-eingöngu, svo hreyfi-mælikvarðarnir hér byggja á GPS (heildarvegalengd, háhraðahlaup, sprett-vegalengd, hámarkshraði) frekar en IMA.",
    variantImaHint: "Þetta lið safnar IMA, svo hreyfi-mælikvarðarnir hér eru IMA-drifnir, með GPS til hliðar.",
    narrativeTitle: "Lesturinn",
    narrativeTag: "Sjálfvirkt út frá þínum gögnum",
    fhPlayers: "Per leikmann",
    fhPlayersHide: "Fela leikmenn",
    fhNoPlayers: "Engin gögn per leikmann fyrir þennan leik enn.",
  },
} as const;

/** Below this many paired observations a correlation is not shown as confident:
 *  the "strong" badge is suppressed and a small-sample note is surfaced. */
const MIN_CONFIDENT_CORR_N = 10;

function fmt(n: number | null, d = 1): string { return n == null ? "—" : n.toFixed(d); }
/** Compact "low/medium/high" cell, e.g. "34/43/47" (an en-dash for a missing part). */
function lmh(a: number | null, b: number | null, c: number | null): string {
  if (a == null && b == null && c == null) return "—";
  const p = (n: number | null) => (n == null ? "–" : String(n));
  return `${p(a)}/${p(b)}/${p(c)}`;
}
function toneMark(tone: NarrativeTone): string {
  return tone === "pos" ? "▲" : tone === "neg" ? "▼" : tone === "caveat" ? "ⓘ" : "•";
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>;
}

/** Computed one-paragraph summary that draws a dense panel together (deterministic,
 *  cited — from the panel's own numbers). Hidden when there's nothing to say. */
function SummaryBox({ text, lang }: { text: string; lang: Lang }) {
  if (!text) return null;
  // The coaching takeaway is marked with "→"; render it on its own emphasised line.
  const idx = text.indexOf("→");
  const main = idx >= 0 ? text.slice(0, idx).trim() : text;
  const coaching = idx >= 0 ? text.slice(idx).trim() : "";
  return (
    <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">{lang === "IS" ? "Samantekt" : "Summary"}</span>
      <p className="mt-0.5 text-[12px] leading-snug text-slate-700">{main}</p>
      {coaching ? <p className="mt-1 text-[12px] font-medium leading-snug text-blue-800">{coaching}</p> : null}
    </div>
  );
}

/** Per-panel plain-language explainer: one visible line + a "how to read this"
 *  toggle that decodes the numbers. Deterministic (static copy), bilingual. */
function PanelExplainer({ id, lang }: { id: string; lang: Lang }) {
  const [open, setOpen] = React.useState(false);
  const e = EXPLAINERS[id]?.[lang];
  if (!e) return null;
  return (
    <div className="mt-1">
      <p className="text-[12px] text-slate-500">{e.summary}</p>
      <button onClick={() => setOpen((v) => !v)} className="mt-0.5 text-[11px] font-medium text-blue-700 hover:underline">
        {open ? (lang === "IS" ? "Fela leiðbeiningar" : "Hide how to read") : (lang === "IS" ? "Hvernig á að lesa þetta" : "How to read this")} {open ? "▲" : "▶"}
      </button>
      {open ? (
        <ul className="mt-1 space-y-1 rounded-md bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-600">
          {e.how.map((h, i) => (
            <li key={i} className="flex gap-1.5"><span className="mt-[1px] text-slate-300">•</span><span>{h}</span></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function MatchInsightsPage() {
  const [langRaw] = useLang();
  const lang: Lang = langRaw === "IS" ? "IS" : "EN";
  const t = T[lang];
  const [ins, setIns] = React.useState<InsightsResp | null>(null);
  const [source, setSource] = React.useState<"wyscout" | "statsbomb" | null>(null); // per-match stats provider (tabs)
  const insProvidersRef = React.useRef<{ wyscout: boolean; statsbomb: boolean } | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [reportBusy, setReportBusy] = React.useState(false);
  const [reportErr, setReportErr] = React.useState<string | null>(null);
  const [articleBusy, setArticleBusy] = React.useState(false);
  const [articleErr, setArticleErr] = React.useState<string | null>(null);
  const [profileUploaded, setProfileUploaded] = React.useState(false);
  const [view, setView] = React.useState<"movement" | "season">("movement");

  // Article-quality own-team season report (vs League Average) — needs the stored
  // StatsBomb Team Stats profile (is_self). Honest error when it isn't uploaded yet.
  async function generateArticleReport() {
    setArticleBusy(true); setArticleErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setArticleErr(lang === "IS" ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/team-season-report", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setArticleErr(json.error ?? "Error"); return; }
      await downloadTeamSeasonArticlePdf(json as TeamSeasonArticlePayload, lang, (k) => articleLabel(k, lang));
    } catch (e) {
      setArticleErr(e instanceof Error ? e.message : "Error");
    } finally { setArticleBusy(false); }
  }

  async function generateSeasonReport(reportSource: "wyscout" | "statsbomb") {
    setReportBusy(true); setReportErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setReportErr(lang === "IS" ? "Ekki innskráð(ur)." : "Not signed in."); return; }
      const res = await fetch("/api/coach/season-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        // Bind the report to the selected provider so the export always matches the
        // on-screen source — never a silent cross-provider fallback.
        body: JSON.stringify({ lang, source: reportSource, resultCorrelations: ins?.resultCorrelations ?? [] }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) { setReportErr(json.error ?? "Error"); return; }
      await downloadSeasonReportPdf({ ...json, source: json.source ?? reportSource }, lang);
    } catch (e) {
      setReportErr(e instanceof Error ? e.message : "Error");
    } finally { setReportBusy(false); }
  }

  React.useEffect(() => {
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) { setLoading(false); return; }
        const h = { Authorization: `Bearer ${token}` };
        const b = await fetch("/api/coach/match-insights", { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        setIns(b);
      } finally { setLoading(false); }
    })();
  }, []);

  // Refetch when the coach switches to a provider that HAS data. Switching to an
  // empty provider needs no fetch — the render shows a "go import" empty state.
  React.useEffect(() => {
    if (source == null) return; // initial load handled above
    const has = insProvidersRef.current ? (source === "statsbomb" ? insProvidersRef.current.statsbomb : insProvidersRef.current.wyscout) : false;
    if (!has) return;
    (async () => {
      const sb = getSupabaseClient();
      const { data: sess } = await sb.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const b = await fetch(`/api/coach/match-insights?source=${source}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (b) setIns(b);
    })();
  }, [source]);

  const wl = ins?.winLoss;
  // Per-match stats provider selected in the tabs (both tabs always shown, so a coach
  // discovers the other source exists). selHasData = does the selected provider have
  // any data — if not, show a "go import" empty state instead of the other provider's.
  const selProvider: "wyscout" | "statsbomb" = source ?? ins?.provider ?? "wyscout";
  const selHasData = ins?.providers ? (selProvider === "statsbomb" ? ins.providers.statsbomb : ins.providers.wyscout) : true;
  React.useEffect(() => { insProvidersRef.current = ins?.providers; }, [ins]);
  // Wins-vs-losses metrics to show: top-6 by effect size, but always keep the GPS
  // locomotor read (distance / HSR / sprint / top speed) so a strong IMA set can't
  // hide the running comparison the coach expects. Sorted by |d|.
  const wlShown = React.useMemo(() => {
    const withD = (wl?.metrics ?? []).filter((m) => m.cohenD != null);
    const keep = new Map(withD.slice(0, 6).map((m) => [m.metric, m]));
    for (const m of withD) if (GPS_LOCOMOTOR_KEYS.includes(m.metric)) keep.set(m.metric, m);
    return [...keep.values()].sort((a, b) => Math.abs(b.cohenD ?? 0) - Math.abs(a.cohenD ?? 0));
  }, [wl]);

  // Wins-vs-losses on the team match stats (this season). Already sorted by |d|
  // upstream; drop metrics without an effect size (a group with < 2 values).
  const wlStats = ins?.winLossStats;
  const wlStatsShown = React.useMemo(
    () => (wlStats?.metrics ?? []).filter((m) => m.cohenD != null),
    [wlStats],
  );

  // Deterministic plain-language read — rules produce the numbers, this only
  // explains them (manifesto). Recomputed when data or language changes.
  const narrative = React.useMemo(() => {
    if (!ins) return null;
    return buildMatchNarrative({
      lang,
      label: (k) => metricLabel(k, lang),
      winLoss: ins.winLoss,
      resultCorrelations: ins.resultCorrelations,
      seasonXg: ins.seasonXg,
      firstHalf: null,
    });
  }, [ins, lang]);

  // Deterministic per-panel summaries drawing together the dense correlation blocks.
  const resultSummary = React.useMemo(() => {
    if (!ins) return "";
    return summarizeResultCorrelations({
      lang, label: (k) => metricLabel(k, lang),
      matches: ins.counts.gradedMatches,
      result: ins.resultCorrelations,
      seasonXg: ins.seasonXg,
    });
  }, [ins, lang]);
  const statsSummary = React.useMemo(() => {
    if (!ins?.perMatchStats.available) return "";
    return summarizeStatMovement({
      lang, statLabel: (k) => statLabel(k, lang), moveLabel: (k) => metricLabel(k, lang),
      matches: ins.perMatchStats.matches, stats: ins.perMatchStats.stats,
    });
  }, [ins, lang]);
  const wlSummary = React.useMemo(() => summarizeWinLoss({ lang, label: (k) => metricLabel(k, lang), winLoss: wl }), [wl, lang]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
          {ins ? (
            <span
              title={ins.variant === "gps" ? t.variantGpsHint : t.variantImaHint}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${ins.variant === "gps" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-700"}`}
            >
              {ins.variant === "gps" ? t.variantGps : t.variantIma}
            </span>
          ) : null}
        </div>
        <PagePurpose en={T.EN.purpose} is={T.IS.purpose} />
      </div>

      {/* View tabs — the two season-wide reads are named by the question they answer, so
          a top-of-page export can never conflate how we MOVE (GPS/IMA) with how we PLAY
          (tactical season report). The PDF export lives inside the season-report view, so
          export always equals on-screen content. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[13px] shadow-sm">
          {(["movement", "season"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 font-semibold ${view === v ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {v === "movement" ? t.viewMovement : t.viewSeason}
            </button>
          ))}
        </div>
      </div>

      {ins ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{lang === "IS" ? "Gögn" : "Data"}</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[13px] shadow-sm">
            {(["statsbomb", "wyscout"] as const).map((p) => {
              const has = p === "statsbomb" ? ins.providers?.statsbomb : ins.providers?.wyscout;
              return (
                <button
                  key={p}
                  onClick={() => setSource(p)}
                  className={`rounded-md px-3 py-1 font-semibold ${selProvider === p ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {p === "statsbomb" ? "StatsBomb" : "Wyscout"}
                  {!has ? <span className={`ml-1 text-[10px] font-normal ${selProvider === p ? "text-blue-100" : "text-slate-400"}`}>{lang === "IS" ? "· engin gögn" : "· no data"}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <TeamStatsImportPanel provider={selProvider} />
      {selProvider === "statsbomb" ? <StatsbombFileGuide /> : null}

      {view === "season" ? (() => {
        // The season report is bound to the selected DATA provider (StatsBomb ↔ Wyscout);
        // gated on that provider having season data so it never exports an empty PDF or a
        // cross-provider fallback. Provenance names the actual source.
        const available = seasonReportAvailable(selProvider, ins?.providers ?? null);
        return (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{t.seasonHeading}</h2>
              <span className="rounded-full border border-[#2740e6]/30 bg-[#eef0fb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{t.narrativeTag}</span>
            </div>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">{t.seasonSub}</p>
            <p className="mt-2 text-[12px] text-slate-500">
              {t.seasonSourceLine}: <span className="font-semibold text-slate-700">{seasonReportProvenance(selProvider, lang)}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={() => generateSeasonReport(selProvider)}
                disabled={reportBusy || !available}
                className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {reportBusy ? t.reportBusy : `${t.seasonPdfBtn} · ${seasonReportSourceLabel(selProvider)}`}
              </button>
              {!available ? <span className="text-[12px] text-slate-500">{seasonReportMissingHint(selProvider, lang)}</span> : null}
            </div>
            {reportErr ? <p className="mt-2 text-[12px] font-medium text-red-700">{reportErr}</p> : null}

            {/* Article-quality report vs League Average (StatsBomb Team Stats profile). */}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold text-slate-900">{t.articleTitle}</h3>
                <span className="rounded-full border border-[#2740e6]/30 bg-[#eef0fb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{t.narrativeTag}</span>
              </div>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">{t.articleSub}</p>
              {(() => {
                const articleAvailable = Boolean(ins?.hasTeamProfile) || profileUploaded;
                return (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        onClick={generateArticleReport}
                        disabled={articleBusy || !articleAvailable}
                        className="rounded-lg bg-[#2740e6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
                      >
                        {articleBusy ? t.reportBusy : t.articleBtn}
                      </button>
                      {!articleAvailable ? <span className="text-[12px] text-slate-500">{t.articleNeedsSb}</span> : null}
                    </div>
                    {articleErr ? <p className="mt-2 text-[12px] font-medium text-red-700">{articleErr}</p> : null}
                    <OwnTeamProfileUpload onImported={() => setProfileUploaded(true)} />
                  </>
                );
              })()}
            </div>
          </div>
        );
      })() : loading ? (
        <div className="text-sm text-slate-400">…</div>
      ) : !selHasData ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <div className="text-sm font-semibold text-slate-700">
            {lang === "IS" ? `Engin ${selProvider === "statsbomb" ? "StatsBomb" : "Wyscout"}-gögn fyrir þetta lið enn.` : `No ${selProvider === "statsbomb" ? "StatsBomb" : "Wyscout"} data for this team yet.`}
          </div>
          <div className="mx-auto mt-1 max-w-md text-[13px] text-slate-500">
            {lang === "IS"
              ? (selProvider === "statsbomb"
                  ? "Flyttu inn StatsBomb IQ „Match Stats\" CSV í „Import\"-reitnum að ofan til að sjá StatsBomb-tölur (xG, OBV, pressa) hér."
                  : "Flyttu inn Wyscout Team → Stats útflutning í „Import\"-reitnum að ofan.")
              : (selProvider === "statsbomb"
                  ? "Import a StatsBomb IQ “Match Stats” CSV in the Import panel above to see StatsBomb numbers (xG, OBV, pressing) here."
                  : "Import a Wyscout Team → Stats export in the Import panel above.")}
          </div>
          {ins?.providers && ((selProvider === "statsbomb" && ins.providers.wyscout) || (selProvider === "wyscout" && ins.providers.statsbomb)) ? (
            <button
              onClick={() => setSource(selProvider === "statsbomb" ? "wyscout" : "statsbomb")}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              {lang === "IS" ? `Sýna ${selProvider === "statsbomb" ? "Wyscout" : "StatsBomb"} á meðan` : `Show ${selProvider === "statsbomb" ? "Wyscout" : "StatsBomb"} instead`}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* ── Panel 0: The read (plain-language narrative) ── */}
          {narrative ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">{t.narrativeTitle}</div>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 ring-1 ring-blue-200">{t.narrativeTag}</span>
              </div>
              <p className="mt-1.5 text-[13px] font-medium text-slate-700">{narrative.headline}</p>
              <ul className="mt-2 space-y-1.5">
                {narrative.points.map((p, i) => (
                  <li key={i} className={`flex gap-2 text-[13px] ${p.tone === "caveat" ? "text-slate-400 italic" : "text-slate-700"}`}>
                    <span aria-hidden className="mt-[3px] text-[11px]">{toneMark(p.tone)}</span>
                    <span>{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ── Season 1st-vs-2nd-half intensity fade (moved from Player Match Movement) ── */}
          <MatchIntensityHalvesCard />

          {/* ── Panel 2: Wins vs losses ── */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">{t.wlTitle}</div>
              {wl ? <div className="text-[11px] text-slate-500">{wl.nWin} {t.win} · {wl.nLoss} {t.loss}</div> : null}
            </div>
            <PanelExplainer id="winLoss" lang={lang} />
            <SummaryBox text={wlSummary} lang={lang} />
            {!wl || (wl.nWin + wl.nLoss) === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500">{t.wlNone}</p>
            ) : (
              <>
                {!wl.confident ? <p className="mt-1 text-[12px] text-amber-700">{t.wlLow}</p> : null}
                <div className="mt-3 space-y-2">
                  {wlShown.map((m) => {
                    const higherWins = (m.cohenD ?? 0) >= 0;
                    return (
                      <div key={m.metric} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
                        <span className="text-slate-700">{metricLabel(m.metric, lang)}</span>
                        <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
                          <span className="text-emerald-700">
                            {t.win} {fmt(m.win.mean, 1)}
                            {m.win.median != null ? <span className="ml-1 text-emerald-600/70">({t.med} {fmt(m.win.median, 1)})</span> : null}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-red-700">
                            {t.loss} {fmt(m.loss.mean, 1)}
                            {m.loss.median != null ? <span className="ml-1 text-red-600/70">({t.med} {fmt(m.loss.median, 1)})</span> : null}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${higherWins ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            d={fmt(m.cohenD, 2)} · {higherWins ? t.higherInWins : t.higherInLosses}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          {/* ── Panel 2b: Wins vs losses — match stats (this season) ── */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">{t.wlStatsTitle}</div>
              {wlStats?.available ? (
                <div className="text-[11px] text-slate-500">
                  {wlStats.season != null ? `${wlStats.season} ${t.wlStatsSeason} · ` : ""}{wlStats.nWin} {t.win} · {wlStats.nLoss} {t.loss}
                </div>
              ) : null}
            </div>
            <PanelExplainer id="winLossStats" lang={lang} />
            {!wlStats?.available || wlStatsShown.length === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500">{t.wlStatsNone}</p>
            ) : (
              <>
                {!wlStats.confident ? <p className="mt-1 text-[12px] text-amber-700">{t.wlLow}</p> : null}
                <div className="mt-3 space-y-2">
                  {wlStatsShown.map((m) => {
                    const higherWins = (m.cohenD ?? 0) >= 0;
                    // PPDA is inverted: a LOWER value = more pressing, so the pressing
                    // read leans opposite the raw number. Colour + label follow pressing.
                    const isPpda = m.metric === "ppda";
                    const leansWins = isPpda ? !higherWins : higherWins;
                    const badgeText = isPpda
                      ? (leansWins ? t.morePressWins : t.morePressLosses)
                      : (higherWins ? t.higherInWins : t.higherInLosses);
                    return (
                      <div key={m.metric} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
                        <span className="text-slate-700">{statLabel(m.metric, lang)}</span>
                        <span className="flex items-baseline gap-2 tabular-nums text-[12px]">
                          <span className="text-emerald-700">
                            {t.win} {fmt(m.win.mean, 1)}
                            {m.win.median != null ? <span className="ml-1 text-emerald-600/70">({t.med} {fmt(m.win.median, 1)})</span> : null}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-red-700">
                            {t.loss} {fmt(m.loss.mean, 1)}
                            {m.loss.median != null ? <span className="ml-1 text-red-600/70">({t.med} {fmt(m.loss.median, 1)})</span> : null}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${leansWins ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            d={fmt(m.cohenD, 2)} · {badgeText}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Match-by-match behind a dropdown so the panel stays short — the same
                    graded matches the means above come from, newest first. */}
                {wlStats.perMatch && wlStats.perMatch.length > 0 ? (
                  <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-blue-700 hover:text-blue-800">
                      <span className="transition-transform group-open:rotate-90">▸</span>
                      {t.wlByMatch} · {wlStats.perMatch.length} {t.matches}
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-[11px] whitespace-nowrap">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="py-1 pr-2 text-left font-medium">{t.thDate}</th>
                            <th className="pr-2 text-left font-medium">{t.thOpp}</th>
                            <th className="px-2 text-center font-medium">{t.thRes}</th>
                            {(wlStats.statKeys ?? []).map((k) => (
                              <th key={k} className="px-2 text-right font-medium">{statShort(k, lang)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wlStats.perMatch.map((r) => (
                            <tr key={r.date} className="border-t border-slate-100">
                              <td className="py-1 pr-2 text-slate-600 tabular-nums">{r.date.slice(5)}</td>
                              <td className="pr-2 text-slate-600">{r.opponent ?? "—"}</td>
                              <td className="px-2 text-center font-semibold">
                                {r.result ? <span className={r.result === "W" ? "text-emerald-700" : r.result === "L" ? "text-red-700" : "text-slate-500"}>{t.res[r.result] ?? r.result}</span> : "—"}
                              </td>
                              {(wlStats.statKeys ?? []).map((k) => (
                                <td key={k} className="px-2 text-right tabular-nums text-slate-700">{fmt(r.values[k], 1)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </Card>

          {/* ── Panel 3: Correlations ── */}
          <Card>
            <div className="text-sm font-semibold text-slate-800">{t.corrTitle}</div>
            <PanelExplainer id="correlations" lang={lang} />
            <SummaryBox text={resultSummary} lang={lang} />

            <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t.resultCorr}</div>
            {ins && ins.resultCorrelations.length > 0 ? (
              <>
                {ins.resultCorrelations.some((c) => c.n < MIN_CONFIDENT_CORR_N) ? <p className="mt-0.5 text-[11px] text-amber-700">{t.lowSample}</p> : null}
                <div className="mt-1.5 space-y-1.5">
                  {ins.resultCorrelations.map((c) => <CorrRow key={c.key} c={c} lang={lang} t={t} />)}
                </div>
              </>
            ) : <p className="mt-1 text-[12px] text-slate-500">{t.noCorr}</p>}

            <div className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t.xgCorr}</div>
            {ins && ins.seasonXg.available ? (
              <>
                {ins.seasonXg.correlations.some((c) => c.n < MIN_CONFIDENT_CORR_N) ? <p className="mt-0.5 text-[11px] text-amber-700">{t.lowSample}</p> : null}
                <div className="mt-1.5 space-y-1.5">
                  {ins.seasonXg.correlations.map((c) => <CorrRow key={c.key} c={c} lang={lang} t={t} />)}
                </div>
              </>
            ) : <p className="mt-1 text-[12px] text-slate-500">{t.noXg}</p>}

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-slate-600">{t.perMatchXg}</div>
                {ins?.perMatchStats.available ? (
                  <span className="text-[10px] text-slate-400">
                    {ins.perMatchStats.source}{ins.perMatchStats.lastImport ? ` · ${ins.perMatchStats.lastImport.slice(0, 10)}` : ""}
                  </span>
                ) : null}
              </div>
              <PanelExplainer id="perMatchStats" lang={lang} />
              {ins?.statsbombExtras && ins.statsbombExtras.length ? (
                <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-[12px]">
                  <span className="font-semibold text-blue-800">StatsBomb</span>
                  <span className="ml-2 text-slate-600">
                    {(() => {
                      const e = ins.statsbombExtras!;
                      const avg = (f: (x: SbExtra) => number | null) => { const v = e.map(f).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
                      const fx = (x: number | null) => (x == null ? "—" : x.toFixed(2));
                      return `OBV ${fx(avg((x) => x.obv))} / ${lang === "IS" ? "á móti" : "against"} ${fx(avg((x) => x.oppositionObv))}  ·  ${lang === "IS" ? "fastaleikja-xG" : "set-piece xG"} ${fx(avg((x) => x.setPieceXg))} / ${fx(avg((x) => x.setPieceXgAgainst))}`;
                    })()}
                  </span>
                </div>
              ) : null}
              {ins?.perMatchStats.available ? <SummaryBox text={statsSummary} lang={lang} /> : null}
              {ins && ins.perMatchStats.available ? (
                <>
                  {ins.perMatchStats.matches < MIN_CONFIDENT_CORR_N ? <p className="mt-1 text-[11px] text-amber-700">{t.lowSample}</p> : null}

                  {/* Strongest movement link per team stat. */}
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.statMovement} · {ins.perMatchStats.matches} {t.matches}</div>
                  <div className="mt-1.5 space-y-2.5">
                    {ins.perMatchStats.stats.map((s) => (
                      <div key={s.key}>
                        <div className="text-[11px] font-medium text-slate-500">{statLabel(s.key, lang)}</div>
                        {s.corr.length > 0 ? (
                          <div className="mt-0.5 space-y-1.5">{s.corr.map((c) => <CorrRow key={`${s.key}-${c.key}`} c={c} lang={lang} t={t} />)}</div>
                        ) : <p className="text-[12px] text-slate-400">{t.noCorr}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Full match-by-match team-stat line — provider-aware columns: StatsBomb
                      has no per-match SoT%/duels/pitch-zone losses, so those Wyscout-only
                      columns are replaced by StatsBomb's real signals (OBV, pressures,
                      set-piece xG) instead of a wall of "—". Shared columns fill for both. */}
                  {ins.perMatchStats.series.length > 0 ? (() => {
                    const sb = selProvider === "statsbomb";
                    const sbExtraByDate = new Map((ins.statsbombExtras ?? []).map((e) => [e.date, e]));
                    return (
                      <>
                        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.perMatchTable}</div>
                        <div className="mt-1 overflow-x-auto">
                          <table className="w-full text-[11px] whitespace-nowrap">
                            <thead>
                              <tr className="text-slate-400">
                                <th className="py-1 pr-2 text-left font-medium">{t.thDate}</th>
                                <th className="pr-2 text-left font-medium">{t.thOpp}</th>
                                <th className="px-2 text-right font-medium">{statShort("goals", lang)}</th>
                                <th className="px-2 text-right font-medium">{statShort("xgFor", lang)}</th>
                                <th className="px-2 text-right font-medium">{statShort("xgAgainst", lang)}</th>
                                <th className="px-2 text-right font-medium">{statShort("shots", lang)}</th>
                                {!sb ? <th className="px-2 text-right font-medium">{statShort("shotsOnTargetPct", lang)}</th> : null}
                                <th className="px-2 text-right font-medium" title={sb ? t.possProxyHint : undefined}>{statShort("possession", lang)}{sb ? "*" : ""}</th>
                                <th className="px-2 text-right font-medium">{statShort("passAccuracyPct", lang)}</th>
                                {sb ? (
                                  <>
                                    <th className="px-2 text-right font-medium" title={t.thObvHint}>{t.thObv}</th>
                                    <th className="px-2 text-right font-medium" title={t.thPressHint}>{t.thPress}</th>
                                    <th className="px-2 text-right font-medium" title={t.thSpxgHint}>{t.thSpxg}</th>
                                  </>
                                ) : (
                                  <>
                                    <th className="px-2 text-right font-medium">{statShort("duelsWonPct", lang)}</th>
                                    <th className="px-2 text-right font-medium">{statShort("recoveries", lang)}</th>
                                    <th className="px-2 text-right font-medium" title={t.lmhHint}>{t.thLossLmh}</th>
                                    <th className="px-2 text-right font-medium" title={t.lmhHint}>{t.thRecLmh}</th>
                                  </>
                                )}
                                <th className="pl-2 text-right font-medium">{t.thRes}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ins.perMatchStats.series.map((s) => {
                                const ex = sbExtraByDate.get(s.date);
                                return (
                                  <tr key={s.date} className="border-t border-slate-100">
                                    <td className="py-1 pr-2 text-slate-600 tabular-nums">{s.date.slice(5)}</td>
                                    <td className="pr-2 text-slate-600">{s.opponent ?? "—"}</td>
                                    <td className="px-2 text-right tabular-nums text-slate-700">{s.goals ?? "—"}</td>
                                    <td className="px-2 text-right tabular-nums font-semibold text-slate-800">{fmt(s.xgFor, 2)}</td>
                                    <td className="px-2 text-right tabular-nums text-slate-500">{fmt(s.xgAgainst, 2)}</td>
                                    <td className="px-2 text-right tabular-nums text-slate-700">{s.shots ?? "—"}</td>
                                    {!sb ? <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.shotsOnTargetPct, 0)}</td> : null}
                                    <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.possession, 0)}</td>
                                    <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.passAccuracyPct, 0)}</td>
                                    {sb ? (
                                      <>
                                        <td className="px-2 text-right tabular-nums text-slate-700">{fmt(ex?.obv ?? null, 2)}</td>
                                        <td className="px-2 text-right tabular-nums text-slate-700">{ex?.pressures ?? "—"}</td>
                                        <td className="px-2 text-right tabular-nums text-slate-700">{fmt(ex?.setPieceXg ?? null, 2)}</td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-2 text-right tabular-nums text-slate-700">{fmt(s.duelsWonPct, 0)}</td>
                                        <td className="px-2 text-right tabular-nums text-slate-700">{s.recoveries ?? "—"}</td>
                                        <td className="px-2 text-right tabular-nums text-slate-500">{lmh(s.lossLow, s.lossMed, s.lossHigh)}</td>
                                        <td className="px-2 text-right tabular-nums text-slate-500">{lmh(s.recLow, s.recMed, s.recHigh)}</td>
                                      </>
                                    )}
                                    <td className="pl-2 text-right font-semibold">
                                      {s.result ? <span className={s.result === "W" ? "text-emerald-700" : s.result === "L" ? "text-red-700" : "text-slate-500"}>{t.res[s.result] ?? s.result}</span> : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })() : null}
                </>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">{ins?.perMatchStats.reason ?? "—"}</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function CorrRow({ c, lang, t }: { c: Corr; lang: Lang; t: (typeof T)[keyof typeof T] }) {
  // Below the confidence floor a correlation can't be trusted (one variable of
  // several will look "strong" by chance), so we suppress the strong badge and
  // flag the small sample instead — the r stays visible but de-emphasised.
  const lowN = c.n < MIN_CONFIDENT_CORR_N;
  const strong = !lowN && Math.abs(c.r) >= 0.4;
  const tone = lowN ? "text-slate-500" : c.direction === "positive" ? "text-emerald-700" : "text-red-700";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-[13px] last:border-0">
      <span className="text-slate-700">{metricLabel(c.key, lang)}</span>
      <span className="flex items-baseline gap-2 tabular-nums">
        <span className={`font-semibold ${tone}`}>r = {c.r.toFixed(2)}</span>
        {lowN ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{t.lowN} · n={c.n}</span>
        ) : (
          <>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${strong ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500"}`}>{c.strength}</span>
            <span className="text-[10px] text-slate-400">n={c.n}</span>
          </>
        )}
      </span>
    </div>
  );
}
