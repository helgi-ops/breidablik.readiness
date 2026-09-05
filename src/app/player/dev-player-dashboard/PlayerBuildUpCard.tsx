"use client";

/**
 * Player-facing "my build-up" card — read-only view of how the player's actual
 * accrued weekly training load is tracking against the coach's planned build-up
 * ramp (same engine + story the coach sees on the Periodization Hub). Reads
 * /api/player/build-up, self-scoped. Silent until there's an elapsed week with
 * logged load. Descriptive — never the readiness colour/verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import type { BuildUpAdherence } from "@/lib/micropulse/buildUpTracking";
import BuildUpAdherenceView from "@/components/BuildUpAdherenceView";

type Resp = { ok: boolean; show?: boolean; adherence?: BuildUpAdherence } | null;

export default function PlayerBuildUpCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [resp, setResp] = React.useState<Resp>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        if (!tok) {
          if (alive) setLoaded(true);
          return;
        }
        const res = await fetch("/api/player/build-up", { headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => ({}));
        if (alive) {
          setResp(res.ok ? (j as Resp) : null);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) return null;
  if (!resp?.show || !resp.adherence) return null; // no elapsed logged week yet — stay silent

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <BuildUpAdherenceView adh={resp.adherence} isEN={!is} title={is ? "Uppbyggingin þín" : "Your build-up"} />
    </div>
  );
}
