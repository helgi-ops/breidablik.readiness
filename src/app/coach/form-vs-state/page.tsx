"use client";

export const dynamic = "force-dynamic";

/**
 * Retired route. Form vs State folded into Total Player Analysis — it's a sub-read of the player's
 * footballer profile (is a recent OBV dip real form loss, or was he compromised / a hard fixture?),
 * not its own destination. This redirect keeps old links / the form-vs-state tutorial deep-link working.
 * FormVsStatePanel + /api/coach/form-vs-state + lib/micropulse/formVsState live on as the hub's module.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

export default function RetiredFormVsStatePage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/coach/total-player-analysis");
  }, [router]);
  return null;
}
