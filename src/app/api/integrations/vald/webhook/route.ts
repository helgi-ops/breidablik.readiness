import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

function verifySignature(body: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-vald-signature");
  if (!verifySignature(raw, signature, process.env.VALD_WEBHOOK_SECRET)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
  }
  return NextResponse.json(
    {
      ok: false,
      error: "VALD webhook processing is not enabled yet.",
      code: "VALD_WEBHOOK_NOT_IMPLEMENTED",
    },
    { status: 501 }
  );
}
