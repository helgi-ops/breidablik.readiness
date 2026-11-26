"use client";

/**
 * SeasonReportPdf — a one-team season match-stats report (PDF).
 *
 * Numbers are deterministic aggregates of ingested Wyscout team stats; the prose,
 * when present, is AI-written from those numbers and LABELLED as AI (explainability
 * rules: AI cites real data, invents nothing). Descriptive context only — it never
 * touches the readiness colour. Works for any team with ingested stats.
 *
 * Layered read via the shared PDF kit (src/components/pdf/brand.tsx): the AI summary +
 * bottom line first (in an AI box), then the plain rule-computed facts (record, goal and
 * xG difference), then the key-numbers table, the AI read by area, and the split tables.
 */

import { Document, View } from "@react-pdf/renderer";
import type { SeasonReport, ModelSummary } from "@/lib/micropulse/seasonReport";
import { AiBox, Body, BrandPage, C, Card, Chip, FactRow, KeyValues, Label, Provenance, Section, Table, clean, renderPdfBlob, saveBlob, type Col, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";
type Narrative = Record<string, string> | null;
type Physical = { key: string; r: number; n: number }[] | null;

export type SeasonReportPayload = {
  season: number;
  data: SeasonReport;
  physical: Physical;
  narrative: Narrative;
  aiGenerated: boolean;
  model: string | null;
  source?: "statsbomb" | "wyscout";
  models?: { statsbomb?: ModelSummary; wyscout?: ModelSummary };
};

const L = {
  EN: {
    report: "season report", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers below — cites real data, decides nothing",
    aiShort: "AI-written from the numbers — decides nothing",
    results: "Results", attack: "Attack", defence: "Defence", goalkeeping: "Goalkeeping",
    homeAway: "Home vs away", home: "Home", away: "Away",
    models: "Model comparison — StatsBomb vs Wyscout", modelsNote: "Two independent models, never merged. Where they agree is the robust read; StatsBomb is the more conservative model.",
    pressing: "Pressing & possession", winsLosses: "Wins vs losses", physical: "The physical picture",
    bottomLine: "Bottom line", keyNumbers: "Key numbers", theRead: "The read, area by area", method_h: "How to read this report",
    matches: "Matches (graded)", record: "Record (W-D-L)", points: "Points (per game)",
    gf: "Goals for / against (per match)", gd: "Goal difference (per match)",
    xg: "xG for / against (per match)", xgd: "xG difference (per match)",
    shots: "Shots for / against", poss: "Possession", ppda: "Pressing (PPDA · lower = more)",
    defduel: "Defensive duels won", finishing: "Finishing (goals − xG)", saved: "Goals saved (xG conceded − conceded)",
    inWins: "In wins", inLosses: "In losses", xgAg: "xG against", shAg: "Shots against", xgFor: "xG for",
    tracks: "Movement vs result (Pearson r, n matches)", metric: "Metric",
    matchesWord: "matches", pts: "pts", perMatch: "per match", chancesNote: "chances created minus conceded",
    method: "Descriptive context only — it never changes the readiness colour or the daily decision. Figures are per-match aggregates of ingested Wyscout team stats for the season shown; results are the entered fixture score where present, else derived from Wyscout goals. Goalkeeping “goals saved” and “finishing” are over/under-performance vs expected goals and tend to regress over time. xG and PPDA are models with uncertainty; a season with few losses is a small sample in which single games pull the averages. Association, not causation or prediction.",
    foot: "Descriptive context only — never changes the readiness colour or the daily decision.",
    lowSample: "Small sample — few losses this season, so the wins-vs-losses split is tentative.",
  },
  IS: {
    report: "tímabilsskýrsla", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum að neðan — vitnar í raunveruleg gögn, ákveður ekkert",
    aiShort: "AI skrifaði úr tölunum — ákveður ekkert",
    results: "Úrslit", attack: "Sókn", defence: "Vörn", goalkeeping: "Markvarsla",
    homeAway: "Heima vs úti", home: "Heima", away: "Úti",
    models: "Samanburður líkana — StatsBomb vs Wyscout", modelsNote: "Tvö sjálfstæð líkön, aldrei sameinuð. Þar sem þau eru sammála er traustasti lesturinn; StatsBomb er íhaldssamara líkanið.",
    pressing: "Pressa & boltahald", winsLosses: "Sigrar vs töp", physical: "Líkamlega myndin",
    bottomLine: "Niðurstaða", keyNumbers: "Lykiltölur", theRead: "Lesturinn, svið fyrir svið", method_h: "Hvernig á að lesa skýrsluna",
    matches: "Leikir (metnir)", record: "Skor (S-J-T)", points: "Stig (á leik)",
    gf: "Mörk með / á móti (á leik)", gd: "Markamunur (á leik)",
    xg: "xG með / á móti (á leik)", xgd: "xG munur (á leik)",
    shots: "Skot með / á móti", poss: "Boltahald", ppda: "Pressa (PPDA · lægra = meiri)",
    defduel: "Varnarnávígi unnin", finishing: "Klárun (mörk − xG)", saved: "Mörk varin (xG á móti − á móti)",
    inWins: "Í sigrum", inLosses: "Í töpum", xgAg: "xG á móti", shAg: "Skot á móti", xgFor: "xG með",
    tracks: "Hreyfing og úrslit (Pearson r, n leikir)", metric: "Mæling",
    matchesWord: "leikir", pts: "stig", perMatch: "á leik", chancesNote: "færi sköpuð mínus færi fengin á sig",
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum né daglegu ákvörðuninni. Tölur eru meðaltöl per leik úr innfluttri Wyscout-liðstölfræði fyrir sýnt tímabil; úrslit eru skráð leikjastig þar sem þau eru til, annars leidd af Wyscout-mörkum. „Mörk varin“ og „klárun“ eru yfir/undir-frammistaða vs væntanleg mörk og leita til baka með tímanum. xG og PPDA eru líkön með óvissu; tímabil með fáum töpum er lítið úrtak þar sem einstakir leikir toga í meðaltölin. Fylgni, ekki orsök eða spá.",
    foot: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum né daglegu ákvörðuninni.",
    lowSample: "Lítið úrtak — fá töp á tímabilinu, svo sigrar-vs-töp lesturinn er vísbending.",
  },
} as const;

const PHYS_LABEL: Record<string, { EN: string; IS: string }> = {
  totalDistPerMin: { EN: "Distance / min", IS: "Vegalengd / mín" },
  hsrPerMin: { EN: "High-speed running / min", IS: "Háhraðahlaup / mín" },
  sprintPerMin: { EN: "Sprint distance / min", IS: "Sprettir / mín" },
  topSpeed: { EN: "Top speed", IS: "Hámarkshraði" },
  hmldPerMin: { EN: "High metabolic-load / min", IS: "Hátt efnaskiptaálag / mín" },
  highDecelPerMin: { EN: "Braking (decel) / min", IS: "Hemlun / mín" },
  highCodPerMin: { EN: "High change-of-direction / min", IS: "Stefnubreytingar / mín" },
  // Legacy key: now = strides in continuous runs ≥24 s (ima_fr_ge24; was band 8 / ≥27 s before Nov 2026) — sustained running, not sprints.
  sprintStridesPerMin: { EN: "Strides in longest runs (24 s+) / min", IS: "Skref í lengstu hlaupum (24+ sek) / mín" },
  jumpsPerMin: { EN: "Jumps / min", IS: "Stökk / mín" },
};

const n1 = (v: number | null | undefined, d = 2) => (v == null ? "-" : v.toFixed(d));
const sign = (v: number | null | undefined, d = 2) => (v == null ? "-" : (v >= 0 ? "+" : "") + v.toFixed(d));
/** + / − tone for a "difference" fact; neutral when missing or ~0. */
const diffTone = (v: number | null | undefined): Tone | undefined => (v == null || Math.abs(v) < 0.05 ? undefined : v > 0 ? "green" : "red");

/** Two-value comparison table (label · A · B). */
function SplitTable({ a, b, rows, metric }: { a: string; b: string; rows: { label: string; a: string; b: string }[]; metric: string }) {
  const cols: Col[] = [{ label: metric, flex: 1 }, { label: a, width: 110, align: "right", strong: true }, { label: b, width: 110, align: "right", strong: true }];
  return <Table cols={cols} rows={rows.map((r) => [r.label, r.a, r.b])} />;
}

/** Prose from the narrative: labelled AI when AI-generated, a plain card otherwise. */
function Prose({ body, ai, label }: { body: string; ai: boolean; label: string }) {
  if (!body) return null;
  return ai ? (
    <AiBox label={label.toUpperCase()} body={body} />
  ) : (
    <Card style={{ marginBottom: 10 }} wrap>
      <Body>{body}</Body>
    </Card>
  );
}

function SeasonReportDoc({ payload, lang }: { payload: SeasonReportPayload; lang: Lang }) {
  const t = L[lang];
  const { data, physical, narrative, aiGenerated, season } = payload;
  const pm = data.perMatch;
  const wl = data.winsVsLosses;
  const nv = (k: string) => (narrative?.[k] ?? "").trim();
  // Source-aware provenance: the report is built from ONE provider's per-match data.
  // Naming/method name the actual source so a StatsBomb report never reads "Wyscout".
  const srcName = payload.source === "statsbomb" ? "StatsBomb" : "Wyscout";
  const method = t.method.replace(/Wyscout/g, srcName);
  const rec = `${data.record.w}-${data.record.d}-${data.record.l}`;

  const headline = nv("headline");
  const bottomLine = nv("bottomLine");
  const areas = ([["attack", t.attack], ["defence", t.defence], ["goalkeeping", t.goalkeeping], ["pressing", t.pressing]] as const).filter(([k]) => nv(k));
  const ha = data.homeAway;

  return (
    <Document title={`${data.team} ${season} - ${t.report}`} author="MicroPulse">
      <BrandPage
        doc={lang === "IS" ? "Tímabilsskýrsla" : "Season report"}
        context={`${data.team} ${season}`}
        kicker={srcName}
        title={`${data.team} ${season} — ${t.report} (${srcName})`}
        subtitle={`${t.prepared} · ${data.dateFrom ?? ""} – ${data.dateTo ?? ""}`}
        chips={[
          { text: `${data.matches} ${t.matchesWord}` },
          { text: rec },
          ...(aiGenerated ? [{ text: "AI", tone: "cobalt" as Tone }] : []),
        ]}
        note={t.foot}
      >
        {/* Layer 0 — the results read (AI-labelled) + bottom line */}
        {headline || bottomLine ? (
          aiGenerated ? (
            <AiBox label={t.ai.toUpperCase()} headline={headline && headline.length <= 220 ? headline : undefined} body={headline.length > 220 ? headline : undefined}>
              {bottomLine ? (
                <View style={{ marginTop: 7 }}>
                  <Label color={C.cobalt}>{t.bottomLine}</Label>
                  <Body size={9}>{bottomLine}</Body>
                </View>
              ) : null}
            </AiBox>
          ) : (
            <Card style={{ marginBottom: 10 }} wrap>
              {headline ? <><Label>{t.results}</Label><Body>{headline}</Body></> : null}
              {bottomLine ? <><Label mt={6}>{t.bottomLine}</Label><Body>{bottomLine}</Body></> : null}
            </Card>
          )
        ) : null}

        {/* Layer 1 — plain rule-computed facts */}
        <FactRow
          facts={[
            { value: rec, label: t.record, sub: `${data.points} ${t.pts} (${n1(data.ppg)} / ${lang === "IS" ? "leik" : "game"})` },
            { value: sign(pm.goalDiff), label: t.gd, sub: `${n1(pm.goalsFor)} / ${n1(pm.goalsAgainst)} ${t.perMatch}`, tone: diffTone(pm.goalDiff) },
            { value: sign(pm.xgDiff), label: t.xgd, sub: `xG ${n1(pm.xgFor)} / ${n1(pm.xgAgainst)} - ${t.chancesNote}`, tone: diffTone(pm.xgDiff) },
          ]}
        />

        {/* Key numbers table */}
        <Section title={t.keyNumbers} wrap={false}>
          <Card>
            <KeyValues
              rows={[
                [t.matches, `${data.matches} (${data.graded})`],
                [t.record, rec],
                [t.points, `${data.points} (${n1(data.ppg)})`],
                [t.gf, `${n1(pm.goalsFor)} / ${n1(pm.goalsAgainst)}`],
                [t.gd, sign(pm.goalDiff)],
                [t.xg, `${n1(pm.xgFor)} / ${n1(pm.xgAgainst)}`],
                [t.xgd, sign(pm.xgDiff)],
                [t.shots, `${n1(pm.shotsFor, 1)} / ${n1(pm.shotsAgainst, 1)}`],
                [t.poss, pm.possessionPct == null ? "-" : `${n1(pm.possessionPct, 1)}%`],
                [t.ppda, n1(pm.ppda)],
                [t.defduel, pm.defDuelsWonPct == null ? "-" : `${n1(pm.defDuelsWonPct, 1)}%`],
                [t.finishing, sign(pm.finishing)],
                [t.saved, sign(pm.goalsSaved)],
              ]}
            />
          </Card>
        </Section>

        {/* The read by area — attack, defence, goalkeeping, pressing */}
        {areas.length ? (
          <Section title={t.theRead}>
            {aiGenerated ? (
              <AiBox label={t.ai.toUpperCase()}>
                {areas.map(([k, title]) => (
                  <View key={k} style={{ marginTop: 7 }} wrap={false}>
                    <Label color={C.cobalt}>{title}</Label>
                    <Body size={9}>{nv(k)}</Body>
                  </View>
                ))}
              </AiBox>
            ) : (
              <Card wrap>
                {areas.map(([k, title]) => (
                  <View key={k} style={{ marginBottom: 6 }} wrap={false}>
                    <Label>{title}</Label>
                    <Body size={9}>{nv(k)}</Body>
                  </View>
                ))}
              </Card>
            )}
          </Section>
        ) : null}

        {/* Wins vs losses table */}
        <Section title={t.winsLosses} wrap={false}>
          {data.confidence.lowSample ? (
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              <Chip text={t.lowSample} tone="amber" />
            </View>
          ) : null}
          <SplitTable
            metric={t.metric}
            a={t.inWins}
            b={t.inLosses}
            rows={[
              { label: t.xgAg, g: wl.xgAgainst, d: 2 },
              { label: t.shAg, g: wl.shotsAgainst, d: 1 },
              { label: t.xgFor, g: wl.xgFor, d: 2 },
              { label: "PPDA", g: wl.ppda, d: 2 },
            ].map((r) => ({ label: r.label, a: n1(r.g.win.mean, r.d), b: n1(r.g.loss.mean, r.d) }))}
          />
        </Section>
        <Prose body={nv("winsLosses")} ai={aiGenerated} label={t.aiShort} />

        {/* Home vs away — where the season's results and process actually come from. */}
        {ha && (ha.home.n > 0 || ha.away.n > 0) ? (
          <Section title={t.homeAway} wrap={false}>
            <SplitTable
              metric={t.metric}
              a={`${t.home} (n=${ha.home.n})`}
              b={`${t.away} (n=${ha.away.n})`}
              rows={[
                { label: t.record, a: `${ha.home.w}-${ha.home.d}-${ha.home.l}`, b: `${ha.away.w}-${ha.away.d}-${ha.away.l}` },
                { label: t.gf, a: `${n1(ha.home.goalsFor)} / ${n1(ha.home.goalsAgainst)}`, b: `${n1(ha.away.goalsFor)} / ${n1(ha.away.goalsAgainst)}` },
                { label: t.xg, a: `${n1(ha.home.xgFor)} / ${n1(ha.home.xgAgainst)}`, b: `${n1(ha.away.xgFor)} / ${n1(ha.away.xgAgainst)}` },
                { label: t.xgd, a: sign(ha.home.xgDiff), b: sign(ha.away.xgDiff) },
                { label: t.shots, a: `${n1(ha.home.shotsFor, 1)} / ${n1(ha.home.shotsAgainst, 1)}`, b: `${n1(ha.away.shotsFor, 1)} / ${n1(ha.away.shotsAgainst, 1)}` },
                { label: t.finishing, a: sign(ha.home.finishing), b: sign(ha.away.finishing) },
              ]}
            />
          </Section>
        ) : null}

        {/* Model comparison — StatsBomb vs Wyscout side by side (both computed, never merged). */}
        {payload.models?.statsbomb && payload.models?.wyscout ? (() => {
          const sb = payload.models.statsbomb!, wy = payload.models.wyscout!;
          return (
            <Section title={t.models} wrap={false}>
              <SplitTable
                metric={t.metric}
                a="StatsBomb"
                b="Wyscout"
                rows={[
                  { label: t.matches, a: `${sb.matches}`, b: `${wy.matches}` },
                  { label: t.record, a: `${sb.record.w}-${sb.record.d}-${sb.record.l}`, b: `${wy.record.w}-${wy.record.d}-${wy.record.l}` },
                  { label: t.gf, a: `${n1(sb.goalsFor)} / ${n1(sb.goalsAgainst)}`, b: `${n1(wy.goalsFor)} / ${n1(wy.goalsAgainst)}` },
                  { label: t.xg, a: `${n1(sb.xgFor)} / ${n1(sb.xgAgainst)}`, b: `${n1(wy.xgFor)} / ${n1(wy.xgAgainst)}` },
                  { label: t.xgd, a: sign(sb.xgDiff), b: sign(wy.xgDiff) },
                  { label: t.finishing, a: sign(sb.finishing), b: sign(wy.finishing) },
                  { label: t.saved, a: sign(sb.goalsSaved), b: sign(wy.goalsSaved) },
                ]}
              />
              <Provenance>{t.modelsNote}</Provenance>
            </Section>
          );
        })() : null}

        {/* Physical */}
        {physical && physical.length ? (
          <Section title={t.physical} wrap={false}>
            <Prose body={nv("physical")} ai={aiGenerated} label={t.aiShort} />
            <Table
              cols={[{ label: t.tracks, flex: 1 }, { label: "r", width: 70, align: "right", strong: true }, { label: "n", width: 50, align: "right" }]}
              rows={physical.map((c) => [PHYS_LABEL[c.key]?.[lang] ?? c.key, c.r.toFixed(2), String(c.n)])}
            />
          </Section>
        ) : null}

        <Section title={t.method_h} wrap={false}>
          <Provenance>{clean(method)}</Provenance>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadSeasonReportPdf(payload: SeasonReportPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <SeasonReportDoc payload={payload} lang={lang} />);
  saveBlob(blob, `${payload.data.team.replace(/\s+/g, "-")}-${payload.season}-season-report-${payload.source ?? "wyscout"}.pdf`);
}
