"use client";

export const dynamic = "force-dynamic";

import MovementVisionAnalysis from "@/components/movement/MovementVisionAnalysis";
import MovementScreenClient from "@/components/movement/MovementScreenClient";

export default function MovementScreenPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <MovementVisionAnalysis />
      <MovementScreenClient />
    </div>
  );
}
