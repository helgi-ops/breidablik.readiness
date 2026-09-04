"use client";

export const dynamic = "force-dynamic";

/** Renamed route → /coach/force-plate/testing-guide. */
import * as React from "react";
import { useRouter } from "next/navigation";

export default function RtpTestingGuideMoved() {
  const router = useRouter();
  React.useEffect(() => { router.replace("/coach/force-plate/testing-guide"); }, [router]);
  return null;
}
