"use client";

/**
 * Coach view — Coaching Library hub. Thin route wrapper around the shared <CoachingLibrary />
 * component (the same component the coach Today dashboard mounts in its Library tab — one source
 * of truth). Self-resolves team context here; syncs the inner tab to the bare `?tab=` on this route.
 */

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import CoachingLibrary from "@/components/coach/CoachingLibrary";

export default function CoachLibraryPage() {
  // useSearchParams (inside CoachingLibrary) must sit under a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      <CoachingLibrary syncParam="tab" showHeader />
    </Suspense>
  );
}
