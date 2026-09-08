"use client";

/**
 * Clinical assessment ideas — a clinician referral/education layer. After a
 * movement screen flags a finding, MicroPulse suggests the orthopaedic special
 * tests a clinician would assess next, each with a plain "what it screens for /
 * why here" explanation (MicroPulse's own words; Magee cited as further reading,
 * not reproduced). Two entry points: SCREEN-DRIVEN (the flagged compensations) and
 * COACH-DRIVEN (name the region the player is dealing with).
 *
 * MicroPulse suggests; a clinician performs and interprets. Pain / red flag /
 * trauma → refer. Never a diagnosis, never the readiness colour. Collapsible
 * Level-2 detail — never in the primary verdict.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { RegionKey } from "@/lib/micropulse/movementScreen/vision/regions";
import { REGIONS } from "@/lib/micropulse/movementScreen/vision/regions";
import type { CompensationKey } from "@/lib/micropulse/movementScreen/correctives/registry";
import {
  buildAssessmentIdeas, orthoTestsForRegion, GROIN_SUGGESTION, ORTHO_CAVEAT, MAGEE_REFERENCE,
  type OrthoTest,
} from "@/lib/micropulse/movementScreen/correctives/orthopedicTests";

const BLUE = "#2740e6";
const AMBER = "#de9328";
const REGION_LABEL: Record<RegionKey, Bi> = Object.fromEntries(REGIONS.map((r) => [r.key, r.label])) as Record<RegionKey, Bi>;

function TestRow({ t, isEN }: { t: OrthoTest; isEN: boolean }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  return (
    <li className="text-[12px]">
      <span className="font-semibold text-slate-800">{L(t.name)}</span>
      <span className="ml-1 text-[10px] text-slate-400">· {L(t.assesses)}</span>
      {t.refer && <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: `${AMBER}22`, color: AMBER }}>{T("refer", "tilvísun")}</span>}
      <div className="text-[11px] text-slate-600">{T("If positive:", "Ef jákvætt:")} {L(t.indicates)}</div>
    </li>
  );
}

export default function OrthopedicTestsCard({ compensations, isEN, defaultOpen }: { compensations: CompensationKey[]; isEN: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const { ideas, anyRefer } = React.useMemo(() => buildAssessmentIdeas(compensations), [compensations]);

  const [region, setRegion] = React.useState<RegionKey | "">("");
  const regionTests = region ? orthoTestsForRegion(region) : [];

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${BLUE}22`, background: `${BLUE}08` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BLUE }}>{T("Clinical assessment ideas", "Klínískar mats-hugmyndir")}</p>
        <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold" style={{ color: BLUE }}>
          {open ? T("Hide", "Fela") : ideas.length ? T(`Show (${ideas.length} finding${ideas.length > 1 ? "s" : ""})`, `Sýna (${ideas.length})`) : T("Show", "Sýna")}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-600">{T("What a clinician would look at next — ideas for the coach, assessed & interpreted by a clinician.", "Hvað klíníker myndi skoða næst — hugmyndir fyrir þjálfarann, metið & túlkað af klíníker.")}</p>

      {open && (
        <div className="mt-3 space-y-3">
          {anyRefer && (
            <div className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold" style={{ background: `${AMBER}18`, color: AMBER }}>
              {T("Pain, trauma or suspected pathology → refer to a clinician before any loading.", "Verkur, áverki eða grunur um meinafræði → vísaðu til klíníkers áður en nokkuð er hlaðið.")}
            </div>
          )}

          {/* (1) Screen-driven ideas — per flagged finding, with the plain "why here". */}
          {ideas.length > 0 ? ideas.map((idea) => (
            <div key={idea.finding} className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${BLUE}22` }}>
              <p className="text-[12px] font-semibold text-slate-800">{L(idea.findingLabel)}{idea.refer && <span className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: `${AMBER}22`, color: AMBER }}>{T("refer", "tilvísun")}</span>}</p>
              <p className="mt-0.5 text-[11px] text-slate-600">{L(idea.rationale)}</p>
              {idea.groups.map((g) => (
                <div key={g.region} className="mt-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{L(REGION_LABEL[g.region])}</p>
                  <ul className="mt-0.5 space-y-1">{g.tests.map((t) => <TestRow key={t.id} t={t} isEN={isEN} />)}</ul>
                </div>
              ))}
            </div>
          )) : (
            <p className="text-[11px] text-slate-500">{T("No flagged findings to route tests from — or pick a region below.", "Engar merktar niðurstöður til að leiða próf af — eða veldu svæði að neðan.")}</p>
          )}

          {/* (2) Coach-driven — name the region the player is dealing with. */}
          <div className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${BLUE}22` }}>
            <label className="text-[11px] font-semibold text-slate-700">{T("Or: what region is the player dealing with?", "Eða: hvaða svæði er leikmaðurinn að glíma við?")}
              <select value={region} onChange={(e) => setRegion(e.target.value as RegionKey | "")} className="mt-0.5 block w-full max-w-xs rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
                <option value="">{T("— pick a region —", "— veldu svæði —")}</option>
                {REGIONS.map((r) => <option key={r.key} value={r.key}>{L(r.label)}</option>)}
              </select>
            </label>
            {region === "hip" && (
              <p className="mt-1.5 rounded px-2 py-1 text-[11px]" style={{ background: `${AMBER}14`, color: "#7a5a1e" }}>{L(GROIN_SUGGESTION.rationale)}</p>
            )}
            {region && <ul className="mt-1.5 space-y-1">{regionTests.map((t) => <TestRow key={t.id} t={t} isEN={isEN} />)}</ul>}
          </div>

          <p className="text-[9px] text-slate-500">{L(ORTHO_CAVEAT)}</p>
          <p className="text-[9px] text-slate-400">{L(MAGEE_REFERENCE)}</p>
        </div>
      )}
    </div>
  );
}
