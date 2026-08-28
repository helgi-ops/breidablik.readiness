"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type GpsProvider = "catapult" | "statsport" | "none";

// `comingSoon` providers are shown on the roadmap but NOT selectable — they have no
// live auto-sync yet, so a team can't set gps_provider to them (which would fall the
// Today sync button through to Catapult). Honest per the manifesto: no faked capability.
type ProviderCard = {
  id: GpsProvider | "wimu";
  label: string;
  description: string;
  logo: string;
  comingSoon?: boolean;
  previewHref?: string;
};

const GPS_PROVIDERS: ProviderCard[] = [
  {
    id: "catapult",
    label: "Catapult",
    description: "Catapult OpenField GPS tracking — Player Load, velocity bands, metabolic power, IMA.",
    logo: "🏷️",
  },
  {
    id: "statsport",
    label: "STATSports",
    description: "STATSports Sonra GPS tracking — Dynamic Stress Load, HSR, speed zones, heart rate.",
    logo: "📡",
  },
  {
    id: "wimu",
    label: "Hudl WIMU",
    description: "Hudl WIMU PRO GPS tracking — CSV upload. Preview available; auto-sync not live yet.",
    logo: "🛰️",
    comingSoon: true,
    previewHref: "/coach/integrations/wimu",
  },
  {
    id: "none",
    label: "Ekkert / None",
    description: "Ekkert GPS-kerfi tengt. GPS-gögnin verða ekki sótt sjálfvirkt.",
    logo: "⚪",
  },
];

export default function GpsProviderSettings({ teamId }: { teamId: string | null }) {
  const [current, setCurrent] = useState<GpsProvider>("catapult");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!teamId) return;
    const supabase = getSupabaseClient();
    supabase
      .from("teams")
      .select("gps_provider")
      .eq("id", teamId)
      .maybeSingle()
      .then(({ data }) => {
        const gp = String((data as { gps_provider?: string | null } | null)?.gps_provider ?? "catapult").toLowerCase();
        if (gp === "statsport" || gp === "none") setCurrent(gp);
        else setCurrent("catapult");
      });
  }, [teamId]);

  async function handleSelect(provider: GpsProvider) {
    if (!teamId) return;
    setSaving(true);
    setMessage("");
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("teams")
      .update({ gps_provider: provider })
      .eq("id", teamId);
    if (error) {
      setMessage(`Villa: ${error.message}`);
    } else {
      setCurrent(provider);
      setMessage(provider === "none" ? "GPS-kerfi aftengt." : `${provider === "statsport" ? "STATSports" : "Catapult"} valið sem GPS-kerfi.`);
    }
    setSaving(false);
  }

  if (!teamId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GPS Provider</CardTitle>
          <CardDescription>Veldu GPS-kerfi liðsins / Select the team GPS tracking system</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Engin lið fundust. / No team found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GPS Provider</CardTitle>
        <CardDescription>
          Veldu GPS-kerfi liðsins. Sync-hnappurinn á Dashboard breytist sjálfkrafa.
          <br />
          Select the team GPS tracking system. The Dashboard sync button updates automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {GPS_PROVIDERS.map((p) => {
          // Roadmap-only providers: a non-selectable card with a badge + preview link,
          // so it never becomes a stored gps_provider value.
          if (p.comingSoon) {
            return (
              <div key={p.id} className="w-full rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl opacity-70">{p.logo}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {p.label}
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Væntanlegt / Coming soon
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{p.description}</div>
                    {p.previewHref && (
                      <Link href={p.previewHref} className="mt-1 inline-block text-xs font-medium text-[#2740e6] hover:underline">
                        Prófa CSV-forskoðun / Try the CSV preview →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          const isActive = current === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id as GpsProvider)}
              disabled={saving}
              className={`w-full text-left rounded-lg border p-4 transition-colors ${
                isActive
                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{p.logo}</span>
                <div>
                  <div className="font-semibold text-slate-900">
                    {p.label}
                    {isActive && <span className="ml-2 text-xs text-emerald-700">✓ Virkt / Active</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{p.description}</div>
                </div>
              </div>
            </button>
          );
        })}
        {message && <div className="text-sm text-emerald-700 pt-1">{message}</div>}
      </CardContent>
    </Card>
  );
}
