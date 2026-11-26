"use client";

/**
 * Off-week maintenance plan → PDF (per player or a team pack). The offline artefact for travel:
 * name, the summary first, the per-player "why", then the days + prescriptions and an RPE/pace key.
 * Each player starts on a fresh page with their own masthead (it is handed out per player).
 *
 * Styling + download: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { LiftRxSection } from "@/components/coach/LiftRxPdf";
import { rxForOffWeekPlan } from "@/lib/micropulse/offWeek/liftRx";
import { BrandPage, Bullets, C, Card, Chip, Label, Provenance, Section, Verdict, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Bi = { en: string; is: string };
const RX_HINT: Bi = { en: "One table per lift; sets × reps are in the days.", is: "Ein tafla á hverja lyftu; sett × endurtekningar standa við dagana." };
type OffWeekDay = { dayIndex: number; type: string; title: Bi; blocks: Array<{ label: Bi; prescription: Bi }>; note: Bi };
type OffWeekPlan = { days: OffWeekDay[]; summary: Bi; caveat: Bi; why: Bi[] };
export type OffWeekPlayerPlan = { playerId: string; name: string; position: string | null; plan: OffWeekPlan };

/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");
const TYPE_LABEL: Record<string, Bi> = {
  strength: { en: "Strength", is: "Styrkur" }, run: { en: "Run", is: "Hlaup" }, combined: { en: "Combined", is: "Blandað" }, rest: { en: "Rest", is: "Hvíld" },
};

function PlayerPage({ p, lang, teamName }: { p: OffWeekPlayerPlan; lang: "EN" | "IS"; teamName?: string }) {
  const t = (b: Bi) => tx(lang === "IS" ? b.is : b.en);
  const is = lang === "IS";
  // Running header identifies the club, the document and the date on every page of a handed-over pack.
  const docTitle = is ? "Viðhaldsplan utan tímabils" : "Off-season maintenance plan";
  const dateStr = new Date().toLocaleDateString(is ? "is-IS" : "en-GB");
  const trainDays = p.plan.days.filter((d) => d.type !== "rest").length;
  return (
    <BrandPage
      doc={docTitle}
      context={[teamName, dateStr].filter(Boolean).join(" · ")}
      kicker={docTitle}
      title={p.name}
      subtitle={[p.position, teamName, dateStr].filter(Boolean).join(" · ")}
      chips={[{ text: `${p.plan.days.length} ${is ? "dagar" : "days"}` }, ...(trainDays ? [{ text: `${trainDays} ${is ? "æfingar" : "sessions"}`, tone: "cobalt" as const }] : [])]}
      note={t(p.plan.caveat)}
    >
      {/* Layer 0 — the plan in one line */}
      <Verdict tone="neutral" label={is ? "Planið" : "The plan"} headline={t(p.plan.summary)} />

      {/* Layer 1 — why this plan */}
      {p.plan.why.length > 0 && (
        <Card style={{ marginBottom: 10 }}>
          <Label>{is ? "Af hverju þetta plan" : "Why this plan"}</Label>
          <View style={{ marginTop: 3 }}>
            <Bullets items={p.plan.why.map((w) => t(w))} />
          </View>
        </Card>
      )}

      {/* Layer 2 — the days */}
      <Section title={is ? "Dagarnir" : "The days"} mt={2}>
        {p.plan.days.map((d) => (
          <View key={d.dayIndex} wrap={false} style={{ marginBottom: 6 }}>
            <Card pad={10}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={[fh(700), { fontSize: 11, flex: 1 }]}>{`${is ? "Dagur" : "Day"} ${d.dayIndex + 1} - ${t(d.title)}`}</Text>
                <Chip text={TYPE_LABEL[d.type] ? t(TYPE_LABEL[d.type]) : clean(d.type)} tone={d.type === "rest" ? "neutral" : "cobalt"} />
              </View>
              {d.blocks.map((b, i) => (
                <View key={i} wrap={false} style={{ flexDirection: "row", gap: 10, paddingVertical: 3, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.hair }}>
                  <Text style={[fb(400), { width: 110, fontSize: 8.75, color: C.mute }]}>{t(b.label)}</Text>
                  <Text style={[fb(600), { flex: 1, fontSize: 8.75, lineHeight: 1.35 }]}>{t(b.prescription)}</Text>
                </View>
              ))}
              {d.note && t(d.note) ? <Text style={[fb(400), { fontSize: 8, color: C.amberText, marginTop: 4, lineHeight: 1.35 }]}>{t(d.note)}</Text> : null}
            </Card>
          </View>
        ))}
      </Section>

      <Provenance>{is ? "RPE = áreynsla 1–10 · MAS = hámarks loftháð hraði (úr þínu prófi)" : "RPE = effort 1–10 · MAS = maximal aerobic speed (from your test)"}</Provenance>
      {/* "All the details" for the strength lifts: the same table as the app (offWeek/liftRx), on its own page. */}
      <LiftRxSection plan={{ weeks: [{ sessions: [{ blocks: [{ rx: rxForOffWeekPlan(p.plan, lang) }] }] }] }} lang={lang} hint={RX_HINT} />
    </BrandPage>
  );
}

export function OffWeekDoc({ players, lang, teamName }: { players: OffWeekPlayerPlan[]; lang: "EN" | "IS"; teamName?: string }) {
  return <Document>{players.map((p) => <PlayerPage key={p.playerId} p={p} lang={lang} teamName={teamName} />)}</Document>;
}

export async function downloadOffWeekPlanPdf(players: OffWeekPlayerPlan[], lang: "EN" | "IS", filename?: string, teamName?: string) {
  const blob = await renderPdfBlob(() => <OffWeekDoc players={players} lang={lang} teamName={teamName} />);
  saveBlob(blob, filename ?? (players.length === 1 ? `off-week-${players[0].name.replace(/\s+/g, "-")}.pdf` : "off-week-team-pack.pdf"));
}
