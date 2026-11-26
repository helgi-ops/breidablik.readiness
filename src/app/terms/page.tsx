"use client";

import LegalDocument from "@/components/legal/LegalDocument";
import { PRACTICE_TERMS } from "@/lib/legal/practiceTerms";
import { PRACTICE_TERMS_VERSION } from "@/lib/legal/operator";

export default function TermsPage() {
  return (
    <LegalDocument
      text={PRACTICE_TERMS}
      version={PRACTICE_TERMS_VERSION}
      related={[
        { href: "/privacy/practices", label: { EN: "Privacy and data processing for practices", IS: "Persónuvernd og vinnsla fyrir stofur" } },
        { href: "/privacy?for=client", label: { EN: "Privacy for your clients", IS: "Persónuvernd viðskiptavina" } },
        { href: "/help?for=trainers", label: { EN: "Help", IS: "Hjálp" } },
      ]}
    />
  );
}
