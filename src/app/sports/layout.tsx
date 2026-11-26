import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports",
  description: "How MicroPulse works for football, basketball and other team sports — with or without GPS.",
  alternates: { canonical: "/sports" },
  openGraph: { title: "Sports · MicroPulse", description: "How MicroPulse works for football, basketball and other team sports — with or without GPS.", url: "/sports" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
