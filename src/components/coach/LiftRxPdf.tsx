/**
 * "Strength: every variable" for the "Speed & power" PDFs (lota 7): one small table per distinct gym lift in the plan
 * (load, how hard, rep speed, rest, warm-up, when to add weight, how often, and the bar-speed device lines), each
 * line with where its number comes from, then the sources those lines cite. Sets × reps stay in the week tables.
 *
 * Shared by QualityPlanPdf, SpeedPlanPdf, GoalPlanPdf and OffWeekPlanPdf (its own `hint`). Styling: shared MicroPulse PDF kit (src/components/pdf/brand.tsx).
 */

import { Text, View } from "@react-pdf/renderer";
import {
  RX_BAR_LABEL,
  RX_BAR_TITLE,
  RX_REFS,
  RX_ROW_LABEL,
  RX_ROW_ORDER,
  RX_SOURCE_LABEL,
  distinctLifts,
  rxRefsUsed,
  type LiftRx,
  type RxLine,
} from "@/lib/micropulse/goalPlan/liftRx";
import type { Bi } from "@/lib/micropulse/goalPlan/types";
import { VERIFIED_LABEL } from "@/lib/micropulse/speedMethods";
import { C, Provenance, Section, Table, clean, fh } from "@/components/pdf/brand";

type Lang = "EN" | "IS";
type PlanWithRx = { weeks: { sessions: { blocks: { rx?: LiftRx[] }[] }[] }[] };

export function LiftRxSection({ plan, lang, hint }: { plan: PlanWithRx; lang: Lang; hint?: Bi }) {
  const lifts = distinctLifts(plan);
  if (!lifts.length) return null;
  const L = (b: Bi) => clean(lang === "IS" ? b.is : b.en);
  const IS = lang === "IS";
  const src = (l: RxLine) => {
    const shorts = (l.refs ?? []).map((k) => RX_REFS[k]?.short).filter(Boolean);
    return clean(`${L(RX_SOURCE_LABEL[l.source])}${shorts.length ? `: ${shorts.join(", ")}` : ""}`);
  };
  const refs = rxRefsUsed(lifts);
  return (
    <Section
      title={IS ? "Styrkur: allar breytur" : "Strength: every variable"}
      hint={hint ? L(hint) : IS ? "Ein tafla á hverja lyftu; sett × endurtekningar standa í vikutöflunum." : "One table per lift; sets × reps are in the week tables."}
      break
    >
      {lifts.map((r, i) => (
        <View key={i} wrap={false} style={{ marginBottom: 7 }}>
          <Text style={[fh(700), { fontSize: 9.5, marginBottom: 3 }]}>{L(r.exercise)}</Text>
          <Table
            dense
            cols={[
              { label: IS ? "Breyta" : "Variable", width: 92 },
              { label: IS ? "Hvernig" : "How", flex: 2.2 },
              { label: IS ? "Uppruni" : "Source", flex: 1 },
            ]}
            rows={[
              ...RX_ROW_ORDER.filter((k) => k !== "order" && k !== "frequency" && r.rows[k]).map((k) => [L(RX_ROW_LABEL[k]), L(r.rows[k]!.text), src(r.rows[k]!)]),
              ...r.barSpeed.map((x) => [`${L(RX_BAR_TITLE)}: ${L(RX_BAR_LABEL[x.key]).toLowerCase()}`, L(x.line.text), src(x.line)]),
            ]}
          />
        </View>
      ))}
      {refs.length > 0 && (
        <View style={{ marginTop: 2 }}>
          <Text style={[fh(700), { fontSize: 8.5, color: C.mute, marginBottom: 2 }]}>{IS ? "Heimildir fyrir breyturnar" : "Sources for the variables"}</Text>
          {refs.map((r) => (
            <Provenance key={r.key}>{clean(`${r.cite} [${L(VERIFIED_LABEL[r.verifiedFrom])}]`)}</Provenance>
          ))}
        </View>
      )}
    </Section>
  );
}
