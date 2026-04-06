import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { listValdUnmatchedAthletes, saveValdAthleteMapping } from "@/lib/integrations/vald";

export const runtime = "nodejs";

async function requireCoach(req: Request): Promise<{ teamId: string }> {
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
  return { teamId };
}

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const unmatched = await listValdUnmatchedAthletes(teamId);
    return NextResponse.json({ ok: true, unmatched });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load mappings." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const body = (await req.json()) as Record<string, unknown>;
    const saved = await saveValdAthleteMapping({
      teamId,
      microplayerId: String(body.microplayerId),
      valdAthleteId: String(body.valdAthleteId),
      valdAthleteName: typeof body.valdAthleteName === "string" ? body.valdAthleteName : null,
      valdEmail: typeof body.valdEmail === "string" ? body.valdEmail : null,
      valdExternalRef: typeof body.valdExternalRef === "string" ? body.valdExternalRef : null,
      matchSource: (typeof body.matchSource === "string" ? body.matchSource : "manual") as "manual" | "email" | "external_id" | "name_fuzzy",
      confidence: typeof body.confidence === "number" ? body.confidence : 1,
      isActive: body.isActive !== false,
    });
    return NextResponse.json({ ok: true, mapping: saved });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save mapping." }, { status: 400 });
  }
}
