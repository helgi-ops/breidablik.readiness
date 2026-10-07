"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import WearableConnectCard from "@/components/player/WearableConnectCard";

/**
 * Player integrations settings. This is the page the Terra widget redirects back
 * to (…/player/settings/integrations?connected=terra). It renders the Stack-A,
 * data-driven WearableConnectCard — so "Connect watch" goes through Terra (the
 * single entry), not the old Whoop-only direct flow. Already-connected direct
 * links keep working through their own status/sync elsewhere.
 */
export default function PlayerIntegrationsSettingsPage() {
  const router = useRouter();
  // Escape hatch: this sub-page has no bottom nav, so in the installed PWA
  // (standalone, no browser back button) the player could get trapped. Go back
  // if there's history, otherwise land on Today.
  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/player");
  }, [router]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10">
      <div
        className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-[var(--surface,#f4f2ec)]/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Back to app"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
        >
          <span aria-hidden className="text-base leading-none">←</span> Back
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Player settings</div>
        <h1 className="mt-1 text-xl font-semibold text-zinc-950">Integrations</h1>
        <div className="mt-4">
          <WearableConnectCard />
        </div>
      </div>
    </main>
  );
}
