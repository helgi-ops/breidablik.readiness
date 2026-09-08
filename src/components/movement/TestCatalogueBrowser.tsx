"use client";

/**
 * Test catalogue browser — the published movement-quality assessment menu a coach
 * selects from (Wijekulasuriya et al. 2025). Read-only browser: categorised, with
 * the shippable default battery highlighted, speed/laterality/scoring tags, what
 * each screens for, and honest pose-measurable / proprietary / injury-prediction
 * flags. Screening/training only — never a diagnosis, never the readiness colour.
 */
import * as React from "react";
import { useLang } from "@/lib/lang";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import {
  catalogueByCategory, defaultBattery, CATALOGUE_CATEGORY_LABEL, CATALOGUE_SPEED_LABEL,
  CATALOGUE_LATERALITY_LABEL, CATALOGUE_SCORING_LABEL, CATALOGUE_INJURY_CAVEAT, CATALOGUE_REFERENCE,
  type CatalogueTest,
} from "@/lib/micropulse/movementScreen/testCatalogue";

const BLUE = "#2740e6";

export default function TestCatalogueBrowser() {
  const [lang] = useLang();
  const is = lang === "IS";
  const L = (b: Bi) => (is ? b.is : b.en);
  const T = (en: string, isT: string) => (is ? isT : en);
  const groups = React.useMemo(() => catalogueByCategory(), []);
  const battery = React.useMemo(() => defaultBattery(), []);
  const total = groups.reduce((n, g) => n + g.tests.length, 0);

  const Tag = ({ children }: { children: React.ReactNode }) => (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{children}</span>
  );

  const Row = ({ x }: { x: CatalogueTest }) => (
    <li className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-slate-800">{L(x.name)}</span>
        {x.defaultBattery && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: BLUE }}>{T("STANDARD", "STAÐALL")}</span>}
        {x.instrumentedSlug && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">{T("auto-measure", "sjálf-mæling")}</span>}
        {!x.instrumentedSlug && x.poseMeasurable && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">{T("pose-measurable", "pose-mælanlegt")}</span>}
        {x.proprietary && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">{T("reference only", "aðeins tilvísun")}</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Tag>{L(CATALOGUE_SPEED_LABEL[x.speed])}</Tag>
        <Tag>{L(CATALOGUE_LATERALITY_LABEL[x.laterality])}</Tag>
        <Tag>{L(CATALOGUE_SCORING_LABEL[x.scoring])}</Tag>
      </div>
      <p className="mt-1 text-[12px] text-slate-600">{L(x.screensFor)}</p>
      {x.proprietary && <p className="mt-0.5 text-[10px] italic text-amber-700">{L(x.proprietary)}</p>}
    </li>
  );

  return (
    <div className="space-y-3">
      {/* Intro + the default battery */}
      <div className="rounded-xl border p-4" style={{ borderColor: `${BLUE}22`, background: `${BLUE}08` }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BLUE }}>{T("Standard movement screen", "Stöðluð hreyfiskimun")}</p>
        <p className="mt-1 text-[12px] text-slate-700">{T(`A broad ${battery.length}-test battery spanning slow-bilateral → slow-unilateral → high-speed-bilateral → high-speed-unilateral — more informative than any single composite score (Wijekulasuriya 2025).`, `Breið ${battery.length}-prófa prófun sem spannar hægt-tvíhliða → hægt-einhliða → háhraði-tvíhliða → háhraði-einhliða — meira upplýsandi en nokkurt stakt samsett skor (Wijekulasuriya 2025).`)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {battery.map((x) => <span key={x.slug} className="rounded-lg border px-1.5 py-0.5 text-[11px] font-medium" style={{ borderColor: `${BLUE}55`, color: "#1f2b7a" }}>{L(x.name)}</span>)}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">{T(`${total} published assessments across ${groups.length} categories. Coach-scored by eye/video (pose-measurable where marked); results feed the deficit ledger.`, `${total} birt möt í ${groups.length} flokkum. Þjálfari skorar með auga/myndbandi (pose-mælanlegt þar sem merkt); niðurstöður fæða halla-bókina.`)}</p>

      {/* Categories */}
      {groups.map((g) => (
        <div key={g.category} className="rounded-xl border border-slate-200 bg-white/60 p-3">
          <p className="text-[12px] font-semibold text-slate-800">{L(CATALOGUE_CATEGORY_LABEL[g.category])} <span className="text-[10px] font-normal text-slate-400">· {g.tests.length}</span></p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {g.tests.map((x) => <Row key={x.slug} x={x} />)}
          </ul>
        </div>
      ))}

      {/* Evidence caveat + reference */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[10px] text-slate-500">{L(CATALOGUE_INJURY_CAVEAT)}</p>
        <p className="mt-2 text-[9px] text-slate-400">{CATALOGUE_REFERENCE}</p>
      </div>
    </div>
  );
}
