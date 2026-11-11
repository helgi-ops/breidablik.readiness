"use client";

/**
 * PeriodizationHubPdf — the WHOLE hub as one PDF: the plan in one line + the key facts first, then the
 * season macro map, the pre-season ramp / planned volume, the squad demands (baseline by position, by
 * MD-day, the three axes vs the match), the meso blocks, the scheduled plan-ahead block, a per-player
 * individualisation table, and the chosen players' own blocks. Everything the coach sees across the four
 * tabs, in one export.
 *
 * Descriptive planning — it never sets the readiness colour. Numbers are the team's / player's own
 * data; targets are a starting point, not a norm to obey (Little & Buchheit). Rules recommend; the
 * coach decides.
 *
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { DayDrillsSection } from "@/components/coach/DayDrillsPdfSection";
import type { DayDrillRow } from "@/lib/micropulse/dayDrillSheet";
import { teamMatchUnitNote, type MatchAxes, type MatchUnitAbs, type CalendarBlock, type CalType, type CalDay, type MesoPlan, type Bi } from "@/lib/micropulse/periodization/index";
import { BrandPage, Body, Bullets, C, Card, Chip, FactRow, Provenance, Section, StatGrid, TONE, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

export type HubBaselineRow = { label: Bi; players: number; distanceM: number | null; hsrM: number | null; maxKmh: number | null; playerLoad: number | null; accel: number | null; decel: number | null; isTeam: boolean };
/** One MD-relative demand bucket (a phase or a single MD-day) — the season demand split by where the
 *  session sits in the microcycle. relPl = Player Load vs the whole-squad season average (±%). */
export type HubMdRow = { label: Bi; sessions: number; distanceM: number | null; hsrM: number | null; playerLoad: number | null; accel: number | null; decel: number | null; relPl: number | null };
export type HubMdDemand = { phases: HubMdRow[]; days: HubMdRow[] };
export type HubPlayerRow = { name: string; position: string | null; masKmh: number | null; matchUnitLoad: number | null; matchUnitHsr: number | null; matchUnitDistance?: number | null; weeklyPlTarget?: number | null; baselinePl?: number | null; baselineHsr?: number | null; baselineSessions?: number; nNearFull: number; matchUnitConf?: "high" | "medium" | "low" | null; valdCap: number | null; gaps: number };
export type HubBlockRow = { phase: Bi; goal: Bi; goalKey?: string; start: string; end: string; weeks: number; isDeload: boolean; deloadWeekStart?: string | null; tmr: number | null; volumeTargetPct: number | null; flag: Bi | null };
export type HubPlayerBlock = { name: string; position: string | null; note: Bi; block: CalendarBlock };

export type PeriodizationHubPayload = {
  teamName: string; seasonYear: number; generatedAt?: string;
  /** Kinexon (indoor LPS, not Catapult IMA) → relabel the "/ IMA" axis wording.
   *  The directional / stride / RHIE / symmetry chips are already null-gated. */
  isKinexon?: boolean;
  teamUnit: MatchUnitAbs | null;
  /** A full match in Player Load (the near-full unit), named beside the squad value in `teamUnit`. */
  fullMatchPl?: number | null;
  /** Drills + ideas per training day type of the team block (football); omitted → not printed. */
  dayDrills?: DayDrillRow[] | null;
  tier: { label: Bi; loadSource: string; confidence: string } | null;
  phases: Array<{ label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi }>;
  congested: Array<{ weekStart: string; matches: number }>;
  baselines: HubBaselineRow[];
  /** MD-relative demand profile (whole squad) — the season demand split by MD-day (phases + per-day). */
  mdDemand?: HubMdDemand | null;
  teamAxes: MatchAxes | null;
  blocks: HubBlockRow[];
  /** The scheduled block as the demo-format Mon–Sun calendar (rest days, the deload or light week, IMA per
   *  session). Replaces the old MD-list. */
  block: CalendarBlock | null;
  /** The chosen players' individualised blocks (own match unit + this week's VALD trim) — one clean
   *  page each. The coach picks Selected / All / a custom subset; players without a match unit + GKs are
   *  omitted here (kept in the summary table). */
  playerBlocks: HubPlayerBlock[];
  /** Deprecated MD-list block (superseded by `block`, the calendar); accepted but no longer rendered. */
  mesoPlan?: MesoPlan | null;
  players: HubPlayerRow[];
  /** Pre-season week-1 starting load + ramp (team) — the controlled re-entry the pack builds from. */
  preseasonStart?: {
    anchor: string; confidence: string;
    weeks: Array<{ weekIndex: number; multiple: number | null; weeklyLoad: number | null; perSession: number | null; srpe: number | null }>;
    week1Kpi: Array<{ label: Bi; value: number; unit: string; multiple?: number | null }>;
  } | null;
  /** Pre-season weekly-load ramp — starts the week off-season ends (no off-season), ramps toward the
   *  build, with ALL KPI variables per week. */
  weeklyLoad?: {
    startDate: string | null;
    unit: string;
    weeks: Array<{ index: number; mult: number | null; total: number | null }>;
    kpi: Array<{ label: Bi; unit: string; matchValue?: number | null; values: Array<number | null> }>;
  } | null;
  /** Planned KPI volume (in-season week + meso block), match-anchored + per-KPI tapered (team scope). */
  plannedVolume?: {
    weekVolumeMultiple: number;
    matches?: number; weekTotalMultiple?: number;
    weekKpis: Array<{ label: Bi; unit: string; matchValue: number; multiple: number; weeklyValue: number }>;
    headKpis: Array<{ label: Bi; unit: string }>;
    meso: Array<{ weekIndex: number; isDeload: boolean; isLight?: boolean; volMultiple: number; matches?: number; totalMultiple?: number; kpi: Array<{ multiple: number; value: number }> }>;
    mesoTotal: { volMultiple: number; kpi: Array<{ multiple: number; value: number }> };
  } | null;
};


const L = {
  EN: { title: "periodization — full plan", prepared: "Prepared for the coaching staff · MicroPulse", tag: "Recommended from the team's own data — the coach decides and overrides",
    macro: "Season map (macro)", tier: "Data tier", congested: "Congested weeks (2+ matches)", demands: "Squad demands — baseline by position", axes: "Three axes vs the match (whole squad)",
    mdTitle: "Demands by MD-day (whole squad)", mdLead: "The season average blends every day of the week — here the same demand is split by where the session sits vs the match (MD-4/-3 load, MD-1 primer, MD+1 recovery).", mdPhase: "Phase", mdDay: "MD", mdSess: "Sess.", mdPctPl: "% PL", mdFoot: "MD-day = the session's distance from the nearest match · each bucket needs ≥3 sessions · % PL vs the squad season average · match day excluded (training demand).",
    running: "Running (Locomotive) — training UNDER-reaches", mech: "Mechanical / IMA — training OVER-shoots", metric: "Metric", match: "Match", ceil: "Tr. ceiling",
    meso: "Meso blocks", block: "The scheduled block", players: "Players — individualisation", pos: "Pos", mas: "MAS", munit: "Match unit", vald: "VALD cap", gaps: "Gaps", week: "Week", light: "Light week", deload: "Deload", overload: "overload", weekly: "weekly",
    preTitle: "Pre-season start + ramp (team)", preLead: "Week 1 = controlled re-entry (a fraction of a match), ramping to the pre-season build. The match is the unit. PlayerLoad is the weekly column; each KPI below scales by its OWN taper (HSR/sprint accumulate a smaller weekly ×match than distance).", preAnchor: "anchor", preConf: "confidence", preKpi: "Week-1 KPI targets", preKpiWk: "Weekly KPI targets (per week)", preSess: "/session",
    pvTitle: "Planned KPI volume — week + meso (in-season)", pvLead: "Match-anchored: each KPI = match value × its own weekly multiple. HSR/sprint taper harder than distance (Martín-García 2018); the block ramps; any deload or light week shows in the table.", pvLeadHold: "Match-anchored: each KPI = match value × its own weekly multiple. HSR/sprint taper harder than distance (Martín-García 2018); the block holds the standard week; any light week shows in the table.", pvWeekHdr: "Weekly target per KPI", pvMesoHdr: "Meso — ×match per week", pvBlockTotal: "Block total", pvVol: "vol", matches: "matches", pvTotal: "total", pvTotalNote: "a congested week is a HIGHER week (Anderson 2016)", gamesAbbr: "G",
    wlStarts: "starts",
    munitLead: "THE MATCH IS THE UNIT (whole squad) — the running spine + the mechanical / IMA axis every block scales from (present where the feed carries it).",
    dist: "Distance", hsr: "HSR", load: "Player Load", accdec: "Acc + Dec", accB: "Acc B2–3", decB: "Dec B2–3", strideL: "Stride", dirL: "IMA dir", rhieL: "RHIE", symL: "Symmetry", metL: "Met power", fwd: "fwd", lat: "lat", back: "back",
    foot: "Descriptive planning — never sets the readiness colour, never overrides the daily decision. Targets scale from the match unit (a player's own: median of near-full matches; the team's: the average player on a match day, subs included) and each MD day's %-of-match shape; a data-anchored starting point, not a norm to obey (Little & Buchheit). No single \"% of match\" — mechanical over-shoots, HSR/sprint fall short (Figueiredo). Never stack HSR + mechanical the same day. Cites: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021 · Impellizzeri 2020 (ACWR contested)." },
  IS: { title: "tímabilsskipulag — heildaráætlun", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", tag: "Ráðlagt út frá eigin gögnum liðsins — þjálfarinn ákveður og hnekkir",
    macro: "Tímabils-kort (makró)", tier: "Gagnastig", congested: "Þéttar vikur (2+ leikir)", demands: "Kröfur liðs — grunnlína eftir stöðu", axes: "Þrír ásar gagnvart leik (allt liðið)",
    mdTitle: "Kröfur eftir MD-degi (allt liðið)", mdLead: "Árs-meðaltalið blandar saman öllum dögum vikunnar — hér er sama krafan sundurliðuð eftir því hvar æfingin situr gagnvart leiknum (MD-4/-3 álag, MD-1 undirbúningur, MD+1 endurheimt).", mdPhase: "Fasi", mdDay: "MD", mdSess: "Æf.", mdPctPl: "% PL", mdFoot: "MD-dagur = fjarlægð æfingar frá næsta leik · hver flokkur þarf ≥3 æfingar · % PL vs árs-meðaltal liðsins · leikdagur ekki talinn (æfingakrafa).",
    running: "Hlaup (Locomotive) — æfing NÆR EKKI", mech: "Vélrænt / IMA — æfing FER YFIR", metric: "Mæling", match: "Leikur", ceil: "Æf.þak",
    meso: "Mesó lotur", block: "Skipulagða lotan", players: "Leikmenn — einstaklingsmiðun", pos: "Staða", mas: "MAS", munit: "Leikviðmið", vald: "VALD þak", gaps: "Vantar", week: "Vika", light: "Létt vika", deload: "Niðurtröppun", overload: "álag", weekly: "vikumark",
    preTitle: "Undirbúningur — byrjun + stigmögnun (lið)", preLead: "Vika 1 = stýrð endurkoma (brot úr leik), stigmagnast upp að undirbúnings-marki. Leikurinn er einingin. PlayerLoad er vikudálkurinn; hver KPI að neðan skalast með SINNI niðurtröppun (háhraði/sprettur safnast upp í lægra ×leik á viku en vegalengd).", preAnchor: "grunnur", preConf: "vissa", preKpi: "KPI-mörk viku 1", preKpiWk: "KPI-mörk per viku", preSess: "/æfingu",
    pvTitle: "Áætlað KPI-magn — vika + meso (keppnistímabil)", pvLead: "Leik-miðað: hver KPI = leikgildi × sitt vikumargfeldi. Háhraði/sprettur trappast harðar en vegalengd (Martín-García 2018); blokkin stigmagnast; niðurtröppun eða létt vika sést í töflunni.", pvLeadHold: "Leik-miðað: hver KPI = leikgildi × sitt vikumargfeldi. Háhraði/sprettur trappast harðar en vegalengd (Martín-García 2018); blokkin heldur staðalvikunni; létt vika sést í töflunni.", pvWeekHdr: "Vikumark per KPI", pvMesoHdr: "Meso — × leikur per viku", pvBlockTotal: "Blokk alls", pvVol: "rúmmál", matches: "leikir", pvTotal: "alls", pvTotalNote: "þétt vika er ÞYNGRI vika (Anderson 2016)", gamesAbbr: "L",
    wlStarts: "hefst",
    munitLead: "LEIKURINN ER EININGIN (allt liðið) — hlaupa-hryggurinn + vélræni / IMA ásinn sem hver lota skalar frá (þar sem gögnin ná).",
    dist: "Vegalengd", hsr: "Háhraði", load: "Player Load", accdec: "Acc + Dec", accB: "Acc B2–3", decB: "Dec B2–3", strideL: "Skref", dirL: "IMA stefna", rhieL: "RHIE", symL: "Samhverfa", metL: "Efnaafl", fwd: "fram", lat: "hlið", back: "aftur",
    foot: "Lýsandi áætlun — setur aldrei readiness-litinn, hnekkir aldrei daglegu ákvörðuninni. Álagsmörk skala frá leikviðmiði (leikmanns: miðgildi næstum-heilla leikja; liðs: meðalleikmaður á leikdegi, með varamönnum) og %-af-leik lögun hvers MD-dags; gagna-festur upphafspunktur, ekki viðmið til að hlýða (Little & Buchheit). Ekkert eitt „%-af-leik“ — vélrænt fer yfir, háhraði/sprettur ná ekki (Figueiredo). Aldrei stafla háhraða + vélrænu sama dag. Vitnar í: Figueiredo · Owen 2017 · Oliveira 2019 · Teixeira 2021 · Impellizzeri 2020." },
} as const;

const shortDate = (iso: string, lang: Lang) => { try { return new Intl.DateTimeFormat(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };
const km = (m: number | null) => (m == null ? "-" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

const nf = (n: number | null) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
function domDir(d: { fwd: number; back: number; lat: number } | null, is: boolean): string | null {
  if (!d) return null;
  const m = Math.max(d.fwd, d.back, d.lat);
  const w = m === d.fwd ? (is ? "fram" : "fwd") : m === d.lat ? (is ? "hlið" : "lat") : (is ? "aftur" : "back");
  return `${w} ${Math.round(m * 100)}%`;
}
function dayIma(d: CalDay, is: boolean, unitStride: number | null): string {
  const p: string[] = [];
  if (d.accel != null || d.decel != null) p.push(`Acc/Dec ${d.accel ?? "-"}/${d.decel ?? "-"}`);
  if (d.accHiEff != null) p.push(`Acc B2–3 ${d.accHiEff}`);
  if (d.decHiEff != null) p.push(`Dec B2–3 ${d.decHiEff}`);
  // The ceiling marker attaches to the STRIDE value it refers to (built TO match, not beyond), not the dir.
  if (d.stride != null) p.push(`${is ? "Skref" : "Stride"} ${d.stride}${unitStride != null && d.stride >= unitStride && d.type !== "match" ? "†" : ""}`);
  if (d.fr != null) p.push(`${is ? "Löng hlaup á leikhraða (≥18 sek)" : "Long runs at match pace (≥18 s)"} ${d.fr} m`);
  if (d.cod != null) p.push(`${is ? "Stefnubr." : "CoD"} ${d.cod}`);
  const dd = domDir(d.dir, is); if (dd) p.push(`${is ? "stefna" : "dir"}: ${dd}`);
  return p.join("  ·  ");
}

/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");
/** Calendar day-type → kit tone (row tint + label colour; the day-type word is always printed). Shared
 *  vocabulary with the block PDF — one Top-up, MD-1 Activation, no "Restart". */
const CAL_TONE: Record<CalType, Tone | null> = { mechanical: "red", locomotive: "green", mixed: "cobalt", activation: "neutral", topup: "rtp", match: "amber", rest: null };
const small = (extra?: { marginTop?: number; marginBottom?: number }) => [fb(400), { fontSize: 7.75, color: C.mute, lineHeight: 1.4, ...extra }];
const strong = (size = 8.5, color: string = C.ink) => [fb(600), { fontSize: size, color }];

/** The scheduled block as the demo-format Mon–Sun calendar: rest days as dashes, MD+1 top-up / MD+2 off,
 *  the match on its real weekday, the deload or light week, and the per-session IMA line (tier-gated). */
function CalWeeks({ block, lang }: { block: CalendarBlock; lang: Lang }) {
  const is = lang === "IS";
  const bi = (b: Bi) => tx(is ? b.is : b.en);
  const hasMech = block.unit.accHiEff != null || block.unit.stride != null || block.unit.fr != null || block.unit.cod != null || block.unit.accel != null;
  return (
    <>
      {block.weeks.map((w) => (
        <View key={w.index} wrap={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Text style={[fh(700), { fontSize: 10 }]}>{`${is ? "Vika" : "Week"} ${w.index + 1} - ${bi(w.intent)}`}</Text>
              {w.isDeload && !["Light week", "Deload"].includes(w.intent.en) ? <Chip text={w.isLight ? (is ? "Létt vika" : "Light week") : is ? "Niðurtröppun" : "Deload"} tone="amber" /> : null}
            </View>
            <Text style={small()}>{tx(`${is ? "leikur" : "match"} ${bi(w.matchDow)} · ×${w.mult.toFixed(2)}`)}</Text>
          </View>
          <Table
            dense
            size={7.75}
            cols={[{ label: is ? "Dag" : "Day", width: 28 }, { label: "MD", width: 34 }, { label: is ? "Dagsgerð" : "Day-type", flex: 1 }, { label: "DIST", width: 42, align: "right" }, { label: "HSR", width: 36, align: "right" }, { label: "LOAD", width: 38, align: "right", strong: true }]}
            rowTone={(i) => { const d = w.days[i]; return d ? CAL_TONE[d.type] : null; }}
            rows={w.days.map((d) => {
              const tone = CAL_TONE[d.type];
              const col = tone ? TONE[tone].text : C.mute;
              const ima = hasMech && d.type !== "rest" ? dayIma(d, is, block.unit.stride) : "";
              return [
                bi(d.dow),
                <Text key="m" style={[fh(700), { fontSize: 7.25, color: col }]}>{tx(d.md)}</Text>,
                <View key="l">
                  <Text style={strong(8, col)}>{bi(d.label)}</Text>
                  {ima ? <Text style={[fb(400), { fontSize: 6.75, color: C.mute, marginTop: 1 }]}>{tx(ima)}</Text> : null}
                </View>,
                d.dist == null ? "-" : nf(d.dist),
                d.hsr == null ? "-" : nf(d.hsr),
                d.load == null ? "-" : nf(d.load),
              ];
            })}
          />
          {w.capNote ? <Text style={small({ marginTop: 2 })}><Text style={fb(600)}>{`${is ? "Vikuþak" : "Week cap"}: `}</Text>{bi(w.capNote)}</Text> : null}
        </View>
      ))}
      {block.unit.stride != null && <Text style={small({ marginTop: 4 })}>{is ? "† skref við leikþak (byggt AÐ leik) · stefna = leikmanns-undirskrift, hallar eftir dagsgerð (vélrænt/virkjun aftur+hlið, hlaup fram)." : "† stride at match ceiling (built TO match) · dir = the player's signature, tilted by day-type (mechanical/activation back+lateral, locomotive forward)."}</Text>}
    </>
  );
}

function AxisTable({ axis, t, bi }: { axis: MatchAxes["running"]; t: { metric: string; match: string; ceil: string }; bi: (b: Bi) => string }) {
  return (
    <View style={{ marginTop: 3 }}>
      <Table
        cols={[{ label: t.metric, flex: 1 }, { label: t.match, width: 70, align: "right" }, { label: t.ceil, width: 70, align: "right", strong: true }, { label: "%", width: 70, align: "right" }]}
        rows={axis.metrics.map((m) => [bi(m.metric), tx(m.matchValue), tx(m.trainingCeiling), tx(m.band)])}
      />
      {axis.flag ? <Card tone="amber" pad={7} style={{ marginTop: 4 }}><Text style={strong(8, C.amberText)}>{bi(axis.flag)}</Text></Card> : null}
    </View>
  );
}

/** MD-relative demand rows — phases or per-MD-day, same columns. relPl: + = above the season average. */
function MdTable({ rows, head, t, bi }: { rows: HubMdRow[]; head: string; t: { mdSess: string; mdPctPl: string }; bi: (b: Bi) => string }) {
  return (
    <Table
      cols={[{ label: head, flex: 1 }, { label: t.mdSess, width: 36, align: "right" }, { label: "Dist", width: 48, align: "right" }, { label: "HSR", width: 46, align: "right" }, { label: "PL", width: 40, align: "right", strong: true }, { label: t.mdPctPl, width: 46, align: "right" }, { label: "Acc/Dec", width: 56, align: "right" }]}
      rows={rows.map((r) => [
        bi(r.label),
        String(r.sessions),
        km(r.distanceM),
        r.hsrM == null ? "-" : `${Math.round(r.hsrM)}m`,
        r.playerLoad == null ? "-" : String(Math.round(r.playerLoad)),
        <Text key="p" style={strong(8.5, r.relPl == null ? C.mute : r.relPl > 0 ? TONE.red.text : TONE.green.text)}>{r.relPl == null ? "-" : `${r.relPl > 0 ? "+" : ""}${r.relPl}%`}</Text>,
        `${r.accel ?? "-"}/${r.decel ?? "-"}`,
      ])}
    />
  );
}

function HubDoc({ payload, lang }: { payload: PeriodizationHubPayload; lang: Lang }) {
  const is = lang === "IS"; const bi = (b: Bi) => tx(is ? b.is : b.en);
  // Kinexon is indoor LPS, not Catapult IMA — drop the "/ IMA" from the mechanical
  // axis wording (its directional/stride chips are already null-gated out).
  const t = payload.isKinexon
    ? {
        ...L[lang],
        mech: is ? "Vélrænt — æfing FER YFIR" : "Mechanical — training OVER-shoots",
        munitLead: is
          ? "LEIKURINN ER EININGIN (allt liðið) — hlaupa-hryggurinn + vélræni ásinn sem hver lota skalar frá (þar sem gögnin ná)."
          : "THE MATCH IS THE UNIT (whole squad) — the running spine + the mechanical axis every block scales from (present where the feed carries it).",
      }
    : L[lang];
  const { tier, phases, congested, baselines, mdDemand, teamAxes, blocks, block, playerBlocks, players, teamUnit } = payload;
  // #4 — align the detailed block's label/dates/goal to the season-map block that actually contains its start.
  const mapBlock = block ? blocks.find((b) => b.start <= block.startDate && block.startDate < b.end) ?? null : null;
  const nfmt = (n: number | null) => (n == null ? "-" : n.toLocaleString("en-US"));
  const kmv = (m: number | null) => (m == null ? "-" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
  const dom = (u: MatchUnitAbs) => { if (u.dirFwd == null || u.dirBack == null || u.dirLat == null) return null; const m = Math.max(u.dirFwd, u.dirBack, u.dirLat); const w = m === u.dirFwd ? t.fwd : m === u.dirLat ? t.lat : t.back; return `${w} ${Math.round(m * 100)}%`; };
  const unitChips: Array<{ n: string; l: string }> = [];
  const unitNote = teamMatchUnitNote(teamUnit?.load, payload.fullMatchPl);
  if (teamUnit) {
    unitChips.push({ n: kmv(teamUnit.dist), l: t.dist }, { n: kmv(teamUnit.hsr), l: t.hsr }, { n: `${nfmt(teamUnit.load)} AU`, l: t.load }, { n: nfmt(teamUnit.accdec), l: t.accdec });
    if (teamUnit.accHiEff != null) unitChips.push({ n: nfmt(teamUnit.accHiEff), l: t.accB });
    if (teamUnit.decHiEff != null) unitChips.push({ n: nfmt(teamUnit.decHiEff), l: t.decB });
    if (teamUnit.stride != null) unitChips.push({ n: nfmt(teamUnit.stride), l: t.strideL });
    const dd = dom(teamUnit); if (dd) unitChips.push({ n: dd, l: t.dirL });
    if (teamUnit.rhie != null) unitChips.push({ n: nfmt(teamUnit.rhie), l: t.rhieL });
    if (teamUnit.symmetry != null) unitChips.push({ n: `${teamUnit.symmetry}`, l: t.symL });
    if (teamUnit.metPower != null) unitChips.push({ n: `${teamUnit.metPower}`, l: t.metL });
  }
  const blockStart = block ? (mapBlock ? mapBlock.start : block.startDate) : null;
  const blockEnd = block ? (mapBlock ? mapBlock.end : (block.weeks[block.weeks.length - 1]?.weekStart ?? block.startDate)) : null;
  const blockPhase = block ? bi(mapBlock ? mapBlock.phase : block.phase) : null;
  const seasonWeeks = phases.reduce((a, p) => a + p.weeks, 0);
  const seasonMatches = phases.reduce((a, p) => a + p.matches, 0);

  // Layer 0 — a rule-built one-line read of the plan (from the same rows printed below).
  const headline = block
    ? (is ? `Næsta lota: ${blockPhase}, ${shortDate(blockStart!, lang)}–${shortDate(blockEnd!, lang)} (${block.numWeeks} vikur).` : `Next block: ${blockPhase}, ${shortDate(blockStart!, lang)}–${shortDate(blockEnd!, lang)} (${block.numWeeks} weeks).`)
    : (is ? `Tímabilið ${payload.seasonYear}: ${phases.length} fasar, ${seasonWeeks} vikur.` : `Season ${payload.seasonYear}: ${phases.length} phases over ${seasonWeeks} weeks.`);
  const body = [
    phases.map((p) => `${bi(p.label)} (${p.weeks}${is ? "v" : "w"})`).join(" · "),
    mapBlock ? `${is ? "Markmið" : "Goal"}: ${bi(mapBlock.goal)}` : "",
    congested.length ? (is ? `${congested.length} þéttar vikur (2+ leikir).` : `${congested.length} congested week${congested.length === 1 ? "" : "s"} (2+ matches).`) : "",
  ].filter(Boolean).join(" · ");

  return (
    <Document>
      <BrandPage
        doc={is ? "Tímabilsskipulag" : "Periodization"}
        context={payload.teamName}
        kicker={is ? "Tímabilsskipulag" : "Periodization"}
        title={`${payload.teamName} - ${t.title}`}
        subtitle={`${t.prepared}${payload.generatedAt ? ` · ${payload.generatedAt.slice(0, 10)}` : ""} · ${payload.seasonYear}`}
        chips={[{ text: String(payload.seasonYear) }, ...(tier ? [{ text: `${t.tier}: ${bi(tier.label)}`, tone: "cobalt" as const }] : [])]}
        note={is ? "Lýsandi áætlun - setur aldrei readiness-litinn, hnekkir aldrei daglegu ákvörðuninni. Þjálfarinn ákveður." : "Descriptive planning - never sets the readiness colour, never overrides the daily decision. The coach decides."}
      >
        <Verdict tone="neutral" label={tx(t.tag)} headline={tx(headline)} body={tx(body)} />
        <FactRow
          facts={[
            { value: teamUnit?.load != null ? `${nfmt(teamUnit.load)} AU` : "-", label: is ? "Meðalleikmaður á leikdegi (PL)" : "Average player on a match day (PL)", sub: teamUnit ? `${kmv(teamUnit.dist)} · HSR ${kmv(teamUnit.hsr)}` : undefined },
            { value: String(phases.length), label: is ? "Fasar" : "Phases", sub: `${seasonWeeks} ${is ? "vikur" : "weeks"} · ${seasonMatches} ${is ? "leikir" : "matches"}` },
            { value: String(congested.length), label: is ? "Þéttar vikur" : "Congested weeks", sub: is ? "2+ leikir" : "2+ matches", tone: congested.length ? "amber" : undefined },
            { value: String(players.length), label: is ? "Leikmenn" : "Players", sub: playerBlocks.length ? (is ? `${playerBlocks.length} með eigin lotu` : `${playerBlocks.length} with own block`) : undefined },
          ]}
        />

        {/* MACRO */}
        <Section title={t.macro}>
          <Card>
            {tier && <Body>{tx(`${t.tier}: `)}<Text style={fb(600)}>{bi(tier.label)}</Text>{tx(` · ${tier.loadSource === "srpe" ? "sRPE" : tier.loadSource === "gps" ? "GPS" : "-"} · conf ${tier.confidence}`)}</Body>}
            {phases.map((ph, i) => (
              <View key={i} wrap={false} style={{ paddingVertical: 4, borderTopWidth: i === 0 && !tier ? 0 : 1, borderTopColor: C.hair, marginTop: i === 0 && tier ? 4 : 0 }}>
                <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.4 }]}>
                  <Text style={fb(600)}>{bi(ph.label)}</Text>
                  {tx(` (${shortDate(ph.start, lang)}–${shortDate(ph.end, lang)}, ${ph.weeks}w${ph.matches ? `, ${ph.matches} matches` : ""}) - ${bi(ph.rationale)}`)}
                </Text>
              </View>
            ))}
            {congested.length > 0 && <Text style={small({ marginTop: 3 })}>{tx(`${t.congested}: ${congested.map((c) => `${shortDate(c.weekStart, lang)} (${c.matches})`).join(", ")}`)}</Text>}
          </Card>
        </Section>

        {/* PRE-SEASON START + RAMP (team) */}
        {payload.preseasonStart && payload.preseasonStart.weeks.length > 0 && (
          <Section title={`${t.preTitle}${payload.weeklyLoad?.startDate ? ` · ${t.wlStarts} ${shortDate(payload.weeklyLoad.startDate, lang)}` : ""}`} hint={tx(t.preLead)}>
            <Text style={small({ marginBottom: 4 })}>{`${t.preAnchor}: `}<Text style={fb(600)}>{tx(payload.preseasonStart.anchor)}</Text>{` · ${t.preConf}: ${tx(payload.preseasonStart.confidence)}`}</Text>
            <View wrap={false}><Table
              cols={[{ label: t.week, width: 56 }, { label: `×${t.match}`, flex: 1, align: "right" }, { label: `${t.weekly} PL`, width: 80, align: "right", strong: true }, { label: t.preSess, width: 64, align: "right" }, { label: "sRPE AU", width: 70, align: "right" }]}
              rowTone={(i) => (payload.preseasonStart!.weeks[i]?.weekIndex === 1 ? "cobalt" : null)}
              rows={payload.preseasonStart.weeks.map((w) => [`${t.week} ${w.weekIndex}`, w.multiple == null ? "-" : `${w.multiple}×`, w.weeklyLoad == null ? "-" : nf(w.weeklyLoad), w.perSession == null ? "-" : nf(w.perSession), w.srpe == null ? "-" : nf(w.srpe)])}
            /></View>
            {payload.weeklyLoad && payload.weeklyLoad.kpi.length > 0 ? (
              <View style={{ marginTop: 6 }} wrap={false}>
                <Text style={[...strong(8.5), { marginBottom: 3 }]}>{t.preKpiWk}</Text>
                <Table
                  size={8}
                  cols={[{ label: `KPI (×${t.match})`, flex: 1 }, ...payload.weeklyLoad.weeks.map((w) => ({ label: `${is ? "V" : "W"}${w.index}`, width: 36, align: "right" as const }))]}
                  rows={payload.weeklyLoad.kpi.map((k) => [
                    <Text key="k" style={strong(8)}>{bi(k.label)}{k.unit ? <Text style={[fb(400), { color: C.mute }]}>{` (${k.unit})`}</Text> : null}</Text>,
                    ...k.values.map((v) => { const mv = k.matchValue; return v == null ? "-" : (mv != null && mv > 0 ? `×${Math.round((v / mv) * 100) / 100}` : nf(v)); }),
                  ])}
                />
                <Text style={small({ marginTop: 3 })}>{is ? "Hvert gildi = ×leik (vikuálag ÷ einn leikur af þeirri breytu) — háhraðahlaup vegur nærri heildarvegalengd þótt metrarnir séu fáir (training:match)." : "Each value = ×match (weekly ÷ one match of that KPI) — HSR carries a load near total distance despite few metres (training:match)."}</Text>
              </View>
            ) : payload.preseasonStart.week1Kpi.length > 0 ? (
              <Text style={small({ marginTop: 4 })}>{tx(`${t.preKpi}: ${payload.preseasonStart.week1Kpi.map((k) => `${bi(k.label)} ${k.multiple != null ? `×${k.multiple} ` : ""}${nf(k.value)}${k.unit}`).join(" · ")}`)}</Text>
            ) : null}
          </Section>
        )}

        {/* PLANNED KPI VOLUME — in-season week + meso (match-anchored, per-KPI tapered) */}
        {payload.plannedVolume && payload.plannedVolume.weekKpis.length > 0 && (() => {
          const pv = payload.plannedVolume!;
          const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
          const hasTotals = pv.meso.some((w) => w.totalMultiple != null); // per-week game counts supplied
          const blockTotalMultiple = Math.round(pv.meso.reduce((a, w) => a + (w.totalMultiple ?? w.volMultiple), 0) * 100) / 100;
          const kpiCell = (c: { multiple: number; value: number }, i: number, bold = false) => (
            <Text key={i} style={[bold ? fh(700) : fb(400), { fontSize: 8, textAlign: "right" }]}>{`${c.multiple}× `}<Text style={[fb(400), { color: C.mute }]}>{`${fmtK(c.value)}${pv.headKpis[i]?.unit ?? ""}`}</Text></Text>
          );
          return (
            <Section title={t.pvTitle} hint={tx(payload.block?.hold ? t.pvLeadHold : t.pvLead)}>
              <View wrap={false}>
              <Text style={[...strong(8.5), { marginBottom: 2 }]}>{`${t.pvWeekHdr} - ${pv.weekVolumeMultiple}×${t.match} (${t.pvVol})`}</Text>
              {pv.weekTotalMultiple != null && pv.matches != null && (
                <Text style={small({ marginBottom: 3 })}>{`${t.pvVol} ${pv.weekVolumeMultiple}× + ${pv.matches} ${pv.matches === 1 ? t.match : t.matches} = ${pv.weekTotalMultiple}× ${t.pvTotal} · ${t.pvTotalNote}`}</Text>
              )}
              <Table
                cols={[{ label: "KPI", flex: 1 }, { label: t.match, width: 70, align: "right" }, { label: `×${t.match}`, width: 56, align: "right" }, { label: t.week, width: 70, align: "right", strong: true }]}
                rows={pv.weekKpis.map((k) => [bi(k.label), `${fmtK(k.matchValue)}${k.unit}`, `${k.multiple}×`, `${fmtK(k.weeklyValue)}${k.unit}`])}
              />
              </View>
              <View wrap={false}>
              <Text style={[...strong(8.5), { marginTop: 7, marginBottom: 3 }]}>{t.pvMesoHdr}</Text>
              <Table
                size={8}
                cols={[
                  { label: t.week, width: 78 }, { label: `×${t.pvVol}`, width: 44, align: "right" },
                  ...(hasTotals ? [{ label: `×${t.pvTotal}`, width: 56, align: "right" as const }] : []),
                  ...pv.headKpis.map((h) => ({ label: bi(h.label), flex: 1, align: "right" as const })),
                ]}
                rowTone={(i) => (i < pv.meso.length && pv.meso[i].isDeload ? "amber" : i === pv.meso.length ? "neutral" : null)}
                rows={[
                  ...pv.meso.map((w) => [
                    `${t.week} ${w.weekIndex}${w.isDeload ? ` (${w.isLight ? t.light : t.deload})` : ""}`,
                    `${w.volMultiple}×`,
                    ...(hasTotals ? [<Text key="tt" style={[fh(700), { fontSize: 8, textAlign: "right", color: (w.matches ?? 0) >= 2 ? C.amberText : C.ink }]}>{`${w.totalMultiple != null ? `${w.totalMultiple}×` : "-"}${(w.matches ?? 0) > 0 ? ` ${w.matches}${t.gamesAbbr}` : ""}`}</Text>] : []),
                    ...w.kpi.map((c, i) => kpiCell(c, i)),
                  ]),
                  [
                    <Text key="bt" style={[fh(700), { fontSize: 8 }]}>{t.pvBlockTotal}</Text>,
                    <Text key="bv" style={[fh(700), { fontSize: 8, textAlign: "right" }]}>{`${pv.mesoTotal.volMultiple}×`}</Text>,
                    ...(hasTotals ? [<Text key="bm" style={[fh(700), { fontSize: 8, textAlign: "right" }]}>{`${blockTotalMultiple}×`}</Text>] : []),
                    ...pv.mesoTotal.kpi.map((c, i) => kpiCell(c, i, true)),
                  ],
                ]}
              />
              </View>
            </Section>
          );
        })()}

        {/* DEMANDS — baseline by position */}
        <Section title={t.demands}>
          {unitChips.length > 0 && (
            <View style={{ marginBottom: 7 }} wrap={false}>
              <Text style={[fb(600), { fontSize: 8, lineHeight: 1.4, marginBottom: unitNote ? 1 : 4 }]}>{tx(t.munitLead)}</Text>
              {unitNote && <Text style={small({ marginBottom: 4 })}>{tx(is ? unitNote.is : unitNote.en)}</Text>}
              <StatGrid cols={unitChips.length > 8 ? 6 : 4} items={unitChips.map((c) => ({ label: tx(c.l), value: tx(c.n) }))} />
            </View>
          )}
          <Table
            cols={[{ label: t.pos, flex: 1 }, { label: "Dist", width: 50, align: "right" }, { label: "HSR", width: 48, align: "right" }, { label: "Max", width: 40, align: "right" }, { label: "PL", width: 42, align: "right", strong: true }, { label: "Acc/Dec", width: 60, align: "right" }]}
            rowTone={(i) => (baselines[i]?.isTeam ? "neutral" : null)}
            rows={baselines.map((b) => [
              <Text key="l" style={b.isTeam ? strong(8.5) : [fb(400), { fontSize: 8.5 }]}>{`${bi(b.label)} (${b.players})`}</Text>,
              km(b.distanceM), b.hsrM == null ? "-" : `${Math.round(b.hsrM)}m`, b.maxKmh == null ? "-" : String(b.maxKmh), b.playerLoad == null ? "-" : String(Math.round(b.playerLoad)), `${b.accel ?? "-"}/${b.decel ?? "-"}`,
            ])}
          />
        </Section>

        {/* DEMANDS BY MD-DAY (whole squad) — the microcycle shape of the season demand (phases + per-day) */}
        {mdDemand && mdDemand.phases.length > 0 && (
          <Section title={t.mdTitle} hint={tx(t.mdLead)}>
            <View wrap={false}><MdTable rows={mdDemand.phases} head={t.mdPhase} t={t} bi={bi} /></View>
            {mdDemand.days.length > 0 && <View style={{ marginTop: 6 }} wrap={false}><MdTable rows={mdDemand.days} head={t.mdDay} t={t} bi={bi} /></View>}
            <Text style={small({ marginTop: 3 })}>{tx(t.mdFoot)}</Text>
          </Section>
        )}

        {/* THREE AXES (whole squad) */}
        {teamAxes && (
          <Section title={t.axes}>
            {teamAxes.hsrDeficit && <Card tone="amber" pad={7} style={{ marginBottom: 4 }}><Text style={strong(8, C.amberText)}>{bi(teamAxes.hsrDeficit)}</Text></Card>}
            {teamAxes.mechNeglect && <Card tone="amber" pad={7} style={{ marginBottom: 4 }}><Text style={strong(8, C.amberText)}>{bi(teamAxes.mechNeglect)}</Text></Card>}
            <View wrap={false}>
              <Text style={[...strong(9), { marginTop: 4 }]}>{tx(t.running)}</Text>
              <AxisTable axis={teamAxes.running} t={t} bi={bi} />
            </View>
            <View wrap={false}>
              <Text style={[...strong(9), { marginTop: 7 }]}>{tx(t.mech)}</Text>
              <AxisTable axis={teamAxes.mechanical} t={t} bi={bi} />
            </View>
          </Section>
        )}

        {/* MESO BLOCKS */}
        {blocks.length > 0 && (
          <Section title={t.meso}>
            <Table
              cols={[{ label: is ? "Lota" : "Block", flex: 1 }, { label: is ? "Dagsetningar" : "Dates", width: 96 }, { label: "TMr", width: 54, align: "right" }, { label: is ? "Magn" : "Volume", width: 50, align: "right" }, { label: is ? "Athugasemd" : "Note", width: 120 }]}
              rowTone={(i) => (blocks[i]?.isDeload ? "amber" : null)}
              rows={blocks.map((b) => [
                <View key="p"><Text style={strong(8.5)}>{bi(b.phase)}</Text>{b.isDeload ? <Text style={[fb(600), { fontSize: 7, color: C.amberText }]}>{t.deload}</Text> : null}</View>,
                <Text key="d" style={[fb(400), { fontSize: 8, color: C.mute }]}>{`${shortDate(b.start, lang)}–${shortDate(b.end, lang)} · ${b.weeks}w`}</Text>,
                b.tmr != null ? `TMr ${b.tmr}×` : "",
                b.volumeTargetPct != null ? `${b.volumeTargetPct}%` : "",
                <Text key="f" style={[fb(400), { fontSize: 7.5, color: b.isDeload ? C.amberText : C.mute }]}>{b.flag ? bi(b.flag) : ""}</Text>,
              ])}
            />
          </Section>
        )}

        {/* SCHEDULED BLOCK — the demo-format Mon–Sun calendar (rest days, MD+1 top-up / MD+2 off,
            match on its real weekday, deload = last week, IMA per session). Title aligned to the map block. */}
        {block && (
          <Section title={`${t.block} - ${blockPhase}`}>
            <Text style={small()}>{tx(`${shortDate(blockStart!, lang)}–${shortDate(blockEnd!, lang)} · ${block.numWeeks}w · ${block.scopeName === "__team__" ? (is ? "liðið" : "the squad") : block.scopeName}${mapBlock ? ` · ${bi(mapBlock.goal)}` : ""}`)}</Text>
            {block.notes.length > 0 && <View style={{ marginTop: 4 }} wrap={false}><Bullets items={block.notes.slice(0, 3).map((n) => bi(n))} size={8} /></View>}
            {congested.length > 0 && <Text style={small({ marginTop: 2 })}>{is ? "Þéttar vikur (2+ leikir) þjappa lotuna — færri gæðadagar milli leikja." : "Congested weeks (2+ matches) compress the block — fewer quality days between games."}</Text>}
            {block.scopeName === "__team__" && unitNote && <Text style={small({ marginTop: 2 })}>{tx(is ? unitNote.is : unitNote.en)}</Text>}
            <CalWeeks block={block} lang={lang} />
          </Section>
        )}
        {block && <DayDrillsSection rows={payload.dayDrills} lang={lang} />}

        {/* PLAYERS */}
        {/* Keep the title + the table's (fixed, repeating) header from starting alone at a page foot. */}
        {players.length > 0 && <View minPresenceAhead={120} />}
        {players.length > 0 && (
          <Section title={t.players} hint={tx(is ? "Grunnur (nýleg þjálfun, síð. 28 d — hvar leikmaðurinn er NÚNA) → Leik-mark (krafan per leik, þakið) → Vikumark (áætlað vikuálag sem rampað er AÐ)." : "Baseline (recent training, last 28d — where the player is NOW) → Match target (per-match demand, the ceiling) → Week target (planned weekly load ramped TO).")}>
            <Table
              size={8}
              dense
              cols={[
                { label: is ? "Leikmaður" : "Player", flex: 1 }, { label: t.pos, width: 30 },
                { label: is ? "Grunnur /æf (%leik)" : "Baseline /sess (%match)", width: 98, align: "right" },
                { label: is ? "Leik-mark" : "Match target", width: 140, align: "right" },
                { label: is ? "Vika PL" : "Week PL", width: 46, align: "right" }, { label: "MAS", width: 32, align: "right" }, { label: t.gaps, width: 30, align: "right" },
              ]}
              rows={players.map((p) => {
                const gk = /GK|MARK|KEEP/i.test(p.position ?? "");
                const pctM = p.baselinePl != null && p.matchUnitLoad != null && p.matchUnitLoad > 0 ? Math.round((p.baselinePl / p.matchUnitLoad) * 100) : null;
                return [
                  tx(`${p.name}${gk ? (is ? "  (mm)" : "  (GK)") : ""}`),
                  p.position ?? "-",
                  p.baselinePl != null
                    ? <Text key="b" style={[fb(400), { fontSize: 8, textAlign: "right" }]}>{`${nf(p.baselinePl)} PL`}{pctM != null ? <Text style={[fb(600), { color: pctM >= 100 ? TONE.green.text : pctM >= 60 ? C.ink : TONE.amber.text }]}>{` (${pctM}%)`}</Text> : null}</Text>
                    : <Text key="b" style={[fb(400), { fontSize: 8, textAlign: "right", color: C.mute }]}>{is ? "- engin GPS" : "- no GPS"}</Text>,
                  <Text key="m" style={[fb(400), { fontSize: 7.75, textAlign: "right", color: gk ? C.mute : C.ink }]}>{gk ? (is ? "sérlíkan" : "GK model") : (p.matchUnitLoad != null ? `${p.matchUnitLoad} PL · ${p.matchUnitHsr != null ? `${Math.round(p.matchUnitHsr)}m` : ""}${p.matchUnitDistance != null ? ` · ${(p.matchUnitDistance / 1000).toFixed(1)}km` : ""} · n${p.nNearFull}${p.matchUnitConf && p.matchUnitConf !== "high" ? ` (${p.matchUnitConf})` : ""}` : "-")}</Text>,
                  <Text key="w" style={[fh(700), { fontSize: 8, textAlign: "right", color: gk ? C.mute : C.cobalt }]}>{gk ? "-" : (p.weeklyPlTarget != null ? `${nf(p.weeklyPlTarget)}` : "-")}</Text>,
                  p.masKmh != null ? `${p.masKmh}` : "-",
                  <Text key="g" style={[fb(600), { fontSize: 8, textAlign: "right", color: p.gaps > 0 ? TONE.amber.text : TONE.green.text }]}>{String(p.gaps)}</Text>,
                ];
              })}
            />
            <Text style={small({ marginTop: 4 })}>{tx(is ? "Grunnur = meðal-PL per þjálfunaræfingu síðustu 28 daga (%leik = hlutfall af einum leik — grænt ≥100%, gult <60%). Leik-mark = miðgildi PL/HSR/vegalengdar næstum-heilla leikja (n; lítil/miðlungs vissa → vísbending). Vika PL = leik-PL × vikumargfeldi (~2,35× fyrir 1-leiks viku). MAS = loftháða vélin (km/klst). „– engin GPS“ = engin þjálfunar-GPS gögn síð. 28 d." : "Baseline = mean PL per TRAINING session over the last 28 days (%match = share of one match — green ≥100%, amber <60%). Match target = median PL/HSR/distance of near-full matches (n; low/medium confidence → a hint). Week PL = match PL × the weekly multiple (~2.35× for a 1-match week). MAS = the aerobic engine (km/h). \"– no GPS\" = no training GPS in the last 28d.")}</Text>
            <Text style={small({ marginTop: 1 })}>{tx(is ? "„–“ = engin næstum-heilir leikir enn (leikviðmið) eða ekkert VALD-próf (þak) — ekki villa; fyllist eftir því sem gögn safnast. Markmenn (mm) nota sérstakt álagslíkan, ekki útspilara-periodiseringu." : "\"–\" = no near-full matches yet (match unit) or no VALD test (cap) — not a bug; fills in as data accrues. Goalkeepers (GK) use a separate load model, not outfield periodization.")}</Text>
          </Section>
        )}

        <Provenance>{tx(t.foot)}</Provenance>

        {/* PER-PLAYER BLOCKS (appendix) — one clean page per chosen player: own match unit, this week's VALD
            trim applied. A plan, not just a table row. */}
        {playerBlocks.map((pbk, i) => (
          <Section key={i} break title={`${is ? "Einstaklings-lota" : "Individualised block"} - ${pbk.name}${pbk.position ? ` (${pbk.position})` : ""}`} hint={bi(pbk.note)} mt={0}>
            <CalWeeks block={pbk.block} lang={lang} />
          </Section>
        ))}
      </BrandPage>
    </Document>
  );
}

export async function downloadPeriodizationHubPdf(payload: PeriodizationHubPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <HubDoc payload={payload} lang={lang} />);
  saveBlob(blob, `${payload.teamName.replace(/\s+/g, "-")}-periodization-${payload.seasonYear}.pdf`);
}
