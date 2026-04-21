"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { generateYellow, generateRed, buildTableName } from "@/lib/micropulse/templateAutoGenerate";
import type { TemplateBlock, TemplateRecord } from "@/lib/micropulse/templateAutoGenerate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// ─── Workout structures ───────────────────────────────────────────────────────

type WorkoutStructure = {
  id: string;
  label: string;
  description: string;
  clusterVariant?: boolean;
  blocks: TemplateBlock[];
};

const CLUSTER_VARIATIONS: WorkoutStructure[] = [
  {
    id: "garcia-ramos",
    label: "Garcia-Ramos Cluster",
    description: "Hraðamiðaður cluster með þremur blokkum og vaxandi hvíldartíma. Tengir velocity og kraftþol.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Garcia-Ramos Cluster",
        items: [
          "Styrkt: 85–90% 1RM · Kraftur: 30–50% 1RM",
          "Blokk 1: 15 × 1 með 6 sek milli hverrar endurtekningar",
          "Blokk 2: 15 × 1 með 12 sek milli hverrar endurtekningar",
          "Blokk 3: 15 × 1 með 12 sek milli hverrar endurtekningar",
          "1 mín hvíld milli blokkanna",
          "Styrkt: Back Squat / Bench Press / Deadlift",
          "Kraftur: Bench Throw / Jump Squat / Power Clean",
        ],
      },
    ],
  },
  {
    id: "moreno",
    label: "Moreno Cluster",
    description: "Tveir ólíkir cluster-formatar: langur sett með 30 sek hvíld, eða stuttir tíðir spurtar með 10 sek.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Moreno Cluster — Veldu form",
        items: [
          "Form A (magn): 4 sett × 5 endurtekningar · 30 sek intra-set hvíld · 1 mín milli setta",
          "Form B (tíðni): 10 sett × 2 endurtekningar · 10 sek intra-set hvíld · 1 mín milli setta",
          "Styrkt: 85–90%+ 1RM · Kraftur: 45–65% 1RM",
          "Styrkt: Squat / Bench Press / Deadlift",
          "Kraftur: Explosive compound movements",
        ],
      },
    ],
  },
  {
    id: "hansen",
    label: "Hansen Cluster",
    description: "Singles með 12 sek hvíld eða doubles með 30 sek hvíld. Sterkt taugalífeðlisfræðilegt áreiti.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Hansen Cluster — Veldu form",
        items: [
          "Form A (Singles): 4 sett × 6 × 1 endurtekning · 12 sek milli hverrar",
          "Form B (Doubles): 4 sett × 3 × 2 endurtekningar · 30 sek milli para",
          "Þróun: Doubles → Triples → Quads með sömu hvíld",
          "Styrkt: 85–90%+ 1RM · Kraftur: 60–75% 1RM",
          "Styrkt: Back Squat / Bench Press / Deadlift",
          "Kraftur: Jump Squat / Explosive Push",
        ],
      },
    ],
  },
  {
    id: "iglesias-soler",
    label: "Iglesias-Soler Cluster",
    description: "Extreme neural: 32 singles með ~18 sek milli hverrar. Hámarks taugavirkjun yfir 10 mínútur.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Iglesias-Soler Cluster",
        items: [
          "Grunnform: 32 × 1 endurtekning · ~18 sek milli hverrar · ~10 mín samtals",
          "Breytileiki: 16 × 2 · 11 × 3 · 8 × 4 (allt með 18 sek hvíld)",
          "Styrkt: 85–90%+ 1RM · Kraftur: 70–85% 1RM",
          "Aðeins 1 blokk á hverri æfingu",
          "Styrkt: Heavy compound (Squat / Bench / Deadlift)",
          "Kraftur: Explosive Squat / Jump / Throw",
        ],
      },
    ],
  },
  {
    id: "tufano-standard",
    label: "Tufano Cluster (Standard)",
    description: "Rest-redistribution: 36 singles með 12 sek hvíld. Viðheldur gæðum í hverri líftingu yfir ~8 mín.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Tufano Standard Cluster",
        items: [
          "Grunnform: 36 × 1 · 12 sek milli hverrar · ~8:24 samtals",
          "Breytileiki A: 18 × 2 · 12 sek hvíld · ~4:48",
          "Breytileiki B: 12 × 3 · 12 sek hvíld · ~4:48",
          "Breytileiki C: 18 × 2 · 18 sek hvíld · ~7:21",
          "Breytileiki D: 12 × 3 · 24 sek hvíld · ~6:00",
          "Styrkt: 85–90%+ 1RM · Kraftur: 75–85% 1RM",
          "1 blokk á æfingu · Squat / Bench / Clean",
        ],
      },
    ],
  },
  {
    id: "tufano-cs2",
    label: "Tufano CS2 — Mechanical Stress",
    description: "3×12 með 15 sek intra-set hvíld @ 80% 1RM. 19% meiri meðalþrýstingur, 26% meiri time-under-tension.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Tufano CS2 — Mechanical Stress",
        items: [
          "3 sett × 12 endurtekningar · 80% 1RM · ~15:51 samtals",
          "15 sek intra-set hvíld milli mini-clustera innan hvers settar",
          "Markmið: Hámarks meðalþrýstingur og time-under-tension",
          "Samanborið við venjulegt: +19% meðalþrýstingur · +26% TUT",
          "Styrkt: Back Squat / Bench Press / Deadlift",
        ],
      },
    ],
  },
  {
    id: "tufano-cs4",
    label: "Tufano CS4 — Hypertrophy + Power",
    description: "3×12 með 2×30 sek hlé @ 75% 1RM. Jafnvægi milli vöðvaþroskunar og kraftframleiðni.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Tufano CS4 — Hypertrophy + Power",
        items: [
          "3 sett × 12 endurtekningar · 75% 1RM · ~10:10 samtals",
          "30 sek hvíld eftir 4. endurtekningu og aftur eftir 8. endurtekningu",
          "+10% heildarúttaksþyngd · +16% TUT · heldur peak power",
          "Miðpunktur milli CS2 (þrýstingur) og venjulegra setta",
          "Styrkt + Kraftur: Squat / Bench / Deadlift",
        ],
      },
    ],
  },
  {
    id: "oliver",
    label: "Oliver Cluster — Metabolic Conditioning",
    description: "4 sett × (5+30sek+5). Viðheldur kraftframleiðni, minnkar mjólkursýru og katabolískt álag.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Oliver Cluster — Metabolic",
        items: [
          "4 sett × (5 endurtekningar + 30 sek hvíld + 5 endurtekningar)",
          "90 sek hvíld milli setta · ~10 mín samtals",
          "Þyngd: Meðalþungur (miðast við gæðahreyfingar)",
          "30 sek intra-set hvíld viðheldur meðalkrafti í öllum settum",
          "Lægri mjólkursýra · meiri heildarúttaksþyngd · minna katabólískt álag",
          "Leg Press / Squat / Compound lower body",
        ],
      },
    ],
  },
];

// ─── Potentiation cluster variations (XL Athlete / Cal Dietz) ────────────────

const POTENTIATION_CLUSTER_VARIATIONS: WorkoutStructure[] = [
  {
    id: "pc-acceleration",
    label: "Acceleration Focus",
    description: "Trap Bar Deadlift + Box Jump. Hraðaþróun — fyrstu 3–4 skrefin. 65–80% 1RM.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Potentiation Cluster — Acceleration",
        items: [
          "A1. Trap Bar Deadlift — 1 rep @ 65–80%",
          "A2. Box Jump — 1 rep (max effort)",
          "15–20 sek hvíld → endurtaka",
          "4 reps per cluster (4 × A1+A2)",
          "2–3 mín hvíld milli clusters",
          "2–4 clusters total",
        ],
      },
    ],
  },
  {
    id: "pc-topend-speed",
    label: "Top-End Speed Focus",
    description: "Trap Bar Deadlift + Hurdle Hop. Liðstífni og top-end hraði. 65–80% 1RM.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Potentiation Cluster — Top-End Speed",
        items: [
          "A1. Trap Bar Deadlift — 1 rep @ 65–80%",
          "A2. Hurdle Hop — 1 rep (max effort, joint stiffness)",
          "15–20 sek hvíld → endurtaka",
          "4 reps per cluster (4 × A1+A2)",
          "2–3 mín hvíld milli clusters",
          "2–4 clusters total",
        ],
      },
    ],
  },
  {
    id: "pc-peaking-basic",
    label: "Peaking — Basic (lið)",
    description: "Squat Jump + Drop Box Jump. Létt álag (25–30%) fyrir peaking 2–4 vikum fyrir keppni.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Potentiation Cluster — Peaking Basic",
        items: [
          "A1. Squat Jump — 1 rep @ 25–30%",
          "A2. Drop Box Jump — 1 rep (12–18 inch box, max effort)",
          "15–20 sek hvíld → endurtaka",
          "4 reps per cluster (4 × A1+A2)",
          "2–3 mín hvíld milli clusters",
          "1–3 clusters total (peaking = minna magn)",
        ],
      },
    ],
  },
  {
    id: "pc-peaking-advanced",
    label: "Peaking — Advanced (triple cluster)",
    description: "Squat Jump + Drop Box Jump + Band Jump. Þrjár hreyfigæðar í einni blokk — acceleration, mid-range, top-end.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Triple Potentiation Cluster — Peaking Advanced",
        items: [
          "A1. Squat Jump — 1 rep @ 25–30% (acceleration depth)",
          "A2. Drop Box Jump — 1 rep (mid-range angle, max effort)",
          "A3. Accelerated Band Jump — 1 rep (minimal joint angle, top-end speed)",
          "15–20 sek hvíld → endurtaka",
          "3 reps per cluster (3 × A1+A2+A3)",
          "2–3 mín hvíld milli clusters",
          "2–4 clusters total",
        ],
      },
    ],
  },
  {
    id: "pc-french-contrast-style",
    label: "French Contrast Style (4 æfingar)",
    description: "Trap Bar Deadlift + Drop Box Jump + Squat Jump + Hurdle Hop. Fjórar hreyfigæðar — styrkur, reactive, hraði, stífni.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. French Contrast Potentiation Cluster",
        items: [
          "A1. Trap Bar Deadlift — 1 rep @ 55–80%",
          "A2. Drop Box Jump — 1 rep (reactive, max effort)",
          "A3. Squat Jump — 1 rep @ 25–30%",
          "A4. Hurdle Hop — 1 rep (joint stiffness, top-end speed)",
          "15–20 sek hvíld → endurtaka",
          "3 reps per cluster (3 × A1+A2+A3+A4)",
          "3–5 mín hvíld milli clusters",
          "2–4 clusters total",
        ],
      },
    ],
  },
];

const WORKOUT_STRUCTURES: WorkoutStructure[] = [
  {
    id: "french-contrast",
    label: "French Contrast",
    description: "4 æfingar í röð: þungt samsetnt → sprengifimi → þungað springt → hreint springt. Optimal PAP.",
    blocks: [
      {
        block: "A. French Contrast",
        items: [
          "A1. Heavy compound — Back Squat 85–90% × 3–4",
          "A2. Plyometric — Depth Jump × 3",
          "A3. Weighted explosive — Jump Squat 30% × 3",
          "A4. Reactive plyometric — Broad Jump × 3",
          "10–15 sek milli A1–A4 · 3–4 mín hvíld milli setta · 3–4 sett",
        ],
      },
    ],
  },
  {
    id: "contrast",
    label: "Contrast",
    description: "Þungt sett fylgt eftir strax af sprengifimi. Nýtir PAP til að auka kraftframleiðni.",
    blocks: [
      {
        block: "A. Contrast",
        items: [
          "A1. Heavy: Back Squat 85% × 3–4",
          "A2. Explosive: Box Jump × 5 (strax á eftir A1)",
          "2–3 mín hvíld milli para · 4 sett",
        ],
      },
    ],
  },
  {
    id: "potentiation-clusters",
    label: "Potentiation clusters",
    description: "5 útgáfur: Acceleration, Top-end speed, Peaking basic/advanced, French Contrast style.",
    blocks: [], // expanded into POTENTIATION_CLUSTER_VARIATIONS sub-picker
  },
  {
    id: "cluster-variations",
    label: "Cluster variations",
    description: "8 rannsóknarbyggðar útgáfur: Garcia-Ramos, Moreno, Hansen, Iglesias-Soler, Tufano (3 útgáfur), Oliver.",
    blocks: [], // expanded into CLUSTER_VARIATIONS sub-picker
  },
  {
    id: "regular",
    label: "Regular formation",
    description: "Staðlað þjálfunarform — ein æfing í senn, bein sett og endurtekningar.",
    blocks: [
      {
        block: "A. Aðalvinna",
        items: [
          "Æfing 1: Veldu æfingu — 3–5 sett × 4–6 endurtekningar",
          "Æfing 2: Veldu æfingu — 3 sett × 6–8 endurtekningar",
          "2–3 mín hvíld milli setta",
        ],
      },
    ],
  },
  {
    id: "supersets-lower-upper",
    label: "Lower / Upper body Supersets",
    description: "Para neðri og efri líkamshluta saman. Sparar tíma og heldur hjartsláttartíðni uppi.",
    blocks: [
      {
        block: "A. Lower/Upper Supersets",
        items: [
          "A1 (Lower): Romanian Deadlift 75% × 6–8",
          "A2 (Upper): Bench Press 75% × 6–8",
          "30 sek hvíld → endurtaka A1",
          "B1 (Lower): Bulgarian Split Squat × 8/hlið",
          "B2 (Upper): Seated Row × 8",
          "30 sek hvíld → endurtaka B1",
          "3–4 sett á hverri pörun",
        ],
      },
    ],
  },
];

// ─── Structure picker component ───────────────────────────────────────────────

function StructurePicker({ onApply }: { onApply: (blocks: TemplateBlock[], structureId: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [clusterSub, setClusterSub] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const SUB_PICKER_IDS = ["cluster-variations", "potentiation-clusters"] as const;
  const hasSubPicker = SUB_PICKER_IDS.includes(selected as typeof SUB_PICKER_IDS[number]);

  const subVariants =
    selected === "cluster-variations"
      ? CLUSTER_VARIATIONS
      : selected === "potentiation-clusters"
        ? POTENTIATION_CLUSTER_VARIATIONS
        : [];

  const activeStructure = hasSubPicker
    ? subVariants.find((c) => c.id === clusterSub) ?? null
    : WORKOUT_STRUCTURES.find((s) => s.id === selected) ?? null;

  function handleApply() {
    if (!activeStructure || activeStructure.blocks.length === 0) return;
    onApply(activeStructure.blocks, activeStructure.id);
    setOpen(false);
    setSelected(null);
    setClusterSub(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 px-4 py-3 text-left text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <span className="text-lg">⚡</span>
        <div>
          <div className="font-medium">Veldu uppbyggingu aðalblokks</div>
          <div className="text-xs text-indigo-500">French contrast, Garcia-Ramos, Tufano CS2/CS4, Oliver og fleiri…</div>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-indigo-900">⚡ Veldu uppbyggingu aðalblokks</div>
        <button type="button" onClick={() => { setOpen(false); setSelected(null); setClusterSub(null); }}
          className="text-xs text-muted-foreground hover:text-foreground">✕ Loka</button>
      </div>

      {/* Main structure cards */}
      <div className="grid gap-2 sm:grid-cols-2">
        {WORKOUT_STRUCTURES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setSelected(s.id); if (s.id !== "cluster-variations" && s.id !== "potentiation-clusters") setClusterSub(null); }}
            className={`rounded-lg border p-3 text-left text-sm transition-colors ${
              selected === s.id
                ? "border-indigo-500 bg-white shadow-sm"
                : "border-transparent bg-white/70 hover:bg-white"
            }`}
          >
            <div className="font-medium text-foreground">{s.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground leading-snug">{s.description}</div>
          </button>
        ))}
      </div>

      {/* Sub-variants (cluster-variations & potentiation-clusters) */}
      {hasSubPicker && (
        <div className="mt-1 space-y-1.5">
          <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
            {selected === "potentiation-clusters" ? "Veldu potentiation cluster útgáfu:" : "Veldu cluster-útgáfu:"}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {subVariants.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClusterSub(c.id)}
                className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${
                  clusterSub === c.id
                    ? "border-indigo-500 bg-indigo-100"
                    : "border-transparent bg-white/80 hover:bg-white"
                }`}
              >
                <div className="font-medium text-foreground text-xs">{c.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{c.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Apply button */}
      {activeStructure && activeStructure.blocks.length > 0 && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Nota „{activeStructure.label}" í aðalblokk →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Season phases ───────────────────────────────────────────────────────────

type SeasonPhase = "preseason" | "inseason" | "playoffs" | "offseason";

const SEASON_PHASES: {
  id: SeasonPhase;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  activeColor: string;
}[] = [
  {
    id: "preseason",
    label: "Preseason",
    sublabel: "Undirbúningur — Bygging grunnþols og styrks",
    icon: "🌱",
    color: "border-amber-200 bg-amber-50",
    activeColor: "border-amber-500 bg-amber-100 ring-1 ring-amber-400",
  },
  {
    id: "inseason",
    label: "In-season",
    sublabel: "Keppnistímabil — Viðhald og keppnisgæði",
    icon: "⚡",
    color: "border-emerald-200 bg-emerald-50",
    activeColor: "border-emerald-500 bg-emerald-100 ring-1 ring-emerald-400",
  },
  {
    id: "playoffs",
    label: "Playoffs / Úrslitakeppni",
    sublabel: "Hámarksgæði — Lágmarks þreyta, hámarks úttak",
    icon: "🔥",
    color: "border-red-200 bg-red-50",
    activeColor: "border-red-500 bg-red-100 ring-1 ring-red-400",
  },
  {
    id: "offseason",
    label: "Off-season",
    sublabel: "Frítímabil — Endurheimt og grunn-uppbygging",
    icon: "🌙",
    color: "border-slate-200 bg-slate-50",
    activeColor: "border-slate-500 bg-slate-100 ring-1 ring-slate-400",
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const MD_DAYS = [
  "GENERIC",
  "MD-4",
  "MD-3",
  "MD-2",
  "MD-1",
  "MD",
  "MD+1",
  "MD+2",
  "MD+3",
] as const;

const MD_DAY_LABELS: Record<string, string> = {
  GENERIC: "GENERIC — Almenn þjálfunardagur (MD-5, MD-6 og lengra)",
  "MD-4":  "MD-4 — Fjórum dögum fyrir leik",
  "MD-3":  "MD-3 — Þremur dögum fyrir leik",
  "MD-2":  "MD-2 — Tveimur dögum fyrir leik",
  "MD-1":  "MD-1 — Dagur fyrir leik",
  MD:      "MD — Leikdagur",
  "MD+1":  "MD+1 — Dagur eftir leik",
  "MD+2":  "MD+2 — Tveimur dögum eftir leik",
  "MD+3":  "MD+3 — Þremur dögum eftir leik",
};

type Step = 1 | 2 | 3 | 4;

type GreenTemplates = Record<string, TemplateRecord>; // keyed by md_day

type TemplateSet = {
  id: string;
  set_name: string;
  sport: string;
  gender?: string | null;
  season_phase?: SeasonPhase | null;
  table_name: string;
  md_days: string[];
  created_at: string;
};

// ─── File upload parsing ───────────────────────────────────────────────────────

/** Detect whether a text line should be treated as a block/section header */
function isBlockHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  // "A. " / "B. " / "C. " prefix
  if (/^[A-Za-z]\.\s/.test(t)) return true;
  // Numbered "1. Something" (capital after the number)
  if (/^\d+\.\s+[A-ZÁÉÍÓÚÝ]/.test(t)) return true;
  // Explicit keywords
  if (/^(Blokk|Block|Hluti|Part|Phase|Fasi|Upphluti)\s/i.test(t)) return true;
  // All-caps short line that contains at least one letter (e.g. "SQUAT COMPLEX")
  if (t === t.toUpperCase() && t.length >= 3 && t.length < 60 && /[A-ZÁÉÍÓÚÝ]/.test(t)) return true;
  return false;
}

/** Convert any free-form text into TemplateBlock[] with best-effort structure */
function parseTrainingText(text: string): TemplateBlock[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const blocks: TemplateBlock[] = [];
  let current: TemplateBlock | null = null;

  for (const line of lines) {
    if (isBlockHeader(line)) {
      if (current) blocks.push(current);
      current = { block: line, items: [] };
    } else {
      if (!current) current = { block: "A. Blokk", items: [] };
      current.items.push(line);
    }
  }
  if (current) blocks.push(current);

  // Fallback: no headers detected — one big block
  if (blocks.length === 0) return [{ block: "A. Blokk", items: lines }];
  return blocks;
}

// ─── Smart workout description parser ────────────────────────────────────────
//
// Understands:
//   • VBT (Velocity Based Training): velocity targets, thresholds, m/s zones
//   • Training methods: French Contrast, Contrast, Potentiation Clusters, Cluster variations
//   • Exercise notation: "4x8 @ 80%", "3 sett af 6", rest intervals, rounds
//   • Icelandic + English
//

/** Known training-method keywords → auto-expand into the matching pre-built structure */
type MethodMatch = { structureId: string; source: WorkoutStructure[] | null; label: string };

function detectTrainingMethod(text: string): MethodMatch | null {
  const lower = text.toLowerCase();

  // French Contrast (full 4-exercise variant)
  if (/french\s*contrast/i.test(lower) && !/potentiation|cluster/i.test(lower)) {
    return { structureId: "french-contrast", source: null, label: "French Contrast" };
  }
  // Contrast (simple 2-exercise)
  if (/\bcontrast\b/i.test(lower) && !/french|potentiation|cluster/i.test(lower)) {
    return { structureId: "contrast", source: null, label: "Contrast" };
  }
  // Potentiation cluster — acceleration
  if (/potentiation.*acceler|acceler.*potentiation/i.test(lower)) {
    return { structureId: "pc-acceleration", source: POTENTIATION_CLUSTER_VARIATIONS, label: "Potentiation Cluster — Acceleration" };
  }
  // Potentiation cluster — top-end speed
  if (/potentiation.*top[- ]?end|top[- ]?end.*potentiation/i.test(lower)) {
    return { structureId: "pc-topend-speed", source: POTENTIATION_CLUSTER_VARIATIONS, label: "Potentiation Cluster — Top-End Speed" };
  }
  // Potentiation cluster — peaking advanced
  if (/potentiation.*peak.*adv|triple.*potentiation/i.test(lower)) {
    return { structureId: "pc-peaking-advanced", source: POTENTIATION_CLUSTER_VARIATIONS, label: "Triple Potentiation Cluster — Peaking" };
  }
  // Potentiation cluster — peaking basic
  if (/potentiation.*peak|peak.*potentiation/i.test(lower)) {
    return { structureId: "pc-peaking-basic", source: POTENTIATION_CLUSTER_VARIATIONS, label: "Potentiation Cluster — Peaking" };
  }
  // Potentiation cluster — french contrast style
  if (/potentiation.*french|french.*potentiation/i.test(lower)) {
    return { structureId: "pc-french-contrast-style", source: POTENTIATION_CLUSTER_VARIATIONS, label: "French Contrast Potentiation Cluster" };
  }
  // Generic potentiation cluster
  if (/potentiation\s*cluster/i.test(lower)) {
    return { structureId: "pc-acceleration", source: POTENTIATION_CLUSTER_VARIATIONS, label: "Potentiation Cluster — Acceleration" };
  }

  // Named cluster variations
  if (/garcia[- ]?ramos/i.test(lower)) {
    return { structureId: "garcia-ramos", source: CLUSTER_VARIATIONS, label: "Garcia-Ramos Cluster" };
  }
  if (/moreno\s*cluster/i.test(lower)) {
    return { structureId: "moreno", source: CLUSTER_VARIATIONS, label: "Moreno Cluster" };
  }
  if (/hansen\s*cluster/i.test(lower)) {
    return { structureId: "hansen", source: CLUSTER_VARIATIONS, label: "Hansen Cluster" };
  }
  if (/iglesias/i.test(lower)) {
    return { structureId: "iglesias-soler", source: CLUSTER_VARIATIONS, label: "Iglesias-Soler Cluster" };
  }
  if (/tufano.*cs2|cs2.*tufano|mechanical\s*stress/i.test(lower)) {
    return { structureId: "tufano-cs2", source: CLUSTER_VARIATIONS, label: "Tufano CS2 — Mechanical Stress" };
  }
  if (/tufano.*cs4|cs4.*tufano|hypertrophy.*power/i.test(lower)) {
    return { structureId: "tufano-cs4", source: CLUSTER_VARIATIONS, label: "Tufano CS4 — Hypertrophy + Power" };
  }
  if (/tufano/i.test(lower)) {
    return { structureId: "tufano-standard", source: CLUSTER_VARIATIONS, label: "Tufano Standard Cluster" };
  }
  if (/oliver.*cluster|metabolic.*cluster/i.test(lower)) {
    return { structureId: "oliver", source: CLUSTER_VARIATIONS, label: "Oliver Cluster — Metabolic" };
  }

  // Lower/Upper supersets
  if (/lower.*upper.*super|super.*lower.*upper/i.test(lower)) {
    return { structureId: "supersets-lower-upper", source: null, label: "Lower/Upper Supersets" };
  }

  return null;
}

/** Resolve a MethodMatch into TemplateBlock[] */
function resolveMethodBlocks(match: MethodMatch): TemplateBlock[] {
  if (match.source) {
    const found = match.source.find((s) => s.id === match.structureId);
    return found ? JSON.parse(JSON.stringify(found.blocks)) : [];
  }
  const found = WORKOUT_STRUCTURES.find((s) => s.id === match.structureId);
  return found ? JSON.parse(JSON.stringify(found.blocks)) : [];
}

// ── VBT zone data ──

const VBT_ZONES: Record<string, { range: string; quality: string }> = {
  "absolute-strength":  { range: "< 0.5 m/s",        quality: "Hámarksstyrkur / Absolute Strength" },
  "strength":           { range: "0.5–0.75 m/s",      quality: "Styrkur / Strength" },
  "strength-speed":     { range: "0.75–1.0 m/s",      quality: "Styrktarhraði / Strength-Speed" },
  "speed-strength":     { range: "1.0–1.3 m/s",       quality: "Hraðastyrkur / Speed-Strength" },
  "speed":              { range: "1.3–1.5 m/s",       quality: "Hraði / Speed" },
  "reactive":           { range: "> 1.5 m/s",         quality: "Reactive / Ballistic" },
};

/** Detect VBT annotations in a line and enhance with zone info */
function enrichVbtLine(line: string): string {
  // Match "velocity target 0.8 m/s" / "VT: 0.8" / "hraðamarkmið 0.8"
  const vtMatch = line.match(
    /(?:velocity\s*(?:target|zone)|VT|hraðamarkmið|markmið\s*hraði)[:\s]*([0-9]+\.?[0-9]*)\s*(?:m\/s)?/i,
  );
  if (vtMatch) {
    const vel = parseFloat(vtMatch[1]);
    const zone = velocityToZone(vel);
    if (zone && !line.includes(zone.quality)) {
      return `${line} — ${zone.quality} (${zone.range})`;
    }
  }

  // Match "velocity threshold 0.5" / "velocity cutoff" / "hraðaþröskuldur"
  const threshMatch = line.match(
    /(?:velocity\s*(?:threshold|cutoff|stop)|hraðaþröskuldur|þröskuldur)[:\s]*([0-9]+\.?[0-9]*)\s*(?:m\/s)?/i,
  );
  if (threshMatch) {
    const vel = parseFloat(threshMatch[1]);
    return `${line} — Stopp ef hraði fer undir ${vel} m/s (velocity loss cutoff)`;
  }

  // Match standalone "0.8 m/s" or "@0.8m/s" in a line that mentions an exercise
  const inlineVel = line.match(/[@]?\s*([0-9]+\.[0-9]+)\s*m\/?s/i);
  if (inlineVel) {
    const vel = parseFloat(inlineVel[1]);
    const zone = velocityToZone(vel);
    if (zone && !line.includes(zone.quality)) {
      return `${line} — ${zone.quality}`;
    }
  }

  // Match "velocity loss 20%" / "hraðatap 20%"
  const vlossMatch = line.match(
    /(?:velocity\s*loss|hraðatap|VL)[:\s]*([0-9]+)\s*%/i,
  );
  if (vlossMatch) {
    const pct = parseInt(vlossMatch[1]);
    const intent =
      pct <= 10 ? "Neural / kraftþróun"
      : pct <= 20 ? "Strength-speed / gæði"
      : pct <= 30 ? "Hypertrophy / magn"
      : "Metabolic / lactic";
    if (!line.includes(intent)) {
      return `${line} — ${intent}`;
    }
  }

  return line;
}

function velocityToZone(vel: number): { range: string; quality: string } | null {
  if (vel < 0.5) return VBT_ZONES["absolute-strength"];
  if (vel < 0.75) return VBT_ZONES["strength"];
  if (vel < 1.0) return VBT_ZONES["strength-speed"];
  if (vel < 1.3) return VBT_ZONES["speed-strength"];
  if (vel < 1.5) return VBT_ZONES["speed"];
  return VBT_ZONES["reactive"];
}

/**
 * Parse a free-form workout description into structured TemplateBlock[].
 *
 * Handles:
 *   • VBT: velocity targets ("VT: 0.8 m/s"), thresholds, velocity loss %
 *   • Named methods: French Contrast, Contrast, Potentiation Cluster, Cluster variations
 *   • Exercise notation: "Back Squat 4x8 @ 80%", "4 sett af 8 endurt."
 *   • Rest / rounds: "60s hvíld", "3 umferðir"
 *   • Block headers: "A. Styrktarblokk", "Upphitun", etc.
 */
function parseSmartWorkoutText(text: string): TemplateBlock[] {
  const raw = text.trim();
  if (!raw) return [];

  // Step 1: Check for known training methods mentioned in the text
  const methodMatch = detectTrainingMethod(raw);
  if (methodMatch) {
    const methodBlocks = resolveMethodBlocks(methodMatch);
    if (methodBlocks.length > 0) {
      // Parse remaining lines that aren't the method keyword itself
      const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Filter out lines that are just the method name
      const extraLines = lines.filter((l) => {
        const lower = l.toLowerCase();
        // Skip lines that are just "french contrast", "potentiation cluster", etc.
        if (/^(french\s*contrast|contrast|potentiation\s*cluster|cluster)/i.test(lower) && lower.length < 40) return false;
        if (/^(garcia|moreno|hansen|iglesias|tufano|oliver)/i.test(lower) && lower.length < 40) return false;
        return true;
      });

      // Separate extra lines into rest/rounds metadata vs custom exercises
      if (extraLines.length > 0 && methodBlocks[0]) {
        const restPatterns = [
          /^\d+\s*(?:sek|sec|s|mín|min)\s*(?:hvíld|rest|milli)/i,
          /^(?:hvíld|rest)[:\s]*.+/i,
        ];
        const roundsPattern = /^\d+\s*(?:umferð|round|hring|cluster|sett)/i;
        const customExercises: string[] = [];

        for (const l of extraLines) {
          if (restPatterns.some((p) => p.test(l))) {
            methodBlocks[0].rest_between_sets = l;
          } else if (roundsPattern.test(l)) {
            methodBlocks[0].rest_between_rounds = l;
          } else {
            customExercises.push(enrichVbtLine(formatExerciseLine(l)));
          }
        }
        if (customExercises.length > 0) {
          methodBlocks[0].items = [...methodBlocks[0].items, ...customExercises];
        }
      }
      return methodBlocks;
    }
  }

  // Step 2: Split into lines, normalize
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Step 3: Detect if the text is structured (has block headers) or free-form prose
  const hasHeaders = lines.some((l) => isBlockHeader(l));

  if (hasHeaders) {
    return enhanceBlocks(parseTrainingText(raw));
  }

  // Step 4: Free-form prose — intelligently split into blocks
  const blocks: TemplateBlock[] = [];
  let currentBlock: TemplateBlock | null = null;
  let blockCounter = 0;

  const sectionBreakPatterns = [
    /^(upphitun|warmup|warm[- ]up|virkjun|activation)/i,
    /^(aðalæfing|main|styrkt|strength|power|kraftur)/i,
    /^(superset|þríund|triset|giant\s*set|hringæfing|circuit)/i,
    /^(french\s*contrast|contrast\s*training|contrast)/i,
    /^(potentiation|cluster)/i,
    /^(vbt|velocity[- ]based)/i,
    /^(kjarni|core|magi|kviður)/i,
    /^(niðurlag|cooldown|cool[- ]down|teygjur|stretch)/i,
    /^(hluti|part|phase|blokk|block)\s/i,
  ];

  const restPatterns = [
    /^(\d+)\s*(?:sek|sec|s)\s*(?:hvíld|rest|milli)/i,
    /^(?:hvíld|rest)[:\s]*(\d+)\s*(?:sek|sec|s|mín|min)/i,
    /^(\d+)\s*(?:mín|min)\s*(?:hvíld|rest|milli)/i,
  ];

  const roundsPattern = /^(\d+)\s*(?:umferð|round|hring|cluster)/i;

  for (const line of lines) {
    const isNewSection = sectionBreakPatterns.some((p) => p.test(line));

    if (isNewSection) {
      if (currentBlock) blocks.push(currentBlock);
      blockCounter++;
      const letter = String.fromCharCode(64 + blockCounter);
      currentBlock = { block: `${letter}. ${line}`, items: [] };
      continue;
    }

    const restMatch = restPatterns.reduce<RegExpMatchArray | null>(
      (acc, p) => acc || line.match(p), null,
    );
    if (restMatch && currentBlock) {
      currentBlock.rest_between_sets = line;
      continue;
    }

    const roundMatch = line.match(roundsPattern);
    if (roundMatch && currentBlock) {
      currentBlock.rest_between_rounds = line;
      continue;
    }

    if (!currentBlock) {
      blockCounter++;
      const letter = String.fromCharCode(64 + blockCounter);
      currentBlock = { block: `${letter}. Blokk`, items: [] };
    }

    // Apply VBT enrichment + exercise formatting
    currentBlock.items.push(enrichVbtLine(formatExerciseLine(line)));
  }

  if (currentBlock) blocks.push(currentBlock);
  if (blocks.length === 0) return [{ block: "A. Blokk", items: lines }];
  return blocks;
}

/** Format an exercise line — normalize "4x8 back squat 80%" into a clean string */
function formatExerciseLine(line: string): string {
  // Already well-formatted: has × or x with numbers
  if (/\d+\s*[×x]\s*\d+/i.test(line)) {
    return line.replace(/(\d+)\s*x\s*(\d+)/gi, "$1×$2");
  }

  // Icelandic pattern: "4 sett af 8 endurtekningum í back squat á 80%"
  const isSett = line.match(
    /(\d+)\s*sett?\s*(?:af|með|x)?\s*(\d+)\s*(?:endurt|reps?)?\s*(?:í|af|:)?\s*(.+)/i,
  );
  if (isSett) {
    const [, sets, reps, exercise] = isSett;
    return `${exercise.trim()} · ${sets}×${reps}`;
  }

  // English pattern: "4 sets of 8 reps back squat at 80%"
  const enSets = line.match(
    /(\d+)\s*sets?\s*(?:of|x)?\s*(\d+)\s*(?:reps?)?\s*(?:of|in|:)?\s*(.+)/i,
  );
  if (enSets) {
    const [, sets, reps, exercise] = enSets;
    return `${exercise.trim()} · ${sets}×${reps}`;
  }

  return line;
}

/** Enhance already-parsed blocks by extracting rest info and enriching VBT */
function enhanceBlocks(blocks: TemplateBlock[]): TemplateBlock[] {
  return blocks.map((b) => {
    const enhanced = { ...b, items: [...b.items] };
    enhanced.items = enhanced.items.filter((item) => {
      const restMatch = item.match(/^(?:hvíld|rest)[:\s]*(.+)/i);
      if (restMatch) {
        if (!enhanced.rest_between_sets) enhanced.rest_between_sets = restMatch[1].trim();
        return false;
      }
      const roundMatch = item.match(/^(\d+)\s*(?:umferð|round|hring)/i);
      if (roundMatch) {
        if (!enhanced.rest_between_rounds) enhanced.rest_between_rounds = item;
        return false;
      }
      return true;
    });
    // Normalize exercise lines + VBT enrichment
    enhanced.items = enhanced.items.map((item) => enrichVbtLine(formatExerciseLine(item)));
    return enhanced;
  });
}

/** Dynamically load SheetJS from CDN (runs only in browser, cached after first load) */
async function loadSheetJS(): Promise<{ read: Function; utils: { sheet_to_json: Function } }> {
  if (typeof window !== "undefined" && (window as any).XLSX) return (window as any).XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve((window as any).XLSX);
    s.onerror = () => reject(new Error("Tókst ekki að hlaða SheetJS"));
    document.head.appendChild(s);
  });
}

/** Extract flat text from an Excel file using SheetJS */
async function extractXLSXText(file: File): Promise<string> {
  const XLSX = await loadSheetJS();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames as string[]) {
    const sheet = workbook.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
    for (const row of rows) {
      const line = row
        .map((c) => String(c ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      if (line) lines.push(line);
    }
  }
  return lines.join("\n");
}

/** Dynamically load PDF.js from CDN (runs only in browser, cached after first load) */
async function loadPdfJS(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).pdfjsLib) return (window as any).pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (!lib) { reject(new Error("pdfjsLib not found")); return; }
      lib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(lib);
    };
    s.onerror = () => reject(new Error("Tókst ekki að hlaða PDF.js"));
    document.head.appendChild(s);
  });
}

/** Extract flat text from a PDF file using PDF.js */
async function extractPDFText(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJS();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Group text items by y-position to reconstruct lines
    const byY = new Map<number, string[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]); // round y to group nearby text
      const arr = byY.get(y) ?? [];
      arr.push(item.str);
      byY.set(y, arr);
    }
    // Sort by y descending (top of page first) and join each line
    const sortedYs = [...byY.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const line = (byY.get(y) ?? []).join(" ").trim();
      if (line) lines.push(line);
    }
  }
  return lines.join("\n");
}

// ─── Exercise library ─────────────────────────────────────────────────────────

type ExerciseEntry = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  intensity: string;
  /** ISO exercises only — intent-based (e.g. "Sustained", "Sprengifimi") */
  tempo?: string;
  /** VBT: target mean concentric velocity in m/s (non-ISO) */
  velocity?: string;
  /** VBT: velocity-loss threshold to stop the set (non-ISO) */
  velocityLoss?: string;
  rest: string;
  note?: string;
  /** If set, use this as the inserted line instead of the auto-formatted string */
  lineOverride?: string;
};

type ExerciseCategory = {
  id: string;
  label: string;
  icon: string;
  exercises: ExerciseEntry[];
};

function fmtExercise(e: ExerciseEntry): string {
  if (e.lineOverride) return e.lineOverride;
  const parts = [
    e.name,
    `${e.sets} sett × ${e.reps}`,
    e.intensity,
  ];
  // VBT variables (non-ISO)
  if (e.velocity)     parts.push(`Hraði ${e.velocity}`);
  if (e.velocityLoss) parts.push(`VL ${e.velocityLoss}`);
  // Intent/tempo (ISO only)
  if (e.tempo)        parts.push(`Tempo ${e.tempo}`);
  parts.push(`${e.rest} hvíld`);
  if (e.note) parts.push(e.note);
  return parts.join(" · ");
}

const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  {
    id: "lower-strength",
    label: "Neðri — Styrkt",
    icon: "🏋️",
    exercises: [
      { id: "back-squat",       name: "Back Squat",             sets: "3–4", reps: "3–5 endurtekningar",  intensity: "82–88% 1RM", velocity: "~0.50–0.60 m/s", velocityLoss: "20% VL", rest: "3–4 mín" },
      { id: "trap-bar-dl",      name: "Trap Bar Deadlift",      sets: "3–4", reps: "3–5 endurtekningar",  intensity: "80–85% 1RM", velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "3–4 mín" },
      { id: "rdl",              name: "Romanian Deadlift",       sets: "3",   reps: "6–8 endurtekningar",  intensity: "70–75% 1RM", velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "2–3 mín" },
      { id: "front-squat",      name: "Front Squat",             sets: "3–4", reps: "3–4 endurtekningar",  intensity: "78–83% 1RM", velocity: "~0.50–0.60 m/s", velocityLoss: "20% VL", rest: "3–4 mín" },
    ],
  },
  {
    id: "lower-power",
    label: "Neðri — Kraft",
    icon: "⚡",
    exercises: [
      { id: "mid-thigh-pull",   name: "Mid-Thigh Pull",          sets: "4–5", reps: "2–3 endurtekningar",  intensity: "80–90% ISO", velocity: "~1.0–1.5 m/s", velocityLoss: "10% VL", rest: "3–4 mín" },
      { id: "hang-clean",       name: "Hang Clean",              sets: "4–5", reps: "2–3 endurtekningar",  intensity: "72–78% 1RM", velocity: "~1.0–1.3 m/s", velocityLoss: "10% VL", rest: "3–4 mín" },
      { id: "jump-squat",       name: "Jump Squat",              sets: "4",   reps: "3–5 endurtekningar",  intensity: "30–40% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "2–3 mín" },
      { id: "trap-bar-jump",    name: "Trap Bar Jump",           sets: "4",   reps: "3–4 endurtekningar",  intensity: "25–35% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "2–3 mín" },
    ],
  },
  {
    id: "plyometric",
    label: "Sprengifimi",
    icon: "🦘",
    exercises: [
      { id: "box-jump",         name: "Box Jump",                sets: "4",   reps: "3–5 endurtekningar",  intensity: "Líkamsþyngd", tempo: "Fullur endurheimt",   rest: "2–3 mín" },
      { id: "depth-jump",       name: "Depth Jump",              sets: "3–4", reps: "4–6 endurtekningar",  intensity: "Líkamsþyngd", tempo: "Lágmarks snertitími", rest: "3–4 mín" },
      { id: "broad-jump",       name: "Broad Jump",              sets: "3–4", reps: "3–5 endurtekningar",  intensity: "Líkamsþyngd", tempo: "Fullur kraftur",      rest: "2–3 mín" },
      { id: "reactive-hop",     name: "Reactive Hop",            sets: "3",   reps: "8–10 endurtekningar", intensity: "Líkamsþyngd", tempo: "Stíft hné",          rest: "2 mín" },
    ],
  },
  {
    id: "unilateral",
    label: "Einlíkamshluta",
    icon: "🦵",
    exercises: [
      { id: "rfess",            name: "RFESS",                   sets: "3",   reps: "6–8/hlið",            intensity: "65–70% 1RM", velocity: "~0.50–0.70 m/s", velocityLoss: "20% VL", rest: "2–3 mín", note: "Afturhlið upphækkað" },
      { id: "bulgarian-ss",     name: "Bulgarian Split Squat",   sets: "3",   reps: "6–8/hlið",            intensity: "60–65% 1RM", velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "2–3 mín" },
      { id: "single-leg-rdl",   name: "Single Leg RDL",          sets: "3",   reps: "8/hlið",              intensity: "60% 1RM",    velocity: "~0.45–0.60 m/s", velocityLoss: "20% VL", rest: "2 mín" },
      { id: "step-up",          name: "Step-Up",                 sets: "3",   reps: "6–8/hlið",            intensity: "60% 1RM",    velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "2 mín" },
    ],
  },
  {
    id: "upper",
    label: "Efri líkamshluti",
    icon: "💪",
    exercises: [
      { id: "bench-press",      name: "Bench Press",             sets: "3–4", reps: "4–6 endurtekningar",  intensity: "78–83% 1RM", velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "2–3 mín" },
      { id: "push-press",       name: "Push Press",              sets: "3–4", reps: "3–5 endurtekningar",  intensity: "72–78% 1RM", velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "2–3 mín" },
      { id: "weighted-pullup",  name: "Weighted Pull-up",        sets: "3",   reps: "4–6 endurtekningar",  intensity: "RPE 8",      velocity: "~0.45–0.65 m/s", velocityLoss: "20% VL", rest: "2–3 mín" },
      { id: "db-row",           name: "DB Row",                  sets: "3",   reps: "8/hlið",              intensity: "RPE 7–8",    velocity: "~0.45–0.60 m/s", velocityLoss: "20% VL", rest: "90 sek" },
    ],
  },
  {
    id: "iso-performance",
    label: "ISO — Performance",
    icon: "🧱",
    exercises: [
      // ISO Mid-Thigh Pull — 3 útgáfur
      {
        id: "iso-mtp-rfd",
        name: "ISO Mid-Thigh Pull — RFD",
        sets: "5", reps: "3–5 sek", intensity: "90–100% MVC", tempo: "Sprengifimi (ballistic)", rest: "3 mín",
        note: "120–140° hnéliður · Sem hraðast mögulegt · +1.2–13.4%/viku RFD",
      },
      {
        id: "iso-mtp-strength",
        name: "ISO Mid-Thigh Pull — Styrkt",
        sets: "3–5", reps: "20–30 sek", intensity: "80–100% MVC", tempo: "Sustained — hámarks", rest: "2 mín",
        note: "Sport-sértækt horn · +4.3%/viku kraftur",
      },
      // ISO Squat Hold — 3 útgáfur eftir horn
      {
        id: "iso-squat-rfd",
        name: "ISO Squat Hold — RFD",
        sets: "5", reps: "3–5 sek", intensity: "90–100% MVC", tempo: "Sprengifimi (ballistic)", rest: "3 mín",
        note: "Sprengifimi tilgangur — þrýstu sem hraðast",
      },
      {
        id: "iso-squat-short",
        name: "ISO Squat Hold — Stutt horn (≤70°)",
        sets: "3–4", reps: "20–30 sek", intensity: "70–100% MVC", tempo: "Sustained — hámarks", rest: "2 mín",
        note: "≤70° hnébeygja · Horn-sértæk styrkt",
      },
      {
        id: "iso-squat-long",
        name: "ISO Squat Hold — Langt horn (>70°)",
        sets: "3–5", reps: "30–45 sek", intensity: "70–90% MVC", tempo: "Sustained", rest: "60 sek",
        note: ">70° hnébeygja · +0.86–1.69%/viku vöðvaþroski · Dynamic transfer",
      },
      // ISO Split Squat — 2 útgáfur
      {
        id: "iso-split-strength",
        name: "ISO Split Squat Hold — Styrkt",
        sets: "3–4", reps: "20–30 sek", intensity: "80–100% MVC", tempo: "Sustained — hámarks", rest: "2 mín",
        note: "Sport-sértækt horn · Per hlið",
      },
      // ISO Nordic Hold — 2 útgáfur
      {
        id: "iso-nordic-rfd",
        name: "ISO Nordic Hold — Styrkt",
        sets: "3", reps: "10–15 sek", intensity: "90–100% MVC", tempo: "Hámarks sustained", rest: "2 mín",
        note: "Hámarks hamstring samdráttur",
      },
      {
        id: "iso-leg-press-str",
        name: "ISO Leg Press — Styrkt",
        sets: "3–5", reps: "20–30 sek", intensity: "80–100% MVC", tempo: "Sustained — hámarks", rest: "2 mín",
        note: "Langt horn fyrir vöðvaþroski · Stutt horn fyrir horn-sértæka styrkt",
      },
    ],
  },
  {
    id: "iso-tendon",
    label: "ISO — Tendon",
    icon: "🏥",
    exercises: [
      // ISO Mid-Thigh Pull — Tendon
      {
        id: "iso-mtp-tendon",
        name: "ISO Mid-Thigh Pull — Tendon",
        sets: "3–5", reps: "30–45 sek", intensity: "80–90% MVC", tempo: "Sustained", rest: "90 sek",
        note: ">70% MVC NAUÐSYNLEGT fyrir tendon stiffness · +50.9% stiffness/12 vikur",
      },
      // ISO Split Squat — Tendon
      {
        id: "iso-split-tendon",
        name: "ISO Split Squat Hold — Tendon",
        sets: "3–5", reps: "30–45 sek", intensity: "80–90% MVC", tempo: "Sustained", rest: "90 sek",
        note: "Collagen synthesis · Sport-sértækt horn · Per hlið",
      },
      // Wall Sit — 3 útgáfur
      {
        id: "iso-wallsit-pain",
        name: "Wall Sit — Verkjalinun",
        sets: "4–5", reps: "30–45 sek", intensity: "50–60% MVC", tempo: "Submaximal — sustained", rest: "30 sek",
        note: "Snemmbær endurhæfing · 4–5× á dag · Verkjalínun í sín í fótlegg",
      },
      {
        id: "iso-wallsit-tendon",
        name: "Wall Sit — Tendon",
        sets: "3", reps: "30 sek", intensity: "80–90% MVC", tempo: "Sustained — hámarks", rest: "90 sek",
        note: ">70% MVC nauðsynlegt · Tendon stiffness og collagen",
      },
      {
        id: "iso-wallsit-unilateral",
        name: "Wall Sit — Einlíkamshluta",
        sets: "3", reps: "30 sek/hlið", intensity: "80–90% MVC", tempo: "Sustained — hámarks", rest: "2 mín",
        note: "Basketball-protocol · 90° hnébeygja · Eins og körfuboltamenn",
      },
      // ISO Nordic Hold — Tendon
      {
        id: "iso-nordic-tendon",
        name: "ISO Nordic Hold — Tendon",
        sets: "3", reps: "20–30 sek", intensity: "70–85% MVC", tempo: "Sustained", rest: "90 sek",
        note: "Hamstring tendon loading · Collagen synthesis",
      },
      // Collagen synthesis protocol (general)
      {
        id: "iso-collagen",
        name: "ISO Hamstring Bridge Hold — Collagen",
        sets: "3–5", reps: "30–60 sek", intensity: "50–90% MVC", tempo: "Sustained", rest: "60 sek",
        note: "Langtíma hvíld eykur collagen synthesis · 2–3× á viku",
      },
      // Multi-angle protocol
      {
        id: "iso-multiangle",
        name: "ISO Knee Extension — Margir hornpunktar",
        sets: "3–4 per horn", reps: "15–30 sek", intensity: "70–100% MVC", tempo: "Sustained — hámarks", rest: "60 sek milli horna",
        note: "30° · 60° · 90° hnébeygja · Heildarstyrkt tendon á öllum bilum",
      },
    ],
  },
];

// ─── Structure-specific exercise categories ───────────────────────────────────
// Keyed by WORKOUT_STRUCTURES id (or "cluster-variations" for all cluster sub-types)
// Each entry replaces the generic EXERCISE_CATEGORIES when that structure is active.

const STRUCTURE_EXERCISE_MAP: Record<string, ExerciseCategory[]> = {
  "french-contrast": [
    {
      id: "fc-a1", label: "A1 — Heavy Compound", icon: "🏋️",
      exercises: [
        { id: "fc-squat",   name: "Back Squat",      sets: "3–4", reps: "3–4 endurtekningar", intensity: "85–90% 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sek → A2 · 3–4 mín milli setta" },
        { id: "fc-fsquat",  name: "Front Squat",     sets: "3–4", reps: "3–4 endurtekningar", intensity: "82–87% 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sek → A2" },
        { id: "fc-tbdl",    name: "Trap Bar DL",     sets: "3–4", reps: "3–4 endurtekningar", intensity: "83–88% 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sek → A2" },
        { id: "fc-bench1",  name: "Bench Press",     sets: "3–4", reps: "3–4 endurtekningar", intensity: "85–90% 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "Efri líkamshluti · 10–15 sek → A2" },
      ],
    },
    {
      id: "fc-a2", label: "A2 — Plyometric", icon: "🦘",
      exercises: [
        { id: "fc-dj",      name: "Depth Jump",      sets: "3–4", reps: "3 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Lágmarks snertitími", rest: "—", note: "Strax á eftir A1 · 10–15 sek → A3" },
        { id: "fc-boxj",    name: "Box Jump",        sets: "3–4", reps: "3 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Fullur kraftur upp",   rest: "—", note: "Strax á eftir A1 · 10–15 sek → A3" },
        { id: "fc-hurdle",  name: "Hurdle Hop",      sets: "3–4", reps: "3 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Stíft hné",            rest: "—", note: "10–15 sek → A3" },
        { id: "fc-mbslam",  name: "Med Ball Slam",   sets: "3–4", reps: "3 endurtekningar",   intensity: "5–8 kg",      tempo: "Hámarks flýti",       rest: "—", note: "Efri · strax á eftir A1 · 10–15 sek → A3" },
      ],
    },
    {
      id: "fc-a3", label: "A3 — Weighted Explosive", icon: "⚡",
      exercises: [
        { id: "fc-jsq",     name: "Jump Squat",      sets: "3–4", reps: "3 endurtekningar",   intensity: "30% 1RM",    velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sek → A4" },
        { id: "fc-tbj",     name: "Trap Bar Jump",   sets: "3–4", reps: "3 endurtekningar",   intensity: "25–30% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sek → A4" },
        { id: "fc-dbjsq",   name: "DB Jump Squat",   sets: "3–4", reps: "3 endurtekningar",   intensity: "20–25% 1RM", velocity: "~1.3–1.9 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sek → A4" },
        { id: "fc-pp3",     name: "Push Press",      sets: "3–4", reps: "3 endurtekningar",   intensity: "40–50% 1RM", velocity: "~0.90–1.10 m/s", velocityLoss: "10% VL", rest: "—", note: "Efri · 10–15 sek → A4" },
      ],
    },
    {
      id: "fc-a4", label: "A4 — Reactive", icon: "🔄",
      exercises: [
        { id: "fc-bj",      name: "Broad Jump",      sets: "3–4", reps: "3 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Fullur kraftur",   rest: "3–4 mín", note: "Lokastig · 3–4 mín → næsta sett" },
        { id: "fc-rhop",    name: "Reactive Hop",    sets: "3–4", reps: "5 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Stíft hné",       rest: "3–4 mín", note: "3–4 mín → næsta sett" },
        { id: "fc-latb",    name: "Lateral Bound",   sets: "3–4", reps: "3/hlið",             intensity: "Líkamsþyngd", tempo: "Hámarks flýti",   rest: "3–4 mín", note: "3–4 mín → næsta sett" },
        { id: "fc-mbsc",    name: "MB Scoop Throw",  sets: "3–4", reps: "3 endurtekningar",   intensity: "4–6 kg",      tempo: "Sprengifimi",     rest: "3–4 mín", note: "Efri · 3–4 mín → næsta sett" },
      ],
    },
  ],

  "contrast": [
    {
      id: "ct-a1", label: "A1 — Heavy", icon: "🏋️",
      exercises: [
        { id: "ct-sq",      name: "Back Squat",      sets: "4", reps: "3–4 endurtekningar", intensity: "85% 1RM",    velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "Strax → A2 · 2–3 mín milli para" },
        { id: "ct-tbdl",    name: "Trap Bar DL",     sets: "4", reps: "3–4 endurtekningar", intensity: "83–85% 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "—", note: "Strax → A2" },
        { id: "ct-bench",   name: "Bench Press",     sets: "4", reps: "3–4 endurtekningar", intensity: "85% 1RM",    velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "Efri · strax → A2" },
        { id: "ct-pp",      name: "Push Press",      sets: "4", reps: "3–4 endurtekningar", intensity: "80% 1RM",    velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "—", note: "Strax → A2" },
      ],
    },
    {
      id: "ct-a2", label: "A2 — Explosive", icon: "⚡",
      exercises: [
        { id: "ct-boxj",    name: "Box Jump",        sets: "4", reps: "5 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Hámarks flýti",       rest: "2–3 mín", note: "2–3 mín → næsta par" },
        { id: "ct-dj",      name: "Depth Jump",      sets: "4", reps: "5 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Lágmarks snertitími", rest: "2–3 mín", note: "2–3 mín → næsta par" },
        { id: "ct-bj",      name: "Broad Jump",      sets: "4", reps: "5 endurtekningar",   intensity: "Líkamsþyngd", tempo: "Fullur kraftur",       rest: "2–3 mín", note: "2–3 mín → næsta par" },
        { id: "ct-mbslam",  name: "Med Ball Slam",   sets: "4", reps: "5 endurtekningar",   intensity: "5–8 kg",      tempo: "Hámarks flýti",       rest: "2–3 mín", note: "Efri · 2–3 mín → næsta par" },
      ],
    },
  ],

  "potentiation-clusters": [
    {
      id: "pot-cl", label: "Cluster æfing", icon: "⚡",
      exercises: [
        { id: "pot-mtp",    name: "Mid-Thigh Pull",  sets: "4", reps: "(1+1+1) cluster",   intensity: "80–85% ISO", velocity: "~1.0–1.5 m/s", velocityLoss: "10% VL", rest: "2–3 mín", note: "15–20 sek intra-set hvíld" },
        { id: "pot-hclean", name: "Hang Clean",      sets: "4", reps: "(1+1+1) cluster",   intensity: "80–85% 1RM", velocity: "~1.0–1.3 m/s", velocityLoss: "10% VL", rest: "2–3 mín", note: "15–20 sek intra-set hvíld" },
        { id: "pot-pp",     name: "Push Press",      sets: "4", reps: "(1+1+1) cluster",   intensity: "78–83% 1RM", velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "2–3 mín", note: "15–20 sek intra-set hvíld" },
        { id: "pot-jsq",    name: "Jump Squat",      sets: "4", reps: "(1+1+1) cluster",   intensity: "40–50% 1RM", velocity: "~1.1–1.6 m/s", velocityLoss: "10% VL", rest: "2–3 mín", note: "15–20 sek intra-set hvíld" },
      ],
    },
  ],

  // All cluster sub-variants (garcia-ramos, moreno, hansen, etc.) share these categories
  "cluster-variations": [
    {
      id: "cl-str", label: "Styrkt", icon: "🏋️",
      exercises: [
        { id: "cl-sq",   name: "Back Squat",      sets: "", reps: "", intensity: "85–90%+ 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Back Squat · 85–90%+ 1RM · ~0.45–0.60 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
        { id: "cl-bp",   name: "Bench Press",     sets: "", reps: "", intensity: "85–90%+ 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Bench Press · 85–90%+ 1RM · ~0.45–0.55 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
        { id: "cl-dl",   name: "Deadlift",        sets: "", reps: "", intensity: "85–90%+ 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Deadlift · 85–90%+ 1RM · ~0.45–0.60 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
        { id: "cl-tbdl", name: "Trap Bar DL",     sets: "", reps: "", intensity: "83–88%+ 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Trap Bar Deadlift · 83–88%+ 1RM · ~0.45–0.60 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
      ],
    },
    {
      id: "cl-pow", label: "Kraft / Speed", icon: "⚡",
      exercises: [
        { id: "cl-jsq",   name: "Jump Squat",     sets: "", reps: "", intensity: "30–50% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Jump Squat · 30–50% 1RM · ~1.2–1.8 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
        { id: "cl-bt",    name: "Bench Throw",    sets: "", reps: "", intensity: "30–50% 1RM", velocity: "~1.1–1.6 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Bench Throw · 30–50% 1RM · ~1.1–1.6 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
        { id: "cl-mtp",   name: "Mid-Thigh Pull", sets: "", reps: "", intensity: "80–90% ISO", velocity: "~1.0–1.5 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Mid-Thigh Pull · 80–90% ISO · ~1.0–1.5 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
        { id: "cl-expu",  name: "Explosive Push-up", sets: "", reps: "", intensity: "Líkamsþyngd", velocity: "~0.90–1.20 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Explosive Push-up · Líkamsþyngd · ~0.90–1.20 m/s · 10% VL · Nota cluster-uppbyggingu (sett/reps/hvíld)" },
      ],
    },
  ],

  "supersets-lower-upper": [
    {
      id: "ss-lo", label: "Lower body (A1/B1)", icon: "🦵",
      exercises: [
        { id: "ss-rdl",  name: "Romanian Deadlift",     sets: "3–4", reps: "6–8 endurtekningar", intensity: "75% 1RM",    velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "30 sek → A2/B2", note: "Pöruð við efri" },
        { id: "ss-bss",  name: "Bulgarian Split Squat", sets: "3–4", reps: "8/hlið",             intensity: "65% 1RM",    velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "30 sek → A2/B2", note: "Pöruð við efri" },
        { id: "ss-lp",   name: "Leg Press",             sets: "3–4", reps: "8–10 endurtekningar", intensity: "70% 1RM",   velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "30 sek → A2/B2", note: "Pöruð við efri" },
        { id: "ss-su",   name: "Step-Up",               sets: "3–4", reps: "8/hlið",             intensity: "60% 1RM",    velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "30 sek → A2/B2", note: "Pöruð við efri" },
      ],
    },
    {
      id: "ss-up", label: "Upper body (A2/B2)", icon: "💪",
      exercises: [
        { id: "ss-bench", name: "Bench Press",          sets: "3–4", reps: "6–8 endurtekningar", intensity: "75% 1RM",    velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "30 sek → A1/B1", note: "Pöruð við neðri" },
        { id: "ss-row",   name: "Seated Row",           sets: "3–4", reps: "8 endurtekningar",   intensity: "RPE 7–8",    velocity: "~0.45–0.65 m/s", velocityLoss: "20% VL", rest: "30 sek → A1/B1", note: "Pöruð við neðri" },
        { id: "ss-pup",   name: "Weighted Pull-up",     sets: "3–4", reps: "4–6 endurtekningar", intensity: "RPE 8",      velocity: "~0.45–0.65 m/s", velocityLoss: "20% VL", rest: "30 sek → A1/B1", note: "Pöruð við neðri" },
        { id: "ss-pp",    name: "Push Press",           sets: "3–4", reps: "4–6 endurtekningar", intensity: "72% 1RM",    velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "30 sek → A1/B1", note: "Pöruð við neðri" },
      ],
    },
  ],
};

// Cluster sub-variant IDs all map to the shared "cluster-variations" categories
const CLUSTER_VARIANT_IDS = new Set(["garcia-ramos", "moreno", "hansen", "iglesias-soler", "tufano-standard", "tufano-cs2", "tufano-cs4", "oliver"]);

function resolvePickerCategories(structureId?: string | null): ExerciseCategory[] {
  if (!structureId) return EXERCISE_CATEGORIES;
  if (CLUSTER_VARIANT_IDS.has(structureId)) return STRUCTURE_EXERCISE_MAP["cluster-variations"];
  return STRUCTURE_EXERCISE_MAP[structureId] ?? EXERCISE_CATEGORIES;
}

// ─── Exercise picker (inline, per item) ───────────────────────────────────────

function ExercisePicker({ onSelect, onClose, structureId }: { onSelect: (line: string) => void; onClose: () => void; structureId?: string | null }) {
  const categories = resolvePickerCategories(structureId);
  const [activeCat, setActiveCat] = useState(categories[0].id);
  const cat = categories.find((c) => c.id === activeCat) ?? categories[0];

  return (
    <div className="mt-1 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-800">
          📚 Veldu æfingu
          {structureId && (
            <span className="ml-1.5 font-normal text-indigo-500">
              — {CLUSTER_VARIANT_IDS.has(structureId ?? "") ? "Cluster" : (STRUCTURE_EXERCISE_MAP[structureId ?? ""] ? "sérsniðið" : "almennt")}
            </span>
          )}
        </span>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕ Loka</button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCat(c.id)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
              activeCat === c.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
        {/* Always offer generic fallback if using structure-specific categories */}
        {structureId && STRUCTURE_EXERCISE_MAP[CLUSTER_VARIANT_IDS.has(structureId) ? "cluster-variations" : structureId] && (
          <button
            type="button"
            onClick={() => setActiveCat("__generic__")}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
              activeCat === "__generic__"
                ? "bg-slate-600 text-white border-slate-600"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            ＋ Aðrar æfingar
          </button>
        )}
      </div>

      {/* Exercise cards */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(activeCat === "__generic__" ? EXERCISE_CATEGORIES.flatMap((c) => c.exercises) : cat.exercises).map((ex) => (
          <button
            key={ex.id}
            type="button"
            onClick={() => onSelect(fmtExercise(ex))}
            className="rounded-lg border border-white bg-white p-2.5 text-left hover:border-indigo-300 hover:shadow-sm transition-all"
          >
            <div className="text-xs font-semibold text-foreground">{ex.name}</div>
            <div className="mt-1 space-y-0.5">
              {[
                ex.sets ? `📦 ${ex.sets} sett × ${ex.reps}` : null,
                `💪 ${ex.intensity}`,
                ex.velocity     ? `⚡ Hraði: ${ex.velocity}`    : null,
                ex.velocityLoss ? `📉 VL: ${ex.velocityLoss}`   : null,
                ex.tempo        ? `⏱ Tempo: ${ex.tempo}`        : null,
                ex.rest         ? `😴 Hvíld: ${ex.rest}`        : null,
                ex.note         ? `📝 ${ex.note}`               : null,
              ].filter((l): l is string => !!l).map((line, i) => (
                <div key={i} className="text-[10px] text-muted-foreground leading-snug">{line}</div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── File upload zone ──────────────────────────────────────────────────────────

function FileUploadZone({ onApply }: { onApply: (blocks: TemplateBlock[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "preview" | "error">("idle");
  const [parsedBlocks, setParsedBlocks] = useState<TemplateBlock[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleFile(file: File) {
    setStatus("loading");
    setErrorMsg("");
    try {
      let text = "";
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "xlsx" || ext === "xls") {
        text = await extractXLSXText(file);
      } else if (ext === "pdf") {
        text = await extractPDFText(file);
      } else if (ext === "csv" || ext === "txt") {
        text = await file.text();
      } else {
        throw new Error("Óstudd skráargerð. Notaðu Excel (.xlsx), CSV (.csv), PDF (.pdf) eða texta (.txt).");
      }
      if (!text.trim()) throw new Error("Skráin virtist tóm.");
      const blocks = parseTrainingText(text);
      setParsedBlocks(blocks);
      setStatus("preview");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Óþekkt villa við lestur skráar.");
      setStatus("error");
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so same file can be re-selected
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function applyAndReset() {
    onApply(parsedBlocks);
    setStatus("idle");
    setParsedBlocks([]);
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt,.pdf"
        className="hidden"
        onChange={handleInputChange}
      />

      {status === "idle" && (
        <div
          className="flex flex-col items-center gap-2 py-3 cursor-pointer"
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <span className="text-2xl">📎</span>
          <p className="text-sm font-medium text-slate-700">Hlaða upp æfingakerfi</p>
          <p className="text-[11px] text-muted-foreground text-center">
            Excel (.xlsx), CSV (.csv), PDF (.pdf) eða texti (.txt)<br />
            Smelltu eða dragðu skrá hingað
          </p>
        </div>
      )}

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-4">
          <span className="animate-spin text-lg">⏳</span>
          <span className="text-sm text-muted-foreground">Les skrána...</span>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2 py-2">
          <p className="text-sm text-red-600 text-center">⚠️ {errorMsg}</p>
          <div className="flex justify-center">
            <Button size="sm" variant="outline" onClick={() => { setStatus("idle"); fileRef.current?.click(); }}>
              Reyna aftur
            </Button>
          </div>
        </div>
      )}

      {status === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              📋 Fundust {parsedBlocks.length} blokkir
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              ✕ Hætta við
            </button>
          </div>
          {/* Preview list */}
          <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border bg-white p-2">
            {parsedBlocks.map((b, i) => (
              <div key={i} className="rounded-md bg-slate-50 px-2 py-1.5">
                <p className="text-[11px] font-semibold text-foreground">{b.block}</p>
                <p className="text-[10px] text-muted-foreground">
                  {b.items.length} {b.items.length === 1 ? "lína" : "línur"}
                  {b.items[0] ? ` — ${b.items[0].slice(0, 50)}${b.items[0].length > 50 ? "…" : ""}` : ""}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={applyAndReset}>
              ✓ Nota þessa blokkir
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setStatus("idle"); fileRef.current?.click(); }}>
              Skipta um skrá
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Block editor ─────────────────────────────────────────────────────────────

function MoveBtn({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function BlockEditor({
  block,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  structureId,
}: {
  block: TemplateBlock;
  onChange: (b: TemplateBlock) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  structureId?: string | null;
}) {
  const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null);

  function setName(name: string) { onChange({ ...block, block: name }); }
  function setItem(i: number, val: string) {
    const items = [...block.items];
    items[i] = val;
    onChange({ ...block, items });
  }
  function addItem() { onChange({ ...block, items: [...block.items, ""] }); }
  function removeItem(i: number) {
    setPickerOpenIdx(null);
    onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) });
  }
  function moveItem(i: number, dir: -1 | 1) {
    const items = [...block.items];
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    if (pickerOpenIdx === i) setPickerOpenIdx(j);
    else if (pickerOpenIdx === j) setPickerOpenIdx(i);
    onChange({ ...block, items });
  }
  function insertExercise(i: number, line: string) {
    setItem(i, line);
    setPickerOpenIdx(null);
  }

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      {/* Block header */}
      <div className="flex items-center gap-1.5">
        {/* Block reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <MoveBtn onClick={onMoveUp ?? (() => {})} disabled={!onMoveUp} title="Færa blokk upp">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
          </MoveBtn>
          <MoveBtn onClick={onMoveDown ?? (() => {})} disabled={!onMoveDown} title="Færa blokk niður">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </MoveBtn>
        </div>
        <Input
          value={block.block}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nafn blokkar (t.d. Upphitun, A. Contrast)"
          className="text-sm font-medium"
        />
        <Button type="button" variant="ghost" size="sm" className="text-destructive shrink-0" onClick={onRemove}>
          ✕
        </Button>
      </div>

      {/* Exercise rows */}
      <div className="mt-2 space-y-1.5">
        {block.items.map((item, i) => (
          <div key={i} className="space-y-1">
            <div className="flex gap-1.5 items-center">
              {/* Exercise reorder */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <MoveBtn onClick={() => moveItem(i, -1)} disabled={i === 0} title="Færa upp">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                </MoveBtn>
                <MoveBtn onClick={() => moveItem(i, 1)} disabled={i === block.items.length - 1} title="Færa niður">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </MoveBtn>
              </div>
              <Input
                value={item}
                onChange={(e) => setItem(i, e.target.value)}
                placeholder="Æfing eða leiðbeiningar..."
                className="h-8 text-xs"
              />
              {/* Exercise picker toggle */}
              <button
                type="button"
                title="Velja æfingu úr lista"
                onClick={() => setPickerOpenIdx(pickerOpenIdx === i ? null : i)}
                className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md border text-sm transition-colors ${
                  pickerOpenIdx === i
                    ? "border-indigo-500 bg-indigo-100 text-indigo-700"
                    : "border-dashed border-indigo-300 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                }`}
              >
                📚
              </button>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground shrink-0" onClick={() => removeItem(i)}>
                ✕
              </Button>
            </div>
            {/* Inline exercise picker */}
            {pickerOpenIdx === i && (
              <ExercisePicker
                onSelect={(line) => insertExercise(i, line)}
                onClose={() => setPickerOpenIdx(null)}
                structureId={structureId}
              />
            )}
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs text-muted-foreground" onClick={addItem}>
          + Bæta við línu
        </Button>
      </div>

      {/* Rest / rounds metadata */}
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-blue-600">⏱</span>
          <Input
            value={block.rest_between_sets ?? ""}
            onChange={(e) => onChange({ ...block, rest_between_sets: e.target.value || undefined })}
            placeholder="Hvíld milli setta (t.d. 60s)"
            className="h-7 text-[11px] w-44"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-violet-600">🔄</span>
          <Input
            value={block.rest_between_rounds ?? ""}
            onChange={(e) => onChange({ ...block, rest_between_rounds: e.target.value || undefined })}
            placeholder="Umferðir / rounds"
            className="h-7 text-[11px] w-44"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Template preview (read-only) ────────────────────────────────────────────

/** Classify a block by its name for color-coding */
function classifyBlock(name: string): "warmup" | "main" | "iso" | "core" | "cooldown" | "default" {
  const l = name.toLowerCase();
  if (["upphitun", "warmup", "warm-up", "activation", "virkjun"].some((k) => l.includes(k))) return "warmup";
  if (["niðurlag", "cooldown", "cool-down", "teygjur", "stretch"].some((k) => l.includes(k))) return "cooldown";
  if (["iso", "isometric"].some((k) => l.includes(k))) return "iso";
  if (["kjarni", "core", "pallof", "dead bug", "plank"].some((k) => l.includes(k))) return "core";
  return "main";
}

const BLOCK_COLORS: Record<ReturnType<typeof classifyBlock>, { bg: string; border: string; header: string; text: string }> = {
  warmup:  { bg: "bg-sky-50",     border: "border-sky-100",     header: "text-sky-800",     text: "text-sky-700" },
  main:    { bg: "bg-slate-50",   border: "border-slate-200",   header: "text-slate-800",   text: "text-slate-600" },
  iso:     { bg: "bg-violet-50",  border: "border-violet-100",  header: "text-violet-800",  text: "text-violet-600" },
  core:    { bg: "bg-amber-50",   border: "border-amber-100",   header: "text-amber-800",   text: "text-amber-700" },
  cooldown:{ bg: "bg-teal-50",    border: "border-teal-100",    header: "text-teal-800",    text: "text-teal-600" },
  default: { bg: "bg-neutral-50", border: "border-neutral-200", header: "text-neutral-800",  text: "text-neutral-600" },
};

function TemplatePreview({
  template,
  color,
  onEdit,
  isOverridden,
}: {
  template: TemplateRecord;
  color: "green" | "yellow" | "red";
  onEdit?: () => void;
  isOverridden?: boolean;
}) {
  const cardColors = {
    green:  { badge: "bg-green-100 text-green-800",  border: "border-green-200",  accent: "bg-green-500"  },
    yellow: { badge: "bg-yellow-100 text-yellow-800", border: "border-yellow-200", accent: "bg-yellow-500" },
    red:    { badge: "bg-red-100 text-red-800",       border: "border-red-200",    accent: "bg-red-500"    },
  };
  const cc = cardColors[color];

  return (
    <div className={`rounded-xl border ${cc.border} overflow-hidden`}>
      {/* Colored top accent */}
      <div className={`h-1 ${cc.accent}`} />

      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cc.badge}`}>
              {template.readiness_level}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold leading-snug truncate">
                {template.title}
                {isOverridden && <span className="ml-1 text-[10px] text-amber-600 font-normal">(breytt)</span>}
              </div>
              {template.description && (
                <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{template.description}</div>
              )}
            </div>
          </div>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[10px] font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              ✏️ Breyta
            </button>
          )}
        </div>

        {/* Blocks */}
        <div className="mt-2.5 space-y-2">
          {template.structure.map((block, i) => {
            const kind = classifyBlock(block.block);
            const bc = BLOCK_COLORS[kind];

            return (
              <div key={i} className={`rounded-lg border ${bc.border} ${bc.bg} px-2.5 py-1.5`}>
                {/* Block name */}
                <div className={`text-[11px] font-bold uppercase tracking-wider ${bc.header}`}>
                  {block.block}
                </div>

                {/* Rest / rounds badges */}
                {(block.rest_between_sets || block.rest_between_rounds) && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {block.rest_between_sets && (
                      <span className="rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 border border-blue-100">
                        ⏱ {block.rest_between_sets}
                      </span>
                    )}
                    {block.rest_between_rounds && (
                      <span className="rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-violet-600 border border-violet-100">
                        🔄 {block.rest_between_rounds}
                      </span>
                    )}
                  </div>
                )}

                {/* Exercise lines — clean, no bullets */}
                <div className="mt-1 space-y-0.5">
                  {block.items.map((item, j) => {
                    // VBT annotation
                    if (/velocity|m\/s|hraðamarkmið|hraðaþröskuldur|hraðatap|VT:/i.test(item)) {
                      return (
                        <div key={j} className="text-[10px] font-medium text-emerald-700 bg-emerald-50/80 rounded px-1.5 py-0.5">
                          ⚡ {item}
                        </div>
                      );
                    }
                    // Rest/round inline (shouldn't appear if properly extracted, but fallback)
                    if (/^\d+\s*(mín|min|sek|sec)\s*(hvíld|rest)/i.test(item) || /^(hvíld|rest)/i.test(item)) {
                      return (
                        <div key={j} className="text-[10px] text-blue-500">
                          ⏱ {item}
                        </div>
                      );
                    }
                    if (/^\d+\s*(umferð|round|cluster|hring)/i.test(item)) {
                      return (
                        <div key={j} className="text-[10px] text-violet-500">
                          🔄 {item}
                        </div>
                      );
                    }
                    // Metadata / labels
                    if (/^(ef |markmið|styrkt:|kraftur:|þyngd:|aðeins|samanborið)/i.test(item)) {
                      return (
                        <div key={j} className="text-[10px] text-neutral-400 italic">{item}</div>
                      );
                    }
                    // Regular exercise line
                    return (
                      <div key={j} className={`text-[11px] ${bc.text}`}>{item}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Inline editor for YELLOW / RED overrides ────────────────────────────────

function TemplateOverrideEditor({
  template,
  color,
  onSave,
  onCancel,
  onReset,
  isOverridden,
}: {
  template: TemplateRecord;
  color: "yellow" | "red";
  onSave: (t: TemplateRecord) => void;
  onCancel: () => void;
  onReset?: () => void;
  isOverridden: boolean;
}) {
  const [draft, setDraft] = useState<TemplateRecord>(() => JSON.parse(JSON.stringify(template)));

  const colorLabel = color === "yellow" ? "Gula" : "Rauða";
  const borderColor = color === "yellow" ? "border-yellow-300" : "border-red-300";
  const bgColor = color === "yellow" ? "bg-yellow-50" : "bg-red-50";

  function updateBlockName(idx: number, name: string) {
    setDraft((d) => {
      const s = [...d.structure];
      s[idx] = { ...s[idx], block: name };
      return { ...d, structure: s };
    });
  }

  function updateItem(blockIdx: number, itemIdx: number, value: string) {
    setDraft((d) => {
      const s = [...d.structure];
      const items = [...s[blockIdx].items];
      items[itemIdx] = value;
      s[blockIdx] = { ...s[blockIdx], items };
      return { ...d, structure: s };
    });
  }

  function removeItem(blockIdx: number, itemIdx: number) {
    setDraft((d) => {
      const s = [...d.structure];
      const items = s[blockIdx].items.filter((_, j) => j !== itemIdx);
      s[blockIdx] = { ...s[blockIdx], items };
      return { ...d, structure: s };
    });
  }

  function addItem(blockIdx: number) {
    setDraft((d) => {
      const s = [...d.structure];
      s[blockIdx] = { ...s[blockIdx], items: [...s[blockIdx].items, ""] };
      return { ...d, structure: s };
    });
  }

  return (
    <div className={`rounded-xl border-2 ${borderColor} ${bgColor} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{colorLabel} útgáfa — breyta</div>
        <div className="flex gap-2">
          {isOverridden && onReset && (
            <button type="button" onClick={onReset}
              className="text-[11px] text-amber-600 hover:text-amber-800 underline">
              Endursetja sjálfvirka
            </button>
          )}
          <button type="button" onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground">✕ Hætta við</button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-[11px] font-medium text-neutral-500">Titill</label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="mt-0.5 w-full rounded-md border px-2 py-1 text-sm"
        />
      </div>

      {/* Blocks */}
      {draft.structure.map((block, bi) => (
        <div key={bi} className="rounded-lg border border-neutral-200 bg-white p-3 space-y-1.5">
          <input
            type="text"
            value={block.block}
            onChange={(e) => updateBlockName(bi, e.target.value)}
            className="w-full rounded border px-2 py-0.5 text-xs font-semibold"
          />
          {block.items.map((item, ii) => (
            <div key={ii} className="flex items-center gap-1">
              <span className="text-neutral-400 text-xs">·</span>
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(bi, ii, e.target.value)}
                className="flex-1 rounded border px-2 py-0.5 text-xs"
              />
              <button type="button" onClick={() => removeItem(bi, ii)}
                className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => addItem(bi)}
            className="text-[11px] text-indigo-600 hover:text-indigo-800">+ Bæta við línu</button>
        </div>
      ))}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Vista breytingar
        </button>
      </div>
    </div>
  );
}

// ─── Team option type ─────────────────────────────────────────────────────────

type TeamOption = {
  id: string;
  name: string;
  sport: string | null;
  gender: string | null;
  isPrimary: boolean;
};

const SPORT_ICONS: Record<string, string> = {
  football: "⚽", basketball: "🏀", handball: "🤾", volleyball: "🏐",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomTemplatesPage() {
  const [sets, setSets] = useState<TemplateSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);

  // All teams this coach has access to + selected team
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const selectedTeam = allTeams.find((t) => t.id === selectedTeamId) ?? null;
  const teamName   = selectedTeam?.name   ?? null;
  const teamSport  = selectedTeam?.sport  ?? null;
  const teamGender = selectedTeam?.gender ?? null;

  // Builder state
  const [step, setStep] = useState<Step>(1);
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>(["GENERIC"]);
  const [currentDayIdx, setCurrentDayIdx] = useState(0);
  const [greenTemplates, setGreenTemplates] = useState<GreenTemplates>({});

  // Manual overrides for auto-generated YELLOW / RED (keyed by md_day)
  const [yellowOverrides, setYellowOverrides] = useState<Record<string, TemplateRecord>>({});
  const [redOverrides, setRedOverrides] = useState<Record<string, TemplateRecord>>({});
  // Which color is being edited in the inline editor (null = closed)
  const [editingColor, setEditingColor] = useState<{ day: string; color: "yellow" | "red" } | null>(null);

  // AI workout description textarea
  const [workoutDescription, setWorkoutDescription] = useState("");
  const [showDescriptionBox, setShowDescriptionBox] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Which existing set is being edited (null = creating new)
  const [editingSet, setEditingSet] = useState<TemplateSet | null>(null);

  // Days that already have records in DB (for the current set being edited)
  const [existingDays, setExistingDays] = useState<string[]>([]);

  // Track which workout structure was last applied per day (for context-aware exercise picker)
  const [dayStructureIds, setDayStructureIds] = useState<Record<string, string>>({});

  // set name = team name (auto), sport + gender from selected team
  const setName   = teamName   ?? "";
  const sport     = teamSport  ?? "";
  const gender    = teamGender ?? null;
  const tableName = buildTableName(setName, sport, gender);

  // ── Load existing sets ──────────────────────────────────────────────────────
  const loadSets = useCallback(async (forTeamId?: string | null) => {
    setLoadingSets(true);
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoadingSets(false); return; }

    const url = forTeamId
      ? `/api/coach/custom-templates?team_id=${encodeURIComponent(forTeamId)}`
      : "/api/coach/custom-templates";

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setSets(json.sets ?? []);
    }
    setLoadingSets(false);
  }, []);

  // Reload sets whenever the selected team changes
  useEffect(() => { void loadSets(selectedTeamId); }, [loadSets, selectedTeamId]);

  // ── Load ALL teams this coach has access to ───────────────────────────────────
  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const collected = new Map<string, TeamOption>();

      // 1) Primary team from profiles
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      const primaryId = (prof as any)?.team_id as string | null;

      // 2) All teams from coach_teams
      const { data: coachRows } = await supabase
        .from("coach_teams")
        .select("team_id, is_primary")
        .eq("coach_id", user.id);

      const allTeamIds: { id: string; isPrimary: boolean }[] = [];
      if (primaryId) allTeamIds.push({ id: primaryId, isPrimary: true });
      for (const row of (coachRows ?? []) as any[]) {
        if (row.team_id && !allTeamIds.find((t) => t.id === row.team_id)) {
          allTeamIds.push({ id: row.team_id, isPrimary: !!row.is_primary });
        }
      }

      if (allTeamIds.length === 0) return;

      // 3) Fetch team details in one query
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, sport, gender")
        .in("id", allTeamIds.map((t) => t.id));

      for (const t of (teams ?? []) as any[]) {
        const isPrimary = allTeamIds.find((x) => x.id === t.id)?.isPrimary ?? false;
        collected.set(t.id, { id: t.id, name: t.name, sport: t.sport, gender: t.gender, isPrimary });
      }

      const sorted = Array.from(collected.values()).sort((a, b) =>
        (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
      );
      setAllTeams(sorted);

      // Auto-select primary (or first)
      const primary = sorted.find((t) => t.isPrimary) ?? sorted[0];
      if (primary) setSelectedTeamId(primary.id);
    })();
  }, []);

  // ── Per-day green template state ─────────────────────────────────────────────
  function getOrInitGreen(day: string): TemplateRecord {
    return (
      greenTemplates[day] ?? {
        md_day: day,
        readiness_level: "GREEN",
        title: `🟢 ${day} — `,
        description: "",
        structure: [
          {
            block: "Upphitun",
            items: [
              "Mini-band glute walk 2×10",
              "Hip bridge 2×8",
              "Split Squat ISO 5 sek × 2/hlið",
            ],
          },
          {
            block: "B. Aðalvinna",
            items: [""],
          },
        ],
        variant: "A",
      }
    );
  }

  function updateGreen(day: string, patch: Partial<TemplateRecord>) {
    setGreenTemplates((prev) => ({
      ...prev,
      [day]: { ...getOrInitGreen(day), ...patch },
    }));
  }

  function updateBlock(day: string, blockIdx: number, block: TemplateBlock) {
    const t = getOrInitGreen(day);
    const structure = [...t.structure];
    structure[blockIdx] = block;
    updateGreen(day, { structure });
  }

  function addBlock(day: string) {
    const t = getOrInitGreen(day);
    updateGreen(day, {
      structure: [...t.structure, { block: "Ný blokk", items: [""] }],
    });
  }

  function removeBlock(day: string, i: number) {
    const t = getOrInitGreen(day);
    updateGreen(day, { structure: t.structure.filter((_, idx) => idx !== i) });
  }

  function moveBlock(day: string, i: number, dir: -1 | 1) {
    const t = getOrInitGreen(day);
    const s = [...t.structure];
    const j = i + dir;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    updateGreen(day, { structure: s });
  }

  // Replace everything after the first (warmup) block with the chosen structure's blocks
  function applyStructureToDay(day: string, newBlocks: TemplateBlock[], structureId?: string) {
    const t = getOrInitGreen(day);
    const warmup = t.structure[0]; // always keep warmup
    updateGreen(day, { structure: warmup ? [warmup, ...newBlocks] : newBlocks });
    if (structureId) setDayStructureIds((prev) => ({ ...prev, [day]: structureId }));
  }

  // ── Build all records ────────────────────────────────────────────────────────
  function buildAllRecords(): TemplateRecord[] {
    const records: TemplateRecord[] = [];
    for (const day of selectedDays) {
      const green = getOrInitGreen(day);
      records.push(green);
      records.push(yellowOverrides[day] ?? generateYellow(green));
      records.push(redOverrides[day] ?? generateRed(green));
    }
    return records;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveOk(null); setSaveErr(null);
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaveErr("Ekki innskráður."); setSaving(false); return; }

    const records = buildAllRecords();
    const res = await fetch("/api/coach/custom-templates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        team_id:      selectedTeamId,
        set_name:     setName.trim(),
        sport:        sport,
        gender:       gender,
        season_phase: seasonPhase,
        table_name:   tableName,
        md_days:      selectedDays,
        records,
      }),
    });

    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Villa við vistun."); setSaving(false); return; }

    const newDays = selectedDays.filter((d) => !existingDays.includes(d));
    const updatedDays = selectedDays.filter((d) => existingDays.includes(d));
    const parts = [];
    if (newDays.length) parts.push(`${newDays.length} nýr dagur bætt við`);
    if (updatedDays.length) parts.push(`${updatedDays.length} dagur uppfærður`);
    setSaveOk(`Vistað ✅ — ${tableName} — ${parts.join(", ") || `${records.length} færslur`}`);
    setSaving(false);
    setShowBuilder(false);
    resetBuilder();
    void loadSets(selectedTeamId);
  }

  function resetBuilder() {
    setStep(1); setSeasonPhase(null);
    setSelectedDays(["GENERIC"]); setCurrentDayIdx(0);
    setGreenTemplates({}); setExistingDays([]);
    setYellowOverrides({}); setRedOverrides({});
    setEditingColor(null); setEditingSet(null);
    // setName/sport/gender are derived from selectedTeam — no reset needed
  }

  // Load an existing set into the builder (for editing)
  async function loadExistingSet(s: TemplateSet) {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // setName/sport/gender are derived from selected team — not overridden from the set record
    setEditingSet(s);
    setSeasonPhase((s.season_phase as SeasonPhase | null) ?? null);
    setExistingDays(s.md_days ?? []);
    // Start with existing days selected, coach can add more
    setSelectedDays(s.md_days ?? []);
    setCurrentDayIdx(0);
    setGreenTemplates({});
    setStep(2);
    setShowBuilder(true);

    // Fetch existing GREEN records and pre-populate builder (filtered by season_phase)
    const params = new URLSearchParams({ table_name: s.table_name });
    if (s.season_phase) params.set("season_phase", s.season_phase);
    const res = await fetch(`/api/coach/custom-templates?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;

    const json = await res.json();
    const greenRecords: TemplateRecord[] = json.records ?? [];

    const loaded: GreenTemplates = {};
    for (const r of greenRecords) {
      loaded[r.md_day] = {
        md_day:          r.md_day,
        readiness_level: "GREEN",
        title:           r.title,
        description:     r.description ?? "",
        structure:       r.structure as import("@/lib/micropulse/templateAutoGenerate").TemplateBlock[],
        variant:         r.variant ?? "A",
      };
    }
    setGreenTemplates(loaded);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const currentDay = selectedDays[currentDayIdx] ?? selectedDays[0];
  const currentGreen = getOrInitGreen(currentDay);
  const currentYellow = yellowOverrides[currentDay] ?? generateYellow(currentGreen);
  const currentRed    = redOverrides[currentDay]    ?? generateRed(currentGreen);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mitt æfingakerfi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Búðu til þitt eigið microdose kerfi. Þú skilgreinir grænu útgáfuna — kerfið sér um gulu og rauðu.
          </p>
        </div>
        {!showBuilder && (
          <Button onClick={() => { setShowBuilder(true); setStep(1); }}>
            + Búa til nýtt kerfi
          </Button>
        )}
      </div>

      {/* Success message */}
      {saveOk && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <CardContent className="pt-4 text-sm text-emerald-700">{saveOk}</CardContent>
        </Card>
      )}

      {/* Existing sets list */}
      {!showBuilder && (
        <div className="space-y-3">
          {loadingSets ? (
            <p className="text-sm text-muted-foreground">Hleður...</p>
          ) : sets.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                Ekkert eigið æfingakerfi til enn. Búðu til þitt fyrsta hér að ofan.
              </CardContent>
            </Card>
          ) : (
            sets.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium">{s.set_name}</div>
                      <span className="text-xs text-muted-foreground">{s.sport}</span>
                      {s.gender && (
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${s.gender === "M" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-600"}`}>
                          {s.gender === "M" ? "Karlar" : "Konur"}
                        </span>
                      )}
                      {s.season_phase && (() => {
                        const p = SEASON_PHASES.find((ph) => ph.id === s.season_phase);
                        return p ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${p.color}`}>
                            {p.icon} {p.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground font-mono">{s.table_name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(s.md_days ?? []).map((d) => (
                        <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("is-IS")}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => void loadExistingSet(s)}
                    >
                      ✏️ Breyta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── BUILDER ──────────────────────────────────────────────────────────── */}
      {showBuilder && (
        <div className="space-y-4">

          {/* Step indicator */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              [1, "Nafn & íþrótt"],
              [2, "Veldu daga"],
              [3, "Byggðu GREEN"],
              [4, "Yfirlit & vista"],
            ] as [Step, string][]).map(([n, label]) => (
              <button
                key={n}
                type="button"
                onClick={() => step > n && setStep(n)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  step === n ? "bg-muted border-foreground/20 font-medium" : step > n ? "hover:bg-muted/50 cursor-pointer" : "opacity-40 cursor-default"
                }`}
              >
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                  step === n ? "bg-foreground text-background" : step > n ? "bg-emerald-500 text-white" : "bg-muted text-foreground"
                }`}>
                  {step > n ? "✓" : n}
                </span>
                {label}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="ml-auto text-xs text-muted-foreground" onClick={() => { setShowBuilder(false); resetBuilder(); }}>
              Hætta við
            </Button>
          </div>

          {/* Edit mode banner */}
          {editingSet && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              <span className="text-base">✏️</span>
              <div>
                <span className="font-semibold">{editingSet.set_name}</span>
                {editingSet.season_phase && (
                  <span className="ml-1 text-amber-600">({editingSet.season_phase})</span>
                )}
                <span className="ml-2 text-amber-700">— breytingar yfirskrifa núverandi færslur. Þú getur líka bætt við nýjum dögum.</span>
              </div>
            </div>
          )}

          {/* ── Step 1: Name & sport ─────────────────────────────────────────── */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skref 1 — Lið &amp; tímabil</CardTitle>
                <CardDescription>Veldu lið og tímabil. Dagarnir (MD-4, MD-2 o.s.frv.) eru svo valdir í næsta skrefi.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">

                {/* Team selector — single team: read-only banner; multiple teams: clickable cards */}
                {allTeams.length === 0 && (
                  <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground animate-pulse">
                    Hleður liðsupplýsingar…
                  </div>
                )}

                {allTeams.length === 1 && (
                  <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3">
                    <div className="text-2xl">
                      {SPORT_ICONS[teamSport ?? ""] ?? "🏅"}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{teamName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground flex gap-2">
                        {teamSport && <span className="capitalize">{teamSport}</span>}
                        {teamGender && (
                          <span className={`font-medium ${teamGender === "M" ? "text-blue-600" : "text-rose-500"}`}>
                            {teamGender === "M" ? "Karlar" : "Konur"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-auto text-[10px] text-muted-foreground">Frá prófíl liðs</div>
                  </div>
                )}

                {allTeams.length > 1 && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Veldu lið</p>
                      <span className="text-xs text-muted-foreground">{allTeams.length} lið í boði</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allTeams.map((team) => {
                        const isSelected = selectedTeamId === team.id;
                        return (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => setSelectedTeamId(team.id)}
                            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                              isSelected
                                ? "border-foreground bg-muted shadow-sm ring-1 ring-foreground/20"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <div className="text-2xl shrink-0">
                              {SPORT_ICONS[team.sport ?? ""] ?? "🏅"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold leading-tight truncate">{team.name}</div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                {team.sport && <span className="capitalize">{team.sport}</span>}
                                {team.gender && (
                                  <span className={`font-medium ${team.gender === "M" ? "text-blue-600" : "text-rose-500"}`}>
                                    {team.gender === "M" ? "Karlar" : "Konur"}
                                  </span>
                                )}
                                {team.isPrimary && (
                                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                    Aðallið
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="shrink-0 text-foreground text-sm font-bold">✓</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Season phase */}
                <div className="grid gap-2">
                  <Label>Tímabil <span className="text-muted-foreground font-normal">(valfrjáls)</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEASON_PHASES.map((phase) => (
                      <button
                        key={phase.id}
                        type="button"
                        onClick={() => setSeasonPhase((p) => p === phase.id ? null : phase.id)}
                        className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                          seasonPhase === phase.id ? phase.activeColor : `${phase.color} hover:opacity-80`
                        }`}
                      >
                        <span className="text-xl leading-none mt-0.5">{phase.icon}</span>
                        <div>
                          <div className="text-sm font-semibold leading-tight">{phase.label}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{phase.sublabel}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {sport && (
                  <div className="rounded-lg bg-muted px-3 py-2 text-xs space-y-0.5">
                    <div>
                      <span className="text-muted-foreground">Tafla í DB: </span>
                      <span className="font-mono font-medium text-foreground">{tableName}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!sport}>
                    Næsta →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Select MD days ───────────────────────────────────────── */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skref 2 — Veldu æfingadaga</CardTitle>
                <CardDescription>
                  {editingSet
                    ? "Veldu hvaða daga þú vilt breyta. Valdir dagar yfirskrifa núverandi gögn. Þú getur líka bætt við nýjum dögum."
                    : "Hvaða microdose daga viltu skilgreina í þínu kerfi?"}
                  {existingDays.length > 0 && (
                    <span className="ml-1 text-amber-600 font-medium">
                      — {existingDays.length} dagur þegar til.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  {MD_DAYS.map((day) => {
                    const selected = selectedDays.includes(day);
                    const alreadySaved = existingDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setSelectedDays((prev) =>
                            selected ? prev.filter((d) => d !== day) : [...prev, day]
                          )
                        }
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                          selected ? "border-foreground bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${selected ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                          {selected ? "✓" : " "}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{day}</div>
                          <div className="text-xs text-muted-foreground">{MD_DAY_LABELS[day]}</div>
                        </div>
                        {alreadySaved && (
                          <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                            selected
                              ? "text-amber-700 bg-amber-50 border border-amber-200"
                              : "text-emerald-600 bg-emerald-50 border border-emerald-200"
                          }`}>
                            {selected ? "✏️ Uppfærist" : "✓ Í gagnagrunni"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>← Til baka</Button>
                  <Button onClick={() => { setCurrentDayIdx(0); setStep(3); }} disabled={selectedDays.length === 0}>
                    Næsta → Byggja GREEN
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Build GREEN templates ────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Day tabs */}
              <div className="flex flex-wrap gap-2">
                {selectedDays.map((day, i) => {
                  const isExisting = existingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setCurrentDayIdx(i)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        currentDayIdx === i
                          ? "bg-foreground text-background border-foreground"
                          : isExisting
                          ? "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                          : "hover:bg-muted"
                      }`}
                    >
                      {isExisting ? "✏️ " : ""}{day}
                    </button>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🟢</span>
                    <div>
                      <CardTitle className="text-base">
                        {currentDay} — GREEN
                        {existingDays.includes(currentDay) && (
                          <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            ✏️ Breyting
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {existingDays.includes(currentDay)
                          ? "Þetta er núverandi GREEN template — breyttu og vistaðu til að uppfæra."
                          : "Þetta er þjálfunarkerfið þitt. Gul og rauð útgáfa verður búin til sjálfkrafa."}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-1.5">
                    <Label>Titill</Label>
                    <Input
                      value={currentGreen.title}
                      onChange={(e) => updateGreen(currentDay, { title: e.target.value })}
                      placeholder="🟢 GENERIC — Classic Microdose"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Lýsing (valfrjáls)</Label>
                    <Input
                      value={currentGreen.description ?? ""}
                      onChange={(e) => updateGreen(currentDay, { description: e.target.value })}
                      placeholder="Stutt lýsing á þjálfunarkerfinu..."
                    />
                  </div>

                  <Separator />

                  {/* ── AI workout description box ─────────────────────── */}
                  <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowDescriptionBox((v) => !v)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div>
                        <div className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                          <span>✨</span> Lýstu æfingakerfinu
                        </div>
                        <div className="text-xs text-indigo-600 mt-0.5">
                          Skrifaðu hvernig æfingin á að vera — kerfið býr til blokkir sjálfkrafa
                        </div>
                      </div>
                      <span className="text-indigo-400 text-xs">{showDescriptionBox ? "▲ Fela" : "▼ Opna"}</span>
                    </button>

                    {showDescriptionBox && (
                      <div className="space-y-2">
                        <Textarea
                          value={workoutDescription}
                          onChange={(e) => setWorkoutDescription(e.target.value)}
                          placeholder={`Dæmi:\nFrench Contrast\nBack Squat 85% × 3, Depth Jump × 3\nVelocity target: 0.8 m/s\n\neða frjáls lýsing:\nA. Upphitun\n  Foam roll 5 mín, Hip 90/90 2×8\nB. Styrktarblokk\n  Back Squat 4×6 á 80% — VT: 0.5 m/s\n  RFESS 3×8 — velocity loss 20%\n  60s hvíld milli setta\nC. Potentiation Cluster — Acceleration`}
                          rows={8}
                          className="text-sm font-mono bg-white"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-indigo-500">
                            VBT · French Contrast · Clusters · Potentiation · Hraðamarkmið · Hvíld
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!workoutDescription.trim()}
                            onClick={() => {
                              const blocks = parseSmartWorkoutText(workoutDescription);
                              if (blocks.length > 0) {
                                updateGreen(currentDay, { structure: blocks });
                                setShowDescriptionBox(false);
                              }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          >
                            Búa til blokkir →
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex-1 border-t" />
                    <span>eða hlaðið inn skjali</span>
                    <span className="flex-1 border-t" />
                  </div>

                  {/* File upload */}
                  <FileUploadZone
                    onApply={(blocks) => updateGreen(currentDay, { structure: blocks })}
                  />

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex-1 border-t" />
                    <span>eða veldu uppbyggingu</span>
                    <span className="flex-1 border-t" />
                  </div>

                  {/* Structure picker */}
                  <StructurePicker onApply={(blocks, sid) => applyStructureToDay(currentDay, blocks, sid)} />

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Blokkir</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => addBlock(currentDay)}>
                        + Bæta við blokk
                      </Button>
                    </div>
                    {currentGreen.structure.map((block, i) => (
                      <BlockEditor
                        key={i}
                        block={block}
                        onChange={(b) => updateBlock(currentDay, i, b)}
                        onRemove={() => removeBlock(currentDay, i)}
                        onMoveUp={i > 0 ? () => moveBlock(currentDay, i, -1) : undefined}
                        onMoveDown={i < currentGreen.structure.length - 1 ? () => moveBlock(currentDay, i, 1) : undefined}
                        structureId={dayStructureIds[currentDay] ?? null}
                      />
                    ))}
                  </div>

                  {/* Auto-generated preview (with edit option) */}
                  <Separator />
                  <div className="grid gap-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Sjálfkrafa myndar kerfið:
                    </div>

                    {/* Inline editor or preview for YELLOW */}
                    {editingColor?.day === currentDay && editingColor.color === "yellow" ? (
                      <TemplateOverrideEditor
                        template={currentYellow}
                        color="yellow"
                        isOverridden={!!yellowOverrides[currentDay]}
                        onSave={(t) => {
                          setYellowOverrides((prev) => ({ ...prev, [currentDay]: t }));
                          setEditingColor(null);
                        }}
                        onCancel={() => setEditingColor(null)}
                        onReset={() => {
                          setYellowOverrides((prev) => { const n = { ...prev }; delete n[currentDay]; return n; });
                          setEditingColor(null);
                        }}
                      />
                    ) : editingColor?.day === currentDay && editingColor.color === "red" ? (
                      /* Inline editor for RED */
                      <TemplateOverrideEditor
                        template={currentRed}
                        color="red"
                        isOverridden={!!redOverrides[currentDay]}
                        onSave={(t) => {
                          setRedOverrides((prev) => ({ ...prev, [currentDay]: t }));
                          setEditingColor(null);
                        }}
                        onCancel={() => setEditingColor(null)}
                        onReset={() => {
                          setRedOverrides((prev) => { const n = { ...prev }; delete n[currentDay]; return n; });
                          setEditingColor(null);
                        }}
                      />
                    ) : null}

                    {/* Preview cards (hidden while editing that color) */}
                    <div className="grid gap-2 md:grid-cols-2">
                      {!(editingColor?.day === currentDay && editingColor.color === "yellow") && (
                        <TemplatePreview
                          template={currentYellow}
                          color="yellow"
                          isOverridden={!!yellowOverrides[currentDay]}
                          onEdit={() => setEditingColor({ day: currentDay, color: "yellow" })}
                        />
                      )}
                      {!(editingColor?.day === currentDay && editingColor.color === "red") && (
                        <TemplatePreview
                          template={currentRed}
                          color="red"
                          isOverridden={!!redOverrides[currentDay]}
                          onEdit={() => setEditingColor({ day: currentDay, color: "red" })}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between gap-2">
                    <Button variant="outline" onClick={() => setStep(2)}>← Til baka</Button>
                    <div className="flex gap-2">
                      {currentDayIdx < selectedDays.length - 1 ? (
                        <Button variant="outline" onClick={() => setCurrentDayIdx((i) => i + 1)}>
                          Næsti dagur ({selectedDays[currentDayIdx + 1]}) →
                        </Button>
                      ) : null}
                      <Button onClick={() => setStep(4)}>
                        Yfirlit & vista →
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Step 4: Review & save ─────────────────────────────────────────── */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Skref 4 — Yfirlit & vista</CardTitle>
                <CardDescription>
                  {selectedDays.length} dagur × 3 útgáfur = {selectedDays.length * 3} færslur verða vistaðar í töflu{" "}
                  <span className="font-mono font-medium text-foreground">{tableName}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                {selectedDays.map((day) => {
                  const g = getOrInitGreen(day);
                  const y = generateYellow(g);
                  const r = generateRed(g);
                  return (
                    <div key={day}>
                      <div className="mb-2 text-sm font-semibold">{day}</div>
                      <div className="grid gap-2 md:grid-cols-3">
                        <TemplatePreview template={g} color="green"  />
                        <TemplatePreview template={y} color="yellow" />
                        <TemplatePreview template={r} color="red"    />
                      </div>
                    </div>
                  );
                })}

                <Separator />

                {saveErr && (
                  <p className="text-sm text-destructive">Villa: {saveErr}</p>
                )}

                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(3)}>← Breyta</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Vistar..." : `Vista kerfið (${tableName})`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
