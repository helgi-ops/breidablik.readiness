/**
 * Corrective prescription for a player. GET builds the MERGED prescription
 * (latest movement screen + latest region assessment + recent VALD force data)
 * for the Correctives tab; POST sends the coach-SELECTED exercises to the
 * player's Today card (player_today_strength_override). Everything is rebuilt
 * SERVER-SIDE from stored data (never trusting a client-supplied block); the
 * client only chooses which of the prescribed exercises to send.
 *
 * Screening / training only — never a diagnosis, never the readiness colour.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerMovementScreens } from "@/lib/micropulse/movementScreen/loader";
import {
  prescribeCorrectives, prescribeForRegionFields, prescribeForCompensations, prescriptionToStructure,
  compensationLabel,
  type CorrectivePrescription,
} from "@/lib/micropulse/movementScreen/correctives/mapping";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { reconcile, planCompensations } from "@/lib/micropulse/unifiedDeficits/reconcile";
import { loadValdCorrectiveSignals } from "@/lib/micropulse/movementScreen/correctives/valdSignals";
import { loadCustomCorrectives } from "@/lib/micropulse/movementScreen/correctives/customLoader";
import type { CorrectiveExercise } from "@/lib/micropulse/movementScreen/correctives/registry";
import { rehabTrackForCompensations, injuryTrackKey, type RehabTrackView, type RehabTrackKey } from "@/lib/micropulse/movementScreen/correctives/rehabTracks";
import { classifyRehabTrack } from "@/lib/micropulse/unifiedDeficits/rehabTrackSignals";
import { rehabProtocolsForCompensations } from "@/lib/micropulse/movementScreen/correctives/rehabProtocolLinks";
import type { FiredObservation } from "@/lib/micropulse/movementScreen/deficitLedger";
import type { CompensationKey } from "@/lib/micropulse/movementScreen/correctives/mapping";
import { REGION_BY_KEY, fieldLabel } from "@/lib/micropulse/movementScreen/vision/regions";
import { getMovementTest } from "@/lib/micropulse/movementScreen/loader";
import { buildVariableTrends } from "@/lib/micropulse/movementScreen/trend";
import type { Bi } from "@/lib/micropulse/movementScreen/registry";

export const runtime = "nodejs";

/** A short "what the assessment found" summary for the Correctives tab. */
type SummaryEntry = { kind: "screen" | "region"; title: Bi; items: Bi[] };
type ValdFlag = NonNullable<CorrectivePrescription["objectiveSignals"]>[number];

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

async function coachCanAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data: ct } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!ct;
}

const SCREEN_LOOKBACK_DAYS = 56;

/** Merge every stored source for the player into one prescription (+ VALD "why").
 *  Uses the latest RECENT screen PER TEST (so an overhead squat + a drop jump
 *  both contribute), the latest region assessment, and recent VALD. */
/** Hide Enda King extras from the sendable corrective plan — the full King program
 *  is surfaced in its own (clinician-gated) card below, so folding a routed subset
 *  into the plan only duplicates it and bloats the send. Curated core + club-custom
 *  exercises stay. (The engine keeps King's compensation routing; this is display.) */
function stripKing(p: CorrectivePrescription): CorrectivePrescription {
  const phases = p.phases.map((g) => ({ ...g, items: g.items.filter((e) => e.source !== "king") })).filter((g) => g.items.length);
  return { ...p, phases };
}

async function buildMerged(ctx: Ctx, playerId: string, extra?: CorrectiveExercise[]): Promise<{ prescription: CorrectivePrescription | null; summary: SummaryEntry[]; valdFlags: ValdFlag[]; anchorComps: CompensationKey[] }> {
  const screens = await loadPlayerMovementScreens(ctx.sb, playerId, 20);
  const cutoff = Date.now() - SCREEN_LOOKBACK_DAYS * 86_400_000;
  const latestPerTest = new Map<string, (typeof screens)[number]>();
  for (const s of screens) { // ordered newest-first → first per slug is the latest
    if (!s.result?.readings?.length) continue;
    if (new Date(s.screenDate).getTime() < cutoff) continue;
    if (!latestPerTest.has(s.testSlug)) latestPerTest.set(s.testSlug, s);
  }
  const sources: NonNullable<CorrectivePrescription["sources"]> = [...latestPerTest.values()].map((s) => ({
    kind: "screen" as const,
    label: { en: `${s.testSlug.replace(/_/g, " ")} · ${s.screenDate}`, is: `${s.testSlug.replace(/_/g, " ")} · ${s.screenDate}` },
  }));

  const { data: ra } = await ctx.sb
    .from("movement_region_assessments")
    .select("region, fields, assessment_date")
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const raRow = ra as { region?: string; fields?: Array<{ fieldId: string; severity: string }>; assessment_date?: string } | null;
  const regionFields = raRow?.fields ?? [];
  const regionFlagged = regionFields.some((f) => f.severity === "moderate" || f.severity === "marked");
  if (regionFlagged) sources.push({ kind: "region", label: { en: `${(raRow?.region ?? "").replace(/_/g, " ")} assessment · ${raRow?.assessment_date ?? ""}`, is: `${(raRow?.region ?? "").replace(/_/g, " ")} mat · ${raRow?.assessment_date ?? ""}` } });

  const { data: af } = await ctx.sb
    .from("movement_assessment_forms")
    .select("battery, fired, assessment_date")
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const afRow = af as { battery?: string[]; fired?: FiredObservation[]; assessment_date?: string } | null;
  if (afRow?.fired?.length) sources.push({ kind: "screen", label: { en: `movement assessment form · ${afRow?.assessment_date ?? ""}`, is: `hreyfi-matsform · ${afRow?.assessment_date ?? ""}` } });

  const valdSignals = await loadValdCorrectiveSignals(ctx.sb, playerId);
  const valdFlags: ValdFlag[] = valdSignals.map((s) => ({ source: s.source, detail: s.detail, ageDays: s.ageDays, compensationLabel: compensationLabel(s.compensation) }));

  // UNIFIED PATH: the plan reads exactly the reconciled deficit summary (the same
  // one Total Player Analysis shows) — every source collected + reconciled, IMA
  // and coach overrides included. planCompensations() = the non-medical,
  // non-dismissed compensations to prescribe.
  const { rows: deficitRows, overrides } = await collectDeficits(ctx.sb, playerId);
  const reconciled = reconcile(deficitRows, overrides);
  const anchorComps = planCompensations(reconciled);
  // Surface an IMA provenance chip when IMA contributed to the plan.
  const imaProv = reconciled.find((d) => !d.medicalReferral && d.overridden !== "dismiss" && d.sources.some((s) => s.source === "ima"))?.sources.find((s) => s.source === "ima")?.provenance;
  if (imaProv) sources.push({ kind: "screen", label: imaProv });

  // ANCHOR RULE (B): a plan must be anchored in a MOVEMENT source (screen / form /
  // region / IMA / clinical) — VALD only STRENGTHENS it, never builds it alone.
  const anchored = anchorComps.length > 0 && reconciled.some((d) => !d.medicalReferral && d.overridden !== "dismiss" && d.sources.some((s) => s.source !== "vald"));
  if (!anchored) return { prescription: null, summary: [], valdFlags, anchorComps: [] };

  const prescription = prescribeForCompensations(anchorComps, extra);
  if (!prescription) return { prescription: null, summary: [], valdFlags, anchorComps };
  prescription.sources = sources;
  if (valdFlags.length) prescription.objectiveSignals = valdFlags;

  // Short "what the assessment found" summary — so the coach needn't tab-hop.
  const legTag = (leg: string | null) => (leg && leg !== "both" ? ` (${leg})` : "");
  const summary: SummaryEntry[] = [];
  for (const s of latestPerTest.values()) {
    const seen = new Set<string>();
    const items: Bi[] = [];
    for (const r of s.result!.readings) {
      const key = `${r.finding.en}${r.leg ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ en: `${r.finding.en}${legTag(r.leg)}`, is: `${r.finding.is}${legTag(r.leg)}` });
    }
    if (items.length) summary.push({ kind: "screen", title: { en: s.testSlug.replace(/_/g, " "), is: s.testSlug.replace(/_/g, " ") }, items: items.slice(0, 6) });
  }
  if (raRow?.region && regionFlagged) {
    const items: Bi[] = [];
    for (const f of regionFields) {
      if (f.severity !== "moderate" && f.severity !== "marked") continue;
      const lbl = fieldLabel(raRow.region, f.fieldId);
      if (lbl) items.push({ en: `${lbl.en} — ${f.severity}`, is: `${lbl.is} — ${f.severity}` });
    }
    if (items.length) summary.push({ kind: "region", title: REGION_BY_KEY[raRow.region]?.label ?? { en: raRow.region, is: raRow.region }, items });
  }

  return { prescription: stripKing(prescription), summary, valdFlags, anchorComps };
}

async function resolvePlayerTeam(ctx: Ctx, playerId: string): Promise<string> {
  const { data: pl } = await ctx.sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  return (pl as { team_id?: string } | null)?.team_id ?? ctx.teamId ?? "";
}

/** Injury context — a coach-set active injury (player_injuries) makes the plan a
 *  REHAB read, not a prehab one: it drives the rehab-track (the injury's continuum,
 *  entered early — the clinician gates advancement) and caps the corrective plan
 *  (loaded / plyometric integrate work held for the clinician). No injury = prehab. */
type InjuryContext = { injured: boolean; label: Bi | null; trackKey?: RehabTrackKey };
async function loadInjuryContext(ctx: Ctx, playerId: string): Promise<InjuryContext> {
  const { data } = await ctx.sb
    .from("player_injuries")
    .select("injury_type, body_part, status, injury_date")
    .eq("player_id", playerId).neq("status", "cleared")
    .order("injury_date", { ascending: false }).limit(1).maybeSingle();
  const r = data as { injury_type?: string | null; body_part?: string | null } | null;
  if (!r) return { injured: false, label: null };
  const text = `${r.injury_type ?? ""} ${r.body_part ?? ""}`.trim();
  const cls = classifyRehabTrack(text);
  return { injured: true, label: cls?.label ?? { en: text || "Active injury", is: text || "Virkt meiðsli" }, trackKey: injuryTrackKey(cls?.track) };
}

// GET ?player_id= → the merged prescription for the Correctives tab.
export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const playerId = new URL(req.url).searchParams.get("player_id") ?? "";
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const custom = await loadCustomCorrectives(ctx.sb, teamId);
  const merged = await buildMerged(ctx, playerId, custom);

  // Re-screen loop: per-test trend of the ever-flagged variables + the due date.
  const screens = await loadPlayerMovementScreens(ctx.sb, playerId, 20);
  const byTest = new Map<string, typeof screens>();
  for (const s of screens) { const arr = byTest.get(s.testSlug) ?? []; arr.push(s); byTest.set(s.testSlug, arr); }
  const trend: Array<{ test: Bi; variables: Array<{ label: Bi; leg: string | null; verdict: string; points: Array<{ date: string; severity: string }> }> }> = [];
  for (const [slug, arr] of byTest) {
    const vts = buildVariableTrends(arr.map((s) => ({ screenDate: s.screenDate, findings: s.findings })));
    if (!vts.length) continue;
    const test = getMovementTest(slug);
    trend.push({
      test: test?.name ?? { en: slug.replace(/_/g, " "), is: slug.replace(/_/g, " ") },
      variables: vts.map((vt) => ({
        label: test?.variables.find((v) => v.key === vt.variableKey)?.label ?? { en: vt.variableKey, is: vt.variableKey },
        leg: vt.leg,
        verdict: vt.verdict,
        points: vt.points.map((p) => ({ date: p.date, severity: p.severity })),
      })),
    });
  }
  const latestDate = screens[0]?.screenDate ?? null; // newest-first
  const reScreenInDays = merged.prescription?.reScreenInDays ?? 35;
  let reScreenDue: { date: string; dueInDays: number } | null = null;
  if (latestDate) {
    const due = new Date(new Date(latestDate).getTime() + reScreenInDays * 86_400_000);
    reScreenDue = { date: due.toISOString().slice(0, 10), dueInDays: Math.round((due.getTime() - Date.now()) / 86_400_000) };
  }

  // Rehab track — injury-aware. An ACTIVE injury (its continuum) is authoritative
  // and entered EARLY (clinician gates advance = a rehab roadmap); with no injury,
  // the screen findings suggest a PREHAB progression at the screen-indicated phase.
  const injury = await loadInjuryContext(ctx, playerId);
  const rehabTrack: RehabTrackView | null = injury.trackKey
    ? rehabTrackForCompensations(merged.anchorComps, { forceTrackKey: injury.trackKey, injured: true })
    : (merged.anchorComps.length ? rehabTrackForCompensations(merged.anchorComps) : null);

  // Clinical assessment ideas are built client-side from the flagged findings
  // (the compensation keys) — plain rationale + suggested tests per finding.
  const assessmentCompensations = merged.anchorComps;

  // Matching DB staged-loading rehab protocols the findings point to — but only
  // those that actually exist (active) for this team, so the link never 404s.
  const candidateProtocols = rehabProtocolsForCompensations(merged.anchorComps);
  let rehabProtocols: typeof candidateProtocols = [];
  if (candidateProtocols.length) {
    const { data: prows } = await ctx.sb
      .from("recovery_protocols")
      .select("slug")
      .eq("active", true)
      .in("slug", candidateProtocols.map((p) => p.slug))
      .or(`team_id.eq.${teamId},team_id.is.null`);
    const present = new Set(((prows ?? []) as Array<{ slug: string }>).map((r) => r.slug));
    rehabProtocols = candidateProtocols.filter((p) => present.has(p.slug));
  }

  return NextResponse.json({ ok: true, prescription: merged.prescription, summary: merged.summary, valdFlags: merged.valdFlags, trend, reScreenDue, rehabTrack, assessmentCompensations, rehabProtocols, injuryContext: { injured: injury.injured, label: injury.label } });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const b = body as { player_id?: string; lang?: string; source?: string; entry_date?: string; selected_slugs?: unknown };
  const playerId = String(b.player_id ?? "");
  const isEN = b.lang !== "IS";
  const source = b.source === "region" ? "region" : b.source === "screen" ? "screen" : "merged";
  const entryDate = String(b.entry_date ?? new Date().toISOString().slice(0, 10));
  const selectedSlugs = Array.isArray(b.selected_slugs) ? new Set((b.selected_slugs as unknown[]).map(String)) : null;
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });

  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const custom = await loadCustomCorrectives(ctx.sb, teamId);

  // Rebuild the legit prescription SERVER-SIDE from the requested source.
  let prescription: CorrectivePrescription | null = null;
  let sourceLabel = isEN ? "movement screen" : "hreyfiskimun";
  let sourceDate = "";
  if (source === "region") {
    const { data: ra } = await ctx.sb.from("movement_region_assessments").select("region, fields, assessment_date").eq("player_id", playerId).order("assessment_date", { ascending: false }).limit(1).maybeSingle();
    const row = ra as { region?: string; fields?: Array<{ fieldId: string; severity: string }>; assessment_date?: string } | null;
    if (!row?.fields?.length) return NextResponse.json({ error: "No region assessment to prescribe from." }, { status: 400 });
    prescription = prescribeForRegionFields(row.fields, custom);
    if (prescription) prescription = stripKing(prescription);
    sourceLabel = isEN ? `${(row.region ?? "").replace(/_/g, " ")} assessment` : `${(row.region ?? "").replace(/_/g, " ")} mat`;
    sourceDate = row.assessment_date ?? "";
  } else if (source === "screen") {
    const screens = await loadPlayerMovementScreens(ctx.sb, playerId, 1);
    const latest = screens[0];
    if (!latest?.result?.readings?.length) return NextResponse.json({ error: "No movement-screen findings to prescribe from." }, { status: 400 });
    prescription = prescribeCorrectives(latest.result.readings, custom);
    if (prescription) prescription = stripKing(prescription);
    sourceLabel = isEN ? `${latest.testSlug.replace(/_/g, " ")} screen` : `${latest.testSlug.replace(/_/g, " ")} skimun`;
    sourceDate = latest.screenDate;
  } else {
    prescription = (await buildMerged(ctx, playerId, custom)).prescription;
    if (!prescription) return NextResponse.json({ error: "Record a movement screen or region assessment first — VALD alone can't build a plan." }, { status: 400 });
    sourceLabel = isEN ? "movement screen + region + VALD" : "skimun + svæði + VALD";
    sourceDate = new Date().toISOString().slice(0, 10);
  }
  if (!prescription) return NextResponse.json({ error: "No grounded corrective set maps to these findings yet." }, { status: 400 });

  // Keep only the coach-selected exercises (∩ what was actually prescribed).
  if (selectedSlugs) {
    prescription.phases = prescription.phases.map((g) => ({ ...g, items: g.items.filter((e) => selectedSlugs.has(e.slug)) })).filter((g) => g.items.length);
    if (!prescription.phases.length) return NextResponse.json({ error: "No exercises selected." }, { status: 400 });
  }

  const structure = prescriptionToStructure(prescription, isEN);
  const priorities = prescription.priorities.map((p) => (isEN ? p.label.en : p.label.is)).join(" + ");
  const title = isEN ? `Corrective — ${priorities}` : `Leiðrétting — ${priorities}`;
  const summary = isEN
    ? `Corrective block from the ${sourceLabel} (${sourceDate}). Re-screen in ~${Math.round(prescription.reScreenInDays / 7)} weeks.`
    : `Leiðréttingar-blokk úr ${sourceLabel} (${sourceDate}). Endurskima eftir ~${Math.round(prescription.reScreenInDays / 7)} vikur.`;

  const { error } = await ctx.sb.from("player_today_strength_override").upsert({
    player_id: playerId,
    team_id: teamId,
    entry_date: entryDate,
    md_context: null,
    readiness_level: null,
    title,
    description: isEN ? prescription.caveat.en : prescription.caveat.is,
    structure,
    summary,
    duration_min: 15,
    source: "coach_sent",
    coach_id: ctx.uid,
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id,entry_date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entryDate, blocks: structure.length, priorities });
}
