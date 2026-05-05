import { Suspense } from "react";
import DevCoachDashboardClient from "./dev-coach-dashboard/DevCoachDashboardClient";

export const dynamic = "force-dynamic";

// Suspense boundary required because the dashboard now uses
// useSearchParams() — Next.js mandates a Suspense wrapper for any
// client component that subscribes to URL search params, even on
// force-dynamic routes. Without this the App Router throws during
// initial SSR.
export default function CoachPage() {
  return (
    <Suspense fallback={null}>
      <DevCoachDashboardClient />
    </Suspense>
  );
}
