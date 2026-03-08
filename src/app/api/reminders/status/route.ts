import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCoachReminderStatus, getReminderContext } from "@/lib/reminders/checkinReminders";

export const runtime = "nodejs";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

type ProfileRoleRow = {
  role: string | null;
};

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

async function requireCoachUser(sb: ReturnType<typeof getAdminClient>, req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const userId = userRes.user.id;
  const { data: prof, error: pErr } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (pErr) throw new Error(pErr.message);

  const role = String((prof as ProfileRoleRow | null)?.role ?? "").toUpperCase();
  const isCoach = role === "COACH" || role === "ADMIN" || role === "STAFF";
  if (!isCoach) throw new Error("Forbidden");
}

export async function GET(req: Request) {
  try {
    const sb = getAdminClient();
    await requireCoachUser(sb, req);

    const url = new URL(req.url);
    const dateKey = url.searchParams.get("dateKey") || getReminderContext().dateKey;

    const status = await getCoachReminderStatus(sb, {
      dateKey,
    });

    return NextResponse.json({ ok: true, status });
  } catch (e: unknown) {
    const msg = errorMessage(e);
    const statusCode = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: statusCode });
  }
}
