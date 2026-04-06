"use client";

import { summarizePolicyInheritance, type OrgPolicyInheritanceDecision } from "@/lib/micropulse/orgIntelligence";

type Props = {
  policyByTeam: Record<string, OrgPolicyInheritanceDecision>;
};

export default function OrgPolicyInheritancePanel({ policyByTeam }: Props) {
  const entries = Object.entries(policyByTeam);

  return (
    <div className="rounded-xl border bg-white p-4 text-xs text-gray-700">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Policy inheritance</div>
      <div className="mt-2 space-y-2">
        {entries.map(([teamId, decision]) => (
          <div key={teamId} className="rounded border bg-gray-50 p-2">
            <div className="font-semibold">Team {teamId}</div>
            <div className="mt-1 text-[11px] text-gray-600">{summarizePolicyInheritance(decision)}</div>
            {decision.unresolvedConflicts.length ? (
              <div className="mt-1 text-[11px] text-rose-700">Conflicts: {decision.unresolvedConflicts.join(", ")}</div>
            ) : null}
          </div>
        ))}
        {!entries.length ? <div className="text-[11px] text-gray-500">No team-specific override data.</div> : null}
      </div>
    </div>
  );
}
