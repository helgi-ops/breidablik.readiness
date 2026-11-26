/**
 * PDF of the 4-week block — a backup / hand-out for players not on the app, built from the
 * SAME block data the app sends (blockDays / blockDayMatrix), so paper matches the app. The top carries
 * the method-specific how-to (straight-sets / Contrast / French Contrast) so the coach and player
 * can run it off paper. Descriptive coaching template — the coach owns the loads.
 * Exercise order is exactly the engine's (power before strength in the power methods).
 *
 * Styling: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Document, Text, View } from "@react-pdf/renderer";
import { BLOCK_LABELS, BLOCK_LABELS_IS, METHOD_LABELS, blockDays, blockDayMatrix, type BlockMethod } from "@/lib/micropulse/strengthBlock/upperLowerBlock";
import { BrandPage, C, FactRow, Provenance, Section, Table, Verdict, clean, fb, fh, renderPdfBlob, saveBlob } from "@/components/pdf/brand";

type Lang = "EN" | "IS";

/** Kit text helper: typographic clean-up + the maths glyphs Archivo/Helvetica lack. */
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

// Method-specific how-to — the explanation a coach/player runs the session from.
const METHOD_BLURB: Record<BlockMethod, Record<Lang, string>> = {
  upper_lower: {
    EN: "Straight sets — finish all sets of a lift before the next. Main lifts (shaded) climb in load each week as reps drop; accessories use double progression (add load once you hit the top reps).",
    IS: "Beinar settur — kláraðu allar settur af æfingu áður en þú ferð í næstu. Aðal-lyftur (skyggðar) þyngjast vikulega og reps lækka; aukaæfingar nota tvöfalda framvindu (bættu álagi þegar toppi reps er náð).",
  },
  contrast: {
    EN: "Contrast pairs: one heavy strength lift (A1) straight into an explosive / plyometric (A2) with NO rest between — the heavy lift may help A2 feel more powerful, and the pair trains strength and speed in one go. Rest 2–5 min after the pair, then repeat (3–6 sets). Every A2 rep is maximal intent; stop the set if speed drops.",
    IS: "Contrast pör: ein þung styrktarlyfta (A1) beint í sprengikraft / plyo (A2) ÁN hvíldar á milli — þunga lyftan getur hjálpað A2 að verða kraftmeiri, og parið þjálfar styrk og hraða í einu. Hvíldu 2–5 mín eftir parið og endurtaktu (3–6 settur). Hver A2 rep með hámarks ásetningi; stoppaðu settuna ef hraðinn dettur.",
  },
  french_contrast: {
    EN: "French Contrast complex: the four exercises run back-to-back as ONE set — A1 heavy, A2 plyometric, A3 loaded jump, A4 reactive — with only 15–30 sec between; the idea is that the heavy lift helps the fast moves that follow. Rest 3–5 min after A4, then repeat (3–5 sets). The most complete and most demanding power method — it needs a strength base underneath it.",
    IS: "French Contrast flétta: æfingarnar fjórar gerðar samfellt sem EIN setta — A1 þungt, A2 plyo, A3 hlaðið stökk, A4 viðbragð — með aðeins 15–30 sek á milli; hugmyndin er að þunga lyftan hjálpi hröðu æfingunum sem fylgja. Hvíldu 3–5 mín eftir A4 og endurtaktu (3–5 settur). Fullkomnasta og kröfuharðasta kraftaðferðin — hún þarf styrktargrunn undir sér.",
  },
};

const TITLE: Record<BlockMethod, Record<Lang, string>> = {
  upper_lower: { EN: "4-Week Upper/Lower Block", IS: "4-vikna efri/neðri blokk" },
  contrast: { EN: "4-Week Contrast Block", IS: "4-vikna Contrast blokk" },
  french_contrast: { EN: "4-Week French Contrast Block", IS: "4-vikna French Contrast blokk" },
};

// Role → column tag. Power roles carry their A1–A4 slot so the complex reads in order on paper.
const ROLE_TAG: Record<string, Record<Lang, string>> = {
  main: { EN: "Main", IS: "Aðal" },
  accessory: { EN: "Accessory", IS: "Auka" },
  nordic: { EN: "Eccentric", IS: "Sérvirkni" },
  heavy: { EN: "Heavy · A1", IS: "Þungt · A1" },
  plyo: { EN: "Plyo · A2", IS: "Plyo · A2" },
  loadedjump: { EN: "Loaded jump · A3", IS: "Hlaðið stökk · A3" },
  reactive: { EN: "Reactive · A4", IS: "Viðbragð · A4" },
};
const isPrimary = (role: string) => role === "main" || role === "heavy";

const L = {
  EN: { prepared: "Prepared for the player · MicroPulse", prog: "Weekly progression", progMain: "main lifts", progHeavy: "heavy lift (A1)",
    ex: "Exercise", rest: "Rest", how: "How to perform", week: "Week", days: "The sessions", daysHint: "Shaded rows are the primary lift. Each cell = sets × reps, with the target effort (RPE) under it.",
    note: "Descriptive — the coach owns the loads. Deload the week after the block.",
    foot: "Descriptive — the coach owns the loads. RPE = reps in reserve (RPE 8 ≈ 2 left). Deload the week after the block. Issurin 2010 (block overload) · Cormie 2011 (strength before power) · Dietz (French contrast) · van Dyk 2019 (Nordic) · Helms 2016 (RPE)." },
  IS: { prepared: "Unnið fyrir leikmann · MicroPulse", prog: "Vikuleg framvinda", progMain: "aðal-lyftur", progHeavy: "þung lyfta (A1)",
    ex: "Æfing", rest: "Hvíld", how: "Hvernig á að framkvæma", week: "Vika", days: "Æfingarnar", daysHint: "Skyggðar línur eru aðal-lyftan. Hver reitur = settur × reps, með markálag (RPE) undir.",
    note: "Lýsandi — þjálfari á álagið. Niðurtröppun vikuna eftir blokkina.",
    foot: "Lýsandi — þjálfari á álagið. RPE = reps eftir (RPE 8 ≈ 2 eftir). Niðurtröppun vikuna eftir blokkina. Issurin 2010 (blokk-álag) · Cormie 2011 (styrkur á undan krafti) · Dietz (French contrast) · van Dyk 2019 (Nordic) · Helms 2016 (RPE)." },
} as const;

function BlockDoc({ lang, playerName, startDate, method }: { lang: Lang; playerName?: string | null; startDate?: string | null; method: BlockMethod }) {
  const t = L[lang];
  const labels = lang === "IS" ? BLOCK_LABELS_IS : BLOCK_LABELS;
  const methodLbl = lang === "IS" ? METHOD_LABELS[method].is : METHOD_LABELS[method].en;
  const days = blockDays(method, lang);
  // Schedule line: "4 weeks · 3×/week · Mon Push · Wed Pull · Fri Combo · progressive overload".
  const shortFocus = (f: string) => f.split("—").pop()!.trim();
  const metaLine = `${lang === "IS" ? "4 vikur" : "4 weeks"} · ${days.length}×/${lang === "IS" ? "viku" : "week"} · ${days.map((d) => `${d.dayName} ${shortFocus(d.focus)}`).join(" · ")} · ${lang === "IS" ? "stígandi álag" : "progressive overload"}`;
  // Headline progression: the first day's first lift (upper_lower = main lift, power = heavy A1).
  const mainWeeks = blockDayMatrix(days[0]?.dayKey ?? "push", lang, method).exercises[0]?.weeks ?? [];
  const progLabel = `${t.prog} — ${method === "upper_lower" ? t.progMain : t.progHeavy}`;
  const subtitle = `${methodLbl} · ${playerName ? `${playerName} · ` : ""}${startDate ? `${lang === "IS" ? "Byrjar" : "Starts"} ${startDate} · ` : ""}${t.prepared}`;

  return (
    <Document>
      <BrandPage
        doc={lang === "IS" ? "Styrktarblokk" : "Strength block"}
        context={playerName ?? undefined}
        kicker={methodLbl}
        title={TITLE[method][lang]}
        subtitle={subtitle}
        note={t.note}
      >
        {/* Layer 0 — what this block is and how to run it */}
        <Verdict tone="neutral" label={`${t.how} · ${methodLbl}`} headline={tx(metaLine)} body={tx(METHOD_BLURB[method][lang])} />

        {/* Layer 1 — the weekly progression of the headline lift */}
        <Section title={tx(progLabel)} mt={2}>
          <FactRow
            facts={[0, 1, 2, 3].map((i) => ({
              value: mainWeeks[i] ? `${mainWeeks[i].sets}×${mainWeeks[i].reps}` : "-",
              label: `${t.week} ${i + 1} · ${labels[i]}`,
              sub: mainWeeks[i]?.rpe ?? "",
            }))}
          />
        </Section>

        {/* Layer 2 — the full day tables */}
        <Section title={t.days} hint={t.daysHint} mt={0}>
          {days.map(({ dayKey, dayName }, di) => {
            const m = blockDayMatrix(dayKey, lang, method);
            return (
              <View key={dayKey} wrap={false} style={{ marginBottom: 9 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, borderLeftWidth: 3, borderLeftColor: C.cobalt, paddingLeft: 6, marginBottom: 4 }}>
                  <Text style={[fb(600), { fontSize: 7.5, letterSpacing: 0.8, color: C.cobalt }]}>{`${lang === "IS" ? "DAGUR" : "DAY"} ${di + 1} · ${clean(dayName).toUpperCase()}`}</Text>
                  <Text style={[fh(700), { fontSize: 11.5 }]}>{tx(m.focus)}</Text>
                </View>
                <Table
                  cols={[
                    { label: t.ex, flex: 1 },
                    ...[1, 2, 3, 4].map((w) => ({ label: `${lang === "IS" ? "V" : "W"}${w} · ${labels[w - 1]}`, width: 70, align: "center" as const })),
                    { label: t.rest, width: 48, align: "center" },
                  ]}
                  rowTone={(i) => (isPrimary(m.exercises[i]?.role ?? "") ? "cobalt" : null)}
                  rows={m.exercises.map((ex) => [
                    <View key="n">
                      <Text style={[fb(600), { fontSize: 9 }]}>{tx(ex.name)}</Text>
                      <Text style={[fb(600), { fontSize: 6.75, letterSpacing: 0.5, color: isPrimary(ex.role) ? C.cobalt : C.faint, marginTop: 1 }]}>{clean(ROLE_TAG[ex.role]?.[lang] ?? ex.role).toUpperCase()}</Text>
                    </View>,
                    ...ex.weeks.map((wk, j) => (
                      <View key={j} style={{ alignItems: "center" }}>
                        <Text style={[fh(700), { fontSize: 9.5 }]}>{`${wk.sets}×${wk.reps}`}</Text>
                        <Text style={[fb(400), { fontSize: 7, color: C.mute }]}>{tx(wk.rpe)}</Text>
                      </View>
                    )),
                    <Text key="r" style={[fb(400), { fontSize: 8, color: C.mute, textAlign: "center" }]}>{tx(ex.rest)}</Text>,
                  ])}
                />
              </View>
            );
          })}
        </Section>

        <Provenance>{tx(t.foot)}</Provenance>
      </BrandPage>
    </Document>
  );
}

export async function downloadStrengthBlockPdf(opts: { playerName?: string | null; startDate?: string | null; method?: BlockMethod }, lang: Lang) {
  const method = opts.method ?? "upper_lower";
  const blob = await renderPdfBlob(() => <BlockDoc lang={lang} playerName={opts.playerName} startDate={opts.startDate} method={method} />);
  const slug = method === "french_contrast" ? "french-contrast" : method === "contrast" ? "contrast" : "upper-lower";
  saveBlob(blob, `${slug}-block${opts.playerName ? `-${opts.playerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}.pdf`);
}
