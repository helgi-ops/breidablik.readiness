import ClinicalReportsClient from "@/components/clinical/ClinicalReportsClient";

// Health/PHI data — always render fresh (signed URLs, per-coach team scope).
export const dynamic = "force-dynamic";

export default function ClinicalReportsPage() {
  return <ClinicalReportsClient />;
}
