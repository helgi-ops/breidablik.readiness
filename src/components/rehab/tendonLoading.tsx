"use client";

/**
 * Shared building blocks for the staged tendon-loading modules
 * (Jumper's Knee / patellar and Achilles). Both modules share the same tab
 * shape, exercise-table layout and — critically — the Silbernagel/Thomeé
 * pain-monitoring gate. Only the provocation-test label differs by region
 * (decline-squat for the knee, heel-raise for the Achilles).
 *
 * Descriptive/educational only — nothing here touches the readiness verdict.
 */

import React from "react";

export type Row = { ex: string; dose: string; notes: string };

// Bilingual label pair.
export type Bi = { en: string; is: string };

// Player-reported markers (from the daily tendon check-in) that inform the gate.
export type Reported = {
  provocationVas: number | null;
  stiffnessVas: number | null;
  trend: "lower" | "same" | "higher" | null;
  date: string;
} | null;

export function ExerciseTable({ rows, isEN }: { rows: Row[]; isEN: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">{isEN ? "Exercise" : "Æfing"}</th>
            <th className="px-3 py-2 font-semibold">{isEN ? "Dose" : "Skammtur"}</th>
            <th className="px-3 py-2 font-semibold">{isEN ? "Notes" : "Athugasemdir"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              <td className="px-3 py-2 font-medium text-slate-900">{r.ex}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.dose}</td>
              <td className="px-3 py-2 text-slate-600">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── The pain-monitoring gate (Silbernagel / Thomeé) — shown on EVERY stage ───
// The safety rail. Loading is safe within a bounded pain range; this encodes the
// rule and turns three markers into a clear progress / hold / drop-back state.
// `provocationFull` names the daily test (e.g. "Single-leg heel-raise");
// `provocationShort` is the strip label (e.g. "heel-raise pain").
export function PainGate({
  isEN, reported, provocationFull, provocationShort,
}: {
  isEN: boolean;
  reported?: Reported;
  provocationFull: Bi;
  provocationShort: Bi;
}) {
  const [pain, setPain] = React.useState<number | null>(null);
  const [settled, setSettled] = React.useState<"yes" | "no" | null>(null);
  const [stiffness, setStiffness] = React.useState<"lower" | "same" | "higher" | null>(null);

  const answered = pain !== null && settled !== null && stiffness !== null;
  const overLimit = pain !== null && pain > 5;
  const tolerated = answered && !overLimit && settled === "yes" && stiffness !== "higher";

  let verdict: { tone: "ok" | "bad" | "neutral"; head: string; body: string };
  if (!answered) {
    verdict = {
      tone: "neutral",
      head: isEN ? "Log today's markers" : "Skráðu mælingar dagsins",
      body: isEN
        ? "Enter the three markers to get a hold / progress / drop-back read."
        : "Sláðu inn mælingarnar þrjár til að fá hald / áfram / bakka niður.",
    };
  } else if (tolerated) {
    verdict = {
      tone: "ok",
      head: isEN ? "Loading tolerated — hold or progress" : "Álag þolað — haltu eða haltu áfram",
      body: isEN
        ? "Pain within limits, settled by morning, stiffness not rising. The dose is appropriate — hold this stage or progress once the stage's own criteria are met."
        : "Verkur innan marka, sjatnaði í morgun, stífleiki ekki vaxandi. Skammturinn er réttur — haltu þessum fasa eða haltu áfram þegar viðmið fasans standast.",
    };
  } else {
    verdict = {
      tone: "bad",
      head: isEN ? "Back off — reduce load / drop back a stage" : "Bakka — minnka álag / fara niður um fasa",
      body: isEN
        ? `The dose was too high: ${[overLimit ? "pain above 5/10" : null, settled === "no" ? "did not settle by next morning" : null, stiffness === "higher" ? "morning stiffness rising week to week" : null].filter(Boolean).join(" · ")}.`
        : `Skammturinn var of hár: ${[overLimit ? "verkur yfir 5/10" : null, settled === "no" ? "sjatnaði ekki fyrir næsta morgun" : null, stiffness === "higher" ? "morgunstífleiki vaxandi milli vikna" : null].filter(Boolean).join(" · ")}.`,
    };
  }

  const toneCls =
    verdict.tone === "ok"
      ? "border-emerald-300 bg-emerald-50"
      : verdict.tone === "bad"
        ? "border-red-300 bg-red-50"
        : "border-slate-300 bg-slate-50";

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          {isEN ? "Pain-monitoring gate — every session" : "Verkja-vöktunar-hlið — hver session"}
        </h4>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">Silbernagel · Thomeé</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {isEN
          ? `Pain up to 5/10 during loading is acceptable · must settle to baseline by the next morning · morning stiffness must not rise week to week. ${provocationFull.en} (VAS 0–10) is the daily provocation test.`
          : `Verkur allt að 5/10 við álag er í lagi · verður að sjatna í grunnlínu fyrir næsta morgun · morgunstífleiki má ekki vaxa milli vikna. ${provocationFull.is} (VAS 0–10) er daglega provokations-prófið.`}
      </p>

      {reported && (reported.provocationVas != null || reported.stiffnessVas != null) && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white px-3 py-2 text-xs text-slate-600">
          <b className="text-violet-700">{isEN ? "Player-reported" : "Leikmaður skráði"}</b>{" "}
          <span className="text-slate-400">({reported.date})</span> ·{" "}
          {reported.provocationVas != null && <>{isEN ? provocationShort.en : provocationShort.is} {reported.provocationVas}/10</>}
          {reported.provocationVas != null && reported.stiffnessVas != null && " · "}
          {reported.stiffnessVas != null && <>{isEN ? "morning stiffness" : "morgunstífleiki"} {reported.stiffnessVas}/10</>}
          {reported.trend && <> · {isEN ? "stiffness trend" : "stífleika-þróun"} {isEN ? reported.trend : reported.trend === "higher" ? "meiri" : reported.trend === "lower" ? "minni" : "sami"}</>}
          {(reported.provocationVas != null && reported.provocationVas > 5) || reported.trend === "higher" ? (
            <span className="mt-1 block font-medium text-red-700">{isEN ? "→ player-reported markers say back off" : "→ skráðar mælingar segja: bakka"}</span>
          ) : reported.provocationVas != null ? (
            <span className="mt-1 block font-medium text-emerald-700">{isEN ? "→ player-reported markers within limits" : "→ skráðar mælingar innan marka"}</span>
          ) : null}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">{isEN ? "Pain during loading (0–10)" : "Verkur við álag (0–10)"}</span>
          <select
            value={pain ?? ""}
            onChange={(e) => setPain(e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">{isEN ? "Settled to baseline by next morning?" : "Sjatnaði í grunnlínu í morgun?"}</span>
          <select
            value={settled ?? ""}
            onChange={(e) => setSettled((e.target.value || null) as "yes" | "no" | null)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            <option value="yes">{isEN ? "Yes" : "Já"}</option>
            <option value="no">{isEN ? "No" : "Nei"}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">{isEN ? "Morning stiffness vs last week" : "Morgunstífleiki vs. síðasta vika"}</span>
          <select
            value={stiffness ?? ""}
            onChange={(e) => setStiffness((e.target.value || null) as "lower" | "same" | "higher" | null)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            <option value="lower">{isEN ? "Lower" : "Minni"}</option>
            <option value="same">{isEN ? "Same" : "Sami"}</option>
            <option value="higher">{isEN ? "Higher" : "Meiri"}</option>
          </select>
        </label>
      </div>

      <div className={`mt-3 rounded-md border p-3 ${toneCls}`}>
        <b className="block text-sm text-slate-900">{verdict.head}</b>
        <span className="text-sm text-slate-600">{verdict.body}</span>
      </div>
    </div>
  );
}
