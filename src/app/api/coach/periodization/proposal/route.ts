/**
 * /api/coach/periodization/proposal — "Build meso / macro" drafts (one table, `scope`). Coach / staff / admin,
 * own team (or an admin's requested team via the shared access helper). Nothing in a draft reaches the plan
 * until accept. `?scope=meso|macro` on every call (anything else → 400). The pre-season has no draft: the hub's
 * Pre-season tab reads live from the Macro cycle + fixtures ("Build pre-season" removed 2026-11-25).
 *
 *   meso:  edit { blockWeeks?, blockGoals?, blockDeload? } (keyed by block start); accept writes the coach's
 *          block choices to the season row (the rule values aren't pinned, so fixtures still re-flow them).
 *   macro: edit { dates: { preseasonStart?, seasonEnd?, offseasonStart?, nextPreseasonStart? } }; accept writes
 *          the coach's dates (+ the season end once the last game is played).
 *
 *   GET                         → the open draft (or null) + the last accepted one's date.
 *   GET  ?preview=1             → also what accepting would write now (counts for the confirm step).
 *   POST { action: "build", fromScratch? }  → build from the rules + team data; replaces the open draft.
 *   POST { action: "edit", ... } → change the draft; the plan re-flows.
 *   POST { action: "accept" }   → write the coach's choices and mark accepted.
 *   POST { action: "discard" }  → drop the draft.
 *
 * Rules decide; no AI. Descriptive planning — never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { buildMesoContext, mesoSummary, writeMesoAccept } from "@/lib/micropulse/periodization/mesoProposalServer";
import { buildMacroContext, macroSummary, writeMacroAccept } from "@/lib/micropulse/periodization/macroProposalServer";
import type { MesoEdits } from "@/lib/micropulse/periodization/mesoProposal";
import type { MacroEdits } from "@/lib/micropulse/periodization/macroProposal";

export const runtime = "nodejs";
export const maxDuration = 60;

type Scope = "meso" | "macro";
const scopeOf = (req: Request): Scope | null => { const s = new URL(req.url).searchParams.get("scope"); return s === "meso" || s === "macro" ? s : null; };
const BAD_SCOPE = () => NextResponse.json({ ok: false, error: "scope must be meso or macro" }, { status: 400 });
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type DraftRow = { id: string; season_year: number; from_scratch: boolean; proposal: unknown; coach_edits: unknown; updated_at: string; created_at: string };

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

async function openDraft(sb: ReturnType<typeof getSupabaseServer>, teamId: string, SCOPE: Scope): Promise<DraftRow | null> {
  const { data } = await sb.from("plan_proposals").select("id, season_year, from_scratch, proposal, coach_edits, updated_at, created_at")
    .eq("team_id", teamId).eq("scope", SCOPE).eq("status", "draft").maybeSingle();
  return (data as DraftRow | null) ?? null;
}

/** Meso edits: lengths 2–8 weeks, the three goals, light weeks as Mondays; null = back to the rule. */
function cleanMeso(raw: Record<string, unknown>): MesoEdits {
  const out: MesoEdits = {};
  const pick = <T>(m: unknown, ok: (v: unknown) => T | null | undefined): Record<string, T | null> => {
    const r: Record<string, T | null> = {};
    if (m && typeof m === "object") for (const [k, v] of Object.entries(m as Record<string, unknown>)) { if (!ISO.test(k)) continue; if (v === null) r[k] = null; else { const c = ok(v); if (c != null) r[k] = c; } }
    return r;
  };
  const w = pick(raw.blockWeeks, (v) => (Number.isFinite(Number(v)) && Number(v) >= 2 && Number(v) <= 8 ? Math.round(Number(v)) : null));
  const g = pick(raw.blockGoals, (v) => (v === "accum" || v === "transmute" || v === "realize" ? v : null));
  const d = pick(raw.blockDeload, (v) => (typeof v === "string" && ISO.test(v) ? v : null));
  if (Object.keys(w).length) out.blockWeeks = w;
  if (Object.keys(g).length) out.blockGoals = g as MesoEdits["blockGoals"];
  if (Object.keys(d).length) out.blockDeload = d;
  return out;
}
const mergeMeso = (a: MesoEdits | null, b: MesoEdits): MesoEdits => ({
  blockWeeks: { ...(a?.blockWeeks ?? {}), ...(b.blockWeeks ?? {}) },
  blockGoals: { ...(a?.blockGoals ?? {}), ...(b.blockGoals ?? {}) },
  blockDeload: { ...(a?.blockDeload ?? {}), ...(b.blockDeload ?? {}) },
});
/** Macro edits: the four season dates as ISO days; null = back to the rule. */
function cleanMacro(raw: Record<string, unknown>): MacroEdits {
  const out: MacroEdits = {};
  const d = (raw.dates && typeof raw.dates === "object" ? raw.dates : {}) as Record<string, unknown>;
  for (const k of ["preseasonStart", "seasonEnd", "offseasonStart", "nextPreseasonStart"] as const) {
    if (!(k in d)) continue;
    const v = d[k];
    if (v === null) out[k] = null; else if (typeof v === "string" && ISO.test(v)) out[k] = v;
  }
  return out;
}

type AnyCtx = { seasonYear: number; stored: unknown; summary: () => unknown; write: (userId: string) => Promise<string | null> };
/** Build the draft for a scope (null = nothing to plan). One shape for both scopes. */
async function contextFor(sb: ReturnType<typeof getSupabaseServer>, teamId: string, scope: Scope, fromScratch: boolean, edits: unknown): Promise<AnyCtx | null> {
  if (scope === "macro") {
    const ctx = await buildMacroContext(sb, teamId, { fromScratch, edits: (edits ?? {}) as MacroEdits });
    return ctx && { seasonYear: ctx.seasonYear, stored: ctx.proposal, summary: () => macroSummary(ctx), write: (u) => writeMacroAccept(sb, teamId, u, ctx) };
  }
  const ctx = await buildMesoContext(sb, teamId, { fromScratch, edits: (edits ?? {}) as MesoEdits });
  return ctx && { seasonYear: ctx.seasonYear, stored: ctx.proposal, summary: () => mesoSummary(ctx), write: (u) => writeMesoAccept(sb, teamId, u, ctx) };
}
const NOTHING: Record<Scope, string> = {
  meso: "No season to plan — enter the fixtures first.",
  macro: "No season to plan — enter the fixtures first.",
};

export async function GET(req: Request) {
  try {
    const { sb, teamId } = await auth(req);
    const SCOPE = scopeOf(req);
    if (!SCOPE) return BAD_SCOPE();
    const draft = await openDraft(sb, teamId, SCOPE);
    const { data: last } = await sb.from("plan_proposals").select("accepted_at").eq("team_id", teamId).eq("scope", SCOPE).eq("status", "accepted").order("accepted_at", { ascending: false }).limit(1).maybeSingle();
    let preview = null;
    if (draft && new URL(req.url).searchParams.get("preview") === "1") {
      const ctx = await contextFor(sb, teamId, SCOPE, draft.from_scratch, draft.coach_edits ?? {});
      if (ctx) preview = ctx.summary();
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
    const SCOPE = scopeOf(req);
    if (!SCOPE) return BAD_SCOPE();
    const body = await req.json().catch(() => ({})) as Record<string, unknown> & { action?: string; fromScratch?: boolean };
    const now = new Date().toISOString();

    if (body.action === "build") {
      const fromScratch = !!body.fromScratch;
      const ctx = await contextFor(sb, teamId, SCOPE, fromScratch, {});
      if (!ctx) return NextResponse.json({ ok: false, error: NOTHING[SCOPE] }, { status: 400 });
      // Replace any open draft (one per team and scope): the old one is marked discarded, not deleted (audit trail).
      await sb.from("plan_proposals").update({ status: "discarded", updated_at: now }).eq("team_id", teamId).eq("scope", SCOPE).eq("status", "draft");
      const { data, error } = await sb.from("plan_proposals").insert({
        team_id: teamId, season_year: ctx.seasonYear, scope: SCOPE, status: "draft", from_scratch: fromScratch,
        proposal: ctx.stored, coach_edits: {}, created_by: userId, updated_at: now,
      }).select("id, season_year, from_scratch, proposal, coach_edits, updated_at, created_at").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, draft: data });
    }

    const draft = await openDraft(sb, teamId, SCOPE);
    if (!draft) return NextResponse.json({ ok: false, error: "No open draft" }, { status: 404 });

    if (body.action === "edit") {
      const edits: unknown = SCOPE === "meso" ? mergeMeso(draft.coach_edits as MesoEdits | null, cleanMeso(body))
        : { ...((draft.coach_edits as MacroEdits | null) ?? {}), ...cleanMacro(body) };
      const ctx = await contextFor(sb, teamId, SCOPE, draft.from_scratch, edits);
      if (!ctx) return NextResponse.json({ ok: false, error: NOTHING[SCOPE] }, { status: 400 });
      const { data, error } = await sb.from("plan_proposals").update({ proposal: ctx.stored, coach_edits: edits, updated_at: now })
        .eq("id", draft.id).eq("team_id", teamId).select("id, season_year, from_scratch, proposal, coach_edits, updated_at, created_at").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, draft: data });
    }

    if (body.action === "accept") {
      // Rebuilt on today's data, so a fixture or day saved since the draft is respected.
      const ctx = await contextFor(sb, teamId, SCOPE, draft.from_scratch, draft.coach_edits ?? {});
      if (!ctx) return NextResponse.json({ ok: false, error: NOTHING[SCOPE] }, { status: 400 });
      const summary = ctx.summary();
      const err = await ctx.write(userId);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });
      await sb.from("plan_proposals").update({ status: "accepted", proposal: ctx.stored, accept_summary: summary, accepted_by: userId, accepted_at: now, updated_at: now })
        .eq("id", draft.id).eq("team_id", teamId);
      return NextResponse.json({ ok: true, summary });
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
