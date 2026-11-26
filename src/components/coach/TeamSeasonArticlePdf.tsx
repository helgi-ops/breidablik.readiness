"use client";

/**
 * TeamSeasonArticlePdf — the article-quality OWN-team season report (PDF).
 *
 * Layered read: verdict → the three facts behind it → strengths / weaknesses →
 * priority improvements → the full metric table vs the league average. Numbers are
 * rule-computed; the prose is AI-written from those numbers and labelled AI.
 * Descriptive context — it never touches the readiness colour.
 *
 * Look comes from the shared PDF kit (src/components/pdf/brand.tsx): AI prose sits in
 * <AiBox> (labelled), the rule-computed signals in a <FactRow>, the raw table last.
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { AiBox, Body, BrandPage, C, Card, Cols, FactRow, Label, Provenance, Section, Status, TONE, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob, type Tone } from "@/components/pdf/brand";

type Lang = "EN" | "IS";
type Row = { key: string; value: number | null; league: number | null; dir: string; read: string; rel: number | null };
type TB = { t: string; b: string };
type Contributors = {
  attacker: { name: string; npxg: number | null; obv: number | null } | null;
  creator: { name: string; xa: number | null } | null;
  defender: { name: string; defObv: number | null } | null;
} | null;
export type TeamSeasonArticlePayload = {
  team: string; season: string; matches: number | null;
  rows: Row[];
  contributors?: Contributors;
  signals: { npxgDiff: number | null; finishing: number | null };
  prose: {
    verdict?: string; verdictBody?: string; facts?: string[];
    strengths?: TB[]; weaknesses?: TB[]; improve?: TB[]; form?: string;
  } | null;
  aiGenerated: boolean;
};

const L = {
  EN: { report: "season report", prepared: "Prepared for the coaching staff · MicroPulse", ai: "AI-written from the numbers below — cites the data, decides nothing",
    verdict: "VERDICT", why: "Why — the facts behind it", strengths: "STRENGTHS", weaknesses: "WEAKNESSES", improve: "Things to improve (priority order)",
    contributors: "Key contributors", topOutput: "Top output", mainCreator: "Main creator", defValue: "Defensive value",
    form: "Form", full: "Full numbers — vs league average (per match)", metric: "Metric", team: "Team", league: "League", read: "Read", inProgress: "in progress",
    theRead: "The read", howTo: "Source and method", matchesWord: "matches",
    fChances: "Chances created minus conceded", fChancesSub: "non-penalty xG difference per match",
    fFinish: "Finishing vs chances", fFinishSub: "goals minus xG - tends to even out",
    fVsLeague: "Metrics above / below the league", fVsLeagueSub: "of the metrics in the table below",
    method: "Descriptive context only — it never changes the readiness colour or the daily decision. Figures are StatsBomb season aggregates for the team vs the built-in League Average; xG / OBV are models with uncertainty. The read is rule-based and the coach can override it. Association, not causation or prediction.",
    foot: "Descriptive context only — never changes the readiness colour or the daily decision.",
    signals: "Signals: StatsBomb IQ Team Stats (team vs built-in League Average). Rules compute the figures; the read is AI-phrased and coach-overridable." },
  IS: { report: "tímabilsskýrsla", prepared: "Unnið fyrir þjálfarateymið · MicroPulse", ai: "AI skrifaði úr tölunum að neðan — vitnar í gögnin, ákveður ekkert",
    verdict: "DÓMUR", why: "Af hverju — staðreyndirnar á bak við", strengths: "STYRKLEIKAR", weaknesses: "VEIKLEIKAR", improve: "Til að bæta (í forgangsröð)",
    contributors: "Lykilmenn", topOutput: "Mest afköst", mainCreator: "Helsti skapari", defValue: "Varnarvirði",
    form: "Form", full: "Fullar tölur — vs deildar-meðaltal (á leik)", metric: "Mæling", team: "Lið", league: "Deild", read: "Lestur", inProgress: "í gangi",
    theRead: "Lesturinn", howTo: "Uppruni og aðferð", matchesWord: "leikir",
    fChances: "Færi sköpuð mínus fengin á sig", fChancesSub: "xG-munur án víta á leik",
    fFinish: "Klárun vs færi", fFinishSub: "mörk mínus xG - jafnast oft út",
    fVsLeague: "Mælingar yfir / undir deild", fVsLeagueSub: "af mælingunum í töflunni að neðan",
    method: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum né daglegu ákvörðuninni. Tölur eru StatsBomb season-samtölur liðsins vs innbyggða League Average; xG / OBV eru líkön með óvissu. Lesturinn er reglu-byggður og þjálfari getur hnekkt honum. Fylgni, ekki orsök eða spá.",
    foot: "Aðeins lýsandi samhengi — breytir aldrei readiness-litnum né daglegu ákvörðuninni.",
    signals: "Uppspretta: StatsBomb IQ Team Stats (lið vs innbyggt League Average). Reglur reikna tölurnar; lesturinn er AI-orðaður og þjálfari getur hnekkt." },
} as const;

const READ: Record<string, { en: string; is: string; tone: Tone }> = {
  strength: { en: "strength", is: "styrkur", tone: "green" }, good: { en: "good", is: "gott", tone: "green" },
  above: { en: "above", is: "yfir", tone: "cobalt" }, even: { en: "~", is: "~", tone: "neutral" }, neutral: { en: "~", is: "~", tone: "neutral" },
  below: { en: "below", is: "undir", tone: "amber" }, weak: { en: "weak", is: "veikt", tone: "red" },
};

const fmt = (v: number | null): string => (v == null ? "-" : Math.abs(v) >= 20 ? `${Math.round(v)}` : `${Math.round(v * 100) / 100}`);
const sign = (v: number | null): string => (v == null ? "-" : `${v >= 0 ? "+" : ""}${fmt(v)}`);

function Bullet({ item, tone }: { item: TB; tone: Tone }) {
  return (
    <View wrap={false} style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: TONE[tone].fill, marginTop: 4.5 }} />
      <Text style={[fb(400), { flex: 1, fontSize: 9, lineHeight: 1.45 }]}>
        <Text style={fb(600)}>{`${clean(item.t)} `}</Text>
        {clean(item.b)}
      </Text>
    </View>
  );
}

function Numbered({ items }: { items: { lead?: string; body: string }[] }) {
  return (
    <View>
      {items.map((x, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", gap: 7, marginBottom: 5 }}>
          <Text style={[fh(800), { width: 12, fontSize: 10, color: C.cobalt }]}>{i + 1}</Text>
          <Text style={[fb(400), { flex: 1, fontSize: 9, lineHeight: 1.45 }]}>
            {x.lead ? <Text style={fb(600)}>{`${clean(x.lead)} `}</Text> : null}
            {clean(x.body)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Doc({ payload, lang, label }: { payload: TeamSeasonArticlePayload; lang: Lang; label: (k: string) => string }) {
  const t = L[lang];
  const p = payload.prose;
  const ai = payload.aiGenerated;
  const verdict = p?.verdict ?? (lang === "IS" ? "Tímabilsmynd liðsins vs deildin." : "The team's season vs the league.");
  const nAbove = payload.rows.filter((r) => ["strength", "good", "above"].includes(r.read)).length;
  const nBelow = payload.rows.filter((r) => ["below", "weak"].includes(r.read)).length;
  const sTone = (v: number | null): Tone | undefined => (v == null || Math.abs(v) < 0.005 ? undefined : v > 0 ? "green" : "red");
  const c = payload.contributors;
  const aiLabel = t.ai.toUpperCase();

  return (
    <Document title={`${payload.team} ${payload.season} - ${t.report}`} author="MicroPulse">
      <BrandPage
        doc={lang === "IS" ? "Tímabilsskýrsla" : "Season report"}
        context={`${payload.team} ${payload.season}`}
        kicker="StatsBomb"
        title={`${payload.team} ${payload.season} — ${t.report}`}
        subtitle={`${payload.matches != null ? `${payload.matches} ${t.matchesWord}, ${t.inProgress} · ` : ""}${t.prepared}`}
        chips={ai ? [{ text: "AI", tone: "cobalt" }] : undefined}
        note={t.foot}
      >
        {/* Layer 0 — the verdict. AI-phrased → AI box; fallback sentence → plain verdict. */}
        {ai && p?.verdict ? (
          <AiBox label={`${t.verdict} · ${aiLabel}`} headline={verdict} body={p?.verdictBody} />
        ) : (
          <Verdict tone="neutral" label={t.verdict} headline={verdict} body={p?.verdictBody} />
        )}

        {/* Layer 1 — rule-computed signals */}
        <FactRow
          facts={[
            { value: sign(payload.signals.npxgDiff), label: t.fChances, sub: t.fChancesSub, tone: sTone(payload.signals.npxgDiff) },
            { value: sign(payload.signals.finishing), label: t.fFinish, sub: t.fFinishSub, tone: sTone(payload.signals.finishing) },
            { value: `${nAbove} / ${nBelow}`, label: t.fVsLeague, sub: t.fVsLeagueSub },
          ]}
        />

        {p?.facts && p.facts.length ? (
          <Section title={t.why} wrap={false}>
            {ai ? (
              <AiBox label={aiLabel}>
                <View style={{ marginTop: 7 }}><Numbered items={p.facts.slice(0, 3).map((f) => ({ body: f }))} /></View>
              </AiBox>
            ) : (
              <Card><Numbered items={p.facts.slice(0, 3).map((f) => ({ body: f }))} /></Card>
            )}
          </Section>
        ) : null}

        {(p?.strengths?.length || p?.weaknesses?.length) ? (
          <Section title={t.theRead} hint={ai ? `AI · ${t.ai}` : undefined}>
            <Cols gap={8}>
              <Card tone="green">
                <Label color={TONE.green.text}>{t.strengths}</Label>
                <View style={{ marginTop: 3 }}>{(p?.strengths ?? []).map((x, i) => <Bullet key={i} item={x} tone="green" />)}</View>
              </Card>
              <Card tone="red">
                <Label color={TONE.red.text}>{t.weaknesses}</Label>
                <View style={{ marginTop: 3 }}>{(p?.weaknesses ?? []).map((x, i) => <Bullet key={i} item={x} tone="red" />)}</View>
              </Card>
            </Cols>
          </Section>
        ) : null}

        {p?.improve?.length ? (
          <Section title={t.improve} hint={ai && !(p?.strengths?.length || p?.weaknesses?.length) ? `AI · ${t.ai}` : undefined} wrap={false}>
            <Card><Numbered items={p.improve.map((x) => ({ lead: x.t, body: x.b }))} /></Card>
          </Section>
        ) : null}

        {(c && (c.attacker || c.creator || c.defender)) || p?.form ? (
          <View wrap={false} style={{ marginBottom: 10 }}>
            <Cols gap={8}>
              {c && (c.attacker || c.creator || c.defender) ? (
                <Card>
                  <Label>{t.contributors}</Label>
                  {([
                    c.attacker ? [t.topOutput, c.attacker.name, `npxG ${fmt(c.attacker.npxg)}/90 · OBV ${fmt(c.attacker.obv)}/90`] : null,
                    c.creator ? [t.mainCreator, c.creator.name, `xA ${fmt(c.creator.xa)}/90`] : null,
                    c.defender ? [t.defValue, c.defender.name, `def OBV ${fmt(c.defender.defObv)}/90`] : null,
                  ].filter(Boolean) as [string, string, string][]).map(([role, name, stat], i) => (
                    <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 3.5, borderTopWidth: i ? 1 : 0, borderTopColor: C.hair }}>
                      <Text style={[fb(400), { fontSize: 8.5, color: C.mute, width: 80 }]}>{clean(role)}</Text>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Text style={[fb(600), { fontSize: 8.75 }]}>{clean(name)}</Text>
                        <Text style={[fb(400), { fontSize: 7.75, color: C.mute, marginTop: 1 }]}>{clean(stat)}</Text>
                      </View>
                    </View>
                  ))}
                </Card>
              ) : null}
              {p?.form ? (
                <Card>
                  <Label>{t.form}</Label>
                  <Body size={9}>{p.form}</Body>
                </Card>
              ) : null}
            </Cols>
          </View>
        ) : null}

        {/* Layer 2 — the full table */}
        <Section title={t.full}>
          <Table
            dense
            cols={[
              { label: t.metric, flex: 1 },
              { label: t.team, width: 70, align: "right", strong: true },
              { label: t.league, width: 70, align: "right" },
              { label: "", width: 14 },
              { label: t.read, width: 84 },
            ]}
            rows={payload.rows.map((r) => {
              const rd = READ[r.read] ?? READ.neutral;
              return [label(r.key), fmt(r.value), fmt(r.league), "", <Status key="r" tone={rd.tone} text={lang === "IS" ? rd.is : rd.en} size={8.25} />];
            })}
          />
        </Section>

        <Section title={t.howTo} wrap={false}>
          <Provenance>{t.method}</Provenance>
          <Provenance>{t.signals}</Provenance>
        </Section>
      </BrandPage>
    </Document>
  );
}

export async function downloadTeamSeasonArticlePdf(payload: TeamSeasonArticlePayload, lang: Lang, label: (k: string) => string) {
  const blob = await renderPdfBlob(() => <Doc payload={payload} lang={lang} label={label} />);
  saveBlob(blob, `${payload.team.replace(/\s+/g, "-")}-${payload.season}-season-report-statsbomb.pdf`);
}
