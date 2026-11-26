"use client";

/**
 * PlayerProfilePdf — the written Total Player Analysis profile as a coach-facing PDF,
 * modelled on the hand-made Player-profile article.
 *
 * Layered read: masthead → PROFILE line (AI box when AI-written) → footballer strengths &
 * limitations → the written read (footballer / athlete / cross / role & fit) → athlete
 * qualities table → "how to improve the weak areas" → VALD numbers → method & signals.
 * Presentation-only: every number is rule-computed upstream and the prose is AI-phrased +
 * labelled; the caller passes already-localised strings. PERFORMANCE ONLY — never the
 * readiness colour or a medical read.
 *
 * Styling comes from the shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import {
  AiBox, BrandPage, Body, C, Card, KeyValues, Label, Provenance, Section, Status, Table, Verdict,
  TONE, clean, fb, fh, renderPdfBlob, saveBlob, type Tone,
} from "@/components/pdf/brand";

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
  /** All VALD Assessment numbers (CMJ / IMTP / limb strength) + the compare read. */
  vald?: {
    title: string;
    compareTitle: string;
    note: string;
    compare: Array<{ label: string; value: string; band: string; read: string }>;
    groups: Array<{ title: string; date: string | null; rows: Array<[string, string]> }>;
    footnote: string;
    trainingFocus?: {
      title: string;
      verdict: string;
      priorities: Array<{ quality: string; value: string; band: string; bandLabel: string; lever: string; cite: string }>;
      strengthsLabel: string;
      strengths: string[];
    } | null;
  } | null;
};

/** VALD band → kit tone (elite = cobalt, good = green, average = amber, below = red). */
const BAND_TONE: Record<string, Tone> = { elite: "cobalt", good: "green", average: "amber", below: "red", context: "neutral", na: "neutral" };
/** Athlete-quality read → kit tone. */
const VERDICT_TONE: Record<string, Tone> = { strength: "green", weakness: "amber", neutral: "neutral", no_data: "neutral" };

const L = {
  EN: { kicker: "PLAYER PROFILE", prepared: "Prepared for the coaching staff · MicroPulse",
    ai: "AI-written from the numbers - cites the data, decides nothing",
    profile: "PROFILE", footballer: "As a footballer", athlete: "As an athlete", cross: "Reading across the two",
    roleFit: "Role & fit", strengths: "STRENGTHS", limitations: "LIMITATIONS",
    written: "The written read", aiWritten: "AI-written from the numbers below. Rules computed every percentile.",
    qualities: "Athlete qualities", quality: "Quality", value: "Value", pctl: "%ile", read: "Read",
    improve: "How to improve the weak areas", within: "percentiles within squad / position",
    verdicts: { strength: "strength", weakness: "weak", neutral: "on par", no_data: "-" } as Record<string, string>,
    howTo: "How to read this profile",
    method: "Two separate reads — as a footballer and as an athlete — never blended into one score. Percentiles rank the player within his own squad / position group and describe what the data shows; they do not predict. PERFORMANCE ONLY: nothing here is the readiness colour, load decision, or a medical/injury judgement — asymmetry is a robustness quality, and the medical read stays in the RTP module.",
    signals: "Signals: StatsBomb/Wyscout per-90 (footballer) + GPS / VALD force plates / VBT (athlete). Rules compute the percentiles and the development levers; any prose is AI-phrased and coach-overridable.",
    foot: "Performance only - never the readiness colour, a load decision or a medical read." },
  IS: { kicker: "LEIKMANNAPRÓFÍLL", prepared: "Unnið fyrir þjálfarateymið · MicroPulse",
    ai: "AI skrifaði úr tölunum - vitnar í gögnin, ákveður ekkert",
    profile: "PRÓFÍLL", footballer: "Sem fótboltamaður", athlete: "Sem íþróttamaður", cross: "Lesið þvert á ásana",
    roleFit: "Hlutverk og notkun", strengths: "STYRKLEIKAR", limitations: "TAKMARKANIR",
    written: "Skriflegur lestur", aiWritten: "AI skrifaði úr tölunum hér að neðan. Reglur reiknuðu öll percentíl.",
    qualities: "Íþrótta-eiginleikar", quality: "Eiginleiki", value: "Gildi", pctl: "pctl", read: "Lestur",
    improve: "Hvernig má bæta veiku svæðin", within: "percentíl innan liðs / stöðu",
    verdicts: { strength: "styrkur", weakness: "veikt", neutral: "í meðallagi", no_data: "-" } as Record<string, string>,
    howTo: "Hvernig á að lesa prófílinn",
    method: "Tveir aðskildir lestrar — sem fótboltamaður og sem íþróttamaður — aldrei blandað í eina einkunn. Percentíl raða leikmanni innan síns liðs / stöðu og lýsa því sem gögnin sýna; þau spá ekki. FRAMMISTAÐA EINGÖNGU: ekkert hér er readiness-liturinn, álags-ákvörðun né læknis-/meiðsla-mat — ósamhverfa er styrkleikamerki og læknis-lesturinn er áfram í RTP-modúlinu.",
    signals: "Uppspretta: StatsBomb/Wyscout per-90 (fótbolti) + GPS / VALD kraftplötur / VBT (íþrótt). Reglur reikna percentílin og æfingaleiðirnar; texti er AI-orðaður og þjálfari getur hnekkt.",
    foot: "Frammistaða eingöngu - aldrei readiness-liturinn, álags-ákvörðun né læknismat." },
} as const;

function bio(p: PlayerProfilePdfPayload, lang: Lang): string {
  const parts = [p.position, p.minutes != null ? `${Math.round(p.minutes)} ${lang === "IS" ? "mín" : "min"}` : null, L[lang].within].filter(Boolean);
  return parts.join(" · ");
}

const ord = (pct: number | null, lang: Lang) => (pct != null ? ` (${pct}${lang === "IS" ? "." : "th"})` : "");

/** A short list of metric labels with their percentile, under a dot + word heading. */
function MetricList({ title, tone, items, lang }: { title: string; tone: Tone; items: Array<{ label: string; percentile: number | null }>; lang: Lang }) {
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ marginBottom: 5 }}><Status tone={tone} text={title} size={8} /></View>
      {items.length ? items.map((m, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 2.5, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: C.hair }}>
          <Text style={[fb(400), { fontSize: 8.75, flex: 1 }]}>{clean(m.label)}</Text>
          {m.percentile != null ? <Text style={[fh(700), { fontSize: 8.75, color: TONE[tone].text }]}>{`${m.percentile}${lang === "IS" ? "." : "th"}`}</Text> : null}
        </View>
      )) : <Body color={C.mute}>-</Body>}
    </Card>
  );
}

/** Numbered lever line: bold lead, plain detail, small cite. */
function Lever({ lead, text, cite }: { lead: string; text: string; cite?: string }) {
  return (
    <View wrap={false} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.hair }}>
      <Text style={[fb(600), { fontSize: 9, lineHeight: 1.35 }]}>{clean(lead)}</Text>
      <Text style={[fb(400), { fontSize: 8.75, lineHeight: 1.45, marginTop: 1 }]}>
        {clean(text)}
        {cite ? <Text style={{ color: C.mute, fontSize: 7.75 }}>{`  [${clean(cite)}]`}</Text> : null}
      </Text>
    </View>
  );
}

export function Doc({ payload, lang }: { payload: PlayerProfilePdfPayload; lang: Lang }) {
  const t = L[lang];
  const n = payload.narrative;
  const sections: Array<[string, string | undefined]> = [
    [t.footballer, n?.footballerRead], [t.athlete, n?.athleteRead], [t.cross, n?.crossRead], [t.roleFit, n?.roleFit],
  ];
  const written = sections.filter(([, body]) => body && body.trim());
  const fbl = payload.footballer;
  const ath = payload.athlete;
  const profileLine = n?.profile ?? payload.headline;
  const vald = payload.vald;
  return (
    <Document>
      <BrandPage
        doc={lang === "IS" ? "Leikmannaprófíll" : "Player profile"}
        context={payload.playerName}
        kicker={t.kicker}
        title={payload.playerName}
        subtitle={`${bio(payload, lang)}\n${t.prepared}`}
        chips={[...(fbl?.role ? [{ text: fbl.role }] : []), ...(payload.aiGenerated ? [{ text: "AI", tone: "cobalt" as Tone }] : [])]}
        note={`${t.prepared} · ${t.foot}`}
      >
        {/* Layer 0 — the one-line profile. AI-written → labelled AI box; otherwise a plain profile line. */}
        {profileLine ? (
          payload.aiGenerated ? (
            <AiBox label={t.ai.toUpperCase()} headline={profileLine} />
          ) : (
            <Verdict tone="neutral" label={t.profile} headline={profileLine} />
          )
        ) : null}

        {/* Layer 1 — footballer strengths & limitations */}
        {fbl && (fbl.strengths.length > 0 || fbl.weaknesses.length > 0) ? (
          <View wrap={false} style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            <MetricList title={t.strengths} tone="green" items={fbl.strengths} lang={lang} />
            <MetricList title={t.limitations} tone="amber" items={fbl.weaknesses} lang={lang} />
          </View>
        ) : null}

        {/* The written read — AI-phrased prose stays inside a labelled AI box */}
        {written.length ? (
          <Section title={t.written} hint={payload.aiGenerated ? t.aiWritten : undefined}>
            {payload.aiGenerated ? (
              <AiBox label={t.ai.toUpperCase()}>
                {written.map(([label, body]) => (
                  <View key={label} wrap={false} style={{ marginTop: 7 }}>
                    <Label color={C.cobalt}>{label}</Label>
                    <Body size={9.25}>{body ?? ""}</Body>
                  </View>
                ))}
              </AiBox>
            ) : (
              written.map(([label, body]) => (
                <View key={label} wrap={false} style={{ marginBottom: 7 }}>
                  <Label color={C.cobalt}>{label}</Label>
                  <Body size={9.25}>{body ?? ""}</Body>
                </View>
              ))
            )}
          </Section>
        ) : null}

        {/* Layer 2 — athlete qualities */}
        {ath && ath.qualities.length ? (
          <Section title={t.qualities} wrap={false}>
            <Table
              cols={[
                { label: t.quality, flex: 2 },
                { label: t.value, width: 96, align: "right" },
                { label: t.pctl, width: 42, align: "right", strong: true },
                { label: t.read, width: 82, align: "right" },
              ]}
              rows={ath.qualities.map((q) => [
                q.label,
                `${q.value}${q.unit ? ` ${q.unit}` : ""}`,
                q.percentile != null ? String(q.percentile) : "-",
                q.verdict === "no_data" ? "-" : <Status key="r" tone={VERDICT_TONE[q.verdict] ?? "neutral"} text={t.verdicts[q.verdict] ?? q.verdict} size={8} />,
              ])}
            />
          </Section>
        ) : null}

        {payload.development.length ? (
          <Section title={t.improve} wrap={payload.development.length > 4}>
            <Card pad={10} wrap={payload.development.length > 4}>
              {payload.development.map((d, i) => (
                <Lever key={i} lead={`${d.label}${ord(d.percentile, lang)}`} text={d.lever} cite={d.cite} />
              ))}
            </Card>
          </Section>
        ) : null}

        {vald && (vald.groups.length > 0 || vald.compare.length > 0) ? (
          <Section title={vald.title} hint={vald.note || undefined}>
            {vald.compare.length ? (
              <View wrap={false} style={{ marginBottom: 8 }}>
                <Label>{vald.compareTitle}</Label>
                <Table
                  dense
                  cols={[{ label: t.quality, flex: 2 }, { label: t.value, width: 90, align: "right", strong: true }, { label: t.read, width: 120, align: "right" }]}
                  rows={vald.compare.map((c) => [c.label, c.value, <Status key="b" tone={BAND_TONE[c.band] ?? "neutral"} text={c.read} size={8} />])}
                />
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {vald.groups.map((g, gi) => (
                <Card key={gi} pad={9} style={{ width: "49.2%" }}>
                  <Text style={[fh(700), { fontSize: 10 }]}>{clean(g.title)}</Text>
                  {g.date ? <Text style={[fb(400), { fontSize: 7.5, color: C.mute, marginBottom: 3 }]}>{clean(g.date)}</Text> : null}
                  <KeyValues rows={g.rows} />
                </Card>
              ))}
            </View>
            {vald.trainingFocus && (vald.trainingFocus.priorities.length > 0 || vald.trainingFocus.verdict) ? (
              <Card style={{ marginTop: 8 }} wrap={vald.trainingFocus.priorities.length > 6}>
                <Label color={C.cobalt}>{vald.trainingFocus.title}</Label>
                {vald.trainingFocus.verdict ? <Text style={[fh(700), { fontSize: 11, lineHeight: 1.3, marginBottom: 2 }]}>{clean(vald.trainingFocus.verdict)}</Text> : null}
                {vald.trainingFocus.priorities.map((p, i) => (
                  <Lever key={i} lead={`${i + 1}. ${p.quality} (${p.value}, ${p.bandLabel})`} text={p.lever} cite={p.cite} />
                ))}
                {vald.trainingFocus.strengths.length ? (
                  <Body size={8.25} color={C.mute} mt={4}>{`${vald.trainingFocus.strengthsLabel}: ${vald.trainingFocus.strengths.join(", ")}`}</Body>
                ) : null}
              </Card>
            ) : null}
            {vald.footnote ? <Provenance>{vald.footnote}</Provenance> : null}
          </Section>
        ) : null}

        {/* Closing card — how to read / sources */}
        <Card style={{ marginTop: 6 }}>
          <Label>{t.howTo}</Label>
          <Provenance>{t.method}</Provenance>
          <Provenance>{t.signals}</Provenance>
        </Card>
      </BrandPage>
    </Document>
  );
}

export async function downloadPlayerProfilePdf(payload: PlayerProfilePdfPayload, lang: Lang) {
  const blob = await renderPdfBlob(() => <Doc payload={payload} lang={lang} />);
  const slug = payload.playerName.replace(/\s+/g, "-");
  saveBlob(blob, `player-profile-${slug}.pdf`);
}
