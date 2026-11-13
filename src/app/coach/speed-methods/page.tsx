"use client";
export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import SpeedMethodLibrary from "@/components/trainer/SpeedMethodLibrary";

export default function CoachSpeedMethodsPage() {
  const [lang] = useLang();
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <SpeedMethodLibrary lang={lang === "IS" ? "IS" : "EN"} />
    </div>
  );
}
