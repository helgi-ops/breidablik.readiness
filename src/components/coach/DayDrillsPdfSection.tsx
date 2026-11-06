/**
 * "Drills by MD day" — the print section shared by the block PDF and the full Periodization Hub PDF.
 * One row per training day type the block uses: the coach's own drills that fit it (rule-picked, see
 * `dayDrillSheet.ts`) beside the general ideas. Layered: the one-line read is the section hint, the table
 * the detail, the method + citations the provenance line. It starts its own page and stays whole, so the
 * table never splits from its header. Built only from the brand kit.
 */
import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { C, Provenance, Section, Table, clean, fb, fh, type Col } from "@/components/pdf/brand";
import { ideaText, ownDrillMeta, type DayDrillRow } from "@/lib/micropulse/dayDrillSheet";

type Lang = "EN" | "IS";
const tx = (s: unknown) => clean(String(s ?? "").replace(/→/g, "->")).replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=");

const L = {
  EN: {
    title: "Drills by MD day",
    hint: "For each training day in the block: the drills from your own library that fit it, and a few ideas beside them.",
    hintIdeas: "A few ideas for each training day in the block. No drill in your library fits these days yet, so none are named.",
    day: "Day", own: "From your library", ideas: "Ideas", none: "None in your library fit this day",
    lowMin: "For the players who played little",
    footOwn: "Your drills are picked by a rule, not AI: the day's type and the pitch size per player (Hill-Haas 2011), best match first.",
    foot: "The ideas are examples to start from; a citation covers the pitch size, bout length or load level, not the game itself. Descriptive planning, never the readiness colour.",
  },
  IS: {
    title: "Drillur eftir MD-degi",
    hint: "Fyrir hvern æfingadag í lotunni: drillurnar úr þínu eigin safni sem passa við hann, og nokkrar hugmyndir við hliðina.",
    hintIdeas: "Nokkrar hugmyndir fyrir hvern æfingadag í lotunni. Engin drilla í safninu þínu passar við þessa daga enn, svo engar eru nefndar.",
    day: "Dagur", own: "Úr þínu safni", ideas: "Hugmyndir", none: "Engin í safninu passar við daginn",
    lowMin: "Fyrir þá sem spiluðu lítið",
    footOwn: "Drillurnar þínar eru valdar með reglu, ekki gervigreind: eftir tegund dagsins og svæði á leikmann (Hill-Haas 2011), besta samsvörun fyrst.",
    foot: "Hugmyndirnar eru dæmi til að byrja á; heimild á við um svæðið, lotulengdina eða álagið, ekki leikinn sjálfan. Lýsandi áætlun, aldrei readiness-liturinn.",
  },
};

export function DayDrillsSection({ rows, lang }: { rows: DayDrillRow[] | null | undefined; lang: Lang }) {
  if (!rows || rows.length === 0) return null;
  const isIS = lang === "IS";
  const t = L[lang];
  const hasOwn = rows.some((r) => r.own.length > 0);
  const cols: Col[] = [{ label: t.day, width: 74 }, ...(hasOwn ? [{ label: t.own, flex: 1 }] : []), { label: t.ideas, flex: hasOwn ? 1.3 : 1 }];
  return (
    <Section title={t.title} hint={hasOwn ? t.hint : t.hintIdeas} break wrap={false}>
      <Table
        size={8}
        cols={cols}
        rows={rows.map((r) => [
          <View key="d">
            <Text style={[fh(700), { fontSize: 8.5, color: C.cobalt }]}>{tx(r.mds.slice(0, 3).join(" · "))}</Text>
            <Text style={[fb(600), { fontSize: 8 }]}>{tx(isIS ? r.label.is : r.label.en)}</Text>
          </View>,
          ...(hasOwn ? [
            <View key="o">
              {r.lowMinutes && r.own.length > 0 ? <Text style={[fb(400), { fontSize: 7, color: C.mute, marginBottom: 1 }]}>{tx(t.lowMin)}</Text> : null}
              {r.own.length === 0 ? <Text style={[fb(400), { fontSize: 7.75, color: C.mute }]}>{tx(t.none)}</Text> : r.own.map((d) => {
                const meta = ownDrillMeta(d, isIS);
                return (
                  <Text key={d.id} style={[fb(600), { fontSize: 8, lineHeight: 1.3, marginBottom: 1.5 }]}>
                    {tx(d.name)}
                    {meta ? <Text style={[fb(400), { fontSize: 7.25, color: C.mute }]}>{` ${tx(meta)}`}</Text> : null}
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
      <Provenance>{tx(hasOwn ? `${t.footOwn} ${t.foot}` : t.foot)}</Provenance>
    </Section>
  );
}
