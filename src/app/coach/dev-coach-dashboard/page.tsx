import { notFound } from "next/navigation";
import DevCoachDashboardClient from "./DevCoachDashboardClient";

export const dynamic = "force-dynamic";

export default function Page() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DevCoachDashboardClient />;
}
