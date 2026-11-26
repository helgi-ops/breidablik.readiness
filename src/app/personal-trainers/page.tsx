import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";
import TrainersLanding from "./TrainersLanding";

const TITLE = "MicroPulse for personal trainers";
const DESCRIPTION =
  "Programmes, logged sets, sessions that adapt to how your clients feel, and a monthly report — in one app for you and your clients. Free in early access.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/personal-trainers" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/personal-trainers" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function PersonalTrainersPage() {
  // Hidden until the practice terms are final (see PT_SELF_SERVE_PUBLIC).
  if (!PT_SELF_SERVE_PUBLIC) notFound();
  return <TrainersLanding />;
}
