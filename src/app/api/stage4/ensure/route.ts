import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // Forward to the canonical endpoint to avoid duplicate logic
  const body = await req.text();

  const res = await fetch(new URL("/api/stage4/ensure-decision", req.url), {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
      Authorization: req.headers.get("authorization") ?? "",
    },
    body,
  });

  const text = await res.text();

  // ✅ Copy headers safely
  const headers = new Headers();
  res.headers.forEach((value, key) => headers.set(key, value));

  return new NextResponse(text, {
    status: res.status,
    headers,
  });
}