"use client";

/** /client/corrective — today's corrective as a guided circuit. */

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import CorrectiveRunner from "@/components/client/CorrectiveRunner";
import type { CorrectiveStepItem } from "@/lib/client/correctiveRun";

export default function ClientCorrectivePage() {
  const [lang] = useLang();
  const L = lang === "EN" ? "EN" : "IS";
  const [items, setItems] = useState<CorrectiveStepItem[] | null>(null);
  const [week, setWeek] = useState<{ done: number; planned: number } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/client/today", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const json = await res.json();
        if (alive && json?.corrective?.items?.length) {
          setItems(json.corrective.items as CorrectiveStepItem[]);
          setWeek({ done: json.corrective.week_done ?? 0, planned: json.corrective.week_planned ?? 0 });
        }
      } catch { /* the empty state covers it */ }
      if (alive) setChecked(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!checked) return <div className="text-sm text-slate-500">{L === "IS" ? "Hleð…" : "Loading…"}</div>;
  if (!items) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {L === "IS" ? "Engar leiðréttingaræfingar í dag." : "No corrective today."}{" "}
        <Link href="/client" className="font-medium text-primary">{L === "IS" ? "Til baka" : "Back to Today"}</Link>
      </div>
    );
  }
  return <CorrectiveRunner lang={L} items={items} week={week} />;
}
