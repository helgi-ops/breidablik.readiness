/**
 * /api/trainer/client/[id]/summary
 *
 *   GET  ?window=7|14|30&lang=IS|EN&refresh=1
 *     - Returns cached summary for (trainer, client, window, lang) if fresh
 *       (≤ 6h old) and refresh != 1.
 *     - Otherwise generates a new one via lib/trainer/clientSummary, caches,
 *       and returns it.
 *     - When the client has < MIN_READINESS_FOR_SUMMARY check-ins in the
 *       window, returns { ok: true, output: null, reason: "not_enough_data" }.
 *
 * Auth model:
 *   - Caller must be the trainer (profiles.role in COACH/ADMIN/STAFF) for
 *     the team that owns the client. ADMIN can read any client (super-admin
 *     pilot mode for Helgi).
 *   - The cache key is keyed on (trainer_id = auth.uid, client_id) so two
 *     trainers sharing a Supabase team never see each other's caches.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  generateClientSummary,
  MIN_READINESS_FOR_SUMMARY,
  PT_SUMMARY_MODEL,
  type SummaryLang,
  type SummaryWindow,
} from "@/lib/trainer/clientSummary";

export const runtime = "nodejs";

const CACHE_TTL_HOURS = 6;

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
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
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Forbidden", status: 403 } as const;
  }

  // Admins (Helgi pilot mode) can read any client. Otherwise verify the
  // client belongs to a team this user has access to.
  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    const { data: clientRow } = await sb
      .from("players")
      .select("team_id, full_name")
      .eq("id", clientId)
      .maybeSingle();
    if (!clientRow) return { error: "Client not found", status: 404 } as const;
    const clientTeamId = (clientRow as { team_id?: string | null }).team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;

    // Primary-team match OR coach_teams membership.
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb
        .from("coach_teams")
        .select("team_id")
        .eq("coach_id", userId)
        .eq("team_id", clientTeamId)
        .maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
    return { userId, sb, clientName: (clientRow as { full_name?: string }).full_name ?? "Client" } as const;
  }

  // ADMIN path: still need the client name for the prompt.
  const { data: clientRow } = await sb.from("players").select("full_name").eq("id", clientId).maybeSingle();
  return { userId, sb, clientName: (clientRow as { full_name?: string } | null)?.full_name ?? "Client" } as const;
}

function parseWindow(raw: string | null): SummaryWindow {
  const n = Number(raw);
  return (n === 7 || n === 14 || n === 30) ? (n as SummaryWindow) : 14;
}

function parseLang(raw: string | null): SummaryLang {
  return raw === "EN" ? "EN" : "IS";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { userId, sb, clientName } = a;

  const url = new URL(req.url);
  const windowDays = parseWindow(url.searchParams.get("window"));
  const lang = parseLang(url.searchParams.get("lang"));
  const refresh = url.searchParams.get("refresh") === "1";

  // ── Cache lookup ─────────────────────────────────────────────────────
  if (!refresh) {
    const { data: cached } = await sb
      .from("pt_client_summary_cache")
      .select("*")
      .eq("trainer_id", userId)
      .eq("client_id", clientId)
      .eq("window_days", windowDays)
      .eq("lang", lang)
      .maybeSingle();
    if (cached) {
      const ageHours = (Date.now() - new Date((cached as { generated_at: string }).generated_at).getTime()) / 3_600_000;
      if (ageHours < CACHE_TTL_HOURS) {
        const c = cached as {
          digest: string | null; summary: string; readiness_n: number;
          generated_at: string; lang: string;
        };
        return NextResponse.json({
          ok: true,
          output: c.digest ? { digest: c.digest, summary: c.summary } : null,
          readinessN: c.readiness_n,
          cached: true,
          generatedAt: c.generated_at,
          lang: c.lang,
          windowDays,
        });
      }
    }
  }

  // ── Generate fresh ───────────────────────────────────────────────────
  try {
    const { output, readinessN, tokens } = await generateClientSummary(sb, clientId, clientName, windowDays, lang);

    if (!output) {
      // Empty-state — still cache the "no signal" verdict so we don't pay
      // for a re-attempt on every dashboard refresh. Keep summary text
      // user-facing so the UI can render it directly.
      const noDataMessage = lang === "IS"
        ? `Ekki nóg gögn enn — þarf a.m.k. ${MIN_READINESS_FOR_SUMMARY} check-ins á síðustu ${windowDays} dögum.`
        : `Not enough data yet — need at least ${MIN_READINESS_FOR_SUMMARY} check-ins in the last ${windowDays} days.`;
      await sb.from("pt_client_summary_cache").upsert({
        trainer_id: userId, client_id: clientId, window_days: windowDays, lang,
        digest: null,
        summary: noDataMessage,
        readiness_n: readinessN,
        model: PT_SUMMARY_MODEL,
        input_tokens: null,
        output_tokens: null,
        generated_at: new Date().toISOString(),
      }, { onConflict: "trainer_id,client_id,window_days,lang" });
      return NextResponse.json({
        ok: true, output: null, readinessN, reason: "not_enough_data",
        message: noDataMessage,
      });
    }

    await sb.from("pt_client_summary_cache").upsert({
      trainer_id: userId, client_id: clientId, window_days: windowDays, lang,
      digest: output.digest,
      summary: output.summary,
      readiness_n: readinessN,
      model: PT_SUMMARY_MODEL,
      input_tokens: tokens.input ?? null,
      output_tokens: tokens.output ?? null,
      generated_at: new Date().toISOString(),
    }, { onConflict: "trainer_id,client_id,window_days,lang" });

    return NextResponse.json({ ok: true, output, readinessN, cached: false, windowDays, lang });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
