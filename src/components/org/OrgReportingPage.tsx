"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildOrgPolicyInheritanceDecision,
  buildOrgReportingView,
  buildRoleSpecificOrgView,
  loadOrgPolicies,
  loadOrgTeamSnapshots,
  loadTeamOverrides,
  type OrgRoleView,
  type RoleSpecificOrgView,
} from "@/lib/micropulse/orgIntelligence";
import ExecutiveSummaryStrip from "./ExecutiveSummaryStrip";
import OrganizationSummaryPanel from "./OrganizationSummaryPanel";
import MedicalOverviewPanel from "./MedicalOverviewPanel";
import PerformanceOverviewPanel from "./PerformanceOverviewPanel";
import TeamComparisonTable from "./TeamComparisonTable";
import OrgAttentionQueue from "./OrgAttentionQueue";
import OrgPolicyInheritancePanel from "./OrgPolicyInheritancePanel";

const ROLES: OrgRoleView[] = ["EXECUTIVE", "MEDICAL", "PERFORMANCE", "COACHING", "ADMIN"];

function buildView(role: OrgRoleView): RoleSpecificOrgView {
  const teamSnapshots = loadOrgTeamSnapshots();
  const orgDefaults = loadOrgPolicies();
  const teamOverrides = loadTeamOverrides();

  const policyInheritanceByTeam = Object.fromEntries(
    teamSnapshots.map((team) => [
      team.teamId,
      buildOrgPolicyInheritanceDecision({
        orgDefaults,
        teamOverrides: teamOverrides[team.teamId] ?? null,
      }),
    ]),
  );

  const reporting = buildOrgReportingView({
    organizationId: "default-org",
    organizationName: "MicroPulse Organization",
    teamSnapshots,
    policyInheritanceByTeam,
  });

  return buildRoleSpecificOrgView(role, reporting);
}

export default function OrgReportingPage() {
  const [role, setRole] = useState<OrgRoleView>("EXECUTIVE");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onStorage = () => setTick((x) => x + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const view = useMemo(() => {
    void tick;
    return buildView(role);
  }, [role, tick]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Organization Reporting</h1>
          <p className="text-sm text-gray-600">Cross-team oversight for leadership, medical, performance, and admin roles.</p>
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as OrgRoleView)}
          className="rounded border px-2 py-1.5 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <ExecutiveSummaryStrip summary={view.executiveSummary} />
      <OrganizationSummaryPanel summary={view.organizationSummary} />

      <div className="grid gap-4 lg:grid-cols-2">
        {view.medicalOverview ? <MedicalOverviewPanel summary={view.medicalOverview} /> : null}
        {view.performanceOverview ? <PerformanceOverviewPanel summary={view.performanceOverview} /> : null}
      </div>

      <TeamComparisonTable rows={view.teamComparisonRows} />
      <OrgAttentionQueue summary={view.attentionQueue} />
      {view.policyInheritanceByTeam ? <OrgPolicyInheritancePanel policyByTeam={view.policyInheritanceByTeam} /> : null}
    </div>
  );
}
