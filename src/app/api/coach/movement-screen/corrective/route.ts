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
  compensationsForReadings, compensationsForRegionFields, compensationLabel,
  type CorrectivePrescription,
} from "@/lib/micropulse/movementScreen/correctives/mapping";
import { loadValdCorrectiveSignals } from "@/lib/micropulse/movementScreen/correctives/valdSignals";
import { rehabTrackForCompensations, type RehabTrackView } from "@/lib/micropulse/movementScreen/correctives/rehabTracks";
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
async function buildMerged(ctx: Ctx, playerId: string): Promise<{ prescription: CorrectivePrescription | null; summary: SummaryEntry[]; valdFlags: ValdFlag[]; anchorComps: CompensationKey[] }> {
  const screens = await loadPlayerMovementScreens(ctx.sb, playerId, 20);
  const cutoff = Date.now() - SCREEN_LOOKBACK_DAYS * 86_400_000;
  const latestPerTest = new Map<string, (typeof screens)[number]>();
  for (const s of screens) { // ordered newest-first → first per slug is the latest
    if (!s.result?.readings?.length) continue;
    if (new Date(s.screenDate).getTime() < cutoff) continue;
    if (!latestPerTest.has(s.testSlug)) latestPerTest.set(s.testSlug, s);
  }
  const screenComps = [...latestPerTest.values()].flatMap((s) => compensationsForReadings(s.result!.readings));
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
  const regionComps = regionFields.length ? compensationsForRegionFields(regionFields) : [];
  if (regionComps.length) sources.push({ kind: "region", label: { en: `${(raRow?.region ?? "").replace(/_/g, " ")} assessment · ${raRow?.assessment_date ?? ""}`, is: `${(raRow?.region ?? "").replace(/_/g, " ")} mat · ${raRow?.assessment_date ?? ""}` } });

  const valdSignals = await loadValdCorrectiveSignals(ctx.sb, playerId);
  const valdFlags: ValdFlag[] = valdSignals.map((s) => ({ source: s.source, detail: s.detail, ageDays: s.ageDays, compensationLabel: compensationLabel(s.compensation) }));

  // ANCHOR RULE (B): a plan must be anchored in a movement screen or a region
  // assessment. VALD only STRENGTHENS that anchor — it never builds a plan alone.
  const anchorComps = [...new Set([...screenComps, ...regionComps])];
  const anchored = anchorComps.length > 0;
  if (!anchored) return { prescription: null, summary: [], valdFlags, anchorComps };

  const allComps = [...new Set([...anchorComps, ...valdSignals.map((s) => s.compensation)])];
  const prescription = prescribeForCompensations(allComps);
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
  if (raRow?.region && regionComps.length) {
    const items: Bi[] = [];
    for (const f of regionFields) {
      if (f.severity !== "moderate" && f.severity !== "marked") continue;
      const lbl = fieldLabel(raRow.region, f.fieldId);
      if (lbl) items.push({ en: `${lbl.en} — ${f.severity}`, is: `${lbl.is} — ${f.severity}` });
    }
    if (items.length) summary.push({ kind: "region", title: REGION_BY_KEY[raRow.region]?.label ?? { en: raRow.region, is: raRow.region }, items });
  }

  return { prescription, summary, valdFlags, anchorComps };
}

async function resolvePlayerTeam(ctx: Ctx, playerId: string): Promise<string> {
  const { data: pl } = await ctx.sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  return (pl as { team_id?: string } | null)?.team_id ?? ctx.teamId ?? "";
}

// GET ?player_id= → the merged prescription for the Correctives tab.
export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const playerId = new URL(req.url).searchParams.get("player_id") ?? "";
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const teamId = await resolvePlayerTeam(ctx, playerId);
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const merged = await buildMerged(ctx, playerId);

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

  // Rehab track — the movement-quality continuum (Enda King's spirit) the screen
  // findings map into (e.g. valgus/asymmetry → ACL/knee track). Screen-anchored.
  const rehabTrack: RehabTrackView | null = merged.anchorComps.length ? rehabTrackForCompensations(merged.anchorComps) : null;

  return NextResponse.json({ ok: true, prescription: merged.prescription, summary: merged.summary, valdFlags: merged.valdFlags, trend, reScreenDue, rehabTrack });
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

  // Rebuild the legit prescription SERVER-SIDE from the requested source.
  let prescription: CorrectivePrescription | null = null;
  let sourceLabel = isEN ? "movement screen" : "hreyfiskimun";
  let sourceDate = "";
  if (source === "region") {
    const { data: ra } = await ctx.sb.from("movement_region_assessments").select("region, fields, assessment_date").eq("player_id", playerId).order("assessment_date", { ascending: false }).limit(1).maybeSingle();
    const row = ra as { region?: string; fields?: Array<{ fieldId: string; severity: string }>; assessment_date?: string } | null;
    if (!row?.fields?.length) return NextResponse.json({ error: "No region assessment to prescribe from." }, { status: 400 });
    prescription = prescribeForRegionFields(row.fields);
    sourceLabel = isEN ? `${(row.region ?? "").replace(/_/g, " ")} assessment` : `${(row.region ?? "").replace(/_/g, " ")} mat`;
    sourceDate = row.assessment_date ?? "";
  } else if (source === "screen") {
    const screens = await loadPlayerMovementScreens(ctx.sb, playerId, 1);
    const latest = screens[0];
    if (!latest?.result?.readings?.length) return NextResponse.json({ error: "No movement-screen findings to prescribe from." }, { status: 400 });
    prescription = prescribeCorrectives(latest.result.readings);
    sourceLabel = isEN ? `${latest.testSlug.replace(/_/g, " ")} screen` : `${latest.testSlug.replace(/_/g, " ")} skimun`;
    sourceDate = latest.screenDate;
  } else {
    prescription = (await buildMerged(ctx, playerId)).prescription;
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
