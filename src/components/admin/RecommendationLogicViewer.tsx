"use client";

import type { RecommendationAuditView } from "@/lib/micropulse/adminConfig";

type Props = {
  value: RecommendationAuditView | null;
};

export default function RecommendationLogicViewer({ value }: Props) {
  if (!value) {
    return (
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-xs font-medium text-zinc-500">Recommendation logic</div>
        <div className="mt-1 text-sm text-zinc-600">Select a player recommendation to inspect engine → rules → override flow.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-zinc-500">Recommendation logic</div>
          <div className="text-base font-semibold">{value.playerName ?? value.playerId ?? "Player"}</div>
        </div>
        <div className="text-xs text-zinc-500">{value.date ?? "—"}</div>
      </div>

      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <div className="rounded border bg-zinc-50 p-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Engine recommendation</div>
          <div className="font-semibold">{value.engineRecommendation.action}</div>
          <div>{value.engineRecommendation.coachInstruction}</div>
        </div>

        <div className="rounded border bg-zinc-50 p-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Final recommendation</div>
          <div className="font-semibold">{value.finalRecommendation.action}</div>
          <div>{value.finalRecommendation.coachInstruction}</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <div className="rounded border p-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Rule-based changes</div>
          {value.appliedRules.length ? (
            <ul className="mt-1 list-disc pl-4">
              {value.appliedRules.map((rule) => (
                <li key={rule.ruleId}>{rule.ruleName}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-zinc-600">No rules applied.</div>
          )}
        </div>

        <div className="rounded border p-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Manual override</div>
          {value.manualOverride?.applied ? (
            <div className="mt-1">
              <div>By: {value.manualOverride.overriddenBy ?? "—"}</div>
              <div>Reason: {value.manualOverride.reason ?? "—"}</div>
            </div>
          ) : (
            <div className="mt-1 text-zinc-600">No manual override.</div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded border bg-zinc-50 p-2 text-sm">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Summary</div>
        <div className="mt-1">{value.overrideSummary}</div>
        <div className="mt-1 text-xs">Review required: {value.requiresCoachReview ? "Yes" : "No"}</div>
      </div>
    </div>
  );
}
