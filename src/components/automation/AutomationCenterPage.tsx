"use client";

import { useEffect, useMemo, useState } from "react";
import {
  acknowledgeSmartAlert,
  buildAutomationSummary,
  loadAutomationActionExecutions,
  loadAutomationHistory,
  loadEscalationRecords,
  loadSmartAlerts,
  resolveSmartAlert,
  saveSmartAlert,
  type SmartAlertRecord,
} from "@/lib/micropulse/automation";
import { useTeamRealtime } from "@/lib/micropulse/realtime";
import { getRealtimeStreamEventName } from "@/lib/micropulse/realtime";
import LiveStatusBanner from "@/components/realtime/LiveStatusBanner";
import ActivityFeedPanel from "@/components/realtime/ActivityFeedPanel";
import AutomationSummaryStrip from "./AutomationSummaryStrip";
import SmartAlertsPanel from "./SmartAlertsPanel";
import EscalationQueuePanel from "./EscalationQueuePanel";
import AutomationHistoryPanel from "./AutomationHistoryPanel";

function loadState() {
  return {
    alerts: loadSmartAlerts(),
    actions: loadAutomationActionExecutions(),
    escalations: loadEscalationRecords(),
    history: loadAutomationHistory(),
  };
}

export default function AutomationCenterPage() {
  const [state, setState] = useState(() => loadState());
  const realtime = useTeamRealtime(null, "admin");
  const summary = useMemo(
    () =>
      buildAutomationSummary({
        alerts: state.alerts,
        actions: state.actions,
        escalations: state.escalations,
      }),
    [state.alerts, state.actions, state.escalations],
  );

  useEffect(() => {
    const onStorage = () => setState(loadState());
    const onRealtime = () => setState(loadState());
    const streamEventName = getRealtimeStreamEventName();
    window.addEventListener("storage", onStorage);
    window.addEventListener(streamEventName, onRealtime as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(streamEventName, onRealtime as EventListener);
    };
  }, []);

  function updateAlert(id: string, updater: (alert: SmartAlertRecord) => SmartAlertRecord) {
    const target = state.alerts.find((alert) => alert.id === id);
    if (!target) return;
    saveSmartAlert(updater(target));
    setState(loadState());
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Automation Center</h1>
        <p className="text-sm text-gray-600">Deterministic smart alerts, rule-triggered actions, escalation queue, and automation audit history.</p>
      </div>

      <LiveStatusBanner health={realtime.summary} label="Automation live event status" />
      <AutomationSummaryStrip summary={summary} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SmartAlertsPanel
          alerts={state.alerts}
          onAcknowledge={(id) => updateAlert(id, acknowledgeSmartAlert)}
          onResolve={(id) => updateAlert(id, resolveSmartAlert)}
        />
        <EscalationQueuePanel escalations={state.escalations} />
      </div>

      <AutomationHistoryPanel history={state.history} />
      <ActivityFeedPanel items={realtime.activity} title="Related live activity" />
    </div>
  );
}
