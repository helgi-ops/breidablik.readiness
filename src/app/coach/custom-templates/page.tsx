"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { generateYellow, generateRed, generateGreenPlus, buildTableName } from "@/lib/micropulse/templateAutoGenerate";
import type { TemplateBlock, TemplateRecord } from "@/lib/micropulse/templateAutoGenerate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import ProgramAuditCard from "@/components/trainer/ProgramAuditCard";
import { auditLines, AUDIT_FAMILIES } from "@/lib/client/programAudit";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

// ─── Workout structures ───────────────────────────────────────────────────────

/** A role/slot in a structure's setup (e.g. "A1 · Heavy", "A2 · Explosive"),
 *  with the prescription for that slot and example exercises to choose from. */
type StructureSlot = { role: string; scheme: string; examples: string[] };

type WorkoutStructure = {
  id: string;
  label: string;
  description: string;
  clusterVariant?: boolean;
  blocks: TemplateBlock[];
  /** Per-role example exercises for the "pick by slot" palette. */
  slots?: StructureSlot[];
};

const CLUSTER_VARIATIONS: WorkoutStructure[] = [
  {
    id: "garcia-ramos",
    label: "Garcia-Ramos Cluster",
    description: "Velocity-based cluster with three blocks and increasing rest. Bridges velocity and power endurance.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Garcia-Ramos Cluster",
        items: [
          "Strength: 85–90% 1RM · Power: 30–50% 1RM",
          "Block 1: 15 × 1 with 6 sec between each rep",
          "Block 2: 15 × 1 with 12 sec between each rep",
          "Block 3: 15 × 1 with 12 sec between each rep",
          "1 min rest between blocks",
          "Strength: Back Squat / Bench Press / Deadlift",
          "Power: Bench Throw / Jump Squat / Power Clean",
        ],
        rest_between_sets: "1 min between blocks",
        rest_between_rounds: "3 blocks × 15 × 1",
      },
    ],
    slots: [
      { role: "Strength (85–90% 1RM)", scheme: "3 blocks × 15 × 1 · 6 sec between reps", examples: ["Back Squat", "Bench Press", "Deadlift", "Front Squat"] },
      { role: "Power (30–50% 1RM)", scheme: "3 blocks × 15 × 1 · 12 sec between reps", examples: ["Bench Throw", "Jump Squat", "Power Clean", "Trap Bar Jump"] },
    ],
  },
  {
    id: "moreno",
    label: "Moreno Cluster",
    description: "Two different cluster formats: long set with 30 sec rest, or short frequent bursts with 10 sec.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Moreno Cluster — Choose format",
        items: [
          "Form A (volume): 4 sets × 5 reps · 30 sec intra-set rest · 1 min between sets",
          "Form B (frequency): 10 sets × 2 reps · 10 sec intra-set rest · 1 min between sets",
          "Strength: 85–90%+ 1RM · Power: 45–65% 1RM",
          "Strength: Squat / Bench Press / Deadlift",
          "Power: Explosive compound movements",
        ],
        rest_between_sets: "1 min between sets",
        rest_between_rounds: "Form A 4 × 5 / Form B 10 × 2",
      },
    ],
    slots: [
      { role: "Strength (85–90%+ 1RM)", scheme: "4 × 5 (30 sec) or 10 × 2 (10 sec)", examples: ["Back Squat", "Bench Press", "Deadlift", "Front Squat"] },
      { role: "Power (45–65% 1RM)", scheme: "explosive compound", examples: ["Jump Squat", "Power Clean", "Push Press", "Bench Throw"] },
    ],
  },
  {
    id: "hansen",
    label: "Hansen Cluster",
    description: "Singles with 12 sec rest or doubles with 30 sec rest. Strong neurophysiological stimulus.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Hansen Cluster — Choose format",
        items: [
          "Form A (Singles): 4 sets × 6 × 1 rep · 12 sec between each",
          "Form B (Doubles): 4 sets × 3 × 2 reps · 30 sec between pairs",
          "Progression: Doubles → Triples → Quads with the same rest",
          "Strength: 85–90%+ 1RM · Power: 60–75% 1RM",
          "Strength: Back Squat / Bench Press / Deadlift",
          "Power: Jump Squat / Explosive Push",
        ],
        rest_between_sets: "1 min between sets",
        rest_between_rounds: "4 sets",
      },
    ],
    slots: [
      { role: "Strength (85–90%+ 1RM)", scheme: "4 × 6 × 1 (12 sec) or 4 × 3 × 2 (30 sec)", examples: ["Back Squat", "Bench Press", "Deadlift", "Front Squat"] },
      { role: "Power (60–75% 1RM)", scheme: "explosive", examples: ["Jump Squat", "Explosive Push", "Power Clean", "Trap Bar Jump"] },
    ],
  },
  {
    id: "iglesias-soler",
    label: "Iglesias-Soler Cluster",
    description: "Extreme neural: 32 singles with ~18 sec between each. Maximal neural activation over 10 minutes.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Iglesias-Soler Cluster",
        items: [
          "Base form: 32 × 1 rep · ~18 sec between each · ~10 min total",
          "Variation: 16 × 2 · 11 × 3 · 8 × 4 (all with 18 sec rest)",
          "Strength: 85–90%+ 1RM · Power: 70–85% 1RM",
          "Only 1 block per session",
          "Strength: Heavy compound (Squat / Bench / Deadlift)",
          "Power: Explosive Squat / Jump / Throw",
        ],
        rest_between_sets: "~18 sec between reps",
        rest_between_rounds: "1 block · 32 × 1",
      },
    ],
    slots: [
      { role: "Heavy compound (85–90%+ 1RM)", scheme: "32 × 1 · ~18 sec between reps · 1 block", examples: ["Back Squat", "Bench Press", "Deadlift", "Power Clean"] },
    ],
  },
  {
    id: "tufano-standard",
    label: "Tufano Cluster (Standard)",
    description: "Rest-redistribution: 36 singles with 12 sec rest. Maintains quality in every lift over ~8 min.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Tufano Standard Cluster",
        items: [
          "Base form: 36 × 1 · 12 sec between each · ~8:24 total",
          "Variation A: 18 × 2 · 12 sec rest · ~4:48",
          "Variation B: 12 × 3 · 12 sec rest · ~4:48",
          "Variation C: 18 × 2 · 18 sec rest · ~7:21",
          "Variation D: 12 × 3 · 24 sec rest · ~6:00",
          "Strength: 85–90%+ 1RM · Power: 75–85% 1RM",
          "1 block per session · Squat / Bench / Clean",
        ],
        rest_between_sets: "12 sec between reps",
        rest_between_rounds: "1 block · 36 × 1",
      },
    ],
    slots: [
      { role: "Lift (85–90%+ 1RM)", scheme: "36 × 1 · 12 sec between reps · 1 block", examples: ["Back Squat", "Bench Press", "Power Clean", "Deadlift"] },
    ],
  },
  {
    id: "tufano-cs2",
    label: "Tufano CS2 — Mechanical Stress",
    description: "3×12 with 15 sec intra-set rest @ 80% 1RM. 19% more mean force, 26% more time-under-tension.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Tufano CS2 — Mechanical Stress",
        items: [
          "3 sets × 12 reps · 80% 1RM · ~15:51 total",
          "15 sec intra-set rest between mini-clusters within each set",
          "Goal: Maximal mean force and time-under-tension",
          "Compared to regular: +19% mean force · +26% TUT",
          "Strength: Back Squat / Bench Press / Deadlift",
        ],
        rest_between_sets: "15 sec intra-set",
        rest_between_rounds: "3 sets × 12",
      },
    ],
    slots: [
      { role: "Lift (80% 1RM)", scheme: "3 sets × 12 · 15 sec intra-set", examples: ["Back Squat", "Bench Press", "Deadlift", "Front Squat"] },
    ],
  },
  {
    id: "tufano-cs4",
    label: "Tufano CS4 — Hypertrophy + Power",
    description: "3×12 with 2×30 sec pause @ 75% 1RM. Balance between hypertrophy and power output.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Tufano CS4 — Hypertrophy + Power",
        items: [
          "3 sets × 12 reps · 75% 1RM · ~10:10 total",
          "30 sec rest after the 4th rep and again after the 8th rep",
          "+10% total volume load · +16% TUT · maintains peak power",
          "Midpoint between CS2 (force) and regular sets",
          "Strength + Power: Squat / Bench / Deadlift",
        ],
        rest_between_sets: "30 sec after rep 4 & 8",
        rest_between_rounds: "3 sets × 12",
      },
    ],
    slots: [
      { role: "Lift (75% 1RM)", scheme: "3 sets × 12 · 30 sec after rep 4 & 8", examples: ["Back Squat", "Bench Press", "Deadlift", "Front Squat"] },
    ],
  },
  {
    id: "oliver",
    label: "Oliver Cluster — Metabolic Conditioning",
    description: "4 sets × (5+30sec+5). Maintains power output, reduces lactate and catabolic load.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Oliver Cluster — Metabolic",
        items: [
          "4 sets × (5 reps + 30 sec rest + 5 reps)",
          "90 sec rest between sets · ~10 min total",
          "Weight: Moderately heavy (aimed at quality movement)",
          "30 sec intra-set rest maintains mean force across all sets",
          "Lower lactate · greater total volume load · less catabolic load",
          "Leg Press / Squat / Compound lower body",
        ],
        rest_between_sets: "90 sec between sets",
        rest_between_rounds: "4 sets × (5 + 5)",
      },
    ],
    slots: [
      { role: "Lower-body compound (moderately heavy)", scheme: "4 sets × (5 + 30 sec + 5) · 90 sec between", examples: ["Leg Press", "Back Squat", "Front Squat", "Hack Squat"] },
    ],
  },
];

// ─── Potentiation cluster variations (XL Athlete / Cal Dietz) ────────────────

const POTENTIATION_CLUSTER_VARIATIONS: WorkoutStructure[] = [
  {
    id: "pc-acceleration",
    label: "Acceleration Focus",
    description: "Trap Bar Deadlift + Box Jump. Acceleration development — the first 3–4 steps. 65–80% 1RM.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Potentiation Cluster — Acceleration",
        items: [
          "A1. Trap Bar Deadlift — 1 rep @ 65–80%",
          "A2. Box Jump — 1 rep (max effort)",
          "15–20 sec rest → repeat",
          "4 reps per cluster (4 × A1+A2)",
          "2–3 min rest between clusters",
          "2–4 clusters total",
        ],
        rest_between_sets: "2–3 min between clusters",
        rest_between_rounds: "2–4 clusters × 4",
      },
    ],
    slots: [
      { role: "A1 · Strength (65–80% 1RM)", scheme: "1 rep · 15–20 sec to A2", examples: ["Trap Bar Deadlift", "Back Squat", "Front Squat", "Hex Bar Jump", "Barbell Bench Press"] },
      { role: "A2 · Reactive / plyometric (max effort)", scheme: "1 rep · 2–3 min between clusters", examples: ["Box Jump", "Broad Jump", "Depth Jump", "Vertical Jump", "Plyometric Push-Up"] },
    ],
  },
  {
    id: "pc-topend-speed",
    label: "Top-End Speed Focus",
    description: "Trap Bar Deadlift + Hurdle Hop. Joint stiffness and top-end speed. 65–80% 1RM.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Potentiation Cluster — Top-End Speed",
        items: [
          "A1. Trap Bar Deadlift — 1 rep @ 65–80%",
          "A2. Hurdle Hop — 1 rep (max effort, joint stiffness)",
          "15–20 sec rest → repeat",
          "4 reps per cluster (4 × A1+A2)",
          "2–3 min rest between clusters",
          "2–4 clusters total",
        ],
        rest_between_sets: "2–3 min between clusters",
        rest_between_rounds: "2–4 clusters × 4",
      },
    ],
    slots: [
      { role: "A1 · Strength (65–80% 1RM)", scheme: "1 rep · 15–20 sec to A2", examples: ["Trap Bar Deadlift", "Back Squat", "Front Squat", "Hex Bar Jump", "Barbell Bench Press"] },
      { role: "A2 · Stiffness / top-end (max effort)", scheme: "1 rep · 2–3 min between clusters", examples: ["Hurdle Hop", "Pogo Hops", "Bounds", "Ankle Hops", "Band-Assisted Plyo Push-Up"] },
    ],
  },
  {
    id: "pc-peaking-basic",
    label: "Peaking — Basic (joint)",
    description: "Squat Jump + Drop Box Jump. Light load (25–30%) for peaking 2–4 weeks before competition.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Potentiation Cluster — Peaking Basic",
        items: [
          "A1. Squat Jump — 1 rep @ 25–30%",
          "A2. Drop Box Jump — 1 rep (12–18 inch box, max effort)",
          "15–20 sec rest → repeat",
          "4 reps per cluster (4 × A1+A2)",
          "2–3 min rest between clusters",
          "1–3 clusters total (peaking = less volume)",
        ],
        rest_between_sets: "2–3 min between clusters",
        rest_between_rounds: "1–3 clusters × 4",
      },
    ],
    slots: [
      { role: "A1 · Light power (25–30% 1RM)", scheme: "1 rep · 15–20 sec to A2", examples: ["Squat Jump", "Jump Squat", "Trap Bar Jump", "Split Jump", "Speed Bench Press", "MB Chest Pass"] },
      { role: "A2 · Reactive plyometric (max effort)", scheme: "1 rep · 2–3 min between clusters", examples: ["Drop Box Jump", "Depth Jump", "Box Jump", "Hurdle Hop", "Plyometric Push-Up"] },
    ],
  },
  {
    id: "pc-peaking-advanced",
    label: "Peaking — Advanced (triple cluster)",
    description: "Squat Jump + Drop Box Jump + Band Jump. Three movement qualities in one block — acceleration, mid-range, top-end.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. Triple Potentiation Cluster — Peaking Advanced",
        items: [
          "A1. Squat Jump — 1 rep @ 25–30% (acceleration depth)",
          "A2. Drop Box Jump — 1 rep (mid-range angle, max effort)",
          "A3. Accelerated Band Jump — 1 rep (minimal joint angle, top-end speed)",
          "15–20 sec rest → repeat",
          "3 reps per cluster (3 × A1+A2+A3)",
          "2–3 min rest between clusters",
          "2–4 clusters total",
        ],
        rest_between_sets: "2–3 min between clusters",
        rest_between_rounds: "2–4 clusters × 3",
      },
    ],
    slots: [
      { role: "A1 · Accel depth (25–30% 1RM)", scheme: "1 rep · 15–20 sec to A2", examples: ["Squat Jump", "Jump Squat", "Trap Bar Jump", "Split Jump", "Speed Bench Press"] },
      { role: "A2 · Mid-range reactive (max effort)", scheme: "1 rep · 15–20 sec to A3", examples: ["Drop Box Jump", "Depth Jump", "Box Jump", "Hurdle Hop", "Plyometric Push-Up"] },
      { role: "A3 · Top-end / accelerated (max effort)", scheme: "1 rep · 2–3 min between clusters", examples: ["Accelerated Band Jump", "Band-Assisted CMJ", "Overspeed Pogo", "Assisted Broad Jump", "Band-Assisted Plyo Push-Up"] },
    ],
  },
  {
    id: "pc-french-contrast-style",
    label: "French Contrast Style (4 exercises)",
    description: "Trap Bar Deadlift + Drop Box Jump + Squat Jump + Hurdle Hop. Four movement qualities — strength, reactive, speed, stiffness.",
    clusterVariant: true,
    blocks: [
      {
        block: "A. French Contrast Potentiation Cluster",
        items: [
          "A1. Trap Bar Deadlift — 1 rep @ 55–80%",
          "A2. Drop Box Jump — 1 rep (reactive, max effort)",
          "A3. Squat Jump — 1 rep @ 25–30%",
          "A4. Hurdle Hop — 1 rep (joint stiffness, top-end speed)",
          "15–20 sec rest → repeat",
          "3 reps per cluster (3 × A1+A2+A3+A4)",
          "3–5 min rest between clusters",
          "2–4 clusters total",
        ],
        rest_between_sets: "3–5 min between clusters",
        rest_between_rounds: "2–4 clusters × 3",
      },
    ],
    slots: [
      { role: "A1 · Strength (55–80% 1RM)", scheme: "1 rep · 15–20 sec to A2", examples: ["Trap Bar Deadlift", "Back Squat", "Front Squat", "Hex Bar Jump", "Barbell Bench Press"] },
      { role: "A2 · Reactive (max effort)", scheme: "1 rep · 15–20 sec to A3", examples: ["Drop Box Jump", "Depth Jump", "Box Jump", "Hurdle Hop", "Plyometric Push-Up"] },
      { role: "A3 · Light power (25–30% 1RM)", scheme: "1 rep · 15–20 sec to A4", examples: ["Squat Jump", "Jump Squat", "Trap Bar Jump", "Split Jump", "Speed Bench Press", "MB Chest Pass"] },
      { role: "A4 · Stiffness / top-end (max effort)", scheme: "1 rep · 3–5 min between clusters", examples: ["Hurdle Hop", "Pogo Hops", "Bounds", "Ankle Hops", "Band-Assisted Plyo Push-Up"] },
    ],
  },
];

const WORKOUT_STRUCTURES: WorkoutStructure[] = [
  {
    id: "french-contrast",
    label: "French Contrast",
    description: "4 exercises in sequence: heavy strength → plyometric → light-loaded power → assisted/accelerated plyometric. Optimal PAP.",
    blocks: [
      {
        block: "A. French Contrast",
        items: [
          "A1. Heavy strength: Back Squat · 2–3 reps",
          "A2. Plyometric: Depth Jump · 3–5 reps",
          "A3. Light-loaded power: Jump Squat 30% · 3–5 reps",
          "A4. Assisted / accelerated plyometric: Band-Assisted Broad Jump · 3–5 reps",
          "Rest between exercises (A1 → A4): 15–30 sec (minimal transition)",
        ],
        rest_between_sets: "3–5 min between sets",
        rest_between_rounds: "3–5 sets",
      },
    ],
    slots: [
      { role: "A1 · Heavy strength", scheme: "2–3 reps · 80–90% 1RM · 3–5 sets · 15–30 sec to A2", examples: ["Back Squat", "Trap Bar Deadlift", "Front Squat", "Barbell Bench Press", "Incline Bench Press"] },
      { role: "A2 · Plyometric", scheme: "3–5 reps · 15–30 sec to A3", examples: ["Depth Jump", "Box Jump", "Hurdle Hop", "Plyometric Push-Up", "Clap Push-Up"] },
      { role: "A3 · Light-loaded power", scheme: "3–5 reps · 30–50% 1RM · 15–30 sec to A4", examples: ["Jump Squat", "Push Press", "Speed Bench Press", "MB Chest Pass", "Trap Bar Jump"] },
      { role: "A4 · Assisted / accelerated plyometric", scheme: "3–5 reps · 3–5 min rest between sets", examples: ["Band-Assisted Broad Jump", "Band-Assisted Plyo Push-Up", "Overspeed Pogo Hops", "Assisted Bounds", "Band-Assisted CMJ"] },
    ],
  },
  {
    id: "contrast",
    label: "Contrast",
    description: "Heavy strength set followed immediately by an explosive/plyometric. Uses PAP to boost power output.",
    blocks: [
      {
        block: "A. Contrast",
        items: [
          "A1. Heavy (strength): Back Squat · 1–5 reps",
          "A2. Explosive (plyometric): Box Jump · 3–6 reps · immediately after A1",
          "Rest between exercises (A1 → A2): 2–5 min",
        ],
        rest_between_sets: "2–5 min between pairs",
        rest_between_rounds: "3–6 sets",
      },
    ],
    slots: [
      { role: "A1 · Heavy (strength)", scheme: "1–5 reps · 3–6 sets · immediately to A2", examples: ["Back Squat", "Trap Bar Deadlift", "Bench Press", "Front Squat"] },
      { role: "A2 · Explosive / plyometric (right after A1)", scheme: "3–6 reps · 2–5 min rest between pairs", examples: ["Box Jump", "Broad Jump", "Depth Jump", "Jump Squat", "MB Chest Pass", "Plyometric Push-Up"] },
    ],
  },
  {
    id: "potentiation-clusters",
    label: "Potentiation clusters",
    description: "5 variations: Acceleration, Top-end speed, Peaking basic/advanced, French Contrast style.",
    blocks: [], // expanded into POTENTIATION_CLUSTER_VARIATIONS sub-picker
  },
  {
    id: "cluster-variations",
    label: "Cluster variations",
    description: "8 research-based variations: Garcia-Ramos, Moreno, Hansen, Iglesias-Soler, Tufano (3 variations), Oliver.",
    blocks: [], // expanded into CLUSTER_VARIATIONS sub-picker
  },
  {
    id: "regular",
    label: "Regular formation",
    description: "Standard training format — one exercise at a time, straight sets and reps.",
    blocks: [
      {
        block: "A. Main block",
        items: [
          "Main strength (squat / hinge): Choose exercise · 3–5 sets × 4–6 reps",
          "Push: Choose exercise · 3–4 sets × 6–8 reps",
          "Pull: Choose exercise · 3–4 sets × 6–8 reps",
          "Core / carry: Choose exercise · 2–3 sets × 8–12 reps",
        ],
        rest_between_sets: "2–3 min between sets",
        rest_between_rounds: "3–5 sets",
      },
    ],
    slots: [
      { role: "Squat", scheme: "3–5 sets × 4–6 reps · 2–3 min rest", examples: ["Back Squat", "Front Squat", "Goblet Squat", "Bulgarian Split Squat"] },
      { role: "Hinge", scheme: "3–5 sets × 4–6 reps · 2–3 min rest", examples: ["Romanian Deadlift", "Hip Thrust", "Trap Bar Deadlift", "Good Morning"] },
      { role: "Push", scheme: "3–4 sets × 6–8 reps · 2–3 min rest", examples: ["Bench Press", "Overhead Press", "Incline DB Press", "Push-Up"] },
      { role: "Pull", scheme: "3–4 sets × 6–8 reps · 2–3 min rest", examples: ["Barbell Row", "Pull-Up", "Lat Pulldown", "Chest-Supported Row"] },
      { role: "Core", scheme: "2–3 sets × 8–12 reps · 60–90 sec rest", examples: ["Pallof Press", "Dead Bug", "Plank", "Copenhagen Plank"] },
      { role: "Carry", scheme: "2–3 sets × 30 m · 60–90 sec rest", examples: ["Farmer Carry", "Suitcase Carry"] },
    ],
  },
  {
    id: "supersets-lower-upper",
    label: "Lower / Upper body Supersets",
    description: "Pair lower and upper body together. Saves time and keeps heart rate up.",
    blocks: [
      {
        block: "A. Lower/Upper Supersets",
        items: [
          "A1 (Lower): Romanian Deadlift · 3–4 sets × 6–8 reps",
          "A2 (Upper): Bench Press · 3–4 sets × 6–8 reps",
          "Rest between paired exercises (A1 → A2): 30–60 sec",
          "B1 (Lower): Bulgarian Split Squat · 3–4 sets × 8 reps/side",
          "B2 (Upper): Seated Row · 3–4 sets × 8 reps",
          "Rest between paired exercises (B1 → B2): 30–60 sec",
        ],
        rest_between_sets: "1.5–2 min between supersets",
        rest_between_rounds: "3–4 sets per pairing",
      },
    ],
    slots: [
      { role: "Lower (A1 / B1)", scheme: "6–8 reps · 3–4 sets · 30–60 sec to upper", examples: ["Back Squat", "Romanian Deadlift", "Bulgarian Split Squat", "Hip Thrust"] },
      { role: "Upper (A2 / B2)", scheme: "6–8 reps · 3–4 sets · 1.5–2 min between supersets", examples: ["Bench Press", "Barbell Row", "Overhead Press", "Pull-Up"] },
    ],
  },
];

// ─── Structure picker component ───────────────────────────────────────────────

function StructurePicker({ onApply, onAddExercise }: { onApply: (blocks: TemplateBlock[], structureId: string) => void; onAddExercise?: (line: string) => void }) {
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
          <div className="font-medium">Choose main block structure</div>
          <div className="text-xs text-indigo-500">French contrast, Garcia-Ramos, Tufano CS2/CS4, Oliver and more…</div>
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-indigo-900">⚡ Choose main block structure</div>
        <button type="button" onClick={() => { setOpen(false); setSelected(null); setClusterSub(null); }}
          className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
      </div>

      {/* Main structure cards */}
      <div className="grid gap-2 sm:grid-cols-2">
        {WORKOUT_STRUCTURES.map((s) => {
          const vcount =
            s.id === "cluster-variations" ? CLUSTER_VARIATIONS.length
            : s.id === "potentiation-clusters" ? POTENTIATION_CLUSTER_VARIATIONS.length
            : 0;
          return (
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
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{s.label}</span>
                {vcount > 0 && (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">⚡ {vcount} to choose</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground leading-snug">{s.description}</div>
            </button>
          );
        })}
      </div>

      {/* Sub-variants pop-up (cluster-variations & potentiation-clusters) */}
      {hasSubPicker && (
        <div className="mt-1 space-y-2 rounded-xl border border-indigo-300 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Choose a variation — {subVariants.length} options
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
                    : "border-indigo-100 bg-white hover:bg-indigo-50"
                }`}
              >
                <div className="text-xs font-medium text-foreground">{c.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Build the setup by role — each role (incl. explosive / plyometric slots)
          offers example exercises; clicking one drops it into the block with that
          role's scheme. Cluster families use their variation sub-picker instead. */}
      {activeStructure && onAddExercise && (() => {
        const s = activeStructure;
        const slots = s?.slots ?? [];
        if (slots.length === 0) return null;
        return (
          <div className="space-y-2.5 rounded-xl border border-indigo-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
              Build “{s?.label}” — pick one exercise per role
            </div>
            {slots.map((slot, si) => (
              <div key={si} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11.5px] font-semibold text-foreground">{slot.role}</span>
                  <span className="text-[10.5px] text-muted-foreground">{slot.scheme}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {slot.examples.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onAddExercise(`${name} · ${slot.scheme}`)}
                      className="rounded-full border border-indigo-200 bg-white px-2.5 py-0.5 text-[11px] text-indigo-700 transition-colors hover:bg-indigo-50"
                    >
                      ＋ {name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Preview of the setup that will be added (so nothing is applied blind) */}
      {activeStructure && activeStructure.blocks.length > 0 && (
        <div className="rounded-xl border border-indigo-100 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Preview — {activeStructure.label}</div>
          <div className="mt-1.5 space-y-1.5">
            {activeStructure.blocks.map((b, bi) => (
              <div key={bi} className="text-xs">
                <span className="font-medium text-foreground">{b.block}</span>
                {b.items.filter((it) => it.trim()).length > 0 && (
                  <span className="text-muted-foreground"> — {b.items.filter((it) => it.trim()).map((it) => it.split("·")[0].trim()).join(", ")}</span>
                )}
              </div>
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
            Use “{activeStructure.label}” in main block →
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
    sublabel: "Preparation — Building base endurance and strength",
    icon: "🌱",
    color: "border-amber-200 bg-amber-50",
    activeColor: "border-amber-500 bg-amber-100 ring-1 ring-amber-400",
  },
  {
    id: "inseason",
    label: "In-season",
    sublabel: "Competition phase — Maintenance and match quality",
    icon: "⚡",
    color: "border-emerald-200 bg-emerald-50",
    activeColor: "border-emerald-500 bg-emerald-100 ring-1 ring-emerald-400",
  },
  {
    id: "playoffs",
    label: "Playoffs",
    sublabel: "Peak quality — Minimal fatigue, maximal output",
    icon: "🔥",
    color: "border-red-200 bg-red-50",
    activeColor: "border-red-500 bg-red-100 ring-1 ring-red-400",
  },
  {
    id: "offseason",
    label: "Off-season",
    sublabel: "Off period — Recovery and base building",
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
  GENERIC: "GENERIC — General training day (MD-5, MD-6 and beyond)",
  "MD-4":  "MD-4 — Four days before the match",
  "MD-3":  "MD-3 — Three days before the match",
  "MD-2":  "MD-2 — Two days before the match",
  "MD-1":  "MD-1 — Day before the match",
  MD:      "MD — Match day",
  "MD+1":  "MD+1 — Day after the match",
  "MD+2":  "MD+2 — Two days after the match",
  "MD+3":  "MD+3 — Three days after the match",
};

// Weekday picker — used when no games are on the calendar (offseason, and
// any PT-mode work where the trainer plans around the week rather than
// around match-day). MD-N labels would be meaningless here, so we swap to
// regular weekdays with the same selection UX. Persisted to the dynamic
// records table under md_day exactly like MD codes — the column is just text.
const WEEKDAYS = [
  "MÁN",
  "ÞRI",
  "MIÐ",
  "FIM",
  "FÖS",
  "LAU",
  "SUN",
] as const;

const WEEKDAY_LABELS: Record<string, string> = {
  "MÁN": "Monday",
  "ÞRI": "Tuesday",
  "MIÐ": "Wednesday",
  "FIM": "Thursday",
  "FÖS": "Friday",
  "LAU": "Saturday",
  "SUN": "Sunday",
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

  // Player-override fields (NULL on team templates)
  player_id?: string | null;
  player_name?: string | null;
  parent_table_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  note?: string | null;
};

type TeamPlayer = { id: string; full_name: string };

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
      if (!current) current = { block: "A. Block", items: [] };
      current.items.push(line);
    }
  }
  if (current) blocks.push(current);

  // Fallback: no headers detected — one big block
  if (blocks.length === 0) return [{ block: "A. Block", items: lines }];
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
  "absolute-strength":  { range: "< 0.5 m/s",        quality: "Absolute Strength" },
  "strength":           { range: "0.5–0.75 m/s",      quality: "Strength" },
  "strength-speed":     { range: "0.75–1.0 m/s",      quality: "Strength-Speed" },
  "speed-strength":     { range: "1.0–1.3 m/s",       quality: "Speed-Strength" },
  "speed":              { range: "1.3–1.5 m/s",       quality: "Speed" },
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
    return `${line} — Stop if velocity drops below ${vel} m/s (velocity loss cutoff)`;
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
      pct <= 10 ? "Neural / power development"
      : pct <= 20 ? "Strength-speed / quality"
      : pct <= 30 ? "Hypertrophy / volume"
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
      currentBlock = { block: `${letter}. Block`, items: [] };
    }

    // Apply VBT enrichment + exercise formatting
    currentBlock.items.push(enrichVbtLine(formatExerciseLine(line)));
  }

  if (currentBlock) blocks.push(currentBlock);
  if (blocks.length === 0) return [{ block: "A. Block", items: lines }];
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
    s.onerror = () => reject(new Error("Failed to load SheetJS"));
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

/** Dynamically load Mammoth.js from CDN (runs only in browser, cached after first load) */
async function loadMammothJS(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).mammoth) return (window as any).mammoth;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
    s.onload = () => resolve((window as any).mammoth);
    s.onerror = () => reject(new Error("Failed to load Mammoth"));
    document.head.appendChild(s);
  });
}

/** Extract flat text from a Word .docx file using Mammoth */
async function extractDOCXText(file: File): Promise<string> {
  const mammoth = await loadMammothJS();
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return (result?.value || "").trim();
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
    s.onerror = () => reject(new Error("Failed to load PDF.js"));
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
    `${e.sets} sets × ${e.reps}`,
    e.intensity,
  ];
  // VBT variables (non-ISO)
  if (e.velocity)     parts.push(`Velocity ${e.velocity}`);
  if (e.velocityLoss) parts.push(`VL ${e.velocityLoss}`);
  // Intent/tempo (ISO only)
  if (e.tempo)        parts.push(`Tempo ${e.tempo}`);
  parts.push(`${e.rest} rest`);
  if (e.note) parts.push(e.note);
  return parts.join(" · ");
}

const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  {
    id: "lower-strength",
    label: "Lower — Strength",
    icon: "🏋️",
    exercises: [
      { id: "back-squat",       name: "Back Squat",             sets: "3–4", reps: "3–5 reps",  intensity: "82–88% 1RM", velocity: "~0.50–0.60 m/s", velocityLoss: "20% VL", rest: "3–4 min" },
      { id: "trap-bar-dl",      name: "Trap Bar Deadlift",      sets: "3–4", reps: "3–5 reps",  intensity: "80–85% 1RM", velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "3–4 min" },
      { id: "rdl",              name: "Romanian Deadlift",       sets: "3",   reps: "6–8 reps",  intensity: "70–75% 1RM", velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "2–3 min" },
      { id: "front-squat",      name: "Front Squat",             sets: "3–4", reps: "3–4 reps",  intensity: "78–83% 1RM", velocity: "~0.50–0.60 m/s", velocityLoss: "20% VL", rest: "3–4 min" },
    ],
  },
  {
    id: "lower-power",
    label: "Lower — Power",
    icon: "⚡",
    exercises: [
      { id: "mid-thigh-pull",   name: "Mid-Thigh Pull",          sets: "4–5", reps: "2–3 reps",  intensity: "80–90% ISO", velocity: "~1.0–1.5 m/s", velocityLoss: "10% VL", rest: "3–4 min" },
      { id: "hang-clean",       name: "Hang Clean",              sets: "4–5", reps: "2–3 reps",  intensity: "72–78% 1RM", velocity: "~1.0–1.3 m/s", velocityLoss: "10% VL", rest: "3–4 min" },
      { id: "jump-squat",       name: "Jump Squat",              sets: "4",   reps: "3–5 reps",  intensity: "30–40% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "2–3 min" },
      { id: "trap-bar-jump",    name: "Trap Bar Jump",           sets: "4",   reps: "3–4 reps",  intensity: "25–35% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "2–3 min" },
    ],
  },
  {
    id: "plyometric",
    label: "Plyometric",
    icon: "🦘",
    exercises: [
      { id: "box-jump",         name: "Box Jump",                sets: "4",   reps: "3–5 reps",  intensity: "Bodyweight", tempo: "Full recovery",     rest: "2–3 min" },
      { id: "depth-jump",       name: "Depth Jump",              sets: "3–4", reps: "4–6 reps",  intensity: "Bodyweight", tempo: "Min contact time",  rest: "3–4 min" },
      { id: "broad-jump",       name: "Broad Jump",              sets: "3–4", reps: "3–5 reps",  intensity: "Bodyweight", tempo: "Full power",        rest: "2–3 min" },
      { id: "reactive-hop",     name: "Reactive Hop",            sets: "3",   reps: "8–10 reps", intensity: "Bodyweight", tempo: "Stiff knee",        rest: "2 min" },
    ],
  },
  {
    id: "unilateral",
    label: "Unilateral",
    icon: "🦵",
    exercises: [
      { id: "rfess",            name: "RFESS",                   sets: "3",   reps: "6–8/side",            intensity: "65–70% 1RM", velocity: "~0.50–0.70 m/s", velocityLoss: "20% VL", rest: "2–3 min", note: "Rear foot elevated" },
      { id: "bulgarian-ss",     name: "Bulgarian Split Squat",   sets: "3",   reps: "6–8/side",            intensity: "60–65% 1RM", velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "2–3 min" },
      { id: "single-leg-rdl",   name: "Single Leg RDL",          sets: "3",   reps: "8/side",              intensity: "60% 1RM",    velocity: "~0.45–0.60 m/s", velocityLoss: "20% VL", rest: "2 min" },
      { id: "step-up",          name: "Step-Up",                 sets: "3",   reps: "6–8/side",            intensity: "60% 1RM",    velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "2 min" },
    ],
  },
  {
    id: "upper",
    label: "Upper body",
    icon: "💪",
    exercises: [
      { id: "bench-press",      name: "Bench Press",             sets: "3–4", reps: "4–6 reps",  intensity: "78–83% 1RM", velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "2–3 min" },
      { id: "push-press",       name: "Push Press",              sets: "3–4", reps: "3–5 reps",  intensity: "72–78% 1RM", velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "2–3 min" },
      { id: "weighted-pullup",  name: "Weighted Pull-up",        sets: "3",   reps: "4–6 reps",  intensity: "RPE 8",      velocity: "~0.45–0.65 m/s", velocityLoss: "20% VL", rest: "2–3 min" },
      { id: "db-row",           name: "DB Row",                  sets: "3",   reps: "8/side",              intensity: "RPE 7–8",    velocity: "~0.45–0.60 m/s", velocityLoss: "20% VL", rest: "90 sec" },
    ],
  },
  {
    id: "iso-performance",
    label: "ISO — Performance",
    icon: "🧱",
    exercises: [
      // ISO Mid-Thigh Pull — 3 variants
      {
        id: "iso-mtp-rfd",
        name: "ISO Mid-Thigh Pull — RFD",
        sets: "5", reps: "3–5 sec", intensity: "90–100% MVC", tempo: "Explosive (ballistic)", rest: "3 min",
        note: "120–140° knee angle · As fast as possible · +1.2–13.4%/week RFD",
      },
      {
        id: "iso-mtp-strength",
        name: "ISO Mid-Thigh Pull — Strength",
        sets: "3–5", reps: "20–30 sec", intensity: "80–100% MVC", tempo: "Sustained — maximal", rest: "2 min",
        note: "Sport-specific angle · +4.3%/week strength",
      },
      // ISO Squat Hold — 3 variants by angle
      {
        id: "iso-squat-rfd",
        name: "ISO Squat Hold — RFD",
        sets: "5", reps: "3–5 sec", intensity: "90–100% MVC", tempo: "Explosive (ballistic)", rest: "3 min",
        note: "Explosive intent — push as fast as possible",
      },
      {
        id: "iso-squat-short",
        name: "ISO Squat Hold — Short angle (≤70°)",
        sets: "3–4", reps: "20–30 sec", intensity: "70–100% MVC", tempo: "Sustained — maximal", rest: "2 min",
        note: "≤70° knee flexion · Angle-specific strength",
      },
      {
        id: "iso-squat-long",
        name: "ISO Squat Hold — Long angle (>70°)",
        sets: "3–5", reps: "30–45 sec", intensity: "70–90% MVC", tempo: "Sustained", rest: "60 sec",
        note: ">70° knee flexion · +0.86–1.69%/week hypertrophy · Dynamic transfer",
      },
      // ISO Split Squat — 2 variants
      {
        id: "iso-split-strength",
        name: "ISO Split Squat Hold — Strength",
        sets: "3–4", reps: "20–30 sec", intensity: "80–100% MVC", tempo: "Sustained — maximal", rest: "2 min",
        note: "Sport-specific angle · Per side",
      },
      // ISO Nordic Hold — 2 variants
      {
        id: "iso-nordic-rfd",
        name: "ISO Nordic Hold — Strength",
        sets: "3", reps: "10–15 sec", intensity: "90–100% MVC", tempo: "Maximal sustained", rest: "2 min",
        note: "Maximal hamstring contraction",
      },
      {
        id: "iso-leg-press-str",
        name: "ISO Leg Press — Strength",
        sets: "3–5", reps: "20–30 sec", intensity: "80–100% MVC", tempo: "Sustained — maximal", rest: "2 min",
        note: "Long angle for hypertrophy · Short angle for angle-specific strength",
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
        sets: "3–5", reps: "30–45 sec", intensity: "80–90% MVC", tempo: "Sustained", rest: "90 sec",
        note: ">70% MVC REQUIRED for tendon stiffness · +50.9% stiffness/12 weeks",
      },
      // ISO Split Squat — Tendon
      {
        id: "iso-split-tendon",
        name: "ISO Split Squat Hold — Tendon",
        sets: "3–5", reps: "30–45 sec", intensity: "80–90% MVC", tempo: "Sustained", rest: "90 sec",
        note: "Collagen synthesis · Sport-specific angle · Per side",
      },
      // Wall Sit — 3 variants
      {
        id: "iso-wallsit-pain",
        name: "Wall Sit — Pain relief",
        sets: "4–5", reps: "30–45 sec", intensity: "50–60% MVC", tempo: "Submaximal — sustained", rest: "30 sec",
        note: "Early rehab · 4–5× per day · Leg pain relief",
      },
      {
        id: "iso-wallsit-tendon",
        name: "Wall Sit — Tendon",
        sets: "3", reps: "30 sec", intensity: "80–90% MVC", tempo: "Sustained — maximal", rest: "90 sec",
        note: ">70% MVC required · Tendon stiffness and collagen",
      },
      {
        id: "iso-wallsit-unilateral",
        name: "Wall Sit — Unilateral",
        sets: "3", reps: "30 sec/side", intensity: "80–90% MVC", tempo: "Sustained — maximal", rest: "2 min",
        note: "Basketball protocol · 90° knee flexion · Like basketball players",
      },
      // ISO Nordic Hold — Tendon
      {
        id: "iso-nordic-tendon",
        name: "ISO Nordic Hold — Tendon",
        sets: "3", reps: "20–30 sec", intensity: "70–85% MVC", tempo: "Sustained", rest: "90 sec",
        note: "Hamstring tendon loading · Collagen synthesis",
      },
      // Collagen synthesis protocol (general)
      {
        id: "iso-collagen",
        name: "ISO Hamstring Bridge Hold — Collagen",
        sets: "3–5", reps: "30–60 sec", intensity: "50–90% MVC", tempo: "Sustained", rest: "60 sec",
        note: "Longer holds increase collagen synthesis · 2–3× per week",
      },
      // Multi-angle protocol
      {
        id: "iso-multiangle",
        name: "ISO Knee Extension — Multi-angle",
        sets: "3–4 per angle", reps: "15–30 sec", intensity: "70–100% MVC", tempo: "Sustained — maximal", rest: "60 sec between angles",
        note: "30° · 60° · 90° knee flexion · Full tendon strength across all ranges",
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
        { id: "fc-squat",   name: "Back Squat",      sets: "3–4", reps: "3–4 reps", intensity: "85–90% 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sec → A2 · 3–4 min between sets" },
        { id: "fc-fsquat",  name: "Front Squat",     sets: "3–4", reps: "3–4 reps", intensity: "82–87% 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sec → A2" },
        { id: "fc-tbdl",    name: "Trap Bar DL",     sets: "3–4", reps: "3–4 reps", intensity: "83–88% 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sec → A2" },
        { id: "fc-bench1",  name: "Bench Press",     sets: "3–4", reps: "3–4 reps", intensity: "85–90% 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "Upper body · 10–15 sec → A2" },
      ],
    },
    {
      id: "fc-a2", label: "A2 — Plyometric", icon: "🦘",
      exercises: [
        { id: "fc-dj",      name: "Depth Jump",      sets: "3–4", reps: "3 reps",   intensity: "Bodyweight", tempo: "Min contact time", rest: "—", note: "Immediately after A1 · 10–15 sec → A3" },
        { id: "fc-boxj",    name: "Box Jump",        sets: "3–4", reps: "3 reps",   intensity: "Bodyweight", tempo: "Full power up",    rest: "—", note: "Immediately after A1 · 10–15 sec → A3" },
        { id: "fc-hurdle",  name: "Hurdle Hop",      sets: "3–4", reps: "3 reps",   intensity: "Bodyweight", tempo: "Stiff knee",       rest: "—", note: "10–15 sec → A3" },
        { id: "fc-mbslam",  name: "Med Ball Slam",   sets: "3–4", reps: "3 reps",   intensity: "5–8 kg",     tempo: "Max speed",        rest: "—", note: "Upper · immediately after A1 · 10–15 sec → A3" },
      ],
    },
    {
      id: "fc-a3", label: "A3 — Weighted Explosive", icon: "⚡",
      exercises: [
        { id: "fc-jsq",     name: "Jump Squat",      sets: "3–4", reps: "3 reps",   intensity: "30% 1RM",    velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sec → A4" },
        { id: "fc-tbj",     name: "Trap Bar Jump",   sets: "3–4", reps: "3 reps",   intensity: "25–30% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sec → A4" },
        { id: "fc-dbjsq",   name: "DB Jump Squat",   sets: "3–4", reps: "3 reps",   intensity: "20–25% 1RM", velocity: "~1.3–1.9 m/s", velocityLoss: "10% VL", rest: "—", note: "10–15 sec → A4" },
        { id: "fc-pp3",     name: "Push Press",      sets: "3–4", reps: "3 reps",   intensity: "40–50% 1RM", velocity: "~0.90–1.10 m/s", velocityLoss: "10% VL", rest: "—", note: "Upper · 10–15 sec → A4" },
      ],
    },
    {
      id: "fc-a4", label: "A4 — Reactive", icon: "🔄",
      exercises: [
        { id: "fc-bj",      name: "Broad Jump",      sets: "3–4", reps: "3 reps",   intensity: "Bodyweight", tempo: "Full power", rest: "3–4 min", note: "Final stage · 3–4 min → next set" },
        { id: "fc-rhop",    name: "Reactive Hop",    sets: "3–4", reps: "5 reps",   intensity: "Bodyweight", tempo: "Stiff knee", rest: "3–4 min", note: "3–4 min → next set" },
        { id: "fc-latb",    name: "Lateral Bound",   sets: "3–4", reps: "3/side",   intensity: "Bodyweight", tempo: "Max speed",  rest: "3–4 min", note: "3–4 min → next set" },
        { id: "fc-mbsc",    name: "MB Scoop Throw",  sets: "3–4", reps: "3 reps",   intensity: "4–6 kg",     tempo: "Explosive",  rest: "3–4 min", note: "Upper · 3–4 min → next set" },
      ],
    },
  ],

  "contrast": [
    {
      id: "ct-a1", label: "A1 — Heavy", icon: "🏋️",
      exercises: [
        { id: "ct-sq",      name: "Back Squat",      sets: "4", reps: "3–4 reps", intensity: "85% 1RM",    velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "Immediately → A2 · 2–3 min between pairs" },
        { id: "ct-tbdl",    name: "Trap Bar DL",     sets: "4", reps: "3–4 reps", intensity: "83–85% 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "—", note: "Immediately → A2" },
        { id: "ct-bench",   name: "Bench Press",     sets: "4", reps: "3–4 reps", intensity: "85% 1RM",    velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "—", note: "Upper · immediately → A2" },
        { id: "ct-pp",      name: "Push Press",      sets: "4", reps: "3–4 reps", intensity: "80% 1RM",    velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "—", note: "Immediately → A2" },
      ],
    },
    {
      id: "ct-a2", label: "A2 — Explosive", icon: "⚡",
      exercises: [
        { id: "ct-boxj",    name: "Box Jump",        sets: "4", reps: "5 reps",   intensity: "Bodyweight", tempo: "Max speed",        rest: "2–3 min", note: "2–3 min → next pair" },
        { id: "ct-dj",      name: "Depth Jump",      sets: "4", reps: "5 reps",   intensity: "Bodyweight", tempo: "Min contact time", rest: "2–3 min", note: "2–3 min → next pair" },
        { id: "ct-bj",      name: "Broad Jump",      sets: "4", reps: "5 reps",   intensity: "Bodyweight", tempo: "Full power",       rest: "2–3 min", note: "2–3 min → next pair" },
        { id: "ct-mbslam",  name: "Med Ball Slam",   sets: "4", reps: "5 reps",   intensity: "5–8 kg",     tempo: "Max speed",        rest: "2–3 min", note: "Upper · 2–3 min → next pair" },
      ],
    },
  ],

  "potentiation-clusters": [
    {
      id: "pot-cl", label: "Cluster exercise", icon: "⚡",
      exercises: [
        { id: "pot-mtp",    name: "Mid-Thigh Pull",  sets: "4", reps: "(1+1+1) cluster",   intensity: "80–85% ISO", velocity: "~1.0–1.5 m/s", velocityLoss: "10% VL", rest: "2–3 min", note: "15–20 sec intra-set rest" },
        { id: "pot-hclean", name: "Hang Clean",      sets: "4", reps: "(1+1+1) cluster",   intensity: "80–85% 1RM", velocity: "~1.0–1.3 m/s", velocityLoss: "10% VL", rest: "2–3 min", note: "15–20 sec intra-set rest" },
        { id: "pot-pp",     name: "Push Press",      sets: "4", reps: "(1+1+1) cluster",   intensity: "78–83% 1RM", velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "2–3 min", note: "15–20 sec intra-set rest" },
        { id: "pot-jsq",    name: "Jump Squat",      sets: "4", reps: "(1+1+1) cluster",   intensity: "40–50% 1RM", velocity: "~1.1–1.6 m/s", velocityLoss: "10% VL", rest: "2–3 min", note: "15–20 sec intra-set rest" },
      ],
    },
  ],

  // All cluster sub-variants (garcia-ramos, moreno, hansen, etc.) share these categories
  "cluster-variations": [
    {
      id: "cl-str", label: "Strength", icon: "🏋️",
      exercises: [
        { id: "cl-sq",   name: "Back Squat",      sets: "", reps: "", intensity: "85–90%+ 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Back Squat · 85–90%+ 1RM · ~0.45–0.60 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
        { id: "cl-bp",   name: "Bench Press",     sets: "", reps: "", intensity: "85–90%+ 1RM", velocity: "~0.45–0.55 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Bench Press · 85–90%+ 1RM · ~0.45–0.55 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
        { id: "cl-dl",   name: "Deadlift",        sets: "", reps: "", intensity: "85–90%+ 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Deadlift · 85–90%+ 1RM · ~0.45–0.60 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
        { id: "cl-tbdl", name: "Trap Bar DL",     sets: "", reps: "", intensity: "83–88%+ 1RM", velocity: "~0.45–0.60 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Trap Bar Deadlift · 83–88%+ 1RM · ~0.45–0.60 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
      ],
    },
    {
      id: "cl-pow", label: "Power / Speed", icon: "⚡",
      exercises: [
        { id: "cl-jsq",   name: "Jump Squat",     sets: "", reps: "", intensity: "30–50% 1RM", velocity: "~1.2–1.8 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Jump Squat · 30–50% 1RM · ~1.2–1.8 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
        { id: "cl-bt",    name: "Bench Throw",    sets: "", reps: "", intensity: "30–50% 1RM", velocity: "~1.1–1.6 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Bench Throw · 30–50% 1RM · ~1.1–1.6 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
        { id: "cl-mtp",   name: "Mid-Thigh Pull", sets: "", reps: "", intensity: "80–90% ISO", velocity: "~1.0–1.5 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Mid-Thigh Pull · 80–90% ISO · ~1.0–1.5 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
        { id: "cl-expu",  name: "Explosive Push-up", sets: "", reps: "", intensity: "Bodyweight", velocity: "~0.90–1.20 m/s", velocityLoss: "10% VL", rest: "", lineOverride: "Explosive Push-up · Bodyweight · ~0.90–1.20 m/s · 10% VL · Use cluster structure (sets/reps/rest)" },
      ],
    },
  ],

  "supersets-lower-upper": [
    {
      id: "ss-lo", label: "Lower body (A1/B1)", icon: "🦵",
      exercises: [
        { id: "ss-rdl",  name: "Romanian Deadlift",     sets: "3–4", reps: "6–8 reps", intensity: "75% 1RM",    velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "30 sec → A2/B2", note: "Paired with upper" },
        { id: "ss-bss",  name: "Bulgarian Split Squat", sets: "3–4", reps: "8/side",   intensity: "65% 1RM",    velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "30 sec → A2/B2", note: "Paired with upper" },
        { id: "ss-lp",   name: "Leg Press",             sets: "3–4", reps: "8–10 reps", intensity: "70% 1RM",   velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "30 sec → A2/B2", note: "Paired with upper" },
        { id: "ss-su",   name: "Step-Up",               sets: "3–4", reps: "8/side",   intensity: "60% 1RM",    velocity: "~0.50–0.65 m/s", velocityLoss: "20% VL", rest: "30 sec → A2/B2", note: "Paired with upper" },
      ],
    },
    {
      id: "ss-up", label: "Upper body (A2/B2)", icon: "💪",
      exercises: [
        { id: "ss-bench", name: "Bench Press",          sets: "3–4", reps: "6–8 reps", intensity: "75% 1RM",    velocity: "~0.55–0.70 m/s", velocityLoss: "20% VL", rest: "30 sec → A1/B1", note: "Paired with lower" },
        { id: "ss-row",   name: "Seated Row",           sets: "3–4", reps: "8 reps",   intensity: "RPE 7–8",    velocity: "~0.45–0.65 m/s", velocityLoss: "20% VL", rest: "30 sec → A1/B1", note: "Paired with lower" },
        { id: "ss-pup",   name: "Weighted Pull-up",     sets: "3–4", reps: "4–6 reps", intensity: "RPE 8",      velocity: "~0.45–0.65 m/s", velocityLoss: "20% VL", rest: "30 sec → A1/B1", note: "Paired with lower" },
        { id: "ss-pp",    name: "Push Press",           sets: "3–4", reps: "4–6 reps", intensity: "72% 1RM",    velocity: "~0.80–1.00 m/s", velocityLoss: "10% VL", rest: "30 sec → A1/B1", note: "Paired with lower" },
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

// ─── Movement-pattern library browse (DB-backed exercise_library) ───────────────
// Lets the coach reach the full movement-pattern exercise library from the same
// picker as the curated quick-picks. Inserts the exercise name (the coach adds
// the prescription), so it complements — never replaces — the curated cards.

const LIBRARY_FAMILIES: { id: string; label: string }[] = [
  { id: "squat", label: "Squat" },
  { id: "hinge", label: "Hinge" },
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "core", label: "Core" },
  { id: "carry", label: "Carry" },
];

const LIBRARY_PATTERN_LABELS: Record<string, string> = {
  hip_hinge: "Hip hinge", hip_dominant: "Hip dominant", knee_dominant: "Knee dominant",
  vertical_push: "Vertical push", horizontal_push: "Horizontal push",
  vertical_pull: "Vertical pull", horizontal_pull: "Horizontal pull",
  rotational_diagonal: "Rotational", anti_rotation: "Anti-rotation",
  anti_flexion: "Anti-flexion", anti_extension: "Anti-extension", anti_lateral_flexion: "Anti-lateral flexion",
  carry: "Carry",
};

type LibraryItem = {
  id: string;
  name: string;
  name_is?: string | null;
  category: string;
  movement_pattern?: string | null;
  movement_family?: string | null;
  is_bilateral?: boolean | null;
};

function LibraryBrowse({ onSelect, initialFamily }: { onSelect: (line: string) => void; initialFamily?: string | null }) {
  const [family, setFamily] = useState<string | null>(initialFamily !== undefined ? initialFamily : "squat");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (fam: string | null, q: string) => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) return;
      const params: string[] = [];
      if (q.trim()) params.push(`search=${encodeURIComponent(q)}`);
      if (fam) params.push(`family=${fam}`);
      const res = await fetch(`/api/trainer/exercises?${params.join("&")}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setItems((json.exercises ?? []) as LibraryItem[]);
      }
    } catch {
      /* soft */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial browse of the default family. Subsequent fetches are triggered
  // directly by the chip / search handlers (avoids effect-driven refetch loops).
  useEffect(() => { void load(initialFamily !== undefined ? initialFamily : "squat", ""); }, [load, initialFamily]);

  return (
    <div className="space-y-2">
      {/* Family chips */}
      <div className="flex flex-wrap gap-1">
        {LIBRARY_FAMILIES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFamily(f.id); void load(f.id, query); }}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
              family === f.id
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setFamily(null); void load(null, query); }}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
            family === null
              ? "bg-slate-600 text-white border-slate-600"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        >
          All
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); void load(family, e.target.value); }}
        placeholder="Search library…"
        className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {/* Results */}
      {loading ? (
        <div className="py-2 text-center text-[11px] text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-2 text-center text-[11px] text-muted-foreground">No exercises</div>
      ) : (
        <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {items.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => onSelect(ex.name)}
              className="rounded-lg border border-white bg-white p-2.5 text-left hover:border-indigo-300 hover:shadow-sm transition-all"
            >
              <div className="text-xs font-semibold text-foreground">{ex.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                {ex.movement_family && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-600">
                    {LIBRARY_FAMILIES.find((f) => f.id === ex.movement_family)?.label ?? ex.movement_family}
                  </span>
                )}
                {ex.movement_pattern && (
                  <span className="text-slate-400">
                    {LIBRARY_PATTERN_LABELS[ex.movement_pattern] ?? ex.movement_pattern}
                  </span>
                )}
                <span>· {ex.category}</span>
                {ex.is_bilateral === false && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600">Uni</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExercisePicker({ onSelect, onClose, structureId }: { onSelect: (line: string) => void; onClose: () => void; structureId?: string | null }) {
  const categories = resolvePickerCategories(structureId);
  const [activeCat, setActiveCat] = useState(categories[0].id);
  const cat = categories.find((c) => c.id === activeCat) ?? categories[0];

  return (
    <div className="mt-1 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-800">
          📚 Choose exercise
          {structureId && (
            <span className="ml-1.5 font-normal text-indigo-500">
              — {CLUSTER_VARIANT_IDS.has(structureId ?? "") ? "Cluster" : (STRUCTURE_EXERCISE_MAP[structureId ?? ""] ? "custom" : "generic")}
            </span>
          )}
        </span>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
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
            ＋ Other exercises
          </button>
        )}
        {/* Full movement-pattern library (DB-backed) */}
        <button
          type="button"
          onClick={() => setActiveCat("__library__")}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
            activeCat === "__library__"
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          📚 Full library
        </button>
      </div>

      {/* Exercise cards */}
      {activeCat === "__library__" ? (
        <LibraryBrowse onSelect={onSelect} />
      ) : (
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
                ex.sets ? `📦 ${ex.sets} sets × ${ex.reps}` : null,
                `💪 ${ex.intensity}`,
                ex.velocity     ? `⚡ Velocity: ${ex.velocity}` : null,
                ex.velocityLoss ? `📉 VL: ${ex.velocityLoss}`   : null,
                ex.tempo        ? `⏱ Tempo: ${ex.tempo}`        : null,
                ex.rest         ? `😴 Rest: ${ex.rest}`         : null,
                ex.note         ? `📝 ${ex.note}`               : null,
              ].filter((l): l is string => !!l).map((line, i) => (
                <div key={i} className="text-[10px] text-muted-foreground leading-snug">{line}</div>
              ))}
            </div>
          </button>
        ))}
      </div>
      )}
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
      } else if (ext === "docx") {
        text = await extractDOCXText(file);
      } else if (ext === "doc") {
        throw new Error("The older Word format (.doc) is not supported. Please save the document as .docx and try again.");
      } else if (ext === "csv" || ext === "txt") {
        text = await file.text();
      } else {
        throw new Error("Unsupported file type. Use Word (.docx), Excel (.xlsx), CSV (.csv), PDF (.pdf) or text (.txt).");
      }
      if (!text.trim()) throw new Error("The file appeared to be empty.");
      const blocks = parseTrainingText(text);
      setParsedBlocks(blocks);
      setStatus("preview");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Unknown error while reading the file.");
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
        accept=".xlsx,.xls,.csv,.txt,.pdf,.docx"
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
          <p className="text-sm font-medium text-slate-700">Upload a training programme</p>
          <p className="text-[11px] text-muted-foreground text-center">
            Word (.docx), Excel (.xlsx), CSV (.csv), PDF (.pdf) or text (.txt)<br />
            Click or drag a file here
          </p>
        </div>
      )}

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-4">
          <span className="animate-spin text-lg">⏳</span>
          <span className="text-sm text-muted-foreground">Reading the file...</span>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2 py-2">
          <p className="text-sm text-red-600 text-center">⚠️ {errorMsg}</p>
          <div className="flex justify-center">
            <Button size="sm" variant="outline" onClick={() => { setStatus("idle"); fileRef.current?.click(); }}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {status === "preview" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              📋 Found {parsedBlocks.length} blocks
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              ✕ Cancel
            </button>
          </div>
          {/* Preview list */}
          <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border bg-white p-2">
            {parsedBlocks.map((b, i) => (
              <div key={i} className="rounded-md bg-slate-50 px-2 py-1.5">
                <p className="text-[11px] font-semibold text-foreground">{b.block}</p>
                <p className="text-[10px] text-muted-foreground">
                  {b.items.length} {b.items.length === 1 ? "line" : "lines"}
                  {b.items[0] ? ` — ${b.items[0].slice(0, 50)}${b.items[0].length > 50 ? "…" : ""}` : ""}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={applyAndReset}>
              ✓ Use these blocks
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setStatus("idle"); fileRef.current?.click(); }}>
              Choose a different file
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

const BE_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** Split a free-text item ("Name · 5 reps · VT 1.0 m/s · Rest 60 s") into an
 *  exercise name + chip segments. Items with no "·" show as a plain name. */
function parseItemChips(item: string): { name: string; chips: string[] } {
  const parts = item.split("·").map((s) => s.trim()).filter(Boolean);
  return { name: parts[0] ?? "", chips: parts.slice(1) };
}
function chipClass(chip: string): string {
  const l = chip.toLowerCase();
  if (/vt\b|m\/s|cut-?off|drop-?off|velocity|tempo|\bfast\b|\bslow\b|explosive/.test(l))
    return "border-[rgba(39,64,230,0.2)] bg-[rgba(39,64,230,0.06)] text-[#2740e6]";
  if (/\brest\b|hvíld/.test(l)) return "border-[#e7e4db] bg-[#faf9f5] text-[#787c74]";
  return "border-[#e7e4db] bg-[#faf9f5] text-[#3d4149]";
}

/**
 * Pull the block-level "rest between sets" and "rounds/sets" out of a "·"-joined
 * exercise line so they land in the block footer fields instead of cluttering
 * the chips — e.g. "Bench · 3–4 sets × 4–6 reps · 78–83% 1RM · … · 2–3 min rest"
 * → line "Bench · 4–6 reps · 78–83% 1RM · …", rest "2–3 min", rounds "3–4 sets".
 * Only fills a field the block doesn't already have (never clobbers). The first
 * segment (exercise name) is always left on the line.
 */
function splitExerciseFooter(
  line: string,
  hasRest: boolean,
  hasRounds: boolean,
): { line: string; rest?: string; rounds?: string } {
  const segs = line.split("·").map((s) => s.trim());
  let rest: string | undefined;
  let rounds: string | undefined;
  const out: string[] = [];
  segs.forEach((seg, i) => {
    if (i === 0 || !seg) { out.push(seg); return; } // keep the exercise name
    if (!hasRest && rest === undefined && /\brest\b|hvíld/i.test(seg)) {
      rest = seg.replace(/\s*\b(rest|hvíld)\b\s*$/i, "").trim() || seg;
      return; // strip from the line
    }
    const m = seg.match(/^(\d[\d–\-\s]*(?:sets?|rounds?))\s*[×xX]\s*(.+)$/i);
    if (!hasRounds && rounds === undefined && m) {
      rounds = m[1].trim();
      out.push(m[2].trim()); // keep just the reps part on the line
      return;
    }
    if (!hasRounds && rounds === undefined && /^\d[\d–\-\s]*(?:sets?|rounds?)$/i.test(seg)) {
      rounds = seg;
      return;
    }
    out.push(seg);
  });
  return { line: out.filter(Boolean).join(" · "), rest, rounds };
}

// Flat, de-duplicated exercise list for the inline typeahead (name-prefix match).
const ALL_LIBRARY_EXERCISES: ExerciseEntry[] = (() => {
  const seen = new Set<string>();
  const out: ExerciseEntry[] = [];
  for (const c of EXERCISE_CATEGORIES) {
    for (const e of c.exercises) {
      const k = e.name.trim().toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(e); }
    }
  }
  return out;
})();

function BlockEditor({
  block,
  blockIndex = 0,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  structureId,
}: {
  block: TemplateBlock;
  blockIndex?: number;
  onChange: (b: TemplateBlock) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  structureId?: string | null;
}) {
  const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editFooter, setEditFooter] = useState<null | "sets" | "rounds">(null);
  const archivo = { fontFamily: "'Archivo', system-ui, sans-serif" } as const;

  function setName(name: string) { onChange({ ...block, block: name }); }
  function setItem(i: number, val: string) {
    const items = [...block.items];
    items[i] = val;
    onChange({ ...block, items });
  }
  function addItem() {
    onChange({ ...block, items: [...block.items, ""] });
    setEditIdx(block.items.length); // open the new line for editing
  }
  function removeItem(i: number) {
    setPickerOpenIdx(null);
    setEditIdx(null);
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
    // Route the exercise's rest + sets/rounds into the block footer fields and
    // keep only reps + intent (%1RM / velocity / VL) as chips on the line.
    const { line: cleaned, rest, rounds } = splitExerciseFooter(
      line,
      !!block.rest_between_sets,
      !!block.rest_between_rounds,
    );
    const items = [...block.items];
    items[i] = cleaned;
    const patch: TemplateBlock = { ...block, items };
    if (rest) patch.rest_between_sets = rest;
    if (rounds) patch.rest_between_rounds = rounds;
    onChange(patch);
    setPickerOpenIdx(null);
  }

  const badge = (i: number) => `${blockIndex + 1}${BE_LETTERS[i] ?? String(i + 1)}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7e4db] bg-white">
      {/* Block header */}
      <div className="flex items-center gap-2.5 border-b border-[#efece3] px-4 py-3">
        <span className="select-none text-sm tracking-widest text-[#c9c6bb]">⠿</span>
        <span style={archivo} className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#787c74]">Block {blockIndex + 1}</span>
        <input
          value={block.block}
          onChange={(e) => setName(e.target.value)}
          placeholder="Block name — e.g. Lower Body Power Pair"
          style={archivo}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14.5px] font-bold text-[#14181c] outline-none placeholder:font-normal placeholder:text-[#c9c6bb] focus:ring-0"
        />
        <div className="flex items-center gap-0.5">
          <MoveBtn onClick={onMoveUp ?? (() => {})} disabled={!onMoveUp} title="Move block up">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
          </MoveBtn>
          <MoveBtn onClick={onMoveDown ?? (() => {})} disabled={!onMoveDown} title="Move block down">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </MoveBtn>
          <button type="button" onClick={onRemove} className="px-1 text-[13px] text-[#a3a196] hover:text-[#a83e28]" title="Remove block">✕</button>
        </div>
      </div>

      {/* Exercise rows */}
      <div className="flex flex-col">
        {block.items.map((item, i) => {
          if (editIdx === i) {
            // Inline typeahead: while typing a bare name (no "·" yet), suggest
            // library exercises whose name starts with what's typed.
            const q = item.trim().toLowerCase();
            const suggestions = !item.includes("·") && q.length >= 1 && pickerOpenIdx !== i
              ? ALL_LIBRARY_EXERCISES.filter((e) => {
                  const n = e.name.toLowerCase();
                  return n.startsWith(q) && n !== q;
                }).slice(0, 8)
              : [];
            return (
              <div key={i} className="border-b border-[#f4f2ec] bg-[#faf9f5] px-4 py-3 last:border-b-0">
                <div className="flex items-center gap-1.5">
                  <span style={archivo} className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg bg-white text-[11.5px] font-bold text-[#3d4149]">{badge(i)}</span>
                  <Input
                    autoFocus
                    value={item}
                    onChange={(e) => setItem(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); setEditIdx(null); } }}
                    placeholder="Bench Press · 5 reps · 2 sets · VT 0.9 m/s · Rest 60 s"
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    title="Choose exercise from list"
                    onClick={() => setPickerOpenIdx(pickerOpenIdx === i ? null : i)}
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border text-sm transition-colors ${pickerOpenIdx === i ? "border-indigo-500 bg-indigo-100 text-indigo-700" : "border-dashed border-indigo-300 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                  >📚</button>
                  <MoveBtn onClick={() => moveItem(i, -1)} disabled={i === 0} title="Move up">
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7"/></svg>
                  </MoveBtn>
                  <MoveBtn onClick={() => moveItem(i, 1)} disabled={i === block.items.length - 1} title="Move down">
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                  </MoveBtn>
                  <button type="button" onClick={() => removeItem(i)} className="flex-shrink-0 px-1 text-xs text-[#a3a196] hover:text-[#a83e28]" title="Remove line">✕</button>
                  <button type="button" onClick={() => setEditIdx(null)} className="flex-shrink-0 rounded-md bg-[#2740e6] px-2 py-1 text-xs font-medium text-white" title="Done">✓</button>
                </div>
                {suggestions.length > 0 && (
                  <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-[#e7e4db] bg-white shadow-sm">
                    {suggestions.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        // onMouseDown fires before the input blurs, so focus/selection is preserved.
                        onMouseDown={(e) => { e.preventDefault(); insertExercise(i, fmtExercise(ex)); setEditIdx(null); }}
                        className="flex w-full items-center justify-between gap-3 border-b border-[#f4f2ec] px-3 py-2 text-left last:border-b-0 hover:bg-[#faf9f5]"
                      >
                        <span className="text-[13px] font-medium text-[#14181c]">{ex.name}</span>
                        <span className="shrink-0 text-[11px] text-[#a3a196]">{ex.sets ? `${ex.sets} × ${ex.reps}` : ex.intensity}</span>
                      </button>
                    ))}
                  </div>
                )}
                {pickerOpenIdx === i && (
                  <div className="mt-2">
                    <ExercisePicker onSelect={(line) => insertExercise(i, line)} onClose={() => setPickerOpenIdx(null)} structureId={structureId} />
                  </div>
                )}
              </div>
            );
          }
          const { name, chips } = parseItemChips(item);
          return (
            <div
              key={i}
              onClick={() => setEditIdx(i)}
              className="flex cursor-text items-start gap-3 border-b border-[#f4f2ec] px-4 py-3 last:border-b-0 hover:bg-[#faf9f5]"
            >
              <span style={archivo} className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg bg-[#f4f2ec] text-[11.5px] font-bold text-[#3d4149]">{badge(i)}</span>
              <div className="min-w-0 flex-1">
                {name ? (
                  <div className="text-[14px] font-semibold text-[#14181c]">{name}</div>
                ) : (
                  <div className="text-[13px] italic text-[#a3a196]">Empty line — click to edit</div>
                )}
                {chips.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {chips.map((chip, ci) => (
                      <span key={ci} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${chipClass(chip)}`}>{chip}</span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeItem(i); }} className="mt-1 flex-shrink-0 text-xs text-[#a3a196] hover:text-[#a83e28]" title="Remove line">✕</button>
            </div>
          );
        })}
        {block.items.length === 0 && (
          <div className="px-4 py-3 text-center text-xs text-[#a3a196]">No lines yet — use “+ Add line”.</div>
        )}
      </div>

      {/* Footer: add line + rest/rounds. Filled values show as chips (click to
          edit); empty shows the input. Values are auto-filled from the exercise
          library picker (rest + sets/rounds), matching the line chips. */}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-[#efece3] bg-[#faf9f5] px-4 py-2.5">
        <button type="button" onClick={addItem} className="text-[12.5px] font-medium text-[#2740e6] hover:underline">+ Add line</button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {block.rest_between_sets && editFooter !== "sets" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e4db] bg-white px-2.5 py-1 text-[11.5px] text-[#787c74]">
              <span className="text-[#a3a196]">⏱</span>
              <button type="button" onClick={() => setEditFooter("sets")} className="hover:text-[#14181c]" title="Edit rest between sets">Rest {block.rest_between_sets}</button>
              <button type="button" onClick={() => onChange({ ...block, rest_between_sets: undefined })} className="text-[#c9c6bb] hover:text-[#a83e28]" title="Clear">✕</button>
            </span>
          ) : (
            <input
              autoFocus={editFooter === "sets"}
              value={block.rest_between_sets ?? ""}
              onChange={(e) => onChange({ ...block, rest_between_sets: e.target.value || undefined })}
              onBlur={() => setEditFooter(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditFooter(null); }}
              placeholder="Rest between sets"
              className="w-[140px] rounded-lg border border-[#e7e4db] bg-white px-2.5 py-1.5 text-xs text-[#14181c] outline-none placeholder:text-[#a3a196]"
            />
          )}
          {block.rest_between_rounds && editFooter !== "rounds" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e4db] bg-white px-2.5 py-1 text-[11.5px] text-[#3d4149]">
              <span className="text-[#a3a196]">🔁</span>
              <button type="button" onClick={() => setEditFooter("rounds")} className="hover:text-[#14181c]" title="Edit rounds / sets">{block.rest_between_rounds}</button>
              <button type="button" onClick={() => onChange({ ...block, rest_between_rounds: undefined })} className="text-[#c9c6bb] hover:text-[#a83e28]" title="Clear">✕</button>
            </span>
          ) : (
            <input
              autoFocus={editFooter === "rounds"}
              value={block.rest_between_rounds ?? ""}
              onChange={(e) => onChange({ ...block, rest_between_rounds: e.target.value || undefined })}
              onBlur={() => setEditFooter(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditFooter(null); }}
              placeholder="Rounds"
              className="w-[86px] rounded-lg border border-[#e7e4db] bg-white px-2.5 py-1.5 text-xs text-[#14181c] outline-none placeholder:text-[#a3a196]"
            />
          )}
        </span>
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

// ─── Generated breakdown card (with GREEN diff highlight) ─────────────────────
//
// Renders a generated YELLOW/RED variant block-by-block. For YELLOW (same
// structure as GREEN) every token that differs from the matching GREEN line is
// bolded in amber — the "what changed" the coach reads at a glance. RED is a
// full replacement (warm-up + ISO + core), so it renders plainly with a summary.

/** Bold the tokens of `gen` that differ from the aligned `green` line. */
function DiffLine({ green, gen, boldClass }: { green: string | undefined; gen: string; boldClass: string }) {
  const g = (green ?? "").split(/(\s+)/);
  const y = gen.split(/(\s+)/);
  if (green == null || g.length !== y.length) return <>{gen}</>;
  return <>{y.map((tok, i) => (tok === g[i] ? <span key={i}>{tok}</span> : <b key={i} className={boldClass}>{tok}</b>))}</>;
}

function GeneratedBreakdownCard({
  green,
  generated,
  color,
  isOverridden,
  onEdit,
}: {
  green: TemplateBlock[];
  generated: TemplateRecord;
  color: "yellow" | "red";
  isOverridden: boolean;
  onEdit: () => void;
}) {
  const archivo = { fontFamily: "'Archivo', system-ui, sans-serif" } as const;
  const isYellow = color === "yellow";
  const accent = isYellow ? "#de9328" : "#a83e28";
  const boldClass = "font-bold text-[#a06a15]";
  const intro = isYellow
    ? "Reduced dose — fewer sets than GREEN, same structure."
    : "Recovery only — warm-up, isometrics and core. No lifts, no jumps.";

  // Count changed YELLOW lines for the "what changed" summary.
  let changed = 0;
  if (isYellow) {
    generated.structure.forEach((b, bi) => {
      const gb = green[bi];
      b.items.forEach((it, ii) => { if (gb && gb.items[ii] != null && gb.items[ii] !== it) changed += 1; });
    });
  }
  const summary = isYellow
    ? changed > 0
      ? `${changed} line${changed === 1 ? "" : "s"} lighter — highlighted values differ from GREEN.`
      : "One accessory trimmed so the dose is lighter than GREEN."
    : "All lifting and jumping removed; replaced with the standard ISO + core recovery structure.";

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7e4db] bg-white" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center gap-2 border-b border-[#efece3] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
        <span style={archivo} className="text-[14px] font-bold">{generated.md_day} — {color.toUpperCase()}</span>
        {isOverridden && (
          <span className="rounded-full border border-[#e7e4db] bg-[#faf9f5] px-2 py-0.5 text-[10.5px] text-[#787c74]">edited</span>
        )}
        <button type="button" onClick={onEdit} className="ml-auto rounded-lg border border-[#e7e4db] bg-white px-3 py-1 text-[11.5px] text-[#3d4149] hover:bg-[#faf9f5]">Edit</button>
      </div>
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <p className="text-xs leading-relaxed text-[#5c6066]">{intro}</p>
        {generated.structure.map((b, bi) => (
          <div key={bi}>
            <div style={archivo} className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#787c74]">{b.block}</div>
            <div className="mt-1 text-[12.5px] leading-[1.8]">
              {b.items.filter((it) => it.trim()).map((it, ii) => (
                <div key={ii}>
                  {isYellow ? <DiffLine green={green[bi]?.items[ii]} gen={it} boldClass={boldClass} /> : it}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="border-t border-[#efece3] pt-2.5 text-[11.5px] leading-snug text-[#787c74]">
          <b style={{ color: accent }}>What changed:</b> {summary}
        </div>
      </div>
    </div>
  );
}

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
                {isOverridden && <span className="ml-1 text-[10px] text-amber-600 font-normal">(edited)</span>}
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
              ✏️ Edit
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

  const colorLabel = color === "yellow" ? "Yellow" : "Red";
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
        <div className="text-sm font-semibold">{colorLabel} version — edit</div>
        <div className="flex gap-2">
          {isOverridden && onReset && (
            <button type="button" onClick={onReset}
              className="text-[11px] text-amber-600 hover:text-amber-800 underline">
              Reset to auto
            </button>
          )}
          <button type="button" onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground">✕ Cancel</button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-[11px] font-medium text-neutral-500">Title</label>
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
            className="text-[11px] text-indigo-600 hover:text-indigo-800">+ Add line</button>
        </div>
      ))}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Save changes
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
  /** teams.team_type — drives the PT-vs-football UX split. PT teams hide
   *  the gender chip, never list football teams alongside, and use the
   *  trainer's own name as the team. */
  teamType: string | null;
  isPrimary: boolean;
};

const SPORT_ICONS: Record<string, string> = {
  football: "⚽", basketball: "🏀", handball: "🤾", volleyball: "🏐",
};

// ─── Multi-day programme import (AI) ───────────────────────────────────────────
//
// Upload a PDF / Excel / Word programme → extract text client-side (reusing the
// same extractors as FileUploadZone) → send to /analyze where Claude proposes a
// multi-day breakdown → the coach maps each detected day to an MD-day and loads
// it into the GREEN builder for review + save. READ-ONLY AI: the proposal is
// never saved automatically; the coach confirms in the builder (explainability
// principle #4 — AI proposes, the coach decides).

type AnalyzedDay = {
  label: string;
  suggested_md_day: string;
  title: string;
  structure: TemplateBlock[];
};
type ImportedDay = { label: string; title: string; md_day: string; structure: TemplateBlock[] };

function ProgrammeImportModal({
  sport,
  onClose,
  onLoad,
}: {
  sport: string;
  onClose: () => void;
  onLoad: (days: { md_day: string; record: TemplateRecord }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "analyzing" | "review" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");
  const [days, setDays] = useState<ImportedDay[]>([]);

  async function extractText(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "xlsx" || ext === "xls") return extractXLSXText(file);
    if (ext === "pdf") return extractPDFText(file);
    if (ext === "docx") return extractDOCXText(file);
    if (ext === "doc")
      throw new Error("The older Word format (.doc) is not supported. Save the document as .docx and try again.");
    if (ext === "csv" || ext === "txt") return file.text();
    throw new Error("Unsupported file type. Use Word (.docx), Excel (.xlsx), PDF (.pdf), CSV (.csv) or text (.txt).");
  }

  async function handleFile(file: File) {
    setErrorMsg("");
    setFileName(file.name);
    try {
      setPhase("reading");
      const text = await extractText(file);
      if (!text.trim()) throw new Error("The file appeared to be empty.");
      setPhase("analyzing");
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/coach/custom-templates/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ text, sport }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; days?: AnalyzedDay[] };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Analysis failed.");
      const parsed: ImportedDay[] = (json.days ?? []).map((d) => ({
        label: d.label,
        title: d.title,
        md_day: d.suggested_md_day,
        structure: d.structure,
      }));
      if (parsed.length === 0) throw new Error("No training day was found in the document.");
      setDays(parsed);
      setPhase("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error while reading the file.");
      setPhase("error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function pickFile() {
    fileRef.current?.click();
  }
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }
  function patchDay(i: number, patch: Partial<ImportedDay>) {
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  // MD-day collisions: greenTemplates is keyed by md_day, so two days on the same
  // code would overwrite each other. Require unique codes before loading.
  const dayCounts = days.reduce<Record<string, number>>((acc, d) => {
    acc[d.md_day] = (acc[d.md_day] ?? 0) + 1;
    return acc;
  }, {});
  const hasDuplicate = Object.values(dayCounts).some((n) => n > 1);

  function load() {
    const mapped = days.map((d) => ({
      md_day: d.md_day,
      record: {
        md_day: d.md_day,
        readiness_level: "GREEN",
        title: `🟢 ${d.md_day} — ${d.title}`.trim(),
        description: "",
        structure: d.structure,
        variant: "A",
      } as TemplateRecord,
    }));
    onLoad(mapped);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Import a programme from a file</h2>
            <p className="text-sm text-muted-foreground">
              Upload a PDF, Excel or Word programme. MicroPulse reads it, splits it into training days,
              and you choose which MD-day each session lands on.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt,.pdf,.docx"
          className="hidden"
          onChange={onInputChange}
        />

        {phase === "idle" && (
          <div
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8"
            onClick={pickFile}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <span className="text-3xl">📄</span>
            <p className="text-sm font-medium text-slate-700">Click or drag a file here</p>
            <p className="text-center text-[11px] text-muted-foreground">
              Word (.docx), Excel (.xlsx), PDF (.pdf), CSV (.csv) or text (.txt) · a 2–4 day programme is fine
            </p>
          </div>
        )}

        {(phase === "reading" || phase === "analyzing") && (
          <div className="flex flex-col items-center gap-2 py-10">
            <span className="animate-spin text-2xl">⏳</span>
            <p className="text-sm text-muted-foreground">
              {phase === "reading" ? `Reading ${fileName}…` : "MicroPulse AI is analysing the programme…"}
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3 py-4">
            <p className="text-center text-sm text-red-600">⚠️ {errorMsg}</p>
            <div className="flex justify-center">
              <Button size="sm" variant="outline" onClick={() => { setPhase("idle"); }}>
                Try another file
              </Button>
            </div>
          </div>
        )}

        {phase === "review" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              🤖 <span className="font-semibold">AI proposal</span> — MicroPulse read
              {fileName ? ` “${fileName}”` : " your file"} and found {days.length}{" "}
              {days.length === 1 ? "training day" : "training days"}. Review each one, pick its MD-day,
              then load it into the builder. Nothing is saved until you confirm there.
            </div>

            <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
              {days.map((d, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_170px] sm:items-end">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">
                        Session {i + 1}{d.label ? ` · ${d.label}` : ""}
                      </Label>
                      <Input
                        value={d.title}
                        onChange={(e) => patchDay(i, { title: e.target.value })}
                        placeholder="Session title"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Goes on</Label>
                      <select
                        value={d.md_day}
                        onChange={(e) => patchDay(i, { md_day: e.target.value })}
                        className={`mt-1 w-full rounded-md border bg-white px-2 py-2 text-sm ${
                          dayCounts[d.md_day] > 1 ? "border-red-400" : "border-slate-300"
                        }`}
                      >
                        {MD_DAYS.map((code) => (
                          <option key={code} value={code}>
                            {MD_DAY_LABELS[code] ?? code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2">
                    {d.structure.map((b, bi) => (
                      <div key={bi} className="text-[11px]">
                        <span className="font-semibold text-slate-700">{b.block}</span>
                        <span className="text-slate-500">
                          {" "}— {b.items.length} {b.items.length === 1 ? "line" : "lines"}
                          {b.items[0] ? `: ${b.items[0].slice(0, 60)}${b.items[0].length > 60 ? "…" : ""}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {hasDuplicate && (
              <p className="text-[11px] text-red-600">
                Two sessions share an MD-day (highlighted). Give each session a different MD-day before loading.
              </p>
            )}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setPhase("idle")}>
                Choose a different file
              </Button>
              <Button size="sm" onClick={load} disabled={hasDuplicate || days.length === 0}>
                Load {days.length} {days.length === 1 ? "day" : "days"} into the builder →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomTemplatesPage() {
  const [sets, setSets] = useState<TemplateSet[]>([]);
  const [playerSets, setPlayerSets] = useState<TemplateSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Roster for player template picker (one fetch per team)
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);

  // Player template builder state — only used when builderMode === "player"
  const [builderMode, setBuilderMode] = useState<"team" | "player">("team");
  const [playerBuilderPlayerId,  setPlayerBuilderPlayerId]  = useState<string>("");
  const [playerBuilderParent,    setPlayerBuilderParent]    = useState<string>(""); // parent table_name
  const [playerBuilderStart,     setPlayerBuilderStart]     = useState<string>(""); // YYYY-MM-DD
  const [playerBuilderEnd,       setPlayerBuilderEnd]       = useState<string>("");
  const [playerBuilderNote,      setPlayerBuilderNote]      = useState<string>("");

  // All teams this coach has access to + selected team
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const selectedTeam = allTeams.find((t) => t.id === selectedTeamId) ?? null;
  const teamName   = selectedTeam?.name   ?? null;
  const teamSport  = selectedTeam?.sport  ?? null;
  const teamGender = selectedTeam?.gender ?? null;
  // The pinned "Explosive Power 12w" library belongs to personal training only,
  // never a club team's programme list.
  const isPtSelected = String(selectedTeam?.teamType ?? "").toLowerCase() === "personal_trainer";

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
  // Step-3 redesign (Build GREEN v2): which "Add content" panel is open, and
  // whether the full YELLOW/RED breakdown is expanded in the left column.
  const [addContentPanel, setAddContentPanel] = useState<null | "describe" | "structure" | "upload">(null);
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);
  // Movement-pattern exercise picker (opened from the toolbar or a balance
  // finding); `family` pre-filters the library to that pattern.
  const [patternPanel, setPatternPanel] = useState<{ family: string | null } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Which existing set is being edited (null = creating new)
  const [editingSet, setEditingSet] = useState<TemplateSet | null>(null);

  // Days that already have records in DB (for the current set being edited)
  const [existingDays, setExistingDays] = useState<string[]>([]);

  // Admin detection — Helgi (the site owner) gets the pinned Explosive
  // Power 12w card at the top of the "My training programmes" list. It's not
  // stored as a custom_template_sets row because it has a different
  // (phase-based) shape; it lives in pt_explosive_programmes and renders
  // through the dedicated ExplosivePowerPanel. Other PTs / coaches never
  // see the card.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!alive) return;
      if (String((prof as { role?: string } | null)?.role ?? "").toLowerCase() === "admin") {
        setIsAdmin(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Track which workout structure was last applied per day (for context-aware exercise picker)
  const [dayStructureIds, setDayStructureIds] = useState<Record<string, string>>({});

  // set name = team name (auto), sport + gender from selected team
  const setName   = teamName   ?? "";
  const sport     = teamSport  ?? "";
  const gender    = teamGender ?? null;
  const teamTableName = buildTableName(setName, sport, gender);

  // For player templates we need a distinct table_name slug per (player, parent, window).
  // Pattern: <team_table>_player_<8-char-id>_<startYYYYMMDD>
  const playerSlug = playerBuilderPlayerId
    ? playerBuilderPlayerId.replace(/-/g, "").slice(0, 8)
    : "";
  const playerTableName = builderMode === "player" && playerBuilderPlayerId && playerBuilderStart
    ? `${teamTableName}_player_${playerSlug}_${playerBuilderStart.replace(/-/g, "")}`
    : "";

  const tableName = builderMode === "player"
    ? (editingSet?.table_name ?? playerTableName)
    : teamTableName;

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
      setPlayerSets(json.playerSets ?? []);
    }
    setLoadingSets(false);
  }, []);

  // Reload sets whenever the selected team changes
  useEffect(() => { void loadSets(selectedTeamId); }, [loadSets, selectedTeamId]);

  // Load the team roster once whenever the selected team changes — used by the
  // player-template builder picker. Cheap (id + full_name only) so safe on every change.
  useEffect(() => {
    if (!selectedTeamId) { setTeamPlayers([]); return; }
    (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("players")
        .select("id, full_name, team_id")
        .eq("team_id", selectedTeamId)
        .order("full_name");
      setTeamPlayers(((data ?? []) as TeamPlayer[]).map((p) => ({ id: p.id, full_name: p.full_name })));
    })();
  }, [selectedTeamId]);

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
        .select("id, name, sport, gender, team_type")
        .in("id", allTeamIds.map((t) => t.id));

      for (const t of (teams ?? []) as any[]) {
        const isPrimary = allTeamIds.find((x) => x.id === t.id)?.isPrimary ?? false;
        collected.set(t.id, {
          id: t.id, name: t.name, sport: t.sport, gender: t.gender,
          teamType: t.team_type ?? null,
          isPrimary,
        });
      }

      const sortedAll = Array.from(collected.values()).sort((a, b) =>
        (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
      );

      // PT vs football split. If the coach's PRIMARY team is a PT team, hide
      // every non-PT team from the picker (and vice versa). Personal trainers
      // working out of Helgi-style 1-on-1 setups don't need football teams
      // bleeding into their client-template flow, and team coaches shouldn't
      // see incidental PT teams either.
      const primaryTeam = sortedAll.find((t) => t.isPrimary) ?? sortedAll[0];
      const isPtPrimary = String(primaryTeam?.teamType ?? "").toLowerCase() === "personal_trainer";
      const sorted = sortedAll.filter((t) => {
        const isPt = String(t.teamType ?? "").toLowerCase() === "personal_trainer";
        return isPtPrimary ? isPt : !isPt;
      });
      setAllTeams(sorted);

      // Restore the last team the coach worked with (so being "in" a team
      // sticks across reloads); fall back to primary / first.
      let saved: string | null = null;
      try { saved = localStorage.getItem("customTemplates.teamId"); } catch { /* ignore */ }
      const restored = saved && sorted.some((t) => t.id === saved) ? saved : null;
      const primary = sorted.find((t) => t.isPrimary) ?? sorted[0];
      const initial = restored ?? primary?.id ?? null;
      if (initial) setSelectedTeamId(initial);
    })();
  }, []);

  // Remember the selected team across reloads.
  useEffect(() => {
    if (!selectedTeamId) return;
    try { localStorage.setItem("customTemplates.teamId", selectedTeamId); } catch { /* ignore */ }
  }, [selectedTeamId]);

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
            block: "Warm-up",
            items: [
              "Mini-band glute walk 2×10",
              "Hip bridge 2×8",
              "Split Squat ISO 5 sec × 2/side",
            ],
          },
          {
            block: "B. Main block",
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
      structure: [...t.structure, { block: "New block", items: [""] }],
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
      // GREEN+ (a green-plus player does more, focused on the main lifts),
      // then the reduced YELLOW and minimal RED. The player/display readers
      // pick the row matching the athlete's state (GREEN+ falls back to GREEN
      // only when no GREEN+ row exists — now it always does).
      records.push(generateGreenPlus(green));
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
    if (!session) { setSaveErr("Not signed in."); setSaving(false); return; }

    // Pre-flight validation for player mode
    if (builderMode === "player") {
      if (!playerBuilderPlayerId)  { setSaveErr("Choose a player.");                setSaving(false); return; }
      if (!playerBuilderParent)    { setSaveErr("Choose a team template to override."); setSaving(false); return; }
      if (!playerBuilderStart)     { setSaveErr("Choose a start date.");       setSaving(false); return; }
      if (!playerBuilderEnd)       { setSaveErr("Choose an end date.");         setSaving(false); return; }
      if (playerBuilderStart > playerBuilderEnd) {
        setSaveErr("The start date must be before the end date.");
        setSaving(false); return;
      }
    }

    const records = buildAllRecords();
    const playerName = teamPlayers.find((p) => p.id === playerBuilderPlayerId)?.full_name ?? "player";
    const setNameForSave = builderMode === "player"
      ? `${setName} — ${playerName}`
      : setName.trim();

    const res = await fetch("/api/coach/custom-templates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        team_id:      selectedTeamId,
        set_name:     setNameForSave,
        sport:        sport,
        gender:       gender,
        season_phase: seasonPhase,
        table_name:   tableName,
        md_days:      selectedDays,
        records,
        // Player override fields (only sent when in player mode)
        ...(builderMode === "player" ? {
          player_id:         playerBuilderPlayerId,
          parent_table_name: playerBuilderParent,
          start_date:        playerBuilderStart,
          end_date:          playerBuilderEnd,
          note:              playerBuilderNote || null,
        } : {}),
      }),
    });

    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Error while saving."); setSaving(false); return; }

    const newDays = selectedDays.filter((d) => !existingDays.includes(d));
    const updatedDays = selectedDays.filter((d) => existingDays.includes(d));
    const parts = [];
    if (newDays.length) parts.push(`${newDays.length} new day(s) added`);
    if (updatedDays.length) parts.push(`${updatedDays.length} day(s) updated`);
    setSaveOk(`Saved ✅ — ${tableName} — ${parts.join(", ") || `${records.length} records`}`);
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
    // Player builder state
    setBuilderMode("team");
    setPlayerBuilderPlayerId("");
    setPlayerBuilderParent("");
    setPlayerBuilderStart("");
    setPlayerBuilderEnd("");
    setPlayerBuilderNote("");
    // setName/sport/gender are derived from selectedTeam — no reset needed
  }

  // Drop AI-extracted days into the builder for review. The coach already chose
  // each day's MD-day in the import modal, so we land straight on the GREEN
  // editor (step 3); nothing is saved until they finish + press Save.
  function loadImportedDays(mapped: { md_day: string; record: TemplateRecord }[]) {
    const green: GreenTemplates = {};
    for (const d of mapped) green[d.md_day] = d.record;
    setEditingSet(null);
    setExistingDays([]);
    // builderMode is left as-is: import works for BOTH a team programme and a
    // player override. The player fields (player / parent / dates / note) are
    // likewise preserved so a mid-flow import doesn't wipe them.
    setSeasonPhase(null);
    setYellowOverrides({});
    setRedOverrides({});
    setEditingColor(null);
    setSelectedDays(mapped.map((d) => d.md_day));
    setGreenTemplates(green);
    setCurrentDayIdx(0);
    setShowImport(false);
    setShowBuilder(true);
    setStep(3);
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

    // Restore player-mode state if editing a player override
    if (s.player_id) {
      setBuilderMode("player");
      setPlayerBuilderPlayerId(s.player_id);
      setPlayerBuilderParent(s.parent_table_name ?? "");
      setPlayerBuilderStart(s.start_date ?? "");
      setPlayerBuilderEnd(s.end_date ?? "");
      setPlayerBuilderNote(s.note ?? "");
    } else {
      setBuilderMode("team");
    }

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

  // Append a movement-pattern exercise (from the pattern picker) to the last
  // working block of the current day — with a default 3×8 so it counts toward
  // the live balance. Creates a "Main" block if the day has only warm-up/cool-down.
  function addExerciseLine(line: string) {
    const green = getOrInitGreen(currentDay);
    const structure = green.structure.map((b) => ({ ...b, items: [...b.items] }));
    let idx = -1;
    for (let i = structure.length - 1; i >= 0; i--) {
      if (!/warm|upphitun|cool|niðurlag|teygj/i.test(structure[i].block)) { idx = i; break; }
    }
    // Block-level tokens (the whole sequence's set count / between-set rest)
    // belong in the block footer, not as a chip on a single exercise line.
    // Per-exercise bits (reps, %1RM, "15–30 sec to A2" transitions) stay.
    const segs = line.split("·").map((s) => s.trim()).filter(Boolean);
    let setsToken: string | undefined;
    let restToken: string | undefined;
    const kept = segs.filter((seg) => {
      if (!setsToken && /^\d+(\s*[–-]\s*\d+)?\s*sets?$/i.test(seg)) { setsToken = seg; return false; }
      // Block-level rest = "…between sets/pairs/rounds/clusters/supersets". A
      // per-exercise transition ("15–30 sec to A2") has no "between" and stays.
      if (!restToken && /between\s+(sets?|pairs?|rounds?|clusters?|supersets?)/i.test(seg)) {
        restToken = seg.replace(/\s*(rest\s+)?between\s+(sets?|pairs?|rounds?|clusters?|supersets?)\s*/i, "").trim() || seg;
        return false;
      }
      return true;
    });
    const cleanLine = kept.join(" · ");
    const applyFooter = (b: TemplateBlock): TemplateBlock => {
      const nb = { ...b };
      if (setsToken && !nb.rest_between_rounds) nb.rest_between_rounds = setsToken;
      if (restToken && !nb.rest_between_sets) nb.rest_between_sets = restToken;
      return nb;
    };
    if (idx === -1) {
      structure.push(applyFooter({ block: "Main", items: [cleanLine] }));
    } else {
      structure[idx] = applyFooter({ ...structure[idx], items: [...structure[idx].items.filter((x) => x.trim()), cleanLine] });
    }
    updateGreen(currentDay, { structure });
  }
  function addPatternExercise(name: string) {
    addExerciseLine(`${name} · 3 sets × 8 reps`);
    setPatternPanel(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My training programmes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build your own microdose programme. You define the green version — the system handles yellow and red.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CoachTutorialButton slug="custom-programmes" />
          {!showBuilder && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={() => { setBuilderMode("team"); setShowBuilder(true); setStep(1); }}>
              + Create new programme
            </Button>
            <Button
              variant="outline"
              disabled={!sport}
              title={!sport ? "Select a team first" : "Import a 2–4 day programme from a PDF, Excel or Word file"}
              onClick={() => { setBuilderMode("team"); setShowImport(true); }}
            >
              📄 Import from file
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBuilderMode("player");
                // Pre-fill parent if there's exactly one team template — saves a click
                if (sets.length === 1) setPlayerBuilderParent(sets[0].table_name);
                // Default to today + 14 days as a reasonable rehab window
                const today = new Date();
                const plus14 = new Date();
                plus14.setDate(today.getDate() + 14);
                setPlayerBuilderStart(today.toISOString().slice(0, 10));
                setPlayerBuilderEnd(plus14.toISOString().slice(0, 10));
                setShowBuilder(true);
                setStep(1);
              }}
            >
              + Player programme
            </Button>
          </div>
          )}
        </div>
      </div>

      {/* Team context — the list below (and the builder) is scoped to this team.
          Without it a multi-team coach always saw their primary team's
          programmes, even when working with another team. */}
      {!showBuilder && allTeams.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <label htmlFor="team-context" className="text-sm font-medium text-slate-700">
            Team
          </label>
          <select
            id="team-context"
            value={selectedTeamId ?? ""}
            onChange={(e) => setSelectedTeamId(e.target.value || null)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          >
            {allTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.sport ? ` · ${t.sport}` : ""}
              </option>
            ))}
          </select>
          {selectedTeam && (
            <span className="text-xs text-muted-foreground">
              Showing programmes for <span className="font-medium text-slate-700">{selectedTeam.name}</span> only
            </span>
          )}
        </div>
      )}

      {/* AI multi-day import modal */}
      {showImport && (
        <ProgrammeImportModal
          sport={sport}
          onClose={() => setShowImport(false)}
          onLoad={loadImportedDays}
        />
      )}

      {/* Movement-pattern exercise picker (pop-up) */}
      {patternPanel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Add by movement pattern</h2>
                <p className="text-sm text-muted-foreground">
                  Choose an exercise by pattern (squat / hinge / push / pull / core / carry). It is added to the
                  main block with a default 3×8 you can adjust.
                </p>
              </div>
              <button onClick={() => setPatternPanel(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
            </div>
            <LibraryBrowse initialFamily={patternPanel.family} onSelect={(name) => addPatternExercise(name)} />
          </div>
        </div>
      )}

      {/* Success message */}
      {saveOk && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <CardContent className="pt-4 text-sm text-emerald-700">{saveOk}</CardContent>
        </Card>
      )}

      {/* Existing sets list */}
      {!showBuilder && (
        <div className="space-y-3">
          {/* Pinned admin programme — Explosive Power 12w. Personal-training
              library only (site-admin + a personal_trainer team selected) —
              never on a club team's programme list. It's not a
              custom_template_sets row (different shape, phase-based blocks live
              in pt_explosive_programmes) but appears here as a regular card so
              Helgi can reach it from his own PT programme library. */}
          {isAdmin && isPtSelected && (
            <Link
              href="/coach/pt-explosive"
              className="block rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 transition-colors hover:from-amber-100 hover:to-orange-100"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg">⚡</span>
                    <div className="font-semibold text-slate-900">Explosive Power — 12 weeks</div>
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                      Helgi&apos;s programme
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Two 12-week programmes: 4-phase PUSH/PULL and 3–4 days/week research-based. Beginner / Intermediate / Advanced with daily green/yellow/red adjustment.
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Visible only to you (the site owner). Suchomel 2018 · Cormier 2020 · Pareja-Blanco 2017.
                  </div>
                </div>
                <div className="shrink-0 text-sm font-medium text-amber-800">Open →</div>
              </div>
            </Link>
          )}

          {loadingSets ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : sets.length === 0 && playerSets.length === 0 ? (
            // Don't show the "no programmes yet" placeholder when the admin
            // sees their pinned Explosive Power card — that IS a programme
            // they already have, so the message would be misleading. Only
            // suppress it in the PT context where that card actually renders.
            (isAdmin && isPtSelected) ? null : (
              <Card>
                <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                  No training programmes yet. Create your first one above.
                </CardContent>
              </Card>
            )
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
                          {s.gender === "M" ? "Men" : "Women"}
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
                      ✏️ Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* ── Player templates section ─────────────────────────────────── */}
          {!loadingSets && (
            <div className="mt-8 space-y-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Individual programmes</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Override for individual players — e.g. injury or return-to-play. The team plan is the baseline; the player template
                  deviates from the MD days you define within the selected period.
                </p>
              </div>

              {playerSets.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                    No individual programmes active. Use &laquo;+ Player programme&raquo; above to create one.
                  </CardContent>
                </Card>
              ) : (
                playerSets.map((s) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const isActive = !!s.start_date && !!s.end_date
                    ? s.start_date <= today && today <= s.end_date
                    : false;
                  const isPast = !!s.end_date && s.end_date < today;
                  return (
                    <Card key={s.id} className={isActive ? "border-amber-300" : ""}>
                      <CardContent className="flex items-center justify-between gap-4 pt-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium">{s.player_name ?? s.set_name}</div>
                            <span className="text-xs text-muted-foreground">{s.sport}</span>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                🟢 Active now
                              </span>
                            )}
                            {isPast && (
                              <span className="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                Past
                              </span>
                            )}
                            {!isActive && !isPast && (
                              <span className="inline-flex items-center gap-1 rounded-full border bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                Upcoming
                              </span>
                            )}
                          </div>
                          {s.parent_table_name && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Overrides:{" "}
                              <span className="font-mono">{s.parent_table_name}</span>
                            </div>
                          )}
                          {(s.start_date || s.end_date) && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {s.start_date} → {s.end_date}
                            </div>
                          )}
                          {s.note && (
                            <div className="mt-0.5 text-xs italic text-muted-foreground">{s.note}</div>
                          )}
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
                            ✏️ Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BUILDER ──────────────────────────────────────────────────────────── */}
      {showBuilder && (
        <div className="space-y-4">

          {/* Step indicator */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              [1, "Name & sport"],
              [2, "Choose days"],
              [3, "Build GREEN"],
              [4, "Review & save"],
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
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-xs"
              disabled={!sport}
              title={!sport ? "Select a team first" : "Import a 2–4 day programme from a PDF, Excel or Word file"}
              onClick={() => setShowImport(true)}
            >
              📄 Import from file
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setShowBuilder(false); resetBuilder(); }}>
              Cancel
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
                <span className="ml-2 text-amber-700">— changes overwrite existing records. You can also add new days.</span>
              </div>
            </div>
          )}

          {/* Player-mode banner + scope form (visible in all steps) */}
          {builderMode === "player" && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardHeader>
                <CardTitle className="text-base">
                  Individual programme {editingSet ? "— edit" : "— new"}
                </CardTitle>
                <CardDescription>
                  Choose a player and which team template to override. Only the MD days you save in
                  this programme override the team plan — other days follow the team automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Player</Label>
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={playerBuilderPlayerId}
                    onChange={(e) => setPlayerBuilderPlayerId(e.target.value)}
                    disabled={!!editingSet}
                  >
                    <option value="">— choose a player —</option>
                    {teamPlayers.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">Team template to override</Label>
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={playerBuilderParent}
                    onChange={(e) => setPlayerBuilderParent(e.target.value)}
                  >
                    <option value="">— choose parent —</option>
                    {sets.map((s) => (
                      <option key={s.id} value={s.table_name}>
                        {s.set_name} {s.season_phase ? `(${s.season_phase})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={playerBuilderStart}
                    onChange={(e) => setPlayerBuilderStart(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={playerBuilderEnd}
                    onChange={(e) => setPlayerBuilderEnd(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Note (optional)</Label>
                  <Input
                    placeholder="e.g. Hamstring rehab — back-to-running W2"
                    value={playerBuilderNote}
                    onChange={(e) => setPlayerBuilderNote(e.target.value)}
                  />
                </div>

                {sets.length === 0 && (
                  <div className="sm:col-span-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    No team template to override. First create at least one team template before
                    you create a player override.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Step 1: Name & sport ─────────────────────────────────────────── */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 1 — Team &amp; season</CardTitle>
                <CardDescription>Choose a team and season. The days (MD-4, MD-2 etc.) are then selected in the next step.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">

                {/* Team selector — single team: read-only banner; multiple teams: clickable cards */}
                {allTeams.length === 0 && (
                  <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground animate-pulse">
                    Loading team info…
                  </div>
                )}

                {allTeams.length >= 1 && (() => {
                  // Always show ONLY the team the coach is on (the page context),
                  // read-only — not every team they have access to. Switching
                  // teams happens via the selector on the programmes list.
                  // Suppress sport + gender chips on PT teams — a personal
                  // trainer's "team" is just themselves, not a gendered roster.
                  const isPt = String(selectedTeam?.teamType ?? "").toLowerCase() === "personal_trainer";
                  return (
                    <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3">
                      <div className="text-2xl">
                        {isPt ? "🧑‍🏫" : (SPORT_ICONS[teamSport ?? ""] ?? "🏅")}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{teamName ?? "—"}</div>
                        {!isPt && (
                          <div className="text-xs text-muted-foreground flex gap-2">
                            {teamSport && <span className="capitalize">{teamSport}</span>}
                            {teamGender && (
                              <span className={`font-medium ${teamGender === "M" ? "text-blue-600" : "text-rose-500"}`}>
                                {teamGender === "M" ? "Men" : "Women"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="ml-auto text-[10px] text-muted-foreground">
                        {isPt ? "Personal trainer" : "From team profile"}
                      </div>
                    </div>
                  );
                })()}

                {allTeams.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Building for <span className="font-medium text-foreground">{teamName}</span>. To build for a different team, switch it with the team selector on the programmes list.
                  </p>
                )}

                {/* Season phase */}
                <div className="grid gap-2">
                  <Label>Season <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEASON_PHASES.map((phase) => (
                      <button
                        key={phase.id}
                        type="button"
                        onClick={() => setSeasonPhase((p) => {
                          const next = p === phase.id ? null : phase.id;
                          // Reset the day selection whenever we cross the
                          // offseason boundary so users don't end up with
                          // mixed MD-N / weekday tags in one set.
                          const goingOff = next === "offseason";
                          const leavingOff = p === "offseason" && next !== "offseason";
                          if (goingOff) setSelectedDays(["MÁN"]);
                          else if (leavingOff) setSelectedDays(["GENERIC"]);
                          return next;
                        })}
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
                      <span className="text-muted-foreground">DB table: </span>
                      <span className="font-mono font-medium text-foreground">{tableName}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!sport}>
                    Next →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Select MD days ───────────────────────────────────────── */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 2 — Choose training days</CardTitle>
                <CardDescription>
                  {editingSet
                    ? "Choose which days you want to edit. Selected days overwrite existing data. You can also add new days."
                    : "Which microdose days do you want to define in your programme?"}
                  {existingDays.length > 0 && (
                    <span className="ml-1 text-amber-600 font-medium">
                      — {existingDays.length} day(s) already exist.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {/* Offseason: no games on the calendar, so MD-N labels are
                    meaningless. Swap the picker to weekdays. Stored under
                    md_day in the dynamic records table just like MD codes. */}
                {(() => {
                  const isOff = seasonPhase === "offseason";
                  const days = isOff ? WEEKDAYS : MD_DAYS;
                  const labels = isOff ? WEEKDAY_LABELS : MD_DAY_LABELS;
                  return (
                    <div className="grid gap-2">
                      {days.map((day) => {
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
                              <div className="text-xs text-muted-foreground">{labels[day]}</div>
                            </div>
                            {alreadySaved && (
                              <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${
                                selected
                                  ? "text-amber-700 bg-amber-50 border border-amber-200"
                                  : "text-emerald-600 bg-emerald-50 border border-emerald-200"
                              }`}>
                                {selected ? "✏️ Will update" : "✓ In database"}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                  <Button onClick={() => { setCurrentDayIdx(0); setStep(3); }} disabled={selectedDays.length === 0}>
                    Next → Build GREEN
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Build GREEN templates ────────────────────────────────── */}
          {step === 3 && (() => {
            const items = currentGreen.structure.flatMap((b) => b.items);
            const audit = auditLines(items);
            const hasContent = items.some((it) => it.trim());
            const hasBlocks = currentGreen.structure.length > 0;
            const maxFam = Math.max(1, ...AUDIT_FAMILIES.map((f) => audit.byFamily[f] ?? 0));
            const builtCount = selectedDays.filter(
              (d) => existingDays.includes(d) || !!greenTemplates[d]?.structure?.some((b) => b.items?.some((it) => it.trim())),
            ).length;
            const FAM_LABEL: Record<string, string> = { squat: "Squat", hinge: "Hinge", push: "Push", pull: "Pull", core: "Core", carry: "Carry" };
            const archivo = { fontFamily: "'Archivo', system-ui, sans-serif" } as const;
            const yellowLines = currentYellow.structure.flatMap((b) => b.items).filter((it) => it.trim());
            const findingText = (flag: { code: string; family?: string; value?: number; week?: number }) => {
              switch (flag.code) {
                case "missing_family": return { msg: `No ${(FAM_LABEL[flag.family ?? ""] ?? flag.family ?? "").toLowerCase()} work.`, fix: `Add a ${(FAM_LABEL[flag.family ?? ""] ?? "").toLowerCase()} exercise → balanced.` };
                case "no_core": return { msg: "No core / anti-rotation work.", fix: "Add Pallof Press or Dead Bug → balanced." };
                case "low_unilateral": return { msg: `Only ${flag.value}% single-leg work.`, fix: "Add one unilateral exercise for left/right symmetry." };
                case "push_heavy": return { msg: `Push : Pull ${flag.value} : 1 — push-dominant.`, fix: "Add pulls (rows / pulldowns)." };
                case "pull_heavy": return { msg: `Pull-dominant ${flag.value} : 1.`, fix: "Add a press to balance." };
                case "knee_heavy": return { msg: `Knee-dominant ${flag.value}× the hinge volume.`, fix: "Add a hinge (RDL, hip thrust)." };
                case "volume_spike": return { msg: `Volume spike in week ${flag.week}.`, fix: "Ease the week-over-week jump." };
                default: return { msg: flag.code, fix: "" };
              }
            };
            return (
            <div className="space-y-5">
              {/* Day strip */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#e7e4db] bg-white px-3.5 py-2.5">
                <span style={archivo} className="mr-1 text-[11px] font-bold uppercase tracking-[0.07em] text-[#787c74]">Days</span>
                {selectedDays.map((day, i) => {
                  const active = currentDayIdx === i;
                  const built = existingDays.includes(day) || !!greenTemplates[day]?.structure?.some((b) => b.items?.some((it) => it.trim()));
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setCurrentDayIdx(i)}
                      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${active ? "border-[#2740e6] bg-[#2740e6] font-semibold text-white" : "border-[#e7e4db] bg-white text-[#3d4149] hover:bg-[#faf9f5]"}`}
                    >
                      <span className={`h-[7px] w-[7px] rounded-full ${active ? "bg-white" : built ? "bg-[#1c7a4a]" : "bg-[#c9c6bb]"}`} />
                      {day}
                      {built && !active ? <span className="text-[11px] text-[#1c7a4a]">✓</span> : null}
                    </button>
                  );
                })}
                <span className="ml-auto text-xs text-[#787c74]">
                  {builtCount} of {selectedDays.length} days built · saves as{" "}
                  <code className="font-mono text-[11px] text-[#3d4149]">{tableName}</code>
                </span>
              </div>

              {/* Two-column workspace */}
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_352px]">
                {/* ── LEFT: builder ── */}
                <div className="flex min-w-0 flex-col gap-3.5">
                  {/* Day meta */}
                  <div className="rounded-2xl border border-[#e7e4db] bg-white p-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="h-3 w-3 rounded-full bg-[#1c7a4a] shadow-[0_0_0_4px_rgba(28,122,74,0.12)]" />
                      <span style={archivo} className="text-[17px] font-bold">{currentDay} — GREEN</span>
                      {existingDays.includes(currentDay) && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">✏️ Editing</span>
                      )}
                      <span className="ml-auto text-xs text-[#787c74]">Yellow &amp; red generate live →</span>
                    </div>
                    <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1.5 text-[11.5px] font-semibold text-[#5c6066]">Title</div>
                        <Input value={currentGreen.title} onChange={(e) => updateGreen(currentDay, { title: e.target.value })} placeholder="🟢 GENERIC — Classic Microdose" />
                      </div>
                      <div>
                        <div className="mb-1.5 text-[11.5px] font-semibold text-[#5c6066]">Description <span className="font-normal text-[#a3a196]">(optional)</span></div>
                        <Input value={currentGreen.description ?? ""} onChange={(e) => updateGreen(currentDay, { description: e.target.value })} placeholder="Short description of the programme…" />
                      </div>
                    </div>
                  </div>

                  {/* Add-content toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-0.5 text-xs text-[#787c74]">Add content:</span>
                    {(["describe", "structure", "upload"] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAddContentPanel((p) => (p === key ? null : key))}
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${addContentPanel === key ? "border-[#2740e6] bg-[#2740e6] text-white" : "border-[rgba(39,64,230,0.25)] bg-[rgba(39,64,230,0.05)] text-[#2740e6] hover:bg-[rgba(39,64,230,0.1)]"}`}
                      >
                        {key === "describe" ? "✨ Describe the workout" : key === "structure" ? "⚡ Structure library" : "Upload file"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPatternPanel({ family: null })}
                      className="rounded-full border border-[rgba(39,64,230,0.25)] bg-[rgba(39,64,230,0.05)] px-3 py-1.5 text-[12.5px] font-medium text-[#2740e6] transition-colors hover:bg-[rgba(39,64,230,0.1)]"
                    >
                      🎯 Movement pattern
                    </button>
                  </div>

                  {/* Panels */}
                  {addContentPanel === "describe" && (
                    <div className="space-y-2 rounded-xl border border-[rgba(39,64,230,0.2)] bg-[rgba(39,64,230,0.03)] p-4">
                      <Textarea
                        value={workoutDescription}
                        onChange={(e) => setWorkoutDescription(e.target.value)}
                        rows={8}
                        className="bg-white font-mono text-sm"
                        placeholder={"Example:\nFrench Contrast\nBack Squat 85% × 3, Depth Jump × 3\n\nA. Warm-up\n  Foam roll 5 min, Hip 90/90 2×8\nB. Strength block\n  Back Squat 4×6 @ 80% — VT 0.5 m/s\n  60s rest between sets"}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-[#787c74]">VBT · French Contrast · Clusters · Velocity targets · Rest</p>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!workoutDescription.trim()}
                          onClick={() => {
                            const blocks = parseSmartWorkoutText(workoutDescription);
                            if (blocks.length > 0) {
                              updateGreen(currentDay, { structure: blocks });
                              setAddContentPanel(null);
                            }
                          }}
                        >
                          Create blocks →
                        </Button>
                      </div>
                    </div>
                  )}
                  {addContentPanel === "upload" && (
                    <FileUploadZone onApply={(blocks) => { updateGreen(currentDay, { structure: blocks }); setAddContentPanel(null); }} />
                  )}
                  {addContentPanel === "structure" && (
                    <StructurePicker onApply={(blocks, sid) => { applyStructureToDay(currentDay, blocks, sid); setAddContentPanel(null); }} onAddExercise={addExerciseLine} />
                  )}

                  {/* Blocks, or empty-day chooser */}
                  {hasBlocks ? (
                    <div className="flex flex-col gap-3.5">
                      {currentGreen.structure.map((block, i) => (
                        <BlockEditor
                          key={i}
                          block={block}
                          blockIndex={i}
                          onChange={(b) => updateBlock(currentDay, i, b)}
                          onRemove={() => removeBlock(currentDay, i)}
                          onMoveUp={i > 0 ? () => moveBlock(currentDay, i, -1) : undefined}
                          onMoveDown={i < currentGreen.structure.length - 1 ? () => moveBlock(currentDay, i, 1) : undefined}
                          structureId={dayStructureIds[currentDay] ?? null}
                        />
                      ))}
                      <button type="button" onClick={() => addBlock(currentDay)} className="rounded-2xl border border-dashed border-[#c9c6bb] p-3.5 text-[13px] font-medium text-[#5c6066] hover:bg-[#faf9f5]">
                        + Add block
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[#e7e4db] bg-white p-7 text-center">
                      <div style={archivo} className="text-[16px] font-bold">How do you want to build this day?</div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        {([
                          ["describe", "✨", "Describe the workout", "Write it in plain text — the system builds the blocks."],
                          ["structure", "⚡", "Structure library", "French Contrast, Garcia-Ramos, Tufano CS2/CS4, Oliver…"],
                          ["upload", "📄", "Upload a file", "Word, Excel, CSV, PDF or plain text."],
                        ] as const).map(([key, emoji, title, desc]) => (
                          <button key={key} type="button" onClick={() => setAddContentPanel(key)} className="rounded-xl border border-[#e7e4db] bg-[#faf9f5] p-4 text-left hover:border-[#2740e6]">
                            <div className="text-xl">{emoji}</div>
                            <div className="mt-2 text-[13.5px] font-semibold">{title}</div>
                            <div className="mt-1 text-xs leading-snug text-[#787c74]">{desc}</div>
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => addBlock(currentDay)} className="mt-4 text-[12.5px] text-[#2740e6] hover:underline">or start with an empty block →</button>
                    </div>
                  )}

                  {/* Full YELLOW / RED breakdown (toggled from the rail) */}
                  {showFullBreakdown && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span style={archivo} className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#787c74]">Full breakdown — generated versions</span>
                        <span className="flex-1 border-t border-[#e7e4db]" />
                        <button type="button" onClick={() => setShowFullBreakdown(false)} className="text-xs text-[#787c74] hover:text-[#3d4149]">✕ Close</button>
                      </div>
                      {editingColor?.day === currentDay && editingColor.color === "yellow" ? (
                        <TemplateOverrideEditor
                          template={currentYellow}
                          color="yellow"
                          isOverridden={!!yellowOverrides[currentDay]}
                          onSave={(t) => { setYellowOverrides((prev) => ({ ...prev, [currentDay]: t })); setEditingColor(null); }}
                          onCancel={() => setEditingColor(null)}
                          onReset={() => { setYellowOverrides((prev) => { const n = { ...prev }; delete n[currentDay]; return n; }); setEditingColor(null); }}
                        />
                      ) : editingColor?.day === currentDay && editingColor.color === "red" ? (
                        <TemplateOverrideEditor
                          template={currentRed}
                          color="red"
                          isOverridden={!!redOverrides[currentDay]}
                          onSave={(t) => { setRedOverrides((prev) => ({ ...prev, [currentDay]: t })); setEditingColor(null); }}
                          onCancel={() => setEditingColor(null)}
                          onReset={() => { setRedOverrides((prev) => { const n = { ...prev }; delete n[currentDay]; return n; }); setEditingColor(null); }}
                        />
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          <GeneratedBreakdownCard green={currentGreen.structure} generated={currentYellow} color="yellow" isOverridden={!!yellowOverrides[currentDay]} onEdit={() => setEditingColor({ day: currentDay, color: "yellow" })} />
                          <GeneratedBreakdownCard green={currentGreen.structure} generated={currentRed} color="red" isOverridden={!!redOverrides[currentDay]} onEdit={() => setEditingColor({ day: currentDay, color: "red" })} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom nav */}
                  <div className="mt-0.5 flex items-center gap-2.5">
                    <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                    <span className="flex-1" />
                    {currentDayIdx < selectedDays.length - 1 && (
                      <Button variant="outline" onClick={() => setCurrentDayIdx((i) => i + 1)}>Next day ({selectedDays[currentDayIdx + 1]}) →</Button>
                    )}
                    <Button onClick={() => setStep(4)}>Review &amp; save →</Button>
                  </div>
                </div>

                {/* ── RIGHT: live rail ── */}
                <div className="flex flex-col gap-3.5 lg:sticky lg:top-5">
                  {/* Balance — live */}
                  <div className="rounded-2xl border border-[#e7e4db] bg-white p-4">
                    <div className="flex items-center gap-2">
                      <span style={archivo} className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#787c74]">Balance — live</span>
                      {hasContent && (audit.flags.length > 0 ? (
                        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#de9328]">
                          <span className="h-[7px] w-[7px] rounded-full bg-[#de9328]" /> {audit.flags.length} {audit.flags.length === 1 ? "item" : "items"} to review
                        </span>
                      ) : (
                        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#1c7a4a]"><span>✓</span> Balanced</span>
                      ))}
                    </div>
                    {!hasContent ? (
                      <p className="mt-3 text-xs text-[#787c74]">Balance appears as you add exercises.</p>
                    ) : (
                      <>
                        <div className="mt-3.5 flex flex-col gap-[7px]">
                          {AUDIT_FAMILIES.map((f) => {
                            const n = audit.byFamily[f] ?? 0;
                            const flagged = audit.flags.some((fl) => (fl.code === "missing_family" && fl.family === f) || (fl.code === "no_core" && f === "core"));
                            return (
                              <div key={f} className="flex items-center gap-2">
                                <span className="w-11 text-[11.5px] text-[#5c6066]">{FAM_LABEL[f]}</span>
                                <div className="h-[7px] flex-1 rounded-full bg-[#f4f2ec]">
                                  <div className="h-[7px] rounded-full bg-[#2740e6]" style={{ width: `${Math.round((n / maxFam) * 100)}%` }} />
                                </div>
                                <span style={archivo} className={`w-3.5 text-right text-[11.5px] font-semibold ${n === 0 && flagged ? "text-[#de9328]" : n === 0 ? "text-[#a3a196]" : ""}`}>{n}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-[#e7e4db] bg-[#faf9f5] px-2.5 py-[3px] text-[11px] text-[#3d4149]">Push : Pull <b>{audit.byFamily.push} : {audit.byFamily.pull}</b></span>
                          <span className="rounded-full border border-[#e7e4db] bg-[#faf9f5] px-2.5 py-[3px] text-[11px] text-[#3d4149]">Knee : Hip <b>{audit.byFamily.squat} : {audit.byFamily.hinge}</b></span>
                          <span className={`rounded-full border px-2.5 py-[3px] text-[11px] ${audit.flags.some((fl) => fl.code === "low_unilateral") ? "border-[rgba(222,147,40,0.4)] bg-[rgba(222,147,40,0.08)] text-[#a06a15]" : "border-[#e7e4db] bg-[#faf9f5] text-[#3d4149]"}`}>Single-leg <b>{audit.unilateralPct}%</b></span>
                        </div>
                        {audit.flags.length > 0 && (
                          <div className="mt-3.5 flex flex-col gap-2.5 border-t border-[#efece3] pt-3">
                            {audit.flags.map((flag, fi) => {
                              const t = findingText(flag);
                              // Which movement pattern would fix this finding — clicking opens the
                              // pattern picker pre-filtered to it and adds an exercise.
                              const fixFamily: string | null =
                                flag.code === "missing_family" ? (flag.family ?? null)
                                : flag.code === "no_core" ? "core"
                                : flag.code === "knee_heavy" ? "hinge"
                                : flag.code === "push_heavy" ? "pull"
                                : flag.code === "pull_heavy" ? "push"
                                : null;
                              const actionable = flag.code !== "volume_spike";
                              return (
                                <div key={fi} className="flex gap-2 text-xs leading-snug">
                                  <span className="mt-[5px] h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[#de9328]" />
                                  <span>
                                    <b>{t.msg}</b><br />
                                    {actionable ? (
                                      <button type="button" onClick={() => setPatternPanel({ family: fixFamily })} className="text-left text-[#2740e6] hover:underline">
                                        {t.fix} ＋
                                      </button>
                                    ) : (
                                      <span className="text-[#5c6066]">{t.fix}</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Generated automatically */}
                  <div className="rounded-2xl border border-[#e7e4db] bg-white p-4">
                    <div style={archivo} className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#787c74]">Generated automatically</div>
                    <div className="mt-3 overflow-hidden rounded-xl border border-[#e7e4db]">
                      <div className="flex items-center gap-2 border-b border-[#efece3] bg-[rgba(222,147,40,0.07)] px-3 py-2.5">
                        <span className="h-[9px] w-[9px] rounded-full bg-[#de9328]" />
                        <span style={archivo} className="text-[12.5px] font-bold">YELLOW</span>
                        <span className="text-[11.5px] text-[#5c6066]">fewer sets · same structure</span>
                        <button type="button" onClick={() => { setShowFullBreakdown(true); setEditingColor({ day: currentDay, color: "yellow" }); }} className="ml-auto text-[11.5px] text-[#2740e6] hover:underline">Edit</button>
                      </div>
                      <div className="px-3 py-2.5 text-[11.5px] leading-relaxed text-[#5c6066]">
                        {yellowLines.slice(0, 2).map((l, li) => (<div key={li} className="truncate">{l}</div>))}
                        {yellowLines.length > 2 && (<div className="text-[#a3a196]">+ {yellowLines.length - 2} more lines, volume reduced</div>)}
                        {yellowLines.length === 0 && (<div className="text-[#a3a196]">Add blocks to preview the reduced version.</div>)}
                      </div>
                    </div>
                    <div className="mt-2.5 overflow-hidden rounded-xl border border-[#e7e4db]">
                      <div className="flex items-center gap-2 border-b border-[#efece3] bg-[rgba(168,62,40,0.06)] px-3 py-2.5">
                        <span className="h-[9px] w-[9px] rounded-full bg-[#a83e28]" />
                        <span style={archivo} className="text-[12.5px] font-bold">RED</span>
                        <span className="text-[11.5px] text-[#5c6066]">warm-up + ISO + core only</span>
                        <button type="button" onClick={() => { setShowFullBreakdown(true); setEditingColor({ day: currentDay, color: "red" }); }} className="ml-auto text-[11.5px] text-[#2740e6] hover:underline">Edit</button>
                      </div>
                      <div className="px-3 py-2.5 text-[11.5px] leading-relaxed text-[#5c6066]">
                        {currentRed.structure.slice(0, 3).map((b, bi) => (<div key={bi} className="truncate">{b.block}</div>))}
                        <div className="text-[#a3a196]">No lifts, no jumps</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowFullBreakdown((v) => !v)} className="mt-3 w-full rounded-lg border border-[rgba(39,64,230,0.25)] bg-[rgba(39,64,230,0.05)] py-2 text-[12.5px] font-medium text-[#2740e6] hover:bg-[rgba(39,64,230,0.1)]">
                      {showFullBreakdown ? "Hide full breakdown ▲" : "View full breakdown ▼"}
                    </button>
                    <p className="mt-2.5 text-[11px] leading-snug text-[#a3a196]">Rules-based generation from your GREEN — every change is visible and editable before saving.</p>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ── Step 4: Review & save ─────────────────────────────────────────── */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Step 4 — Review & save</CardTitle>
                <CardDescription>
                  {selectedDays.length} day(s) × 3 versions = {selectedDays.length * 3} records will be saved to table{" "}
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
                  <p className="text-sm text-destructive">Error: {saveErr}</p>
                )}

                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep(3)}>← Edit</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : `Save programme (${tableName})`}
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
