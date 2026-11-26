import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "MicroPulse — training load and readiness, explained" },
  description: "Readiness and training load for football clubs, basketball teams and personal trainers. Rules decide; every verdict shows its reasons and its confidence.",
  alternates: { canonical: "/home" },
  openGraph: { title: "MicroPulse — training load and readiness, explained", description: "Readiness and training load for football clubs, basketball teams and personal trainers. Rules decide; every verdict shows its reasons and its confidence.", url: "/home" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
