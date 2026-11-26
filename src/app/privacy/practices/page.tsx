"use client";

import LegalDocument from "@/components/legal/LegalDocument";
import { PRACTICE_PRIVACY } from "@/lib/legal/practicePrivacy";
import { PRACTICE_TERMS_VERSION } from "@/lib/legal/operator";

export default function PracticePrivacyPage() {
  return (
    <LegalDocument
      text={PRACTICE_PRIVACY}
      version={PRACTICE_TERMS_VERSION}
      related={[
        { href: "/terms", label: { EN: "Terms for practices", IS: "Skilmálar fyrir stofur" } },
        { href: "/privacy?for=client", label: { EN: "What your clients see", IS: "Það sem viðskiptavinir sjá" } },
      ]}
    />
  );
}
