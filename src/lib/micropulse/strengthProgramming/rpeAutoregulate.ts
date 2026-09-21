/**
 * RPE autoregulation — the non-VBT analogue of the engine's `vbtAutoRegulated`. From the RPE a player
 * logged on his working sets vs the prescribed RPE, SUGGEST a load nudge for next session. It only
 * ever SUGGESTS; the coach approves — it never silently changes the prescribed load (mirrors the
 * VBT "coach owns / overrides" pattern). Descriptive — never sets the readiness colour or the daily
 * decision. Pure, no I/O.
 *
 * Cite: Zourdos 2016 (RPE/RIR), Helms 2016 (autoregulation). VBT caps: Pareja-Blanco 2017.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type AutoregSuggestion = "hold" | "add_load" | "reduce_load";
export interface RpeAutoregRead {
  lift: string;
  prescribedRpe: number | null;
  loggedRpeMean: number | null;
  delta: number | null;                 // loggedMean − prescribed
  suggestion: AutoregSuggestion;
  note: Bi;
  confidence: "high" | "moderate" | "low";
}

// A full RPE point below/above target = a real load mismatch (Zourdos/Helms); ±<1 = on target.
const THRESHOLD = 1.0;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function rpeAutoregulate(opts: { prescribedRpe: number | null; loggedRpe: number[]; lift?: string }): RpeAutoregRead {
  const lift = opts.lift ?? "";
  const logged = (opts.loggedRpe ?? []).filter((v): v is number => num(v) && v >= 0 && v <= 10);
  const prescribed = num(opts.prescribedRpe) ? opts.prescribedRpe : null;

  // Not enough to judge → hold, low confidence, honest note.
  if (prescribed == null || logged.length < 2) {
    return {
      lift, prescribedRpe: prescribed, loggedRpeMean: logged.length ? r1(logged.reduce((a, b) => a + b, 0) / logged.length) : null,
      delta: null, suggestion: "hold", confidence: "low",
      note: { en: "Not enough logged RPE to autoregulate yet — log ≥2 working sets against a prescribed RPE.", is: "Ekki nóg skráð RPE til að sjálfstilla enn — skráðu ≥2 vinnusett á móti settu RPE." },
    };
  }

  const mean = r1(logged.reduce((a, b) => a + b, 0) / logged.length);
  const delta = r1(mean - prescribed);
  const confidence: RpeAutoregRead["confidence"] = logged.length >= 3 ? "high" : "moderate";

  let suggestion: AutoregSuggestion; let note: Bi;
  if (delta <= -THRESHOLD) {
    suggestion = "add_load";
    note = {
      en: `Logged RPE ${mean} sat ${Math.abs(delta)} below the ${prescribed} target — the load was easier than prescribed. Suggest +2.5–5% next session (coach approves).`,
      is: `Skráð RPE ${mean} var ${Math.abs(delta)} undir ${prescribed} markinu — álagið var léttara en fyrirskrifað. Legg til +2,5–5% næst (þjálfari samþykkir).`,
    };
  } else if (delta >= THRESHOLD) {
    suggestion = "reduce_load";
    note = {
      en: `Logged RPE ${mean} sat ${delta} above the ${prescribed} target — harder than prescribed. Suggest −5% or hold next session (coach approves).`,
      is: `Skráð RPE ${mean} var ${delta} yfir ${prescribed} markinu — erfiðara en fyrirskrifað. Legg til −5% eða halda næst (þjálfari samþykkir).`,
    };
  } else {
    suggestion = "hold";
    note = {
      en: `Logged RPE ${mean} matched the ${prescribed} target — hold the load.`,
      is: `Skráð RPE ${mean} passaði við ${prescribed} markið — haltu álaginu.`,
    };
  }

  return { lift, prescribedRpe: prescribed, loggedRpeMean: mean, delta, suggestion, note, confidence };
}
