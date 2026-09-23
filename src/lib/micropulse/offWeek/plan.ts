/**
 * Off-week / holiday MAINTENANCE program — pure, deterministic.
 *
 * A week off is a maintenance micro-block, not a building block (Rønnestad 2011: ~1–2 strength
 * sessions/week + some running retains the pre-break level; Mujika & Padilla 2000: detraining is
 * avoided, not reversed, in a week). This composes a self-guided multi-day plan a player can do
 * ANYWHERE, OFFLINE — prescriptions are RPE / time / distance / reps only, never GPS- or coach-gated.
 *
 * Individualised BY NEED: a per-player `needs` profile (assembled server-side from the signals the app
 * already computes) weights the week — more eccentric, more running, a strength lean, lighter, or
 * "continue your rehab track" — on top of the player's own loads (oneRepMaxes else bodyweight) and
 * speeds (masKmh else time/RPE). Advisory; the coach edits before sending. Never the readiness colour.
 *
 * Cite: Rønnestad 2011 (in-season maintenance dose); Mujika & Padilla 2000 (detraining);
 *       Buchheit & Laursen (MAS running zones).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type GymAccess = "gym" | "bodyweight";

export interface PlayerNeeds {
  deficitEmphases?: string[];                                          // eccentric / unilateral / hamstring / adductor / asymmetry (unifiedDeficits)
  belowAerobicReq?: boolean;                                           // positionFitnessRequirements / fitness fit
  masTrend?: "up" | "stable" | "down" | null;                         // fitnessTrend
  strengthLean?: "hypertrophy" | "max_strength" | "power" | "balanced" | null; // preseasonEmphasis + bodyComp
  rtpTrack?: string | null;                                            // continue this rehab track instead of a generic plan
  fatigueFlag?: boolean;                                               // recent minutes + robustnessWatch → lighten
}

export interface OffWeekInputs {
  days: number;                              // 1–10 (clamped)
  masKmh: number | null;                     // running speeds; null → time/RPE only
  oneRepMaxes?: Record<string, number> | null; // gym loads; null/empty → bodyweight prescriptions
  gymAccess: GymAccess;
  needs: PlayerNeeds;
  readinessNote?: string | null;             // e.g. carrying a niggle → lighten
}

export interface OffWeekDay {
  dayIndex: number;
  type: "strength" | "run" | "combined" | "rest";
  title: Bi;
  blocks: Array<{ label: Bi; prescription: Bi }>;
  note: Bi;
}

export interface OffWeekPlan {
  days: OffWeekDay[];
  summary: Bi;
  caveat: Bi;
  why: Bi[];               // the per-player rationale (layer-1 "why")
}

type Slot = "strength" | "runEasy" | "runTempo" | "rest";

const round5 = (n: number) => Math.round(n / 5) * 5;
const paceAt = (masKmh: number | null, frac: number): string | null =>
  masKmh && masKmh > 0 ? `~${(Math.round(masKmh * frac * 2) / 2).toFixed(1)} km/h` : null;

/** The base maintenance skeleton for N days — rest separates hard days; extras drop first when short. */
function baseSlots(days: number): Slot[] {
  const d = Math.max(1, Math.min(10, Math.round(days)));
  const table: Record<number, Slot[]> = {
    1: ["strength"],
    2: ["strength", "runEasy"],
    3: ["strength", "runEasy", "strength"],
    4: ["strength", "runEasy", "strength", "runTempo"],
    5: ["strength", "runEasy", "strength", "runTempo", "rest"],
    6: ["strength", "runEasy", "rest", "strength", "runTempo", "runEasy"],
    7: ["strength", "runEasy", "rest", "strength", "runTempo", "runEasy", "rest"],
  };
  if (table[d]) return table[d];
  // 8–10 → the 7 skeleton + trailing easy/rest
  const extra: Slot[] = ["runEasy", "rest", "rest"];
  return [...table[7], ...extra.slice(0, d - 7)];
}

/** Apply the needs profile to the slot list (which sessions, before writing prescriptions). */
function shapeSlots(base: Slot[], needs: PlayerNeeds): Slot[] {
  let slots = [...base];
  // Fatigue → no hard intervals; tempo becomes easy (fewer hard days).
  if (needs.fatigueFlag) slots = slots.map((s) => (s === "runTempo" ? "runEasy" : s));
  // Aerobic need (below requirement or MAS trending down) → ensure a tempo/interval run exists…
  const wantsTempo = !needs.fatigueFlag && (needs.belowAerobicReq || needs.masTrend === "down");
  if (wantsTempo && !slots.includes("runTempo")) {
    const i = slots.indexOf("runEasy");
    if (i >= 0) slots[i] = "runTempo"; else { const r = slots.indexOf("rest"); if (r >= 0) slots[r] = "runTempo"; }
  }
  // …and below-requirement adds running VOLUME: turn a rest into an easy run when there's room.
  if (needs.belowAerobicReq) { const r = slots.indexOf("rest"); if (r >= 0) slots[r] = "runEasy"; }
  return slots;
}

function strengthBlocks(inp: OffWeekInputs): Array<{ label: Bi; prescription: Bi }> {
  const { needs, oneRepMaxes, gymAccess } = inp;
  const has1rm = !!oneRepMaxes && Object.keys(oneRepMaxes).length > 0;
  const kg = (lift: string): string => {
    const v = oneRepMaxes?.[lift]; return v && v > 0 ? ` (~${round5(v * 0.78)} kg)` : "";
  };
  const blocks: Array<{ label: Bi; prescription: Bi }> = [];

  if (gymAccess === "bodyweight" || !has1rm) {
    // Bodyweight maintenance circuit — no gym needed.
    blocks.push({ label: { en: "Lower body", is: "Neðri líkami" }, prescription: { en: "Bulgarian split squat 3×8/leg · single-leg RDL 3×8/leg — controlled, RPE 7", is: "Búlgarskt klofstökk 3×8/fót · einfætt RDL 3×8/fót — stjórnað, RPE 7" } });
    blocks.push({ label: { en: "Push / pull", is: "Ýta / toga" }, prescription: { en: "Push-ups 3×max-2 · inverted row or band row 3×10", is: "Armbeygjur 3×hámark-2 · öfug róður eða teygju-róður 3×10" } });
  } else {
    const lean = needs.strengthLean ?? "balanced";
    const scheme = lean === "hypertrophy" ? "3×8–10 @ RPE 7–8" : lean === "max_strength" ? "4×3–5 @ RPE 8" : lean === "power" ? "5×3 explosive @ RPE 7 (fast intent)" : "3×5 @ RPE 7";
    const schemeIs = lean === "hypertrophy" ? "3×8–10 @ RPE 7–8" : lean === "max_strength" ? "4×3–5 @ RPE 8" : lean === "power" ? "5×3 sprengikraftur @ RPE 7 (hratt)" : "3×5 @ RPE 7";
    blocks.push({ label: { en: "Main lower lift", is: "Aðal fótalyfta" }, prescription: { en: `Squat or trap-bar deadlift ${scheme}${kg("squat") || kg("trap_bar_deadlift") || kg("deadlift")}`, is: `Hnébeygja eða trap-bar réttstöðulyfta ${schemeIs}${kg("squat") || kg("trap_bar_deadlift") || kg("deadlift")}` } });
    blocks.push({ label: { en: "Upper", is: "Efri líkami" }, prescription: { en: `Bench or press + a row, ${scheme}${kg("bench")}`, is: `Bekkpressa eða pressa + róður, ${schemeIs}${kg("bench")}` } });
  }

  // Deficit-driven emphasis (always low-load, injury-prevention).
  const def = (needs.deficitEmphases ?? []).map((x) => x.toLowerCase());
  const hasEcc = def.some((d) => /eccentric|hamstring|nordic/.test(d));
  const hasAdd = def.some((d) => /adductor|groin|copenhagen/.test(d));
  const hasUni = def.some((d) => /unilateral|asymmetr/.test(d));
  if (hasEcc) blocks.push({ label: { en: "Hamstring (eccentric)", is: "Aftanlæri (eccentric)" }, prescription: { en: "Nordic hamstring 3×5 (slow lower) — van Dyk 2019", is: "Nordic aftanlæri 3×5 (hægt niður) — van Dyk 2019" } });
  if (hasAdd) blocks.push({ label: { en: "Adductor", is: "Innanlæri" }, prescription: { en: "Copenhagen plank 3×20–30 s/side — Harøy 2019", is: "Copenhagen planki 3×20–30 s/hlið — Harøy 2019" } });
  if (hasUni && gymAccess === "gym") blocks.push({ label: { en: "Unilateral / symmetry", is: "Einfætt / samhverfa" }, prescription: { en: "Extra single-leg set on the weaker side (3×8)", is: "Auka einfætt sett á veikari hlið (3×8)" } });
  return blocks;
}

function runBlocks(kind: "easy" | "tempo", inp: OffWeekInputs): Array<{ label: Bi; prescription: Bi }> {
  const { masKmh, needs } = inp;
  if (kind === "easy") {
    const p = paceAt(masKmh, 0.68);
    return [{ label: { en: "Easy aerobic", is: "Rólegt þol" }, prescription: { en: `25–30 min continuous, RPE 5–6${p ? ` (~${p} = 68% MAS)` : ""}`, is: `25–30 mín samfellt, RPE 5–6${p ? ` (${p} = 68% MAS)` : ""}` } }];
  }
  // tempo / interval at the player's MAS zones (Buchheit/Laursen).
  const iv = paceAt(masKmh, 1.0), tempo = paceAt(masKmh, 0.88);
  const volume = needs.belowAerobicReq ? "6–8" : "5–6";
  return [{
    label: { en: "Tempo / intervals", is: "Tempó / brot" },
    prescription: {
      en: masKmh ? `${volume} × 2 min at ~100% MAS (${iv}), 2 min jog between — or 15 min tempo at ${tempo}` : `${volume} × 2 min hard (RPE 8), 2 min easy jog between`,
      is: masKmh ? `${volume} × 2 mín á ~100% MAS (${iv}), 2 mín skokk á milli — eða 15 mín tempó á ${tempo}` : `${volume} × 2 mín strembið (RPE 8), 2 mín rólegt á milli`,
    },
  }];
}

export function buildOffWeekPlan(inp: OffWeekInputs): OffWeekPlan {
  const days = Math.max(1, Math.min(10, Math.round(inp.days)));
  const why: Bi[] = [];

  // RTP players keep their rehab track — never a generic plan over it.
  if (inp.needs.rtpTrack) {
    const track = inp.needs.rtpTrack;
    const list: OffWeekDay[] = [];
    for (let i = 0; i < days; i++) {
      const isRun = i % 2 === 1;
      list.push(isRun
        ? { dayIndex: i, type: "run", title: { en: "Easy aerobic", is: "Rólegt þol" }, blocks: runBlocks("easy", inp), note: { en: "Keep it easy — no hard running while on the RTP track.", is: "Haltu því rólegu — ekkert strembið hlaup á RTP-ferli." } }
        : { dayIndex: i, type: "strength", title: { en: "Continue your RTP / rehab track", is: "Haltu áfram RTP / endurhæfingu" }, blocks: [{ label: { en: "Rehab track", is: "Endurhæfing" }, prescription: { en: `Continue the prescribed rehab work (${track}) — same progressions as this week.`, is: `Haltu áfram fyrirskrifaðri endurhæfingu (${track}) — sömu framvindur og í þessari viku.` } }], note: { en: "Do not replace rehab with general training.", is: "Ekki skipta endurhæfingu út fyrir almenna þjálfun." } });
    }
    why.push({ en: `On a return-to-play track — the off-week keeps his rehab (${track}), not a generic plan.`, is: `Á endurkomu-ferli — fríið heldur endurhæfingunni (${track}), ekki almennu plani.` });
    return {
      days: list,
      summary: { en: "Off-week — continue the return-to-play track, with easy aerobic between.", is: "Frívika — haltu endurkomu-ferlinu, með rólegu þoli á milli." },
      caveat: { en: "Maintenance / rehab — self-guided. Follow the medical/RTP plan first; the coach edits before sending.", is: "Viðhald / endurhæfing — sjálf-leiðbeint. Fylgdu lækna-/RTP-plani fyrst; þjálfari lagar fyrir sendingu." },
      why,
    };
  }

  const slots = shapeSlots(baseSlots(days), inp.needs);
  const lighten = inp.needs.fatigueFlag;

  const list: OffWeekDay[] = slots.map((slot, i) => {
    if (slot === "rest") return { dayIndex: i, type: "rest" as const, title: { en: "Rest / mobility", is: "Hvíld / liðleiki" }, blocks: [{ label: { en: "Recovery", is: "Endurheimt" }, prescription: { en: "Full rest or 15 min easy mobility + walk.", is: "Full hvíld eða 15 mín léttur liðleiki + ganga." } }], note: { en: "Recovery is part of the plan.", is: "Endurheimt er hluti af planinu." } };
    if (slot === "strength") return { dayIndex: i, type: "strength" as const, title: { en: "Strength (maintenance)", is: "Styrkur (viðhald)" }, blocks: strengthBlocks(inp), note: lighten ? { en: "Lighter — stop 2 reps short of failure.", is: "Léttara — hættu 2 endurt. frá þrotum." } : { en: "Maintenance dose — quality over volume.", is: "Viðhaldsskammtur — gæði fram yfir magn." } };
    const kind = slot === "runTempo" ? "tempo" : "easy";
    return { dayIndex: i, type: "run" as const, title: kind === "tempo" ? { en: "Tempo / interval run", is: "Tempó / brotahlaup" } : { en: "Easy run", is: "Rólegt hlaup" }, blocks: runBlocks(kind, inp), note: kind === "tempo" && lighten ? { en: "Ease off if legs are heavy.", is: "Slakaðu á ef fæturnir eru þungir." } : { en: "Self-paced.", is: "Á eigin hraða." } };
  });

  // Assemble the "why".
  const def = inp.needs.deficitEmphases ?? [];
  if (def.some((d) => /eccentric|hamstring|nordic/i.test(d))) why.push({ en: "Extra eccentric hamstring work — a posterior-chain / hamstring deficit.", is: "Auka eccentric aftanlæri — aftanlæris-halli." });
  if (def.some((d) => /adductor|groin|copenhagen/i.test(d))) why.push({ en: "Adductor work kept in — a groin/adductor flag.", is: "Innanlæris-vinna höfð inni — nára-merki." });
  if (def.some((d) => /unilateral|asymmetr/i.test(d))) why.push({ en: "Extra single-leg work — a left/right asymmetry.", is: "Auka einfætt vinna — vinstri/hægri ómhverfa." });
  if (inp.needs.belowAerobicReq) why.push({ en: "More running volume — below his position's aerobic requirement.", is: "Meira hlaupamagn — undir þolkröfu stöðunnar." });
  if (inp.needs.masTrend === "down") why.push({ en: "A tempo/interval run added — aerobic capacity trending down.", is: "Tempó/brotahlaup bætt við — þol á niðurleið." });
  if (inp.needs.strengthLean && inp.needs.strengthLean !== "balanced") why.push({ en: `Strength leaned to ${inp.needs.strengthLean.replace("_", " ")} — from his profile + body comp.`, is: `Styrkur hallar að ${inp.needs.strengthLean.replace("_", " ")} — úr prófíl + líkamsástandi.` });
  if (lighten) why.push({ en: "Lighter week — carrying load/fatigue from recent matches.", is: "Léttari vika — ber álag/þreytu úr nýlegum leikjum." });
  if (why.length === 0) why.push({ en: "Balanced maintenance — no strong flag; keep the engine ticking.", is: "Jafnvægis-viðhald — engin sterk vísbending; haltu vélinni gangandi." });

  return {
    days: list,
    summary: { en: `Off-week maintenance — ${slots.filter((s) => s === "strength").length} strength + ${slots.filter((s) => s.startsWith("run")).length} runs, self-guided.`, is: `Frívika viðhald — ${slots.filter((s) => s === "strength").length} styrkur + ${slots.filter((s) => s.startsWith("run")).length} hlaup, sjálf-leiðbeint.` },
    caveat: { en: "Maintenance — not a building block. Loads/speeds are only as accurate as the last test; the coach edits before sending.", is: "Viðhald — ekki uppbyggingar-lota. Þyngdir/hraðar eru aðeins jafn nákvæmir og síðasta próf; þjálfari lagar fyrir sendingu." },
    why,
  };
}
