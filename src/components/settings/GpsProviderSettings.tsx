"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type GpsProvider = "catapult" | "statsport" | "wimu" | "titan" | "none";

type ProviderCard = {
  id: GpsProvider;
  label: string;
  description: string;
  logo: string;
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
    description: "Hudl WIMU PRO GPS tracking — CSV/Excel upload of a SPRO export (no auto-sync). The Sync button opens the upload page.",
    logo: "🛰️",
  },
  {
    id: "titan",
    label: "Titan (indoor)",
    description: "Integrated Bionics / Hudl Titan — innidyra IMU (Player Load, Impacts, Jumps, lengd; ekkert GPS). CSV/Excel upphleðsla á _synced_data flipanum. Sync-hnappurinn opnar upphleðslusíðuna.",
    logo: "🏀",
  },
  {
    id: "none",
    label: "Ekkert / None",
    description: "Ekkert GPS-kerfi tengt. GPS-gögnin verða ekki sótt sjálfvirkt.",
    logo: "⚪",
  },
];

const PROVIDER_LABEL: Record<GpsProvider, string> = {
  catapult: "Catapult", statsport: "STATSports", wimu: "Hudl WIMU", titan: "Titan", none: "Ekkert",
};

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
        if (gp === "statsport" || gp === "wimu" || gp === "titan" || gp === "none") setCurrent(gp);
        else setCurrent("catapult");
      });
  }, [teamId]);

  async function handleSelect(provider: GpsProvider) {
    if (!teamId) return;
    setSaving(true);
    setMessage("");
    try {
      // Route through the team-settings API so picking Titan (indoor IMU) also configures the team
      // as indoor in one action (training_mode_default='indoor' + indoor_mode=true) — the single
      // authoritative data-source choice, recognised by every surface immediately.
      const supabase = getSupabaseClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) { setMessage("Villa: ekki innskráður"); return; }
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ team_id: teamId, gps_provider: provider }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setMessage(`Villa: ${(j as { error?: string }).error ?? "Tókst ekki að vista"}`);
        return;
      }
      setCurrent(provider);
      setMessage(
        provider === "none" ? "GPS-kerfi aftengt."
        : provider === "titan" ? `Titan valið — liðið er núna stillt sem innidyra (ekkert GPS/púls). Kerfið aðlagar sig strax.`
        : `${PROVIDER_LABEL[provider]} valið sem GPS-kerfi.`,
      );
    } finally {
      setSaving(false);
    }
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
        <CardTitle>Gagnagjafi / Data source</CardTitle>
        <CardDescription>
          Veldu hvaðan álagsgögn liðsins koma. Þetta er stillt einu sinni og kerfið þekkir það strax — Titan (innidyra)
          stillir liðið sjálfkrafa sem innidyra (ekkert GPS/púls) og aðlagar allar síður. Sync-hnappurinn uppfærist líka.
          <br />
          Pick where the team&apos;s load data comes from. Set once and the whole system adapts immediately — choosing Titan
          (indoor) configures the team as indoor (no GPS / no heart rate) and adapts every page. The sync button updates too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {GPS_PROVIDERS.map((p) => {
          const isActive = current === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
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
