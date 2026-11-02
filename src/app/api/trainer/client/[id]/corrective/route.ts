/**
 * /api/trainer/client/[id]/corrective — AI corrective-exercise prescription for a
 * PT client, from the trainer's free-text injury history.
 *
 *   GET                                          → current active prescription
 *   POST   { injuryText }                        → AI PROPOSAL (not saved)
 *   PUT    { injuryText, items, weekdays, durationMin } → save (upsert active)
 *   DELETE                                       → archive (turn corrective off)
 *
 * AI proposes; the trainer reviews/edits, then PUT saves. Nothing reaches the
 * client until saved. Written only to pt_corrective_prescriptions (PT surface);
 * read by /api/client/today. Screening / training support, never a diagnosis.
 *
 * Auth: coach/admin/staff with access to the client's team.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import {
  generateCorrectiveProposal,
  sanitizeItems,
  sanitizeWeekdays,
  CORRECTIVE_SLUG_TO_LIBRARY,
  type CorrectiveItem,
} from "@/lib/trainer/correctiveFromInjury";
import { plannedWeekdays, weekStartIso } from "@/lib/client/correctiveRun";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Fill a video on each corrective item from the club's own exercise_library,
 *  reusing a curated demo clip (via the slug→library-name map) when the cited
 *  library entry has none. Mutates the items in place; best-effort. */
async function attachLibraryVideos(sb: SupabaseClient, items: CorrectiveItem[]) {
  const names = new Set<string>();
  for (const it of items) {
    if (it.videoUrl || !it.slug) continue;
    const lib = CORRECTIVE_SLUG_TO_LIBRARY[it.slug];
    if (lib) names.add(lib);
  }
  if (names.size === 0) return;
  const { data } = await sb
    .from("exercise_library")
    .select("name, video_url")
    .in("name", [...names]);
  const byName = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ name: string; video_url: string | null }>) {
    if (r.video_url) byName.set(r.name, r.video_url);
  }
  for (const it of items) {
    if (it.videoUrl || !it.slug) continue;
    const url = byName.get(CORRECTIVE_SLUG_TO_LIBRARY[it.slug] ?? "");
    if (url) it.videoUrl = url;
  }
}

async function requireTrainerForClient(req: Request, clientId: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Forbidden", status: 403 } as const;

  const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
  if (!clientRow) return { error: "Client not found", status: 404 } as const;
  const clientTeamId = (clientRow as { team_id?: string | null }).team_id ?? null;

  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb.from("coach_teams").select("team_id")
        .eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId, teamId: clientTeamId } as const;
}

type Row = {
  injury_text: string | null;
  extracted: unknown;
  structure: { items?: CorrectiveItem[] } | null;
  weekdays: number[] | null;
  duration_min: number | null;
  status: string | null;
  model: string | null;
  updated_at: string | null;
};

function toClient(row: Row | null) {
  if (!row || row.status !== "active") return null;
  return {
    injuryText: row.injury_text ?? "",
    items: Array.isArray(row.structure?.items) ? row.structure!.items : [],
    weekdays: Array.isArray(row.weekdays) ? row.weekdays : [],
    durationMin: row.duration_min ?? null,
    model: row.model ?? null,
    extracted: row.extracted ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { data, error } = await a.sb
    .from("pt_corrective_prescriptions")
    .select("injury_text, extracted, structure, weekdays, duration_min, status, model, updated_at")
    .eq("player_id", clientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // How the client is actually doing it: this week's count + latest pain answer.
  const row = data as { structure?: { items?: Array<{ days?: number[] | null }> } | null; weekdays?: number[] | null } | null;
  const today = new Date().toISOString().slice(0, 10);
  const { data: logs } = await a.sb
    .from("pt_corrective_logs")
    .select("log_date, pain")
    .eq("player_id", clientId)
    .order("log_date", { ascending: false })
    .limit(14);
  const logRows = (logs ?? []) as Array<{ log_date: string; pain: "none" | "little" | "yes" }>;
  const weekStart = weekStartIso(today);
  const adherence = {
    weekDone: logRows.filter((l) => l.log_date >= weekStart).length,
    weekPlanned: plannedWeekdays(row?.structure?.items ?? [], row?.weekdays ?? []).length,
    lastPain: logRows[0]?.pain ?? null,
    lastDate: logRows[0]?.log_date ?? null,
  };
  return NextResponse.json({ ok: true, prescription: toClient(data as Row | null), adherence });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { injuryText?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const injuryText = String(body.injuryText ?? "").trim();
  if (injuryText.length < 10) return NextResponse.json({ error: "Lýstu meiðslunum í aðeins meiri texta." }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });

  try {
    const proposal = await generateCorrectiveProposal({ apiKey, injuryText });
    await attachLibraryVideos(a.sb, proposal.items); // reuse the club's curated videos
    return NextResponse.json({ ok: true, proposal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    // Non-JSON / parse failure → 422, like the clinical extractor; network → 502.
    const status = /JSON|parse|readable/i.test(msg) ? 422 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { injuryText?: unknown; items?: unknown; weekdays?: unknown; durationMin?: unknown; extracted?: unknown; model?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const items = sanitizeItems(body.items);
  if (items.length === 0) return NextResponse.json({ error: "Engar æfingar valdar." }, { status: 400 });
  // Per-item days let the trainer put different exercises on different days. The
  // prescription's weekdays = the union of every item's days; an item left with
  // no days of its own falls back to the globally-selected days.
  const sentWeekdays = sanitizeWeekdays(body.weekdays);
  const union = new Set<number>(items.some((it) => !it.days || it.days.length === 0) ? sentWeekdays : []);
  for (const it of items) for (const d of it.days ?? []) union.add(d);
  const weekdays = [...union].sort((a, b) => a - b);
  if (weekdays.length === 0) return NextResponse.json({ error: "Veldu a.m.k. einn dag." }, { status: 400 });
  const durRaw = Number(body.durationMin);
  const durationMin = Number.isFinite(durRaw) && durRaw > 0 ? Math.min(180, Math.round(durRaw)) : null;

  const { error } = await a.sb
    .from("pt_corrective_prescriptions")
    .upsert(
      {
        player_id: clientId,
        team_id: a.teamId,
        trainer_id: a.userId,
        injury_text: String(body.injuryText ?? "").trim() || null,
        extracted: body.extracted ?? null,
        structure: { block: "Corrective", items },
        weekdays,
        duration_min: durationMin,
        status: "active",
        model: typeof body.model === "string" ? body.model : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { error } = await a.sb
    .from("pt_corrective_prescriptions")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("player_id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
