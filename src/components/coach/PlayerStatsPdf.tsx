"use client";

/**
 * PlayerStatsPdf — PDF exports for the two Player Season Analysis views.
 *
 *  - downloadPlayerRoleReportPdf: the StatsBomb single-player read. Layered read
 *    (docs/explainability-first.md): summary first (AI-labelled when AI-written) → 2-3 plain
 *    facts (top strength, main development area, sample) → strengths / development →
 *    the per-90 percentile table.
 *  - downloadPlayerSeasonTablePdf: the Wyscout squad table (landscape; one row per player,
 *    the same season football + physical columns shown on screen).
 *
 * Presentation-only: numbers are rule-computed upstream, prose is AI-phrased + labelled;
 * the caller passes already-localised strings. Styling comes from the shared PDF kit
 * (src/components/pdf/brand.tsx). Descriptive — never the readiness colour or the daily decision.
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, Bar, BrandPage, Bullets, C, Card, Cols, FactRow, Provenance, Section, Table, TONE, Verdict, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";
import type { Col, Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

/** Percentile → tone: top quartile green, bottom quartile red, else cobalt. The number is always printed. */
const pTone = (p: number | null): Tone => (p == null ? "neutral" : p >= 75 ? "green" : p <= 25 ? "red" : "cobalt");

// ── Single-player role report (StatsBomb) ────────────────────────────────────
export type RoleReportPayload = {
  playerName: string;
  role: string | null;              // already-localised role label
  minutes: number | null;
  poolSize: number;
  goalkeeper: boolean;
  aiGenerated: boolean;
  prose: { summary?: string; strengths?: string; development?: string } | null;
  strengths: Array<{ label: string; percentile: number | null }>;
  weaknesses: Array<{ label: string; percentile: number | null }>;
  metrics: Array<{ label: string; category: string; value: number | null; percentile: number | null }>;
  gkNote?: string | null;
};

const RL = {
  EN: { kicker: "PLAYER SEASON ANALYSIS", doc: "Player analysis", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers — cites the data, decides nothing", aiShort: "WRITTEN FROM THE NUMBERS - DECIDES NOTHING", aiChip: "AI-phrased",
    role: "Role", min: "min", of: "vs squad", players: "players",
    summary: "Summary", strengths: "Strengths", development: "Development areas",
    topStrength: "Top strength", topDev: "Main development area", sample: "Minutes played", sampleSub: (n: number) => `ranked vs ${n} squad players`,
    pctOf: (p: number) => `${p}th percentile in the squad`,
    note: "Descriptive context - percentiles vs his own squad (per 90). Rules compute; AI prose is labelled. Never touches readiness.",
    numbers: "Per 90 · percentile vs squad", metric: "Metric", category: "Area", value: "Per 90", pctl: "%ile",
    method: "Descriptive context only — it never changes the readiness colour, load, or the daily decision. Percentiles rank this player within his own squad (per-90); they describe what happened, they do not predict. Low minutes = a small sample.",
    signals: "Signals: StatsBomb per-90 season stats. Rules compute the percentiles; any prose is AI-phrased and coach-overridable." },
  IS: { kicker: "LEIKMANNA-TÍMABILSGREINING", doc: "Leikmannagreining", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum — vitnar í gögnin, ákveður ekkert", aiShort: "SKRIFAÐ ÚR TÖLUNUM - ÁKVEÐUR EKKERT", aiChip: "AI-orðað",
    role: "Hlutverk", min: "mín", of: "vs lið", players: "leikmenn",
    summary: "Samantekt", strengths: "Styrkleikar", development: "Þróunar-svæði",
    topStrength: "Helsti styrkleiki", topDev: "Helsta þróunarsvæði", sample: "Mínútur spilaðar", sampleSub: (n: number) => `raðað vs ${n} leikmenn liðsins`,
    pctOf: (p: number) => `${p}. percentíll í liðinu`,
    note: "Lýsandi samhengi - percentíl vs eigið lið (á 90). Reglur reikna; AI-texti er merktur. Snertir aldrei readiness.",
    numbers: "Á 90 · percentíl vs lið", metric: "Mæling", category: "Svið", value: "Á 90", pctl: "pctl",
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Percentíl raða leikmanni innan síns liðs (á 90); þau lýsa því sem gerðist, þau spá ekki. Fáar mínútur = lítið úrtak.",
    signals: "Uppspretta: StatsBomb á-90 tímabils-tölur. Reglur reikna percentílin; texti er AI-orðaður og þjálfari getur hnekkt." },
} as const;

const fnum = (v: number | null): string => (v == null ? "-" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1));

/** Strengths / development card. Prose is AI when aiGenerated → it carries an inline AI pill. */
function ListCard({ title, tone, prose, ai, items, lang }: { title: string; tone: Tone; prose?: string; ai: boolean; items: Array<{ label: string; percentile: number | null }>; lang: Lang }) {
  return (
    <Card style={{ borderTopWidth: 3, borderTopColor: TONE[tone].fill }}>
      <Text style={[fh(700), { fontSize: 11.5, color: TONE[tone].text, marginBottom: 4 }]}>{title}</Text>
      {prose ? (
        <View style={{ flexDirection: "row", gap: 5, alignItems: "flex-start", marginBottom: 5 }}>
          {ai ? <Text style={[fb(700), { backgroundColor: C.cobalt, color: "#ffffff", fontSize: 6.5, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2, letterSpacing: 0.5, marginTop: 1.5 }]}>AI</Text> : null}
          <Text style={[fb(400), { flex: 1, fontSize: 8.75, lineHeight: 1.45 }]}>{clean(prose)}</Text>
        </View>
      ) : null}
      {items.length ? <Bullets tone={tone} items={items.map((m) => `${m.label}${m.percentile != null ? ` (${m.percentile}${lang === "IS" ? "." : "th"})` : ""}`)} /> : null}
    </Card>
  );
}

function RoleReportDoc({ payload, lang }: { payload: RoleReportPayload; lang: Lang }) {
  const t = RL[lang];
  const sub = [payload.role ? `${t.role}: ${payload.role}` : null, payload.minutes != null ? `${Math.round(payload.minutes)} ${t.min}` : null, `${payload.poolSize} ${t.players} ${t.of}`].filter(Boolean).join(" · ");
  const pr = payload.prose;
  const name = clean(payload.playerName);
  const topS = [...payload.strengths].sort((a, b) => (b.percentile ?? -1) - (a.percentile ?? -1))[0];
  const topW = [...payload.weaknesses].sort((a, b) => (a.percentile ?? 101) - (b.percentile ?? 101))[0];
  const facts: { value: string; label: string; sub?: string; tone?: Tone }[] = [];
  if (topS) facts.push({ value: topS.percentile != null ? String(topS.percentile) : "-", label: `${t.topStrength}: ${clean(topS.label)}`, sub: topS.percentile != null ? t.pctOf(topS.percentile) : undefined, tone: "green" });
  if (topW) facts.push({ value: topW.percentile != null ? String(topW.percentile) : "-", label: `${t.topDev}: ${clean(topW.label)}`, sub: topW.percentile != null ? t.pctOf(topW.percentile) : undefined, tone: "amber" });
  if (payload.minutes != null) facts.push({ value: String(Math.round(payload.minutes)), label: t.sample, sub: t.sampleSub(payload.poolSize) });

  const hasS = !!(pr?.strengths || payload.strengths.length);
  const hasD = !!(pr?.development || payload.weaknesses.length);

  return (
    <Document title={`${name} - ${t.doc}`} author="MicroPulse">
      <BrandPage
        doc={t.doc}
        context={name}
        title={name}
        kicker={t.kicker}
        subtitle={`${sub} · ${t.prepared}`}
        chips={[...(payload.role ? [{ text: payload.role, tone: "cobalt" as Tone }] : []), ...(payload.aiGenerated ? [{ text: t.aiChip, tone: "cobalt" as Tone }] : [])]}
        note={t.note}
      >
        {pr?.summary ? (
          payload.aiGenerated ? (
            <AiBox label={`${t.summary.toUpperCase()} · ${t.aiShort}`} headline={pr.summary} cites={t.ai} />
          ) : (
            <Verdict label={t.summary} headline={pr.summary} />
          )
        ) : payload.gkNote ? (
          <Verdict label={t.summary} headline={payload.gkNote} />
        ) : null}

        {facts.length ? <FactRow facts={facts} /> : null}

        {hasS || hasD ? (
          <View wrap={false} style={{ marginBottom: 10 }}>
            <Cols gap={8}>
              {hasS ? <ListCard title={t.strengths} tone="green" prose={pr?.strengths} ai={payload.aiGenerated} items={payload.strengths} lang={lang} /> : null}
              {hasD ? <ListCard title={t.development} tone="amber" prose={pr?.development} ai={payload.aiGenerated} items={payload.weaknesses} lang={lang} /> : null}
            </Cols>
          </View>
        ) : null}

        {payload.metrics.length ? (
          <Section title={t.numbers}>
            <Table
              dense
              cols={[{ label: t.metric, flex: 1 }, { label: t.category, width: 120 }, { label: t.value, width: 54, align: "right" }, { label: "", width: 90 }, { label: t.pctl, width: 36, align: "right" }]}
              rows={payload.metrics.map((m) => [
                clean(m.label),
                <Text key="c" style={[fb(400), { fontSize: 8.5, color: C.mute }]}>{clean(m.category)}</Text>,
                fnum(m.value),
                <View key="b" style={{ paddingLeft: 10 }}><Bar value={m.percentile ?? 0} max={100} color={TONE[pTone(m.percentile)].fill} height={5} /></View>,
                <Text key="p" style={[fh(700), { fontSize: 8.75, color: m.percentile == null ? C.faint : TONE[pTone(m.percentile)].text, textAlign: "right" }]}>{m.percentile != null ? String(m.percentile) : "-"}</Text>,
              ])}
            />
          </Section>
        ) : null}

        <Provenance>{`${t.method} ${t.signals}`}</Provenance>
      </BrandPage>
    </Document>
  );
}

export async function downloadPlayerRoleReportPdf(payload: RoleReportPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <RoleReportDoc payload={payload} lang={lang} />);
  saveBlob(blob, `player-analysis-${payload.playerName.replace(/\s+/g, "-")}.pdf`);
}

// ── Squad table (Wyscout) ────────────────────────────────────────────────────
export type SeasonTablePayload = {
  title: string;         // already-localised page title
  season: string;
  note: string;          // already-localised provenance line
  headers: string[];     // "Player" is prepended by the renderer
  rows: Array<{ name: string; position: string | null; cells: string[] }>;
};

const STL = {
  EN: { kicker: "PLAYER SEASON ANALYSIS", doc: "Squad season table", note: "Descriptive season output - never changes the readiness colour, load, or the daily decision.", player: "Player", pos: "Pos", season: "Season", players: "players", prepared: "Prepared for the coaching staff · MicroPulse",
    method: "Descriptive season output — it never changes the readiness colour, load, or the daily training decision. Football stats are the imported Wyscout/StatsBomb season totals; the physical columns are the MicroPulse GPS/IMA season output for the same players." },
  IS: { kicker: "LEIKMANNA-TÍMABILSGREINING", doc: "Tímabilstafla liðsins", note: "Lýsandi tímabils-afköst - breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni.", player: "Leikmaður", pos: "Staða", season: "Tímabil", players: "leikmenn", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    method: "Lýsandi tímabils-afköst — breytir aldrei readiness-litnum, álagi né daglegu ákvörðuninni. Fótbolta-tölur eru innfluttar Wyscout/StatsBomb tímabils-heildir; líkamlegu dálkarnir eru MicroPulse GPS/IMA tímabils-afköst sömu leikmanna." },
} as const;

function SeasonTableDoc({ payload, lang }: { payload: SeasonTablePayload; lang: Lang }) {
  const t = STL[lang];
  const n = payload.headers.length;
  const size = n > 14 ? 7.25 : n > 10 ? 7.75 : 8.5;
  // Whole-word wrapping only (no hyphenation), so a column must fit its longest header word
  // and its widest value: share the width in proportion to that (min 4 characters).
  const want = (h: string, j: number) => Math.max(4, ...clean(h).split(/\s+/).map((w) => w.length), ...payload.rows.map((r) => clean(r.cells[j] ?? "").length + 1));
  const cols: Col[] = [{ label: t.player, width: 128 }, { label: t.pos, width: 30 }, ...payload.headers.map((h, j) => ({ label: h, flex: want(h, j), align: "right" as const }))];
  return (
    <Document title={`${clean(payload.title)} - ${payload.season}`} author="MicroPulse">
      <BrandPage
        orientation="landscape"
        doc={t.doc}
        context={`${t.season} ${payload.season}`}
        title={payload.title}
        kicker={t.kicker}
        subtitle={`${t.season} ${payload.season} · ${payload.rows.length} ${t.players} · ${t.prepared}`}
        note={t.note}
      >
        <Table
          dense
          size={size}
          cols={cols}
          rows={payload.rows.map((r) => [
            clean(r.name),
            <Text key="p" style={[fb(400), { fontSize: size, color: C.mute }]}>{clean(r.position ?? "")}</Text>,
            ...r.cells.map((c) => clean(c)),
          ])}
        />
        <Provenance>{payload.note}</Provenance>
        <Provenance>{t.method}</Provenance>
      </BrandPage>
    </Document>
  );
}

export async function downloadPlayerSeasonTablePdf(payload: SeasonTablePayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <SeasonTableDoc payload={payload} lang={lang} />);
  saveBlob(blob, `player-season-table-${payload.season}.pdf`);
}
