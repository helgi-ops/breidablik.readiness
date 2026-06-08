/**
 * src/lib/client/sessionGrouping
 *
 * Turns a flat list of prescribed exercise rows into the structure the athlete
 * actually performs: standalone exercises vs. paired/grouped blocks (superset,
 * triset, giant set, contrast pair, french-contrast complex). Both the Today
 * card and the Log form use this so the client always knows whether an exercise
 * is done on its own or back-to-back with the next one — and how to run it.
 *
 * Grouping signal, in priority order:
 *   1. row.group           — explicit group label (A/B/C) from the assigned
 *                            template (carried through individual_training_
 *                            prescriptions.group_label).
 *   2. row.num prefix      — pt_explosive rows encode pairs as "2a"/"2b"; the
 *                            leading number is the group key.
 *   3. index               — no signal → each row is its own standalone group.
 *
 * The block "kind" (and its plain-language how-to) is derived from the exercise
 * COUNT, refined by the session method: a 4-exercise french-contrast group is a
 * complex, a 2-exercise contrast group is a contrast pair, everything else is
 * superset/triset/giant by size. Manifesto: rules decide, the label explains.
 */

export type GroupKind = "single" | "superset" | "triset" | "giant" | "contrast" | "french_contrast";

export type GroupableRow = {
  /** Explicit group label from the template (A/B/C). */
  group?: string | null;
  /** Session method carried with the row ("superset"|"contrast"|"french_contrast"|…). */
  group_method?: string | null;
  /** pt_explosive ordinal, e.g. "1", "2a", "2b". */
  num?: string | null;
};

/** The group key a row belongs to (consecutive rows sharing a key form a block). */
export function groupKeyOf(row: GroupableRow, index: number): string {
  if (row.group != null && String(row.group).trim() !== "") return `g:${row.group}`;
  if (row.num != null) {
    const m = String(row.num).match(/^(\d+)/);
    if (m) return `n:${m[1]}`;
  }
  return `i:${index}`; // standalone fallback
}

type Bil = { EN: string; IS: string };

const DESC: Record<GroupKind, { label: Bil; howto: Bil }> = {
  single: {
    label: { EN: "Standalone", IS: "Stök æfing" },
    howto: {
      EN: "Do all sets of this exercise, resting fully between sets.",
      IS: "Kláraðu öll settin af þessari æfingu með fullri hvíld á milli.",
    },
  },
  superset: {
    label: { EN: "Superset", IS: "Súpersett" },
    howto: {
      EN: "Alternate the exercises back-to-back with no rest between them; rest only after completing the pair.",
      IS: "Skiptu beint á milli æfinganna án hvíldar; hvíldu aðeins eftir að parið er klárað.",
    },
  },
  triset: {
    label: { EN: "Triset", IS: "Þrísett" },
    howto: {
      EN: "Do the three exercises in a row with no rest between them, then rest before the next round.",
      IS: "Taktu æfingarnar þrjár í röð án hvíldar á milli, svo hvíld fyrir næstu umferð.",
    },
  },
  giant: {
    label: { EN: "Giant set", IS: "Risasett" },
    howto: {
      EN: "Run through all the exercises in sequence with minimal rest, then rest before the next round.",
      IS: "Taktu allar æfingarnar í röð með lágmarkshvíld, svo hvíld fyrir næstu umferð.",
    },
  },
  contrast: {
    label: { EN: "Contrast pair", IS: "Contrast-par" },
    howto: {
      EN: "Heavy lift first, then straight into the explosive move (a short ~20s pause). Rest fully after the pair.",
      IS: "Þung lyfta fyrst, svo beint í sprengikraftsæfinguna (stutt ~20s pása). Full hvíld eftir parið.",
    },
  },
  french_contrast: {
    label: { EN: "French contrast complex", IS: "French contrast complex" },
    howto: {
      EN: "Run the complex in order — heavy → plyometric → ballistic → assisted — with only a short pause between each. Full rest after the complex.",
      IS: "Taktu complexið í röð — þungt → plyo → ballískt → assisted — með aðeins stuttri pásu á milli. Full hvíld eftir complexið.",
    },
  },
};

/** Classify a block by its exercise count, refined by the session method. */
export function describeGroup(count: number, method?: string | null): { kind: GroupKind; label: Bil; howto: Bil } {
  const m = (method ?? "").toLowerCase();
  let kind: GroupKind;
  if (count <= 1) kind = "single";
  else if (count >= 4 && m.includes("french")) kind = "french_contrast";
  else if (count === 2 && m.includes("contrast")) kind = "contrast";
  else if (count === 2) kind = "superset";
  else if (count === 3) kind = "triset";
  else kind = "giant";
  return { kind, ...DESC[kind] };
}

export type SessionBlock<R extends GroupableRow = GroupableRow> = {
  key: string;
  kind: GroupKind;
  label: Bil;
  howto: Bil;
  /** Display letter for the block (A, B, C…). */
  tag: string;
  rows: R[];
};

/** Cluster an ordered row list into performed blocks with classification. */
export function buildSessionBlocks<R extends GroupableRow>(rows: R[]): SessionBlock<R>[] {
  const blocks: SessionBlock<R>[] = [];
  let curKey: string | null = null;
  let cur: R[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const method = cur.find((r) => r.group_method)?.group_method ?? null;
    const { kind, label, howto } = describeGroup(cur.length, method);
    const tag = String.fromCharCode(65 + blocks.length); // A, B, C…
    blocks.push({ key: curKey as string, kind, label, howto, tag, rows: cur });
    cur = [];
  };
  rows.forEach((r, i) => {
    const k = groupKeyOf(r, i);
    if (k !== curKey) { flush(); curKey = k; }
    cur.push(r);
  });
  flush();
  return blocks;
}
