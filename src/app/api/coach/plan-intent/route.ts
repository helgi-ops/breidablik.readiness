/**
 * /api/coach/plan-intent — what the coach wants from a block (meso) or a week (micro), and the rules' advice.
 *
 * GET  ?scope=block|week&start=YYYY-MM-DD[&weeks&blockGoal&phase]
 *      → { ok, intent: { text, items, unclear, source, aiItems, updatedAt } | null, advice, context }
 * POST { scope, start, text, items?, weeks?, blockGoal?, phase? }
 *      - no `items`: the text is READ into the fixed goal list — by AI for ELITE teams with a key, else by keywords —
 *        then saved. Each read goal must quote the coach's text (sanitizeIntent).
 *      - `items`: the coach's corrected list is saved as is (source "coach"); the text is kept, not read again.
 *      → same shape as GET.
 *
 * The advice is computed by rules (planIntent/recommend.ts) on every call and never stored or applied: each
 * recommendation links to the page where the coach makes the change. The AI only reads the text. Football only.
 * Coach of the team (requireCoachAccessForTeam; the team comes from the server, never the body).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { isEliteTeam } from "@/lib/micropulse/elite";
import { loadPlanContext } from "@/lib/micropulse/planIntent/context";
import { recommendPlan, type PlanContext } from "@/lib/micropulse/planIntent/recommend";
import { readIntentByKeywords } from "@/lib/micropulse/planIntent/keywords";
import { interpretIntentAI } from "@/lib/micropulse/planIntent/interpret";
import { MAX_INTENT_TEXT, sanitizeIntent, type IntentItem, type IntentSource, type PlanScope } from "@/lib/micropulse/planIntent/vocabulary";

export const runtime = "nodejs";
export const maxDuration = 30;

type Row = { text: string; items: unknown; unclear: unknown; read_source: string; ai_items: unknown; updated_at: string };

const asScope = (v: unknown): PlanScope | null => (v === "block" || v === "week" ? v : null);
const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const asSource = (v: unknown): IntentSource => (v === "ai" || v === "coach" ? v : "keywords");

function contextOut(ctx: PlanContext) {
  return { start: ctx.start, weeks: ctx.weeks, phase: ctx.phase, blockGoal: ctx.blockGoal, matchDates: ctx.matchDates, mas: ctx.mas };
}

function intentOut(row: Row | null) {
  if (!row) return null;
  // Read back through the same guard (source "coach" so a hand-set item with no quote survives).
  const clean = sanitizeIntent({ items: row.items, unclear: row.unclear }, row.text, "coach");
  return {
    text: row.text,
    items: clean.items,
    unclear: clean.unclear,
    source: asSource(row.read_source),
    aiItems: Array.isArray(row.ai_items) ? sanitizeIntent({ items: row.ai_items }, row.text, "coach").items : null,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const u = new URL(req.url).searchParams;
    const scope = asScope(u.get("scope"));
    const start = u.get("start");
    if (!scope || !isIso(start)) return NextResponse.json({ error: "scope and start are required" }, { status: 400 });

    const ctx = await loadPlanContext(sb, teamId, { scope, start, weeks: Number(u.get("weeks")) || null, blockGoal: u.get("blockGoal"), phaseHint: u.get("phase") });
    const { data, error } = await sb
      .from("plan_intents")
      .select("text, items, unclear, read_source, ai_items, updated_at")
      .eq("team_id", teamId).eq("scope", scope).eq("start_date", ctx.start)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const intent = intentOut((data ?? null) as Row | null);
    return NextResponse.json({ ok: true, intent, advice: recommendPlan(intent?.items ?? [], ctx), context: contextOut(ctx) });
  } catch (e) {
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId, coachUserId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    const body = (await req.json().catch(() => null)) as {
      scope?: unknown; start?: unknown; text?: unknown; items?: unknown; weeks?: unknown; blockGoal?: unknown; phase?: unknown;
    } | null;
    const scope = asScope(body?.scope);
    if (!scope || !isIso(body?.start)) return NextResponse.json({ error: "scope and start are required" }, { status: 400 });
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_INTENT_TEXT) : "";

    const ctx = await loadPlanContext(sb, teamId, { scope, start: body!.start as string, weeks: Number(body?.weeks) || null, blockGoal: body?.blockGoal, phaseHint: body?.phase });

    const { data: prev } = await sb
      .from("plan_intents").select("ai_items, created_by")
      .eq("team_id", teamId).eq("scope", scope).eq("start_date", ctx.start).maybeSingle();

    let items: IntentItem[];
    let unclear: string[];
    let source: IntentSource;
    let aiItems: unknown = (prev as { ai_items?: unknown } | null)?.ai_items ?? null;

    if (Array.isArray(body?.items)) {
      // The coach's corrected list: only goals on the list, once each; quotes kept only if they are in the text.
      const clean = sanitizeIntent({ items: body!.items }, text, "coach");
      items = clean.items.map((it) => ({ ...it, quote: it.quote && text.toLocaleLowerCase("is").includes(it.quote.toLocaleLowerCase("is")) ? it.quote : "" }));
      unclear = [];
      source = "coach";
    } else {
      let read = null as Awaited<ReturnType<typeof interpretIntentAI>>;
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (text && apiKey && (await isEliteTeam(sb, teamId).catch(() => false))) {
        read = await interpretIntentAI({ apiKey, text, scope });
        if (read) aiItems = read.items;
      }
      if (!read) read = readIntentByKeywords(text);
      items = read.items;
      unclear = read.unclear;
      source = read.source;
      if (source !== "ai") aiItems = null;
    }

    const now = new Date().toISOString();
    const { data: saved, error } = await sb
      .from("plan_intents")
      .upsert({
        team_id: teamId, scope, start_date: ctx.start, text, items, unclear, read_source: source,
        ai_items: aiItems, updated_by: coachUserId, updated_at: now,
        created_by: (prev as { created_by?: string | null } | null)?.created_by ?? coachUserId,
      }, { onConflict: "team_id,scope,start_date" })
      .select("text, items, unclear, read_source, ai_items, updated_at")
      .single();
    if (error) throw new Error(error.message);
    const intent = intentOut(saved as Row);
    return NextResponse.json({ ok: true, intent, advice: recommendPlan(intent?.items ?? [], ctx), context: contextOut(ctx) });
  } catch (e) {
    return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
