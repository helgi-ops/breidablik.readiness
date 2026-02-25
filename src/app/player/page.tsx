"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { flagUi, normalizeFlag, type Flag } from "@/lib/flagUi";

type ProfileRow = {
  id: string;
  display_name: string | null;
  player_id: string | null;
  role: string | null;
  team_id?: string | null;
};

type PlayerRow = {
  id: string;
  full_name: string | null;
  position: string | null;
  team: string | null;
};

type MetricsRow =
  | {
      readiness: number | null;
      sleep: number | null;
      soreness: number | null;
      total_score: number | null;
      created_at: string | null;
    }
  | null;

type GenericMsg =
  | {
      title?: string | null;
      message: string;
      why?: string | null;
    }
  | null;

// ✅ Stage-4 decision row (normalized for UI)
type Stage4PlanRow =
  | {
      decision_id: string | null;
      team_id: string | null;
      player_id: string;
      entry_date: string; // date
      md_day: string | null;
      readiness_level: string | null; // GREEN / GREEN_PLUS / YELLOW / RED
      chosen_variant_id: string | null;
      locked: boolean | null;
      source: string | null; // SYSTEM / COACH_OVERRIDE / RESOLVED_VIEW
      confidence: number | null;
      why: string | null;
      inputs: any; // jsonb

      // ✅ NEW: training system label from resolved view
      training_system: string | null;

      // plan + optional variant meta (variant should not be shown to players)
      variant: string | null; // A/B/C (staff/debug only)
      title: string | null;
      description: string | null;
      structure: any; // jsonb array
    }
  | null;

type DecisionRow =
  | {
      planned_focus: string | null;
      final_planned_day_type: string | null;
      recommended_day_type: string | null;
      readiness_flag: string | null;
    }
  | null;

type PlayerSessionTodayRow =
  | {
      player_id: string;
      team_id: string | null;
      day_date: string; // date
      planned_focus: string | null;
      readiness_flag: string | null;
      session_type: string | null;
      md_day_resolved: string | null;
    }
  | null;

// ============================
// ✅ Post-training types (DB)
// ============================
type PostTrainingRuleRow = {
  id: string;
  priority: number;
  is_active: boolean;
  when_clause: any; // jsonb
  then_clause: any; // jsonb
};

type PostTrainingTemplateRow = {
  id: string;
  title: string;
  duration_min: number;
  tags: string[];
  structure: any; // jsonb
  is_active: boolean;
};

// ============================
// ✅ Fix modules (from check-in notes)
// ============================
type FixModule = {
  tag: string;
  title: string;
  structure: any; // jsonb
};

type FixRow = {
  player_id: string;
  checkin_id: string;
  created_at: string;
  fix_modules: FixModule[];
};

// ============================
// ✅ Stage-4 audit: overrides
// ============================
type MicrodoseOverrideRow = {
  id: string;
  decision_id: string;
  coach_profile_id: string | null;
  overrode_to_readiness_level: string | null;
  override_to_variant_id: string | null;
  reason_code: string | null;
  reason_test: string | null;
  risk_level: string | null;
  created_at: string;
};

type VariantOption = { id: string; variant: string; title: string | null; description: string | null };

// ✅ Dedupe helper
function dedupeFixModulesByTag(input: FixModule[] | null | undefined): FixModule[] {
  const list = Array.isArray(input) ? input : [];
  const map = new Map<string, FixModule>();
  for (const m of list) {
    const tag = (m?.tag ?? "").trim();
    if (!tag) continue;
    if (!map.has(tag)) map.set(tag, m);
  }
  return Array.from(map.values());
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * ✅ IMPORTANT: never allow "" / "\"\"" / junk to reach Postgres date columns
 */
function sanitizeDay(input: string | null | undefined) {
  const raw0 = String(input ?? "").trim();
  const noSlashes = raw0.replace(/\\/g, "");
  const noQuotes = noSlashes.replace(/"/g, "");
  const cleaned = noQuotes.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return todayISO();
}

function norm(x: string | null | undefined) {
  return (x ?? "").trim().toUpperCase();
}

function isStaffRole(role: string | null | undefined) {
  const r = norm(role);
  return r === "COACH" || r === "ADMIN" || r === "STAFF";
}

function readinessToFlag(level: string | null | undefined): Flag {
  const l = norm(level);
  if (l === "RED") return "RED";
  if (l === "YELLOW") return "YELLOW";
  return "GREEN";
}

type DecisionType = "FULL" | "REDUCED" | "RECOVERY";

function inferDecisionType(decision: DecisionRow, _plan: Stage4PlanRow): DecisionType {
  const dt = norm(decision?.recommended_day_type || decision?.final_planned_day_type);
  if (dt.includes("OFF") || dt.includes("REST") || dt.includes("RECOVER")) return "RECOVERY";
  if (dt.includes("MOD") || dt.includes("REDUCED") || dt.includes("LIGHT")) return "REDUCED";
  return "FULL";
}

function mdContextLabel(mdDay: string | null | undefined) {
  const md = norm(mdDay);
  return md ? md : "—";
}

type SessionLoad = "LOW" | "MODERATE" | "HIGH" | null;

type PostTrainingContext = {
  mdDay: string | null;
  sessionLoad: SessionLoad;
  sprintExposure: boolean;
  matchLike: boolean;
};

function matchesWhenClause(ctx: PostTrainingContext, whenClause: any): boolean {
  if (!whenClause || typeof whenClause !== "object") return false;

  if (Array.isArray(whenClause.md_day_in)) {
    if (!ctx.mdDay) return false;
    return whenClause.md_day_in.includes(ctx.mdDay);
  }

  if (Array.isArray(whenClause.or)) {
    return whenClause.or.some((cond: any) => matchesWhenClause(ctx, cond));
  }

  if (typeof whenClause.session_load === "string") return ctx.sessionLoad === whenClause.session_load;
  if (typeof whenClause.sprint_exposure === "boolean") return ctx.sprintExposure === whenClause.sprint_exposure;
  if (typeof whenClause.match_like === "boolean") return ctx.matchLike === whenClause.match_like;

  return false;
}

// ✅ Rotation pool (endur-notar MD templates) — EKKI tendon
const DAILY_ROTATION_POOL = ["md1_priming", "md2_maintenance", "md3_speed_reset", "md4_neural_reset"] as const;

function pickDailyFromMdDay(mdDay: string | null): string {
  const md = String(mdDay ?? "").toUpperCase();

  if (md === "MD-1") return "md1_priming";
  if (md === "MD-2") return "md2_maintenance";
  if (md === "MD-3") return "md3_speed_reset";
  if (md === "MD-4") return "md4_neural_reset";

  // POST / MD+1 / MD+2 mapping (breyttu ef þú vilt)
  if (md === "POST") return "md4_neural_reset";
  if (md === "MD+1") return "md2_maintenance";
  if (md === "MD+2") return "md3_speed_reset";

  return DAILY_ROTATION_POOL[0];
}

function evaluatePostTrainingTemplateIds(
  ctx: PostTrainingContext,
  rules: PostTrainingRuleRow[],
  alwaysInclude: string[] = [] // <-- ✅ ekki hardcode daily hér
): string[] {
  const out: string[] = [];

  // ✅ Daily rotation (endur-notar md1_/md2_/md3_/md4_)
  out.push(pickDailyFromMdDay(ctx.mdDay));

  // ✅ Aðrar alwaysInclude (ef þú vilt)
  for (const id of alwaysInclude) if (!out.includes(id)) out.push(id);

  const sorted = [...rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const r of sorted) {
    if (!r?.is_active) continue;
    if (!matchesWhenClause(ctx, r.when_clause)) continue;

    const append: string[] = Array.isArray(r?.then_clause?.append) ? r.then_clause.append : [];
    for (const id of append) if (!out.includes(id)) out.push(id);
  }

  return out;
}

function inferMatchLike(sessionTypeRaw: string | null | undefined) {
  const s = norm(sessionTypeRaw);
  return s.includes("MATCH") || s.includes("LEIKUR") || s.includes("GAME");
}

function inferSprintExposure(sessionTypeRaw: string | null | undefined) {
  const s = norm(sessionTypeRaw);
  return s.includes("SPRINT") || s.includes("SPEED") || s.includes("HSS");
}

/* -------------------------
   UI helpers
------------------------- */

function BadgePill({ children, className = "" }: { children: any; className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-800 " + className
      }
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function safeStringList(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v));
  return [];
}

/** =========
 *  Block accents (NEUTRAL / GRÁTT fyrir player)
 *  ========= */
function blockAccent(titleRaw: string) {
  const t = (titleRaw ?? "").toLowerCase();

  // Halda merkingu (label) en ekki litum
  let label = "Partur";

  if (t.includes("warm") || t.includes("upphit") || t.startsWith("0.")) label = "Upphitun";
  else if (t.includes("primer") || t.includes("ballistic") || t.includes("explosive") || t.startsWith("a.")) label = "Primer";
  else if (t.includes("contrast") || t.includes("strength") || t.startsWith("b.")) label = "Main";
  else if (t.includes("iso") || t.includes("isometric") || t.startsWith("c.")) label = "Accessory";

  return {
    // ✅ Allt neutral / grátt
    wrap: "border-zinc-200 bg-zinc-50/60",
    badge: "bg-zinc-50 text-zinc-700 border-zinc-200",
    dot: "bg-zinc-400",
    label,
  };
}

function renderStructureBlocks(
  structure: any,
  opts?: { headerTitle?: string | null; headerDesc?: string | null; lockLabel?: string }
) {
  const blocks = Array.isArray(structure) ? structure : [];
  if (!blocks.length) return null;

  const headerTitle = String(opts?.headerTitle ?? "").trim();
  const headerDesc = String(opts?.headerDesc ?? "").trim();
  const lockLabel = opts?.lockLabel ?? "";

  return (
    <div className="mt-6">
      {/* Header (halda GRÆNA punktinum) */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Æfing dagsins</div>
            <div className="mt-2 flex items-center gap-2">
              {/* ✅ EKKI taka græna punktinn */}
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div className="truncate text-base font-semibold text-zinc-900">{headerTitle || "Æfing dagsins"}</div>
            </div>
            {headerDesc ? <div className="mt-1 text-sm text-zinc-600">{headerDesc}</div> : null}
          </div>

          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Staða</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{lockLabel || "—"}</div>
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className="mt-3 space-y-3">
        {blocks.map((b: any, idx: number) => {
          const title = String(b?.block ?? `Block ${idx + 1}`);
          const items = safeStringList(b?.items);
          const accent = blockAccent(title);

          return (
            // ✅ Fjarlægjum border-l-4 lit, allt verður grátt
            <div key={`${title}-${idx}`} className={`rounded-2xl border p-4 ${accent.wrap}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
                    <div className="text-sm font-semibold text-zinc-900">{title}</div>
                  </div>
                </div>

                <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${accent.badge}`}>
                  {accent.label}
                </span>
              </div>

              {items.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
                  {items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-zinc-600">Engin atriði í þessum hluta.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderFixModules(mods: FixModule[]) {
  return (
    <div className="mt-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ráðlagðar æfingar</div>

      {!mods.length ? (
        <div className="mt-2 rounded-2xl border bg-white p-4 text-sm text-zinc-600">Engar ráðlagðar æfingar í dag.</div>
      ) : (
        <div className="mt-3 space-y-3">
          {mods.map((m, idx) => {
            const steps = Array.isArray(m?.structure) ? m.structure : [];
            return (
              <div key={`${m.tag}-${idx}`} className="rounded-2xl border bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">{m.title || m.tag}</div>
                {!!m.tag && <div className="mt-1 text-xs font-medium text-zinc-500">{m.tag}</div>}

                {!!steps.length ? (
                  <div className="mt-3 space-y-2">
                    {steps.map((s: any, i: number) => {
                      const st = String(s?.title ?? s?.type ?? `Skref ${i + 1}`);
                      const cues = safeStringList(s?.cues);
                      return (
                        <div key={i} className="rounded-xl border bg-zinc-50 p-3">
                          <div className="text-sm font-semibold text-zinc-900">{st}</div>
                          {!!cues.length && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                              {cues.map((c, ci) => (
                                <li key={ci}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-zinc-600">Engin structure gögn.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** =========
 *  ✅ Post-training accents (ALLT GRÁTT / NEUTRAL)
 *  ========= */
function postTrainingAccent(_templateId: string, _tags: string[]) {
  return {
    wrap: "border-zinc-200 bg-zinc-50/60",
    chip: "bg-zinc-50 text-zinc-700 border-zinc-200",
  };
}

/** =========
 *  ✅ Post-training structure parser
 *  - styður: {sections:[{steps:[...]}]}, {blocks:[{items:[...]}]}, {steps:[...]}, array
 *  - ✅ NÝTT: ef steps eru string lines -> umbreyta í "exercises" (nafn + instructions)
 *  ========= */
type PTExercise = {
  name: string;
  instructions: string[];
  timeSec: number | null;
};

type PTSection = {
  title: string | null;
  exercises: PTExercise[];
  note?: string | null; // t.d. "Rule: ..."
};

function toStringList(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v));
  if (typeof x === "string" && x.trim()) return [x.trim()];
  return [];
}

function normalizePTExerciseFromObject(s: any, fallbackIndex: number): PTExercise {
  const title = String(s?.title ?? s?.type ?? s?.name ?? `Skref ${fallbackIndex + 1}`);
  const cues = toStringList(s?.cues ?? s?.items ?? s?.notes);
  const timeSecRaw = s?.time_sec != null ? Number(s.time_sec) : null;

  return {
    name: title,
    instructions: cues,
    timeSec: Number.isFinite(timeSecRaw as any) ? (timeSecRaw as number) : null,
  };
}

function isRuleLine(line: string) {
  const t = (line ?? "").trim().toLowerCase();
  return t.startsWith("rule:") || t.startsWith("regla:") || t.startsWith("ath:") || t.startsWith("note:");
}

/**
 * ✅ Parse string-steps (MET style):
 * - Lína með ":" byrjar nýja æfingu (left = name, right = fyrsta instruction)
 * - Ef engin ":" og engin current -> setur nýja æfingu með name=line
 * - Ef engin ":" og current -> line fer í instructions
 * - "Rule:" fer í section.note (ekki sem æfing)
 */
function parseStringStepsToExercises(lines: string[]): { exercises: PTExercise[]; note: string | null } {
  const exercises: PTExercise[] = [];
  let note: string | null = null;

  let current: PTExercise | null = null;

  for (const raw of lines) {
    const line = String(raw ?? "").trim();
    if (!line) continue;

    if (isRuleLine(line)) {
      // ✅ safna í note (taka "Rule:" prefix af ef þú vilt)
      note = note ? `${note} ${line}` : line;
      continue;
    }

    // Heuristic: "Hip MET: ..." -> name + instruction
    const hasColon = line.includes(":");
    if (hasColon) {
      const [left0, ...rest] = line.split(":");
      const left = String(left0 ?? "").trim();
      const right = rest.join(":").trim();

      current = {
        name: left || `Æfing ${exercises.length + 1}`,
        instructions: [],
        timeSec: null,
      };

      if (right) current.instructions.push(right);

      exercises.push(current);
      continue;
    }

    // No colon:
    if (!current) {
      current = { name: line, instructions: [], timeSec: null };
      exercises.push(current);
      continue;
    }

    current.instructions.push(line);
  }

  return { exercises, note };
}

function extractPostTrainingSections(structure: any): PTSection[] {
  if (!structure) return [];

  // ✅ Algengast: { sections: [ { title?, steps: [...] } ] }
  if (typeof structure === "object" && Array.isArray((structure as any).sections)) {
    const secs: PTSection[] = (structure as any).sections.map((sec: any, si: number) => {
      const secTitleRaw = sec?.title ?? sec?.name ?? sec?.block ?? null;
      const secTitle = secTitleRaw != null ? String(secTitleRaw) : null;

      const rawSteps = Array.isArray(sec?.steps) ? sec.steps : [];

      // ✅ Ef þetta er string-listi -> parse í exercises (MET fix)
      const allStrings = rawSteps.length > 0 && rawSteps.every((x: any) => typeof x === "string");
      if (allStrings) {
        const { exercises, note } = parseStringStepsToExercises(rawSteps.map((x: any) => String(x)));
        return {
          title: secTitle || ((structure as any).sections.length > 1 ? `Hluti ${si + 1}` : null),
          exercises,
          note,
        };
      }

      // ✅ Annars: object steps -> map í exercises (name + instructions)
      const exercises = rawSteps.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));

      return {
        title: secTitle || ((structure as any).sections.length > 1 ? `Hluti ${si + 1}` : null),
        exercises,
        note: null,
      };
    });

    return secs.filter((s) => s.exercises.length);
  }

  // ✅ Stundum: { blocks: [ { name/block?, items: [...] } ] }
  if (typeof structure === "object" && Array.isArray((structure as any).blocks)) {
    const secs: PTSection[] = (structure as any).blocks.map((b: any, bi: number) => {
      const secTitleRaw = b?.name ?? b?.title ?? b?.block ?? null;
      const secTitle = secTitleRaw != null ? String(secTitleRaw) : null;

      const raw = Array.isArray(b?.steps) ? b.steps : Array.isArray(b?.items) ? b.items : [];

      const allStrings = raw.length > 0 && raw.every((x: any) => typeof x === "string");
      if (allStrings) {
        const { exercises, note } = parseStringStepsToExercises(raw.map((x: any) => String(x)));
        return {
          title: secTitle || ((structure as any).blocks.length > 1 ? `Hluti ${bi + 1}` : null),
          exercises,
          note,
        };
      }

      const exercises = raw.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
      return {
        title: secTitle || ((structure as any).blocks.length > 1 ? `Hluti ${bi + 1}` : null),
        exercises,
        note: null,
      };
    });

    return secs.filter((s) => s.exercises.length);
  }

  // ✅ Eldra/annað: { steps: [...] }
  if (typeof structure === "object" && Array.isArray((structure as any).steps)) {
    const raw = (structure as any).steps;

    const allStrings = raw.length > 0 && raw.every((x: any) => typeof x === "string");
    if (allStrings) {
      const { exercises, note } = parseStringStepsToExercises(raw.map((x: any) => String(x)));
      return exercises.length ? [{ title: null, exercises, note }] : [];
    }

    const exercises = raw.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
    return exercises.length ? [{ title: null, exercises, note: null }] : [];
  }

  // ✅ Ef structure er bein array
  if (Array.isArray(structure)) {
    const allStrings = structure.length > 0 && structure.every((x: any) => typeof x === "string");
    if (allStrings) {
      const { exercises, note } = parseStringStepsToExercises(structure.map((x: any) => String(x)));
      return exercises.length ? [{ title: null, exercises, note }] : [];
    }

    const exercises = structure.map((x: any, i: number) => normalizePTExerciseFromObject(x, i));
    return exercises.length ? [{ title: null, exercises, note: null }] : [];
  }

  return [];
}

/** =========
 *  ✅ Render post-training (ALLT GRÁTT / NEUTRAL)
 *  ✅ NÝTT: Æfingaheiti númerað, instructions sem plain text (ENGIN bullets / engin numbering)
 *  ========= */
function renderPostTraining(templates: PostTrainingTemplateRow[]) {
  const count = templates.length;

  function isTendonTemplate(t: PostTrainingTemplateRow) {
    const id = (t?.id ?? "").toLowerCase();
    const tags = (t?.tags ?? []).map((x) => String(x).toLowerCase());
    return id.includes("tendon") || tags.includes("tendon_health") || tags.includes("achilles") || tags.includes("patellar");
  }

  function isDailyMdTemplate(t: PostTrainingTemplateRow) {
    const id = (t?.id ?? "").toLowerCase();
    return id.startsWith("md1_") || id.startsWith("md2_") || id.startsWith("md3_") || id.startsWith("md4_");
  }

  // ✅ Röðun: Tendon fyrst, svo Daily (Neural Priming o.fl.), svo rest
  const orderedTemplates = [...templates].sort((a, b) => {
    const ra = isTendonTemplate(a) ? 0 : isDailyMdTemplate(a) ? 1 : 2;
    const rb = isTendonTemplate(b) ? 0 : isDailyMdTemplate(b) ? 1 : 2;
    return ra - rb;
  });

  return (
    <div className="mt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Eftir æfingu — mælt með</div>
          <div className="mt-1 text-sm text-zinc-600">5–10 mínútur til að styðja sinar og taugakerfi eftir æfingu.</div>
        </div>
        <div className="text-xs font-semibold text-zinc-500">{count ? `${count} rútín${count === 1 ? "a" : "ur"}` : ""}</div>
      </div>

      {!orderedTemplates.length ? (
        <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Engar tillögur í dag.</div>
      ) : (
        // ✅ Einn dálkur (tendon ofan á neural priming)
        <div className="mt-3 grid grid-cols-1 gap-3">
          {orderedTemplates.map((t) => {
            const accent = postTrainingAccent(t.id, t.tags ?? []);
            const sections = extractPostTrainingSections(t?.structure);
            const totalExercises = sections.reduce((acc, s) => acc + s.exercises.length, 0);

            let n = 0;

            return (
              <div key={t.id} className={`rounded-2xl border p-4 ${accent.wrap}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{t.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">{t.duration_min ? `${t.duration_min} mín` : ""}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {(t.tags ?? []).slice(0, 4).map((tag) => (
                      <span key={tag} className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${accent.chip}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {totalExercises ? (
                  <div className="mt-3 space-y-3">
                    {sections.map((sec, si) => (
                      <div key={si} className="space-y-2">
                        {sec.title ? (
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{sec.title}</div>
                        ) : null}

                        {/* ✅ Section note (t.d. Rule: ...) */}
                        {sec.note ? <div className="text-sm text-zinc-600">{sec.note}</div> : null}

                        {sec.exercises.map((ex, i) => {
                          n += 1;
                          return (
                            <div key={`${si}-${i}`} className="rounded-xl border border-zinc-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm font-semibold text-zinc-900">
                                  {n}. {ex.name}
                                </div>
                                {ex.timeSec ? <div className="text-xs font-semibold text-zinc-500">{ex.timeSec}s</div> : null}
                              </div>

                              {!!ex.instructions.length && (
                                <div className="mt-2 space-y-1">
                                  {ex.instructions.map((line, li) => (
                                    <p key={li} className="text-sm text-zinc-700">
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-zinc-600">Engin skref í template.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PlayerPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const searchParams = useSearchParams();

  // ✅ One source-of-truth day for all queries (supports ?date=YYYY-MM-DD)
  const day = useMemo(() => {
    const raw = searchParams?.get("date");
    return sanitizeDay(raw || null);
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

  const [playerMeta, setPlayerMeta] = useState<PlayerRow | null>(null);

  const [plan, setPlan] = useState<Stage4PlanRow>(null);
  const [planIsFallback, setPlanIsFallback] = useState(false);

  const [metrics, setMetrics] = useState<MetricsRow>(null);

  const [decision, setDecision] = useState<DecisionRow>(null);
  const [session, setSession] = useState<PlayerSessionTodayRow>(null);

  const [genericMsg, setGenericMsg] = useState<GenericMsg>(null);

  const [postTraining, setPostTraining] = useState<PostTrainingTemplateRow[]>([]);
  const [postTrainingErr, setPostTrainingErr] = useState<string>("");

  const [fixRow, setFixRow] = useState<FixRow | null>(null);
  const [fixErr, setFixErr] = useState<string>("");

  const staffMode = useMemo(() => isStaffRole(profile?.role), [profile?.role]);

  // override state (you can keep this, even if you don’t show UI yet)
  const [overrideAudit, setOverrideAudit] = useState<MicrodoseOverrideRow[]>([]);
  const [overrideAuditErr, setOverrideAuditErr] = useState<string>("");

  const fixModules = useMemo(() => dedupeFixModulesByTag(fixRow?.fix_modules), [fixRow?.fix_modules]);

  async function ensureStage4Decision(playerId: string, dayInput: string) {
    const safeDay = sanitizeDay(dayInput);
    try {
      const { error } = await supabase.rpc("stage4_ensure_decision", {
        p_player_id: playerId,
        p_entry_date: safeDay,
      });

      // ✅ This must NEVER blank the UI. Only log.
      if (error) console.error("stage4_ensure_decision failed:", error);
    } catch (e: any) {
      console.error("stage4_ensure_decision unexpected error:", e?.message ?? e);
    }
  }

  async function loadGenericMessage(teamId: string | null, flag: Flag) {
    if (teamId) {
      const { data: teamMsg } = await supabase
        .from("player_flag_messages")
        .select("title, message, why")
        .eq("team_id", teamId)
        .eq("flag", flag)
        .eq("lang", "is")
        .eq("is_active", true)
        .maybeSingle();

      if (teamMsg?.message) return teamMsg as any;
    }

    const { data: globalMsg } = await supabase
      .from("player_flag_messages")
      .select("title, message, why")
      .is("team_id", null)
      .eq("flag", flag)
      .eq("lang", "is")
      .eq("is_active", true)
      .maybeSingle();

    return (globalMsg as any) ?? null;
  }

  async function loadOverrideAudit(decisionId: string) {
    try {
      setOverrideAuditErr("");

      const { data, error } = await supabase
        .from("microdose_overrides")
        .select(
          "id, decision_id, coach_profile_id, overrode_to_readiness_level, override_to_variant_id, reason_code, reason_test, risk_level, created_at"
        )
        .eq("decision_id", decisionId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw new Error(error.message);

      setOverrideAudit(((data as any) ?? []) as MicrodoseOverrideRow[]);
    } catch (e: any) {
      console.error("override audit load error:", e?.message ?? e);
      setOverrideAuditErr(e?.message ?? "Villa við að sækja override audit.");
      setOverrideAudit([]);
    }
  }

  async function fetchStage4Plan(playerId: string, dayInput: string) {
    const safeDay = sanitizeDay(dayInput);

    const { data: resolved, error: rErr } = await supabase
      .from("v_player_today_microdose_resolved")
      .select(
        [
          "player_id",
          "entry_date",
          "md_day_raw",
          "planned_focus",
          "final_planned_day_type",
          "readiness_flag",
          "md_day_resolved",
          "readiness_resolved",
          "training_system",

          "decision_id",
          "team_id",
          "chosen_variant_id",
          "locked",
          "source",
          "confidence",
          "why",
          "inputs",

          // plan + optional variant meta
          "variant_id",
          "variant",
          "plan_title",
          "plan_description",
          "plan_structure",

          // keep for compatibility (do not display to player)
          "locked_at",
          "is_locked",
        ].join(",")
      )
      .eq("player_id", playerId)
      .eq("entry_date", safeDay)
      .maybeSingle();

    if (rErr) {
      console.error("v_player_today_microdose_resolved error:", rErr);
      throw new Error(rErr.message);
    }

    if (resolved) {
      setPlanIsFallback(false);

      const merged: any = {
        decision_id: (resolved as any).decision_id ?? null,
        team_id: (resolved as any).team_id ?? null,
        player_id: (resolved as any).player_id,
        entry_date: (resolved as any).entry_date,
        md_day: (resolved as any).md_day_resolved ?? (resolved as any).md_day_raw ?? null,
        readiness_level: (resolved as any).readiness_resolved ?? (resolved as any).readiness_flag ?? null,

        chosen_variant_id: (resolved as any).chosen_variant_id ?? null,
        locked: (resolved as any).locked ?? (resolved as any).is_locked ?? null,
        source: (resolved as any).source ?? "RESOLVED_VIEW",
        confidence: (resolved as any).confidence ?? null,
        why: (resolved as any).why ?? null,
        inputs: (resolved as any).inputs ?? null,

        training_system: (resolved as any).training_system ?? null,

        variant: (resolved as any).variant ?? null,
        title: (resolved as any).plan_title ?? null,
        description: (resolved as any).plan_description ?? null,
        structure: (resolved as any).plan_structure ?? null,
      };

      return merged as Stage4PlanRow;
    }

    // fallback (latest <= day)
    const { data: drow, error: dErr } = await supabase
      .from("microdose_decisions")
      .select("id, team_id, player_id, entry_date, md_day, readiness_level, chosen_variant_id, locked, source, confidence, why, inputs")
      .eq("player_id", playerId)
      .lte("entry_date", safeDay)
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dErr) {
      console.error("microdose_decisions fallback error:", dErr);
      throw new Error(dErr.message);
    }

    if (!drow?.id) {
      setPlanIsFallback(false);
      return null;
    }

    // ✅ IMPORTANT: fallback now uses microdose_templates (NOT variants)
    const teamId = (drow as any)?.team_id ?? null;
    const mdDay = (drow as any)?.md_day ?? null;
    const lvl = (drow as any)?.readiness_level ?? null;

    let templateRow: any = null;

    if (teamId && mdDay && lvl) {
      const { data: tr, error: trErr } = await supabase
        .from("microdose_templates")
        .select("id, title, description, structure")
        .eq("team_id", teamId)
        .eq("md_day", mdDay)
        .eq("readiness_level", lvl)
        .maybeSingle();

      if (trErr) {
        console.error("microdose_templates fallback error:", trErr);
        throw new Error(trErr.message);
      }
      templateRow = tr ?? null;
    }

    setPlanIsFallback((drow as any)?.entry_date !== safeDay);

    const merged: any = {
      decision_id: (drow as any).id ?? null,
      team_id: (drow as any).team_id ?? null,
      player_id: (drow as any).player_id,
      entry_date: (drow as any).entry_date,
      md_day: (drow as any).md_day ?? null,
      readiness_level: (drow as any).readiness_level ?? null,
      chosen_variant_id: (drow as any).chosen_variant_id ?? null,
      locked: (drow as any).locked ?? null,
      source: (drow as any).source ?? null,
      confidence: (drow as any).confidence ?? null,
      why: (drow as any).why ?? null,
      inputs: (drow as any).inputs ?? null,

      training_system: null,

      variant: null,

      title: templateRow?.title ?? null,
      description: templateRow?.description ?? null,
      structure: templateRow?.structure ?? null,
    };

    return merged as Stage4PlanRow;
  }

  async function loadPostTrainingRecommendations(ctx: PostTrainingContext) {
    try {
      setPostTrainingErr("");

      const { data: rules, error: rErr } = await supabase
        .from("post_training_rules")
        .select("id, priority, is_active, when_clause, then_clause")
        .eq("is_active", true);

      if (rErr) throw new Error(rErr.message);

      const ruleRows = ((rules as any) ?? []) as PostTrainingRuleRow[];

      // ✅ IMPORTANT: daily er nú valið inni í evaluatePostTrainingTemplateIds (rotation)
      const ids = evaluatePostTrainingTemplateIds(ctx, ruleRows);

      if (!ids.length) {
        setPostTraining([]);
        return;
      }

      const { data: tmpls, error: tErr } = await supabase
        .from("post_training_templates")
        .select("id, title, duration_min, tags, structure, is_active")
        .in("id", ids)
        .eq("is_active", true);

      if (tErr) throw new Error(tErr.message);

      const list = ((tmpls as any) ?? []) as PostTrainingTemplateRow[];
      const map = new Map(list.map((t) => [t.id, t]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as PostTrainingTemplateRow[];

      setPostTraining(ordered);
    } catch (e: any) {
      console.error("post-training load error:", e?.message ?? e);
      setPostTrainingErr(e?.message ?? "Villa við að sækja post-training tillögur.");
      setPostTraining([]);
    }
  }

  async function loadFixModulesForPlayer(playerId: string) {
    try {
      setFixErr("");

      const { data, error: fErr } = await supabase
        .from("v_player_fix_modules_latest")
        .select("player_id, checkin_id, created_at, fix_modules")
        .eq("player_id", playerId)
        .maybeSingle();

      if (fErr) throw new Error(fErr.message);

      setFixRow((data as any) ?? null);
    } catch (e: any) {
      console.error("fix modules load error:", e?.message ?? e);
      setFixErr(e?.message ?? "Villa við að sækja ráðlagðar æfingar.");
      setFixRow(null);
    }
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      setPlan(null);
      setPlanIsFallback(false);
      setMetrics(null);
      setGenericMsg(null);
      setPlayerMeta(null);
      setDecision(null);
      setSession(null);
      setPostTraining([]);
      setPostTrainingErr("");
      setFixRow(null);
      setFixErr("");
      setOverrideAudit([]);
      setOverrideAuditErr("");

      try {
        const { data: auth, error: aErr } = await supabase.auth.getUser();
        if (aErr) throw new Error(aErr.message);

        const userId = auth?.user?.id;
        if (!userId) throw new Error("Ekki innskráður.");

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, player_id, role, team_id")
          .eq("id", userId)
          .maybeSingle();

        if (pErr) throw new Error(pErr.message);

        setProfile((prof as any) ?? null);

        if (!prof?.player_id) {
          const { data: list, error: lErr } = await supabase
            .from("players")
            .select("id, full_name, position, team")
            .order("full_name", { ascending: true });

          if (lErr) throw new Error(lErr.message);

          setPlayers((list as PlayerRow[]) ?? []);
          return;
        }

        const safeDay = sanitizeDay(day);

        // ✅ try ensure, but never block UI
        await ensureStage4Decision(prof.player_id, safeDay);

        const { data: pm, error: pmErr } = await supabase
          .from("players")
          .select("id, full_name, position, team")
          .eq("id", prof.player_id)
          .maybeSingle();

        if (pmErr) console.error("players meta error:", pmErr.message);
        setPlayerMeta((pm as any) ?? null);

        const { data: drow, error: dErr } = await supabase
          .from("v_player_daily_decision_v3")
          .select("planned_focus, final_planned_day_type, recommended_day_type, readiness_flag")
          .eq("player_id", prof.player_id)
          .eq("day_date", safeDay)
          .maybeSingle();

        if (dErr) console.error("decision error:", dErr.message);
        setDecision((drow as any) ?? null);

        const { data: srow, error: sErr } = await supabase
          .from("v_player_session_today_v2")
          .select("player_id,team_id,day_date,planned_focus,readiness_flag,session_type,md_day_resolved")
          .eq("player_id", prof.player_id)
          .eq("day_date", safeDay)
          .maybeSingle();

        if (sErr) console.error("v_player_session_today_v2 error:", sErr.message);
        setSession((srow as any) ?? null);

        const p = await fetchStage4Plan(prof.player_id, safeDay);
        setPlan((p as any) ?? null);

        if (isStaffRole(prof?.role)) {
          const did = (p as any)?.decision_id ?? null;
          if (did) await loadOverrideAudit(String(did));
        }

        const { data: mrow, error: mErr } = await supabase
          .from("readiness_entries")
          .select("readiness, sleep, soreness, total_score, created_at")
          .eq("player_id", prof.player_id)
          .eq("entry_date", safeDay)
          .maybeSingle();

        if (mErr) console.error("readiness_entries metrics error:", mErr.message);
        setMetrics((mrow as any) ?? null);

        await loadFixModulesForPlayer(prof.player_id);
      } catch (e: any) {
        console.error("PlayerPage load error:", e);
        setError(e?.message ?? "Óþekkt villa.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [supabase, day]);

  const flag: Flag = useMemo(() => readinessToFlag(plan?.readiness_level), [plan?.readiness_level]);
  const ui = useMemo(() => flagUi(normalizeFlag(flag)), [flag]);

  useEffect(() => {
    const run = async () => {
      if (!profile) return;
      const teamId = (profile as any)?.team_id ?? null;
      const msg = await loadGenericMessage(teamId, flag);
      setGenericMsg(msg);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, flag]);

  useEffect(() => {
    const run = async () => {
      if (!plan) return;

      const mdDay = norm(plan.md_day || session?.md_day_resolved || null);
      const sprintExposure = inferSprintExposure(session?.session_type ?? null);
      const matchLike = inferMatchLike(session?.session_type ?? null);

      const ctx: PostTrainingContext = {
        mdDay: mdDay || null,
        sessionLoad: null,
        sprintExposure,
        matchLike,
      };

      await loadPostTrainingRecommendations(ctx);
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.md_day, session?.session_type, session?.md_day_resolved]);

  async function linkPlayer() {
    try {
      setError("");
      if (!profile?.id) return;
      if (!selectedPlayerId) return setError("Veldu leikmann fyrst.");

      const { error: uErr } = await supabase.from("profiles").update({ player_id: selectedPlayerId }).eq("id", profile.id);
      if (uErr) return setError(uErr.message);

      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? "Óþekkt villa.");
    }
  }

  // ================= UI STATES =================

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
            <div className="mt-3 h-3 w-80 animate-pulse rounded bg-zinc-200" />
            <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-red-700">Villa</div>
            <div className="mt-2 text-sm text-zinc-700">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (profile && !profile.player_id) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-xs font-medium text-zinc-500">Player · Setup</div>
            <div className="mt-2 text-xl font-semibold text-zinc-900">Tengja notanda við leikmann</div>
            <div className="mt-2 text-sm text-zinc-600">Þetta er til að prófa player-síðuna. Seinna má auto-linka þetta.</div>

            <div className="mt-6 rounded-xl border bg-zinc-50 p-4">
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Veldu leikmann</label>

              <select
                className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
              >
                <option value="">— Veldu —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? "Ónefndur"} {p.position ? `(${p.position})` : ""} {p.team ? `· ${p.team}` : ""}
                  </option>
                ))}
              </select>

              <button
                onClick={linkPlayer}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Vista tengingu
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ If no plan: show helpful message BUT page still renders
  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-base font-semibold">Engin Stage-4 microdose ákvörðun fannst</div>
            <div className="mt-2 text-sm text-zinc-600">
              Þetta gerist ef Stage-4 decision-engine hefur ekki verið keyrð í dag og engin “resolved/final” view skilar gögnum. Farðu í{" "}
              <b>/player/checkin</b> og vertu viss um að Stage-4 keyrsla hafi verið framkvæmd.
            </div>

            <div className="mt-4 text-xs text-zinc-500">date={sanitizeDay(day)}</div>
          </div>
        </div>
      </div>
    );
  }

  const today = sanitizeDay(day);
  const name = playerMeta?.full_name ?? "Leikmaður";
  const position = (playerMeta?.position ?? "").toUpperCase();
  const team = playerMeta?.team ?? "";

  const decisionType = inferDecisionType(decision, plan);
  const mdLabel = mdContextLabel(plan.md_day || session?.md_day_resolved || null);

  const lockedBool = !!plan.locked;
  const lockLabel = lockedBool ? "Læst" : "Ólæst";

  const trainingSystemLabel = plan.training_system ? String(plan.training_system) : "—";

  const sourceLabel = plan.source ? String(plan.source).toUpperCase() : "—";

  function formatConfidence(conf: number | null | undefined) {
    if (conf == null) return "—";
    if (conf <= 1) return `${Math.round(conf * 100)}%`;
    return `${Math.round(conf)}%`;
  }

  const confidenceLabel = formatConfidence(plan.confidence);

  // ✅ Players should not care about variants. Staff can see it in debug.
  const variantLabel = plan.variant ? `Variant ${plan.variant}` : "Variant —";

  const message = genericMsg?.message || (ui as any).playerMessage;
  const whyText = plan?.why || genericMsg?.why || (ui as any).why;

  const debugLine =
    `day=${today} | ` +
    `plan_entry_date=${plan.entry_date ?? "-"} | ` +
    `decision_focus=${decision?.planned_focus ?? "-"} | ` +
    `decision_day_type=${decision?.final_planned_day_type ?? "-"} | ` +
    `decision_recommended=${decision?.recommended_day_type ?? "-"} | ` +
    `md_day=${plan.md_day ?? "-"} | ` +
    `session_md=${session?.md_day_resolved ?? "-"} | ` +
    `session_type=${session?.session_type ?? "-"}` +
    (staffMode
      ? ` | source=${sourceLabel} | confidence=${confidenceLabel} | decision_id=${plan.decision_id ?? "-"} | chosen_variant_id=${
          plan.chosen_variant_id ?? "-"
        } | variant=${plan.variant ?? "-"} | training_system=${trainingSystemLabel}`
      : "");

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className={`rounded-2xl border bg-white p-6 shadow-sm ${(ui as any).panel}`}>
          {/* HEADER */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-medium text-zinc-500">Player · {today}</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">{name}</div>
              <div className="mt-1 text-sm text-zinc-600">
                {team ? `${team}` : "—"} {position ? `· ${position}` : ""}
              </div>
              {planIsFallback ? (
                <div className="mt-2 text-xs font-semibold text-amber-700">
                  Ath: plan kemur úr fallback (fyrri dagsetning) — plan_date={plan.entry_date}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BadgePill>{lockLabel}</BadgePill>
              <BadgePill>{decisionType}</BadgePill>
              <BadgePill>{mdLabel}</BadgePill>
              <BadgePill>{trainingSystemLabel}</BadgePill>
              {/* readiness litir koma frá flagUi */}
              <BadgePill className={(ui as any).pill}>
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${(ui as any).dot}`} />
                {flag}
              </BadgePill>
            </div>
          </div>

          {/* TODAY MESSAGE */}
          <div className="mt-6 rounded-2xl border bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Í dag</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">Ákvörðun: {decisionType}</div>
            <div className="mt-2 text-sm text-zinc-700">{message}</div>

            {whyText ? (
              <div className="mt-3 text-sm text-zinc-600">
                <span className="font-semibold text-zinc-800">Af hverju:</span> {whyText}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat label="Ákvörðun" value={decisionType} />
              <Stat label="MD context" value={mdLabel} />
              <Stat label="Kerfi" value={trainingSystemLabel} />
              <Stat label="Plan date" value={plan.entry_date ?? "—"} />
            </div>
          </div>

          {/* METRICS */}
          <details className="mt-6 rounded-2xl border bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
              Mælingar dagsins <span className="ml-2 text-xs font-normal text-zinc-500">(aðeins til upplýsingar)</span>
            </summary>
            <div className="px-4 pb-4">
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Readiness metrics</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Readiness" value={metrics?.readiness ?? "—"} />
                <Stat label="Sleep" value={metrics?.sleep ?? "—"} />
                <Stat label="Soreness" value={metrics?.soreness ?? "—"} />
                <Stat label="Total" value={metrics?.total_score ?? "—"} />
              </div>
            </div>
          </details>

          {/* STRUCTURE (header með grænum punkti, blocks gráir) */}
          {renderStructureBlocks(plan.structure, {
            headerTitle: plan.title,
            headerDesc: plan.description,
            lockLabel,
          })}

          {/* FIX MODULES */}
          {fixErr ? <div className="mt-6 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-700">{fixErr}</div> : null}
          {renderFixModules(fixModules)}

          {/* POST-TRAINING (nú GRÁTT + MET layout fix) */}
          {postTrainingErr ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-700">{postTrainingErr}</div>
          ) : null}
          {renderPostTraining(postTraining)}

          {/* STAFF DEBUG */}
          {staffMode ? (
            <details className="mt-6 rounded-xl border bg-white">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900">
                Tæknilegar upplýsingar (staff)
              </summary>
              <div className="px-4 pb-4">
                <div className="rounded-xl border bg-zinc-50 p-3 text-xs text-zinc-700">{debugLine}</div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border bg-white p-3">
                    <div className="font-semibold text-zinc-900">Source</div>
                    <div className="mt-1 text-zinc-700">{sourceLabel}</div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <div className="font-semibold text-zinc-900">Confidence</div>
                    <div className="mt-1 text-zinc-700">{confidenceLabel}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border bg-white p-3">
                    <div className="font-semibold text-zinc-900">Training system</div>
                    <div className="mt-1 text-zinc-700">{trainingSystemLabel}</div>
                  </div>
                  <div className="rounded-xl border bg-white p-3">
                    <div className="font-semibold text-zinc-900">Variant</div>
                    <div className="mt-1 text-zinc-700">{variantLabel}</div>
                  </div>
                </div>

                {overrideAuditErr ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-white p-3 text-xs text-red-700">{overrideAuditErr}</div>
                ) : null}

                {overrideAudit.length ? (
                  <div className="mt-3 rounded-xl border bg-white p-3 text-xs text-zinc-700">
                    <div className="font-semibold text-zinc-900">Override audit (latest)</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {overrideAudit.map((o) => (
                        <li key={o.id}>
                          {o.created_at}: to_variant={o.override_to_variant_id ?? "—"} · lvl={o.overrode_to_readiness_level ?? "—"} · reason=
                          {o.reason_test ?? o.reason_code ?? "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}