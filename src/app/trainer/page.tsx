"use client";

/**
 * /trainer
 *
 * DEPRECATED — replaced by the existing TrainerDashboard mounted inside
 * /coach when active team has team_type='personal_trainer'. This route
 * just redirects to /coach so the existing UI takes over (which already
 * handles the PT case via DevCoachDashboardClient).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TrainerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/coach"); }, [router]);
  return null;
}
