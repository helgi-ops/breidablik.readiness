"use client";

/**
 * /coach/isometric-protocols
 *
 * Evidence-based isometric protocol library for team coaches (sits under
 * "Strength Planning" in the sidebar). Wraps the same IsometricProtocolLibrary
 * component that the personal-trainer side uses inside its dashboard.
 *
 * Reference: Lum & Barbosa 2019 (isometric training adaptations); Suchomel
 * 2018 (block periodisation); see protocols.ts for full citations per
 * protocol entry.
 */

export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import IsometricProtocolLibrary from "@/components/trainer/IsometricProtocolLibrary";

export default function CoachIsometricProtocolsPage() {
  const [lang] = useLang();
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <IsometricProtocolLibrary lang={lang === "EN" ? "EN" : "IS"} />
    </div>
  );
}
