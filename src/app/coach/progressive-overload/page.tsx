"use client";

export const dynamic = "force-dynamic";

/**
 * Retired route. Progressive Overload folded into the Periodization Hub: the Meso Cycle ramp is now
 * engine-driven (differentiated per-KPI rates + match ceiling), and the per-player build-up plan lives
 * on the Players tab. This redirect keeps old links / tutorial deep-links working.
 * The engine (src/lib/micropulse/progressiveOverload) + ProgressiveOverloadCard live on as the hub's.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

export default function RetiredProgressiveOverloadPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/coach/periodization-hub?tab=players");
  }, [router]);
  return null;
}
