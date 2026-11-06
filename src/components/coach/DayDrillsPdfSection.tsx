/**
 * "Drills by MD day" — the print section shared by the block PDF and the full Periodization Hub PDF.
 * One row per training day type the block uses: drills from published studies paired to it (see
 * `dayDrillSheet.ts`), each with its citation, beside the general ideas. Never the coach's own library. Layered: the one-line read is the section hint, the table
 * the detail, the method + citations the provenance line. It starts its own page and stays whole, so the
 * table never splits from its header. Built only from the brand kit.
 */
import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { C, Provenance, Section, Table, clean, fb, fh, type Col } from "@/components/pdf/brand";
import { ideaText, researchDrillPrint, type DayDrillRow } from "@/lib/micropulse/dayDrillSheet";

type Lang = "EN" | "IS";
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

const L = {
  EN: {
    title: "Drills by MD day",
    hint: "For each training day in the block: drills from published studies that fit it, and a few ideas beside them.",
    hintIdeas: "A few ideas for each training day in the block.",
    day: "Day", research: "From research", ideas: "Ideas", none: "No study drill is paired to this day",
    footResearch: "Research drills are paired to a day by a rule, not AI: small games on a tight pitch for a mechanical day, mid-size games for a mixed day, large games or interval runs for a running day (Hill-Haas 2011; Riboli 2020). Each was measured on the players of its own study, who are not your squad.",
    foot: "The ideas are examples to start from; a citation covers the pitch size, bout length or load level, not the game itself. Descriptive planning, never the readiness colour.",
  },
  IS: {
    title: "Drillur eftir MD-degi",
    hint: "Fyrir hvern æfingadag í lotunni: drillur úr birtum rannsóknum sem passa við hann, og nokkrar hugmyndir við hliðina.",
    hintIdeas: "Nokkrar hugmyndir fyrir hvern æfingadag í lotunni.",
    day: "Dagur", research: "Úr rannsóknum", ideas: "Hugmyndir", none: "Engin rannsóknardrilla er pöruð við daginn",
    footResearch: "Rannsóknardrillur eru paraðar við dag með reglu, ekki gervigreind: fámennir leikir á þröngu svæði á mechanical-degi, miðlungsstórir leikir á mixed-degi, stórir leikir eða interval hlaup á hlaupadegi (Hill-Haas 2011; Riboli 2020). Hver þeirra var mæld á leikmönnum sinnar rannsóknar, sem eru ekki þitt lið.",
    foot: "Hugmyndirnar eru dæmi til að byrja á; heimild á við um svæðið, lotulengdina eða álagið, ekki leikinn sjálfan. Lýsandi áætlun, aldrei readiness-liturinn.",
  },
};

export function DayDrillsSection({ rows, lang }: { rows: DayDrillRow[] | null | undefined; lang: Lang }) {
  if (!rows || rows.length === 0) return null;
  const isIS = lang === "IS";
  const t = L[lang];
  const hasResearch = rows.some((r) => r.research.length > 0);
  const cols: Col[] = [{ label: t.day, width: 74 }, ...(hasResearch ? [{ label: t.research, flex: 1.15 }] : []), { label: t.ideas, flex: 1 }];
  return (
    <Section title={t.title} hint={hasResearch ? t.hint : t.hintIdeas} break wrap={false}>
      <Table
        size={8}
        cols={cols}
        rows={rows.map((r) => [
          <View key="d">
            <Text style={[fh(700), { fontSize: 8.5, color: C.cobalt }]}>{tx(r.mds.slice(0, 3).join(" · "))}</Text>
            <Text style={[fb(600), { fontSize: 8 }]}>{tx(isIS ? r.label.is : r.label.en)}</Text>
          </View>,
          ...(hasResearch ? [
            <View key="o">
              {r.research.length === 0 ? <Text style={[fb(400), { fontSize: 7.75, color: C.mute }]}>{tx(t.none)}</Text> : r.research.map((d) => {
                const p = researchDrillPrint(d, isIS);
                return (
                  <Text key={d.id} style={[fb(600), { fontSize: 8, lineHeight: 1.3, marginBottom: 2 }]}>
                    {tx(p.name)}
                    {p.meta ? <Text style={[fb(400), { fontSize: 7.5 }]}>{` · ${tx(p.meta)}`}</Text> : null}
                    {p.finding ? <Text style={[fb(400), { fontSize: 7.5 }]}>{` · ${tx(p.finding)}`}</Text> : null}
                    {p.cite ? <Text style={[fb(400), { fontSize: 7.5, color: C.mute }]}>{` (${tx(p.cite)})`}</Text> : null}
                  </Text>
                );
              })}
            </View>,
          ] : []),
          <View key="i">
            {r.ideas.map((p, j) => (
              <Text key={j} style={[fb(400), { fontSize: 7.75, lineHeight: 1.3, marginBottom: 1.5 }]}>
                {tx(ideaText(p, isIS))}
                {p.cite ? <Text style={{ color: C.mute }}>{` (${tx(p.cite)})`}</Text> : null}
              </Text>
            ))}
          </View>,
        ])}
      />
      <Provenance>{tx(hasResearch ? `${t.footResearch} ${t.foot}` : t.foot)}</Provenance>
    </Section>
  );
}
