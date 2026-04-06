import { Suspense } from "react";
import DisplayClient from "./DisplayClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Hleð…</div>}>
      <DisplayClient />
    </Suspense>
  );
}
