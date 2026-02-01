"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";

export default function AuthRedirectPage() {
  return (
    <Suspense fallback={<div />}>
      {/* Redirect logic is isolated in client component */}
      <RedirectClient />
    </Suspense>
  );
}

function RedirectClient() {
  // ⚠️ Import dynamically INSIDE component
  const RedirectInner = require("./redirect-inner").default;
  return <RedirectInner />;
}
