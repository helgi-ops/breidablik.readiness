import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    if (!player_id) {
      return NextResponse.json({ ok: false, error: "player_id is required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
      return NextResponse.json({ ok: false, error: "entry_date must be YYYY-MM-DD" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data, error } = await supabase.rpc("stage4_ensure_decision", {
      p_player_id: player_id,
      p_entry_date: entry_date,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, details: (error as any).details ?? null },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, row: Array.isArray(data) ? data[0] : data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
