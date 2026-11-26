import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Start your practice · MicroPulse" },
  description: "One-step signup for personal trainers and S&C coaches. Invite a client and send a first session in under 10 minutes.",
  alternates: { canonical: "/signup/trainer" },
  openGraph: { title: "Start your practice · MicroPulse", description: "One-step signup for personal trainers and S&C coaches. Invite a client and send a first session in under 10 minutes.", url: "/signup/trainer", images: ["/opengraph-image"] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
