/**
 * strengthProgramming/parseCoachWorkoutText
 *
 * Coaches author strength templates as free text in workout_templates.description
 * — a title, "Block N (…)" headers, "1a) Exercise — reps" lines, and "- detail"
 * bullets. When such a template is SENT to a player it should become the same
 * interactive session card the team session uses (block grouping, sets×reps,
 * the "start session" focus flow), not a read-only text dump.
 *
 * This parser turns that free text into the block structure the player Today
 * session card consumes: `[{ block, items: string[] }]`, where each item string
 * is `"Name — reps (detail · detail)"` — exactly what `parseExerciseItem`
 * (the existing, battle-tested item parser) expects. So field extraction
 * (name / sets×reps / note) is delegated to the same code the team session uses;
 * this only recovers the block/exercise/detail SHAPE the coach typed.
 *
 * Deliberately conservative: an unrecognised line never crashes and never
 * silently vanishes — a stray line becomes its own block heading, and a template
 * with no numbered exercises returns [] so the caller falls back to the plain
 * read-only render. Pure + deterministic.
 */

export type CoachWorkoutBlock = { block: string; items: string[] };

/** "1a) Bench press — 5 reps" / "2a. Shoulder press …" → an exercise line. */
const EXERCISE_RE = /^(\d+[a-z]?)[).]\s*(.+)$/i;
/** "- Velocity target: 0.75 m/s" / "• …" / "* Total: 2–4 sets" → a detail bullet. */
const DETAIL_RE = /^[-•*]\s+(.+)$/;
/** A block-level total ("Total: 2–4 sets") annotates the block, not one exercise. */
const BLOCK_TOTAL_RE = /^total\b/i;

/** Ensure a bare rep count carries a unit so the item parser can find it:
 *  "6–8 / side" → "6–8 reps / side"; "5 reps" / "3×5" / "30s" are left alone. */
function normalizeReps(reps: string): string {
  const r = reps.trim();
  if (!r) return r;
  if (/[×xX]/.test(r)) return r; // already an explicit sets×reps
  if (/\b(reps?|sett|sets?|sek|sec|s|min|mín)\b/i.test(r)) return r; // already has a unit
  if (/^\d/.test(r)) return r.replace(/^(\d+(?:\s*[–-]\s*\d+)?)/, "$1 reps");
  return r;
}

/** Split "Name — reps" on the first spaced dash; normalise the rep half. */
function normalizeExerciseHead(head: string): string {
  const m = head.match(/^(.*?)\s[—–-]\s(.+)$/);
  if (!m) return head;
  const name = m[1].trim();
  const reps = normalizeReps(m[2]);
  return `${name} — ${reps}`;
}

type Ex = { head: string; bullets: string[] };

export function parseCoachWorkoutText(text: string | null | undefined): CoachWorkoutBlock[] {
  if (!text || !text.trim()) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());

  const blocks: CoachWorkoutBlock[] = [];
  let current: { block: string } | null = null;
  let exs: Ex[] = [];
  let started = false; // have we passed the leading title line yet?

  const flush = () => {
    if (current) {
      const items = exs.map((e) => (e.bullets.length ? `${e.head} (${e.bullets.join(" · ")})` : e.head));
      if (items.length) blocks.push({ block: current.block, items });
    }
    exs = [];
  };

  for (const line of lines) {
    if (!line) continue;
    const em = line.match(EXERCISE_RE);
    const dm = line.match(DETAIL_RE);

    if (em) {
      if (!current) current = { block: "" };
      let head = em[2].trim();
      const bullets: string[] = [];
      // Pull a trailing "(2–3 sets)" off the exercise line into its details.
      const paren = head.match(/\s*\(([^)]+)\)\s*$/);
      if (paren) { bullets.push(paren[1].trim()); head = head.slice(0, paren.index).trim(); }
      exs.push({ head: normalizeExerciseHead(head), bullets });
      started = true;
    } else if (dm) {
      const detail = dm[1].trim();
      if (BLOCK_TOTAL_RE.test(detail) && current) {
        current.block = current.block ? `${current.block} · ${detail}` : detail;
      } else if (exs.length) {
        exs[exs.length - 1].bullets.push(detail);
      } else if (current) {
        current.block = current.block ? `${current.block} · ${detail}` : detail;
      }
      started = true;
    } else {
      // A plain line: the leading title (skip once), otherwise a section header.
      if (!started && !current && exs.length === 0) { started = true; continue; }
      flush();
      current = { block: line };
      started = true;
    }
  }
  flush();
  return blocks.filter((b) => b.items.length > 0);
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Convert a template's structured `structure` jsonb into the same block shape.
 * Handles both a top-level array of blocks and a `{ blocks: [...] }` wrapper,
 * with `{ title|type, exercises:[{name, sets, reps, velocity_target, vl_threshold,
 * tempo}], protocol:{exercise, sets, hold_seconds, rest_seconds} }`. Returns []
 * when there's nothing structured to read (caller then parses the free text).
 */
function structureBlocksToItems(structure: unknown): CoachWorkoutBlock[] {
  const root = asRecord(structure);
  const blockArr: unknown[] = Array.isArray(structure)
    ? structure
    : root && Array.isArray(root.blocks)
    ? (root.blocks as unknown[])
    : [];
  const out: CoachWorkoutBlock[] = [];
  for (const b of blockArr) {
    const rec = asRecord(b);
    if (!rec) continue;
    const title = str(rec.title) || str(rec.type) || "Block";
    const items: string[] = [];
    if (Array.isArray(rec.exercises)) {
      for (const e of rec.exercises) {
        const ex = asRecord(e);
        if (!ex) continue;
        const name = str(ex.name) || str(ex.exercise);
        if (!name) continue;
        const sets = str(ex.sets);
        const reps = str(ex.reps);
        const dose = sets && reps ? `${sets}×${reps}` : reps || sets;
        const notes: string[] = [];
        if (ex.velocity_target != null && Number.isFinite(Number(ex.velocity_target))) notes.push(`${ex.velocity_target} m/s`);
        if (ex.vl_threshold != null && Number.isFinite(Number(ex.vl_threshold))) notes.push(`VL ≤ ${Math.round(Number(ex.vl_threshold) * 100)}%`);
        if (str(ex.tempo)) notes.push(`tempo ${str(ex.tempo)}`);
        let s = dose ? `${name} — ${normalizeReps(dose)}` : name;
        if (notes.length) s += ` (${notes.join(" · ")})`;
        items.push(s);
      }
    }
    const protocol = asRecord(rec.protocol);
    if (protocol && str(protocol.exercise)) {
      items.push(`${str(protocol.exercise)} — ${str(protocol.sets)}×${str(protocol.hold_seconds)}s (rest ${str(protocol.rest_seconds)}s)`);
    }
    if (items.length) out.push({ block: title, items });
  }
  return out;
}

/**
 * The one entry point the player card uses: turn a coach-sent template into the
 * interactive session structure. Prefers the template's own structured blocks;
 * falls back to parsing the free-text description. Empty ⇒ nothing structured
 * to show, and the caller renders the plain read-only text instead.
 */
export function coachTemplateToBlocks(template: { description?: string | null; structure?: unknown } | null | undefined): CoachWorkoutBlock[] {
  if (!template) return [];
  const fromStructure = structureBlocksToItems(template.structure);
  if (fromStructure.length) return fromStructure;
  return parseCoachWorkoutText(template.description ?? null);
}
