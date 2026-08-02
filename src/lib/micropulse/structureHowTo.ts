/**
 * "How to perform" guides per structure-library method id.
 *
 * Shared between the coach builder (structure picker + block cards) and the
 * player app (Æfing dagsins card + focus screen), so the SAME plain-language
 * execution steps a coach reads while building reach the player who performs
 * the session. Keyed by the structureId stamped on each TemplateBlock.
 *
 * Plain, coach/player-readable — no sport-science jargon (per explainability-first).
 */

export const STRUCTURE_HOWTO: Record<string, string[]> = {
  "french-contrast": [
    "Do the four exercises back-to-back as one set: A1 heavy → A2 plyometric → A3 light-loaded power → A4 assisted/accelerated plyometric.",
    "Only 15–30 sec between exercises — just enough to walk to the next station. The short gap is what makes the muscle fire harder (post-activation potentiation).",
    "After A4, rest 3–5 min fully. That long rest is essential — it lets you repeat at full quality.",
    "Repeat for 3–5 sets. Keep every rep explosive; stop the set if bar/jump speed drops.",
  ],
  contrast: [
    "Pair one heavy strength lift (A1) with one explosive/plyometric (A2).",
    "Do A1 for 1–5 heavy reps, then go straight into A2 for 3–6 fast reps — no rest between them.",
    "Rest 2–5 min after the pair, then repeat. The heavy lift primes the nervous system so A2 is more powerful.",
    "3–6 sets total. Every A2 rep must be maximal intent — if it slows, rest longer or stop.",
  ],
  regular: [
    "One exercise at a time, straight sets: finish all sets of an exercise before moving on.",
    "Main strength (squat/hinge) heavier and lower reps; push/pull moderate; core/carry to finish.",
    "Rest 2–3 min between heavy sets, 60–90 sec for accessory/core.",
    "Pick weights that leave 1–2 reps in reserve on the main lifts.",
  ],
  "supersets-lower-upper": [
    "Pair a lower-body and an upper-body exercise (A1+A2, then B1+B2).",
    "Do A1, then A2 with only 30–60 sec between — while the legs recover the upper body works, and vice-versa.",
    "Rest ~1.5–2 min, then repeat the pair. 3–4 sets per pairing before moving to the next pair.",
    "Great time-saver; keep load honest — supersets should not turn into cardio.",
  ],
  // Named rest-redistribution clusters ------------------------------------------
  "garcia-ramos": [
    "One lift, split into 3 blocks of 15 singles (15 × 1 rep).",
    "Block 1: 6 sec between each rep. Blocks 2–3: 12 sec between each rep.",
    "Rest 1 min between blocks. The short intra-rep rest keeps every rep fast without full fatigue.",
    "Use a heavy strength load (85–90%) or a lighter power load (30–50%) depending on the goal.",
  ],
  moreno: [
    "Choose a format: Form A = 4 sets × 5 reps with 30 sec inside each set; Form B = 10 sets × 2 reps with 10 sec inside each set.",
    "The short intra-set rest lets you keep quality on a heavy load (85–90%+) or stay explosive on a power load (45–65%).",
    "Rest 1 min between sets.",
  ],
  hansen: [
    "Singles (Form A): 4 sets of 6 × 1 rep, 12 sec between each rep. Doubles (Form B): 4 sets of 3 × 2 reps, 30 sec between pairs.",
    "Progress over weeks: doubles → triples → quads keeping the same rest.",
    "Rest 1 min between sets. Strong neural stimulus — keep bar speed high.",
  ],
  "iglesias-soler": [
    "One heavy lift, 32 single reps with ~18 sec between each — about 10 min of work.",
    "Only 1 such block per session; it is very demanding on the nervous system.",
    "Every rep is a fresh, maximal-quality single — stop if speed clearly drops.",
  ],
  "tufano-standard": [
    "Rest-redistribution: 36 singles with 12 sec between each (~8.5 min).",
    "Or use a variation (18 × 2, 12 × 3) with 12–24 sec rest to shorten it.",
    "One block per session. Goal is high quality on every lift, not fatigue.",
  ],
  "tufano-cs2": [
    "3 sets × 12 reps at 80% 1RM, with a 15 sec pause partway through each set (mini-clusters).",
    "The pause lets you hold higher force and time-under-tension than a straight set.",
    "Best for a mechanical-stress / strength emphasis.",
  ],
  "tufano-cs4": [
    "3 sets × 12 reps at 75% 1RM, with a 30 sec pause after the 4th and again after the 8th rep.",
    "Balances hypertrophy volume with maintained power output.",
    "Sits between CS2 (force) and a regular set.",
  ],
  oliver: [
    "4 sets of (5 reps → 30 sec rest → 5 more reps) on a lower-body compound.",
    "Rest 90 sec between sets. Moderately heavy — aim for clean, quality reps.",
    "The mid-set break keeps force high while lowering lactate and fatigue.",
  ],
  // Potentiation clusters (XL Athlete / Cal Dietz) ------------------------------
  "pc-acceleration": [
    "One cluster = the A1+A2 pair done 4 times: A1 heavy single → A2 max-effort jump, 15–20 sec, repeat ×4.",
    "Rest 2–3 min between clusters. Do 2–4 clusters total.",
    "A1 primes; A2 is where the power shows — every jump maximal. Trap-bar 65–80%.",
  ],
  "pc-topend-speed": [
    "One cluster = A1 heavy single → A2 stiff, reactive hop, 15–20 sec, repeat ×4.",
    "Rest 2–3 min between clusters. 2–4 clusters total.",
    "Keep ground contact short and springy on A2 — this trains joint stiffness / top-end speed.",
  ],
  "pc-peaking-basic": [
    "Light, sharp peaking cluster: A1 light jump (25–30%) → A2 max reactive jump, 15–20 sec, repeat ×4.",
    "Rest 2–3 min between clusters. Only 1–3 clusters — peaking means low volume, high quality.",
    "Use 2–4 weeks out from competition.",
  ],
  "pc-peaking-advanced": [
    "Triple cluster: A1 accel-depth jump → A2 mid-range reactive → A3 top-end/accelerated, 15–20 sec between, repeat the trio ×3.",
    "Rest 2–3 min between clusters. 2–4 clusters total.",
    "Trains three speed qualities in one block — advanced athletes only.",
  ],
  "pc-french-contrast-style": [
    "Four qualities as one cluster: A1 strength → A2 reactive → A3 light power → A4 stiffness/top-end, 15–20 sec between, repeat ×3.",
    "Rest 3–5 min between clusters (the longer rest matches the higher demand). 2–4 clusters total.",
    "The most complete — and most fatiguing — potentiation cluster.",
  ],
};

/** Display label per structure id (matches the coach structure-library labels). */
export const STRUCTURE_LABELS: Record<string, string> = {
  "french-contrast": "French Contrast",
  contrast: "Contrast",
  regular: "Regular formation",
  "supersets-lower-upper": "Lower / Upper body Supersets",
  "garcia-ramos": "Garcia-Ramos Cluster",
  moreno: "Moreno Cluster",
  hansen: "Hansen Cluster",
  "iglesias-soler": "Iglesias-Soler Cluster",
  "tufano-standard": "Tufano Cluster (Standard)",
  "tufano-cs2": "Tufano CS2 — Mechanical Stress",
  "tufano-cs4": "Tufano CS4 — Hypertrophy + Power",
  oliver: "Oliver Cluster — Metabolic Conditioning",
  "pc-acceleration": "Acceleration Focus",
  "pc-topend-speed": "Top-End Speed Focus",
  "pc-peaking-basic": "Peaking — Basic (joint)",
  "pc-peaking-advanced": "Peaking — Advanced (triple cluster)",
  "pc-french-contrast-style": "French Contrast Style (4 exercises)",
};

/** Steps for a structure id, or null. */
export function structureHowTo(id?: string | null): string[] | null {
  return id ? STRUCTURE_HOWTO[id] ?? null : null;
}

/** Display label for a structure id, or null. */
export function structureLabel(id?: string | null): string | null {
  return id ? STRUCTURE_LABELS[id] ?? null : null;
}
