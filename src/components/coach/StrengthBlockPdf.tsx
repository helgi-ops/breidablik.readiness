/**
 * One-page PDF of the 4-week Upper/Lower block — a backup / hand-out for players not on the app, built
 * from the SAME block data the app sends (buildBlockSchedule / blockDayMatrix), so paper matches the app.
 * Descriptive coaching template — the coach owns the loads.
 */

import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { BLOCK_DAY_ORDER, BLOCK_LABELS, BLOCK_LABELS_IS, METHOD_LABELS, blockDayMatrix, type BlockDayKey, type BlockMethod } from "@/lib/micropulse/strengthBlock/upperLowerBlock";

type Lang = "EN" | "IS";

const INK = "#14181c", MUTE = "#5b6472", FAINT = "#8b8f98", LINE = "#e6e2d8", LINESOFT = "#efece3";
const ACCENT: Record<BlockDayKey, string> = { push: "#2740e6", quad: "#c47d14", pull: "#1c7a4a", hinge: "#7a5cc4" };
const MAINBG = "rgba(39,64,230,0.06)";

const L = {
  EN: { title: "4-Week Upper/Lower Block", prepared: "Prepared for the player · MicroPulse",
    meta: "4 weeks · 4×/week · Mon Push · Tue Quad · Thu Pull · Fri Hinge · progressive overload",
    prog: "Weekly progression — main lifts", ex: "Exercise", rest: "Rest", main: "Main", acc: "Accessory", ecc: "Eccentric",
    foot: "Main lifts climb in load each week (reps drop); accessories use double progression — add load when you hit the top reps. RPE = reps in reserve (RPE 8 ≈ 2 left). Deload the week after. Descriptive — the coach owns the loads. Issurin 2010 · van Dyk 2019 (Nordic) · Helms 2016 (RPE)." },
  IS: { title: "4-vikna efri/neðri blokk", prepared: "Unnið fyrir leikmann · MicroPulse",
    meta: "4 vikur · 4×/viku · Mán Ýta · Þri Framlæri · Fim Tog · Fös Mjaðmahjör · stígandi álag",
    prog: "Vikuleg framvinda — aðal-lyftur", ex: "Æfing", rest: "Hvíld", main: "Aðal", acc: "Auka", ecc: "Sérvirkni",
    foot: "Aðal-lyftur þyngjast vikulega (reps lækka); aukaæfingar nota tvöfalda framvindu — bættu álagi þegar toppi reps náð. RPE = reps eftir (RPE 8 ≈ 2 eftir). Niðurtröppun vikuna eftir. Lýsandi — þjálfari á álagið. Issurin 2010 · van Dyk 2019 (Nordic) · Helms 2016 (RPE)." },
} as const;


const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: INK },
  h1: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 8.5, color: MUTE, marginTop: 3 },
  meta: { fontSize: 8.5, color: MUTE, marginTop: 2 },
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
  // The method's headline (heavy/main) progression, read from the squat day's first lift.
  const mainWeeks = blockDayMatrix("quad", lang, method).exercises[0]?.weeks ?? [];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{t.title}</Text>
        <Text style={s.sub}>{methodLbl} · {playerName ? `${playerName} · ` : ""}{startDate ? `${lang === "IS" ? "Byrjar" : "Starts"} ${startDate} · ` : ""}{t.prepared}</Text>
        <Text style={s.meta}>{t.meta}</Text>

        <Text style={[s.pweek, { marginTop: 14 }]}>{t.prog}</Text>
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

        {BLOCK_DAY_ORDER.map((dayKey) => {
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
                <View key={i} style={[s.row, ex.role === "main" ? { backgroundColor: MAINBG } : {}]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.exname}>{ex.name}</Text>
                    <Text style={[s.extag, ex.role === "main" ? { color: accent } : {}]}>{ex.role === "main" ? t.main : ex.role === "nordic" ? t.ecc : t.acc}</Text>
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
  const blob = await pdf(<BlockDoc lang={lang} playerName={opts.playerName} startDate={opts.startDate} method={opts.method ?? "upper_lower"} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `upper-lower-block${opts.playerName ? `-${opts.playerName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}` : ""}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
