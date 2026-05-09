"use client";

export const dynamic = "force-dynamic";

import RecoveryProtocolList from "@/components/recovery/RecoveryProtocolList";

export default function PlayerRecoveryProtocolsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Recovery Routines</h1>
        <p className="text-sm text-slate-600">
          Short, structured routines for after a hard match, the morning of MD+1,
          and pre-match activation. Each one tells you exactly what to do, in what
          order, with timing and breath cues.
        </p>
      </header>

      <RecoveryProtocolList />
    </div>
  );
}
