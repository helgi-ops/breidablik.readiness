"use client";
export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import SpeedPowerLibrary from "@/components/trainer/SpeedPowerLibrary";

export default function CoachSpeedMethodsPage() {
  const [lang] = useLang();
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <SpeedPowerLibrary lang={lang === "IS" ? "IS" : "EN"} />
    </div>
  );
}
