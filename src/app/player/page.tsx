// src/app/player/page.tsx
import { Suspense } from "react";
import PlayerTabbedClient from "./PlayerTabbedClient";
import PtClientGuard from "@/components/auth/PtClientGuard";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      {/* PT clients belong on /client, not the football player surface. */}
      <PtClientGuard />
      <PlayerTabbedClient />
    </Suspense>
  );
}
