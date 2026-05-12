import { Suspense } from "react";
import RecoveryDisplayClient from "./RecoveryDisplayClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <RecoveryDisplayClient />
    </Suspense>
  );
}
