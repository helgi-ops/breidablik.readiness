export const runtime = "nodejs";

/**
 * /api/public/demo-request
 *
 * POST — public inbound lead capture from the /pricing demo form.
 *        Writes into public.demo_requests via service-role client.
 *        No auth required. Basic field validation + UA/Referer capture.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


const PLANS = ["free", "pro", "pro_indoor", "elite"] as const;
const SPORT_ENVS = ["outdoor", "indoor"] as const;
const LANGS = ["IS", "EN"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function s(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ógilt JSON" },
      { status: 400 },
    );
  }

  const name = s(body.name, 200);
  const email = s(body.email, 200);
  const org = s(body.org, 200);
  const sport = s(body.sport, 100);
  const message = s(body.message, 2000);
  const planRaw = s(body.plan, 50);
  const sportEnvRaw = s(body.sport_env, 50);
  const langRaw = s(body.lang, 10);
  const source = s(body.source, 100) ?? "pricing_page";

  if (!name || !email || !org) {
    return NextResponse.json(
      { ok: false, error: "Nafn, netfang og félag eru áskilin" },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Ógilt netfang" },
      { status: 400 },
    );
  }

  const plan = planRaw && (PLANS as readonly string[]).includes(planRaw) ? planRaw : null;
  const sport_env =
    sportEnvRaw && (SPORT_ENVS as readonly string[]).includes(sportEnvRaw) ? sportEnvRaw : null;
  const lang = langRaw && (LANGS as readonly string[]).includes(langRaw) ? langRaw : null;

  const user_agent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const referrer = req.headers.get("referer")?.slice(0, 1000) ?? null;

  const supabase = getSupabase();
  const { error } = await supabase.from("demo_requests").insert({
    name,
    email: email.toLowerCase(),
    org,
    sport,
    message,
    plan,
    sport_env,
    lang,
    source,
    user_agent,
    referrer,
  });

  if (error) {
    // Do not leak internal details to public form
    console.error("[demo-request] insert failed:", error.message);
    return NextResponse.json(
      { ok: false, error: "Óvænt villa, reyndu aftur" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
