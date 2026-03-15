import { NextResponse } from "next/server";
import { processIncomingWebhook } from "@/lib/micropulse/integrationsLive";
import { parseProvider } from "../../_shared";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider: providerParam } = await ctx.params;
    const provider = parseProvider(providerParam);
    if (!provider) return NextResponse.json({ ok: false, error: "Invalid provider path." }, { status: 400 });

    const bodyRaw = await req.text();
    let payload: unknown = {};
    try {
      payload = JSON.parse(bodyRaw);
    } catch {
      payload = { raw: bodyRaw };
    }

    const signature =
      req.headers.get("x-signature") ??
      req.headers.get("x-webhook-signature") ??
      req.headers.get("x-hub-signature-256");
    const deliveryId = req.headers.get("x-delivery-id") ?? req.headers.get("x-request-id");
    const eventType = req.headers.get("x-event-type") ?? req.headers.get("x-provider-event");

    const result = await processIncomingWebhook({
      provider,
      bodyRaw,
      payload,
      signature,
      eventType,
      deliveryId,
      allowUnsigned: process.env.NODE_ENV !== "production",
    });

    const status = result.verification.verified ? 200 : 401;
    return NextResponse.json(
      {
        ok: result.verification.verified,
        verification: result.verification,
        result: result.result,
      },
      { status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

