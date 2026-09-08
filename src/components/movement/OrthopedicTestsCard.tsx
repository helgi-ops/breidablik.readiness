"use client";

/**
 * Orthopedic special-test recommendations — a clinician referral aid. Two entry
 * points, the two keys: (1) SCREEN-DRIVEN — tests the movement-screen findings
 * point to (passed from the API, grouped by region); (2) COACH-DRIVEN — the coach
 * names the region the player is dealing with and gets that region's test cluster
 * (computed client-side from the same pure catalog). MicroPulse suggests the tests;
 * a clinician performs and interprets them. Never a diagnosis, never the colour.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { RegionKey } from "@/lib/micropulse/movementScreen/vision/regions";
import { REGIONS } from "@/lib/micropulse/movementScreen/vision/regions";
import { orthoTestsForRegion, groupOrthoByRegion, ORTHO_CAVEAT, type OrthoTest } from "@/lib/micropulse/movementScreen/correctives/orthopedicTests";

type Group = { region: RegionKey; tests: OrthoTest[] };
const BLUE = "#2740e6";
const REGION_LABEL: Record<RegionKey, Bi> = Object.fromEntries(REGIONS.map((r) => [r.key, r.label])) as Record<RegionKey, Bi>;

function TestList({ tests, isEN }: { tests: OrthoTest[]; isEN: boolean }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  return (
    <ul className="mt-1 space-y-1.5">
      {tests.map((t) => (
        <li key={t.id} className="text-[12px]">
          <span className="font-semibold text-slate-800">{L(t.name)}</span>
          <span className="ml-1 text-[10px] text-slate-400">· {L(t.assesses)}</span>
          <div className="text-[11px] text-slate-600">{T("If positive:", "Ef jákvætt:")} {L(t.indicates)}</div>
        </li>
      ))}
    </ul>
  );
}

export default function OrthopedicTestsCard({ screenGroups, isEN }: { screenGroups: Group[]; isEN: boolean }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  const [region, setRegion] = React.useState<RegionKey | "">("");
  const regionTests = region ? orthoTestsForRegion(region) : [];
  const regionGroups = region ? groupOrthoByRegion(regionTests) : [];

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${BLUE}22`, background: `${BLUE}08` }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: BLUE }}>{T("Orthopedic tests to consider (clinician)", "Klínísk sérpróf til að íhuga (klíníker)")}</p>

      {/* (1) Screen-driven — what the movement screen points to. */}
      {screenGroups.length > 0 ? (
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-slate-700">{T("From the movement screen", "Úr hreyfiskimuninni")}</p>
          <div className="mt-1 space-y-2">
            {screenGroups.map((g) => (
              <div key={g.region}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{L(REGION_LABEL[g.region])}</p>
                <TestList tests={g.tests} isEN={isEN} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">{T("No screen findings to route tests from yet — or pick a region below.", "Engar skimunar-niðurstöður til að leiða próf af enn — eða veldu svæði að neðan.")}</p>
      )}

      {/* (2) Coach-driven — name the region the player is dealing with. */}
      <div className="mt-3 border-t pt-2" style={{ borderColor: `${BLUE}18` }}>
        <label className="text-[11px] font-semibold text-slate-700">{T("Or: what region is the player dealing with?", "Eða: hvaða svæði er leikmaðurinn að glíma við?")}
          <select value={region} onChange={(e) => setRegion(e.target.value as RegionKey | "")} className="mt-0.5 block w-full max-w-xs rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]">
            <option value="">{T("— pick a region —", "— veldu svæði —")}</option>
            {REGIONS.map((r) => <option key={r.key} value={r.key}>{L(r.label)}</option>)}
          </select>
        </label>
        {region && regionGroups.map((g) => (
          <div key={g.region} className="mt-1.5"><TestList tests={g.tests} isEN={isEN} /></div>
        ))}
      </div>

      <p className="mt-2 text-[9px] text-slate-500">{L(ORTHO_CAVEAT)}</p>
    </div>
  );
}
