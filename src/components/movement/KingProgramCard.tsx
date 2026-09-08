"use client";

/**
 * Enda King program template — the concrete named exercises + doses (three parallel
 * tracks: Motor Control / Run Mechanics / Strength) that a rehab track draws from,
 * plus the King "Initial Ax" assessment template. Reference view — a neutral,
 * reusable template (no athlete data, no stored videos). Rehab-support only; the
 * clinician gates progression; never the readiness colour.
 */
import * as React from "react";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";
import {
  KING_PROGRAM, KING_TRACK_LABEL, KING_TRACK_CONTINUUM, KING_WEEK_STRUCTURE, KING_PROGRAM_CITATION,
  type KingTrack,
} from "@/lib/micropulse/movementScreen/king/program";
import { KING_ASSESSMENT_SCHEMA, KING_ASSESSMENT_CAVEAT } from "@/lib/micropulse/movementScreen/king/assessment";

const PURPLE = "#7a5cc4";
const TRACK_ORDER: KingTrack[] = ["motor_control", "run_mech", "strength"];

export default function KingProgramCard({ isEN }: { isEN: boolean }) {
  const [openProgram, setOpenProgram] = React.useState(false);
  const [openAx, setOpenAx] = React.useState(false);
  const L = (b: Bi) => (isEN ? b.en : b.is);
  const T = (en: string, is: string) => (isEN ? en : is);

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${PURPLE}33`, background: `${PURPLE}0d` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PURPLE }}>{T("Enda King program template", "Enda King prógramm-sniðmát")}</p>
        <button onClick={() => setOpenProgram((o) => !o)} className="text-[11px] font-semibold" style={{ color: PURPLE }}>
          {openProgram ? T("Hide program", "Fela prógramm") : T("Show exercises & doses", "Sýna æfingar & skammta")}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-slate-700">{L(KING_WEEK_STRUCTURE.detail)}</p>

      {openProgram && (
        <div className="mt-3 space-y-2.5">
          {TRACK_ORDER.map((track) => {
            const items = KING_PROGRAM.filter((e) => e.track === track);
            return (
              <div key={track} className="rounded-lg border bg-white p-2.5" style={{ borderColor: `${PURPLE}33` }}>
                <p className="text-[12px] font-semibold text-slate-800">{L(KING_TRACK_LABEL[track])}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{L(KING_TRACK_CONTINUUM[track])}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {items.map((e) => (
                    <li key={e.slug} className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
                      <span className="text-slate-700">
                        {e.group && <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">{L(e.group)}</span>}
                        {L(e.name)}
                        <span className="ml-1 text-[10px] text-slate-400">· {L(e.target)}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-slate-600">{L(e.dose)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-500">{T("Demonstration videos are the athlete's / King's personal content and are not stored — each exercise keeps a text cue and an optional, empty video slot a club may fill with its own demo.", "Sýnimyndbönd eru persónulegt efni íþróttamannsins / Kings og eru ekki geymd — hver æfing heldur texta-vísbendingu og valfrjálsu, tómu mynd-hólfi sem félag má fylla með eigin sýningu.")}</p>
        </div>
      )}

      {/* Assessment template (Initial Ax) — the schema the program is gated by. */}
      <div className="mt-3 border-t pt-2" style={{ borderColor: `${PURPLE}22` }}>
        <button onClick={() => setOpenAx((o) => !o)} className="text-[11px] font-semibold" style={{ color: PURPLE }}>
          {openAx ? T("Hide assessment template", "Fela mats-sniðmát") : T("Show King assessment template (Initial Ax)", "Sýna King mats-sniðmát (Initial Ax)")}
        </button>
        {openAx && (
          <div className="mt-2 space-y-2">
            {KING_ASSESSMENT_SCHEMA.map((g) => (
              <div key={g.id}>
                <p className="text-[11px] font-semibold text-slate-700">{L(g.label)}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {g.fields.map((f) => (
                    <span key={f.id} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-600" title={f.bilateral ? "R / L" : undefined}>
                      {L(f.label)}{f.bilateral ? " · R/L" : ""}{f.painFlag ? " · ⚑" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[9px] text-slate-500">{L(KING_ASSESSMENT_CAVEAT)}</p>
          </div>
        )}
      </div>

      <p className="mt-2 text-[9px] text-slate-400">{KING_PROGRAM_CITATION}</p>
    </div>
  );
}
