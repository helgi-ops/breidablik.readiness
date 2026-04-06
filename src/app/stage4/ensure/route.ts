import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readEnv(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing Bearer token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const player_id = String(body?.player_id ?? "");
    const entry_date = String(body?.entry_date ?? "");

    if (!UUID_RE.test(player_id)) {
      return NextResponse.json({ ok: false, error: "player_id must be a valid UUID" }, { status: 400 });
    }
    if (!ISO_DATE_RE.test(entry_date)) {
      return NextResponse.json({ ok: false, error: "entry_date must be YYYY-MM-DD" }, { status: 400 });
    }

    const supabaseUrl = readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = readEnv("SUPABASE_ANON_KEY") ?? readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase environment variables are missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }

    const { error } = await supabase.rpc("stage4_ensure_decision", {
      p_player_id: player_id,
      p_entry_date: entry_date,
    });

    if (error) {
      const message = error.message ?? "Failed to ensure decision";
      const lowered = message.toLowerCase();
      const status = lowered.includes("permission") || lowered.includes("forbidden") ? 403 : 400;
      return NextResponse.json(
        {
          ok: false,
          error: message,
          code: error.code ?? null,
          details: error.details ?? null,
          hint: error.hint ?? null,
        },
        { status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
