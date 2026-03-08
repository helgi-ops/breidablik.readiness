"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PlanRow = {
  id: string;
  player_id: string;
  title: string;
  note: string | null;
  status: string;
  created_at: string;
};

type PlanItemRow = {
  id: string;
  plan_id: string;
  sort_order: number;
  snapshot: any;
};

export function PlansPanel({ playerId }: { playerId: string }) {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [itemsByPlan, setItemsByPlan] = useState<Record<string, PlanItemRow[]>>({});
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPlans() {
    if (!playerId) return;
    setLoading(true);

    const { data: planData, error: planErr } = await supabase
      .from("player_plans")
      .select("id, player_id, title, note, status, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (planErr) {
      console.error("load plans error:", planErr);
      setLoading(false);
      return;
    }

    const p = (planData ?? []) as PlanRow[];
    setPlans(p);

    const planIds = p.map((x) => x.id);
    if (planIds.length === 0) {
      setItemsByPlan({});
      setOpenPlanId(null);
      setLoading(false);
      return;
    }

    const { data: itemData, error: itemErr } = await supabase
      .from("player_plan_items")
      .select("id, plan_id, sort_order, snapshot")
      .in("plan_id", planIds)
      .order("sort_order", { ascending: true });

    if (itemErr) {
      console.error("load plan items error:", itemErr);
      setLoading(false);
      return;
    }

    const grouped: Record<string, PlanItemRow[]> = {};
    for (const it of (itemData ?? []) as any[]) {
      const pid = it.plan_id as string;
      grouped[pid] = grouped[pid] ?? [];
      grouped[pid].push(it as PlanItemRow);
    }
    setItemsByPlan(grouped);

    // Auto-open newest plan
    setOpenPlanId((prev) => prev ?? p[0]?.id ?? null);

    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const openPlan = useMemo(() => plans.find((x) => x.id === openPlanId) ?? null, [plans, openPlanId]);
  const openItems = openPlan ? (itemsByPlan[openPlan.id] ?? []) : [];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Plans</CardTitle>
        <CardDescription>
          Plön sem þjálfari hefur sent (1–3 templates). Snapshot tryggir að innihald breytist ekki.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">
            {loading ? "Loading…" : `${plans.length} plan(s)`}
          </div>
          <Button variant="outline" onClick={loadPlans}>
            Refresh
          </Button>
        </div>

        {plans.length === 0 ? (
          <div className="rounded-lg border p-3 text-sm opacity-70">
            Engin plön hafa verið send ennþá.
          </div>
        ) : (
          <>
            {/* Plan selector */}
            <div className="grid gap-2">
              <div className="text-xs font-semibold opacity-70">Veldu plan</div>
              <select
                className="h-10 rounded-md border px-3 text-sm"
                value={openPlanId ?? ""}
                onChange={(e) => setOpenPlanId(e.target.value || null)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {new Date(p.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Plan preview */}
            {openPlan ? (
              <div className="rounded-xl border p-4 space-y-3 bg-black/[0.02]">
                <div className="space-y-1">
                  <div className="text-xs opacity-70">Title</div>
                  <div className="font-semibold">{openPlan.title}</div>
                  {openPlan.note ? (
                    <div className="text-sm opacity-80">{openPlan.note}</div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold opacity-70">Modules</div>
                  {openItems.length === 0 ? (
                    <div className="text-sm opacity-70">Engin modules fundust á þessu plani.</div>
                  ) : (
                    openItems.map((it) => {
                      const s = it.snapshot ?? {};
                      const code = s.code ?? "—";
                      const title = s.title ?? "Untitled";
                      const cat = s.structure?.category ?? "—";
                      const dur = typeof s.structure?.duration_min === "number" ? `${s.structure.duration_min} min` : "— min";

                      return (
                        <details key={it.id} className="rounded-lg border bg-white p-3">
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs opacity-70">{code}</div>
                                <div className="font-semibold truncate">{title}</div>
                                <div className="text-xs opacity-70">{cat} · {dur}</div>
                              </div>
                              <div className="text-xs opacity-60">Open</div>
                            </div>
                          </summary>

                          <div className="mt-3">
                            <div className="text-xs font-semibold opacity-70 mb-2">Snapshot (JSON)</div>
                            <pre className="text-xs overflow-auto whitespace-pre-wrap leading-relaxed">
                              {JSON.stringify(s.structure ?? {}, null, 2)}
                            </pre>
                          </div>
                        </details>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}