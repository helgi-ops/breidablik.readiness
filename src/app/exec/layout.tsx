import type { Metadata } from "next";
import ExecShell from "./ExecShell";

export const metadata: Metadata = {
  title: "MicroPulse — Stjórnandi",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MP Stjórnandi" },
};

export default function ExecLayout({ children }: { children: React.ReactNode }) {
  return <ExecShell>{children}</ExecShell>;
}
