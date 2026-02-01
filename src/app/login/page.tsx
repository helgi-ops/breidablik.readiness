"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import LoginInner from "./LoginInner";

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
