import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { syncValdData } from "@/lib/integrations/vald";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ teamId: string; userId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getSupabaseServer();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: profile } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((profile as Record<string, unknown> | null)?.role ?? "").toUpperCase();
  const teamId = String((profile as Record<string, unknown> | null)?.team_id ?? "");
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!teamId) throw new Error("No team context");
  return { teamId, userId: userRes.user.id };
}

export async function POST(req: Request) {
  try {
    const { teamId, userId } = await requireCoach(req);
    const body = (await req.json()) as Record<string, unknown>;
    const result = await syncValdData({
      teamId,
      dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : null,
      dateTo: typeof body.dateTo === "string" ? body.dateTo : null,
      athleteIds: Array.isArray(body.athleteIds) ? body.athleteIds.map(String) : null,
      syncType: "date_range",
      requestedBy: userId,
      forceReprocess: true,
    });
    return NextResponse.json({ ok: result.status !== "failed", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "VALD re-sync failed." }, { status: 400 });
  }
}
