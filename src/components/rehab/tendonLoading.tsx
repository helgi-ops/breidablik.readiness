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

// ── Collagen synthesis & load timing (Keith Baar) — adjunct on both modules ──
// Two applied principles from Baar's engineered-ligament / tendon work:
//   1. Load timing: tendon collagen synthesis saturates after ~10 min of loading
//      and needs ~6 h to reset — short, frequent bouts beat one long session.
//   2. Targeted nutrition: hydrolysed collagen / gelatin + vitamin C ~60 min
//      before loading roughly doubles load-induced collagen synthesis (Shaw 2017).
// An ADJUNCT that supports the loading — never a substitute for the load itself.
export function CollagenSupport({ isEN }: { isEN: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Collagen synthesis & load timing" : "Kollagen-nýmyndun & tímasetning álags"}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Keith Baar</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{isEN ? "adjunct — supports the load" : "stuðningur — hjálpar álaginu"}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {isEN
          ? "Tendon collagen synthesis saturates after ~10 min of loading and needs ~6 h to reset — so short, frequent bouts beat one long session, and tendon-loading bouts should be spaced ≥ 6 h apart (this is why the isometric holds are dosed 2–3×/day)."
          : "Sina-kollagen-nýmyndun mettast eftir ~10 mín álag og þarf ~6 klst til að endurstillast — stutt og tíð álög slá eina langa lotu, og sina-álags-lotur ættu að vera með ≥ 6 klst millibili (þess vegna eru ísómetrísku haldin 2–3×/dag)."}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">{isEN ? "Intervention" : "Inngrip"}</th>
              <th className="px-3 py-2 font-semibold">{isEN ? "Dose & timing" : "Skammtur & tímasetning"}</th>
              <th className="px-3 py-2 font-semibold">{isEN ? "Purpose" : "Tilgangur"}</th>
            </tr>
          </thead>
          <tbody>
            {[
              { i: isEN ? "Hydrolysed collagen or gelatin + vitamin C" : "Hýdrólýserað kollagen eða gelatín + C-vítamín", d: isEN ? "~15 g + ~50 mg vit C, ~60 min before loading" : "~15 g + ~50 mg C-vít, ~60 mín fyrir álag", p: isEN ? "Roughly doubles load-induced collagen synthesis (Shaw 2017). Take before the loading bout so it's available." : "Um það bil tvöfaldar álags-drifna kollagen-nýmyndun (Shaw 2017). Taktu fyrir álag svo það sé til staðar." },
              { i: isEN ? "Short, frequent tendon-loading bouts" : "Stutt, tíð sina-álags-lotur", d: isEN ? "~5–10 min of loading · ≥ 6 h between bouts" : "~5–10 mín álag · ≥ 6 klst milli lota", p: isEN ? "Matches the refractory window — more total synthesis than one long session." : "Passar við refractory-gluggann — meiri heildar-nýmyndun en ein löng lota." },
              { i: isEN ? "Adequate protein" : "Nægt prótein", d: isEN ? "1.6–2.2 g/kg/day" : "1,6–2,2 g/kg/dag", p: isEN ? "Substrate for matrix + muscle repair around the tendon." : "Hráefni fyrir matrix + vöðva-viðgerð kringum sinina." },
            ].map((r, i) => (
              <tr key={i} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2 font-medium text-slate-900">{r.i}</td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.d}</td>
                <td className="px-3 py-2 text-slate-600">{r.p}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {isEN
          ? "Source: Baar 2019 (load, collagen synthesis & nutrition for tendon/ligament); Shaw et al. 2017 (gelatin + vitamin C). Adjunct evidence — the load is the primary stimulus."
          : "Heimild: Baar 2019 (álag, kollagen-nýmyndun & næring fyrir sin/liðband); Shaw o.fl. 2017 (gelatín + C-vítamín). Stuðnings-gögn — álagið er aðal-áreitið."}
      </p>
    </div>
  );
}

// ── Objective symmetry gate (coach-entered) — Stage 3 unlock ────────────────
// Generic over the metrics a module cares about (heel-raise/hop LSI for the
// Achilles, adductor-squeeze LSI + adduction:abduction ratio for the groin).
// All metrics on a 0–100% scale; the gate opens when the LOWEST entered metric
// meets `threshold`. No data is never a pass.
export function LsiGate({
  isEN, threshold = 90, metrics, unitHint,
}: {
  isEN: boolean;
  threshold?: number;
  metrics: { label: Bi; value: number | null; onChange: (v: number | null) => void }[];
  unitHint?: Bi;
}) {
  const entered = metrics.map((m) => m.value).filter((v): v is number => v != null);
  const lowest = entered.length ? Math.min(...entered) : null;

  let banner: React.ReactNode;
  if (lowest == null) {
    banner = (
      <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 p-4 text-sm text-slate-600">
        🔒 {isEN ? "Stage 3 locked — enter at least one symmetry measure. No data is not a pass." : "Fasi 3 læstur — sláðu inn a.m.k. eina samhverfu-mælingu. Engin gögn er ekki grænt ljós."}
      </div>
    );
  } else {
    const met = lowest >= threshold;
    const gap = (threshold - lowest).toFixed(0);
    banner = (
      <div className={`rounded-lg border p-4 text-sm ${met ? "border-emerald-300 bg-emerald-50" : "border-amber-400 bg-amber-50"}`}>
        <b className="block text-slate-900">
          {met ? "🔓 " : "🔒 "}
          {met ? (isEN ? "Stage 3 unlocked — symmetry criterion met" : "Fasi 3 opnaður — samhverfu-viðmið uppfyllt") : (isEN ? "Stage 3 locked — symmetry criterion not met" : "Fasi 3 læstur — samhverfu-viðmið ekki uppfyllt")}
        </b>
        <span className="mt-1 block text-slate-600">
          {met
            ? (isEN ? `Lowest measure ${lowest}% ≥ ${threshold}% ✓. Confirm pain is controlled at Stage 2 loads, then progress to energy-storage loading.` : `Lægsta mæling ${lowest}% ≥ ${threshold}% ✓. Staðfestu að verkur sé í skefjum við Fasa 2, haltu svo áfram í orkugeymslu-hleðslu.`)
            : (isEN ? `Counterfactual: ${lowest}% → needs ≥ ${threshold}% to progress to Stage 3 (${gap} points short). Hold at Stage 2 and keep building symmetry.` : `Gagnstæða: ${lowest}% → þarf ≥ ${threshold}% til að fara í Fasa 3 (${gap} stig undir). Haltu í Fasa 2 og haltu áfram að byggja samhverfu.`)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-3">
        {metrics.map((m, i) => (
          <label key={i} className="text-xs text-slate-600">{isEN ? m.label.en : m.label.is}
            <input
              type="number" min={0} max={100} inputMode="numeric"
              value={m.value ?? ""}
              onChange={(e) => m.onChange(e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))))}
              placeholder="—"
              className="ml-1 w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <span className="ml-1 text-slate-400">%</span>
          </label>
        ))}
        {unitHint && <span className="text-xs text-slate-400">{isEN ? unitHint.en : unitHint.is}</span>}
      </div>
      {banner}
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
