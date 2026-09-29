/**
 * One-page PDF of the 4-week block — a backup / hand-out for players not on the app, built from the
 * SAME block data the app sends (blockDays / blockDayMatrix), so paper matches the app. The header
 * carries a method-specific how-to (straight-sets / Contrast / French Contrast) so the coach and player
 * can run it off paper. Descriptive coaching template — the coach owns the loads.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { BLOCK_LABELS, BLOCK_LABELS_IS, METHOD_LABELS, blockDays, blockDayMatrix, type BlockDayKey, type BlockMethod } from "@/lib/micropulse/strengthBlock/upperLowerBlock";

type Lang = "EN" | "IS";

const INK = "#14181c", MUTE = "#5b6472", FAINT = "#8b8f98", LINE = "#e6e2d8", LINESOFT = "#efece3";
const ACCENT: Record<BlockDayKey, string> = {
  push: "#2740e6", quad: "#c47d14", pull: "#1c7a4a", hinge: "#7a5cc4",
  fbpush: "#2740e6", fbpull: "#1c7a4a", combo: "#7a5cc4",
};
const MAINBG = "rgba(39,64,230,0.06)";

// Method-specific header how-to — the explanation a coach/player runs the session from.
const METHOD_BLURB: Record<BlockMethod, Record<Lang, string>> = {
  upper_lower: {
    EN: "Straight sets — finish all sets of a lift before the next. Main lifts (shaded) climb in load each week as reps drop; accessories use double progression (add load once you hit the top reps).",
    IS: "Beinar settur — kláraðu allar settur af æfingu áður en þú ferð í næstu. Aðal-lyftur (skyggðar) þyngjast vikulega og reps lækka; aukaæfingar nota tvöfalda framvindu (bættu álagi þegar toppi reps er náð).",
  },
  contrast: {
    EN: "Contrast pairs: one heavy strength lift (A1) straight into an explosive / plyometric (A2) with NO rest between — the heavy lift primes the nervous system so A2 is more powerful. Rest 2–5 min after the pair, then repeat (3–6 sets). Every A2 rep is maximal intent; stop the set if speed drops.",
    IS: "Contrast pör: ein þung styrktarlyfta (A1) beint í sprengikraft / plyo (A2) ÁN hvíldar á milli — þunga lyftan kveikir á taugakerfinu svo A2 verður kraftmeiri. Hvíldu 2–5 mín eftir parið og endurtaktu (3–6 settur). Hver A2 rep með hámarks ásetningi; stoppaðu settuna ef hraðinn dettur.",
  },
  french_contrast: {
    EN: "French Contrast complex: the four exercises run back-to-back as ONE set — A1 heavy → A2 plyometric → A3 loaded jump → A4 reactive — with only 15–30 sec between (post-activation potentiation). Rest 3–5 min after A4, then repeat (3–5 sets). The most complete and most demanding power method — it needs a strength base underneath it.",
    IS: "French Contrast flétta: æfingarnar fjórar gerðar samfellt sem EIN setta — A1 þungt → A2 plyo → A3 hlaðið stökk → A4 viðbragð — með aðeins 15–30 sek á milli (post-activation potentiation). Hvíldu 3–5 mín eftir A4 og endurtaktu (3–5 settur). Fullkomnasta og kröfuharðasta kraftaðferðin — hún þarf styrktargrunn undir sér.",
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
    ex: "Exercise", rest: "Rest",
    foot: "Descriptive — the coach owns the loads. RPE = reps in reserve (RPE 8 ≈ 2 left). Deload the week after the block. Issurin 2010 (block overload) · Cormie 2011 (strength before power) · Dietz (French contrast) · van Dyk 2019 (Nordic) · Helms 2016 (RPE)." },
  IS: { prepared: "Unnið fyrir leikmann · MicroPulse", prog: "Vikuleg framvinda", progMain: "aðal-lyftur", progHeavy: "þung lyfta (A1)",
    ex: "Æfing", rest: "Hvíld",
    foot: "Lýsandi — þjálfari á álagið. RPE = reps eftir (RPE 8 ≈ 2 eftir). Niðurtröppun vikuna eftir blokkina. Issurin 2010 (blokk-álag) · Cormie 2011 (styrkur á undan krafti) · Dietz (French contrast) · van Dyk 2019 (Nordic) · Helms 2016 (RPE)." },
} as const;

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: INK },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 8.5, color: MUTE, marginTop: 3 },
  meta: { fontSize: 8.5, color: MUTE, marginTop: 2 },
  blurb: { marginTop: 8, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 8, backgroundColor: MAINBG },
  blurbTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#2740e6", textTransform: "uppercase", letterSpacing: 0.4 },
  blurbBody: { fontSize: 8.5, color: INK, marginTop: 3, lineHeight: 1.4 },
  progWrap: { flexDirection: "row", gap: 8, marginTop: 12 },
  pcell: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 7 },
  pweek: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#2740e6", textTransform: "uppercase", letterSpacing: 0.4 },
  pname: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 1 },
  pscheme: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3 },
  pmeta: { fontSize: 7.5, color: MUTE, marginTop: 1 },
  day: { marginTop: 14, breakInside: "avoid" },
  dayhead: { flexDirection: "row", alignItems: "center", gap: 6, borderLeftWidth: 4, paddingLeft: 6, marginBottom: 4 },
  dfocus: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: INK, paddingBottom: 3 },
  thc: { fontSize: 7, fontFamily: "Helvetica-Bold", color: FAINT, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: LINESOFT, paddingVertical: 4, alignItems: "center" },
  cell: { fontSize: 8.5, textAlign: "center" },
  exname: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  extag: { fontSize: 6.5, color: FAINT, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 1 },
  foot: { marginTop: 14, fontSize: 7, color: MUTE, lineHeight: 1.4, borderTopWidth: 1, borderColor: LINE, paddingTop: 8 },
});

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

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{TITLE[method][lang]}</Text>
        <Text style={s.sub}>{methodLbl} · {playerName ? `${playerName} · ` : ""}{startDate ? `${lang === "IS" ? "Byrjar" : "Starts"} ${startDate} · ` : ""}{t.prepared}</Text>
        <Text style={s.meta}>{metaLine}</Text>

        <View style={s.blurb}>
          <Text style={s.blurbTitle}>{lang === "IS" ? "Hvernig á að framkvæma" : "How to perform"} · {methodLbl}</Text>
          <Text style={s.blurbBody}>{METHOD_BLURB[method][lang]}</Text>
        </View>

        <Text style={[s.pweek, { marginTop: 14 }]}>{progLabel}</Text>
        <View style={s.progWrap}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={s.pcell}>
              <Text style={s.pweek}>{lang === "IS" ? "Vika" : "Week"} {i + 1}</Text>
              <Text style={s.pname}>{labels[i]}</Text>
              <Text style={s.pscheme}>{mainWeeks[i] ? `${mainWeeks[i].sets}×${mainWeeks[i].reps}` : "—"}</Text>
              <Text style={s.pmeta}>{mainWeeks[i]?.rpe ?? ""}</Text>
            </View>
          ))}
        </View>

        {days.map(({ dayKey }) => {
          const m = blockDayMatrix(dayKey, lang, method);
          const accent = ACCENT[dayKey];
          return (
            <View key={dayKey} style={s.day} wrap={false}>
              <View style={[s.dayhead, { borderLeftColor: accent }]}>
                <Text style={[s.dfocus, { color: accent }]}>{m.focus}</Text>
              </View>
              <View style={s.th}>
                <Text style={[s.thc, { flex: 1, textAlign: "left" }]}>{t.ex}</Text>
                {[1, 2, 3, 4].map((w) => <Text key={w} style={[s.thc, { width: 62 }]}>{lang === "IS" ? "V" : "W"}{w}</Text>)}
                <Text style={[s.thc, { width: 48 }]}>{t.rest}</Text>
              </View>
              {m.exercises.map((ex, i) => (
                <View key={i} style={[s.row, isPrimary(ex.role) ? { backgroundColor: MAINBG } : {}]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.exname}>{ex.name}</Text>
                    <Text style={[s.extag, isPrimary(ex.role) ? { color: accent } : {}]}>{ROLE_TAG[ex.role]?.[lang] ?? ex.role}</Text>
                  </View>
                  {ex.weeks.map((wk, j) => (
                    <Text key={j} style={[s.cell, { width: 62 }]}>{wk.sets}×{wk.reps}{"\n"}<Text style={{ color: MUTE, fontSize: 7 }}>{wk.rpe}</Text></Text>
                  ))}
                  <Text style={[s.cell, { width: 48, color: MUTE }]}>{ex.rest}</Text>
                </View>
              ))}
            </View>
          );
        })}

        <Text style={s.foot}>{t.foot}</Text>
      </Page>
    </Document>
  );
}

export async function downloadStrengthBlockPdf(opts: { playerName?: string | null; startDate?: string | null; method?: BlockMethod }, lang: Lang) {
  const method = opts.method ?? "upper_lower";
  const blob = await pdf(<BlockDoc lang={lang} playerName={opts.playerName} startDate={opts.startDate} method={method} />).toBlob();
  const url = URL.createObjectURL(blob);
  const slug = method === "french_contrast" ? "french-contrast" : method === "contrast" ? "contrast" : "upper-lower";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-block${opts.playerName ? `-${opts.playerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
