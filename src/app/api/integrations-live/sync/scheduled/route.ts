import { NextResponse } from "next/server";
import { getAvailableProviderDescriptors } from "@/lib/micropulse/integrations";
import { runScheduledSync } from "@/lib/micropulse/integrationsLive";
import { parseProvider } from "../../_shared";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const secret = process.env.INTEGRATIONS_LIVE_CRON_SECRET || "";
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  return querySecret === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { provider?: string };
    const single = body.provider ? parseProvider(body.provider) : null;
    const providers = single
      ? [single]
      : getAvailableProviderDescriptors().map((descriptor) => descriptor.provider);
    const results = [];
    for (const provider of providers) {
      results.push(await runScheduledSync(provider));
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
