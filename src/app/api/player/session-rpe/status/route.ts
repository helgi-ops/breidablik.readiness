import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { getPlayerRpeStatus } from "@/lib/session-rpe/compliance";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

type DbLikeError = {
  code?: string;
  message?: string;
  details?: string;
};

function isMissingSessionRpeTableError(error: DbLikeError | null | undefined): boolean {
  const code = String(error?.code ?? "");
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("session_rpe_entries") && (text.includes("schema cache") || text.includes("does not exist"));
}

function schemaMissingResponse(details?: string) {
  return NextResponse.json(
    {
      ok: false,
      code: "SESSION_RPE_SCHEMA_MISSING",
      error: "Session RPE database table is missing or not applied yet.",
      ...(process.env.NODE_ENV !== "production"
        ? {
            details: details ?? null,
            fix: "Run Supabase migrations (for example: supabase db push) and refresh schema cache.",
          }
        : {}),
    },
    { status: 500 }
  );
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const url = new URL(req.url);
    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(url.searchParams.get("date")) ?? getDateKeyInTimezone(new Date(), timeZone);

    const status = await getPlayerRpeStatus(sb, {
      playerId,
      dateKey,
      timeZone,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error: unknown) {
    if (isMissingSessionRpeTableError(error as DbLikeError)) {
      return schemaMissingResponse(error instanceof Error ? error.message : "Unknown error");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}
