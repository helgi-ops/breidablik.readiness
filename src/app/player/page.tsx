// src/app/player/page.tsx
import { Suspense } from "react";
import PlayerClient from "./PlayerClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlayerClient />
    </Suspense>
  );
}