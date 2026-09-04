"use client";

export const dynamic = "force-dynamic";

/**
 * Renamed route. The force-plate / VALD assessment index moved to /coach/force-plate so "rtp" stops
 * colliding with return-to-play (Injuries / RTP). This redirect keeps old links / bookmarks working.
 */
import * as React from "react";
import { useRouter } from "next/navigation";

export default function RtpIndexMoved() {
  const router = useRouter();
  React.useEffect(() => { router.replace("/coach/force-plate"); }, [router]);
  return null;
}
