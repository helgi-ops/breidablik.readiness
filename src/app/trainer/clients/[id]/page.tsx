"use client";

/**
 * /trainer/clients/[id]
 *
 * DEPRECATED stub — see comment in /trainer/page.tsx.
 * Client detail flows live inside TrainerDashboard now.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TrainerClientRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/coach"); }, [router]);
  return null;
}
