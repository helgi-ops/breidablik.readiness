/**
 * Club-custom corrective exercises — the add-exercise admin. GET lists the team's
 * custom exercises; POST creates one (written into corrective_exercises as a row
 * whose `definition` is a full CorrectiveExercise, tagged source="custom" and
 * carrying `addresses` = the compensation keys that route it). Once saved, the
 * exercise flows through the exact same screen → compensation → plan pipeline as
 * every built-in — no code change. Coach/admin only, team-scoped by RLS.
 *
 * Screening / training only — never a diagnosis, never the readiness colour.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrectiveExercise, CorrectivePhase, CompensationKey, ExerciseSource } from "@/lib/micropulse/movementScreen/correctives/registry";
import type { EvidenceGrade, Bi } from "@/lib/micropulse/movementScreen/registry";

export const runtime = "nodejs";

const PHASES: CorrectivePhase[] = ["inhibit", "lengthen", "activate", "integrate"];
const COMPENSATIONS: CompensationKey[] = [
  "dynamic_valgus", "hip_abductor_weakness", "forward_trunk_lean", "limited_dorsiflexion",
  "low_reactive_strength", "poor_absorption", "landing_instability", "limb_asymmetry",
];
const GRADES: EvidenceGrade[] = ["strong", "moderate", "emerging"];

type Ctx = { sb: SupabaseClient; uid: string; teamId: string | null; role: string };

async function requireCoach(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  return { sb, uid, teamId: p.team_id ?? null, role };
}

const bi = (v: unknown): Bi | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as { en?: unknown; is?: unknown };
  const en = String(o.en ?? "").trim();
  if (!en) return null;
  return { en, is: String(o.is ?? en).trim() || en };
};

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "exercise";

// GET → the team's custom exercises (definition rows).
export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { data } = await ctx.sb
    .from("corrective_exercises")
    .select("slug, name, phase, active, team_id, definition")
    .not("definition", "is", null)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Array<{ slug: string; phase: string; team_id: string | null; definition: unknown }>;
  const items = rows
    .filter((r) => r.team_id != null) // custom (team) rows only; built-ins have null definition
    .map((r) => ({ slug: r.slug, ...(r.definition as object) }));
  return NextResponse.json({ ok: true, items });
}

// POST → create a custom exercise routed by `addresses`.
export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!ctx.teamId) return NextResponse.json({ error: "No team on your profile" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const b = body as Record<string, unknown>;
  const name = bi(b.name);
  const target = bi(b.target);
  const dose = bi(b.dose);
  const cue = bi(b.cue) ?? target ?? name;
  const phase = String(b.phase ?? "") as CorrectivePhase;
  const grade = (GRADES.includes(String(b.evidenceGrade) as EvidenceGrade) ? String(b.evidenceGrade) : "moderate") as EvidenceGrade;
  const addresses = Array.isArray(b.addresses) ? (b.addresses as unknown[]).map(String).filter((a): a is CompensationKey => COMPENSATIONS.includes(a as CompensationKey)) : [];
  const videoUrl = typeof b.videoUrl === "string" && b.videoUrl.trim() ? b.videoUrl.trim() : null;

  if (!name) return NextResponse.json({ error: "Name (English) is required." }, { status: 400 });
  if (!target || !dose) return NextResponse.json({ error: "Target and dose are required." }, { status: 400 });
  if (!PHASES.includes(phase)) return NextResponse.json({ error: "Pick a phase." }, { status: 400 });
  if (addresses.length === 0) return NextResponse.json({ error: "Pick at least one compensation this exercise addresses — that is the routing key." }, { status: 400 });

  const slug = `custom_${slugify(name.en)}_${Math.random().toString(36).slice(2, 7)}`;
  const definition: CorrectiveExercise = {
    slug, name, cue: cue!, phase, target, targetKind: "strengthen", dose,
    frequency: { en: "as prescribed", is: "eftir fyrirmælum" },
    videoUrl, citation: `Club-added (${ctx.role.toLowerCase()})`, evidenceGrade: grade,
    source: "custom" as ExerciseSource, addresses,
  };

  const { error } = await ctx.sb.from("corrective_exercises").insert({
    slug, name, phase, team_id: ctx.teamId, definition, active: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, slug });
}
