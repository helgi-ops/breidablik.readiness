"use client";

export const dynamic = "force-dynamic";

import RecoveryProtocolList from "@/components/recovery/RecoveryProtocolList";

export default function CoachRecoveryProtocolsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Recovery Protocols</h1>
        <p className="text-sm text-slate-600">
          Curated post-match, MD+1, and pre-match routines combining diaphragmatic
          breathing, isometric loading, and applied-neurology drills. Every protocol
          is labelled with an evidence tier so you can match prescription to your
          confidence in the underlying science.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-600">
        <strong>Stage 1A:</strong> read-only library. Auto-assignment from
        Catapult match-load detection and per-player completion tracking come
        next. Today, use this page to browse and prescribe protocols manually
        in conversation with your players.
      </div>

      <RecoveryProtocolList />
    </div>
  );
}
