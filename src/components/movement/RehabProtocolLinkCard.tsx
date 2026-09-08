"use client";

/**
 * Matching rehab protocol — the bridge from a movement-screen finding to the DB
 * staged-loading rehab protocol (jumper's knee / Achilles / adductor) that carries
 * the clinical staged exercises. The screen routes the coach to the right protocol;
 * the protocol's stages stay clinician-gated (pain + symmetry). Never a diagnosis,
 * never the readiness colour.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import type { RehabProtocolLink } from "@/lib/micropulse/movementScreen/correctives/rehabProtocolLinks";

const PURPLE = "#7a5cc4";

export default function RehabProtocolLinkCard({ protocols, isEN, playerId }: { protocols: RehabProtocolLink[]; isEN: boolean; playerId?: string }) {
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);
  if (!protocols.length) return null;
  const href = (coachPath: string) => (playerId ? `${coachPath}?player=${encodeURIComponent(playerId)}` : coachPath);

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${PURPLE}33`, background: `${PURPLE}0d` }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>{T("Matching rehab protocol (staged loading)", "Samsvarandi endurhæfingar-prótókoll (þrepaskipt)")}</p>
      <p className="mt-1 text-[11px] text-slate-600">{T("The findings point to a staged-loading protocol that carries the clinical exercises. Open it to review the stages and send it to the player — the stages are clinician-gated by pain + symmetry.", "Niðurstöðurnar benda á þrepaskipt álags-prótókoll sem geymir klínísku æfingarnar. Opnaðu það til að fara yfir þrepin og senda á leikmanninn — þrepin eru klíníker-stýrð eftir verk + samhverfu.")}</p>
      <ul className="mt-2 space-y-1.5">
        {protocols.map((p) => (
          <li key={p.slug} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5" style={{ borderColor: `${PURPLE}22` }}>
            <span>
              <span className="text-[12px] font-semibold text-slate-800">{L(p.title)}</span>
              <span className="ml-1.5 text-[10px] text-slate-500">{L(p.why)}</span>
            </span>
            <a href={href(p.coachPath)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-white" style={{ background: PURPLE }}>
              {T("Open protocol →", "Opna prótókoll →")}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[9px] text-slate-500">{T("Rehab-support only — the staged protocol is clinician-gated; pain / diagnosis → clinician. Never the readiness colour.", "Aðeins endurhæfingar-stuðningur — þrepaskipta prótókollið er klíníker-stýrt; verkur / greining → klíníker. Aldrei readiness-liturinn.")}</p>
    </div>
  );
}
