// src/app/player/page.tsx
import { Suspense } from "react";
import PlayerTabbedClient from "./PlayerTabbedClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlayerTabbedClient />
    </Suspense>
  );
}
