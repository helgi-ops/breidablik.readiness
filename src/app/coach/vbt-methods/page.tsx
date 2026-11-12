"use client";

/**
 * /coach/vbt-methods
 *
 * Bar-speed (VBT) method library: the six commonly used velocity-based training methods of
 * Weakley et al. 2021 (Strength Cond J 43(2):31–49, Table 5). Reference only; also mounted as the
 * "Bar-speed methods" tab of /coach/programme-library.
 */

export const dynamic = "force-dynamic";

import { useLang } from "@/lib/lang";
import VbtMethodLibrary from "@/components/trainer/VbtMethodLibrary";

export default function CoachVbtMethodsPage() {
  const [lang] = useLang();
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <VbtMethodLibrary lang={lang === "IS" ? "IS" : "EN"} />
    </div>
  );
}
