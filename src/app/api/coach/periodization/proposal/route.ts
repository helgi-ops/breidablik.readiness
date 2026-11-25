/**
 * /api/coach/periodization/proposal — "Build pre-season" drafts. Coach / staff / admin, own team (or an
 * admin's requested team via the shared access helper). Nothing in a draft reaches Week Setup until accept.
 *
 *   GET                         → the open draft (or null) + the last accepted one's date.
 *   GET  ?preview=1             → also what accepting would write now (counts for the confirm step).
 *   POST { action: "build", fromScratch? }  → build from the rules + team data; replaces the open draft.
 *   POST { action: "edit", settings?, days? } → change the draft (settings / days); the plan re-flows.
 *   POST { action: "accept" }   → write settings + days + tests (today onward; never match / break days;
 *                                  saved days kept unless changed in the draft) and mark accepted.
 *   POST { action: "discard" }  → drop the draft. week_plans is untouched.
 *
 * Rules decide; no AI. Descriptive planning — never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { buildProposalContext, acceptPlanFor, writeAcceptPlan, storedProposal, type ProposalEdits } from "@/lib/micropulse/periodization/preseasonProposalServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCOPE = "preseason";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type DraftRow = { id: string; season_year: number; from_scratch: boolean; proposal: unknown; coach_edits: ProposalEdits | null; updated_at: string; created_at: string };

function statusOf(msg: string) {
  return msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : /team context/i.test(msg) ? 400 : 500;
}

async function auth(req: Request) {
  const sb = getSupabaseServer();
  const url = new URL(req.url);
  const { teamId, coachUserId } = await requireCoachAccessForTeam(sb, req, url.searchParams.get("teamId"));
  if (!teamId) throw new Error("Team context is required");
  return { sb, teamId, userId: coachUserId };
}

async function openDraft(sb: ReturnType<typeof getSupabaseServer>, teamId: string): Promise<DraftRow | null> {
  const { data } = await sb.from("plan_proposals").select("id, season_year, from_scratch, proposal, coach_edits, updated_at, created_at")
    .eq("team_id", teamId).eq("scope", SCOPE).eq("status", "draft").maybeSingle();
  return (data as DraftRow | null) ?? null;
}

/** Keep only well-formed edits (sessions 3–6, week 1 0.5–3, positive KPI values, tail lengths 2–8, valid days). */
function cleanEdits(raw: { settings?: Record<string, unknown>; days?: Record<string, unknown> }): ProposalEdits {
  const out: ProposalEdits = {};
  const s = raw.settings ?? {};
  const settings: NonNullable<ProposalEdits["settings"]> = {};
  if ([3, 4, 5, 6].includes(Number(s.preseasonSessions))) settings.preseasonSessions = Number(s.preseasonSessions);
  if (Number.isFinite(Number(s.preseasonWeek1Mult)) && s.preseasonWeek1Mult != null) settings.preseasonWeek1Mult = Math.max(0.5, Math.min(3, Number(s.preseasonWeek1Mult)));
  if (s.preWeek1Kpi && typeof s.preWeek1Kpi === "object") {
    const k: Record<string, number> = {};
    for (const [key, v] of Object.entries(s.preWeek1Kpi as Record<string, unknown>)) if (/^[A-Za-z0-9]+$/.test(key) && Number(v) > 0) k[key] = Math.round(Number(v));
    settings.preWeek1Kpi = k;
  }
  if (Array.isArray(s.preMesoTail)) settings.preMesoTail = (s.preMesoTail as unknown[]).map(Number).filter((n) => Number.isFinite(n) && n >= 2 && n <= 8).slice(0, 6);
  if (Object.keys(settings).length) out.settings = settings;
  const days: Record<string, { dayType: string; focus: string | null }> = {};
  for (const [iso, d] of Object.entries(raw.days ?? {})) {
    const v = d as { dayType?: unknown; focus?: unknown } | null;
    if (!ISO.test(iso) || !v || !["OFF", "TRAIN"].includes(String(v.dayType))) continue;
    days[iso] = { dayType: String(v.dayType), focus: typeof v.focus === "string" ? v.focus.slice(0, 80) : null };
  }
  if (Object.keys(days).length) out.days = days;
  return out;
}

const mergeEdits = (a: ProposalEdits | null, b: ProposalEdits): ProposalEdits => ({
  settings: { ...(a?.settings ?? {}), ...(b.settings ?? {}) },
  days: { ...(a?.days ?? {}), ...(b.days ?? {}) },
});

export async function GET(req: Request) {
  try {
    const { sb, teamId } = await auth(req);
    const draft = await openDraft(sb, teamId);
    const { data: last } = await sb.from("plan_proposals").select("accepted_at").eq("team_id", teamId).eq("scope", SCOPE).eq("status", "accepted").order("accepted_at", { ascending: false }).limit(1).maybeSingle();
    let preview = null;
    if (draft && new URL(req.url).searchParams.get("preview") === "1") {
      const opts = { fromScratch: draft.from_scratch, edits: draft.coach_edits ?? {} };
      const ctx = await buildProposalContext(sb, teamId, opts);
      if (ctx) preview = acceptPlanFor(ctx, opts).summary;
    }
    return NextResponse.json({ ok: true, draft, preview, lastAcceptedAt: (last as { accepted_at?: string } | null)?.accepted_at ?? null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: statusOf(msg) });
  }
}

export async function POST(req: Request) {
  try {
    const { sb, teamId, userId } = await auth(req);
    const body = await req.json().catch(() => ({})) as { action?: string; fromScratch?: boolean; settings?: Record<string, unknown>; days?: Record<string, unknown> };
    const now = new Date().toISOString();

    if (body.action === "build") {
      const fromScratch = !!body.fromScratch;
      const ctx = await buildProposalContext(sb, teamId, { fromScratch, edits: {} });
      if (!ctx) return NextResponse.json({ ok: false, error: "No pre-season to plan — set the season dates first." }, { status: 400 });
      // Replace any open draft (one per team): the old one is marked discarded, not deleted (audit trail).
      await sb.from("plan_proposals").update({ status: "discarded", updated_at: now }).eq("team_id", teamId).eq("scope", SCOPE).eq("status", "draft");
      const { data, error } = await sb.from("plan_proposals").insert({
        team_id: teamId, season_year: ctx.seasonYear, scope: SCOPE, status: "draft", from_scratch: fromScratch,
        proposal: storedProposal(ctx.proposal), coach_edits: {}, created_by: userId, updated_at: now,
      }).select("id, season_year, from_scratch, proposal, coach_edits, updated_at, created_at").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, draft: data });
    }

    const draft = await openDraft(sb, teamId);
    if (!draft) return NextResponse.json({ ok: false, error: "No open draft" }, { status: 404 });

    if (body.action === "edit") {
      const edits = mergeEdits(draft.coach_edits, cleanEdits({ settings: body.settings, days: body.days }));
      const opts = { fromScratch: draft.from_scratch, edits };
      const ctx = await buildProposalContext(sb, teamId, opts);
      if (!ctx) return NextResponse.json({ ok: false, error: "No pre-season to plan" }, { status: 400 });
      const { data, error } = await sb.from("plan_proposals").update({ proposal: storedProposal(ctx.proposal), coach_edits: edits, updated_at: now })
        .eq("id", draft.id).eq("team_id", teamId).select("id, season_year, from_scratch, proposal, coach_edits, updated_at, created_at").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, draft: data });
    }

    if (body.action === "accept") {
      const opts = { fromScratch: draft.from_scratch, edits: draft.coach_edits ?? {} };
      // Rebuilt on today's data, so a fixture or day saved since the draft is respected.
      const ctx = await buildProposalContext(sb, teamId, opts);
      if (!ctx) return NextResponse.json({ ok: false, error: "No pre-season to plan" }, { status: 400 });
      const plan = acceptPlanFor(ctx, opts);
      const err = await writeAcceptPlan(sb, teamId, userId, ctx.seasonYear, plan);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
      await sb.from("plan_proposals").update({ status: "accepted", proposal: storedProposal(ctx.proposal), accept_summary: plan.summary, accepted_by: userId, accepted_at: now, updated_at: now })
        .eq("id", draft.id).eq("team_id", teamId);
      return NextResponse.json({ ok: true, summary: plan.summary });
    }

    if (body.action === "discard") {
      await sb.from("plan_proposals").update({ status: "discarded", updated_at: now }).eq("id", draft.id).eq("team_id", teamId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: statusOf(msg) });
  }
}
