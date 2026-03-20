import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getValdAccountState, listValdSyncHistory, listValdUnmatchedAthletes, syncValdData } from "@/lib/integrations/vald";
import { maskSecret } from "@/lib/integrations/vald/config";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ teamId: string; userId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getSupabaseServer();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: profile, error: profileErr } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  if (profileErr) throw profileErr;
  const role = String((profile as Record<string, unknown> | null)?.role ?? "").toUpperCase();
  const teamId = String((profile as Record<string, unknown> | null)?.team_id ?? "");
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!teamId) throw new Error("No team context");
  return { teamId, userId: userRes.user.id };
}

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const [account, history, unmatched] = await Promise.all([
      getValdAccountState(teamId),
      listValdSyncHistory(teamId),
      listValdUnmatchedAthletes(teamId).catch(() => []),
    ]);
    return NextResponse.json({
      ok: true,
      account: account
        ? {
            ...account,
            encrypted_client_id: maskSecret(account.encrypted_client_id),
            encrypted_client_secret: account.encrypted_client_secret ? "saved" : null,
            encrypted_api_key: maskSecret(account.encrypted_api_key),
            encrypted_access_token: account.encrypted_access_token ? "saved" : null,
            encrypted_refresh_token: account.encrypted_refresh_token ? "saved" : null,
          }
        : null,
      history,
      unmatched,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load VALD state." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { teamId, userId } = await requireCoach(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await syncValdData({
      teamId,
      dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : null,
      dateTo: typeof body.dateTo === "string" ? body.dateTo : null,
      athleteIds: Array.isArray(body.athleteIds) ? body.athleteIds.map(String) : null,
      syncType: "manual",
      requestedBy: userId,
    });
    return NextResponse.json({ ok: result.status !== "failed", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "VALD sync failed." }, { status: 400 });
  }
}
