"use client";

export const dynamic = "force-dynamic";

/**
 * Retired route. Player Statistics merged into Player Analysis, where the data source
 * (Wyscout | StatsBomb) is a toggle within one page. Redirect keeps old links/bookmarks
 * working, landing on the Wyscout view.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

export default function RetiredPlayerStatsPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/coach/player-analysis?source=wyscout");
  }, [router]);
  return null;
}
