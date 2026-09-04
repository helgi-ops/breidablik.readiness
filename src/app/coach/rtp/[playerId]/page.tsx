"use client";

export const dynamic = "force-dynamic";

/** Renamed route → /coach/force-plate/[playerId] (the per-player VALD/force-plate assessment report). */
import * as React from "react";
import { useRouter, useParams } from "next/navigation";

export default function RtpPlayerMoved() {
  const router = useRouter();
  const params = useParams();
  React.useEffect(() => {
    const id = Array.isArray(params?.playerId) ? params.playerId[0] : params?.playerId;
    router.replace(id ? `/coach/force-plate/${id}` : "/coach/force-plate");
  }, [router, params]);
  return null;
}
